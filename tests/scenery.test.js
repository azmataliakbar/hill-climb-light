import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsInBucket, sceneryBetween, isClearOfTrack, PARALLAX } from '../src/game/scenery.js';

test('scenery is deterministic for a seed and varies between seeds', () => {
  assert.deepEqual(itemsInBucket(7, 3), itemsInBucket(7, 3));
  assert.notDeepEqual(itemsInBucket(7, 3), itemsInBucket(8, 3));
});

test('scenery items are bushes or trees with sensible sizes', () => {
  for (let b = 0; b < 200; b += 1) {
    for (const item of itemsInBucket(42, b)) {
      assert.ok(item.kind === 'bush' || item.kind === 'tree');
      assert.ok(item.scale >= 0.7 && item.scale <= 1.3);
      assert.ok(item.tint >= 0 && item.tint < 1);
    }
  }
});

test('sceneryBetween returns only items inside the requested window', () => {
  const items = sceneryBetween(42, 100, 160);
  assert.ok(items.length > 0);
  for (const item of items) assert.ok(item.u >= 100 && item.u <= 160);
});

test('the parallax factor keeps the far layer slower than the track', () => {
  assert.ok(PARALLAX > 0 && PARALLAX < 1);
});

test('an item is only drawn when its base is clearly above the track', () => {
  assert.equal(isClearOfTrack(200, 260), true);
  assert.equal(isClearOfTrack(200, 203), false); // too close to the track
  assert.equal(isClearOfTrack(300, 260), false); // below the track
});
