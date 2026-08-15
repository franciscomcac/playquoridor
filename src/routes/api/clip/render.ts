import { createFileRoute } from "@tanstack/react-router";
import { verifyClipToken } from "@/lib/clipRender/token.server";
import { renderClip } from "@/lib/clipRender/render.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export const Route = createFileRoute("/api/clip/render")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token) return new Response("Missing token", { status: 400, headers: CORS });

        const payload = await verifyClipToken(token);
        if (!payload)
          return new Response("Invalid or expired token", { status: 401, headers: CORS });

        try {
          const { bytes, mime, ext } = renderClip(
            payload.snapshot as unknown as Parameters<typeof renderClip>[0],
            payload.options,
          );
          const stamp = new Date().toISOString().slice(0, 10);
          const filename = `quoridor-${stamp}.${ext}`;
          const ab = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          return new Response(ab, {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(bytes.byteLength),
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Cache-Control": "private, no-store",
              ...CORS,
            },
          });
        } catch (e) {
          console.error("clip render failed", e);
          return new Response("Render failed", { status: 500, headers: CORS });
        }
      },
    },
  },
});
