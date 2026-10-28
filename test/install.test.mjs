import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { paths, readJSON } from '../lib/storage.mjs';
import { events } from '../lib/session.mjs';

const cli = fileURLToPath(new URL('../bin/buddy-back.mjs', import.meta.url));

function profile(t) {
  const root = mkdtempSync(join(tmpdir(), "buddy-back 'spaces-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const p = paths({ CLAUDE_CONFIG_DIR: root });
  const env = { ...process.env, CLAUDE_CONFIG_DIR: root };
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', timeout: 5000 });
  const shell = (command, input = '{}') => spawnSync('/bin/sh', ['-c', command], { env, input, encoding: 'utf8', timeout: 5000 });
  return { p, env, run, shell };
}

test('install merges existing hooks and composes the original status line, uninstall restores exact bytes and mode', t => {
  const { p, run, shell } = profile(t);
  const original = '{\n\t"permissions": {"allow": ["Read"]},\n\t"statusLine": {"type":"command","command":"cat", "padding": 2},\n\t"hooks": {"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"echo existing"}]}]}\n}';
  writeFileSync(p.settings, original);
  chmodSync(p.settings, 0o640);
  const result = run('install');
  assert.equal(result.status, 0, result.stderr);
  const settings = readJSON(p.settings);
  assert.equal(settings.hooks.PreToolUse.length, 2);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'echo existing');
  assert.equal(settings.statusLine.padding, 2);
  assert.equal(settings.statusLine.refreshInterval, 1);
  assert.equal(statSync(p.settings).mode & 0o777, 0o640);
  assert.deepEqual(settings.permissions, { allow: ['Read'] });
  const manifest = readJSON(p.manifest);
  assert.equal(readFileSync(manifest.backup, 'utf8'), original);
  assert.equal(statSync(manifest.backup).mode & 0o777, 0o600);
  assert.match(shell(settings.statusLine.command, '{"session_id":"s"}').stdout, /^\{"session_id":"s"\}\n.*Buddy/);
  const hook = shell(settings.hooks.UserPromptSubmit[0].hooks[0].command, '{"session_id":"s","hook_event_name":"UserPromptSubmit"}');
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, '');
  assert.match(shell(settings.statusLine.command, '{"session_id":"s"}').stdout, /thinking/);
  run('off');
  assert.equal(shell(settings.statusLine.command, '{"session_id":"s"}').stdout, '{"session_id":"s"}\n');
  assert.equal(run('uninstall').status, 0);
  assert.equal(readFileSync(p.settings, 'utf8'), original);
  assert.equal(statSync(p.settings).mode & 0o777, 0o640);
  assert.equal(existsSync(p.runtime), false);
  assert.equal(existsSync(p.manifest), false);
  assert.equal(run('uninstall').status, 0);
});

test('install without settings creates the full hook set and uninstall removes the generated file', t => {
  const { p, run } = profile(t);
  assert.equal(run('install').status, 0);
  const settings = readJSON(p.settings);
  assert.deepEqual(Object.keys(settings.hooks), events);
  for (const event of events) assert.equal(settings.hooks[event][0].hooks[0].type, 'command');
  assert.equal(run('uninstall').status, 0);
  assert.equal(existsSync(p.settings), false);
});

test('repeated installation keeps the first backup, hooks and custom preferences', t => {
  const { p, run } = profile(t);
  writeFileSync(p.settings, '{}\n');
  assert.equal(run('install').status, 0);
  const installed = readFileSync(p.settings, 'utf8');
  const manifest = readFileSync(p.manifest, 'utf8');
  run('name', 'Mochi');
  run('off');
  assert.match(run('install').stdout, /Already installed/);
  assert.equal(readFileSync(p.settings, 'utf8'), installed);
  assert.equal(readFileSync(p.manifest, 'utf8'), manifest);
  assert.deepEqual(readJSON(p.config), { name: 'Mochi', enabled: false });
});

test('uninstall preserves settings and hooks added after installation', t => {
  const { p, run } = profile(t);
  const original = { statusLine: { type: 'command', command: 'echo old' }, hooks: { Stop: [] }, env: { A: 'one' } };
  writeFileSync(p.settings, JSON.stringify(original));
  run('install');
  const installed = readJSON(p.settings);
  installed.env.B = 'two';
  installed.hooks.Stop.push({ hooks: [{ type: 'command', command: 'echo later' }] });
  installed.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'echo shared group' });
  writeFileSync(p.settings, JSON.stringify(installed));
  assert.equal(run('uninstall').status, 0);
  assert.deepEqual(readJSON(p.settings), {
    ...original, env: { A: 'one', B: 'two' }, hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'echo later' }] }],
      PreToolUse: [{ hooks: [{ type: 'command', command: 'echo shared group' }] }]
    }
  });
});

test('uninstall leaves a replacement status line alone', t => {
  const { p, run } = profile(t);
  run('install');
  const settings = readJSON(p.settings);
  settings.statusLine = { type: 'command', command: 'echo replacement' };
  writeFileSync(p.settings, JSON.stringify(settings));
  run('uninstall');
  assert.deepEqual(readJSON(p.settings), { statusLine: settings.statusLine });
});

test('uninstall restores the old command even when display options were edited', t => {
  const { p, run } = profile(t);
  writeFileSync(p.settings, JSON.stringify({ statusLine: { type: 'command', command: 'echo old', padding: 2 } }));
  run('install');
  const settings = readJSON(p.settings);
  settings.statusLine.padding = 4;
  writeFileSync(p.settings, JSON.stringify(settings));
  assert.equal(run('uninstall').status, 0);
  assert.deepEqual(readJSON(p.settings), { statusLine: { type: 'command', command: 'echo old', padding: 4 } });
});

test('installed commands carry their profile even without the caller environment', t => {
  const { p, run } = profile(t);
  run('install');
  run('name', 'Mochi');
  const env = { ...process.env };
  delete env.CLAUDE_CONFIG_DIR;
  const result = spawnSync('/bin/sh', ['-c', readJSON(p.settings).statusLine.command], { env, input: '{}', encoding: 'utf8', timeout: 4000 });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Mochi/);
});

test('invalid settings, malformed hooks and unsupported status lines are never overwritten', t => {
  const { p, run } = profile(t);
  for (const original of ['{invalid', '[]', '{"hooks":[]}', '{"hooks":{"Stop":{}}}', '{"statusLine":null}']) {
    writeFileSync(p.settings, original);
    assert.equal(run('install').status, 1);
    assert.equal(readFileSync(p.settings, 'utf8'), original);
    assert.equal(existsSync(p.manifest), false);
  }
});

test('invalid JSON after installation is left untouched with recovery information intact', t => {
  const { p, run } = profile(t);
  writeFileSync(p.settings, '{"env":{}}');
  run('install');
  writeFileSync(p.settings, '{broken');
  assert.equal(run('uninstall').status, 1);
  assert.equal(readFileSync(p.settings, 'utf8'), '{broken');
  assert.equal(existsSync(p.manifest), true);
  assert.equal(existsSync(readJSON(p.manifest).backup), true);
});

test('symbolic settings files are refused without touching their targets', t => {
  const { p, run } = profile(t);
  const target = join(p.root, 'real-settings.json');
  writeFileSync(target, '{}');
  symlinkSync(target, p.settings);
  assert.equal(run('install').status, 1);
  assert.equal(readFileSync(target, 'utf8'), '{}');
  rmSync(target);
  assert.equal(run('install').status, 1);
  assert.equal(existsSync(target), false);
});

test('a recursive old status command cannot spawn indefinitely', t => {
  const { p, run, shell } = profile(t);
  const q = value => `'${value.replace(/'/g, `'"'"'`)}'`;
  writeFileSync(p.settings, JSON.stringify({ statusLine: { type: 'command', command: `${q(process.execPath)} ${q(cli)} status` } }));
  run('install');
  const result = shell(readJSON(p.settings).statusLine.command);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim().split('\n').length, 2);
});

test('a failing previous status command does not hide the buddy', t => {
  const { p, run, shell } = profile(t);
  writeFileSync(p.settings, JSON.stringify({ statusLine: { type: 'command', command: 'exit 1' } }));
  run('install');
  const result = shell(readJSON(p.settings).statusLine.command);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /Buddy/);
});
