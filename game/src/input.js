// Keyboard, mouse and touch input. Held keys are read as a state object every
// frame; one-shot presses (enter car, attack, pause, ...) are queued as flags
// and taken once by the loop, so a press between two frames is never lost or
// counted twice. Touch controls write into the same state object.

export const ACT_ENTER = 1;
export const ACT_ATTACK = 2;
export const ACT_JUMP = 4;
export const ACT_PAUSE = 8;
export const ACT_WEAPON = 16;
export const ACT_DAYNIGHT = 32;
export const ACT_MUTE = 64;
export const ACT_RESTART = 128;

export function createInput() {
  const keys = Object.create(null);
  let actions = 0;
  // Analogue stick state (touch): -1..1 on both axes, x right, y up.
  const stick = { x: 0, y: 0, active: false };
  // Camera drag delta accumulated this frame (mouse drag / touch look zone).
  const look = { dx: 0, dy: 0 };
  const touchBtn = { gas: false, brake: false, run: false, attack: false };
  let pointerLocked = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      // Still allow held movement keys; one-shots ignore repeats.
      keys[event.code] = true;
      return;
    }
    keys[event.code] = true;
    switch (event.code) {
      case 'KeyE': actions |= ACT_ENTER; break;
      case 'KeyF': actions |= ACT_ATTACK; break;
      case 'Space': actions |= ACT_JUMP; event.preventDefault(); break;
      case 'KeyP': case 'Escape': actions |= ACT_PAUSE; break;
      case 'KeyQ': actions |= ACT_WEAPON; break;
      case 'KeyT': actions |= ACT_DAYNIGHT; break;
      case 'KeyM': actions |= ACT_MUTE; break;
      case 'Enter': actions |= ACT_RESTART; break;
      default: break;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys[event.code] = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    touchBtn.gas = false; touchBtn.brake = false; touchBtn.run = false; touchBtn.attack = false;
    stick.x = 0; stick.y = 0; stick.active = false;
  });

  function bindLook(el) {
    el.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') return; // touch look handled by #look-zone
      dragging = true;
      lastX = event.clientX; lastY = event.clientY;
      // Click (not drag) is the attack on desktop.
      if (event.button === 0) actions |= ACT_ATTACK;
    });
    el.addEventListener('pointermove', (event) => {
      if (pointerLocked) {
        look.dx += event.movementX || 0;
        look.dy += event.movementY || 0;
        return;
      }
      if (!dragging) return;
      look.dx += event.clientX - lastX;
      look.dy += event.clientY - lastY;
      lastX = event.clientX; lastY = event.clientY;
    });
    el.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('pointercancel', () => { dragging = false; });
  }

  // Pointer lock on the 3D canvas gives free mouse look on desktop.
  function requestLock(canvas) {
    if (isTouch) return;
    try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
  }
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement != null;
  });

  // --- Touch controls -------------------------------------------------------
  function bindStick(el, knob) {
    let pid = null;
    const rect = () => el.getBoundingClientRect();
    function moveTo(clientX, clientY) {
      const r = rect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2 - 8;
      let dx = (clientX - cx) / max;
      let dy = (clientY - cy) / max;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      stick.x = dx; stick.y = -dy; // up on screen = forward
      stick.active = true;
      knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${-dy * 34}px))`;
    }
    el.addEventListener('pointerdown', (event) => {
      pid = event.pointerId;
      el.setPointerCapture(pid);
      moveTo(event.clientX, event.clientY);
      event.preventDefault();
    });
    el.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pid) return;
      moveTo(event.clientX, event.clientY);
    });
    function end(event) {
      if (event.pointerId !== pid) return;
      pid = null;
      stick.x = 0; stick.y = 0; stick.active = false;
      knob.style.transform = 'translate(-50%, -50%)';
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function bindButton(el, name, onTap) {
    let pid = null;
    el.addEventListener('pointerdown', (event) => {
      pid = event.pointerId;
      el.setPointerCapture(pid);
      el.classList.add('on');
      if (name === 'attack') actions |= ACT_ATTACK;
      else if (name === 'enter') actions |= ACT_ENTER;
      else if (name === 'pause') actions |= ACT_PAUSE;
      else touchBtn[name] = true;
      if (onTap) onTap();
      event.preventDefault();
    });
    function end(event) {
      if (event.pointerId !== pid) return;
      pid = null;
      el.classList.remove('on');
      touchBtn[name] = false;
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function bindLookZone(el) {
    let pid = null;
    let lx = 0; let ly = 0;
    el.addEventListener('pointerdown', (event) => {
      pid = event.pointerId;
      el.setPointerCapture(pid);
      lx = event.clientX; ly = event.clientY;
      event.preventDefault();
    });
    el.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pid) return;
      look.dx += (event.clientX - lx) * 2.2;
      look.dy += (event.clientY - ly) * 2.2;
      lx = event.clientX; ly = event.clientY;
    });
    el.addEventListener('pointerup', (event) => { if (event.pointerId === pid) pid = null; });
    el.addEventListener('pointercancel', () => { pid = null; });
  }

  function bindTouch() {
    const stickEl = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    if (stickEl && knob) bindStick(stickEl, knob);
    const map = { gas: 'btn-gas', brake: 'btn-brake', enter: 'btn-enter', attack: 'btn-attack', run: 'btn-run', pause: 'btn-pause' };
    for (const [name, id] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) bindButton(el, name);
    }
    const zone = document.getElementById('look-zone');
    if (zone) bindLookZone(zone);
  }

  /** Movement intent in camera space: forward -1..1, strafe -1..1. */
  function move() {
    let fwd = 0;
    let strafe = 0;
    if (keys.KeyW || keys.ArrowUp) fwd += 1;
    if (keys.KeyS || keys.ArrowDown) fwd -= 1;
    if (keys.KeyD) strafe += 1;
    if (keys.KeyA) strafe -= 1;
    if (stick.active) { fwd += stick.y; strafe += stick.x; }
    if (touchBtn.gas) fwd += 1;
    if (touchBtn.brake) fwd -= 1;
    return { fwd: Math.max(-1, Math.min(1, fwd)), strafe: Math.max(-1, Math.min(1, strafe)) };
  }

  return {
    keys,
    stick,
    touchBtn,
    isTouch,
    bindLook,
    bindTouch,
    requestLock,
    get pointerLocked() { return pointerLocked; },
    get run() { return !!keys.ShiftLeft || !!keys.ShiftRight || touchBtn.run; },
    move,
    camTurn() {
      let turn = 0;
      if (keys.ArrowLeft) turn += 1;
      if (keys.ArrowRight) turn -= 1;
      return turn;
    },
    /** Look delta since the last call, in pixels. */
    takeLook() {
      const d = { dx: look.dx, dy: look.dy };
      look.dx = 0; look.dy = 0;
      return d;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
