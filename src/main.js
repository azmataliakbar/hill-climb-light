/**
 * Bootstrap: wires the run, loop, renderer, input, engine sound, router, and UI together.
 * Every UI action that changes saved data goes through the command router.
 */
import { createRun, stepRun } from './game/run.js';
import { createGameLoop } from './engine/loop.js';
import { createRenderer } from './engine/renderer.js';
import { createInput } from './input/input.js';
import { createEngineSound } from './audio/engine-sound.js';
import { createGameCommands } from './router/commands.js';
import { createProfile, createHighScores, safeLocalStorage } from './storage/save.js';
import { drawDial } from './ui/dial.js';
import { randomSeed } from './physics/rng.js';

const FIXED_DT = 1 / 240;
const $ = (selector) => document.querySelector(selector);

const dom = {
  frame: $('#arena-frame'),
  canvas: $('#arena'),
  overlay: $('#overlay'),
  panels: { menu: $('#panel-menu'), paused: $('#panel-paused'), over: $('#panel-over') },
  hudDist: $('#hud-dist'),
  hudCoins: $('#hud-coins'),
  hudGear: $('#hud-gear'),
  dashDist: $('#dash-dist'),
  dashCoins: $('#dash-coins'),
  dashGear: $('#dash-gear'),
  dashBest: $('#dash-best'),
  leaderboard: $('#leaderboard'),
  soundButton: $('#btn-sound'),
  pauseButton: $('#btn-pause'),
  overSummary: $('#over-summary'),
  nameInput: $('#player-name'),
  saveButton: $('#btn-save'),
  saveStatus: $('#save-status'),
  pedals: [...document.querySelectorAll('[data-control]')],
  dialSpeed: $('#dial-speed'),
  dialRpm: $('#dial-rpm'),
};

const storage = safeLocalStorage();
const profile = createProfile(storage);
const highScores = createHighScores(storage);
const renderer = createRenderer(dom.canvas);
const input = createInput({ pedals: dom.pedals });
const engine = createEngineSound();

/** @type {'menu' | 'running' | 'paused' | 'over'} */
let mode = 'menu';
let run = null;
let runSaved = false;
let engineInfo = { gear: 0, rpm: 800, hz: 35 };
let bestDistance = 0;
let hudKey = '';

const session = {
  start({ seed } = {}) {
    beginRun(seed ?? randomSeed());
    return { seed: run.seed };
  },
};
const commands = createGameCommands({ session, profile, highScores });

function dispatch(name, payload) {
  const result = commands.dispatch(name, payload);
  if (!result.ok) console.warn(`[${name}] ${result.error.code}: ${result.error.message}`);
  return result;
}

function showPanel(name) {
  dom.overlay.hidden = !name;
  for (const [key, el] of Object.entries(dom.panels)) el.hidden = key !== name;
}

function beginRun(seed) {
  run = createRun({ seed });
  runSaved = false;
  mode = 'running';
  renderer.resize();
  showPanel(null);
}

function openMenu() {
  mode = 'menu';
  run = createRun({ seed: randomSeed() }); // attract view, not stepped
  showPanel('menu');
}

function pause() {
  if (mode !== 'running') return;
  mode = 'paused';
  showPanel('paused');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'running';
  showPanel(null);
}

function finishRun() {
  mode = 'over';
  if (!runSaved) {
    runSaved = true;
    dispatch('game.saveCoins', { coins: run.runCoins });
  }
  dom.overSummary.textContent = `${run.distance} m · ${run.runCoins} coins`;
  dom.saveButton.disabled = false;
  dom.saveStatus.textContent = '';
  refreshLeaderboard();
  showPanel('over');
}

function saveScore() {
  const result = dispatch('game.saveHighScore', {
    distance: run.distance,
    coins: run.runCoins,
    name: dom.nameInput.value,
  });
  if (!result.ok) {
    dom.saveStatus.textContent = 'Could not save score.';
    return;
  }
  const { rank, persisted } = result.data;
  dom.saveButton.disabled = true;
  if (rank === 0) dom.saveStatus.textContent = 'Not in the top 10, so it was not kept.';
  else if (persisted) dom.saveStatus.textContent = `Saved at rank #${rank}.`;
  else dom.saveStatus.textContent = `Rank #${rank}, but storage is unavailable so it will not persist.`;
  refreshLeaderboard();
}

function refreshLeaderboard() {
  const entries = highScores.list();
  bestDistance = entries[0]?.distance ?? 0;
  const items = entries.map((e, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${e.name}`;
    const score = document.createElement('span');
    score.textContent = `${e.distance} m · ${e.coins}c`;
    li.append(name, score);
    return li;
  });
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No runs yet';
    items.push(empty);
  }
  dom.leaderboard.replaceChildren(...items);
}

function updateHud() {
  if (!run) return;
  const key = `${run.distance}|${run.runCoins}|${engineInfo.gear}|${bestDistance}|${profile.getCoins()}`;
  if (key === hudKey) return;
  hudKey = key;
  dom.hudDist.textContent = run.distance;
  dom.hudCoins.textContent = run.runCoins;
  dom.hudGear.textContent = engineInfo.gear + 1;
  dom.dashDist.textContent = `${run.distance} m`;
  dom.dashCoins.textContent = run.runCoins;
  dom.dashGear.textContent = engineInfo.gear + 1;
  dom.dashBest.textContent = `${bestDistance} m`;
}

const loop = createGameLoop({
  fixedDt: FIXED_DT,
  update(dt) {
    if (mode !== 'running') return;
    stepRun(run, input.state(), dt);
    if (run.status === 'crashed') finishRun();
  },
  render() {
    if (run) renderer.draw(run);
    const car = run?.car;
    const speed = mode === 'running' && car ? car.vx : 0;
    const throttle = mode === 'running' && car ? car.throttle : 0;
    engineInfo = engine.update({ speed: Math.abs(speed), throttle });
    if (dom.dialSpeed.offsetParent !== null) {
      drawDial(dom.dialSpeed, { value: Math.abs(speed) * 3.6, max: 120, label: 'KM/H' });
      drawDial(dom.dialRpm, { value: engineInfo.rpm / 100, max: 70, label: 'RPM ×100', color: '#ff2d95' });
    }
    updateHud();
  },
});

async function toggleSound() {
  if (!engine.supported) return;
  if (!engine.muted) engine.setMuted(true);
  else {
    engine.setMuted(false);
    await engine.start();
  }
  dom.soundButton.textContent = engine.muted ? 'Sound off' : 'Sound on';
}

// Wiring
// Start the run first, so the game never waits on audio. Audio unlocks on the same gesture.
$('#btn-start').addEventListener('click', () => {
  dispatch('game.start', {});
  engine.start().catch(() => {});
});
$('#btn-again').addEventListener('click', () => {
  dispatch('game.start', {});
  engine.start().catch(() => {});
});
$('#btn-resume').addEventListener('click', resume);
$('#btn-menu-paused').addEventListener('click', openMenu);
$('#btn-menu-over').addEventListener('click', openMenu);
dom.saveButton.addEventListener('click', saveScore);
dom.pauseButton.addEventListener('click', () => (mode === 'running' ? pause() : resume()));
dom.soundButton.addEventListener('click', toggleSound);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'running') pause();
    else if (mode === 'paused') resume();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

new ResizeObserver(() => renderer.resize()).observe(dom.frame);
renderer.resize();
refreshLeaderboard();
openMenu();
loop.start();
