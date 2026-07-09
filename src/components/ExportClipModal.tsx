// Server-rendered clip export modal.
//
// Live client-side canvas preview with Speed / POV / Sound controls (no
// network calls). Download: POST snapshot + options to the sign endpoint,
// get a short-lived signed token, then GET the render endpoint with that
// token. Server renders + streams the file back as a direct download.
// Sound is preview-only; the exported file has no audio track.
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

function drawRotated(canvas: HTMLCanvasElement, frame: ReplayFrame, pov: "bottom" | "top") {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  if (pov === "top") {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  }
  drawState(ctx, frame.state, canvas.width, canvas.height);
  ctx.restore();
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

  const frames = useMemo<ReplayFrame[]>(() => (snapshot ? replay(snapshot) : []), [snapshot]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPhase("preview");
    setErrorMsg(null);
    setIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open || frames.length === 0) return;
    const c = canvasRef.current;
    if (!c) return;
    drawRotated(c, frames[idx], pov);

    if (idx >= frames.length - 1) {
      const restart = window.setTimeout(() => setIdx(0), Math.round(1800 / speed));
      return () => window.clearTimeout(restart);
    }
    const isStart = frames[idx].plyIndex === -1;
    const delay = Math.round((isStart ? BASE_MS * 2 : BASE_MS) / speed);
    const t = window.setTimeout(() => {
      setIdx((i) => i + 1);
      if (sound && !isStart) {
        try {
          if (!audioRef.current) {
            const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (AC) audioRef.current = new AC();
          }
          if (audioRef.current) beep(audioRef.current, 520 + (idx % 5) * 40);
        } catch { /* ignore */ }
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [open, idx, frames, speed, pov, sound]);

  const download = useCallback(async () => {
    if (!snapshot) return;
    setPhase("rendering");
    setErrorMsg(null);
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("Your browser doesn't support video recording. Try Chrome, Edge, or Safari.");
      }
      const { mime, ext } = pickMime();
      // Offscreen high-res canvas
      const canvas = document.createElement("canvas");
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");

      const fps = 30;
      const stream = canvas.captureStream(fps);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });

      const drawFrame = (frame: ReplayFrame) => {
        ctx.save();
        if (pov === "top") {
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate(Math.PI);
        }
        drawState(ctx, frame.state, canvas.width, canvas.height);
        ctx.restore();
      };

      // Prime first frame before starting recorder so it captures a keyframe
      drawFrame(frames[0]);
      rec.start();

      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

      for (let i = 0; i < frames.length; i++) {
        drawFrame(frames[i]);
        const isStart = frames[i].plyIndex === -1;
        const isLast = i === frames.length - 1;
        const delay = isLast
          ? Math.round(1800 / speed)
          : Math.round((isStart ? BASE_MS * 2 : BASE_MS) / speed);
        await wait(delay);
      }

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