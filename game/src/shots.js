// Screenshot scenes behind ?shot=cover|play|city|night. Each one stages a real
// game state (real systems, real positions) and then advances the fixed-step
// simulation a short, fixed number of steps, so the frame is what a short
// game really looks like — and the same seed always gives the same frame.
import { STEP } from './config.js';

function driveForward(api, seconds) {
  const input = api.input;
  input.keys.KeyW = true;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) api.step(STEP);
  input.keys.KeyW = false;
}

export function stageShot(name, G, api) {
  const p = G.player.state;
  const render = api.render;

  if (name === 'cover') {
    // Police chase: player speeding in the sports car down the beach road,
    // wanted 3, two patrol cars behind, mission-3 marker ahead, minimap live.
    G.timeOfDay = 10.5;
    G.missions.startMission(2);
    G.wanted = 3;
    G.lastCrime = G.time;
    const sport = G.cars.find((c) => c.modelKey === 'sport');
    G.player.setPosition(sport.pos.x, sport.pos.z, Math.PI);
    api.enterExit();
    // point the car north along the beach road and drive
    sport.yaw = Math.PI; // facing -Z (north)
    sport.pos.set(0, 0, 70);
    p.camYaw = Math.PI;
    p.camPitch = 0.28;
    driveForward(api, 2.5);
    render();
  } else if (name === 'play') {
    // On foot, mid mission 1: first parcel drop ahead, traffic and peds around.
    // Player stands near the road corner (not deep inside the grass block)
    // and the camera sits lower, so the frame shows road and buildings
    // instead of a big empty lawn in the foreground.
    G.timeOfDay = 10.5;
    G.missions.startMission(0);
    G.player.setPosition(47, -47, Math.PI * 0.75);
    p.camYaw = Math.PI * 0.75;
    p.camPitch = 0.18;
    for (let i = 0; i < 90; i += 1) api.step(STEP);
    render();
  } else if (name === 'city') {
    // At the city-centre intersection (x=0 / z=0), looking south-west across
    // it: traffic on both roads, pedestrians on the sidewalks, buildings and
    // palms all around, sea on the far horizon. (The first pose stood inside
    // a grass block and the frame was mostly empty lawn.)
    G.timeOfDay = 14;
    G.missions.startMission(0);
    G.player.setPosition(0, 0, Math.PI * 0.75);
    p.camYaw = Math.PI * 0.75;
    p.camPitch = 0.2;
    p.camDist = 12;
    for (let i = 0; i < 240; i += 1) api.step(STEP);
    render();
  } else if (name === 'night') {
    // Night chase: mission 2, player in the taxi tailing the orange courier.
    G.timeOfDay = 22;
    G.missions.startMission(1);
    G.wanted = 2;
    G.lastCrime = G.time;
    const taxi = G.cars.find((c) => c.modelKey === 'taxi');
    G.player.setPosition(taxi.pos.x, taxi.pos.z, 0);
    api.enterExit();
    const courier = G.missions.courier;
    taxi.pos.set(courier.pos.x - 6, 0, courier.pos.z - 14);
    taxi.yaw = courier.yaw;
    p.camYaw = courier.yaw + Math.PI;
    p.camPitch = 0.26;
    driveForward(api, 2);
    render();
  } else {
    // unknown name: plain daytime street scene
    G.timeOfDay = 10.5;
    G.player.setPosition(0, 24, Math.PI);
    for (let i = 0; i < 60; i += 1) api.step(STEP);
    render();
  }
}
