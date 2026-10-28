import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { buddies, labels, render } from '../lib/buddies.mjs';
import { transition, moodAt, toolResult } from '../lib/session.mjs';
import { paths, readJSON, sessionFile, writeJSON } from '../lib/storage.mjs';

const cli = fileURLToPath(new URL('../bin/buddy-back.mjs', import.meta.url));
const fixture = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));

function profile(t) {
  const root = mkdtempSync(join(tmpdir(), 'buddy-back-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const p = paths({ CLAUDE_CONFIG_DIR: root });
  const env = { ...process.env, CLAUDE_CONFIG_DIR: root };
  const run = (args, input = '{}') => spawnSync(process.execPath, [cli, ...args], { env, input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', timeout: 4000 });
  return { p, run, env };
}

test('every companion has ASCII-only, single-line animated frames for every mood', () => {
  for (const buddy of Object.keys(buddies)) for (const mood of Object.keys(labels)) {
    const first = render(mood, { buddy, name: 'Mochi' }, 0);
    const second = render(mood, { buddy, name: 'Mochi' }, 1000);
    assert.match(first, /^[\x20-\x7e]+$/);
    assert.notEqual(first, second);
    assert.ok(first.includes(labels[mood]));
    assert.ok(first.includes('Mochi'));
  }
});

test('prompt, tools, permission, success, failure, long completion and idle form a complete session', () => {
  let state = transition({}, { hook_event_name: 'SessionStart' }, 1000);
  assert.equal(moodAt(state, 1000), 'idle');
  state = transition(state, fixture('prompt'), 2000);
  assert.equal(state.mood, 'thinking');
  state = transition(state, { hook_event_name: 'PreToolUse', tool_use_id: 'toolu_tests' }, 3000);
  state = transition(state, fixture('tests-passed'), 4000);
  assert.equal(state.mood, 'happy');
  assert.equal(moodAt(state, 20_000), 'thinking');
  state = transition(state, fixture('tool-failed'), 21_000);
  assert.equal(state.mood, 'worried');
  assert.equal(moodAt(state, 52_000), 'thinking');
  state = transition(state, { hook_event_name: 'PermissionRequest' }, 53_000);
  assert.equal(state.mood, 'waiting');
  state = transition(state, { hook_event_name: 'Stop' }, 70_000);
  assert.equal(state.mood, 'celebrate');
  assert.equal(moodAt(state, 86_000), 'idle');
  assert.equal(moodAt(state, 131_000), 'sleeping');
});

test('short completion stays ready; abandoned work eventually sleeps', () => {
  const state = transition({}, fixture('prompt'), 1000);
  assert.equal(transition(state, { hook_event_name: 'Stop' }, 2000).mood, 'idle');
  assert.equal(moodAt(state, 901_001), 'sleeping');
  assert.equal(transition(state, { hook_event_name: 'SessionEnd' }, 2000).mood, 'sleeping');
});

test('notifications do not replace a mood unless they describe waiting or idle', () => {
  assert.equal(transition({}, { hook_event_name: 'Notification', notification_type: 'permission_prompt' }).mood, 'waiting');
  assert.equal(transition({}, { hook_event_name: 'Notification', notification_type: 'idle_prompt' }).mood, 'sleeping');
  assert.equal(transition({}, { hook_event_name: 'Notification', notification_type: 'auth_success' }), null);
  assert.equal(transition({}, { hook_event_name: 'Unknown' }), null);
});

test('test success requires a test command and evidence, failures take priority', () => {
  const passed = fixture('tests-passed');
  assert.equal(toolResult(passed), 'passed');
  assert.equal(toolResult({ ...passed, tool_input: { command: 'echo "4 passed"' } }), 'unknown');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: 'Starting tests...' } }), 'unknown');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: '4 passed, 1 failed' } }), 'failed');
  assert.equal(toolResult({ ...passed, tool_response: { exit_code: 1, stdout: '4 passed' } }), 'failed');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: 'PASS one.test.js\nTests: 4 passed, 4 total' } }), 'passed');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: 'FAILED suite', exit_code: 0 } }), 'failed');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: '# pass 4\n# fail 0', interrupted: true } }), 'failed');
  assert.equal(toolResult({ ...passed, tool_response: '4 passed' }), 'unknown');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: '\x1b[32m4 passed\x1b[0m' } }), 'passed');
  assert.equal(toolResult({ ...passed, tool_response: { stdout: '\x1b[31m1 failed\x1b[0m, 4 passed' } }), 'failed');
});

test('real Node test runner output produces happy and worried reactions in TAP and spec modes', t => {
  const { p } = profile(t);
  const file = join(p.root, 'probe.mjs');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const reporter of ['tap', 'spec']) for (const pass of [true, false]) {
    writeFileSync(file, `import test from 'node:test'; import assert from 'node:assert/strict'; test('probe', () => assert.equal(${pass}, true));`);
    const result = spawnSync(process.execPath, ['--test', `--test-reporter=${reporter}`, file], { env, encoding: 'utf8', timeout: 4000 });
    assert.equal(result.status, pass ? 0 : 1);
    assert.equal(toolResult({ tool_name: 'Bash', tool_input: { command: 'node --test' }, tool_response: { stdout: result.stdout, stderr: result.stderr } }), pass ? 'passed' : 'failed');
  }
});

test('the real hook and status commands react to fixture JSON without emitting hook output', t => {
  const { run, p } = profile(t);
  for (const [file, expected] of [['prompt', 'thinking'], ['tests-passed', 'tests passed'], ['tool-failed', 'something failed']]) {
    const hook = run(['hook'], fixture(file));
    assert.equal(hook.status, 0);
    assert.equal(hook.stdout, '');
    assert.equal(hook.stderr, '');
    assert.match(run(['status'], fixture('status')).stdout, new RegExp(expected));
  }
  const saved = readFileSync(sessionFile(p, 'example-session'), 'utf8');
  assert.ok(!saved.includes('Run the tests'));
  assert.ok(!saved.includes('Command exited'));
  assert.ok(!saved.includes('npm test'));
});

test('parallel sessions are isolated and session IDs cannot escape storage', t => {
  const { run, p } = profile(t);
  run(['hook'], fixture('tool-failed'));
  assert.match(run(['status'], { session_id: 'different-session' }).stdout, /ready/);
  run(['hook'], { ...fixture('prompt'), session_id: '../../outside' });
  assert.equal(readdirSync(p.sessions).filter(x => x.endsWith('.json')).length, 2);
  assert.match(sessionFile(p, '../../outside'), /[a-f0-9]{64}\.json$/);
  assert.equal(existsSync(join(p.root, 'outside')), false);
});

test('concurrent tool events leave valid session JSON and retain independent active tools', async t => {
  const { p, env } = profile(t);
  await Promise.all(Array.from({ length: 8 }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'hook'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(JSON.stringify({ session_id: 'parallel', hook_event_name: 'PreToolUse', tool_use_id: `tool-${i}` }));
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
  })));
  const saved = readJSON(sessionFile(p, 'parallel'));
  assert.equal(saved.active.length, 8);
  assert.equal(saved.mood, 'thinking');
});

test('off persists across processes, disables hook writes, and on restores the chosen buddy', t => {
  const { run, p } = profile(t);
  assert.equal(run(['choose', 'dragon']).status, 0);
  assert.equal(run(['name', 'Ember']).status, 0);
  assert.equal(run(['off']).status, 0);
  assert.equal(run(['status'], fixture('status')).stdout, '');
  run(['hook'], fixture('prompt'));
  assert.equal(existsSync(p.sessions), false);
  run(['on']);
  assert.match(run(['status']).stdout, /Ember/);
  assert.match(run(['status']).stdout, /\(o>o\)/);
});

test('invalid input and broken state are quiet, names cannot inject terminal escapes', t => {
  const { run, p } = profile(t);
  for (const input of ['not JSON', 'null', '[]', '']) {
    for (const command of ['hook', 'status']) {
      const result = run([command], input);
      assert.equal(result.status, 0);
      assert.equal(result.stderr, '');
      assert.ok(!result.stdout.includes('undefined'));
    }
  }
  assert.equal(run(['name', '\x1b[31m']).status, 1);
  assert.equal(run(['choose', '__proto__']).status, 1);
  assert.equal(run(['unknown']).status, 1);
  writeJSON(p.config, { name: '\x1b[31m', buddy: '__proto__' });
  assert.match(run(['status']).stdout, /Buddy/);
  assert.ok(!run(['status']).stdout.includes('\x1b'));
});

test('status rendering never writes state or creates directories', t => {
  const { run, p } = profile(t);
  run(['status'], fixture('status'));
  assert.deepEqual(readdirSync(p.root), []);
});
