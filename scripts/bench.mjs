import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const cli = fileURLToPath(new URL('../bin/buddy-back.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'buddy-back-bench-'));
const env = { ...process.env, CLAUDE_CONFIG_DIR: root };
const input = JSON.stringify({ session_id: 'benchmark', model: { display_name: 'Opus' }, context_window: { used_percentage: 25 } });
try {
  const hook = spawnSync(process.execPath, [cli, 'hook'], { env, input: JSON.stringify({ session_id: 'benchmark', hook_event_name: 'UserPromptSubmit' }), encoding: 'utf8' });
  if (hook.status !== 0 || hook.stdout || hook.stderr) throw new Error('Hook benchmark setup failed.');
  const samples = [];
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    const result = spawnSync(process.execPath, [cli, 'status'], { env, input, encoding: 'utf8', timeout: 2000 });
    if (result.status !== 0 || result.stderr || !result.stdout.includes('thinking')) throw new Error('Status command failed.');
    if (i >= 5) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  console.log(`Status process, including Node startup (${samples.length} runs after 5 warmups): median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms.`);
  console.log('Local files only; no previous status command in this benchmark.');
  if (p95 > 200) { console.error('Performance budget exceeded: p95 must be below 200 ms.'); process.exitCode = 1; }
} finally { rmSync(root, { recursive: true, force: true }); }
