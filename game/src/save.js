// Save / load through localStorage: money, mission progress, player position,
// HP and time of day. Nothing leaves the browser.
import { SAVE_KEY } from './config.js';

export function saveGame(G) {
  try {
    const p = G.player.state;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    const data = {
      money: G.money,
      missionIndex: Math.min(G.missions.state.index, 2),
      missionStage: G.missions.state.stage,
      x: Math.round(pos.x * 10) / 10,
      z: Math.round(pos.z * 10) / 10,
      hp: G.hp,
      timeOfDay: G.timeOfDay,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.x !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function hasSave() {
  return loadGame() !== null;
}
