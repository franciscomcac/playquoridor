// Server-rendered clip export modal.
//
// Fully client-side: replay is rendered into a canvas on a fixed 30fps
// tick loop for both the live preview and the MP4/WebM export. MediaRecorder
// only samples a canvas.captureStream when the canvas actually changes, so
// we redraw every tick — that's what keeps the exported video smooth.
// Scene timeline includes round title cards and a confetti finale.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchSnapshot } from "@/lib/matchHistory";
import { drawState, replay, type ReplayFrame } from "@/lib/matchReplay";

type Props = {
  open: boolean;
  snapshot: MatchSnapshot | null;
  onClose: () => void;
  filename?: string;
};

type Phase = "preview" | "rendering" | "done" | "error";

const PREVIEW_W = 360;
const PREVIEW_H = 640;
const EXPORT_W = 1080;
const EXPORT_H = 1920;
const BASE_MS = 500;
const FINALE_MS = 1800;
const ROUND_TITLE_MS = 1300;
const FPS = 30;
const TICK_MS = Math.round(1000 / FPS);
const CONFETTI_COLORS = ["#f59e0b", "#ec4899", "#8b5cf6", "#22d3ee", "#34d399", "#f43f5e", "#fbbf24"];

type Confetto = { x: number; vx: number; vy: number; g: number; rot: number; vr: number; size: number; color: string; shape: 0 | 1; };

function makeConfetti(w: number, count = 90): Confetto[] {
  const arr: Confetto[] = [];
  // Deterministic seeded RNG so preview & export match
  let s = 1337;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < count; i++) {
    arr.push({
      x: rnd() * w,
      vx: (rnd() - 0.5) * w * 0.4,
      vy: -rnd() * w * 0.9 - w * 0.4,
      g: w * 1.6,
      rot: rnd() * Math.PI * 2,
      vr: (rnd() - 0.5) * 8,
      size: w * (0.012 + rnd() * 0.018),
      color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
      shape: rnd() > 0.5 ? 1 : 0,
    });
  }
  return arr;
}

function drawConfetti(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, parts: Confetto[]) {
  for (const p of parts) {
    const x = p.x + p.vx * t;
    const y = h * 0.75 + p.vy * t + 0.5 * p.g * t * t;
    const rot = p.rot + p.vr * t;
    if (y > h + 40) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = p.color;
    if (p.shape === 0) {
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function beep(ctx: AudioContext, freq = 620, ms = 55) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.value = 0.06;
  osc.connect(gain).connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number, frame: ReplayFrame, pov: "bottom" | "top") {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const size = Math.min(w, h);
  const ox = (w - size) / 2;
  const oy = (h - size) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  if (pov === "top") {
    ctx.translate(size, size);
    ctx.rotate(Math.PI);
  }
  drawState(ctx, frame.state, size, size);
  ctx.restore();
}

function drawRoundTitle(ctx: CanvasRenderingContext2D, w: number, h: number, roundIndex: number, totalRounds: number, progress: number) {
  // Solid black backdrop
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  // Fade in + slight scale
  const alpha = progress < 0.15 ? progress / 0.15 : progress > 0.85 ? (1 - progress) / 0.15 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Small kicker
  ctx.fillStyle = "rgba(245, 158, 11, 0.85)";
  ctx.font = `700 ${Math.round(w * 0.055)}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto`;
  ctx.fillText(`ROUND ${roundIndex + 1}`, w / 2, h / 2 - w * 0.06);
  // Big divider
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, h / 2 - w * 0.01);
  ctx.lineTo(w * 0.75, h / 2 - w * 0.01);
  ctx.stroke();
  // Sub label
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 ${Math.round(w * 0.032)}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto`;
  ctx.fillText(`of ${totalRounds}`, w / 2, h / 2 + w * 0.035);
  ctx.restore();
}

type Scene =
  | { kind: "roundTitle"; roundIndex: number; totalRounds: number; ms: number }
  | { kind: "frame"; frame: ReplayFrame; ms: number; playSound: boolean; soundKey: number }
  | { kind: "finale"; frame: ReplayFrame; ms: number };

function buildTimeline(frames: ReplayFrame[], speed: number): { scenes: Scene[]; totalMs: number } {
  const scenes: Scene[] = [];
  if (frames.length === 0) return { scenes, totalMs: 0 };
  const totalRounds = (frames[frames.length - 1].roundIndex ?? 0) + 1;
  let prevRound = -1;
  let soundKey = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.roundIndex !== prevRound) {
      scenes.push({ kind: "roundTitle", roundIndex: f.roundIndex, totalRounds, ms: Math.round(ROUND_TITLE_MS / speed) });
      prevRound = f.roundIndex;
    }
    const isStart = f.plyIndex === -1;
    const isLast = i === frames.length - 1;
    if (isLast) {
      scenes.push({ kind: "finale", frame: f, ms: Math.round(FINALE_MS / speed) });
    } else {
      scenes.push({
        kind: "frame",
        frame: f,
        ms: Math.round((isStart ? BASE_MS * 2 : BASE_MS) / speed),
        playSound: !isStart,
        soundKey: soundKey++,
      });
    }
  }
  const totalMs = scenes.reduce((s, x) => s + x.ms, 0);
  return { scenes, totalMs };
}

function renderAt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scenes: Scene[],
  elapsed: number,
  pov: "bottom" | "top",
  confetti: Confetto[],
  speed: number,
): { sceneIndex: number; sceneLocalMs: number } {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (elapsed < acc + s.ms) {
      const local = elapsed - acc;
      if (s.kind === "roundTitle") {
        drawRoundTitle(ctx, w, h, s.roundIndex, s.totalRounds, local / s.ms);
      } else if (s.kind === "frame") {
        drawBoard(ctx, w, h, s.frame, pov);
      } else {
        drawBoard(ctx, w, h, s.frame, pov);
        drawConfetti(ctx, w, h, (local / 1000) * speed, confetti);
      }
      return { sceneIndex: i, sceneLocalMs: local };
    }
    acc += s.ms;
  }
  // past end: render last scene fully
  const s = scenes[scenes.length - 1];
  if (s.kind === "roundTitle") drawRoundTitle(ctx, w, h, s.roundIndex, s.totalRounds, 1);
  else if (s.kind === "frame") drawBoard(ctx, w, h, s.frame, pov);
  else { drawBoard(ctx, w, h, s.frame, pov); drawConfetti(ctx, w, h, (s.ms / 1000) * speed, confetti); }
  return { sceneIndex: scenes.length - 1, sceneLocalMs: s.ms };
}

function pickMime(): { mime: string; ext: string } {
  const candidates = [
    { mime: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9", ext: "webm" },
    { mime: "video/webm;codecs=vp8", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "", ext: "webm" };
}

export function ExportClipModal({ open, snapshot, onClose, filename }: Props) {
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [pov, setPov] = useState<"bottom" | "top">("bottom");
  const [sound, setSound] = useState<boolean>(true);
  const [phase, setPhase] = useState<Phase>("preview");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const frames = useMemo<ReplayFrame[]>(() => (snapshot ? replay(snapshot) : []), [snapshot]);
  const timeline = useMemo(() => buildTimeline(frames, speed), [frames, speed]);

  useEffect(() => {
    if (!open) return;
    setPhase("preview");
    setErrorMsg(null);
  }, [open]);

  // Preview rAF loop — drives the same timeline the exporter uses.
  useEffect(() => {
    if (!open || phase === "rendering") return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx || timeline.scenes.length === 0) return;
    const confetti = makeConfetti(c.width);
    const start = performance.now();
    let lastSoundKey = -1;
    const loop = (now: number) => {
      const elapsed = (now - start) % Math.max(1, timeline.totalMs);
      const { sceneIndex } = renderAt(ctx, c.width, c.height, timeline.scenes, elapsed, pov, confetti, speed);
      // Sound triggers on scene entry
      const scene = timeline.scenes[sceneIndex];
      if (sound && scene.kind === "frame" && scene.playSound && scene.soundKey !== lastSoundKey) {
        lastSoundKey = scene.soundKey;
        try {
          if (!audioRef.current) {
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AC) audioRef.current = new AC();
          }
          if (audioRef.current) beep(audioRef.current, 520 + (scene.soundKey % 5) * 40);
        } catch { /* ignore */ }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [open, phase, timeline, pov, speed, sound]);

  const download = useCallback(async () => {
    if (!snapshot) return;
    setPhase("rendering");
    setErrorMsg(null);
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("Your browser doesn't support video recording. Try Chrome, Edge, or Safari.");
      }
      const { mime, ext } = pickMime();
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");

      const stream = canvas.captureStream(FPS);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });

      const { scenes, totalMs } = buildTimeline(frames, speed);
      const confetti = makeConfetti(canvas.width);
      // Prime first frame so recorder gets a keyframe.
      renderAt(ctx, canvas.width, canvas.height, scenes, 0, pov, confetti, speed);
      rec.start();

      // Drive at real time using rAF so MediaRecorder sees ~30 unique frames/sec.
      const startTs = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          const now = performance.now();
          const elapsed = now - startTs;
          if (elapsed >= totalMs) {
            // Ensure final scene fully drawn
            renderAt(ctx, canvas.width, canvas.height, scenes, totalMs - 1, pov, confetti, speed);
            resolve();
            return;
          }
          renderAt(ctx, canvas.width, canvas.height, scenes, elapsed, pov, confetti, speed);
          // requestFrame nudges MediaRecorder in case content is judged unchanged
          const track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
          track?.requestFrame?.();
          setTimeout(tick, TICK_MS);
        };
        tick();
      });

      rec.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunks, { type: mime || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? `quoridor-clip.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setPhase("done");
    } catch (e) {
      console.error("clip download failed", e);
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setPhase("error");
    }
  }, [snapshot, speed, pov, frames, filename]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export clip"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg max-h-[95vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-300">Export clip</h2>
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:bg-white/5"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex flex-col items-center">
          <div className="rounded-xl border border-white/10 bg-black p-2">
            <canvas
              ref={canvasRef}
              width={PREVIEW_W}
              height={PREVIEW_H}
              className="block rounded-md"
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
            />
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-zinc-500">
            Live preview - 9:16 - {frames.length} frames - Export: 1080x1920 MP4
          </p>
        </div>

        <fieldset className="mt-4 space-y-3" disabled={phase === "rendering"}>
          <Row label="Speed">
            {([0.5, 1, 2] as const).map((s) => (
              <SegBtn key={s} active={speed === s} onClick={() => setSpeed(s)}>{s}x</SegBtn>
            ))}
          </Row>
          <Row label="POV">
            <SegBtn active={pov === "bottom"} onClick={() => setPov("bottom")}>Bottom</SegBtn>
            <SegBtn active={pov === "top"} onClick={() => setPov("top")}>Top</SegBtn>
          </Row>
          <Row label="Sound">
            <SegBtn active={sound} onClick={() => setSound(true)}>On</SegBtn>
            <SegBtn active={!sound} onClick={() => setSound(false)}>Off</SegBtn>
            <span className="ml-2 text-[10px] text-zinc-500">Preview only</span>
          </Row>
        </fieldset>

        <div className="sticky bottom-0 mt-4 -mx-4 -mb-4 rounded-b-2xl border-t border-white/10 bg-zinc-950/95 px-4 py-3 backdrop-blur">
          {phase === "preview" && (
            <button
              onClick={download}
              disabled={!snapshot || frames.length === 0}
              className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold uppercase tracking-widest text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              Download clip
            </button>
          )}
          {phase === "rendering" && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-100">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                Rendering on server...
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                You can close this and keep playing - your clip will finish downloading in the background.
              </p>
            </div>
          )}
          {phase === "done" && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-center text-sm text-emerald-300">
              Clip downloaded
              <button onClick={() => setPhase("preview")} className="ml-3 text-xs underline">Export another</button>
            </div>
          )}
          {phase === "error" && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-center text-xs text-rose-300">
              <p className="font-medium">Render failed</p>
              {errorMsg && <p className="mt-1 opacity-80">{errorMsg}</p>}
              <button onClick={() => setPhase("preview")} className="mt-2 rounded-md border border-rose-500/40 px-3 py-1 text-xs hover:bg-rose-500/10">
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-2.5 py-1 text-xs font-medium transition " +
        (active
          ? "bg-emerald-500 text-emerald-950"
          : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.07]")
      }
    >
      {children}
    </button>
  );
}