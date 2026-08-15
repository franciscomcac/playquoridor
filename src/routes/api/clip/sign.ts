import { createFileRoute } from "@tanstack/react-router";
import { CLIP_REQUEST } from "@/lib/clipRender/schema";
import { signClipToken } from "@/lib/clipRender/token.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/clip/sign")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const cl = request.headers.get("content-length");
        if (cl && Number(cl) > 64 * 1024) return json({ error: "Payload too large" }, 413);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = CLIP_REQUEST.safeParse(body);
        if (!parsed.success)
          return json({ error: "Invalid payload", detail: parsed.error.issues.slice(0, 3) }, 400);

        const totalMoves = parsed.data.snapshot.rounds.reduce((s, r) => s + r.moves.length, 0);
        if (totalMoves > 400) return json({ error: "Too many moves" }, 400);
        if (totalMoves === 0) return json({ error: "Empty match" }, 400);

        try {
          const token = await signClipToken(parsed.data, 300);
          return json({ token, expiresIn: 300 });
        } catch (e) {
          console.error("clip sign failed", e);
          return json({ error: "Sign failed" }, 500);
        }
      },
    },
  },
});
