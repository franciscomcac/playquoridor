import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Kind = "warn" | "match_mute" | "chat_ban_24h" | "chat_ban_7d" | "perm";

export type ChatModResult =
  | { allow: true }
  | {
      allow: false;
      penalty: Kind;
      reason: string;
      severity: number;
      // Human copy shown to the sender in the chat.
      senderMessage: string;
      // Optional public system line broadcast to peers (only for match_mute+).
      lobbyMessage: string | null;
    };

export type ProfileModResult =
  | { allow: true }
  | { allow: false; penalty: Kind; severity: number; reason: string; senderMessage: string };

export type ChatBanState = { active: false } | { active: true; kind: Kind; until: string | null; reason: string | null };

async function recentStrikeCount(supabase: any, playerId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("moderation_events")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .gte("severity", 3)
    .gte("created_at", since);
  return count ?? 0;
}

async function hasActiveChatBan(supabase: any, playerId: string): Promise<boolean> {
  const { data } = await supabase
    .from("moderation_penalties")
    .select("id,active_until,kind")
    .eq("player_id", playerId)
    .in("kind", ["chat_ban_24h", "chat_ban_7d", "perm"])
    .order("active_until", { ascending: false, nullsFirst: false })
    .limit(1);
  const row = (data ?? [])[0];
  if (!row) return false;
  if (!row.active_until) return true;
  return new Date(row.active_until).getTime() > Date.now();
}

async function ownPlayerRow(supabase: any, userId: string, playerId: string) {
  const { data } = await supabase
    .from("players")
    .select("id,auth_user_id,name")
    .eq("id", playerId)
    .eq("auth_user_id", userId)
    .maybeSingle();
  return data as { id: string; auth_user_id: string; name: string } | null;
}

// ---------- Chat message moderation ----------
export const moderateChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { playerId: string; matchId?: string | null; text: string };
    if (!d?.playerId || typeof d.text !== "string") throw new Error("bad input");
    return { playerId: String(d.playerId), matchId: d.matchId ? String(d.matchId).slice(0, 40) : null, text: d.text.slice(0, 500) };
  })
  .handler(async ({ data, context }): Promise<ChatModResult> => {
    const { supabase, userId } = context;
    const player = await ownPlayerRow(supabase, userId, data.playerId);
    if (!player) throw new Error("Player not found");

    const { moderateText, pickPenaltyForChat, activeUntilFor, penaltyLabel } =
      await import("./moderation.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // If already chat-banned, block outright.
    if (await hasActiveChatBan(supabase, data.playerId)) {
      return {
        allow: false,
        penalty: "chat_ban_24h",
        severity: 3,
        reason: "existing chat ban",
        senderMessage: "You're currently chat-banned. Message not sent.",
        lobbyMessage: null,
      };
    }

    const verdict = await moderateText(data.text);

    // Always record the event for audit.
    await supabaseAdmin.from("moderation_events").insert({
      player_id: data.playerId,
      auth_user_id: userId,
      surface: "chat",
      content: data.text,
      match_id: data.matchId,
      categories: verdict.categories,
      severity: verdict.severity,
      verdict: verdict.severity <= 1 ? "ok" : "blocked",
    });

    if (verdict.severity <= 1) return { allow: true };

    const strikes = await recentStrikeCount(supabase, data.playerId);
    const penalty = pickPenaltyForChat(verdict.severity, strikes, false);
    if (!penalty) return { allow: true };

    const activeUntil = activeUntilFor(penalty);
    await supabaseAdmin.from("moderation_penalties").insert({
      player_id: data.playerId,
      auth_user_id: userId,
      kind: penalty,
      reason: `chat: ${verdict.summary || verdict.categories.join(", ")}`,
      active_until: activeUntil ? activeUntil.toISOString() : null,
    });

    const label = penaltyLabel(penalty);
    const reasonText = verdict.summary || verdict.categories.join(", ") || "policy violation";
    const senderMessage =
      penalty === "warn"
        ? `Message blocked (warning). Reason: ${reasonText}. Further violations will escalate.`
        : `Message blocked — ${label} issued. Reason: ${reasonText}.`;
    const lobbyMessage =
      penalty === "warn"
        ? null
        : `${player.name} received a ${label} for chat policy violations.`;

    return {
      allow: false,
      penalty,
      severity: verdict.severity,
      reason: reasonText,
      senderMessage,
      lobbyMessage,
    };
  });

// ---------- Bio moderation + save ----------
export const saveBio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { playerId: string; bio: string };
    return { playerId: String(d.playerId), bio: String(d.bio ?? "").slice(0, 500) };
  })
  .handler(async ({ data, context }): Promise<ProfileModResult> => {
    const { supabase, userId } = context;
    const player = await ownPlayerRow(supabase, userId, data.playerId);
    if (!player) throw new Error("Player not found");
    const { moderateText, pickPenaltyForProfile, activeUntilFor, penaltyLabel } = await import("./moderation.server");
    const verdict = data.bio.trim() ? await moderateText(data.bio) : { severity: 0 as const, categories: [], summary: "" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("moderation_events").insert({
      player_id: data.playerId,
      auth_user_id: userId,
      surface: "bio",
      content: data.bio,
      categories: verdict.categories,
      severity: verdict.severity,
      verdict: verdict.severity <= 2 ? "ok" : "blocked",
    });

    if (verdict.severity >= 3) {
      const strikes = await recentStrikeCount(supabase, data.playerId);
      const penalty = pickPenaltyForProfile(verdict.severity, strikes) ?? "warn";
      const activeUntil = activeUntilFor(penalty);
      await supabaseAdmin.from("moderation_penalties").insert({
        player_id: data.playerId,
        auth_user_id: userId,
        kind: penalty,
        reason: `bio: ${verdict.summary || verdict.categories.join(", ")}`,
        active_until: activeUntil ? activeUntil.toISOString() : null,
      });
      return {
        allow: false,
        penalty,
        severity: verdict.severity,
        reason: verdict.summary,
        senderMessage: `Bio rejected (${penaltyLabel(penalty)}). Reason: ${verdict.summary || verdict.categories.join(", ") || "policy violation"}.`,
      };
    }

    const { error } = await supabase.from("players").update({ bio: data.bio, updated_at: new Date().toISOString() }).eq("id", data.playerId);
    if (error) throw new Error(error.message);
    return { allow: true };
  });

// ---------- Avatar upload + moderation ----------
export const saveAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { playerId: string; dataUrl: string };
    const dataUrl = String(d.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/")) throw new Error("invalid image");
    if (dataUrl.length > 400_000) throw new Error("image too large");
    return { playerId: String(d.playerId), dataUrl };
  })
  .handler(async ({ data, context }): Promise<ProfileModResult> => {
    const { supabase, userId } = context;
    const player = await ownPlayerRow(supabase, userId, data.playerId);
    if (!player) throw new Error("Player not found");
    const { moderateImageDataUrl, pickPenaltyForProfile, activeUntilFor, penaltyLabel } = await import("./moderation.server");
    const verdict = await moderateImageDataUrl(data.dataUrl);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("moderation_events").insert({
      player_id: data.playerId,
      auth_user_id: userId,
      surface: "avatar",
      content: null,
      categories: verdict.categories,
      severity: verdict.severity,
      verdict: verdict.severity <= 2 ? "ok" : "blocked",
    });

    if (verdict.severity >= 3) {
      // No penalty for bad avatar uploads — just reject the image.
      return {
        allow: false,
        penalty: "warn",
        severity: verdict.severity,
        reason: verdict.summary,
        senderMessage: `Image rejected: ${verdict.summary || verdict.categories.join(", ") || "not allowed"}. Please choose a different picture.`,
      };
    }

    const { error } = await supabase.from("players").update({ avatar_url: data.dataUrl, updated_at: new Date().toISOString() }).eq("id", data.playerId);
    if (error) throw new Error(error.message);
    return { allow: true };
  });

// ---------- Current chat-ban state for the caller ----------
export const myChatBan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChatBanState> => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("moderation_penalties")
      .select("kind, active_until, reason, player_id")
      .eq("auth_user_id", userId)
      .in("kind", ["chat_ban_24h", "chat_ban_7d", "perm"])
      .order("active_until", { ascending: false, nullsFirst: false })
      .limit(5);
    const now = Date.now();
    const row = (data ?? []).find(
      (r: { active_until: string | null }) =>
        !r.active_until || new Date(r.active_until).getTime() > now,
    );
    if (!row) return { active: false };
    return { active: true, kind: row.kind as Kind, until: row.active_until, reason: row.reason };
  });

// ---------- Username moderation (no penalty — just accept/reject) ----------
export const moderateUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const d = raw as { name: string };
    return { name: String(d?.name ?? "").slice(0, 40) };
  })
  .handler(async ({ data }): Promise<{ allow: boolean; reason?: string }> => {
    const clean = data.name.trim();
    if (!clean) return { allow: false, reason: "Name is required." };
    const { moderateText } = await import("./moderation.server");
    const verdict = await moderateText(`Proposed username: "${clean}". Judge only the username itself for hate, slurs, harassment, or sexual content.`);
    if (verdict.severity >= 3) {
      return { allow: false, reason: verdict.summary || verdict.categories.join(", ") || "Username not allowed." };
    }
    return { allow: true };
  });
