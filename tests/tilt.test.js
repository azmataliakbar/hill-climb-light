import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCar, stepCar, pitchOf, TUNINGS } from '../src/physics/vehicle.js';

const DT = 1 / 240;
const flat = { height: () => 0, slope: () => 0 };
const maxAbsPitch = (samples) => Math.max(...samples.map(Math.abs));

function holdGas(tuning, seconds = 4) {
  const car = createCar(flat, 0);
  const samples = [];
  for (let i = 0; i < 240 * seconds && !car.crashed; i += 1) {
    stepCar(car, flat, { gas: true }, DT, tuning);
    samples.push(pitchOf(car, flat));
  }
  return { car, samples };
}

test('hard tuning pitches the nose up more than easy under throttle', () => {
  const easy = holdGas(TUNINGS.easy);
  const hard = holdGas(TUNINGS.hard);
  assert.ok(maxAbsPitch(hard.samples) > maxAbsPitch(easy.samples) * 1.5);
});

test('a full-throttle wheelie stays under the hard tip-over limit on flat ground', () => {
  const { car, samples } = holdGas(TUNINGS.hard);
  assert.ok(maxAbsPitch(samples) < TUNINGS.hard.tipAngle);
  assert.ok(maxAbsPitch(samples) < TUNINGS.hard.warnAngle + 0.05, 'wheelie should stay near the warning line');
  assert.equal(car.crashed, false);
});

test('a wheelie held past the hard tilt limit tips the car over', () => {
  // Hold the pitch above the warning angle for longer than the tilt limit.
  const car = createCar(flat, 0);
  car.angle = TUNINGS.hard.warnAngle + 0.02;
  for (let i = 0; i < 240 * 2 && !car.crashed; i += 1) {
    car.angle = Math.max(car.angle, TUNINGS.hard.warnAngle + 0.02); // keep it pitched
    stepCar(car, flat, {}, DT, TUNINGS.hard);
  }
  assert.equal(car.crashed, true);
});

test('easy tuning has no sustained-tilt limit and a looser tip-over angle than hard', () => {
  assert.equal(TUNINGS.easy.tiltLimit, Infinity);
  assert.ok(TUNINGS.easy.tipAngle > TUNINGS.hard.tipAngle);
  assert.ok(TUNINGS.easy.warnAngle > TUNINGS.hard.warnAngle);
});

test('braking nose-dive is bounded and does not flip the car on flat ground', () => {
  const car = createCar(flat, 0);
  for (let i = 0; i < 240 * 3; i += 1) stepCar(car, flat, { gas: true }, DT, TUNINGS.hard);
  const samples = [];
  for (let i = 0; i < 240 * 2 && !car.crashed; i += 1) {
    stepCar(car, flat, { brake: true }, DT, TUNINGS.hard);
    samples.push(pitchOf(car, flat));
  }
  assert.ok(maxAbsPitch(samples) < TUNINGS.hard.tipAngle, `dive ${maxAbsPitch(samples)}`);
});
