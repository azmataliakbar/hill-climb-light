/**
 * Keyboard and on-screen pedals write into one input state, so both can be used together.
 * Each pointer is tracked by pointerId, so multi-touch works.
 */

export const KEY_CONTROLS = Object.freeze({
  ArrowUp: 'gas',
  KeyW: 'gas',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'leanBack',
  KeyA: 'leanBack',
  ArrowRight: 'leanForward',
  KeyD: 'leanForward',
});

const CONTROLS = Object.freeze(['gas', 'brake', 'leanBack', 'leanForward']);

export function createInput({ target = globalThis, pedals = [] } = {}) {
  const keys = new Set();
  const pointers = new Map(); // pointerId -> control
  const cleanups = [];

  const on = (el, type, fn) => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };

  on(target, 'keydown', (e) => {
    if (!KEY_CONTROLS[e.code]) return;
    e.preventDefault();
    keys.add(e.code);
  });
  on(target, 'keyup', (e) => keys.delete(e.code));
  on(target, 'blur', () => {
    keys.clear();
    pointers.clear();
    refreshPedals();
  });

  const pedalEls = [...pedals];
  function refreshPedals() {
    for (const el of pedalEls) {
      const control = el.dataset.control;
      const active = [...pointers.values()].includes(control);
      el.classList.toggle('is-active', active);
    }
  }

  for (const el of pedalEls) {
    const control = el.dataset.control;
    const press = (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, control);
      refreshPedals();
    };
    const release = (e) => {
      pointers.delete(e.pointerId);
      refreshPedals();
    };
    on(el, 'pointerdown', press);
    on(el, 'pointerup', release);
    on(el, 'pointercancel', release);
    on(el, 'lostpointercapture', release);
    on(el, 'contextmenu', (e) => e.preventDefault());
  }

  const held = (control) => {
    for (const code of keys) if (KEY_CONTROLS[code] === control) return true;
    for (const c of pointers.values()) if (c === control) return true;
    return false;
  };

  return {
    /** Returns the current booleans for the car: {gas, brake, leanBack, leanForward}. */
    state() {
      const s = {};
      for (const c of CONTROLS) s[c] = held(c);
      return s;
    },
    destroy() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
