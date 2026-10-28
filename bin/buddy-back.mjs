#!/usr/bin/env node
import { paths } from '../lib/storage.mjs';

const args = process.argv.slice(2);
const command = args.shift() || 'help';
const quiet = command === 'status' || command === 'hook';

async function stdin() {
  if (process.stdin.isTTY) return '';
  return new Promise(resolve => {
    let raw = '';
    let size = 0;
    const timer = setTimeout(() => { process.stdin.destroy(); resolve(''); }, 1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 1024 * 1024) { clearTimeout(timer); process.stdin.destroy(); resolve(''); }
      else raw += chunk;
    });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(''); });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(raw); });
  });
}

try {
  if (quiet) {
    const raw = await stdin();
    let input;
    try { input = JSON.parse(raw || '{}'); } catch { input = {}; }
    if (command === 'hook') {
      const { record } = await import('../lib/session.mjs');
      await record(paths(), input);
    } else {
      const { status } = await import('../lib/status.mjs');
      const output = status(paths(), input, raw);
      if (output) process.stdout.write(output + '\n');
    }
  } else {
    const { run } = await import('../lib/commands.mjs');
    await run(command, args, paths());
  }
} catch (error) {
  if (!quiet) { console.error(`buddy-back: ${error.message}`); process.exitCode = 1; }
}
