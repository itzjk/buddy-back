import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function paths(env = process.env) {
  const root = resolve(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'));
  const data = join(root, 'buddy-back');
  return { root, data, settings: join(root, 'settings.json'), config: join(data, 'config.json'), manifest: join(data, 'installation.json'), sessions: join(data, 'sessions'), runtime: join(data, 'runtime') };
}

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readJSON(file, fallback = {}) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function privateDir(dir) {
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('Refusing a symbolic link for buddy-back storage.');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function atomicWrite(file, data, mode = 0o600) {
  privateDir(dirname(file));
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, data, { mode, flag: 'wx' });
    renameSync(temp, file);
  } finally { rmSync(temp, { force: true }); }
}

export function writeJSON(file, data) {
  atomicWrite(file, JSON.stringify(data, null, 2) + '\n');
}

export function sessionFile(p, id) {
  if (typeof id !== 'string' || !id || id.length > 1024) return null;
  return join(p.sessions, createHash('sha256').update(id).digest('hex') + '.json');
}

export async function locked(file, fn, retries = 0) {
  privateDir(dirname(file));
  let acquired = false;
  for (let i = 0; i <= retries; i++) {
    try { mkdirSync(file, { mode: 0o700 }); acquired = true; break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (i < retries) await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  if (!acquired) throw new Error(`Another buddy-back command is running. If none is running, remove ${file} and retry.`);
  try { return await fn(); } finally { rmSync(file, { recursive: true, force: true }); }
}

export function config(p) {
  const value = readJSON(p.config);
  return object(value) ? value : {};
}
