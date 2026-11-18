// Builds Palmera Bay: a sunny coastal grid city. Ground, roads, sidewalks,
// pastel buildings (one InstancedMesh), palm trees and lamps (instanced),
// beach + sea on the south edge, a pier, and the AABB colliders every moving
// thing uses. All placement comes from the seeded RNG, so the same seed
// always builds the same city.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { pick, range } from './random.js';

const BUILDING_COLORS = PALETTE.buildings;

export function buildCity(scene, rng) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const buildings = []; // {x,z,w,d,h,color} for the minimap
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const half = CITY.half;
  const roadSet = new Set(CITY.roadLines);

  // --- Ground: big grass/concrete slab --------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x8fae7a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  ground.receiveShadow = false;
  group.add(ground);

  // --- Roads: dark strips along every grid line ----------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.roadLine });
  const dummy = new THREE.Object3D();
  for (const c of CITY.roadLines) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, half * 2), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.02, 0);
    group.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, CITY.roadWidth), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.02, c);
    group.add(ew);
  }

  // Dashed centre lines: ONE InstancedMesh for all dashes (1 draw call).
  // NOTE: the dash positions are collected first so the InstancedMesh is
  // allocated for exactly the number that exists — allocating fewer than
  // are drawn makes the GPU read uninitialised matrices past the buffer,
  // which once rendered as a giant fog-coloured triangle.
  // Dashes live only in the clear stretches between intersections: a dash
  // never overlaps a crossing road and never runs past the beach, so every
  // dash is parallel to its road, the same length, and evenly spaced.
  // (The old code built this mesh once per road line — five identical
  // coplanar copies that z-fought — and laid dashes on a fixed grid that
  // straddled junctions and ran onto the sand.)
  const dashGeo = new THREE.PlaneGeometry(0.5, 4);
  dashGeo.rotateX(-Math.PI / 2);
  const dashSpots = [];
  const DASH_LEN = 4;
  const DASH_PITCH = 12;
  const CLEAR = CITY.roadWidth / 2 + DASH_LEN / 2 + 1; // 7.5: half road + half dash + margin
  const sortedLines = [...CITY.roadLines].sort((a, b) => a - b);
  // Free stretches along one axis: gaps between the road ends and the
  // clearance zone around every crossing road.
  function freeStretches(end) {
    const edges = [-half, ...sortedLines.flatMap((r) => [r - CLEAR, r + CLEAR]), end];
    const out = [];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i];
      const b = edges[i + 1];
      if (b - a >= DASH_LEN + 4) out.push([a, b]);
    }
    return out;
  }
  function addDashes(stretches, fixed, alongZ) {
    for (const [a, b] of stretches) {
      const n = Math.floor((b - a - DASH_LEN) / DASH_PITCH) + 1;
      const mid = (a + b) / 2;
      for (let k = 0; k < n; k += 1) {
        const t = mid + (k - (n - 1) / 2) * DASH_PITCH;
        if (alongZ) dashSpots.push([fixed, t, 0]);
        else dashSpots.push([t, fixed, Math.PI / 2]);
      }
    }
  }
  const stretchesX = freeStretches(half); // east-west roads run the full width
  const stretchesZ = freeStretches(92); // north-south roads stop at the beach
  for (const c of CITY.roadLines) {
    addDashes(stretchesZ, c, true);
    addDashes(stretchesX, c, false);
  }
  const dashes = new THREE.InstancedMesh(dashGeo, lineMat, dashSpots.length);
  dashSpots.forEach(([x, z, rot], i) => {
    dummy.position.set(x, 0.04, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // --- Beach + sea (south edge, z > beachZ) ---------------------------------
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, CITY.waterZ - CITY.beachZ + 4),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, (CITY.beachZ + CITY.waterZ) / 2);
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.01, CITY.waterZ + 28);
  group.add(water);
  // foam line where the waves meet the sand
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 80, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.05, CITY.waterZ + 0.5);
  group.add(foam);

  // --- Pier ------------------------------------------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9c6b30 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 26), pierMat);
  pier.position.set(0, 0.4, CITY.waterZ + 12);
  group.add(pier);
  colliders.push({ minX: -4, maxX: 4, minZ: CITY.waterZ - 1, maxZ: CITY.waterZ + 25 });
  for (let i = 0; i < 5; i += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6), pierMat);
    post.position.set(i % 2 === 0 ? -3.4 : 3.4, 0.7, CITY.waterZ + 4 + i * 4.5);
    group.add(post);
  }

  // --- Buildings: one InstancedMesh, colours vary per instance --------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const placements = [];
  const color = new THREE.Color();

  // Blocks sit between roads: block centres at -100,-60,-20,20,60,100 minus
  // the beach strip. Each block gets 1-4 buildings.
  const blockCentres = [];
  for (let x = -100; x <= 100; x += 40) {
    for (let z = -100; z <= 80; z += 40) {
      if (z >= CITY.beachZ - 20) continue;
      blockCentres.push([x, z]);
    }
  }
  for (const [bx, bz] of blockCentres) {
    const count = 1 + Math.floor(rng() * 3);
    const blockStart = placements.length; // buildings of this block only
    for (let i = 0; i < count; i += 1) {
      const w = range(rng, 10, 18);
      const d = range(rng, 10, 18);
      const h = range(rng, 7, 30);
      // jitter inside the block, keeping clear of the roads
      const x = bx + range(rng, -8, 8) + (i % 2 === 0 ? -4 : 5) * (count > 1 ? 1 : 0);
      const z = bz + range(rng, -8, 8) + (i < 2 ? -4 : 5) * (count > 2 ? 1 : 0);
      if (Math.abs(x) > half - 8 || Math.abs(z) > half - 8) continue;
      // never cover a road
      let onRoad = false;
      for (const r of CITY.roadLines) {
        if (Math.abs(x - r) < w / 2 + 6 || Math.abs(z - r) < d / 2 + 6) { onRoad = true; break; }
      }
      if (onRoad) continue;
      const c = pick(rng, BUILDING_COLORS);
      placements.push({ x, z, w, d, h, c });
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      buildings.push({ x, z, w, d, h, color: c });
    }
    // rooftop water tank on some blocks (visual only). It sits on the roof
    // of the tallest building in this block — never at a fixed height, which
    // once left tanks floating in mid-air and rendered as a dark box in the
    // sky. If the block ended up with no building, there is no tank.
    if (rng() < 0.4) {
      let roof = null;
      for (let j = blockStart; j < placements.length; j += 1) {
        if (!roof || placements[j].h > roof.h) roof = placements[j];
      }
      if (roof) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(1.2, 1.2, 2.2, 8),
          new THREE.MeshLambertMaterial({ color: 0x6b7c8c }),
        );
        tank.position.set(roof.x, roof.h + 1.1, roof.z);
        group.add(tank);
      }
    }
  }

  const inst = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.h / 2, p.z);
    dummy.scale.set(p.w, p.h, p.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    inst.setColorAt(i, color.setHex(p.c));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  group.add(inst);

  // Roof rims: thin darker boxes on top of the tallest few buildings
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x5b4a68 });
  let rims = 0;
  for (const p of placements) {
    if (p.h < 18 || rims > 14) continue;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.6, 0.5, p.d + 0.6), rimMat);
    rim.position.set(p.x, p.h + 0.25, p.z);
    group.add(rim);
    rims += 1;
  }

  // --- Palm trees (instanced trunks + instanced crowns) ----------------------
  const palmSpots = [];
  for (let i = 0; i < 170; i += 1) {
    const x = range(rng, -half, half);
    const z = range(rng, -half, CITY.beachZ + 6);
    let bad = false;
    for (const r of CITY.roadLines) {
      if (Math.abs(x - r) < 6.5 || Math.abs(z - r) < 6.5) { bad = true; break; }
    }
    if (bad) continue;
    for (const c of colliders) {
      if (x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2) { bad = true; break; }
    }
    if (bad) continue;
    palmSpots.push([x, z]);
  }
  // a row of palms along the beach
  for (let x = -110; x <= 110; x += 12) palmSpots.push([x + range(rng, -3, 3), CITY.beachZ + 5 + rng() * 4]);

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 5.2, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 2.6, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.6, z);
    dummy.scale.set(1, 0.75, 1);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(crowns);

  // --- Street lamps along the roads (instanced) ------------------------------
  const lampSpots = [];
  for (const r of CITY.roadLines) {
    for (let t = -100; t <= 100; t += 40) {
      lampSpots.push([r + 5.5, t]);
      lampSpots.push([t, r + 5.5]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: PALETTE.lamp });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff6b0 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 2.5, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 5.1, z);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(poles);
  group.add(bulbs);

  // --- Park: green square with a fountain at the city centre -----------------
  const park = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshLambertMaterial({ color: 0x5da24a }),
  );
  park.rotation.x = -Math.PI / 2;
  park.position.set(-60, 0.03, -60);
  group.add(park);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.8, 1, 12),
    new THREE.MeshLambertMaterial({ color: 0x9fc7e8 }),
  );
  fountain.position.set(-60, 0.5, -60);
  group.add(fountain);
  colliders.push({ minX: -63.8, maxX: -56.2, minZ: -63.8, maxZ: -56.2 });

  // City bounds as colliders so nobody walks into the void
  const B = half + 4;
  colliders.push({ minX: -B - 10, maxX: -B, minZ: -B - 10, maxZ: B + 10 });
  colliders.push({ minX: B, maxX: B + 10, minZ: -B - 10, maxZ: B + 10 });
  colliders.push({ minX: -B - 10, maxX: B + 10, minZ: -B - 10, maxZ: -B });
  colliders.push({ minX: -B - 10, maxX: B + 10, minZ: B, maxZ: B + 10 });

  return { colliders, buildings, group, roadLines: CITY.roadLines, half };
}

/** True if a circle (x,z,r) overlaps any building collider. */
export function circleHits(colliders, x, z, r) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return c;
  }
  return null;
}

/** Push a circle out of colliders; returns the corrected (x,z). */
export function resolveCircle(colliders, x, z, r) {
  for (let iter = 0; iter < 3; iter += 1) {
    const c = circleHits(colliders, x, z, r);
    if (!c) break;
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    let dx = x - cx;
    let dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) { dx = 0; dz = 1; }
    else { dx /= d; dz /= d; }
    const push = r - (d < 0.001 ? 0 : d) + 0.01;
    x += dx * push;
    z += dz * push;
  }
  return [x, z];
}
