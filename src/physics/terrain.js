/**
 * Infinite procedural terrain: a sum of sine waves at several frequencies.
 * Low frequencies give rolling hills and high frequencies give jagged ridges.
 * The function is defined for every x, so there is no chunk seam and no generation cost.
 * The slope is the analytic derivative, so the ground normal is exact.
 */
import { createRng } from './rng.js';

const OCTAVES = Object.freeze([
  { a: 2.6, f: 0.045 }, // rolling hills
  { a: 1.1, f: 0.11 },
  { a: 0.35, f: 0.29 }, // ridges
  { a: 0.09, f: 0.71 }, // jagged detail
]);

const FLAT_START = 25; // metres of flat road under the spawn point

const smooth = (t) => t * t * (3 - 2 * t);
const smoothDeriv = (t) => 6 * t - 6 * t * t;

export function createTerrain(seed) {
  const rng = createRng(seed);
  const phases = OCTAVES.map(() => rng() * Math.PI * 2);

  // Blend weight: 0 on the flat start, ramping smoothly to 1 at FLAT_START.
  const blend = (x) => smooth(Math.min(1, Math.max(0, x / FLAT_START)));
  const blendDeriv = (x) => {
    if (x <= 0 || x >= FLAT_START) return 0;
    return smoothDeriv(x / FLAT_START) / FLAT_START;
  };

  function raw(x) {
    let y = 0;
    for (let i = 0; i < OCTAVES.length; i += 1) y += OCTAVES[i].a * Math.sin(OCTAVES[i].f * x + phases[i]);
    return y;
  }
  function rawSlope(x) {
    let s = 0;
    for (let i = 0; i < OCTAVES.length; i += 1) {
      s += OCTAVES[i].a * OCTAVES[i].f * Math.cos(OCTAVES[i].f * x + phases[i]);
    }
    return s;
  }

  return {
    seed,
    height(x) {
      return blend(x) * raw(x);
    },
    slope(x) {
      return blendDeriv(x) * raw(x) + blend(x) * rawSlope(x);
    },
  };
}
