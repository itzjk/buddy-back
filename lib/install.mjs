import { cpSync, existsSync, lstatSync, readFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { atomicWrite, locked, object, privateDir, readJSON, writeJSON } from './storage.mjs';
import { events } from './session.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
export const quote = value => `'${value.replace(/'/g, `'"'"'`)}'`;

function readSettings(p) {
  let info;
  try { info = lstatSync(p.settings); }
  catch (error) {
    if (error.code === 'ENOENT') return { raw: null, value: {}, mode: 0o600 };
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error('settings.json is a symbolic link. Use a regular settings file to install safely.');
  const raw = readFileSync(p.settings, 'utf8');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('settings.json is invalid JSON. Nothing was changed.'); }
  if (!object(value)) throw new Error('settings.json must contain an object. Nothing was changed.');
  if (value.hooks !== undefined && !object(value.hooks)) throw new Error('settings.json hooks must be an object. Nothing was changed.');
  for (const event of events) {
    if (value.hooks?.[event] !== undefined && !Array.isArray(value.hooks[event])) throw new Error(`hooks.${event} must be an array. Nothing was changed.`);
  }
  return { raw, value, mode: statSync(p.settings).mode & 0o777 };
}

function unchanged(p, raw) {
  const current = existsSync(p.settings) ? readFileSync(p.settings, 'utf8') : null;
  if (current !== raw) throw new Error('settings.json changed during this operation. Nothing was overwritten. Retry.');
}

export async function install(p) {
  if (process.platform === 'win32') throw new Error('The installer supports macOS and Linux. On Windows, use WSL with Node installed inside WSL.');
  privateDir(p.data);
  return locked(join(p.data, 'settings.lock'), () => {
    if (existsSync(p.manifest)) return 'Already installed. Your backup and preferences are unchanged. Restart Claude Code if needed.';
    const original = readSettings(p);
    const previous = original.value.statusLine;
    if (previous !== undefined && (!object(previous) || previous.type !== 'command' || typeof previous.command !== 'string')) throw new Error('Existing statusLine is not a command. Nothing was changed.');
    const settings = structuredClone(original.value);
    privateDir(p.runtime);
    for (const dir of ['bin', 'lib']) cpSync(join(source, dir), join(p.runtime, dir), { recursive: true });
    const command = `CLAUDE_CONFIG_DIR=${quote(p.root)} ${quote(process.execPath)} ${quote(join(p.runtime, 'bin', 'buddy-back.mjs'))}`;
    const hookCommand = `${command} hook`;
    settings.statusLine = { ...previous, type: 'command', command: `${command} status`, refreshInterval: 1 };
    settings.hooks ??= {};
    for (const event of events) {
      settings.hooks[event] = [...(settings.hooks[event] || []), { hooks: [{ type: 'command', command: hookCommand, timeout: 2 }] }];
    }
    const backup = join(p.data, `settings.before-${Date.now()}.json`);
    if (original.raw !== null) atomicWrite(backup, original.raw);
    const manifest = { version: 1, originalRaw: original.raw, originalSettings: original.value, originalMode: original.mode, installedSettings: settings, hookCommand, backup: original.raw === null ? null : backup };
    writeJSON(p.manifest, manifest);
    unchanged(p, original.raw);
    atomicWrite(p.settings, JSON.stringify(settings, null, 2) + '\n', original.mode);
    return `Buddy is home. Restart Claude Code to load the hooks.\n${manifest.backup ? `Original settings backed up to ${manifest.backup}` : 'No previous settings file. Uninstall will remove the generated file.'}`;
  });
}

export async function uninstall(p) {
  if (!existsSync(p.manifest)) return 'Not installed. Nothing changed.';
  return locked(join(p.data, 'settings.lock'), () => {
    const manifest = readJSON(p.manifest, null);
    if (!object(manifest) || manifest.version !== 1 || !object(manifest.originalSettings) || !object(manifest.installedSettings) || typeof manifest.hookCommand !== 'string') throw new Error('Installation record is damaged. Restore the saved settings.before file manually.');
    const current = readSettings(p);
    let result;
    if (isDeepStrictEqual(current.value, manifest.installedSettings)) {
      unchanged(p, current.raw);
      if (manifest.originalRaw === null) rmSync(p.settings, { force: true });
      else atomicWrite(p.settings, manifest.originalRaw, manifest.originalMode);
      result = 'Original settings restored exactly.';
    } else {
      const settings = structuredClone(current.value);
      const original = manifest.originalSettings;
      if (isDeepStrictEqual(settings.statusLine, manifest.installedSettings.statusLine)) {
        if (Object.hasOwn(original, 'statusLine')) settings.statusLine = original.statusLine;
        else delete settings.statusLine;
      } else if (settings.statusLine?.command === manifest.installedSettings.statusLine.command) {
        if (Object.hasOwn(original, 'statusLine')) {
          settings.statusLine = { ...settings.statusLine, type: original.statusLine.type, command: original.statusLine.command };
          if (settings.statusLine.refreshInterval === manifest.installedSettings.statusLine.refreshInterval) {
            if (Object.hasOwn(original.statusLine, 'refreshInterval')) settings.statusLine.refreshInterval = original.statusLine.refreshInterval;
            else delete settings.statusLine.refreshInterval;
          }
        } else delete settings.statusLine;
      }
      if (object(settings.hooks)) {
        for (const event of events) {
          if (!Array.isArray(settings.hooks[event])) continue;
          settings.hooks[event] = settings.hooks[event].flatMap(group => {
            if (!object(group) || !Array.isArray(group.hooks)) return [group];
            const remaining = group.hooks.filter(hook => !(hook?.type === 'command' && hook.command === manifest.hookCommand));
            if (remaining.length === group.hooks.length) return [group];
            return remaining.length ? [{ ...group, hooks: remaining }] : [];
          });
          if (!settings.hooks[event].length && !Object.hasOwn(original.hooks || {}, event)) delete settings.hooks[event];
        }
        if (!Object.keys(settings.hooks).length && !Object.hasOwn(original, 'hooks')) delete settings.hooks;
      }
      unchanged(p, current.raw);
      if (!isDeepStrictEqual(settings, current.value)) atomicWrite(p.settings, JSON.stringify(settings, null, 2) + '\n', current.mode);
      result = 'Buddy removed. Settings you changed after installation were preserved.';
    }
    rmSync(p.manifest);
    rmSync(p.runtime, { recursive: true, force: true });
    rmSync(p.sessions, { recursive: true, force: true });
    return `${result}\nPreferences and the original backup remain in ${p.data}. Restart Claude Code.`;
  });
}
