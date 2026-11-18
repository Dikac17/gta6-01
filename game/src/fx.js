// Juice: a pooled particle burst system (one THREE.Points, reused) and
// screen-shake trauma. Particles never allocate during play; dead ones are
// parked far below the world.
import * as THREE from 'three';

const MAX = 400;

export function createFx(scene) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  for (let i = 0; i < MAX; i += 1) positions[i * 3 + 1] = -100;
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const vel = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  let cursor = 0;
  let trauma = 0;
  const color = new THREE.Color();

  function burst(pos, hex, n, speed = 6) {
    color.setHex(hex);
    for (let k = 0; k < n; k += 1) {
      const i = cursor;
      cursor = (cursor + 1) % MAX;
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = (pos.y ?? 0) + 0.8;
      positions[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.8 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      vel[i * 3] = Math.cos(a) * s;
      vel[i * 3 + 1] = up * s;
      vel[i * 3 + 2] = Math.sin(a) * s;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      life[i] = 0.5 + Math.random() * 0.5;
    }
    geo.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    let any = false;
    for (let i = 0; i < MAX; i += 1) {
      if (life[i] <= 0) continue;
      any = true;
      life[i] -= dt;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = -100;
        continue;
      }
      vel[i * 3 + 1] -= 12 * dt;
      positions[i * 3] += vel[i * 3] * dt;
      positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
      positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (positions[i * 3 + 1] < 0.05) positions[i * 3 + 1] = 0.05;
    }
    if (any) geo.attributes.position.needsUpdate = true;
    trauma = Math.max(0, trauma - dt * 1.6);
  }

  function addTrauma(v) { trauma = Math.min(1, trauma + v); }
  function shake() { return trauma * trauma; }

  return { burst, update, addTrauma, shake, get trauma() { return trauma; } };
}
