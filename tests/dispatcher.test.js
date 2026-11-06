import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDispatcher, ErrorCode } from '../src/router/dispatcher.js';
import { createGameCommands } from '../src/router/commands.js';

function fakes() {
  const calls = { start: [], coins: [], scores: [] };
  return {
    calls,
    session: {
      start(opts) {
        calls.start.push(opts);
        return { seed: opts.seed ?? 1 };
      },
    },
    profile: {
      addCoins(n) {
        calls.coins.push(n);
        return { total: n, persisted: true };
      },
    },
    highScores: {
      add(entry) {
        calls.scores.push(entry);
        return { rank: 1, persisted: true };
      },
    },
  };
}

test('unknown commands return a structured error', () => {
  const { session, profile, highScores } = fakes();
  const r = createGameCommands({ session, profile, highScores }).dispatch('game.fly', {});
  assert.equal(r.error.code, ErrorCode.UNKNOWN_COMMAND);
});

test('non-object payloads are rejected', () => {
  const { session, profile, highScores } = fakes();
  const r = createGameCommands({ session, profile, highScores });
  for (const bad of [null, 5, 'x', [1]]) {
    assert.equal(r.dispatch('game.start', bad).error.code, ErrorCode.INVALID_PAYLOAD);
  }
});

test('game.start forwards a valid seed and rejects a bad one', () => {
  const f = fakes();
  const r = createGameCommands(f);
  assert.equal(r.dispatch('game.start', { seed: 77 }).ok, true);
  assert.deepEqual(f.calls.start[0], { seed: 77 });
  assert.equal(r.dispatch('game.start', { seed: -1 }).error.code, ErrorCode.INVALID_PAYLOAD);
});

test('game.saveCoins validates the amount and adds it to the profile', () => {
  const f = fakes();
  const r = createGameCommands(f);
  assert.equal(r.dispatch('game.saveCoins', { coins: 12 }).ok, true);
  assert.deepEqual(f.calls.coins, [12]);
  assert.equal(r.dispatch('game.saveCoins', { coins: -3 }).error.code, ErrorCode.INVALID_PAYLOAD);
  assert.equal(r.dispatch('game.saveCoins', { coins: 1.5 }).error.code, ErrorCode.INVALID_PAYLOAD);
  assert.equal(r.dispatch('game.saveCoins', {}).error.code, ErrorCode.INVALID_PAYLOAD);
});

test('game.saveHighScore validates distance and trims the name', () => {
  const f = fakes();
  const r = createGameCommands(f);
  assert.equal(r.dispatch('game.saveHighScore', { distance: '5' }).error.code, ErrorCode.INVALID_PAYLOAD);
  const ok = r.dispatch('game.saveHighScore', { distance: 42, coins: 3, name: '   Azmat-Ali-Champion  ' });
  assert.equal(ok.ok, true);
  assert.equal(f.calls.scores[0].name, 'Azmat-Ali-Ch');
  assert.equal(f.calls.scores[0].coins, 3);
});

test('handler exceptions are reported as HANDLER_FAILED', () => {
  const d = createDispatcher();
  d.register('boom', () => {
    throw new Error('kaput');
  });
  assert.equal(d.dispatch('boom', {}).error.code, ErrorCode.HANDLER_FAILED);
});

test('duplicate registration is refused', () => {
  const d = createDispatcher();
  d.register('x', () => null);
  assert.throws(() => d.register('x', () => null), /already registered/);
});
