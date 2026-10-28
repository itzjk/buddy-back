import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecording } from '../scripts/check-claude.mjs';

const recording = [
  ' /\\_/\\  (=^.^=)  LiveBuddy | ready',
  ' /\\_/\\  (=o.o=) .  LiveBuddy | thinking',
  ' /\\_/\\  (=o.o=) ..  LiveBuddy | thinking',
  ' /\\_/\\  (=^w^=) +  LiveBuddy | tests passed',
  ' /\\_/\\  (=o_o=) !  LiveBuddy | something failed',
  ' /\\_/\\  (=^w^=) *+*  LiveBuddy | long task done!',
  ' /\\_/\\  (=-.-=) z  LiveBuddy | napping'
];

test('live checker rejects login screens, prose labels, and incomplete sessions', () => {
  for (const text of ['', 'Select login method:', 'ready thinking tests passed something failed long task done! napping', recording.slice(0, -1).join('\n')]) {
    assert.equal(evaluateRecording(text, 0).passed, false);
  }
});

test('live checker requires both changing frames and a successful process exit', () => {
  assert.equal(evaluateRecording(recording.join('\n'), 0).passed, true);
  assert.equal(evaluateRecording(recording.filter((_, index) => index !== 2).join('\n'), 0).passed, false);
  assert.equal(evaluateRecording(recording.join('\n'), 1).passed, false);
  assert.equal(evaluateRecording(recording.join('\n'), null).passed, false);
});

test('live checker recognizes colored terminal frames without accepting another buddy name', () => {
  assert.equal(evaluateRecording(`\x1b[32m${recording.join('\r\n')}\x1b[0m`, 0).passed, true);
  assert.equal(evaluateRecording(recording.join('\n').replaceAll('LiveBuddy', 'OtherBuddy'), 0).passed, false);
});
