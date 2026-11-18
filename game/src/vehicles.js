// Cars: blocky low-poly models built from boxes, arcade driving physics, and
// entering / exiting. Parked cars are stealable (a crime); traffic cars are
// not. Every car is a {mesh, pos, yaw, speed, model, ...} plain object.
import * as THREE from 'three';
import { CAR } from './config.js';
import { clamp } from './random.js';
import { resolveCircle } from './city.js';

export const CAR_MODELS = {
  sedan: { name: 'City Sedan', top: 26, accel: 13, turn: 1.9, color: 0x3d7bd6, len: 4.2, wid: 1.9 },
  taxi: { name: 'Yellow Taxi', top: 24, accel: 12, turn: 1.9, color: 0xffc400, len: 4.2, wid: 1.9 },
  pickup: { name: 'Steel Pickup', top: 22, accel: 10, turn: 1.6, color: 0xc0392b, len: 4.6, wid: 2.0 },
  sport: { name: 'Comet Sport', top: 34, accel: 18, turn: 2.3, color: 0xe91e63, len: 4.0, wid: 1.9 },
  van: { name: 'Bread Van', top: 20, accel: 9, turn: 1.5, color: 0x7e57c2, len: 4.8, wid: 2.1 },
  police: { name: 'Police Patrol', top: 30, accel: 16, turn: 2.1, color: 0x1a1a2e, len: 4.3, wid: 1.9 },
  courier: { name: 'Orange Courier', top: 28, accel: 15, turn: 2.0, color: 0xff6d00, len: 4.2, wid: 1.9 },
};

export function buildCarMesh(modelKey, colorOverride) {
  const model = CAR_MODELS[modelKey];
  const color = colorOverride ?? model.color;
  const g = new THREE.Group();
  g.name = `car-${modelKey}`;
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a3a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x16181c });

  const body = new THREE.Mesh(new THREE.BoxGeometry(model.wid, 0.62, model.len), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabinH = modelKey === 'van' ? 0.85 : 0.55;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(model.wid - 0.25, cabinH, model.len * 0.48), glassMat);
  cabin.position.set(0, 0.55 + 0.31 + cabinH / 2 - 0.1, modelKey === 'pickup' ? -0.6 : -0.15);
  g.add(cabin);
  if (modelKey === 'pickup') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(model.wid - 0.2, 0.3, 1.4), darkMat);
    bed.position.set(0, 0.95, 1.2);
    g.add(bed);
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx * (model.wid / 1.9), 0.36, wz * (model.len / 4.2));
    g.add(w);
    wheels.push(w);
  }
  // headlights + taillights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff8c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), lightMat);
    h.position.set(s * 0.6, 0.6, -model.len / 2 - 0.02);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.06), tailMat);
    t.position.set(s * 0.6, 0.6, model.len / 2 + 0.02);
    g.add(t);
  }
  if (modelKey === 'police') {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const bar2Mat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), barMat);
    b1.position.set(-0.3, 1.42, -0.15);
    g.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), bar2Mat);
    b2.position.set(0.3, 1.42, -0.15);
    g.add(b2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(model.wid + 0.02, 0.2, model.len * 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.62;
    g.add(stripe);
  }
  if (modelKey === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    sign.position.set(0, 1.45, -0.15);
    g.add(sign);
  }
  return { group: g, wheels, model };
}

export function makeCar(scene, modelKey, x, z, yaw, opts = {}) {
  const { group, wheels, model } = buildCarMesh(modelKey, opts.color);
  group.position.set(x, 0, z);
  group.rotation.y = yaw;
  scene.add(group);
  return {
    mesh: group,
    wheels,
    modelKey,
    model,
    name: model.name,
    pos: group.position,
    yaw,
    speed: 0,
    steer: 0,
    driven: false,
    parked: opts.parked ?? false,
    stolen: false,
    ai: opts.ai ?? null, // 'traffic' | 'police' | 'courier' | null
    hp: 100,
    radius: 1.7,
    waypoint: 0,
    route: opts.route ?? null,
    wait: 0,
  };
}

/** Arcade driving for the player's car. Returns true if it hit something hard. */
export function driveCar(car, fwd, steerIn, dt, colliders, others) {
  const m = car.model;
  const target = fwd * m.top;
  const rate = fwd > 0 ? m.accel : m.accel * 1.6;
  if (fwd === 0) car.speed -= car.speed * 1.4 * dt; // coast
  else if (car.speed < target) car.speed = Math.min(target, car.speed + rate * dt);
  else if (car.speed > target) car.speed = Math.max(target, car.speed - rate * 1.4 * dt);
  if (Math.abs(car.speed) < 0.05 && fwd === 0) car.speed = 0;

  const dir = car.speed >= 0 ? 1 : -1;
  car.steer = clamp(steerIn, -1, 1);
  car.yaw += car.steer * m.turn * dir * Math.min(1, Math.abs(car.speed) / 8) * dt;
  const nx = car.pos.x + Math.sin(car.yaw) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.yaw) * car.speed * dt;
  car.pos.x = nx;
  car.pos.z = nz;
  car.mesh.rotation.y = car.yaw;
  // spin wheels
  const spin = car.speed * dt * 2.2;
  for (const w of car.wheels) w.rotation.x += spin;

  // building collision: push out and scrub speed
  const before = resolveCircle(colliders, car.pos.x, car.pos.z, car.radius);
  const hitWall = before[0] !== car.pos.x || before[1] !== car.pos.z;
  car.pos.x = before[0];
  car.pos.z = before[1];
  let crashed = false;
  if (hitWall) {
    if (Math.abs(car.speed) > 8) crashed = true;
    car.speed *= 0.45;
  }
  // car-car bump (soft): push apart, lose a little speed
  for (const o of others) {
    if (o === car) continue;
    const dx = car.pos.x - o.pos.x;
    const dz = car.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    const min = car.radius + o.radius;
    if (d > 0.001 && d < min) {
      const push = (min - d) / 2;
      car.pos.x += (dx / d) * push;
      car.pos.z += (dz / d) * push;
      if (Math.abs(car.speed) > 10) crashed = true;
      car.speed *= 0.92;
    }
  }
  return crashed;
}

/** Nearest parked car the player could enter. */
export function nearestEnterable(cars, x, z) {
  let best = null;
  let bestD = CAR.enterRange;
  for (const c of cars) {
    if (c.ai === 'traffic' || c.ai === 'police') continue;
    if (c.driven) continue;
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
