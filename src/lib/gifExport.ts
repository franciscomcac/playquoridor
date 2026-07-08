// Client-only: render a MatchSnapshot to an animated GIF blob (Chosen over
// MP4/WebM because gifenc is tiny, ships pure JS, and shares everywhere).
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { drawState, replay } from "@/lib/matchReplay";
import type { MatchSnapshot } from "@/lib/matchHistory";

export async function renderMatchGif(
  snap: MatchSnapshot,
  opts: { size?: number; msPerPly?: number; endHoldMs?: number } = {},
): Promise<Blob> {
  const size = opts.size ?? 360;
  const msPerPly = opts.msPerPly ?? 500;
  const endHoldMs = opts.endHoldMs ?? 1500;

  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");

  const enc = GIFEncoder();
  const frames = replay(snap);
  if (frames.length === 0) throw new Error("empty match");

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    drawState(ctx, f.state, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const palette = quantize(imgData.data, 64);
    const index = applyPalette(imgData.data, palette);
    const isLast = i === frames.length - 1;
    enc.writeFrame(index, size, size, {
      palette,
      delay: isLast ? endHoldMs : (f.plyIndex === -1 ? msPerPly * 2 : msPerPly),
    });
  }
  enc.finish();
  const bytes = enc.bytes();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: "image/gif" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}