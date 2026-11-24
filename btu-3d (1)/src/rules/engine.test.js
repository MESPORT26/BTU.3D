import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, makePlayer, coach, receiveRace, aiShot, guessCovers, options, legalShots } from './engine.js';

const P = makePlayer(0.6);
const defs = [[4, 2.5], [4, 5.5]];
const covers = [{ d: 'mid', l: 1 }, { d: 'mid', l: 1 }];

test('smash from below the net mostly goes in the net', () => {
  let net = 0;
  for (let i = 0; i < 500; i++) {
    const r = resolve({ pos: [2, 4], h: 1.0, B: 1, timing: 'on' }, P, { shot: 'smash', d: 'mid', l: 1, risk: 'normal' }, defs, [P, P], covers);
    if (r.end === 'err' && r.why === 'net') net++;
  }
  assert.ok(net > 350, `net ${net}`);
});

test('a high ball close to the net is a smash', () => {
  const [best, , ok] = coach({ pos: [2, 4], h: 2.5 }, 'lob', [[4, 2], [4, 6]], 6);
  assert.equal(best, 'hook'); // lobbed over you
  const [b2, , ok2] = coach({ pos: [2, 4], h: 2.5 }, 'neutral', [[4, 2], [4, 6]], 6);
  assert.equal(b2, 'smash');
  assert.deepEqual(ok2, ['smash', 'push']);
  assert.ok(ok.includes('hook'));
});

test('deep lobs give more time than fast pushes', () => {
  const lob = receiveRace({ shot: 'lob', land: [7, 4], tBall: 2.2, from: [3, 4], player: P, tapFrac: 0.4 });
  const push = receiveRace({ shot: 'push', land: [7, 4], tBall: 0.9, from: [3, 4], player: P, tapFrac: 0.4 });
  assert.ok(!lob.late, 'lob reachable');
  assert.ok(push.late, 'push too far');
});

test('AI picks a legal shot', () => {
  const st = { pos: [3, 4], h: 1.4, B: 0.8, timing: 'on' };
  const g = guessCovers({ covMem: [] }, P, 1);
  const c = aiShot(st, P, defs, [P, P], 'neutral', g, {});
  assert.ok(legalShots('neutral')[c.shot]);
  assert.ok(options('neutral').length > 50);
});
