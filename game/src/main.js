// PALMERA BAY — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// Screens: title, play, paused, game over, victory.
//
// ?seed=N fixes the city. ?shot=cover|play|city|night (with &seed=N) stages
// that scene instead of running the loop, renders it, and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CITY, STEP, MONEY_START, PLAYER } from './config.js';
import { createRandom } from './random.js';
import { createInput, ACT_ENTER, ACT_ATTACK, ACT_JUMP, ACT_PAUSE, ACT_WEAPON, ACT_DAYNIGHT, ACT_MUTE, ACT_RESTART } from './input.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { makeCar, driveCar, nearestEnterable } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CITY.seedDefault;

// --- Renderer / scene --------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x9fd8ef, 90, 320);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 4, 32);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2cc, 1.7);
sun.position.set(60, 90, 40);
scene.add(sun);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Shared game state -------------------------------------------------------
const rng = createRandom(seed);
const G = {
  scene, camera, renderer, rng, seed,
  time: 0,
  timeOfDay: 10.5,
  screen: 'title', // title | play | paused | over | win
  money: MONEY_START,
  hp: PLAYER.maxHp,
  wanted: 0,
  wantedTimer: 0,
  lastCrime: -999,
  flashDmg: 0,
  muted: false,
  stats: { missionsDone: 0, carsStolen: 0, copsDown: 0, shots: 0, hits: 0, pedsHit: 0 },
  city: null,
  cars: [], // parked / drivable
  player: null,
  traffic: null,
  police: null,
  missions: null,
  combat: null,
  hud: null,
  audio: null,
  fx: null,
  input: null,
  endReason: '',
  saveTimer: 0,
  pedCrimeCd: 0,
};

G.city = buildCity(scene, rng);
G.player = createPlayer(scene);
G.traffic = createTraffic(scene, rng, G.city.colliders);
G.police = createPolice(scene, rng, G.city.colliders);
G.audio = createAudio();
G.fx = createFx(scene);
G.hud = createHud(G);
G.missions = createMissions(scene, rng, G);
G.combat = createCombat(G);
G.input = createInput();
G.input.bindLook(renderer.domElement);
G.input.bindTouch();

// parked, stealable cars around the city (model, x, z, yaw)
const parkedSpawns = [
  ['sedan', 5.5, 12, 0],
  ['taxi', -45.5, 30, Math.PI / 2],
  ['pickup', 45.5, -60, 0],
  ['sport', 85.5, 10, Math.PI],
  ['van', -5.5, 60, Math.PI],
  ['sedan', 35.5, 84, Math.PI / 2],
];
for (const [model, x, z, yaw] of parkedSpawns) {
  const car = makeCar(scene, model, x, z, yaw, { parked: true });
  car.spawn = [x, z, yaw];
  G.cars.push(car);
}

G.player.setPosition(0, 24, Math.PI);

// --- Day / night --------------------------------------------------------------
function applySky() {
  const t = G.timeOfDay;
  const day = t >= 6 && t < 18;
  const sunAngle = ((t - 6) / 12) * Math.PI; // 0 at 06:00, PI at 18:00
  const elev = Math.sin(sunAngle);
  const dayF = day ? Math.max(0.12, elev) : 0;
  sun.position.set(Math.cos(sunAngle) * 90, Math.max(8, elev * 90), 45);
  sun.intensity = day ? 0.4 + dayF * 1.4 : 0.22;
  sun.color.setHex(day ? 0xfff2cc : 0x9db8ff);
  hemi.intensity = day ? 0.55 + dayF * 0.45 : 0.28;
  const skyDay = new THREE.Color(0x87ceeb);
  const skyNight = new THREE.Color(0x0b1026);
  const fogDay = new THREE.Color(0x9fd8ef);
  const fogNight = new THREE.Color(0x0d1526);
  const f = day ? Math.min(1, Math.max(0, elev * 1.4)) : 0;
  scene.background.copy(skyNight).lerp(skyDay, f);
  scene.fog.color.copy(fogNight).lerp(fogDay, f);
  scene.fog.near = day ? 90 : 60;
  scene.fog.far = day ? 320 : 200;
}

// --- Screens ------------------------------------------------------------------
const menuStart = document.getElementById('menu-start');
const menuPause = document.getElementById('menu-pause');
const menuEnd = document.getElementById('menu-end');
const btnContinue = document.getElementById('btn-continue');
btnContinue.style.display = hasSave() ? '' : 'none';

function showOnly(el) {
  for (const m of [menuStart, menuPause, menuEnd]) m.classList.add('hidden');
  if (el) el.classList.remove('hidden');
}

function startGame(fresh) {
  if (fresh) {
    resetWorld();
    clearSave();
  }
  G.screen = 'play';
  showOnly(null);
  G.audio.ensure();
  G.audio.resume();
  G.hud.toast('Welcome to Palmera Bay, Rico!');
  G.hud.message('Follow the yellow marker on the minimap for your first mission.');
}

function pauseGame() {
  if (G.screen !== 'play') return;
  G.screen = 'paused';
  document.getElementById('pause-stats').textContent =
    `Money $${G.money} · Missions ${G.stats.missionsDone}/3 done · Wanted ${'★'.repeat(G.wanted) || '—'}`;
  showOnly(menuPause);
  saveGame(G);
}

function resumeGame() {
  if (G.screen !== 'paused') return;
  G.screen = 'play';
  showOnly(null);
  G.audio.resume();
}

function gameOver(reason) {
  if (G.screen === 'over' || G.screen === 'win') return;
  G.screen = 'over';
  G.endReason = reason;
  G.audio.busted();
  document.getElementById('end-title').textContent = reason === 'busted' ? 'BUSTED!' : 'GAME OVER';
  document.getElementById('end-text').textContent = reason === 'busted'
    ? 'The police caught you on the streets of Palmera Bay. Mama Rosa won\'t pay your bail... this time.'
    : 'You ran out of strength on the streets of Palmera Bay. This city shows no mercy.';
  document.getElementById('end-stats').innerHTML =
    `Money: $${G.money}<br>Missions done: ${G.stats.missionsDone}/3<br>Cars stolen: ${G.stats.carsStolen}<br>Cops taken down: ${G.stats.copsDown}`;
  showOnly(menuEnd);
  clearSave();
}
G.gameOver = gameOver;

function win() {
  if (G.screen === 'win') return;
  G.screen = 'win';
  document.getElementById('end-title').textContent = '🏆 PALMERA BAY LEGEND!';
  document.getElementById('end-text').textContent =
    'All missions complete! Mama Rosa made you her right hand. Palmera Bay is your city now, Rico.';
  document.getElementById('end-stats').innerHTML =
    `Final money: $${G.money}<br>Missions done: 3/3<br>Cars stolen: ${G.stats.carsStolen}<br>Cops taken down: ${G.stats.copsDown}`;
  showOnly(menuEnd);
  clearSave();
}
G.win = win;

function resetWorld() {
  G.money = MONEY_START;
  G.hp = PLAYER.maxHp;
  G.wanted = 0;
  G.wantedTimer = 0;
  G.lastCrime = -999;
  G.flashDmg = 0;
  G.timeOfDay = 10.5;
  G.stats = { missionsDone: 0, carsStolen: 0, copsDown: 0, shots: 0, hits: 0, pedsHit: 0 };
  G.player.state.busted = 0;
  G.player.state.inCar = null;
  G.player.state.weapon = 'pistol';
  G.player.setPosition(0, 24, Math.PI);
  for (const car of G.cars) {
    car.pos.set(car.spawn[0], 0, car.spawn[1]); // spawn = [x, z, yaw]
    car.yaw = car.spawn[2];
    car.speed = 0;
    car.driven = false;
    car.stolen = false;
    car.mesh.rotation.y = car.yaw;
    car.mesh.visible = true;
  }
  for (const p of G.traffic.peds) {
    p.alive = true;
    p.hp = 30;
    p.flee = 0;
    p.mesh.visible = true;
  }
  G.police.clear();
  G.missions.reset();
  applySky();
}

// --- Enter / exit car -----------------------------------------------------------
function tryEnterExit() {
  const p = G.player.state;
  if (p.inCar) {
    const car = p.inCar;
    car.driven = false;
    car.speed = 0;
    p.inCar = null;
    // step out to the side
    const sx = car.pos.x + Math.cos(car.yaw) * 2.6;
    const sz = car.pos.z - Math.sin(car.yaw) * 2.6;
    p.pos.set(sx, 0, sz);
    G.player.group.visible = true;
    G.audio.click();
    return;
  }
  const car = nearestEnterable(G.cars, p.pos.x, p.pos.z);
  if (!car) return;
  p.inCar = car;
  car.driven = true;
  G.player.group.visible = false;
  if (car.parked && !car.stolen) {
    car.stolen = true;
    G.stats.carsStolen += 1;
    G.police.addWanted(G, 1);
    G.hud.toast(`You stole the ${car.name}! The police have been alerted.`);
    G.audio.busted();
  } else {
    G.hud.toast(`Driving the ${car.name}.`);
  }
  G.audio.ensure();
}

// --- One fixed step ----------------------------------------------------------------
function step(dt, actions = 0) {
  G.time += dt;
  G.timeOfDay = (G.timeOfDay + dt * (24 / 480)) % 24;
  const input = G.input;
  const p = G.player.state;

  if (actions & ACT_DAYNIGHT) {
    G.timeOfDay = G.timeOfDay >= 6 && G.timeOfDay < 18 ? 22 : 10.5;
    G.hud.toast(G.timeOfDay >= 6 && G.timeOfDay < 18 ? '☀️ Daytime' : '🌙 Nighttime');
  }
  if (actions & ACT_MUTE) {
    G.muted = !G.muted;
    G.audio.setMuted(G.muted);
    G.hud.toast(G.muted ? '🔇 Sound off' : '🔊 Sound on');
  }
  if (actions & ACT_WEAPON) {
    p.weapon = p.weapon === 'pistol' ? 'fist' : 'pistol';
    G.hud.toast(p.weapon === 'pistol' ? '🔫 Pistol ready' : '🥊 Fists ready');
  }
  if (actions & ACT_ENTER) tryEnterExit();
  if (actions & ACT_ATTACK) G.combat.attack(camera);

  const move = input.move();
  const look = input.takeLook();
  const camTurn = input.camTurn();

  // --- player / car ---
  if (p.inCar) {
    const car = p.inCar;
    const crashed = driveCar(car, move.fwd, move.strafe, dt, G.city.colliders, [...G.cars, ...G.traffic.cars, ...G.police.cars]);
    if (crashed) {
      G.audio.crash();
      G.fx.addTrauma(0.45);
      G.fx.burst(car.pos, 0xffaa33, 14);
      G.hp = Math.max(0, G.hp - CAR_CRASH_DMG);
      G.flashDmg = 0.5;
    }
    // running over pedestrians with the car
    if (Math.abs(car.speed) > 4 && G.pedCrimeCd <= 0) {
      for (const ped of G.traffic.peds) {
        if (!ped.alive) continue;
        if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2.2) {
          ped.alive = false;
          ped.mesh.visible = false;
          G.stats.pedsHit += 1;
          G.pedCrimeCd = 5;
          G.police.addWanted(G, 1);
          G.hud.toast('You ran over a pedestrian! Wanted up.');
          G.audio.crash();
          G.fx.addTrauma(0.5);
          G.fx.burst(ped.pos, 0xff5544, 16);
          break;
        }
      }
    }
    // camera stays free while driving; no snap
  } else {
    const jump = !!(actions & ACT_JUMP);
    G.player.update(dt, move, input.run, jump, G.city.colliders);
    // traffic car hits the player on foot
    for (const car of G.traffic.cars) {
      if (Math.abs(car.speed) > 3 && Math.hypot(car.pos.x - p.pos.x, car.pos.z - p.pos.z) < 2) {
        if (p.invuln <= 0) {
          p.invuln = 1;
          G.hp = Math.max(0, G.hp - 10);
          G.flashDmg = 0.6;
          G.fx.addTrauma(0.6);
          G.audio.crash();
          p.pos.x += Math.sin(car.yaw) * 2;
          p.pos.z += Math.cos(car.yaw) * 2;
        }
      }
    }
  }

  // --- world systems ---
  const playerPos = p.inCar ? p.inCar.pos : p.pos;
  const playerSpeed = p.inCar ? Math.abs(p.inCar.speed) : p.speed;
  const allCars = [...G.cars, ...G.traffic.cars, ...G.police.cars];
  G.traffic.update(dt, playerPos, !!p.inCar, playerSpeed, allCars);
  const policeEvents = G.police.update(dt, G);
  if (policeEvents.rammed) {
    G.hp = Math.max(0, G.hp - 5);
    G.flashDmg = 0.5;
    G.fx.addTrauma(0.5);
    G.audio.crash();
  }
  if (policeEvents.punched) {
    G.hp = Math.max(0, G.hp - 8);
    G.flashDmg = 0.6;
    G.fx.addTrauma(0.4);
    G.audio.punch();
  }
  if (policeEvents.busted) gameOver('busted');
  G.missions.update(dt, playerPos);
  G.fx.update(dt);
  G.audio.update(dt, p.inCar ? Math.abs(p.inCar.speed) / 34 : 0, G.wanted);

  // --- hp regen when calm, death check ---
  if (G.wanted === 0 && G.hp > 0) G.hp = Math.min(PLAYER.maxHp, G.hp + 1.5 * dt);
  if (G.hp <= 0) gameOver('wasted');
  if (G.flashDmg > 0) G.flashDmg = Math.max(0, G.flashDmg - dt * 1.5);
  if (G.pedCrimeCd > 0) G.pedCrimeCd -= dt;

  // --- camera + sky ---
  G.player.updateCamera(dt, camera, look.dx, look.dy, camTurn, G.city.colliders, G.fx.shake());
  applySky();

  // --- interact prompt ---
  if (!p.inCar) {
    const near = nearestEnterable(G.cars, p.pos.x, p.pos.z);
    G.hud.setInteract(near ? `E — ENTER ${near.name.toUpperCase()}` : null);
  } else {
    G.hud.setInteract('E — EXIT VEHICLE');
  }

  // --- autosave ---
  G.saveTimer += dt;
  if (G.saveTimer > 12) {
    G.saveTimer = 0;
    saveGame(G);
  }
}

const CAR_CRASH_DMG = 6;

// --- Main loop --------------------------------------------------------------------
let accumulator = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  // One-shot actions are taken once per frame here (not inside step), so a
  // pause press while paused is never stuck in the queue.
  const actions = G.input.takeActions();
  if (actions & ACT_PAUSE) {
    if (G.screen === 'play') pauseGame();
    else if (G.screen === 'paused') resumeGame();
  }
  if (G.screen === 'play') {
    let first = true;
    while (accumulator >= STEP && G.screen === 'play') {
      step(STEP, first ? actions : 0);
      first = false;
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
    // title screen: slow orbit around the city so the menu is alive
    if (G.screen === 'title') {
      const t = performance.now() / 1000;
      camera.position.set(Math.sin(t * 0.05) * 90, 42, Math.cos(t * 0.05) * 90);
      camera.lookAt(0, 0, 0);
      applySky();
    }
  }
  G.hud.update(1 / 60);
  renderer.render(scene, camera);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play') pauseGame();
});

// --- Buttons ------------------------------------------------------------------------
document.getElementById('btn-play').addEventListener('click', () => startGame(true));
document.getElementById('btn-continue').addEventListener('click', () => {
  const data = loadGame();
  startGame(false);
  if (data) {
    G.money = data.money;
    G.hp = data.hp;
    G.timeOfDay = data.timeOfDay;
    G.player.setPosition(data.x, data.z, Math.PI);
    G.missions.resumeMission(data.missionIndex, data.missionStage);
    G.hud.toast('Save loaded. Welcome back, Rico!');
  }
});
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => startGame(true));
document.getElementById('btn-quit-menu').addEventListener('click', () => {
  G.screen = 'title';
  showOnly(menuStart);
  btnContinue.style.display = hasSave() ? '' : 'none';
});
document.getElementById('btn-again').addEventListener('click', () => startGame(true));
document.getElementById('btn-end-menu').addEventListener('click', () => {
  G.screen = 'title';
  showOnly(menuStart);
});
renderer.domElement.addEventListener('click', () => {
  if (G.screen === 'play') G.input.requestLock(renderer.domElement);
});

// --- Debug / test handle --------------------------------------------------------------
window.__game = {
  G,
  get screen() { return G.screen; },
  get drawCalls() { return renderer.info.render.calls; },
  get triangles() { return renderer.info.render.triangles; },
  start: () => startGame(true),
  pause: pauseGame,
  resume: resumeGame,
  enterExit: tryEnterExit,
  teleport: (x, z) => {
    const p = G.player.state;
    if (p.inCar) { p.inCar.pos.set(x, 0, z); }
    else G.player.setPosition(x, z);
  },
  setWanted: (n) => {
    G.wanted = n;
    G.lastCrime = G.time;
    const p = G.player.state;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    G.lastKnown = { x: pos.x, z: pos.z };
  },
  setTime: (h) => { G.timeOfDay = h; applySky(); },
  setMoney: (n) => { G.money = n; },
  setHp: (n) => { G.hp = n; },
  setMission: (i) => G.missions.startMission(i),
  step: (n) => { for (let k = 0; k < n; k += 1) step(STEP); },
  save: () => saveGame(G),
  load: loadGame,
};

// --- Shot mode / normal boot ------------------------------------------------------------
if (shotName) {
  showOnly(null);
  G.screen = 'play';
  stageShot(shotName, G, { step, render: () => renderer.render(scene, camera), enterExit: tryEnterExit, input: G.input });
  // paint the HUD once (stars, money, objective, minimap) before the capture
  G.hud.update(0.1);
  // settle: render a couple of frames so lights/fog apply
  renderer.render(scene, camera);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  applySky();
  showOnly(menuStart);
  requestAnimationFrame(frame);
}
