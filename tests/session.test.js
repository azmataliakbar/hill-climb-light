import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ATTEMPTS,
  COIN_POINTS,
  attemptScore,
  createSession,
  recordAttempt,
  summarise,
  createSessionController,
} from '../src/game/session.js';

test('attempt score is distance plus ten points per coin', () => {
  assert.equal(attemptScore({ distance: 120, coins: 4 }), 120 + 4 * COIN_POINTS);
});

test('a session records attempts in order and sums the total', () => {
  let s = createSession({ seed: 9, difficulty: 'easy' });
  s = recordAttempt(s, { distance: 50, coins: 1 });
  s = recordAttempt(s, { distance: 80, coins: 0 });
  const sum = summarise(s);
  assert.deepEqual(sum.attempts.map((a) => a.n), [1, 2]);
  assert.equal(sum.total, 60 + 80);
  assert.equal(sum.best.n, 2);
  assert.equal(sum.bestDistance, 80);
  assert.equal(sum.totalCoins, 1);
  assert.equal(sum.over, false);
  assert.equal(sum.remaining, 1);
});

test('the session is over after three attempts and refuses a fourth', () => {
  let s = createSession({ seed: 1 });
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) s = recordAttempt(s, { distance: 10, coins: 0 });
  assert.equal(summarise(s).over, true);
  assert.throws(() => recordAttempt(s, { distance: 1, coins: 0 }), RangeError);
});

test('the controller keeps one seed for the whole session and replay resets attempts on the same track', () => {
  let n = 100;
  const c = createSessionController(() => n++);
  const first = c.start({ difficulty: 'hard' });
  assert.equal(first.seed, 100);
  c.finishAttempt({ distance: 30, coins: 2 });
  c.finishAttempt({ distance: 40, coins: 0 });
  const replayed = c.replay();
  assert.equal(replayed.seed, 100);
  assert.equal(replayed.difficulty, 'hard');
  assert.equal(replayed.attempts.length, 0);
});

test('starting a new session without a seed uses a fresh one', () => {
  let n = 5;
  const c = createSessionController(() => n++);
  assert.equal(c.start({}).seed, 5);
  assert.equal(c.start({}).seed, 6);
});

test('finishing an attempt with no session in progress is an error', () => {
  const c = createSessionController(() => 1);
  assert.throws(() => c.finishAttempt({ distance: 1, coins: 0 }), RangeError);
});
