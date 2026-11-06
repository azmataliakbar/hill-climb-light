/**
 * Two-wheel rigid-body car. Units are metres, seconds, kilograms, newtons.
 *
 * - Chassis: rigid body with mass, inertia, position, angle and angular velocity.
 * - Each wheel is a particle joined to its chassis attachment point by a
 *   body-frame spring-damper (Hooke's law with damping). This suspension makes the car
 *   bounce, tilt and flip. Vertical stiffness is set separately from axle stiffness.
 * - Ground contact is a penalty spring along the terrain normal. Drive, brake and rolling
 *   resistance are tangential forces, capped by friction mu * normal force.
 * - Semi-implicit Euler integration at a fixed step.
 */

export const CAR = Object.freeze({
  mass: 300,
  halfW: 1.0,
  halfH: 0.2,
  gravity: 9.81,
  wheelRadius: 0.35,
  wheelMass: 20,
  restLength: 0.45, // wheel-centre distance below its attachment point at rest
  springY: 20000, // suspension stiffness, N/m (vertical, body frame)
  springX: 50000, // axle stiffness, N/m (longitudinal, body frame)
  dampY: 1800,
  dampX: 1500,
  groundK: 60000, // tyre/ground penalty stiffness
  groundC: 1200,
  mu: 1.0, // friction coefficient
  driveForce: 1500, // N at the driven wheel when throttle = 1
  brakeForce: 2500, // N cap of the brake
  brakeDamp: 800, // N s/m, brake response before the cap
  rollDamp: 4, // N s/m, rolling resistance
  aeroK: 2.0, // N s^2/m^2, quadratic air drag (top speed ~27 m/s)
  leanTorque: 250, // N m, air tilt torque
  throttleRate: 6, // 1/s, throttle ramp
});

export const CHASSIS_INERTIA = CAR.mass * ((2 * CAR.halfW) ** 2 + (2 * CAR.halfH) ** 2) / 12;

// Attachment points in the chassis frame. Rear wheel is driven.
const ATTACH = Object.freeze([
  { x: -0.95, y: -0.1, drive: true },
  { x: 0.95, y: -0.1, drive: false },
]);

export function createCar(terrain, x0 = 0) {
  const y0 = terrain.height(x0) + CAR.wheelRadius + CAR.restLength + 0.2;
  return {
    x: x0,
    y: y0,
    vx: 0,
    vy: 0,
    angle: 0,
    omega: 0,
    throttle: 0,
    crashed: false,
    wheels: ATTACH.map((a) => ({
      x: x0 + a.x,
      y: y0 + a.y - CAR.restLength,
      vx: 0,
      vy: 0,
      rot: 0,
      drive: a.drive,
    })),
  };
}

/** Ground frame at x: unit normal, unit tangent (pointing toward +x), and surface height. */
export function groundFrame(terrain, x) {
  const s = terrain.slope(x);
  const k = Math.hypot(1, s);
  return { h: terrain.height(x), nx: -s / k, ny: 1 / k, tx: 1 / k, ty: s / k };
}

/** Signed distance from a point to the ground along the surface normal. */
export function signedDistance(terrain, px, py) {
  const g = groundFrame(terrain, px);
  return (py - g.h) * g.ny;
}

/** World-frame offset of a chassis-frame point, rotated by the chassis angle. */
function rotate(car, lx, ly) {
  const cs = Math.cos(car.angle);
  const sn = Math.sin(car.angle);
  return { x: cs * lx - sn * ly, y: sn * lx + cs * ly };
}

/**
 * Advance the car by dt seconds. `input` is {gas, brake, leanBack, leanForward} booleans.
 * Mutates and returns `car`.
 */
export function stepCar(car, terrain, input, dt) {
  const cs = Math.cos(car.angle);
  const sn = Math.sin(car.angle);

  car.throttle += ((input.gas ? 1 : 0) - car.throttle) * Math.min(1, dt * CAR.throttleRate);
  const brake = !!input.brake;

  // Chassis accumulators
  let fx = -CAR.aeroK * car.vx * Math.abs(car.vx);
  let fy = -CAR.mass * CAR.gravity;
  let tau = 0;
  if (input.leanBack) tau += CAR.leanTorque;
  if (input.leanForward) tau -= CAR.leanTorque;

  const wheelForce = car.wheels.map(() => ({ x: 0, y: -CAR.wheelMass * CAR.gravity }));

  for (let i = 0; i < car.wheels.length; i += 1) {
    const w = car.wheels[i];
    const a = ATTACH[i];

    // Attachment point, world frame, and its velocity
    const rA = rotate(car, a.x, a.y);
    const ax = car.x + rA.x;
    const ay = car.y + rA.y;
    const vAx = car.vx - car.omega * rA.y;
    const vAy = car.vy + car.omega * rA.x;

    // Spring: displacement and velocity of the wheel relative to the attachment, in body frame
    const dx = w.x - ax;
    const dy = w.y - ay;
    const bx = cs * dx + sn * dy;
    const by = -sn * dx + cs * dy;
    const dvx = w.vx - vAx;
    const dvy = w.vy - vAy;
    const bvx = cs * dvx + sn * dvy;
    const bvy = -sn * dvx + cs * dvy;

    // Rest position is (0, -restLength) in body frame
    const errX = bx;
    const errY = by + CAR.restLength;
    const fbx = -(CAR.springX * errX + CAR.dampX * bvx);
    const fby = -(CAR.springY * errY + CAR.dampY * bvy);

    // World-frame spring force on the wheel
    const sfx = cs * fbx - sn * fby;
    const sfy = sn * fbx + cs * fby;
    const wf = wheelForce[i];
    wf.x += sfx;
    wf.y += sfy;

    // Equal and opposite force on the chassis at the attachment point
    fx -= sfx;
    fy -= sfy;
    tau += rA.x * -sfy - rA.y * -sfx;

    // Ground contact along the terrain normal
    const g = groundFrame(terrain, w.x);
    const sd = (w.y - g.h) * g.ny;
    const pen = CAR.wheelRadius - sd;
    const vn = w.vx * g.nx + w.vy * g.ny;
    const vt = w.vx * g.tx + w.vy * g.ty;
    const normal = pen > 0 ? Math.max(0, CAR.groundK * pen - CAR.groundC * vn) : 0;

    // Tangential forces: drive, brake, rolling resistance, then friction cap
    let ft = w.drive ? car.throttle * CAR.driveForce : 0;
    if (brake) ft -= Math.max(-CAR.brakeForce, Math.min(CAR.brakeForce, vt * CAR.brakeDamp));
    ft -= vt * CAR.rollDamp;
    const cap = CAR.mu * normal;
    ft = Math.max(-cap, Math.min(cap, ft));

    wf.x += ft * g.tx + normal * g.nx;
    wf.y += ft * g.ty + normal * g.ny;
  }

  // Integrate wheels (semi-implicit Euler)
  for (let i = 0; i < car.wheels.length; i += 1) {
    const w = car.wheels[i];
    const wf = wheelForce[i];
    w.vx += (wf.x / CAR.wheelMass) * dt;
    w.vy += (wf.y / CAR.wheelMass) * dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.rot += (w.vx * dt) / CAR.wheelRadius;
  }

  // Integrate chassis
  car.vx += (fx / CAR.mass) * dt;
  car.vy += (fy / CAR.mass) * dt;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.omega += (tau / CHASSIS_INERTIA) * dt;
  car.angle += car.omega * dt;

  if (!Number.isFinite(car.x) || !Number.isFinite(car.y) || !Number.isFinite(car.angle)) {
    car.crashed = true;
    return car;
  }

  // Roof contact ends the run. Check both roof corners against the terrain.
  for (const sx of [-1, 1]) {
    const c = rotate(car, sx * CAR.halfW, CAR.halfH);
    const px = car.x + c.x;
    const py = car.y + c.y;
    if (signedDistance(terrain, px, py) < 0) {
      car.crashed = true;
      break;
    }
  }
  return car;
}
