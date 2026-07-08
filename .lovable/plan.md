# Server-rendered replay clips (WebM via WASM)

## What changes for the user
- The current "Download GIF / Download Clip" buttons on the game end, history, and clips pages are replaced by a single **Download Clip** button that opens a new **Export Clip** modal.
- Modal has:
  - Live client-side board preview that scrubs the replay locally (no network calls) with **Speed** (0.5x / 1x / 2x), **POV** (bottom / top), **Sound** (on / off), and 9:16 aspect frame.
  - **Download** button → transitions to "Rendering on server…" with copy "You can close this and keep playing — your clip will finish downloading in the background."
  - Final WebM file is delivered as a direct browser download once ready.
- The existing "Share result" PNG card is untouched.

## Architecture

Two server routes (TanStack, run on Cloudflare Worker; same-origin, no CORS):

1. `POST /api/clip/sign` — validates the move list + render options, mints a short-lived signed token (HMAC-SHA256, 5 min expiry) containing `{ moves, options, exp, nonce }`. Rate-limited per IP via KV-less in-memory heuristic + payload size cap (moves ≤ 200).
2. `GET /api/clip/render?token=…` — verifies token, renders the replay to WebM, streams the response with `Content-Disposition: attachment; filename="quoridor-clip.webm"`.

Signing secret: `CLIP_SIGNING_SECRET`, generated via `generate_secret` (no user interaction).

## Rendering approach (server-side, Worker-compatible)

Frame generation: pure-TS canvas draw against a lightweight raster buffer (`Uint8ClampedArray` RGBA) — no `node-canvas`, no `OffscreenCanvas` (not available in Workers). The board is trivial geometry (9x9 grid, pawns, walls) so we draw directly into pixel buffers with a small custom rasterizer (rects, circles, text via bitmap font). Frame size 540x960 (9:16), ~2 fps effective playback at 1x speed (one frame per half-move + brief hold frames).

Encoding: `@jsquash/webp` for animated WebP is the safest Worker-native option, but user chose WebM/VP8. Options in decreasing feasibility:
- **`webm-wasm`** (Google, ~2MB WASM, libvpx-based). Works in Workers if we load the `.wasm` via `import wasm from './encoder.wasm'` (Vite treats it as an asset URL and Wrangler bundles it). CPU-heavy: ~40-frame clip is expected to fit in the Worker CPU budget but is the main risk.
- If webm-wasm exceeds CPU/memory, **fallback to animated WebP** via `@jsquash/webp` (fast, tiny, wide support) with the same UX — we'll wire the endpoint so the file extension/mime is decided server-side and the client just downloads whatever comes back.

We'll implement webm-wasm first, keep the encoder behind an interface, and ship the WebP fallback in the same PR so a runtime failure falls back gracefully.

## Files

**Delete**
- `src/lib/gifExport.ts`
- `src/types/gifenc.d.ts`
- `gifenc` from `package.json`

**Add**
- `src/lib/clipRender/frames.ts` — pure fn `renderFrames(snapshot, options): Uint8ClampedArray[]` (shared client preview + server render input model).
- `src/lib/clipRender/rasterizer.server.ts` — Worker-side pixel-buffer drawing (rects/circles/text).
- `src/lib/clipRender/encoder.server.ts` — WebM encoder wrapper (webm-wasm) with WebP fallback.
- `src/routes/api/clip/sign.ts` — POST, mints signed token.
- `src/routes/api/clip/render.ts` — GET, verifies token, renders + streams.
- `src/lib/clipRender/token.server.ts` — HMAC sign/verify helpers.
- `src/lib/clipRender/schema.ts` — Zod schema for options + moves (shared).
- `src/components/ExportClipModal.tsx` — modal with client preview canvas + controls + download flow.
- `public/wasm/webm.wasm` — encoder binary (copied at build time or fetched from npm package).

**Edit**
- `src/routes/game.tsx` — replace `DownloadGifButton` with `<ExportClipButton snapshot={…} />` opening the modal. Remove `renderMatchGif` import.
- `src/routes/history.tsx` — same swap.
- `src/routes/clips.tsx` — same swap.

## Security

- Token expiry: 5 min. Nonce prevents replay for caching layers.
- Payload cap: moves ≤ 200, options whitelisted via Zod enum.
- HMAC-SHA256 with `CLIP_SIGNING_SECRET` (generated, never exposed to client).
- Render endpoint refuses without valid token; sign endpoint only checks payload validity, no auth required (matches barricade.gg pattern — the token IS the auth).

## Risks & mitigations

1. **Worker CPU limit exceeded by libvpx**: mitigated by low fps, small resolution, and WebP fallback path shipped together.
2. **WASM bundling in the TanStack Worker build**: if `import wasm from '…?url'` doesn't work in this template, we host the `.wasm` in `public/wasm/` and `fetch()` it from the render route at request time (same origin, cached).
3. **Sound**: no server-side audio in WebM output — sound toggle only affects the client preview (UI move-click sound). This matches the "sound on/off" being a preview control; we'll label it clearly.

## Out of scope
- Server-rendered audio track in the exported file.
- MP4/H.264 output (not feasible in Worker without native binaries).
- Persisting rendered clips to storage (each render is one-shot).
