/**
 * Synthesised sound: engine hum, brake squeal, and short effects (coin, crash, gear).
 * No audio files. The pure functions (gears, pitch, levels) are exported for tests.
 *
 * Output chain: voices -> master gain -> compressor -> level meter -> speakers.
 * The compressor lets the sound be loud without clipping.
 */

export const WHEEL_RADIUS = 0.35;
export const GEAR_COUNT = 5;
export const STOP_SPEED = 0.3; // m/s below which the display shows 0 (stopped)
export const IDLE_RPM = 800;
export const MAX_RPM = 7000;
const TARGET_RPM = 5000; // RPM at the speed where each gear is reached

/** Speed (m/s) at which each gear is reached at full RPM: gear 1..5. */
export const GEAR_TOP_MPS = Object.freeze([6, 11, 16, 21, 27]);
/** Speed above which the gearbox moves from gear i+1 to gear i+2 (i = 0..3). */
export const SHIFT_UP_MPS = Object.freeze(GEAR_TOP_MPS.slice(0, -1));
/** Downshift when speed falls below this fraction of the shift-up speed. */
const DOWN_FRACTION = 0.8;

const RPM_PER_MPS = 60 / (2 * Math.PI * WHEEL_RADIUS); // rpm per (m/s x overall ratio)
/** Overall ratio per gear, so RPM is TARGET_RPM when the car reaches that gear's top speed. */
export const GEAR_RATIOS = Object.freeze(GEAR_TOP_MPS.map((v) => TARGET_RPM / (RPM_PER_MPS * v)));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Gear index 0..4 for a speed. Shifts up or down as far as the speed requires. */
export function gearIndexFor(speed, current = 0) {
  let g = clamp(current, 0, GEAR_COUNT - 1);
  while (g < GEAR_COUNT - 1 && speed > SHIFT_UP_MPS[g]) g += 1;
  while (g > 0 && speed < SHIFT_UP_MPS[g - 1] * DOWN_FRACTION) g -= 1;
  return g;
}

/** What the dashboard shows: 0 when stopped, otherwise 1..5. */
export function displayGear(speed, gearIndex) {
  return Math.abs(speed) < STOP_SPEED ? 0 : gearIndex + 1;
}

export function rpmFor(speed, gearIndex) {
  const rpm = Math.abs(speed) * RPM_PER_MPS * GEAR_RATIOS[clamp(gearIndex, 0, GEAR_COUNT - 1)];
  return clamp(rpm, IDLE_RPM, MAX_RPM);
}

/** Fundamental pitch in Hz. Throttle adds a small upward warp. */
export function engineHz(rpm, throttle) {
  const t = clamp((rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0, 1);
  return (55 + t * 240) * (1 + 0.08 * clamp(throttle, 0, 1));
}

/** All engine voice settings for one moment. Gains are before the master volume. */
export function engineParams({ speed, throttle, brake, gearIndex }) {
  const rpm = rpmFor(speed, gearIndex);
  const t = (rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM);
  const thr = clamp(throttle, 0, 1);
  return {
    rpm,
    hz: engineHz(rpm, thr),
    engineGain: clamp(0.3 + 0.35 * thr + 0.1 * t, 0, 0.8),
    filterHz: 500 + thr * 1800 + t * 800,
    brakeGain: brake && Math.abs(speed) > 2 ? 0.3 * clamp(Math.abs(speed) / 15, 0, 1) : 0,
  };
}

/** Maps the volume slider (0..1) to the master gain. Kept below 1 to leave headroom. */
export function masterGain(volume, muted = false) {
  return muted ? 0 : clamp(volume, 0, 1) * 0.9;
}

/** Root mean square of time-domain samples (bytes centred on 128), scaled to 0..1. */
export function rmsOfBytes(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, bytes.length));
}

export function createEngineSound({ AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ctx = null;
  let nodes = null;
  let gearIndex = 0;
  let volume = 0.8;
  let muted = false;

  function build() {
    ctx = new AudioCtor();
    const master = ctx.createGain();
    master.gain.value = masterGain(volume, muted);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 6;
    compressor.ratio.value = 6;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(compressor).connect(analyser).connect(ctx.destination);

    // Engine: sawtooth and detuned square, through a lowpass
    const engineMix = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 1.2;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const square = ctx.createOscillator();
    square.type = 'square';
    const sawLevel = ctx.createGain();
    sawLevel.gain.value = 0.6;
    const squareLevel = ctx.createGain();
    squareLevel.gain.value = 0.25;
    saw.connect(sawLevel).connect(engineMix);
    square.connect(squareLevel).connect(engineMix);
    engineMix.connect(lowpass).connect(engineGain).connect(master);
    saw.start();
    square.start();

    // Brake squeal: band-passed white noise
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const squealBand = ctx.createBiquadFilter();
    squealBand.type = 'bandpass';
    squealBand.frequency.value = 2200;
    squealBand.Q.value = 3;
    const brakeGain = ctx.createGain();
    brakeGain.gain.value = 0;
    noise.connect(squealBand).connect(brakeGain).connect(master);
    noise.start();

    nodes = { master, analyser, saw, square, lowpass, engineGain, squealBand, brakeGain, noiseBuffer };
  }

  function apply(params) {
    const t = ctx.currentTime;
    nodes.saw.frequency.setTargetAtTime(params.hz, t, 0.04);
    nodes.square.frequency.setTargetAtTime(params.hz * 1.005, t, 0.04);
    nodes.lowpass.frequency.setTargetAtTime(params.filterHz, t, 0.1);
    nodes.engineGain.gain.setTargetAtTime(params.engineGain, t, 0.08);
    nodes.brakeGain.gain.setTargetAtTime(params.brakeGain, t, 0.05);
  }

  /** Short one-shot tone or burst at the current time. */
  function blip(freq, startOffset, duration, type = 'sine', gain = 0.35) {
    const t = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(env).connect(nodes.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function noiseBurst(duration, filterType, fromHz, toHz, gain) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = nodes.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(env).connect(nodes.master);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  return {
    get supported() {
      return !!AudioCtor;
    },
    get state() {
      return ctx ? ctx.state : 'none';
    },
    get running() {
      return !!ctx && ctx.state === 'running';
    },
    /** Call from a user gesture (click or tap). Returns true when audio is running. */
    async start() {
      if (!AudioCtor) return false;
      if (!ctx) build();
      if (ctx.state !== 'running') {
        try {
          await ctx.resume();
        } catch {
          return false;
        }
      }
      return ctx.state === 'running';
    },
    setVolume(v) {
      volume = clamp(v, 0, 1);
      if (nodes) nodes.master.gain.setTargetAtTime(masterGain(volume, muted), ctx.currentTime, 0.05);
    },
    get volume() {
      return volume;
    },
    setMuted(value) {
      muted = !!value;
      if (nodes) nodes.master.gain.setTargetAtTime(masterGain(volume, muted), ctx.currentTime, 0.05);
    },
    get muted() {
      return muted;
    },
    /**
     * Call every frame. Returns what the dashboard shows: gear 0..5, RPM and pitch.
     */
    update({ speed = 0, throttle = 0, brake = false } = {}) {
      gearIndex = gearIndexFor(speed, gearIndex);
      const params = engineParams({ speed, throttle, brake, gearIndex });
      if (nodes) apply(params);
      return { gear: displayGear(speed, gearIndex), rpm: params.rpm, hz: params.hz };
    },
    /** Short sound effect: 'coin', 'crash', 'gear'. Ignored until audio is running. */
    play(name) {
      if (!nodes || ctx.state !== 'running') return;
      if (name === 'coin') {
        blip(880, 0, 0.12);
        blip(1320, 0.08, 0.2);
      } else if (name === 'crash') {
        noiseBurst(0.7, 'lowpass', 1400, 80, 0.9);
        blip(110, 0, 0.5, 'sine', 0.9);
        blip(45, 0.05, 0.6, 'sine', 0.8);
      } else if (name === 'gear') {
        noiseBurst(0.04, 'bandpass', 3200, 1800, 0.25);
      }
    },
    /** Output loudness 0..1 (RMS), for checking the sound is loud enough. */
    level() {
      if (!nodes) return 0;
      const bytes = new Uint8Array(nodes.analyser.fftSize);
      nodes.analyser.getByteTimeDomainData(bytes);
      return rmsOfBytes(bytes);
    },
  };
}
