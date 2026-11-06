import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun } from '../src/game/run.js';

const DT = 1 / 240;

test('runs are reproducible for the same seed and inputs', () => {
  const a = createRun({ seed: 11 });
  const b = createRun({ seed: 11 });
  for (let i = 0; i < 240 * 4; i += 1) {
    stepRun(a, { gas: true }, DT);
    stepRun(b, { gas: true }, DT);
  }
  assert.equal(a.car.x, b.car.x);
  assert.equal(a.distance, b.distance);
  assert.equal(a.runCoins, b.runCoins);
});

test('driving forward increases distance', () => {
  const run = createRun({ seed: 3 });
  for (let i = 0; i < 240 * 6; i += 1) stepRun(run, { gas: true }, DT);
  assert.ok(run.distance > 5, `distance ${run.distance}`);
  assert.equal(run.status, 'running');
});

test('coins are generated ahead of the car and picked up once', () => {
  const run = createRun({ seed: 21 });
  stepRun(run, {}, 0); // generates coins ahead
  assert.ok(run.coins.length > 0);
  const coin = run.coins[0];
  // Put the car on top of the first coin, then step: it should be collected exactly once.
  run.car.x = coin.x;
  run.car.y = coin.y;
  run.car.vx = 0;
  run.car.vy = 0;
  stepRun(run, {}, 0);
  stepRun(run, {}, 0);
  assert.equal(coin.taken, true);
  assert.equal(run.runCoins, 1);
});

test('a crashed run stops advancing', () => {
  const run = createRun({ seed: 5 });
  run.car.crashed = true;
  stepRun(run, { gas: true }, DT);
  assert.equal(run.status, 'crashed');
  const x = run.car.x;
  stepRun(run, { gas: true }, DT);
  assert.equal(run.car.x, x);
});
