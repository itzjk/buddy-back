import { spawnSync } from 'node:child_process';
import { config, object, readJSON, sessionFile } from './storage.mjs';
import { render } from './buddies.mjs';
import { moodAt } from './session.mjs';

export function status(p, input, raw, now = Date.now()) {
  const options = config(p);
  const manifest = readJSON(p.manifest);
  const previous = manifest?.originalSettings?.statusLine;
  let existing = '';
  if (!process.env.BUDDY_BACK_COMPOSING && object(previous) && previous.type === 'command' && typeof previous.command === 'string') {
    const result = spawnSync('/bin/sh', ['-c', previous.command], { input: raw, encoding: 'utf8', env: { ...process.env, BUDDY_BACK_COMPOSING: '1' }, timeout: 500, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
    if (result.status === 0) existing = (result.stdout || '').replace(/[\r\n]+$/, '');
  }
  if (options.enabled === false) return existing;
  const file = sessionFile(p, input?.session_id);
  const state = file ? readJSON(file) : {};
  const buddy = render(moodAt(state, now), options, now);
  return existing ? `${existing}\n${buddy}` : buddy;
}
