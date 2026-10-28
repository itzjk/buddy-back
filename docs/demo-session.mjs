import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/buddy-back.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'buddy-back-demo-'));
const env = { ...process.env, CLAUDE_CONFIG_DIR: root };
const session_id = 'demo-session';

function execute(command, args, input = '') {
  const result = spawnSync(command, args, { env, input, encoding: 'utf8', timeout: 3000 });
  if (result.error || result.status !== 0 || result.stderr) throw new Error(result.error?.message || result.stderr || 'Demo command failed.');
  return result.stdout.trimEnd();
}

try {
  execute(process.execPath, [cli, 'install']);
  execute(process.execPath, [cli, 'name', 'Mochi']);
  const settings = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'));
  const stages = [
    ['SessionStart', 'Session started', {}],
    ['UserPromptSubmit', 'You sent a prompt', {}],
    ['PostToolUse', 'Tests passed', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { exit_code: 0, stdout: '3 tests passed' } }],
    ['PostToolUseFailure', 'A tool failed', { tool_name: 'Bash', tool_response: { exit_code: 1 } }],
    ['PermissionRequest', 'Waiting for your permission', {}],
    ['SessionEnd', 'Session ended. Time for a nap.', {}]
  ];
  process.stdout.write('\x1b[?25l\nbuddy-back / local hook replay\n\n\n\n');
  for (const [hook_event_name, caption, fields] of stages) {
    const command = settings.hooks[hook_event_name][0].hooks[0].command;
    execute('/bin/sh', ['-c', command], JSON.stringify({ session_id, hook_event_name, ...fields }));
    const until = Date.now() + 2400;
    do {
      const frame = execute('/bin/sh', ['-c', settings.statusLine.command], JSON.stringify({ session_id }));
      process.stdout.write(`\x1b[2A\r\x1b[2K${caption}\n\r\x1b[2K${frame}\n`);
      await setTimeout(300);
    } while (Date.now() < until);
  }
  execute(process.execPath, [cli, 'uninstall']);
} finally {
  process.stdout.write('\x1b[?25h');
  rmSync(root, { recursive: true, force: true });
}
