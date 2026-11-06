/**
 * Far background scenery: small bushes and trees on a distant parallax layer.
 * Items live in "far" coordinates (scrolled at PARALLAX of the camera) and are drawn above
 * the horizon line, behind the terrain. The renderer also skips any item that would sit
 * under the track, so scenery is never on the hill or the road.
 */
import { createRng } from '../physics/rng.js';

export const PARALLAX = 0.35;
const BUCKET = 9; // far-layer metres per placement bucket

/** Deterministic items for one bucket. Same seed and bucket always give the same items. */
export function itemsInBucket(seed, bucket) {
  const rng = createRng((seed ^ Math.imul(bucket + 1, 0x85ebca6b)) >>> 0);
  const items = [];
  const count = rng() < 0.7 ? 1 : 2;
  for (let i = 0; i < count; i += 1) {
    items.push({
      u: bucket * BUCKET + rng() * BUCKET, // far-layer position, metres
      kind: rng() < 0.55 ? 'bush' : 'tree',
      scale: 0.7 + rng() * 0.6,
      tint: rng(), // 0..1, picks a shade of green
    });
  }
  return items;
}

/** Items whose far-layer position lies in [u0, u1]. */
export function sceneryBetween(seed, u0, u1) {
  const out = [];
  for (let b = Math.floor(u0 / BUCKET); b <= Math.floor(u1 / BUCKET); b += 1) {
    for (const item of itemsInBucket(seed, b)) {
      if (item.u >= u0 && item.u <= u1) out.push(item);
    }
  }
  return out;
}

/**
 * True when a scenery item's base sits clearly above the track on screen.
 * baseY and trackY are screen y values (y grows downward); a larger trackY is lower on screen.
 */
export function isClearOfTrack(baseY, trackY, margin = 4) {
  return baseY < trackY - margin;
}
