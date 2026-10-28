import { rmSync, readdirSync, statSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { config, locked, object, privateDir, readJSON, sessionFile, writeJSON } from './storage.mjs';

export const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd'];

export function toolResult(input) {
  const response = input.tool_response;
  if (!object(response)) return 'unknown';
  if (response.interrupted || response.is_error || (typeof response.exit_code === 'number' && response.exit_code !== 0) || (typeof response.exitCode === 'number' && response.exitCode !== 0)) return 'failed';
  if (input.tool_name !== 'Bash') return 'unknown';
  const command = input.tool_input?.command;
  if (typeof command !== 'string' || !/(?:\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:pytest|vitest|jest)\b|\bnode\s+--test\b|\b(?:cargo|go)\s+test\b|\bpython[\d.]*\s+-m\s+(?:pytest|unittest)\b)/.test(command)) return 'unknown';
  const output = stripVTControlCharacters([response.stdout, response.stderr].filter(x => typeof x === 'string').join('\n'));
  if (/(?:\b[1-9]\d*\s+(?:tests?\s+)?failed\b|(?:#|ℹ)\s*fail\s+[1-9]\d*\b|FAIL\s|FAILED\s|\bError:)/.test(output)) return 'failed';
  if (response.exit_code === 0 || response.exitCode === 0 || /(?:\b[1-9]\d*\s+(?:tests?\s+)?passed\b|(?:#|ℹ)\s*pass\s+[1-9]\d*\b|\bok\s+\S+\s+(?:[\d.]+s\b|\(cached\))|test result: ok\.|Ran [1-9]\d* tests?[\s\S]*\bOK\b)/.test(output)) return 'passed';
  return 'unknown';
}

export function transition(previous, input, now = Date.now()) {
  const event = input.hook_event_name;
  if (!events.includes(event)) return null;
  const state = object(previous) ? previous : {};
  const next = { mood: 'thinking', at: now, startedAt: state.startedAt || now, working: true, active: Array.isArray(state.active) ? state.active.filter(x => typeof x === 'string').slice(-64) : [] };
  const toolId = typeof input.tool_use_id === 'string' ? input.tool_use_id.slice(0, 256) : 'tool';
  if (event === 'SessionStart') return { mood: 'idle', at: now, working: false, active: [] };
  if (event === 'UserPromptSubmit') return { ...next, startedAt: now, active: [] };
  if (event === 'PreToolUse') next.active = [...new Set([...next.active, toolId])];
  if (event === 'PostToolUse' || event === 'PostToolUseFailure') {
    next.active = next.active.filter(id => id !== toolId);
    const result = toolResult(input);
    if (event === 'PostToolUseFailure' || result === 'failed') next.mood = 'worried';
    else if (result === 'passed') next.mood = 'happy';
  }
  if (event === 'PermissionRequest') next.mood = 'waiting';
  if (event === 'Notification') {
    if (input.notification_type === 'permission_prompt' || input.notification_type === 'elicitation_dialog') next.mood = 'waiting';
    else if (input.notification_type === 'idle_prompt') return { ...next, mood: 'sleeping', working: false, active: [] };
    else return null;
  }
  if (event === 'Stop') return { ...next, mood: state.startedAt && now - state.startedAt >= 60_000 ? 'celebrate' : 'idle', working: false, active: [], startedAt: null };
  if (event === 'SessionEnd') return { ...next, mood: 'sleeping', working: false, active: [], startedAt: null };
  return next;
}

export function moodAt(state, now = Date.now()) {
  if (!object(state) || !Number.isFinite(state.at)) return 'idle';
  const age = Math.max(0, now - state.at);
  if (state.working && age > 15 * 60_000) return 'sleeping';
  if (['happy', 'celebrate', 'worried'].includes(state.mood) && age > (state.mood === 'worried' ? 30_000 : 15_000)) return state.working ? 'thinking' : (age > 60_000 ? 'sleeping' : 'idle');
  if (!state.working && age > 60_000) return 'sleeping';
  return state.mood;
}

export async function record(p, input) {
  if (config(p).enabled === false || !object(input)) return;
  const file = sessionFile(p, input.session_id);
  if (!file || !events.includes(input.hook_event_name)) return;
  privateDir(p.sessions);
  await locked(`${file}.lock`, () => {
    const next = transition(readJSON(file), input);
    if (next) writeJSON(file, next);
  }, 40);
  if (input.hook_event_name === 'SessionStart') {
    for (const entry of readdirSync(p.sessions)) {
      if (!/^[a-f0-9]{64}\.json$/.test(entry)) continue;
      const candidate = `${p.sessions}/${entry}`;
      try { if (Date.now() - statSync(candidate).mtimeMs > 7 * 86400_000) rmSync(candidate); } catch {}
    }
  }
}
