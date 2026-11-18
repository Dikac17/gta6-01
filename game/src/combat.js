// Combat: fists up close, pistol hitscan at range. Hitscan is one raycast
// from the camera centre per shot — no flying bullet objects, no per-frame
// collision loop. Hitting a pedestrian is a crime; hitting a cop is a bigger
// one. Enemies flash white and fall when their HP runs out.
import * as THREE from 'three';
import { WANTED } from './config.js';

const raycaster = new THREE.Raycaster();

export function createCombat(G) {
  const tmp = new THREE.Vector3();

  function shootableTargets() {
    const list = [];
    for (const o of G.police.officers) {
      if (o.alive) list.push({ mesh: o.mesh, kind: 'cop', ref: o, hp: o.hp });
    }
    for (const p of G.traffic.peds) {
      if (p.alive) list.push({ mesh: p.mesh, kind: 'ped', ref: p, hp: p.hp });
    }
    return list;
  }

  function damage(target, amount, fromPos) {
    target.ref.hp -= amount;
    if (target.kind === 'ped') {
      target.ref.flee = 3;
      if (target.ref.hp <= 0) {
        target.ref.alive = false;
        target.ref.mesh.visible = false;
        G.police.addWanted(G, WANTED.hitPed);
        G.hud.toast('You hurt a pedestrian! Wanted up.');
      }
    } else {
      if (target.ref.hp <= 0) {
        target.ref.alive = false;
        target.ref.mesh.visible = false;
        G.stats.copsDown += 1;
        G.police.addWanted(G, WANTED.shootCop);
        G.hud.toast('Cop down!');
        G.audio.pickup();
      }
    }
    G.fx.burst(target.ref.pos || target.mesh.position, 0xffcc00, 10);
  }

  /** Pistol shot from the camera through the crosshair. */
  function shoot(camera) {
    const p = G.player.state;
    if (p.attackCd > 0 || p.inCar) return false;
    p.attackCd = 0.38;
    G.stats.shots += 1;
    G.audio.shot();
    G.fx.addTrauma(0.22);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 120;
    const targets = shootableTargets().map((t) => t.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    // muzzle flash
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    G.fx.burst(origin.clone().add(dir.clone().multiplyScalar(2)), 0xffe066, 6);
    if (hits.length === 0) return true;
    // walk up the hit object to the enemy group root
    let obj = hits[0].object;
    while (obj.parent && obj.parent !== G.scene) obj = obj.parent;
    const all = shootableTargets();
    const target = all.find((t) => t.mesh === obj);
    if (!target) return true;
    G.stats.hits += 1;
    damage(target, 34, origin);
    G.fx.burst(hits[0].point, 0xff5544, 12);
    return true;
  }

  /** Punch: short range, in front of the player. */
  function punch() {
    const p = G.player.state;
    if (p.attackCd > 0 || p.inCar) return false;
    p.attackCd = 0.45;
    G.audio.punch();
    const px = p.pos.x;
    const pz = p.pos.z;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let hitAny = false;
    for (const o of G.police.officers) {
      if (!o.alive) continue;
      const dx = o.pos.x - px;
      const dz = o.pos.z - pz;
      if (Math.hypot(dx, dz) < 2.4 && (dx * fx + dz * fz) > 0) {
        o.hp -= 18;
        hitAny = true;
        G.fx.burst(o.pos, 0xffcc00, 8);
        if (o.hp <= 0) {
          o.alive = false;
          o.mesh.visible = false;
          G.stats.copsDown += 1;
          G.police.addWanted(G, WANTED.shootCop);
          G.hud.toast('Cop down!');
        }
      }
    }
    for (const ped of G.traffic.peds) {
      if (!ped.alive) continue;
      const dx = ped.pos.x - px;
      const dz = ped.pos.z - pz;
      if (Math.hypot(dx, dz) < 2.2 && (dx * fx + dz * fz) > 0) {
        ped.hp -= 18;
        ped.flee = 3;
        hitAny = true;
        G.fx.burst(ped.pos, 0xffcc00, 8);
        if (ped.hp <= 0) {
          ped.alive = false;
          ped.mesh.visible = false;
          G.police.addWanted(G, WANTED.hitPed);
          G.hud.toast('You hurt a pedestrian! Wanted up.');
        }
      }
    }
    if (hitAny) G.fx.addTrauma(0.15);
    return hitAny;
  }

  function attack(camera) {
    const p = G.player.state;
    if (p.inCar) return false;
    return p.weapon === 'pistol' ? shoot(camera) : punch();
  }

  return { attack, shoot, punch };
}
