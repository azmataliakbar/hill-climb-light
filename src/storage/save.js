/**
 * Save data under the namespace "hcl.v1." so it cannot collide with other apps on the same origin.
 * Every storage access is guarded, because storage can be unavailable or hold corrupt data.
 */

export const NAMESPACE = 'hcl.v1';
export const PROFILE_KEY = `${NAMESPACE}.profile`;
export const HIGHSCORE_KEY = `${NAMESPACE}.highscores`;
export const SCHEMA_VERSION = 1;
export const MAX_ENTRIES = 10;
export const NAME_MAX = 12;
const MAX_COINS = 1_000_000_000;

export function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readVersioned(storage, key) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null');
    return parsed && parsed.v === SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeVersioned(storage, key, body) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ v: SCHEMA_VERSION, ...body }));
    return true;
  } catch {
    return false;
  }
}

export function createProfile(storage = null) {
  const getCoins = () => {
    const parsed = readVersioned(storage, PROFILE_KEY);
    const coins = parsed?.coins;
    return Number.isInteger(coins) && coins >= 0 ? Math.min(coins, MAX_COINS) : 0;
  };
  return {
    getCoins,
    /** Adds whole coins to the balance. Returns {total, persisted}. */
    addCoins(amount) {
      const total = Math.min(MAX_COINS, getCoins() + amount);
      const persisted = writeVersioned(storage, PROFILE_KEY, { coins: total });
      return { total, persisted };
    },
  };
}

export function sanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.distance) && e.distance >= 0)
    .map((e) => {
      const coins = Number.isInteger(e.coins) && e.coins >= 0 ? e.coins : 0;
      const distance = Math.floor(e.distance);
      return {
        name: e.name.slice(0, NAME_MAX),
        score: Number.isInteger(e.score) && e.score >= 0 ? e.score : distance + coins * 10,
        distance,
        coins,
        at: Number.isFinite(e.at) ? e.at : 0,
      };
    })
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_ENTRIES);
}

export function createHighScores(storage = null) {
  const read = () => sanitizeEntries(readVersioned(storage, HIGHSCORE_KEY)?.entries);
  return {
    list: read,
    /** Returns {rank, persisted}. Ranked by score. rank is 0 when the entry misses the top list. */
    add({ name, score, distance, coins }, now = Date.now()) {
      const existing = read();
      const s = Math.floor(score);
      const rank = existing.filter((e) => e.score >= s).length + 1;
      if (rank > MAX_ENTRIES) return { rank: 0, persisted: false };
      const entries = sanitizeEntries([
        ...existing,
        {
          name: name || 'PLAYER',
          score: s,
          distance: Math.floor(distance),
          coins: Math.max(0, Math.floor(coins)),
          at: now,
        },
      ]);
      return { rank, persisted: writeVersioned(storage, HIGHSCORE_KEY, { entries }) };
    },
  };
}
