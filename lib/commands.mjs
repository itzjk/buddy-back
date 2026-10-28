import { buddies, labels, render, safeName } from './buddies.mjs';
import { config, locked, writeJSON } from './storage.mjs';
import { join } from 'node:path';

const help = `buddy-back: your terminal companion is back.

  install                  Merge status line + hooks, save original settings
  uninstall                Restore settings, preserve later user edits
  choose cat|robot|ghost|dragon
  name Mochi               Give your buddy a name (1-24 ASCII characters)
  off                      Hide persistently, keep your previous status line
  on                       Bring your buddy back
  list                     Meet the companions
  demo                     Preview all reactions, without changing settings
  demo --animate           Preview an animated session (Ctrl-C to exit)
  status                   Render one frame from Claude Code JSON on stdin
  hook                     Accept a Claude Code hook event on stdin
  help                     Show this help

Uses CLAUDE_CONFIG_DIR when set, otherwise ~/.claude.
No network, model calls, or transcript reads.`;

export async function run(command, args, p) {
  if (['help', '--help', '-h'].includes(command)) { console.log(help); return; }
  if (command === '--version') { console.log('0.1.0'); return; }
  if (command === 'install' || command === 'uninstall') {
    if (args.length) throw new Error(`${command} takes no arguments. Use CLAUDE_CONFIG_DIR for a different profile.`);
    const installer = await import('./install.mjs');
    console.log(await installer[command](p));
    return;
  }
  if (command === 'list') {
    for (const buddy of Object.keys(buddies)) console.log(`${buddy.padEnd(8)} ${render('idle', { buddy }, 0)}`);
    return;
  }
  if (command === 'demo') {
    if (args.length && (args.length !== 1 || args[0] !== '--animate')) throw new Error('Use demo or demo --animate.');
    const options = config(p);
    if (!args.length) {
      for (const mood of Object.keys(labels)) console.log(render(mood, options, 0));
      return;
    }
    if (!process.stdout.isTTY) throw new Error('Animated demo requires a terminal. Use demo for plain output.');
    const moods = ['idle', 'thinking', 'thinking', 'happy', 'worried', 'thinking', 'celebrate', 'sleeping'];
    let tick = 0;
    const draw = () => { process.stdout.write(`\r\x1b[2K${render(moods[Math.floor(tick / 3) % moods.length], options, tick * 1000)}`); tick++; };
    draw();
    const timer = setInterval(draw, 1000);
    process.once('SIGINT', () => { clearInterval(timer); process.stdout.write('\n'); });
    return;
  }
  if (['choose', 'name', 'off', 'on'].includes(command)) {
    let patch;
    if (command === 'choose') {
      if (args.length !== 1 || !Object.hasOwn(buddies, args[0])) throw new Error('Choose cat, robot, ghost, or dragon.');
      patch = { buddy: args[0] };
    } else if (command === 'name') {
      patch = { name: safeName(args.join(' ')) };
    } else {
      if (args.length) throw new Error(`${command} takes no arguments.`);
      patch = { enabled: command === 'on' };
    }
    await locked(join(p.data, 'config.lock'), () => writeJSON(p.config, { ...config(p), ...patch }));
    console.log(command === 'off' ? 'Buddy is off. This persists across sessions. Use buddy-back on to return.' : render('idle', config(p), 0));
    return;
  }
  throw new Error(`Unknown command: ${command}. Run buddy-back help.`);
}
