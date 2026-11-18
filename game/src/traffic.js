// Traffic: AI cars that loop around city blocks on the road grid, and
// pedestrians who walk the sidewalks and run away from speeding cars.
// Both are simple waypoint followers — no pathfinding needed on a grid.
import * as THREE from 'three';
import { CITY } from './config.js';
import { makeCar, driveCar } from './vehicles.js';
import { pick, range, angleDiff, clamp } from './random.js';

const PED_COLORS = [0x2ecc71, 0xe67e22, 0x9b59b6, 0x1abc9c, 0xf1c40f, 0xe74c3c, 0x3498db, 0xecf0f1];

function makePed(scene, color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  body.position.y = 1.0;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.36), skin);
  head.position.y = 1.55;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.24), pants);
  legL.position.set(-0.14, 0.32, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  scene.add(g);
  return { group: g, legL, legR };
}

/** Rectangular loop around one block, on the road centrelines. */
function loopRoute(cx, cz, hw, hd, rng) {
  const pts = [
    [cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd],
  ];
  if (rng() < 0.5) pts.reverse();
  // rotate the start point so cars spread out
  const k = Math.floor(rng() * 4);
  return pts.slice(k).concat(pts.slice(0, k));
}

export function createTraffic(scene, rng, colliders) {
  const cars = [];
  const peds = [];
  const loops = [
    loopRoute(0, 0, 40, 40, rng),
    loopRoute(-40, -40, 40, 40, rng),
    loopRoute(40, 40, 40, 40, rng),
    loopRoute(0, -40, 80, 40, rng),
    loopRoute(-40, 40, 40, 40, rng),
    loopRoute(40, -40, 40, 40, rng),
  ];
  const models = ['sedan', 'taxi', 'pickup', 'van', 'sedan'];
  for (let i = 0; i < 10; i += 1) {
    const route = loops[i % loops.length];
    const [x, z] = route[i % 4 === 0 ? 0 : 1];
    const car = makeCar(scene, models[i % models.length], x + range(rng, -2, 2), z + range(rng, -2, 2), 0, { ai: 'traffic', route });
    car.waypoint = i % 4;
    car.speed = range(rng, 7, 11);
    car.cruise = car.speed;
    cars.push(car);
  }
  for (let i = 0; i < 16; i += 1) {
    const road = pick(rng, CITY.roadLines);
    const along = range(rng, -100, 100);
    const side = rng() < 0.5 ? 1 : -1;
    const onXRoad = rng() < 0.5;
    const x = onXRoad ? road + side * 6.2 : along;
    const z = onXRoad ? along : road + side * 6.2;
    const { group, legL, legR } = makePed(scene, pick(rng, PED_COLORS));
    group.position.set(x, 0, z);
    peds.push({
      mesh: group, legL, legR,
      pos: group.position,
      yaw: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.4),
      phase: rng() * 6,
      hp: 30,
      flee: 0,
      target: null,
      alive: true,
    });
  }

  function updateCars(dt, playerPos, playerSpeed, allCars) {
    for (const car of cars) {
      const wp = car.route[car.waypoint];
      const dx = wp[0] - car.pos.x;
      const dz = wp[1] - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.waypoint = (car.waypoint + 1) % car.route.length;
        continue;
      }
      const wantYaw = Math.atan2(dx, dz);
      const diff = angleDiff(car.yaw, wantYaw);
      car.yaw += clamp(diff, -1.6 * dt, 1.6 * dt);
      // slow down for the car ahead
      let target = car.cruise;
      for (const o of allCars) {
        if (o === car) continue;
        const odx = o.pos.x - car.pos.x;
        const odz = o.pos.z - car.pos.z;
        const od = Math.hypot(odx, odz);
        if (od < 9 && Math.abs(angleDiff(car.yaw, Math.atan2(odx, odz))) < 0.7) { target = 0; break; }
      }
      // and for the player stepping into the road
      const pdx = playerPos.x - car.pos.x;
      const pdz = playerPos.z - car.pos.z;
      if (Math.hypot(pdx, pdz) < 7 && Math.abs(angleDiff(car.yaw, Math.atan2(pdx, pdz))) < 0.6) target = 0;
      car.speed += clamp(target - car.speed, -10 * dt, 6 * dt);
      car.pos.x += Math.sin(car.yaw) * car.speed * dt;
      car.pos.z += Math.cos(car.yaw) * car.speed * dt;
      car.mesh.rotation.y = car.yaw;
      for (const w of car.wheels) w.rotation.x += car.speed * dt * 2.2;
    }
  }

  function updatePeds(dt, playerPos, playerInCar, playerSpeed) {
    for (const p of peds) {
      if (!p.alive) continue;
      // flee from a fast car or a gunshot
      const d = Math.hypot(playerPos.x - p.pos.x, playerPos.z - p.pos.z);
      if (p.flee > 0) p.flee -= dt;
      if (playerInCar && playerSpeed > 8 && d < 12) p.flee = 1.6;
      let speed = p.speed;
      let yaw = p.yaw;
      if (p.flee > 0) {
        speed = 5.2;
        yaw = Math.atan2(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
      } else if (!p.target || Math.hypot(p.target[0] - p.pos.x, p.target[1] - p.pos.z) < 2) {
        // pick a new sidewalk stroll target along a road
        const road = pick(rng, CITY.roadLines);
        const side = rng() < 0.5 ? 1 : -1;
        const along = range(rng, -100, 100);
        p.target = rng() < 0.5 ? [road + side * 6.2, along] : [along, road + side * 6.2];
      }
      if (p.flee <= 0) {
        yaw = Math.atan2(p.target[0] - p.pos.x, p.target[1] - p.pos.z);
      }
      p.yaw = yaw;
      p.pos.x += Math.sin(yaw) * speed * dt;
      p.pos.z += Math.cos(yaw) * speed * dt;
      // stay inside the city and off the beach road
      p.pos.x = clamp(p.pos.x, -118, 118);
      p.pos.z = clamp(p.pos.z, -118, 94);
      p.mesh.rotation.y = yaw;
      p.phase += speed * dt * 2.4;
      const swing = Math.sin(p.phase) * 0.55;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
    }
  }

  function update(dt, playerPos, playerInCar, playerSpeed, allCars) {
    updateCars(dt, playerPos, playerSpeed, allCars);
    updatePeds(dt, playerPos, playerInCar, playerSpeed);
  }

  return { cars, peds, update };
}
