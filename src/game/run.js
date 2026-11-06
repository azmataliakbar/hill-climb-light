/**
 * One run: terrain, car, coins, distance, and the crash state.
 * stepRun is the only function that advances the game. It is deterministic for a given seed.
 */
import { createTerrain } from '../physics/terrain.js';
import { createCar, stepCar } from '../physics/vehicle.js';
import { createRng, randomSeed } from '../physics/rng.js';

export const COIN_PICKUP_RADIUS = 1.6;
const COIN_LOOKAHEAD = 80; // metres of coins generated ahead of the car
const COIN_HEIGHT = 1.6; // coins float this far above the ground
const COIN_START = 30;

export function createRun({ seed = randomSeed() } = {}) {
  const terrain = createTerrain(seed);
  const car = createCar(terrain, 0);
  return {
    seed,
    terrain,
    car,
    startX: car.x,
    status: 'running', // 'running' | 'crashed'
    coins: [], // {x, y, taken}
    coinRng: createRng((seed ^ 0x9e3779b9) >>> 0),
    nextCoinX: COIN_START,
    runCoins: 0,
    distance: 0,
    elapsed: 0,
  };
}

function generateCoinsUntil(run, untilX) {
  while (run.nextCoinX < untilX) {
    const x = run.nextCoinX;
    run.coins.push({ x, y: run.terrain.height(x) + COIN_HEIGHT, taken: false });
    run.nextCoinX += 14 + run.coinRng() * 10;
  }
}

export function stepRun(run, input, dt) {
  if (run.status !== 'running') return run;
  const { car } = run;
  stepCar(car, run.terrain, input, dt);
  run.elapsed += dt;

  generateCoinsUntil(run, car.x + COIN_LOOKAHEAD);
  for (const coin of run.coins) {
    if (coin.taken) continue;
    if (Math.abs(coin.x - car.x) < COIN_PICKUP_RADIUS && Math.abs(coin.y - car.y) < COIN_PICKUP_RADIUS + 0.6) {
      coin.taken = true;
      run.runCoins += 1;
    }
  }

  run.distance = Math.max(run.distance, Math.floor(car.x - run.startX));
  if (car.crashed) run.status = 'crashed';
  return run;
}
