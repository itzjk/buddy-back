import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { buddies, labels } from '../lib/buddies.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const profile = join(repo, '.test-home', 'claude-live');
const workspace = join(repo, '.test-home', 'live-workspace');
const cli = fileURLToPath(new URL('../bin/buddy-back.mjs', import.meta.url));
const env = { ...process.env, CLAUDE_CONFIG_DIR: profile };
const quote = value => `'${value.replace(/'/g, `'"'"'`)}'`;
const required = ['idle', 'thinking', 'happy', 'worried', 'celebrate', 'sleeping'];

export function evaluateRecording(raw, code) {
  // The TUI redraws in place, so spaces between frame and label get dropped or doubled in the recording.
  // Compare without whitespace.
  const squash = text => text.replace(/\s+/g, '');
  const output = squash(stripVTControlCharacters(raw).replaceAll('\r', ''));
  const shown = (frame, mood) => output.includes(squash(`${frame}  LiveBuddy | ${labels[mood]}`));
  const seen = required.filter(mood => buddies.cat[mood].some(frame => shown(frame, mood)));
  const animated = buddies.cat.thinking.filter(frame => shown(frame, 'thinking')).length >= 2;
  return { seen, animated, passed: code === 0 && seen.length === required.length && animated };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 15_000, ...options });
  if (result.error) throw result.error;
  return result;
}

function buddy(command) {
  const result = run(process.execPath, [cli, ...command]);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

async function main() {
  try {
    if (!['darwin', 'linux'].includes(process.platform)) throw new Error('Use macOS, Linux, or WSL for the live check.');
    mkdirSync(profile, { recursive: true, mode: 0o700 });
    const auth = run('claude', ['auth', 'status']);
    let loggedIn = false;
    try { loggedIn = JSON.parse(auth.stdout).loggedIn === true; } catch {}
    if (!loggedIn) {
      console.error('BLOCKED: Claude Code is not authenticated in the isolated test profile. No live check passed.');
      console.error(`Log in locally, then rerun npm run check:claude:\nCLAUDE_CONFIG_DIR=${quote(profile)} claude auth login`);
      process.exitCode = 2;
    } else if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Run npm run check:claude in an interactive terminal.');
    } else {
      if (existsSync(join(profile, 'buddy-back', 'installation.json'))) throw new Error('The test profile already has an integration. Uninstall it in that profile before retrying.');
      mkdirSync(workspace, { recursive: true, mode: 0o700 });
      writeFileSync(join(workspace, 'pass-probe.mjs'), "import test from 'node:test'; test('live probe', () => {});\n", { mode: 0o600 });
      writeFileSync(join(workspace, 'fail-probe.mjs'), "import test from 'node:test'; test('intentional failure', () => { throw new Error('live probe'); });\n", { mode: 0o600 });
      const prompt = 'This is a terminal integration check. Use Bash to run node --test pass-probe.mjs. Then use a separate Bash call to sleep 4. Then run node --test fail-probe.mjs; that failure is intentional. Then use a separate Bash call to sleep 65. Do not fix or edit anything. Finish with a short acknowledgement.';
      console.log('Live check: Claude will make real model calls using your account.');
      console.log('Choose a theme and trust this disposable test workspace if asked.');
      console.log('Approve only the test and sleep commands. After the response, wait 65 seconds for the nap, then type /exit.');
      console.log('The check requires six visible buddy reactions and changing animation frames. A missing reaction fails the check.');
      const temporary = mkdtempSync(join(tmpdir(), 'buddy-back-live-'));
      const recording = join(temporary, 'terminal.log');
      let installed = false;
      try {
        buddy(['install']);
        installed = true;
        buddy(['choose', 'cat']);
        buddy(['name', 'LiveBuddy']);
        buddy(['on']);
        const args = ['--setting-sources', 'user', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--model', 'haiku', prompt];
        const scriptArgs = process.platform === 'darwin'
          ? ['-q', recording, 'claude', ...args]
          : ['-qefc', ['claude', ...args].map(quote).join(' '), recording];
        const child = spawn('script', scriptArgs, { cwd: workspace, env, stdio: 'inherit' });
        const cancel = () => child.kill('SIGTERM');
        const timer = setTimeout(cancel, 10 * 60_000);
        process.on('SIGINT', cancel);
        process.on('SIGTERM', cancel);
        let code;
        try {
          code = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', resolve);
          });
        } finally {
          clearTimeout(timer);
          process.off('SIGINT', cancel);
          process.off('SIGTERM', cancel);
        }
        const { seen, animated, passed } = evaluateRecording(readFileSync(recording, 'utf8'), code);
        console.log(`\nVisible reactions: ${seen.map(mood => labels[mood]).join(', ') || 'none'}`);
        console.log(`Animation: ${animated ? 'observed' : 'not observed'}`);
        if (!passed) throw new Error('Live check incomplete. Inspect the missing reactions; do not report integration as verified.');
        console.log('PASS: six reactions and animation observed inside interactive Claude Code.');
      } finally {
        try {
          if (installed) buddy(['uninstall']);
        } finally {
          rmSync(temporary, { recursive: true, force: true });
        }
      }
    }
  } catch (error) {
    console.error(`Live check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
