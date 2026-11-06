/**
 * Canvas renderer. World units are metres. The camera follows the car, the terrain is a
 * filled neon-edged polygon, and the car is drawn as vector shapes with spinning wheels.
 */
import { CAR } from '../physics/vehicle.js';

const VISIBLE_HEIGHT_M = 12;
const CYAN = '#00f5ff';
const MAGENTA = '#ff2d95';
const LIME = '#b8ff3b';
const GOLD = '#ffd44a';

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

    // Twinkle stars (deterministic per position)
    ctx.fillStyle = 'rgba(200, 220, 255, 0.5)';
    for (let i = 0; i < 40; i += 1) {
      const sx = (i * 137.5) % cssW;
      const sy = ((i * 61.3) % (cssH * 0.45)) + 4;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.3 + i));
      ctx.globalAlpha = tw;
      ctx.fillRect(sx, sy, 1.5, 1.5);
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
      const sx = cam.toX(coin.x);
      const sy = cam.toY(coin.y);
      const squash = Math.abs(Math.cos(t * 3 + coin.x));
      ctx.save();
      ctx.translate(sx, sy);
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

  function drawCar(car, cam) {
    const cs = Math.cos(car.angle);
    const sn = Math.sin(car.angle);
    const local = (lx, ly) => [cam.toX(car.x + cs * lx - sn * ly), cam.toY(car.y + sn * lx + cs * ly)];

    // Chassis body
    const body = [
      local(-CAR.halfW, -CAR.halfH),
      local(CAR.halfW, -CAR.halfH),
      local(CAR.halfW + 0.05, CAR.halfH),
      local(-CAR.halfW, CAR.halfH + 0.05),
    ];
    ctx.beginPath();
    body.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = '#16102e';
    ctx.fill();
    ctx.strokeStyle = MAGENTA;
    ctx.lineWidth = 3;
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = 14;
    ctx.stroke();

    // Cabin and window
    const cabin = [local(-0.5, CAR.halfH), local(-0.2, 0.75), local(0.55, 0.75), local(0.85, CAR.halfH)];
    ctx.beginPath();
    cabin.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = '#1d1640';
    ctx.fill();
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Wheels with spokes that turn with distance travelled
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
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(-w.rot) * r * 0.85, wy + Math.sin(-w.rot) * r * 0.85);
      ctx.strokeStyle = 'rgba(184, 255, 59, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function draw(run, time = performance.now() / 1000) {
    if (!cssW || !cssH) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = camera(run.car);
    drawBackground(time, cam);
    drawTerrain(run.terrain, cam);
    drawCoins(run, cam);
    drawCar(run.car, cam);
  }

  return { resize, draw };
}
