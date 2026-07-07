// Web Audio SFX — synthesized, no assets. Lazy-init on first user gesture.
type SfxName = "pop"|"wall"|"join"|"matchStart"|"roundWin"|"matchWin"|"afkWarn"|"click"|"lowTime"|"tick"|"denied";
const MUTE_KEY = "quoridor.mute";
const VOL_KEY = "quoridor.volume";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.5;
let initialized = false;

function loadPrefs() {
  if (typeof window === "undefined") return;
  muted = localStorage.getItem(MUTE_KEY) === "1";
  const v = Number(localStorage.getItem(VOL_KEY));
  if (Number.isFinite(v) && v >= 0 && v <= 1) volume = v;
}
loadPrefs();

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
  }
  return ctx;
}
export function initSoundOnGesture() {
  if (initialized) return;
  const c = ensureCtx();
  if (c && c.state === "suspended") void c.resume();
  initialized = true;
}
export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  if (master) master.gain.value = m ? 0 : volume;
}
export function isMuted() { return muted; }
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem(VOL_KEY, String(volume));
  if (master && !muted) master.gain.value = volume;
}
export function getVolume() { return volume; }

function beep(opts: { freq: number; dur: number; type?: OscillatorType; vol?: number; slideTo?: number; delay?: number; }) {
  const c = ensureCtx();
  if (!c || muted || !master) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + opts.dur);
  const peak = opts.vol ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + opts.dur + 0.02);
}
function noiseBurst(dur: number, vol = 0.3, delay = 0) {
  const c = ensureCtx();
  if (!c || muted || !master) return;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource(); src.buffer = buffer;
  const g = c.createGain(); g.gain.value = vol;
  const filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1400;
  src.connect(filter).connect(g).connect(master);
  src.start(c.currentTime + delay);
}

// Per-sfx rate limits (ms). Prevents rapid double-clicks from stacking voices.
const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  pop: 60, wall: 60, click: 30, denied: 80, tick: 40,
  lowTime: 800, afkWarn: 400,
};
const lastPlayed: Partial<Record<SfxName, number>> = {};
export function play(name: SfxName) {
  ensureCtx();
  if (!ctx || muted) return;
  if (!master || (master.gain.value ?? 0) <= 0) return;
  // Rate-limit identical rapid triggers (e.g. double-clicks) so voices
  // don't stack and clip. Different sounds are unaffected.
  const now = ctx.currentTime * 1000;
  const last = lastPlayed[name] ?? -Infinity;
  const minGap = MIN_GAP_MS[name] ?? 40;
  if (now - last < minGap) return;
  lastPlayed[name] = now;
  switch (name) {
    // Pawn "pop" is delayed to align with the landing-bounce keyframe (~180ms
    // after the glide starts).
    case "pop":
      beep({ freq: 880, dur: 0.14, vol: 0.4, slideTo: 220, delay: 0.18 });
      noiseBurst(0.09, 0.15, 0.18);
      break;
    // Wall thunk plays at the end of the 150ms grow-in animation.
    case "wall":
      beep({ freq: 180, dur: 0.09, type: "square", vol: 0.28, slideTo: 90, delay: 0.15 });
      noiseBurst(0.05, 0.22, 0.15);
      break;
    case "join": beep({ freq: 520, dur: 0.09, type: "triangle", vol: 0.32 }); beep({ freq: 780, dur: 0.11, type: "triangle", vol: 0.32, delay: 0.09 }); break;
    case "matchStart": [523.25, 659.25, 783.99].forEach((f, i) => beep({ freq: f, dur: 0.16, type: "triangle", vol: 0.32, delay: i * 0.09 })); break;
    case "roundWin": [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep({ freq: f, dur: 0.15, vol: 0.35, delay: i * 0.08 })); break;
    case "matchWin":
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => beep({ freq: f, dur: 0.2, type: "triangle", vol: 0.38, delay: i * 0.1 }));
      beep({ freq: 1760, dur: 0.35, vol: 0.25, delay: 0.55 });
      break;
    case "afkWarn": beep({ freq: 660, dur: 0.14, type: "square", vol: 0.3 }); beep({ freq: 660, dur: 0.14, type: "square", vol: 0.3, delay: 0.22 }); break;
    case "click": beep({ freq: 1200, dur: 0.04, vol: 0.22 }); break;
    // Softer, so we can pulse it repeatedly while the clock is under 15s
    // without becoming grating.
    case "lowTime":
      beep({ freq: 880, dur: 0.09, type: "square", vol: 0.18 });
      beep({ freq: 660, dur: 0.11, type: "square", vol: 0.18, delay: 0.11 });
      break;
    case "tick":
      beep({ freq: 1500, dur: 0.05, type: "square", vol: 0.22 });
      break;
    // Short descending "nope" for illegal input.
    case "denied":
      beep({ freq: 260, dur: 0.09, type: "square", vol: 0.22, slideTo: 140 });
      noiseBurst(0.05, 0.12);
      break;
  }
}
