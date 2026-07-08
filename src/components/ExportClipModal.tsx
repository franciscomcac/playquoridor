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
import type { ClipRenderOptions } from "@/lib/clipRender/schema";

type Props = {
  open: boolean;
  snapshot: MatchSnapshot | null;
  onClose: () => void;
  filename?: string;
};

type Phase = "preview" | "rendering" | "done" | "error";

const PREVIEW_W = 270;
const PREVIEW_H = 480;
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
      const options: ClipRenderOptions = { aspect: "9:16", speed, pov, sound };
      const signRes = await fetch("/api/clip/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, options }),
      });
      if (!signRes.ok) {
        const body = await signRes.text().catch(() => "");
        throw new Error(`Sign failed (${signRes.status}) ${body.slice(0, 120)}`);
      }
      const { token } = (await signRes.json()) as { token: string };
      const renderRes = await fetch(`/api/clip/render?token=${encodeURIComponent(token)}`);
      if (!renderRes.ok) throw new Error(`Render failed (${renderRes.status})`);
      const blob = await renderRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disp = renderRes.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disp);
      const serverName = match ? match[1] : null;
      const ext = blob.type === "image/gif" ? "gif" : (blob.type.split("/")[1] || "bin");
      a.href = url;
      a.download = serverName ?? (filename ?? `quoridor-clip.${ext}`);
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
  }, [snapshot, speed, pov, sound, filename]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export clip"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
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
            Live preview - 9:16 - {frames.length} frames
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

        <div className="mt-4">
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