/**
 * Bootstrap: wires the session (3 attempts), run, loop, renderer, input, engine sound,
 * router, and UI together. Every change to saved data goes through the command router.
 */
import { createRun, stepRun } from './game/run.js';
import { createSessionController } from './game/session.js';
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
  panels: {
    menu: $('#panel-menu'),
    paused: $('#panel-paused'),
    attempt: $('#panel-attempt'),
    final: $('#panel-final'),
  },
  difficultyButtons: [...document.querySelectorAll('[data-difficulty]')],
  hudDist: $('#hud-dist'),
  hudCoins: $('#hud-coins'),
  hudGear: $('#hud-gear'),
  hudAttempt: $('#hud-attempt'),
  hudTilt: $('#hud-tilt'),
  dashDist: $('#dash-dist'),
  dashCoins: $('#dash-coins'),
  dashGear: $('#dash-gear'),
  dashBest: $('#dash-best'),
  dashAttempt: $('#dash-attempt'),
  leaderboard: $('#leaderboard'),
  soundButton: $('#btn-sound'),
  pauseButton: $('#btn-pause'),
  attemptTitle: $('#attempt-title'),
  attemptSummary: $('#attempt-summary'),
  finalTitle: $('#final-title'),
  finalSummary: $('#final-summary'),
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
const sessions = createSessionController(randomSeed);

/** @type {'menu' | 'running' | 'paused' | 'attempt' | 'final'} */
let mode = 'menu';
let run = null;
let summary = null; // session summary after the latest attempt
let chosenDifficulty = 'easy';
let runSaved = false;
let engineInfo = { gear: 0, rpm: 800, hz: 35 };
let bestDistance = 0;
let sessionBestDistance = 0; // best distance in the current session, shown before any save
let hudKey = '';

const commands = createGameCommands({
  session: {
    start: (opts) => sessions.start(opts),
    replay: () => sessions.replay(),
    finishAttempt: (attempt) => {
      summary = sessions.finishAttempt(attempt);
      return summary;
    },
  },
  profile,
  highScores,
});

function dispatch(name, payload) {
  const result = commands.dispatch(name, payload);
  if (!result.ok) console.warn(`[${name}] ${result.error.code}: ${result.error.message}`);
  return result;
}

function showPanel(name) {
  dom.overlay.hidden = !name;
  for (const [key, el] of Object.entries(dom.panels)) el.hidden = key !== name;
}

function beginAttempt() {
  const session = sessions.current;
  run = createRun({ seed: session.seed, difficulty: session.difficulty });
  runSaved = false;
  mode = 'running';
  renderer.resize();
  showPanel(null);
}

function startSession() {
  dispatch('game.start', { difficulty: chosenDifficulty });
  beginAttempt();
  engine.start().catch(() => {});
}

function openMenu() {
  mode = 'menu';
  run = createRun({ seed: randomSeed(), difficulty: chosenDifficulty }); // attract view, not stepped
  showPanel('menu');
  refreshMenu();
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

function describeRun(r) {
  return `${r.distance} m · ${r.runCoins} coins`;
}

/** Called when a run crashes: records the attempt, saves coins, and shows the result. */
function finishAttempt() {
  if (!runSaved) {
    runSaved = true;
    const result = dispatch('game.finishAttempt', { distance: run.distance, coins: run.runCoins });
    if (!result.ok) return;
    dispatch('game.saveCoins', { coins: run.runCoins });
  }
  sessionBestDistance = Math.max(sessionBestDistance, summary.bestDistance);
  refreshLeaderboard();
  if (summary.over) {
    mode = 'final';
    dom.finalTitle.textContent = 'Session over';
    dom.finalSummary.innerHTML = '';
    const lines = summary.attempts.map(
      (a) => `Attempt ${a.n}: ${a.distance} m · ${a.coins} coins · ${a.score} pts`,
    );
    lines.push(`Total: ${summary.total} pts`);
    lines.push(`Best attempt: ${summary.best.score} pts`);
    for (const text of lines) {
      const p = document.createElement('p');
      p.textContent = text;
      dom.finalSummary.append(p);
    }
    dom.saveButton.disabled = false;
    dom.saveStatus.textContent = '';
    showPanel('final');
  } else {
    mode = 'attempt';
    const a = summary.attempts[summary.attempts.length - 1];
    dom.attemptTitle.textContent = `Attempt ${a.n} over`;
    dom.attemptSummary.textContent = `${describeRun(run)} · ${a.score} pts · ${summary.remaining} left`;
    showPanel('attempt');
  }
}

function nextAttempt() {
  beginAttempt();
}

function replaySession() {
  dispatch('game.replaySession', {});
  beginAttempt();
}

function newGame() {
  startSession();
}

function saveScore() {
  const result = dispatch('game.saveHighScore', {
    score: summary.total,
    distance: summary.bestDistance,
    coins: summary.totalCoins,
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

function refreshMenu() {
  for (const btn of dom.difficultyButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.difficulty === chosenDifficulty));
  }
}

function refreshLeaderboard() {
  const entries = highScores.list();
  bestDistance = Math.max(entries[0]?.distance ?? 0, sessionBestDistance);
  const items = entries.map((e, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${e.name}`;
    const score = document.createElement('span');
    score.textContent = `${e.score} pts`;
    li.append(name, score);
    return li;
  });
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No scores yet';
    items.push(empty);
  }
  dom.leaderboard.replaceChildren(...items);
}

function updateTilt() {
  if (!run) return;
  const warn = run.tuning.warnAngle;
  const deg = Math.round(Math.abs(run.pitch) * 57.2958);
  const tilting = Math.abs(run.pitch) > warn;
  dom.hudTilt.hidden = !tilting;
  if (tilting) {
    dom.hudTilt.textContent = run.pitch > 0 ? `⚠ Nose up ${deg}°` : `⚠ Nose down ${deg}°`;
  }
}

function updateHud() {
  if (!run) return;
  const done = sessions.current?.attempts.length ?? 0;
  // While running, the label shows the attempt in progress (1-based); otherwise the last one finished.
  const label = `${mode === 'running' ? done + 1 : done}/3`;
  const key = `${run.distance}|${run.runCoins}|${engineInfo.gear}|${bestDistance}|${label}|${run.difficulty}`;
  if (key === hudKey) return;
  hudKey = key;
  dom.hudDist.textContent = run.distance;
  dom.hudCoins.textContent = run.runCoins;
  dom.hudGear.textContent = engineInfo.gear + 1;
  dom.hudAttempt.textContent = label;
  dom.dashDist.textContent = `${run.distance} m`;
  dom.dashCoins.textContent = run.runCoins;
  dom.dashGear.textContent = engineInfo.gear + 1;
  dom.dashBest.textContent = `${bestDistance} m`;
  dom.dashAttempt.textContent = `${label} · ${run.difficulty}`;
}

const loop = createGameLoop({
  fixedDt: FIXED_DT,
  update(dt) {
    if (mode !== 'running') return;
    stepRun(run, input.state(), dt);
    if (run.status === 'crashed') finishAttempt();
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
    updateTilt();
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
dom.difficultyButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    chosenDifficulty = btn.dataset.difficulty;
    refreshMenu();
    if (mode === 'menu') openMenu();
  }),
);
$('#btn-start').addEventListener('click', startSession);
$('#btn-next').addEventListener('click', nextAttempt);
$('#btn-replay').addEventListener('click', replaySession);
$('#btn-new').addEventListener('click', newGame);
$('#btn-resume').addEventListener('click', resume);
$('#btn-menu-paused').addEventListener('click', openMenu);
$('#btn-menu-final').addEventListener('click', openMenu);
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
