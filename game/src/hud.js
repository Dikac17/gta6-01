// HUD: DOM readouts (wanted stars, HP, money, objective, speed) plus a live
// 2D minimap drawn on a canvas — roads, water, buildings, player arrow,
// police, traffic and the mission objective. Toasts queue a short message.
import { CITY } from './config.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    stars: $('stars'),
    hpFill: $('hpfill'),
    money: $('money-val'),
    title: $('mission-title'),
    objective: $('objective'),
    dist: $('obj-dist'),
    wantedLabel: $('wanted-label'),
    clock: $('clock'),
    speed: $('speed'),
    vehName: $('vehname'),
    toast: $('toast'),
    msg: $('msg'),
    interact: $('interact'),
    crosshair: $('crosshair'),
    dmg: $('dmg'),
    fade: $('fade'),
    minimap: $('minimap'),
  };
  const ctx = el.minimap.getContext('2d');
  let toastTimer = 0;
  let msgTimer = 0;
  let lastStars = -1;

  function toast(text) {
    el.toast.textContent = text;
    toastTimer = 3.2;
  }
  function message(text) {
    el.msg.textContent = text;
    msgTimer = 5;
  }

  function drawMinimap() {
    const S = 400; // canvas pixels
    const half = CITY.half + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    // land
    ctx.fillStyle = '#274e63';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#5da24a';
    ctx.fillRect(0, 0, S, S);
    // water (south)
    const [, wy] = toMap(0, CITY.waterZ);
    ctx.fillStyle = '#1e90d6';
    ctx.fillRect(0, wy, S, S - wy);
    ctx.fillStyle = '#f2dfa8';
    const [, sy] = toMap(0, CITY.beachZ);
    ctx.fillRect(0, sy, S, wy - sy);
    // buildings
    ctx.fillStyle = '#3a4a5a';
    for (const b of G.city.buildings) {
      const [x, y] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      const w = (b.w / (half * 2)) * S;
      const h = (b.d / (half * 2)) * S;
      ctx.fillRect(x, y, Math.max(2, w), Math.max(2, h));
    }
    // roads
    ctx.strokeStyle = '#2b2f36';
    ctx.lineWidth = 7;
    for (const r of CITY.roadLines) {
      const [x] = toMap(r, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, y] = toMap(0, r);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // objective diamond (pulsing)
    if (G.missions.state.target) {
      const [x, y] = toMap(G.missions.state.target[0], G.missions.state.target[1]);
      const r = 9 + Math.sin(G.time * 4) * 3;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // parked / driven cars
    ctx.fillStyle = '#7ee2a8';
    for (const c of G.cars) {
      if (c.ai) continue;
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // traffic
    ctx.fillStyle = '#9ecbff';
    for (const c of G.traffic.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // police (red)
    ctx.fillStyle = '#ff4d4d';
    for (const c of G.police.cars) {
      const [x, y] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    for (const o of G.police.officers) {
      if (!o.alive) continue;
      const [x, y] = toMap(o.pos.x, o.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // player arrow
    const p = G.player.state;
    const pp = p.inCar ? p.inCar.pos : p.pos;
    const [px, py] = toMap(pp.x, pp.z);
    const yaw = p.inCar ? p.inCar.yaw : p.yaw;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(yaw), Math.cos(yaw)) + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(7, 8); ctx.lineTo(-7, 8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function update(dt) {
    const p = G.player.state;
    if (G.wanted !== lastStars) {
      lastStars = G.wanted;
      let html = '';
      for (let i = 0; i < 5; i += 1) {
        html += i < G.wanted ? '★' : '<span class="off">★</span>';
      }
      el.stars.innerHTML = html;
    }
    const hpPct = Math.max(0, Math.round((G.hp / 100) * 100));
    el.hpFill.style.width = `${hpPct}%`;
    el.hpFill.classList.toggle('low', hpPct < 35);
    el.money.textContent = String(G.money);
    el.title.textContent = G.missions.state.title || 'PALMERA BAY';
    el.objective.textContent = G.missions.state.text || '';
    el.dist.textContent = G.missions.state.dist > 0
      ? `Objective distance: ${Math.round(G.missions.state.dist)} m`
      : '';
    el.wantedLabel.classList.toggle('on', G.wanted > 0);
    const h = Math.floor(G.timeOfDay) % 24;
    const m = Math.floor((G.timeOfDay % 1) * 60);
    const day = G.timeOfDay >= 6 && G.timeOfDay < 18 ? '☀️ Day' : '🌙 Night';
    el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${day}`;
    const speedKmh = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 3.6) : Math.round(p.speed * 3.6);
    el.speed.innerHTML = `${speedKmh} <small>km/h</small>`;
    el.vehName.textContent = p.inCar ? p.inCar.name : (p.weapon === 'pistol' ? '🔫 Pistol' : '🥊 Fists');
    el.crosshair.style.display = (!p.inCar && p.weapon === 'pistol' && G.screen === 'play') ? 'block' : 'none';
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.textContent = '';
    }
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) el.msg.textContent = '';
    }
    // damage vignette fades with hp
    el.dmg.style.opacity = G.hp < 100 ? String(Math.min(0.85, (100 - G.hp) / 120 + (G.flashDmg || 0))) : '0';
    drawMinimap();
  }

  function setInteract(text) {
    if (text) {
      el.interact.textContent = text;
      el.interact.classList.add('on');
    } else {
      el.interact.classList.remove('on');
    }
  }

  return { update, toast, message, setInteract, el };
}
