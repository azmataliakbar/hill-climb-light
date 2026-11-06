import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gearIndexFor,
  displayGear,
  rpmFor,
  engineHz,
  engineParams,
  masterGain,
  rmsOfBytes,
  GEAR_COUNT,
  GEAR_RATIOS,
  GEAR_TOP_MPS,
  IDLE_RPM,
  MAX_RPM,
  STOP_SPEED,
} from '../src/audio/engine-sound.js';

test('the gearbox climbs to fifth gear as the car speeds up', () => {
  let g = 0;
  const seen = new Set();
  for (let v = 0; v <= 27; v += 0.25) {
    g = gearIndexFor(v, g);
    seen.add(g);
  }
  assert.equal(g, GEAR_COUNT - 1);
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4]);
});

test('the gearbox steps back down as the car slows', () => {
  assert.equal(gearIndexFor(27, 4), 4);
  assert.equal(gearIndexFor(17, 4), 4); // above the 16.8 m/s downshift point
  assert.equal(gearIndexFor(16, 4), 3); // below it
  assert.equal(gearIndexFor(3, 4), 0);
});

test('the dashboard shows 0 when stopped and 1..5 when moving', () => {
  assert.equal(displayGear(0, 0), 0);
  assert.equal(displayGear(STOP_SPEED / 2, 0), 0);
  assert.equal(displayGear(2, 0), 1);
  assert.equal(displayGear(27, 4), 5);
});

test('RPM stays within the engine range and is about 5000 at each gear top speed', () => {
  for (let i = 0; i < GEAR_COUNT; i += 1) {
    const rpm = rpmFor(GEAR_TOP_MPS[i], i);
    assert.ok(Math.abs(rpm - 5000) < 1, `gear ${i + 1} rpm ${rpm}`);
    assert.ok(GEAR_RATIOS[i] > 0);
  }
  assert.equal(rpmFor(0, 0), IDLE_RPM);
  assert.equal(rpmFor(500, 0), MAX_RPM);
});

test('RPM drops at each upshift, as in a real gearbox', () => {
  const before = rpmFor(11, 0);
  const after = rpmFor(11, 1);
  assert.ok(after < before);
});

test('engine pitch rises with RPM and with throttle, within the audible band', () => {
  assert.ok(engineHz(1000, 0) < engineHz(4000, 0));
  assert.ok(engineHz(4000, 0) < engineHz(4000, 1));
  assert.ok(engineHz(IDLE_RPM, 0) >= 50 && engineHz(IDLE_RPM, 0) <= 60);
  assert.ok(engineHz(MAX_RPM, 1) > 300 && engineHz(MAX_RPM, 1) < 340);
});

test('full throttle is louder than idle, and brake squeal only plays while moving', () => {
  const idle = engineParams({ speed: 0, throttle: 0, brake: false, gearIndex: 0 });
  const full = engineParams({ speed: 20, throttle: 1, brake: false, gearIndex: 3 });
  assert.ok(full.engineGain > idle.engineGain);
  assert.equal(engineParams({ speed: 0, throttle: 0, brake: true, gearIndex: 0 }).brakeGain, 0);
  assert.ok(engineParams({ speed: 20, throttle: 0, brake: true, gearIndex: 3 }).brakeGain > 0);
});

test('the master gain follows the volume slider and mute', () => {
  assert.equal(masterGain(0), 0);
  assert.ok(masterGain(1) > masterGain(0.5));
  assert.ok(masterGain(1) <= 1, 'leave headroom below full scale');
  assert.equal(masterGain(1, true), 0);
  assert.equal(masterGain(2), masterGain(1), 'volume is clamped');
});

test('loudness of a full-scale sine is about 0.7 RMS and silence is 0', () => {
  const sine = new Uint8Array(512);
  for (let i = 0; i < sine.length; i += 1) sine[i] = Math.round(128 + 127 * Math.sin((i / 512) * 2 * Math.PI * 8));
  assert.ok(Math.abs(rmsOfBytes(sine) - 0.7) < 0.05);
  assert.equal(rmsOfBytes(new Uint8Array(512).fill(128)), 0);
});
