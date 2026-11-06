/**
 * Canvas renderer. World units are metres. The camera follows the car, the terrain is a
 * filled neon-edged polygon, and the car is drawn as vector shapes with spinning wheels.
 * Far scenery (bushes and small trees) sits on a parallax layer behind the terrain.
 */
import { CAR } from '../physics/vehicle.js';
import { PARALLAX, sceneryBetween, isClearOfTrack } from '../game/scenery.js';

const VISIBLE_HEIGHT_M = 12;
const CYAN = '#00f5ff';
const MAGENTA = '#ff2d95';
const LIME = '#b8ff3b';
const GOLD = '#ffd44a';
const LEAF_A = '#2fbf71';
const LEAF_B = '#1d7a4a';
const TRUNK = '#5a3d2b';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
    cssW = rect.width;
    cssH = rect.height;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  function camera(car) {
    const scale = cssH / VISIBLE_HEIGHT_M;
    const left = car.x - (cssW / scale) * 0.35;
    const centreY = car.y + 1.5;
    return {
      scale,
      toX: (x) => (x - left) * scale,
      toY: (y) => cssH / 2 - (y - centreY) * scale,
      left,
      right: left + cssW / scale,
    };
  }

  function drawBackground(time, cam) {
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, '#120a2e');
    g.addColorStop(0.6, '#070418');
    g.addColorStop(1, '#030209');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    // Parallax far hills for depth
    ctx.fillStyle = 'rgba(255, 45, 149, 0.10)';
    ctx.beginPath();
    ctx.moveTo(0, cssH);
    for (let px = 0; px <= cssW; px += 8) {
      const wx = cam.left * 0.5 + (px / cam.scale) * 0.5;
      const y = cssH * 0.55 - Math.sin(wx * 0.05) * cssH * 0.08 - Math.sin(wx * 0.13 + 1.3) * cssH * 0.04;
      ctx.lineTo(px, y);
    }
    ctx.lineTo(cssW, cssH);
    ctx.closePath();
    ctx.fill();

    // Twinkle stars
    ctx.fillStyle = 'rgba(200, 220, 255, 0.5)';
    for (let i = 0; i < 40; i += 1) {
      const sx = (i * 137.5) % cssW;
      const sy = ((i * 61.3) % (cssH * 0.4)) + 4;
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.3 + i));
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  /** Far-layer bushes and small trees. Skipped wherever they would sit on the track. */
  function drawScenery(run, cam) {
    const u0 = cam.left * PARALLAX;
    const u1 = u0 + cssW / cam.scale;
    const baseY = cssH * 0.47;
    const k = cssH / 420; // scale sprites with the arena height
    for (const item of sceneryBetween(run.seed, u0, u1)) {
      const sx = (item.u - u0) * cam.scale;
      const wx = cam.left + sx / cam.scale;
      const trackY = cam.toY(run.terrain.height(wx));
      if (!isClearOfTrack(baseY, trackY)) continue;

      ctx.globalAlpha = 0.45 + 0.25 * item.tint;
      if (item.kind === 'tree') {
        const h = (22 + 14 * item.scale) * k;
        ctx.fillStyle = TRUNK;
        ctx.fillRect(sx - 1.5 * k, baseY - h * 0.3, 3 * k, h * 0.3);
        ctx.fillStyle = item.tint > 0.5 ? LEAF_A : LEAF_B;
        for (let t = 0; t < 2; t += 1) {
          const top = baseY - h * (0.45 + t * 0.35);
          const half = (7 - t * 2) * item.scale * k;
          ctx.beginPath();
          ctx.moveTo(sx, top - h * 0.45);
          ctx.lineTo(sx + half, top);
          ctx.lineTo(sx - half, top);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        const r = (5 + 4 * item.scale) * k;
        ctx.fillStyle = item.tint > 0.5 ? LEAF_A : LEAF_B;
        for (const [dx, dy, rr] of [[-r, 0, 0.9], [0, -r * 0.4, 1.1], [r, 0, 0.9]]) {
          ctx.beginPath();
          ctx.arc(sx + dx, baseY + dy, r * rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTerrain(terrain, cam) {
    const step = 0.2;
    const pts = [];
    for (let x = cam.left; x <= cam.right + step; x += step) {
      pts.push([cam.toX(x), cam.toY(terrain.height(x))]);
    }
    const fillGrad = ctx.createLinearGradient(0, cssH * 0.3, 0, cssH);
    fillGrad.addColorStop(0, 'rgba(0, 245, 255, 0.22)');
    fillGrad.addColorStop(1, 'rgba(10, 4, 30, 0.95)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], cssH);
    for (const [px, py] of pts) ctx.lineTo(px, py);
    ctx.lineTo(pts[pts.length - 1][0], cssH);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawCoins(run, cam) {
    const t = performance.now() / 1000;
    for (const coin of run.coins) {
      if (coin.taken || coin.x < cam.left - 1 || coin.x > cam.right + 1) continue;
      const squash = Math.abs(Math.cos(t * 3 + coin.x));
      ctx.save();
      ctx.translate(cam.toX(coin.x), cam.toY(coin.y));
      ctx.scale(Math.max(0.15, squash), 1);
      ctx.beginPath();
      ctx.arc(0, 0, cam.scale * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = GOLD;
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
  }

  function drawCar(car, cam, time) {
    const cs = Math.cos(car.angle);
    const sn = Math.sin(car.angle);
    // Chassis-local point to screen
    const local = (lx, ly) => [cam.toX(car.x + cs * lx - sn * ly), cam.toY(car.y + sn * lx + cs * ly)];
    const path = (pts, close = true) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (close) ctx.closePath();
    };

    // Exhaust puffs behind the car while the throttle is on
    if (car.throttle > 0.2) {
      for (let i = 0; i < 3; i += 1) {
        const life = (time * 2 + i / 3) % 1;
        const [ex, ey] = local(-1.2 - life * 0.6, -0.1 + life * 0.25);
        ctx.globalAlpha = (1 - life) * 0.35 * car.throttle;
        ctx.fillStyle = '#cfd6ff';
        ctx.beginPath();
        ctx.arc(ex, ey, cam.scale * (0.08 + life * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Lower body with a sloped nose and rear
    path([
      local(-1.05, -0.25),
      local(1.12, -0.25),
      local(1.18, -0.02),
      local(0.92, 0.2),
      local(-0.92, 0.2),
      local(-1.08, 0.02),
    ]);
    ctx.fillStyle = '#16102e';
    ctx.fill();
    ctx.strokeStyle = MAGENTA;
    ctx.lineWidth = 3;
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Cabin with sloped windscreen and glass
    path([local(-0.55, 0.2), local(-0.25, 0.72), local(0.45, 0.72), local(0.82, 0.2)]);
    ctx.fillStyle = '#1d1640';
    ctx.fill();
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.stroke();
    path([local(-0.45, 0.24), local(-0.22, 0.64), local(0.4, 0.64), local(0.72, 0.24)]);
    ctx.fillStyle = 'rgba(0, 245, 255, 0.18)';
    ctx.fill();

    // Roll cage and door line
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 45, 149, 0.8)';
    ctx.lineWidth = 1.5;
    path([local(-0.25, 0.72), local(-0.3, 0.2)], false);
    ctx.stroke();
    path([local(0.45, 0.72), local(0.5, 0.2)], false);
    ctx.stroke();
    path([local(-0.9, -0.05), local(0.95, -0.05)], false);
    ctx.stroke();

    // Rear spoiler
    path([local(-1.0, 0.2), local(-1.08, 0.5)], false);
    ctx.strokeStyle = MAGENTA;
    ctx.lineWidth = 2;
    ctx.stroke();
    path([local(-1.25, 0.46), local(-0.92, 0.46), local(-0.92, 0.54), local(-1.25, 0.54)]);
    ctx.fillStyle = MAGENTA;
    ctx.fill();

    // Headlight glow at the nose
    const [hx, hy] = local(1.1, -0.02);
    ctx.beginPath();
    ctx.arc(hx, hy, cam.scale * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6c2';
    ctx.shadowColor = '#fff6c2';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Wheels: tyre, rim, hub and spokes that turn with distance travelled
    for (const w of car.wheels) {
      const wx = cam.toX(w.x);
      const wy = cam.toY(w.y);
      const r = CAR.wheelRadius * cam.scale;
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#05030f';
      ctx.fill();
      ctx.strokeStyle = LIME;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(wx, wy, r * 0.6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(184, 255, 59, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (let s = 0; s < 4; s += 1) {
        const a = -w.rot + (s * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + Math.cos(a) * r * 0.58, wy + Math.sin(a) * r * 0.58);
        ctx.strokeStyle = 'rgba(184, 255, 59, 0.7)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(wx, wy, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = LIME;
      ctx.fill();
    }
  }

  function draw(run, time = performance.now() / 1000) {
    if (!cssW || !cssH) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = camera(run.car);
    drawBackground(time, cam);
    drawScenery(run, cam);
    drawTerrain(run.terrain, cam);
    drawCoins(run, cam);
    drawCar(run.car, cam, time);
  }

  return { resize, draw };
}
