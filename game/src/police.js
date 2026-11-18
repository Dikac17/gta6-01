// Wanted level + police. Crime raises wanted (stealing, hitting pedestrians,
// shooting cops); hiding and time lower it. Police cars chase the player's
// car and ram it; foot officers chase the player on foot and, if they hold
// you for ~1.5 s, you are BUSTED.
import * as THREE from 'three';
import { WANTED } from './config.js';
import { makeCar } from './vehicles.js';
import { pick, range, angleDiff, clamp } from './random.js';
import { resolveCircle } from './city.js';

function makeOfficer(scene) {
  const g = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1b2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.34), navy);
  body.position.y = 1.02;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), skin);
  head.position.y = 1.6;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x0d1526 }));
  cap.position.y = 1.84;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.58, 0.26), navy);
  legL.position.set(-0.15, 0.34, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  scene.add(g);
  return { group: g, legL, legR };
}

export function createPolice(scene, rng, colliders) {
  const cars = [];
  const officers = [];
  let sirenPhase = 0;

  function spawnCarNear(playerPos) {
    // spawn on a road 45-60 m away so the chase is visible, not a pop-in
    const angle = rng() * Math.PI * 2;
    let x = playerPos.x + Math.sin(angle) * 50;
    let z = playerPos.z + Math.cos(angle) * 50;
    x = clamp(x, -110, 110);
    z = clamp(z, -110, 90);
    const car = makeCar(scene, 'police', x, z, 0, { ai: 'police' });
    car.speed = 12;
    cars.push(car);
    return car;
  }

  function spawnOfficerNear(playerPos) {
    const angle = rng() * Math.PI * 2;
    const x = clamp(playerPos.x + Math.sin(angle) * 22, -115, 115);
    const z = clamp(playerPos.z + Math.cos(angle) * 22, -115, 92);
    const { group, legL, legR } = makeOfficer(scene);
    group.position.set(x, 0, z);
    const o = {
      mesh: group, legL, legR,
      pos: group.position,
      yaw: 0, speed: 5.6, hp: 50, phase: rng() * 6, alive: true, punchCd: 0,
    };
    officers.push(o);
    return o;
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }
  function removeOfficer(o) {
    scene.remove(o.mesh);
    const i = officers.indexOf(o);
    if (i >= 0) officers.splice(i, 1);
  }

  /** Keep the number of police proportional to wanted; returns events. */
  function update(dt, G) {
    const events = { busted: false, rammed: false, punched: false };
    const playerPos = G.player.state.inCar ? G.player.state.inCar.pos : G.player.state.pos;
    const wanted = G.wanted;

    // --- spawn / despawn to match wanted -----------------------------------
    // While the police are still actively hunting (a recent crime), they send
    // reinforcements. Once they are only searching an old trail, no new units
    // arrive — that is what lets a player who really got away cool down.
    const searching = G.time - G.lastCrime > WANTED.decayAfter;
    const wantCars = wanted >= 1 && !searching ? Math.min(wanted, 3) : 0;
    const wantFoot = !searching && !G.player.state.inCar ? (wanted >= 2 ? Math.min(wanted - 1, 3) : 0) : 0;
    while (cars.length < wantCars) spawnCarNear(playerPos);
    while (cars.length > wantCars) removeCar(cars[cars.length - 1]);
    while (officers.filter((o) => o.alive).length < wantFoot) spawnOfficerNear(playerPos);
    while (officers.filter((o) => o.alive).length > wantFoot) {
      const alive = officers.find((o) => o.alive);
      if (alive) removeOfficer(alive); else break;
    }
    // officers too far away give up and walk off
    for (const o of [...officers]) {
      if (o.alive && Math.hypot(o.pos.x - playerPos.x, o.pos.z - playerPos.z) > 90) removeOfficer(o);
    }
    for (const c of [...cars]) {
      if (Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z) > 130) removeCar(c);
    }

    // After 30 s without a new crime the police lose your trail: they drive
    // slowly to where you were last seen instead of homing in on you, so a
    // player who really gets away can cool the wanted level down.
    const lastKnown = G.lastKnown || playerPos;
    for (const car of cars) {
      const tx = searching ? lastKnown.x : playerPos.x;
      const tz = searching ? lastKnown.z : playerPos.z;
      const dx = tx - car.pos.x;
      const dz = tz - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const distToPlayer = Math.hypot(playerPos.x - car.pos.x, playerPos.z - car.pos.z);
      const wantYaw = Math.atan2(dx, dz);
      const diff = angleDiff(car.yaw, wantYaw);
      const top = searching ? 8 : 14 + wanted * 3.2;
      car.yaw += clamp(diff, -2.4 * dt, 2.4 * dt);
      car.speed += clamp(top - car.speed, -14 * dt, 10 * dt);
      car.pos.x += Math.sin(car.yaw) * car.speed * dt;
      car.pos.z += Math.cos(car.yaw) * car.speed * dt;
      car.mesh.rotation.y = car.yaw;
      for (const w of car.wheels) w.rotation.x += car.speed * dt * 2.2;
      const before = resolveCircle(colliders, car.pos.x, car.pos.z, car.radius);
      if (before[0] !== car.pos.x || before[1] !== car.pos.z) {
        car.pos.x = before[0]; car.pos.z = before[1];
        car.speed *= 0.5;
        car.yaw += 0.6;
      }
      // ram the player's car (only while actively chasing, not searching)
      const pc = G.player.state.inCar;
      if (!searching && pc && distToPlayer < car.radius + pc.radius + 0.4 && car.speed > 6) {
        events.rammed = true;
        car.speed *= 0.4;
      }
      // if the player is on foot, stop nearby and let officers out
      if (!pc && distToPlayer < 9) {
        car.speed = Math.max(0, car.speed - 20 * dt);
        if (officers.filter((o) => o.alive).length < 3 && rng() < dt * 0.5) spawnOfficerNear(playerPos);
      }
    }

    // --- foot officers chase and grab ---------------------------------------
    const p = G.player.state;
    for (const o of officers) {
      if (!o.alive) continue;
      const tx = searching ? lastKnown.x : p.pos.x;
      const tz = searching ? lastKnown.z : p.pos.z;
      const dx = tx - o.pos.x;
      const dz = tz - o.pos.z;
      const dist = Math.hypot(dx, dz);
      const distToPlayer = Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z);
      o.yaw = Math.atan2(dx, dz);
      o.mesh.rotation.y = o.yaw;
      if (dist > 1.9) {
        const spd = searching ? 3.2 : o.speed;
        o.pos.x += Math.sin(o.yaw) * spd * dt;
        o.pos.z += Math.cos(o.yaw) * spd * dt;
        o.phase += dt * 9;
        const swing = Math.sin(o.phase) * 0.6;
        o.legL.rotation.x = swing;
        o.legR.rotation.x = -swing;
      } else if (!searching && distToPlayer <= 2.2) {
        // holding the player: busted meter fills, and they punch
        o.punchCd -= dt;
        if (o.punchCd <= 0) {
          o.punchCd = 0.9;
          events.punched = true;
        }
        if (!p.inCar) {
          p.busted += dt;
          if (p.busted >= 1.5) events.busted = true;
        }
      }
    }
    if (officers.every((o) => !o.alive || Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 2.2)) {
      p.busted = Math.max(0, p.busted - dt * 2);
    }

    // --- wanted decay: hide long enough and the heat cools off --------------
    if (wanted > 0 && G.time - G.lastCrime > WANTED.decayAfter) {
      const nearestCop = Math.min(
        ...cars.map((c) => Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z)),
        ...officers.filter((o) => o.alive).map((o) => Math.hypot(o.pos.x - playerPos.x, o.pos.z - playerPos.z)),
        999,
      );
      if (nearestCop > 35) {
        G.wantedTimer += dt;
        if (G.wantedTimer >= WANTED.decayEvery) {
          G.wantedTimer = 0;
          G.wanted = Math.max(0, wanted - 1);
        }
      } else {
        G.wantedTimer = 0;
      }
    }

    sirenPhase += dt;
    return events;
  }

  function clear() {
    for (const c of [...cars]) removeCar(c);
    for (const o of [...officers]) removeOfficer(o);
  }

  function addWanted(G, n) {
    if (G.wanted >= WANTED.max) return;
    G.wanted = Math.min(WANTED.max, G.wanted + n);
    G.lastCrime = G.time;
    G.wantedTimer = 0;
    const p = G.player.state;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    G.lastKnown = { x: pos.x, z: pos.z };
  }

  return { cars, officers, update, addWanted, clear, spawnCarNear, spawnOfficerNear, removeOfficer };
}
