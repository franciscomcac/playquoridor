// Web Audio SFX — synthesized, no assets. Lazy-init on first user gesture.
type SfxName = "pop"|"wall"|"join"|"matchStart"|"roundWin"|"matchWin"|"afkWarn"|"click"|"lowTime"|"tick"|"denied"|"searchStart"|"searchPing"|"matchFound"|"clash"|"coinToss";
const MUTE_KEY = "quoridor.mute";
const VOL_KEY = "quoridor.volume";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.5;
let initialized = false;

// User-provided MP3 sample for the radar ping. Decoded lazily on first play.
import radarPingAsset from "@/assets/radar-ping.mp3.asset.json";
import clashAsset from "@/assets/clash.mp3.asset.json";
import coinTossAsset from "@/assets/coin-toss.mp3.asset.json";
const sampleBuffers: Partial<Record<SfxName, AudioBuffer>> = {};
const sampleLoading: Partial<Record<SfxName, boolean>> = {};
const sampleUrls: Partial<Record<SfxName, string>> = {
  searchPing: radarPingAsset.url,
  clash: clashAsset.url,
  coinToss: coinTossAsset.url,
};
function loadSample(name: SfxName, c: AudioContext) {
  if (sampleBuffers[name] || sampleLoading[name]) return;
  const url = sampleUrls[name];
  if (!url) return;
  sampleLoading[name] = true;
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => c.decodeAudioData(buf))
    .then((decoded) => { sampleBuffers[name] = decoded; })
    .catch(() => {})
    .finally(() => { sampleLoading[name] = false; });
}
function playSample(name: SfxName, vol = 0.85): boolean {
  const c = ensureCtx();
  if (!c || muted || !master) return false;
  const buffer = sampleBuffers[name];
  if (!buffer) { loadSample(name, c); return false; }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(g).connect(master);
  src.start(c.currentTime);
  return true;
}

// Play a sample on loop, back-to-back, waiting for each play to finish
// before starting the next. Returns a stop() function.
export function startSampleLoop(name: SfxName, vol = 0.85): () => void {
  let stopped = false;
  let currentSrc: AudioBufferSourceNode | null = null;
  let waitTimer: number | null = null;
  const tick = () => {
    if (stopped) return;
    const c = ensureCtx();
    if (!c || muted || !master) {
      // Still muted or ctx not ready — retry shortly so the loop resumes
      // once the user unmutes or audio wakes up.
      waitTimer = window.setTimeout(tick, 500);
      return;
    }
    const buffer = sampleBuffers[name];
    if (!buffer) {
      loadSample(name, c);
      waitTimer = window.setTimeout(tick, 250);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(g).connect(master);
    src.onended = () => { if (!stopped) tick(); };
    currentSrc = src;
    src.start(c.currentTime);
  };
  tick();
  return () => {
    stopped = true;
    if (waitTimer != null) { window.clearTimeout(waitTimer); waitTimer = null; }
    if (currentSrc) { try { currentSrc.onended = null; currentSrc.stop(); } catch { /* already stopped */ } }
  };
}

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
  if (c) { loadSample("searchPing", c); loadSample("clash", c); loadSample("coinToss", c); }
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

// Cached impulse response for the radar ping tail. Small exponentially
// decaying noise buffer — cheap synthetic reverb via ConvolverNode.
let pingReverb: ConvolverNode | null = null;
function getPingReverb(c: AudioContext): ConvolverNode {
  if (pingReverb) return pingReverb;
  const seconds = 1.6;
  const rate = c.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // Exponential decay noise — bright at first, long soft tail.
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
  }
  const conv = c.createConvolver();
  conv.buffer = buf;
  pingReverb = conv;
  return conv;
}

// A single radar "ping": bright sonar chirp with a fast attack, long
// exponential decay, and a wet reverb tail routed in parallel.
function radarPing() {
  const c = ensureCtx();
  if (!c || muted || !master) return;
  const t0 = c.currentTime;
  // Dry ping: two-tone sonar (high spike into a lower body) with a
  // pronounced exponential fade so it feels like it decays into space.
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1760, t0);
  osc.frequency.exponentialRampToValueAtTime(640, t0 + 0.9);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
  // A gentle band-pass keeps the tail from sounding flabby.
  const bp = c.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.4;
  osc.connect(bp).connect(g);
  // Route wet + dry in parallel so the reverb tail continues after the
  // dry signal has faded — that's what gives it the "space" feel.
  const dryGain = c.createGain(); dryGain.gain.value = 0.85;
  const wetGain = c.createGain(); wetGain.gain.value = 0.55;
  g.connect(dryGain).connect(master);
  g.connect(getPingReverb(c)).connect(wetGain).connect(master);
  osc.start(t0);
  osc.stop(t0 + 1.2);
}

// Per-sfx rate limits (ms). Prevents rapid double-clicks from stacking voices.
const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  pop: 60, wall: 60, click: 30, denied: 80, tick: 40,
  lowTime: 800, afkWarn: 400, searchPing: 900, searchStart: 400, matchFound: 400,
  clash: 200, coinToss: 200,
};
const lastPlayed: Partial<Record<SfxName, number>> = {};

// Spinning-wheel sound: decelerating tick-tick-tick synced to the caller's
// spin duration, then a landing "ding". Used by the 4-player round start.
// steps: number of ticks matching the visual spin cycle count.
// durationMs: total spin length in ms (ticks are distributed with the same
// quadratic decel curve as the visual, so audio and visual land together).
export function playWheelSpin(steps: number, durationMs: number) {
  const c = ensureCtx();
  if (!c || muted || !master) return;
  // Distribute step delays with quadratic ease-out, then normalise so the
  // sum equals durationMs — audio always lands exactly with the visual.
  const weights: number[] = [];
  for (let i = 0; i < steps; i++) weights.push(1 + i * i * 0.06);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const t0 = c.currentTime;
  let acc = 0;
  for (let i = 0; i < steps; i++) {
    acc += (weights[i] / wsum) * (durationMs / 1000);
    const when = t0 + acc;
    // Ratchet-style click: short pitched blip + tiny noise transient. Pitch
    // rises slightly across the spin so the deceleration is audible.
    const pitch = 1400 + (i / Math.max(1, steps - 1)) * 500;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(pitch, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.22, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(g).connect(master);
    osc.start(when); osc.stop(when + 0.07);
    // Tiny noise transient for the mechanical clack.
    const nlen = Math.max(1, Math.floor(c.sampleRate * 0.015));
    const nbuf = c.createBuffer(1, nlen, c.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let k = 0; k < nlen; k++) nd[k] = (Math.random() * 2 - 1) * (1 - k / nlen);
    const nsrc = c.createBufferSource(); nsrc.buffer = nbuf;
    const ng = c.createGain(); ng.gain.value = 0.12;
    const nf = c.createBiquadFilter(); nf.type = "highpass"; nf.frequency.value = 2200;
    nsrc.connect(nf).connect(ng).connect(master);
    nsrc.start(when);
  }
  // Landing "ding" right when the wheel stops.
  const dingAt = t0 + durationMs / 1000 + 0.02;
  [988, 1319, 1760].forEach((f, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, dingAt);
    g.gain.setValueAtTime(0.0001, dingAt);
    g.gain.exponentialRampToValueAtTime(0.32 - i * 0.06, dingAt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, dingAt + 0.45);
    osc.connect(g).connect(master!);
    osc.start(dingAt); osc.stop(dingAt + 0.5);
  });
}
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
    // Matchmaking: soft upward chirp when the search begins.
    case "searchStart":
      beep({ freq: 420, dur: 0.12, type: "sine", vol: 0.22, slideTo: 780 });
      beep({ freq: 620, dur: 0.14, type: "triangle", vol: 0.16, slideTo: 980, delay: 0.09 });
      break;
    // Radar-style ping while queued; quiet enough to loop.
    case "searchPing":
      if (!playSample("searchPing", 0.85)) radarPing();
      break;
    case "clash":
      playSample("clash", 0.95);
      break;
    case "coinToss":
      playSample("coinToss", 0.9);
      break;
    // Bright confirmation when an opponent is found.
    case "matchFound":
      [523.25, 783.99, 1046.5].forEach((f, i) =>
        beep({ freq: f, dur: 0.14, type: "triangle", vol: 0.32, delay: i * 0.07 }),
      );
      beep({ freq: 1568, dur: 0.18, type: "sine", vol: 0.22, delay: 0.24 });
      break;
  }
}
