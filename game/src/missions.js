// Story + missions. Three missions in a row, each with a glowing beacon
// marker in the world and a distance readout on the HUD:
//   1. Parcel run — reach 3 drop points around the city.
//   2. Chase — tail the orange courier car until you are right behind it.
//   3. Escape — wanted level 3, reach the safehouse garage in the north-west.
// Finishing mission 3 wins the game; being busted or wasted loses it.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { makeCar } from './vehicles.js';
import { clamp } from './random.js';

function makeMarker(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 20;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.35;
  g.add(ring);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffe066 }),
  );
  diamond.position.y = 3.2;
  g.add(diamond);
  g.visible = false;
  scene.add(g);
  return { group: g, ring, diamond };
}

export function createMissions(scene, rng, G) {
  const marker = makeMarker(scene);
  let courier = null; // mission 2 target car
  let chaseTime = 0;
  let escapeTimer = 0;
  let safehouse = null;

  const state = {
    index: 0, // 0,1,2 ; 3 = all done (won)
    stage: 0, // drop index for mission 1
    target: null, // [x,z] current objective
    text: '',
    title: '',
    dist: -1,
    done: false,
  };

  function setMarker(x, z) {
    marker.group.position.set(x, 0, z);
    marker.group.visible = true;
    state.target = [x, z];
  }
  function hideMarker() {
    marker.group.visible = false;
    state.target = null;
    state.dist = -1;
  }

  function startMission(i) {
    state.index = i;
    state.stage = 0;
    chaseTime = 0;
    escapeTimer = 0;
    const m = MISSIONS[i];
    state.title = m.title;
    if (i === 0) {
      state.text = `${m.brief} (package 1/3)`;
      setMarker(m.drops[0][0], m.drops[0][1]);
    } else if (i === 1) {
      state.text = m.brief;
      if (!courier) {
        courier = makeCar(scene, 'courier', 40, -40, 0, { ai: 'courier' });
        courier.speed = 10;
        courier.cruise = 11;
        courier.route = [[40, -40], [40, 80], [-80, 80], [-80, -40]];
        courier.waypoint = 0;
      }
      courier.mesh.visible = true;
      setMarker(courier.pos.x, courier.pos.z);
    } else if (i === 2) {
      state.text = m.brief;
      G.wanted = 3;
      G.lastCrime = G.time;
      if (!safehouse) {
        // garage block in the north-west corner
        const gh = new THREE.Group();
        const walls = new THREE.MeshLambertMaterial({ color: 0x2b6cb0 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 8), walls);
        box.position.y = 2.5;
        gh.add(box);
        const door = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 0.3), new THREE.MeshLambertMaterial({ color: 0xf6e05e }));
        door.position.set(0, 1.8, 4.1);
        gh.add(door);
        gh.position.set(-80, 0, -80);
        scene.add(gh);
        safehouse = gh;
      }
      safehouse.visible = true;
      setMarker(-80, -76);
    }
  }

  function completeMission() {
    const m = MISSIONS[state.index];
    G.money += m.reward;
    G.stats.missionsDone += 1;
    G.audio.missionDone();
    G.hud.toast(`MISSION COMPLETE! +$${m.reward}`);
    G.hud.message(`Mama Rosa: "Nice work, Rico. On to the next job."`);
    if (state.index === 0) {
      if (courier) courier.mesh.visible = false;
      startMission(1);
    } else if (state.index === 1) {
      if (courier) courier.mesh.visible = false;
      startMission(2);
    } else {
      state.index = 3;
      state.done = true;
      hideMarker();
      state.title = 'PALMERA BAY — COMPLETE';
      state.text = 'All missions complete! You are a Palmera Bay street legend.';
      G.win();
    }
  }

  function update(dt, playerPos) {
    // marker spin / bob
    if (marker.group.visible) {
      marker.diamond.rotation.y += dt * 2;
      marker.diamond.position.y = 3.2 + Math.sin(G.time * 2.4) * 0.35;
      marker.ring.scale.setScalar(1 + Math.sin(G.time * 3) * 0.08);
    }
    if (state.done || state.index > 2) return;
    const px = playerPos.x;
    const pz = playerPos.z;

    if (state.index === 0) {
      const drop = MISSIONS[0].drops[state.stage];
      state.dist = Math.hypot(drop[0] - px, drop[1] - pz);
      if (state.dist < 4.5) {
        G.audio.pickup();
        G.hud.toast(`Package ${state.stage + 1}/3 delivered!`);
        state.stage += 1;
        if (state.stage >= MISSIONS[0].drops.length) completeMission();
        else {
          const next = MISSIONS[0].drops[state.stage];
          state.text = `${MISSIONS[0].brief} (package ${state.stage + 1}/3)`;
          setMarker(next[0], next[1]);
        }
      }
    } else if (state.index === 1 && courier) {
      // courier keeps driving its loop
      const wp = courier.route[courier.waypoint];
      const dx = wp[0] - courier.pos.x;
      const dz = wp[1] - courier.pos.z;
      if (Math.hypot(dx, dz) < 5) courier.waypoint = (courier.waypoint + 1) % courier.route.length;
      else {
        const wantYaw = Math.atan2(dx, dz);
        let diff = wantYaw - courier.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        courier.yaw += clamp(diff, -1.5 * dt, 1.5 * dt);
        courier.pos.x += Math.sin(courier.yaw) * courier.cruise * dt;
        courier.pos.z += Math.cos(courier.yaw) * courier.cruise * dt;
        courier.mesh.rotation.y = courier.yaw;
        for (const w of courier.wheels) w.rotation.x += courier.cruise * dt * 2.2;
      }
      setMarker(courier.pos.x, courier.pos.z);
      const d = Math.hypot(courier.pos.x - px, courier.pos.z - pz);
      state.dist = d;
      if (d < 9) {
        chaseTime += dt;
        state.text = `Stay on the courier! Keep close... ${Math.ceil(4 - chaseTime)} more seconds`;
        if (chaseTime >= 4) {
          G.police.addWanted(G, 1);
          completeMission();
        }
      } else {
        chaseTime = Math.max(0, chaseTime - dt);
        state.text = MISSIONS[1].brief;
      }
    } else if (state.index === 2) {
      escapeTimer += dt;
      const d = Math.hypot(-80 - px, -76 - pz);
      state.dist = d;
      const left = Math.max(0, 75 - escapeTimer);
      state.text = `Reach the safehouse! The police are after you — ${Math.ceil(left)}s left`;
      if (d < 6) {
        completeMission();
      } else if (escapeTimer > 75) {
        G.hud.toast(`Time's up! The police have surrounded you.`);
        G.gameOver('busted');
      }
    }
  }

  /** Restore a saved mission (index + drop stage) and point the marker right. */
  function resumeMission(index, stage) {
    startMission(index);
    if (index === 0) {
      state.stage = Math.min(stage, MISSIONS[0].drops.length - 1);
      const drop = MISSIONS[0].drops[state.stage];
      state.text = `${MISSIONS[0].brief} (package ${state.stage + 1}/3)`;
      setMarker(drop[0], drop[1]);
    }
  }

  function reset() {
    state.index = 0;
    state.stage = 0;
    state.done = false;
    if (courier) { courier.mesh.visible = false; }
    if (safehouse) safehouse.visible = false;
    startMission(0);
  }

  // start at mission 1
  startMission(0);

  return { state, update, reset, startMission, resumeMission, get courier() { return courier; } };
}
