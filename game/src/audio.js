// Procedural sound, zero audio files: every effect is synthesized with the
// Web Audio API (oscillators + filtered noise + gain envelopes). The context
// only starts after the first user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHi = false;
  let sirenTimer = 0;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // shared noise buffer (2 s)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // engine hum
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // police siren (two-tone)
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ensure() || muted) return;
    resume();
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    ensure,
    resume,
    get muted() { return muted; },
    setMuted(v) {
      muted = v;
      if (master) master.gain.value = v ? 0 : 0.5;
    },
    shot() { noise(0.14, 0.5, 2600, 'highpass'); blip(180, 0.08, 'square', 0.18, 60); },
    punch() { noise(0.1, 0.35, 500); },
    pickup() { blip(660, 0.1, 'sine', 0.22); setTimeout(() => blip(990, 0.16, 'sine', 0.22), 90); },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110));
    },
    crash() { noise(0.35, 0.5, 700); blip(90, 0.25, 'sine', 0.3, 40); },
    click() { blip(880, 0.05, 'square', 0.12); },
    busted() { blip(220, 0.5, 'sawtooth', 0.25, 110); },
    /** Called every frame: engine pitch follows speed, siren wails while wanted. */
    update(dt, speed01, wanted) {
      if (!ctx || muted) return;
      if (engineOsc && engineGain) {
        engineOsc.frequency.value = 50 + speed01 * 130;
        engineGain.gain.value = speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0;
      }
      if (sirenOsc && sirenGain) {
        if (wanted > 0) {
          sirenTimer += dt;
          if (sirenTimer > 0.42) {
            sirenTimer = 0;
            sirenHi = !sirenHi;
            sirenOsc.frequency.value = sirenHi ? 950 : 700;
          }
          sirenGain.gain.value = 0.045;
        } else {
          sirenGain.gain.value = 0;
        }
      }
    },
  };
}
