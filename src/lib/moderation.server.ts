// Server-only moderation helpers. Runs Lovable AI on user content, records
// events, escalates penalties, and is imported ONLY by *.functions.ts handlers.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TEXT_MODEL = "google/gemini-2.5-flash-lite";
const VISION_MODEL = "google/gemini-2.5-flash";

export type Verdict = {
  severity: 0 | 1 | 2 | 3 | 4 | 5; // 0 clean, 5 severe (slur / threat / CSAM / explicit)
  categories: string[]; // e.g. ["hate","harassment","sexual","violence","self-harm","spam"]
  summary: string;
};

const SYSTEM_TEXT = `You are a strict content-moderation classifier for an online board-game chat/profile.
Rate the user text on a 0-5 severity scale for harmful content:
0 = fully clean
1 = mild rude / trash talk (fine)
2 = crude but not targeted (fine)
3 = harassment, targeted insult, or explicit sexual language
4 = slurs, hate, sexual content involving minors hints, threats
5 = severe: slur cluster, credible threats, sexual content involving minors, doxxing
Also list matched categories from: hate, harassment, sexual, sexual_minors, violence, threat, self_harm, spam, doxxing.
Reply ONLY with compact JSON: {"severity":N,"categories":[...],"summary":"one short line"}. No prose.`;

const SYSTEM_IMAGE = `You are a strict image-moderation classifier for an online board-game avatar.
Rate 0-5 severity for: nudity/sexual content, hate symbols (swastika, KKK, SS runes, etc.),
graphic violence/gore, minors in sexual context, illegal content.
0 = safe, 3 = questionable, 4 = disallowed, 5 = severe/illegal.
Categories: sexual, sexual_minors, hate_symbol, violence, gore, illegal.
Reply ONLY with compact JSON: {"severity":N,"categories":[...],"summary":"one short line"}. No prose.`;

function parseVerdict(raw: string): Verdict {
  const m = raw.match(/\{[\s\S]*\}/);
  const json = m ? m[0] : raw;
  try {
    const v = JSON.parse(json);
    const sev = Math.max(0, Math.min(5, Number(v.severity ?? 0))) as Verdict["severity"];
    const cats: string[] = Array.isArray(v.categories) ? v.categories.map(String).slice(0, 6) : [];
    return { severity: sev, categories: cats, summary: String(v.summary ?? "").slice(0, 200) };
  } catch {
    return { severity: 0, categories: [], summary: "" };
  }
}

async function callGateway(body: unknown): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function moderateText(text: string): Promise<Verdict> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { severity: 0, categories: [], summary: "empty" };
  const raw = await callGateway({
    model: TEXT_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_TEXT },
      { role: "user", content: trimmed.slice(0, 2000) },
    ],
  });
  return parseVerdict(raw);
}

export async function moderateImageDataUrl(dataUrl: string): Promise<Verdict> {
  if (!dataUrl?.startsWith("data:image/")) {
    return { severity: 5, categories: ["invalid"], summary: "not an image" };
  }
  const raw = await callGateway({
    model: VISION_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_IMAGE },
      {
        role: "user",
        content: [
          { type: "text", text: "Rate this avatar." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  return parseVerdict(raw);
}

// ---------- Penalty escalation ----------

export type PenaltyKind = "warn" | "match_mute" | "chat_ban_24h" | "chat_ban_7d" | "perm";

export function pickPenaltyForChat(
  severity: number,
  recentStrikes: number,
  hasChatBan: boolean,
): PenaltyKind | null {
  // "Standard": warn → match mute → 24h → 7d → perm.
  // Severe (>=4) skips warn.
  if (severity <= 1) return null;
  if (hasChatBan) return "chat_ban_7d";
  if (severity >= 5) return "chat_ban_7d";
  if (severity >= 4) return recentStrikes >= 2 ? "chat_ban_7d" : "chat_ban_24h";
  if (severity >= 3) {
    if (recentStrikes >= 3) return "chat_ban_24h";
    if (recentStrikes >= 1) return "match_mute";
    return "warn";
  }
  return null;
}

export function pickPenaltyForProfile(severity: number, recentStrikes: number): PenaltyKind | null {
  // Bio / avatar: no match_mute (no match), same ladder minus match_mute.
  if (severity <= 2) return null;
  if (severity >= 5) return "chat_ban_7d";
  if (severity >= 4) return recentStrikes >= 2 ? "chat_ban_7d" : "chat_ban_24h";
  return recentStrikes >= 2 ? "chat_ban_24h" : "warn";
}

export function activeUntilFor(kind: PenaltyKind): Date | null {
  const now = Date.now();
  switch (kind) {
    case "match_mute":
      return null; // enforced per-match
    case "chat_ban_24h":
      return new Date(now + 24 * 3600_000);
    case "chat_ban_7d":
      return new Date(now + 7 * 24 * 3600_000);
    case "perm":
      return new Date(now + 100 * 365 * 24 * 3600_000);
    default:
      return null; // warn
  }
}

export function penaltyLabel(kind: PenaltyKind): string {
  switch (kind) {
    case "warn":
      return "warning";
    case "match_mute":
      return "full match mute";
    case "chat_ban_24h":
      return "24-hour chat ban";
    case "chat_ban_7d":
      return "7-day chat ban";
    case "perm":
      return "permanent chat ban";
  }
}
