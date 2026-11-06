import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/physics/terrain.js';
import { createRng } from '../src/physics/rng.js';
import { createCar, stepCar, CAR, groundFrame } from '../src/physics/vehicle.js';

const DT = 1 / 240;
const flat = { height: () => 0, slope: () => 0 };
const none = {};

test('rng is deterministic per seed and stays in [0, 1)', () => {
  const a = createRng(42);
  const b = createRng(42);
  for (let i = 0; i < 100; i += 1) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('terrain is deterministic for a seed and differs between seeds', () => {
  const t1 = createTerrain(7);
  const t2 = createTerrain(7);
  const t3 = createTerrain(8);
  assert.equal(t1.height(123.4), t2.height(123.4));
  assert.notEqual(t1.height(123.4), t3.height(123.4));
});

test('terrain is flat at the start and continuous elsewhere', () => {
  const t = createTerrain(99);
  assert.equal(t.height(0), 0);
  assert.equal(t.height(-10), 0);
  let prev = t.height(0);
  for (let x = 0.05; x < 300; x += 0.05) {
    const h = t.height(x);
    assert.ok(Math.abs(h - prev) < 0.2, `jump at x=${x.toFixed(2)}`);
    prev = h;
  }
});

test('analytic slope matches a numerical derivative', () => {
  const t = createTerrain(5);
  for (const x of [3, 40, 117.3, 260]) {
    const eps = 1e-5;
    const numeric = (t.height(x + eps) - t.height(x - eps)) / (2 * eps);
    assert.ok(Math.abs(numeric - t.slope(x)) < 1e-4, `slope mismatch at x=${x}`);
  }
});

test('ground frame normal is a unit vector perpendicular to the tangent', () => {
  const g = groundFrame(createTerrain(3), 50);
  assert.ok(Math.abs(Math.hypot(g.nx, g.ny) - 1) < 1e-9);
  assert.ok(Math.abs(g.nx * g.tx + g.ny * g.ty) < 1e-9);
});

test('suspension settles on flat ground at the static compression from Hooke\'s law', () => {
  const car = createCar(flat, 0);
  for (let i = 0; i < 240 * 6; i += 1) stepCar(car, flat, none, DT);
  assert.equal(car.crashed, false);
  assert.ok(Math.abs(car.vy) < 1e-3, `still moving vertically: ${car.vy}`);

  // Each wheel carries half the chassis weight through its spring.
  const expected = (CAR.mass * CAR.gravity) / 2 / CAR.springY;
  const rear = car.wheels[0];
  const cs = Math.cos(car.angle);
  const sn = Math.sin(car.angle);
  const dx = rear.x - (car.x + cs * -0.95 - sn * -0.1);
  const dy = rear.y - (car.y + sn * -0.95 + cs * -0.1);
  const bodyY = -sn * dx + cs * dy;
  const compression = bodyY + CAR.restLength; // positive when the wheel is pushed up toward the attachment
  assert.ok(Math.abs(compression - expected) / expected < 0.05, `compression ${compression} vs ${expected}`);
});

test('throttle accelerates the car forward and it does not flip', () => {
  const car = createCar(flat, 0);
  for (let i = 0; i < 240 * 8; i += 1) stepCar(car, flat, { gas: true }, DT);
  assert.ok(car.vx > 10, `expected speed, got ${car.vx}`);
  assert.equal(car.crashed, false);
  assert.ok(Number.isFinite(car.angle));
});

test('brake slows a moving car', () => {
  const car = createCar(flat, 0);
  for (let i = 0; i < 240 * 4; i += 1) stepCar(car, flat, { gas: true }, DT);
  const speed = car.vx;
  for (let i = 0; i < 240 * 2; i += 1) stepCar(car, flat, { brake: true }, DT);
  assert.ok(car.vx < speed * 0.5, `brake too weak: ${speed} -> ${car.vx}`);
});

test('a car upside down on flat ground is flagged as crashed', () => {
  const car = createCar(flat, 0);
  car.angle = Math.PI;
  car.y = 1.5;
  for (let i = 0; i < 240 * 3 && !car.crashed; i += 1) stepCar(car, flat, none, DT);
  assert.equal(car.crashed, true);
});

test('a sideways car on flat ground is flagged as crashed when its roof hits the ground', () => {
  const car = createCar(flat, 0);
  car.angle = Math.PI / 2;
  car.y = 2;
  for (let i = 0; i < 240 * 3 && !car.crashed; i += 1) stepCar(car, flat, none, DT);
  assert.equal(car.crashed, true);
});

test('the physics stays finite over a long run on hilly terrain', () => {
  const terrain = createTerrain(2024);
  const car = createCar(terrain, 0);
  for (let i = 0; i < 240 * 20; i += 1) {
    stepCar(car, terrain, { gas: i < 240 * 12, brake: i > 240 * 15 && i < 240 * 16, leanBack: i % 500 === 0 }, DT);
    if (car.crashed) break;
  }
  assert.ok(Number.isFinite(car.x) && Number.isFinite(car.y) && Number.isFinite(car.vx));
});
