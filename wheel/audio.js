// =============================================================
// wheel/audio.js — WebAudio playback for wheel SFX
//
// Three CC clips loaded once, decoded into AudioBuffers, then triggered
// per spin event. Wheel rumble during cruise is synthesized (low-pass
// filtered noise) so we don't need a fourth clip.
//
// Sources (full attribution lives in about.html):
//   peg.mp3      — CC0, Breviceps  (freesound 448086)
//   thud.mp3     — CC0, Breviceps  (freesound 449955)
//   fanfare.mp3  — CC-BY 4.0, _MC5_ (freesound 524848)
//
// AudioContext is lazily created and resumed on the first user gesture
// per browser autoplay policy. Mute state lives in storage and is
// applied to the master gain node.
// =============================================================

// Use absolute paths so this module works regardless of which subroute
// loaded it (the wheel page lives at /wheel/ but the assets are at the
// suite root).
const SOUND_FILES = {
  peg:     '/assets/sounds/wheel/peg.mp3',
  thud:    '/assets/sounds/wheel/thud.mp3',
  fanfare: '/assets/sounds/wheel/fanfare.mp3',
};

let ctx = null;
let masterGain = null;
const buffers = {};
let loadPromise = null;
let muted = false;
let rumbleSource = null;
let rumbleGain = null;

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => { /* ignore — autoplay policy */ });
    }
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  ctx = new Ctx();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : 1;
  masterGain.connect(ctx.destination);
}

/** Kick off background loading + decoding of all clips. Safe to call
 *  before any user gesture; we just create the AudioContext suspended
 *  and decode into buffers ready to play. Idempotent. */
export function preload() {
  if (loadPromise) return loadPromise;
  ensureCtx();
  if (!ctx) return Promise.resolve();
  loadPromise = Promise.all(
    Object.entries(SOUND_FILES).map(async ([name, url]) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const arr = await r.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        buffers[name] = buf;
      } catch {
        // Network or decode failure — leave the buffer undefined so
        // playback for this name is silently a no-op.
      }
    })
  );
  return loadPromise;
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = !!m;
  if (!ctx || !masterGain) return;
  // Smoothly ramp instead of step to avoid audible clicks if a buffer
  // is mid-flight when the user toggles.
  const t = ctx.currentTime;
  masterGain.gain.cancelScheduledValues(t);
  masterGain.gain.setValueAtTime(masterGain.gain.value, t);
  masterGain.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.06);
  if (muted) stopRumble();
}

/** Fire a peg-click. Slight pitch + gain jitter per call so a fast
 *  cluster (cruise phase, ~10–25 per second) doesn't sound mechanical. */
export function playPeg() {
  if (muted) return;
  ensureCtx();
  const buf = buffers.peg;
  if (!buf || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.95 + Math.random() * 0.1;
  const g = ctx.createGain();
  g.gain.value = 0.28 + Math.random() * 0.12;
  src.connect(g);
  g.connect(masterGain);
  src.start();
}

export function playThud() {
  playOnce('thud', 0.7);
}

export function playFanfare() {
  playOnce('fanfare', 0.65);
}

function playOnce(name, gain) {
  if (muted) return;
  ensureCtx();
  const buf = buffers[name];
  if (!buf || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(masterGain);
  src.start();
}

/** Start the synthesized cruise rumble. Low-pass-filtered white noise
 *  at ~100Hz with a soft fade-in so it doesn't pop. Idempotent. */
export function startRumble() {
  if (muted || rumbleSource) return;
  ensureCtx();
  if (!ctx) return;

  // 2-second loop of white noise; the lowpass filter shapes it into
  // a bassy hum when looped.
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * 2, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1);
  }

  rumbleSource = ctx.createBufferSource();
  rumbleSource.buffer = buf;
  rumbleSource.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 110;
  lowpass.Q.value = 0.8;

  rumbleGain = ctx.createGain();
  const t = ctx.currentTime;
  rumbleGain.gain.setValueAtTime(0, t);
  rumbleGain.gain.linearRampToValueAtTime(0.18, t + 0.5);

  rumbleSource.connect(lowpass);
  lowpass.connect(rumbleGain);
  rumbleGain.connect(masterGain);
  rumbleSource.start();
}

/** Fade out + stop the rumble. Called at spin-end; safe to call when
 *  no rumble is active. */
export function stopRumble() {
  if (!rumbleSource || !ctx) return;
  const src = rumbleSource;
  const gain = rumbleGain;
  rumbleSource = null;
  rumbleGain = null;
  const t = ctx.currentTime;
  if (gain) {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.35);
  }
  try {
    src.stop(t + 0.4);
  } catch {
    /* already stopped */
  }
}
