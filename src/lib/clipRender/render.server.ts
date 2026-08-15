// Server-side clip renderer. Runs on the Cloudflare Worker for the render
// endpoint: no browser Canvas, no ffmpeg, no native binaries. We rasterise
// each frame into an RGBA pixel buffer ourselves (rects + filled circles is
// all the board needs), then encode with gifenc — pure JS, tiny, and
// bundles cleanly in the Worker runtime. Output is animated GIF; the
// external contract is a downloadable clip file, format decided server-side.
// gifenc's package "main" is CJS; on the Worker/SSR runtime named imports
// via the CJS entry fail. The package ships an ESM build at
// `dist/gifenc.esm.js` — import it directly so named exports resolve.
import { GIFEncoder, quantize, applyPalette } from "gifenc/dist/gifenc.esm.js";
import { replay } from "@/lib/matchReplay";
import type { MatchSnapshot } from "@/lib/matchHistory";
import type { ClipRenderOptions } from "./schema";
import type { GameState } from "@/lib/quoridor";

type RGB = readonly [number, number, number];
const BG: RGB = [0x0b, 0x0b, 0x10];
const CELL_BG: RGB = [0x1a, 0x1a, 0x22];
const CELL_ALT: RGB = [0x14, 0x14, 0x20];
const GRID: RGB = [0x2b, 0x2b, 0x3a];
const PAWN_OUTLINE: RGB = [0x00, 0x00, 0x00];
const PLAYER_RGB: RGB[] = [
  [0xe8, 0xb8, 0x4a],
  [0x7a, 0x94, 0xc8],
  [0xc8, 0x64, 0x64],
  [0x78, 0xc8, 0x96],
];

function fillAll(buf: Uint8ClampedArray, w: number, h: number, c: RGB) {
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    buf[p] = c[0];
    buf[p + 1] = c[1];
    buf[p + 2] = c[2];
    buf[p + 3] = 255;
  }
}

function fillRect(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  c: RGB,
) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.floor(x + rw));
  const y1 = Math.min(h, Math.floor(y + rh));
  for (let yy = y0; yy < y1; yy++) {
    let p = (yy * w + x0) * 4;
    for (let xx = x0; xx < x1; xx++) {
      buf[p] = c[0];
      buf[p + 1] = c[1];
      buf[p + 2] = c[2];
      buf[p + 3] = 255;
      p += 4;
    }
  }
}

function fillCircle(
  buf: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  c: RGB,
  outline?: RGB,
) {
  const r2 = r * r;
  const rOut2 = (r + 1.2) * (r + 1.2);
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const x1 = Math.min(w, Math.ceil(cx + r + 1));
  const y1 = Math.min(h, Math.ceil(cy + r + 1));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2) {
        const p = (yy * w + xx) * 4;
        buf[p] = c[0];
        buf[p + 1] = c[1];
        buf[p + 2] = c[2];
        buf[p + 3] = 255;
      } else if (outline && d2 <= rOut2) {
        const p = (yy * w + xx) * 4;
        buf[p] = outline[0];
        buf[p + 1] = outline[1];
        buf[p + 2] = outline[2];
        buf[p + 3] = 255;
      }
    }
  }
}

function rotate180(buf: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8ClampedArray(buf.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = ((h - 1 - y) * w + (w - 1 - x)) * 4;
      out[dst] = buf[src];
      out[dst + 1] = buf[src + 1];
      out[dst + 2] = buf[src + 2];
      out[dst + 3] = buf[src + 3];
    }
  }
  buf.set(out);
}

function drawStateRGBA(buf: Uint8ClampedArray, W: number, H: number, state: GameState) {
  const N = 9;
  const pad = Math.round(Math.min(W, H) * 0.06);
  const size = Math.min(W, H) - pad * 2;
  const cell = size / N;
  const ox = (W - size) / 2;
  const oy = (H - size) / 2;

  fillAll(buf, W, H, BG);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const col = (r + c) % 2 === 0 ? CELL_BG : CELL_ALT;
      fillRect(buf, W, H, ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2, col);
    }
  }

  // Grid lines (1px, drawn as 1x* / *x1 rects)
  for (let i = 0; i <= N; i++) {
    fillRect(buf, W, H, ox + i * cell, oy, 1, size, GRID);
    fillRect(buf, W, H, ox, oy + i * cell, size, 1, GRID);
  }

  // Walls
  const wallThick = Math.max(3, Math.round(cell * 0.16));
  for (const w of state.walls) {
    const by = (w as unknown as { by?: number }).by;
    const col: RGB = by != null && PLAYER_RGB[by] ? PLAYER_RGB[by] : [0xe8, 0xdf, 0xa8];
    if (w.o === "h") {
      const x = ox + w.c * cell;
      const y = oy + (w.r + 1) * cell - wallThick / 2;
      fillRect(buf, W, H, x + 2, y, cell * 2 - 4, wallThick, col);
    } else {
      const x = ox + (w.c + 1) * cell - wallThick / 2;
      const y = oy + w.r * cell;
      fillRect(buf, W, H, x, y + 2, wallThick, cell * 2 - 4, col);
    }
  }

  // Pawns
  const pR = cell * 0.32;
  for (let i = 0; i < state.mode; i++) {
    if (!state.active[i] && state.matchWinner === null) continue;
    const [r, c] = state.pawns[i];
    const cx = ox + c * cell + cell / 2;
    const cy = oy + r * cell + cell / 2;
    fillCircle(buf, W, H, cx, cy, pR, PLAYER_RGB[i] ?? [0xff, 0xff, 0xff], PAWN_OUTLINE);
  }
}

/**
 * Render the snapshot to an animated GIF. Returns { bytes, mime, ext }.
 * WebM/VP8 via WASM was explored but no pure-JS/WASM VP8 encoder ships
 * cleanly in the Worker runtime (they assume Web Workers + OffscreenCanvas
 * or native ffmpeg). GIF via gifenc is pure JS, always works, and is the
 * documented fallback in the approved plan.
 */
export function renderClip(
  snapshot: MatchSnapshot,
  options: ClipRenderOptions,
): { bytes: Uint8Array; mime: string; ext: string } {
  // 9:16 portrait. Bumped from 360x640 to 540x960 for a much sharper clip;
  // 128-color palette (up from 64) keeps wall/pawn colours crisp.
  const W = 540;
  const H = 960;
  const frames = replay(snapshot);
  if (frames.length === 0) throw new Error("empty match");

  const basePerPly = 500;
  const speed = options.speed;
  const msPerPly = Math.round(basePerPly / speed);
  const startHold = Math.round(1000 / speed);
  const endHold = Math.round(1800 / speed);

  const enc = GIFEncoder();
  const buf = new Uint8ClampedArray(W * H * 4);

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    drawStateRGBA(buf, W, H, f.state);
    if (options.pov === "top") rotate180(buf, W, H);

    const palette = quantize(buf, 128);
    const index = applyPalette(buf, palette);

    const isLast = i === frames.length - 1;
    const delay = isLast ? endHold : f.plyIndex === -1 ? startHold : msPerPly;

    enc.writeFrame(index, W, H, { palette, delay });
  }
  enc.finish();
  const bytes = enc.bytes();
  return { bytes, mime: "image/gif", ext: "gif" };
}
