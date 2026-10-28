export const buddies = {
  cat: { idle: [' /\\_/\\  (=^.^=)', ' /\\_/\\  (=^o^=)'], thinking: [' /\\_/\\  (=o.o=) .', ' /\\_/\\  (=o.o=) ..', ' /\\_/\\  (=o.o=) ...'], happy: [' /\\_/\\  (=^w^=) +', ' /\\_/\\  (=^w^=) *'], worried: [' /\\_/\\  (=o_o=) !', ' /\\_/\\  (=o.o=) !'], sleeping: [' /\\_/\\  (=-.-=) z', ' /\\_/\\  (=-.-=) zz'], celebrate: [' /\\_/\\  (=^w^=) *+*', ' /\\_/\\  (=^w^=) +*+'], waiting: [' /\\_/\\  (=o.o=) ?', ' /\\_/\\  (=o_o=) ?'] },
  robot: { idle: [' [o_o] |_|', ' [o.o] |_|'], thinking: [' [o_o] |.| .', ' [o_o] |:| ..', ' [o_o] |.| ...'], happy: [' [^_^] |_| +', ' [^_^] |_| *'], worried: [' [!_!] |_| !', ' [o_o] |_| !'], sleeping: [' [-_-] |_| z', ' [-_-] |_| zz'], celebrate: [' \\[^_^]/ *+*', ' /[^_^]\\ +*+'], waiting: [' [o_o] |_| ?', ' [o.o] |_| ?'] },
  ghost: { idle: [' .-. (o.o) ~', ' .-. (o.o) ~~'], thinking: [' .-. (O.o) .', ' .-. (o.O) ..', ' .-. (O.o) ...'], happy: [' .-. (^.^) +', ' .-. (^.^) *'], worried: [' .-. (o_o) !', ' .-. (O_O) !'], sleeping: [' .-. (-.-) z', ' .-. (-.-) zz'], celebrate: [' .-. (^o^) *+*', ' .-. (^o^) +*+'], waiting: [' .-. (o.o) ?', ' .-. (O.o) ?'] },
  dragon: { idle: [' /\\ (o>o) ~', ' /\\ (o>o) ~~'], thinking: [' /\\ (o>o) .', ' /\\ (O>o) ..', ' /\\ (o>O) ...'], happy: [' /\\ (^>^) +', ' /\\ (^>^) *'], worried: [' /\\ (o>O) !', ' /\\ (O>o) !'], sleeping: [' /\\ (->-) z', ' /\\ (->-) zz'], celebrate: [' /\\ (^>^) *+*', ' /\\ (^>^) +*+'], waiting: [' /\\ (o>o) ?', ' /\\ (O>o) ?'] }
};

export const labels = { idle: 'ready', thinking: 'thinking', happy: 'tests passed', worried: 'something failed', sleeping: 'napping', celebrate: 'long task done!', waiting: 'needs you' };

export function safeName(value) {
  if (typeof value !== 'string' || !/^[\x20-\x7e]{1,24}$/.test(value) || !value.trim()) throw new Error('Name must be 1-24 printable ASCII characters.');
  return value.trim();
}

export function render(state = 'idle', options = {}, now = Date.now()) {
  const species = Object.hasOwn(buddies, options.buddy) ? options.buddy : 'cat';
  const mood = Object.hasOwn(labels, state) ? state : 'idle';
  let name = 'Buddy';
  try { if (options.name) name = safeName(options.name); } catch {}
  const frames = buddies[species][mood];
  const frame = frames[Math.floor(now / 1000) % frames.length];
  return `${frame}  ${name} | ${labels[mood]}`;
}
