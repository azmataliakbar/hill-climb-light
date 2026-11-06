/**
 * Oscillator engine. No audio files: a sawtooth through a lowpass filter, pitched from
 * simulated engine RPM. The pure functions are exported so the mapping can be tested
 * without an AudioContext.
 */

export const WHEEL_RADIUS = 0.35;
export const FINAL_DRIVE = 1;
// Overall ratios (gear x final drive). Gear 0 is first.
export const GEAR_RATIOS = Object.freeze([9.0, 6.2, 4.4, 3.4, 2.7]);
export const IDLE_RPM = 800;
export const MAX_RPM = 7000;
const UPSHIFT_RPM = 5600;
const DOWNSHIFT_RPM = 1800;

export function rpmFor(speed, gear) {
  const rps = Math.abs(speed) / (2 * Math.PI * WHEEL_RADIUS);
  const rpm = rps * 60 * GEAR_RATIOS[gear] * FINAL_DRIVE;
  return Math.min(MAX_RPM, Math.max(IDLE_RPM, rpm));
}

/** Automatic gearbox with hysteresis: shifts at most one gear per call. */
export function pickGear(speed, gear) {
  if (rpmFor(speed, gear) > UPSHIFT_RPM && gear < GEAR_RATIOS.length - 1) return gear + 1;
  if (rpmFor(speed, gear) < DOWNSHIFT_RPM && gear > 0) return gear - 1;
  return gear;
}

/** Fundamental frequency in Hz. Throttle adds a small upward warp. */
export function engineHz(rpm, throttle) {
  const t = Math.min(1, Math.max(0, (rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM)));
  const base = 35 + t * 190;
  return base * (1 + 0.08 * Math.min(1, Math.max(0, throttle)));
}

export function createEngineSound(AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext) {
  let ctx = null;
  let osc = null;
  let filter = null;
  let gain = null;
  let gear = 0;
  let muted = false;

  return {
    get supported() {
      return !!AudioCtor;
    },
    /** Must be called from a user gesture (click or tap) on mobile and desktop browsers. */
    async start() {
      if (!AudioCtor) return false;
      if (!ctx) {
        ctx = new AudioCtor();
        osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start();
      }
      if (ctx.state === 'suspended') await ctx.resume();
      return true;
    },
    /** Takes the car's speed (m/s) and throttle (0..1). Returns the engine state for the dashboard. */
    update({ speed, throttle }) {
      gear = pickGear(speed, gear);
      const rpm = rpmFor(speed, gear);
      const hz = engineHz(rpm, throttle);
      const info = { gear, rpm, hz };
      if (!ctx) return info;
      const t = ctx.currentTime;
      osc.frequency.setTargetAtTime(hz, t, 0.05);
      filter.frequency.setTargetAtTime(600 + throttle * 1400, t, 0.1);
      gain.gain.setTargetAtTime(muted ? 0 : 0.04 + 0.06 * throttle, t, 0.1);
      return info;
    },
    setMuted(value) {
      muted = !!value;
    },
    get muted() {
      return muted;
    },
    gear() {
      return gear;
    },
  };
}
