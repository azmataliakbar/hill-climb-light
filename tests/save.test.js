import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfile,
  createHighScores,
  PROFILE_KEY,
  HIGHSCORE_KEY,
  MAX_ENTRIES,
} from '../src/storage/save.js';

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('keys use the hcl.v1 namespace so they cannot collide with other apps', () => {
  assert.ok(PROFILE_KEY.startsWith('hcl.v1.'));
  assert.ok(HIGHSCORE_KEY.startsWith('hcl.v1.'));
  assert.notEqual(PROFILE_KEY, 'retro-neon-pong:highscores');
});

test('coins accumulate across saves', () => {
  const storage = memoryStorage();
  const profile = createProfile(storage);
  assert.equal(profile.getCoins(), 0);
  assert.deepEqual(profile.addCoins(5), { total: 5, persisted: true });
  assert.equal(profile.addCoins(7).total, 12);
  assert.equal(createProfile(storage).getCoins(), 12);
});

test('corrupt profile data reads as zero coins', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, '{nope');
  assert.equal(createProfile(storage).getCoins(), 0);
});

test('high scores are sorted by distance and capped at the top 10', () => {
  const hs = createHighScores(memoryStorage());
  for (let i = 1; i <= MAX_ENTRIES + 3; i += 1) {
    hs.add({ name: `P${i}`, score: i * 10, distance: i * 10, coins: 0 }, i);
  }
  const list = hs.list();
  assert.equal(list.length, MAX_ENTRIES);
  assert.equal(list[0].distance, (MAX_ENTRIES + 3) * 10);
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].distance >= list[i].distance);
});

test('a run below the top 10 is not stored', () => {
  const hs = createHighScores(memoryStorage());
  for (let i = 1; i <= MAX_ENTRIES; i += 1) hs.add({ name: `P${i}`, score: 100 + i, distance: 100 + i, coins: 0 }, i);
  assert.deepEqual(hs.add({ name: 'low', score: 1, distance: 1, coins: 0 }, 99), { rank: 0, persisted: false });
});

test('a storage that refuses writes reports persisted: false', () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(createProfile(storage).addCoins(3).persisted, false);
  assert.equal(createHighScores(storage).add({ name: 'A', score: 4, distance: 4, coins: 0 }).persisted, false);
});

test('with no storage, nothing is persisted and reads are empty', () => {
  assert.equal(createProfile(null).getCoins(), 0);
  assert.deepEqual(createHighScores(null).list(), []);
});
