// Server function: short LLM commentary on a single Quoridor move.
// Heuristic verdict is computed client-side; this only writes prose so we
// don't ship a big analysis engine to the client.
import { createServerFn } from "@tanstack/react-start";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { z } from "zod";

const Input = z.object({
  fenLike: z.string(),          // short position summary
  moveText: z.string(),         // e.g. "e2 → e3" or "wall h @ e4"
  playerLabel: z.string(),      // "You" or "Opponent"
  distMe: z.number(),           // BFS distance for the moving player before/after
  distOpp: z.number(),
  distMeAfter: z.number(),
  distOppAfter: z.number(),
  bestMoveText: z.string(),
  verdict: z.enum(["best", "good", "inaccuracy", "mistake", "blunder"]),
});

export const explainMove = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      return { text: `Tactical move evaluated as ${data.verdict}. Distance difference: ${data.distMeAfter - data.distMe} steps.` };
    }
    const baseURL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const provider = createOpenAICompatible({
      name: "ai-provider",
      baseURL,
      headers: { Authorization: `Bearer ${key}` },
    });
    const model = provider(process.env.AI_MODEL || "gpt-4o-mini");
    const { text } = await generateText({
      model,
      system:
        "You are a concise Quoridor coach. In ONE sentence (max 22 words), " +
        "explain the move's tactical idea and why the verdict fits. No preamble. " +
        "Refer to path lengths as steps. Never suggest more than one alternative.",
      prompt:
        `${data.playerLabel} played ${data.moveText}. Verdict: ${data.verdict}. ` +
        `Before: my path ${data.distMe} steps, opponent ${data.distOpp}. ` +
        `After: my path ${data.distMeAfter} steps, opponent ${data.distOppAfter}. ` +
        `Engine suggested ${data.bestMoveText}. Position: ${data.fenLike}.`,
    });
    return { text: text.trim() };
  });