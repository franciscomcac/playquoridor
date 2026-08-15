// Shared Zod schemas for the server-rendered clip export pipeline.
// Kept isomorphic (no server-only imports) so the sign endpoint and the
// client that POSTs to it can both validate the same shape.
import { z } from "zod";

export const POS = z.tuple([z.number().int().min(0).max(8), z.number().int().min(0).max(8)]);

export const WALL_SPEC = z.object({
  r: z.number().int().min(0).max(7),
  c: z.number().int().min(0).max(7),
  o: z.enum(["h", "v"]),
});

export const MOVE = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pawn"), to: POS }),
  z.object({ kind: z.literal("wall"), wall: WALL_SPEC }),
]);

export const MOVE_RECORD = z.object({
  move: MOVE,
  by: z.number().int().min(0).max(3),
});

export const ROUND_SNAP = z.object({
  startingSlot: z.number().int().min(0).max(3),
  moves: z.array(MOVE_RECORD).max(400),
  winner: z.number().int().min(0).max(3).nullable(),
});

export const MATCH_SNAPSHOT = z.object({
  version: z.literal(2),
  mode: z.union([z.literal(2), z.literal(4)]),
  totalWalls: z.number().int().min(0).max(80),
  totalRounds: z.number().int().min(1).max(9),
  playerNames: z.array(z.string().max(32)).max(4),
  rounds: z.array(ROUND_SNAP).max(10),
  matchWinner: z.number().int().min(0).max(3).nullable(),
  score: z.array(z.number().int().min(0).max(9)).max(4),
  createdAt: z.string().max(64),
});

export const RENDER_OPTIONS = z.object({
  aspect: z.literal("9:16").default("9:16"),
  speed: z.union([z.literal(0.5), z.literal(1), z.literal(2)]).default(1),
  pov: z.enum(["bottom", "top"]).default("bottom"),
  // sound is a preview-only affordance — the server output has no audio track.
  // Accepted here so the client can send the full options payload unchanged.
  sound: z.boolean().default(true),
});

export const CLIP_REQUEST = z.object({
  snapshot: MATCH_SNAPSHOT,
  options: RENDER_OPTIONS,
});

export type ClipRequest = z.infer<typeof CLIP_REQUEST>;
export type ClipRenderOptions = z.infer<typeof RENDER_OPTIONS>;
