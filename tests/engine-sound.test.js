import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rpmFor,
  pickGear,
  engineHz,
  GEAR_RATIOS,
  IDLE_RPM,
  MAX_RPM,
} from '../src/audio/engine-sound.js';

test('engine RPM is clamped to idle at standstill and to the redline at high speed', () => {
  assert.equal(rpmFor(0, 0), IDLE_RPM);
  assert.equal(rpmFor(200, 0), MAX_RPM);
});

test('RPM rises with speed in a fixed gear and falls in a higher gear', () => {
  assert.ok(rpmFor(10, 0) < rpmFor(15, 0));
  assert.ok(rpmFor(20, 2) < rpmFor(20, 1));
});

test('the gearbox upshifts at high RPM and downshifts at low RPM, one gear per call', () => {
  // About 23 m/s puts first gear just above the 5600 RPM upshift point
  const fast = 23;
  const up = pickGear(fast, 0);
  assert.equal(up, 1);
  // Top gear at top speed (27 m/s) stays engaged: RPM is between the shift points
  assert.equal(pickGear(27, GEAR_RATIOS.length - 1), GEAR_RATIOS.length - 1);

  // Slow in top gear drops a gear
  assert.equal(pickGear(3, 4), 3);
  // Standstill in first stays in first
  assert.equal(pickGear(0, 0), 0);
});

test('a gear change is always at most one step', () => {
  for (let v = 0; v < 40; v += 0.5) {
    for (let g = 0; g < GEAR_RATIOS.length; g += 1) {
      assert.ok(Math.abs(pickGear(v, g) - g) <= 1);
    }
  }
});

test('engine pitch rises with RPM and with throttle, within the audible band', () => {
  assert.ok(engineHz(1000, 0) < engineHz(4000, 0));
  assert.ok(engineHz(4000, 0) < engineHz(4000, 1));
  const low = engineHz(IDLE_RPM, 0);
  const high = engineHz(MAX_RPM, 1);
  assert.ok(low >= 30 && low <= 40, `idle ${low}`);
  assert.ok(high > 200 && high < 260, `redline ${high}`);
});
