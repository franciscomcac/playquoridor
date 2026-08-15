// Server-only HMAC-SHA256 sign/verify for short-lived clip render tokens.
// The token is `<base64url(payloadJson)>.<base64url(hmac)>`. The payload
// carries the full snapshot + options + exp + nonce so the render endpoint
// is stateless — no DB round-trip, no shared cache.
import type { ClipRequest } from "./schema";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const s = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  const secret = process.env.CLIP_SIGNING_SECRET;
  if (!secret) throw new Error("CLIP_SIGNING_SECRET missing");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type ClipTokenPayload = ClipRequest & { exp: number; nonce: string };

export async function signClipToken(req: ClipRequest, ttlSeconds = 300): Promise<string> {
  const payload: ClipTokenPayload = {
    ...req,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: b64urlEncode(crypto.getRandomValues(new Uint8Array(9))),
  };
  const payloadBytes = enc.encode(JSON.stringify(payload));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await key(), payloadBytes as BufferSource),
  );
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
}

export async function verifyClipToken(token: string): Promise<ClipTokenPayload | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadBytes = b64urlDecode(token.slice(0, dot));
  const sig = b64urlDecode(token.slice(dot + 1));
  const ok = await crypto.subtle.verify(
    "HMAC",
    await key(),
    sig as BufferSource,
    payloadBytes as BufferSource,
  );
  if (!ok) return null;
  let payload: ClipTokenPayload;
  try {
    payload = JSON.parse(dec.decode(payloadBytes)) as ClipTokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
  return payload;
}
