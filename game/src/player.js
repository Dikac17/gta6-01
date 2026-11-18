// The player on foot: third-person movement, jump, camera follow and a simple
// blocky character mesh with swinging legs. Collision is AABB per axis (move
// X, test, move Z, test) so the player slides along walls instead of sticking.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp } from './random.js';

export function createPlayer(scene) {
  const group = new THREE.Group();
  group.name = 'player';

  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xff6b35 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3a55 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1d1d1d });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.66;
  group.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.44), hair);
  hairM.position.y = 1.9;
  group.add(hairM);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.28), pants);
  legL.position.set(-0.16, 0.36, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.28), pants);
  legR.position.set(0.16, 0.36, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.22), shirt);
  armL.position.set(-0.42, 1.05, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.22), shirt);
  armR.position.set(0.42, 1.05, 0);
  group.add(armR);
  scene.add(group);

  const state = {
    pos: new THREE.Vector3(0, 0, 20),
    vel: new THREE.Vector3(),
    vy: 0,
    grounded: true,
    yaw: Math.PI, // facing direction (radians, 0 = -Z... see forward())
    camYaw: Math.PI,
    camPitch: 0.32,
    camDist: 7.5,
    walkPhase: 0,
    speed: 0,
    inCar: null,
    weapon: 'pistol', // 'pistol' | 'fist'
    attackCd: 0,
    busted: 0, // seconds a cop has held you
    invuln: 0,
  };

  function forward() {
    return new THREE.Vector3(-Math.sin(state.camYaw), 0, -Math.cos(state.camYaw));
  }
  function right() {
    return new THREE.Vector3(Math.cos(state.camYaw), 0, -Math.sin(state.camYaw));
  }

  function hitsBox(colliders, x, z) {
    const r = PLAYER.radius;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  /** Move on foot. `move` is {fwd, strafe} in camera space. */
  function update(dt, move, run, jump, colliders) {
    if (state.inCar) return;
    const f = forward();
    const r = right();
    const mx = f.x * move.fwd + r.x * move.strafe;
    const mz = f.z * move.fwd + r.z * move.strafe;
    const len = Math.hypot(mx, mz);
    const target = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let vx = 0;
    let vz = 0;
    if (len > 0.01) {
      vx = (mx / len) * target;
      vz = (mz / len) * target;
      state.yaw = Math.atan2(mx, mz);
    }
    // per-axis AABB move: X first, then Z — wall sliding
    const nx = state.pos.x + vx * dt;
    if (!hitsBox(colliders, nx, state.pos.z)) state.pos.x = nx;
    const nz = state.pos.z + vz * dt;
    if (!hitsBox(colliders, state.pos.x, nz)) state.pos.z = nz;

    // jump + gravity
    if (jump && state.grounded) {
      state.vy = PLAYER.jumpSpeed;
      state.grounded = false;
    }
    state.vy -= PLAYER.gravity * dt;
    state.pos.y += state.vy * dt;
    if (state.pos.y <= 0) {
      state.pos.y = 0;
      state.vy = 0;
      state.grounded = true;
    }

    state.speed = Math.hypot(vx, vz);
    state.walkPhase += state.speed * dt * 1.9;
    if (state.attackCd > 0) state.attackCd -= dt;
    if (state.invuln > 0) state.invuln -= dt;

    // pose the mesh
    group.position.copy(state.pos);
    group.rotation.y = state.yaw;
    const swing = state.speed > 0.5 ? Math.sin(state.walkPhase) * 0.7 : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;
    body.position.y = 1.05 + (state.speed > 0.5 ? Math.abs(Math.sin(state.walkPhase)) * 0.05 : 0);
    group.visible = true;
  }

  /** Third-person camera: behind the player, pulled in if a building blocks it. */
  function updateCamera(dt, camera, lookDx, lookDy, camTurn, colliders, shake) {
    state.camYaw -= lookDx * 0.0032;
    state.camYaw += camTurn * 1.9 * dt;
    state.camPitch = clamp(state.camPitch + lookDy * 0.0022, -0.15, 0.9);
    const dist = state.inCar ? 10.5 : state.camDist;
    const anchor = state.inCar
      ? state.inCar.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0))
      : state.pos.clone().add(new THREE.Vector3(0, 1.7, 0));
    // pull the camera in while its ray is blocked by a building
    let d = dist;
    for (let t = 0; t < 4; t += 1) {
      const cx = anchor.x + Math.sin(state.camYaw) * d * Math.cos(state.camPitch);
      const cz = anchor.z + Math.cos(state.camYaw) * d * Math.cos(state.camPitch);
      if (!hitsBox(colliders, cx, cz)) break;
      d *= 0.6;
    }
    const cx = anchor.x + Math.sin(state.camYaw) * d * Math.cos(state.camPitch);
    const cz = anchor.z + Math.cos(state.camYaw) * d * Math.cos(state.camPitch);
    const cy = anchor.y + Math.sin(state.camPitch) * d + 0.6;
    camera.position.set(cx, Math.max(cy, 0.7), cz);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.9;
      camera.position.y += (Math.random() - 0.5) * shake * 0.9;
    }
    camera.lookAt(anchor.x, anchor.y + 0.2, anchor.z);
    return anchor;
  }

  function setPosition(x, z, camYaw) {
    state.pos.set(x, 0, z);
    if (camYaw !== undefined) { state.camYaw = camYaw; state.yaw = camYaw; }
    group.position.copy(state.pos);
  }

  return { group, state, update, updateCamera, setPosition, forward };
}
