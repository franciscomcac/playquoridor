import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AVATAR_SWATCHES, Avatar, LobbyChrome, PLACEMENT_GAMES, UNRANKED_COLOR, isPlacement, placementRemaining, tierFromRating } from "@/components/LobbyChrome";
import { requireRealUser } from "@/lib/auth-gate";
import { fetchProfile, fetchMyWinStreak, updateMyProfile, renameMyPlayer, fetchRecentMatches, type RecentMatchRow } from "@/lib/stats";
import { saveBio, saveAvatar, moderateUsername } from "@/lib/moderation.functions";
import { ConstellationSigil, type SigilTier } from "@/components/ConstellationSigil";
import { supabase } from "@/integrations/supabase/client";
import { partitionCatalog, type SlugMeta } from "@/lib/achievement-families";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your profile · playquoridor.online" },
      { name: "description", content: "Edit your Quoridor display name, bio, and avatar color." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

type Me = Awaited<ReturnType<typeof requireRealUser>>;

function ProfilePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchProfile>> | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [recent, setRecent] = useState<RecentMatchRow[]>([]);
  const [badges, setBadges] = useState<Array<{ slug: string; name: string; tier: SigilTier; sigil_key: string; unlocked_at: string | null; description: string }>>([]);
  const [badgeCounts, setBadgeCounts] = useState<{ unlocked: number; total: number }>({ unlocked: 0, total: 0 });
  const [catalog, setCatalog] = useState<SlugMeta[]>([]);
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());

  const [pname, setPname] = useState("");
  const [pbio, setPbio] = useState("");
  const [avColor, setAvColor] = useState<string>(AVATAR_SWATCHES[0]!);
  const [avUrl, setAvUrl] = useState<string | null>(null);
  const [nameChangedAt, setNameChangedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState<null | "ok" | "err">(null);
  const [busy, setBusy] = useState(false);
  const [modMsg, setModMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const callSaveBio = useServerFn(saveBio);
  const callSaveAvatar = useServerFn(saveAvatar);
  const callModName = useServerFn(moderateUsername);

  useEffect(() => {
    void requireRealUser().then((u) => {
      if (!u) { void navigate({ to: "/auth" }); return; }
      setMe(u);
    });
  }, [navigate]);

  useEffect(() => {
    if (!me) return;
    void fetchProfile(me.playerId).then((p) => {
      setProfile(p);
      const pl = p.player as { name?: string; bio?: string | null; avatar_color?: string | null; avatar_url?: string | null } | null;
      const pAny = p.player as { name_changed_at?: string | null } | null;
      setPname(pl?.name ?? me.username);
      setNameChangedAt(pAny?.name_changed_at ?? null);
      setPbio(pl?.bio ?? "");
      setAvColor(pl?.avatar_color ?? AVATAR_SWATCHES[0]!);
      setAvUrl(pl?.avatar_url ?? null);
    });
    void fetchMyWinStreak(me.playerId).then(setStreak);
    void fetchRecentMatches(me.playerId, 8).then(setRecent);
    void (async () => {
      const [{ data: cat }, { data: mine }] = await Promise.all([
        supabase.from("achievements").select("slug,name,description,tier,sigil_key,is_hidden,sort_order").order("sort_order", { ascending: true }),
        supabase.from("player_achievements").select("achievement_slug,unlocked_at").eq("player_id", me.playerId),
      ]);
      const unlockedMap = new Map<string, string>((mine ?? []).map((r: { achievement_slug: string; unlocked_at: string }) => [r.achievement_slug, r.unlocked_at]));
      const catalog = (cat ?? []) as Array<{ slug: string; name: string; description: string; tier: SigilTier; sigil_key: string; is_hidden: boolean; sort_order: number }>;
      const visible = catalog.filter((c) => !c.is_hidden || unlockedMap.has(c.slug));
      const withState = visible.map((c) => ({
        slug: c.slug, name: c.name, description: c.description, tier: c.tier, sigil_key: c.sigil_key,
        unlocked_at: unlockedMap.get(c.slug) ?? null,
      }));
      withState.sort((a, b) => {
        if (!!b.unlocked_at !== !!a.unlocked_at) return a.unlocked_at ? -1 : 1;
        if (a.unlocked_at && b.unlocked_at) return b.unlocked_at.localeCompare(a.unlocked_at);
        return 0;
      });
      setBadges(withState);
      setBadgeCounts({ unlocked: unlockedMap.size, total: catalog.length });
      setCatalog(catalog.map((c) => ({ slug: c.slug, name: c.name, description: c.description, tier: c.tier, sigil_key: c.sigil_key })));
      setUnlockedSet(new Set(unlockedMap.keys()));
    })();
  }, [me]);

  const nameLockedUntil = useMemo(() => {
    if (!nameChangedAt) return null;
    const next = new Date(new Date(nameChangedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
    return next.getTime() > Date.now() ? next : null;
  }, [nameChangedAt]);
  const daysLeft = nameLockedUntil ? Math.ceil((nameLockedUntil.getTime() - Date.now()) / 86400000) : 0;
  const originalName = (profile?.player as { name?: string } | null)?.name ?? me?.username ?? "";
  const nameDirty = !!me && pname !== originalName;
  const nameLocked = !!nameLockedUntil;

  const stats = profile?.stats as
    | { rating?: number; matches?: number; wins?: number; losses?: number; ranked_matches?: number }
    | null | undefined;
  const rating = stats?.rating ?? 1000;
  const matches = stats?.matches ?? 0;
  const wins = stats?.wins ?? 0;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
  const rankedMatches = stats?.ranked_matches ?? 0;
  const unranked = isPlacement(rankedMatches);
  const tier = tierFromRating(rating);
  const placementLeft = placementRemaining(rankedMatches);
  const progress = useMemo(() => {
    if (tier.nextMin == null) return 100;
    const span = tier.nextMin - tier.min;
    return Math.max(0, Math.min(100, Math.round(((rating - tier.min) / span) * 100)));
  }, [rating, tier]);
  const since = useMemo(() => {
    const c = (profile?.player as { created_at?: string } | null)?.created_at;
    if (!c) return "";
    const d = new Date(c);
    return d.toLocaleString(undefined, { month: "short", year: "numeric" }).toUpperCase();
  }, [profile]);

  async function save() {
    if (!me) return;
    setBusy(true);
    setModMsg(null);
    // Save color; bio goes through moderation; name uses cooldown-gated RPC.
    const { error } = await updateMyProfile(me.playerId, { avatar_color: avColor });
    let ok = !error;
    if (nameDirty) {
      const modn = await callModName({ data: { name: pname } }).catch(() => ({ allow: true } as { allow: boolean; reason?: string }));
      if (!modn.allow) {
        setBusy(false);
        setSaved("err");
        setModMsg(`Display name rejected: ${modn.reason ?? "not allowed"}.`);
        setTimeout(() => setSaved(null), 2400);
        return;
      }
      const r = await renameMyPlayer(me.playerId, pname);
      if (!r.ok) {
        ok = false;
        setModMsg(r.message || "Couldn't change display name.");
      } else {
        setNameChangedAt(new Date().toISOString());
      }
    }
    try {
      const bioRes = await callSaveBio({ data: { playerId: me.playerId, bio: pbio } });
      if (!bioRes.allow) {
        ok = false;
        setModMsg(bioRes.senderMessage);
      }
    } catch (e: any) {
      ok = false;
      setModMsg(`Bio couldn't be checked: ${e?.message ?? "error"}`);
    }
    setBusy(false);
    setSaved(ok ? "ok" : "err");
    setTimeout(() => setSaved(null), 2400);
  }

  async function onPickAvatar(file: File) {
    if (!me) return;
    setUploading(true);
    setModMsg(null);
    try {
      const dataUrl = await resizeToDataUrl(file, 256, 0.82);
      const res = await callSaveAvatar({ data: { playerId: me.playerId, dataUrl } });
      if (res.allow) {
        setAvUrl(dataUrl);
        setModMsg("Avatar updated.");
      } else {
        setModMsg(res.senderMessage);
      }
    } catch (e: any) {
      setModMsg(`Upload failed: ${e?.message ?? "error"}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      setTimeout(() => setModMsg(null), 5000);
    }
  }

  async function removeAvatar() {
    if (!me) return;
    setUploading(true);
    const { error } = await updateMyProfile(me.playerId, { /* nothing */ });
    // Direct remove via supabase client
    await (await import("@/integrations/supabase/client")).supabase
      .from("players").update({ avatar_url: null }).eq("id", me.playerId);
    setAvUrl(null);
    setUploading(false);
    if (error) setModMsg("Couldn't remove avatar.");
  }

  if (me === undefined) return <LobbyChrome><div className="mx-auto max-w-[1240px] px-8 py-16 text-sm text-[#5c5c66]">Loading…</div></LobbyChrome>;

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[1240px] px-8 pb-12 pt-9">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em]">Your profile</h1>
            <p className="mt-1 text-[12px] text-[#5c5c66]">Edit your identity, review your record, and track badge progress.</p>
          </div>
          <Link to="/player/$playerId" params={{ playerId: me!.playerId }} className="hidden rounded-[10px] border border-[#232329] bg-[#111114] px-4 py-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#a4a4b0] hover:border-[rgba(245,165,36,0.35)] hover:text-[#ececf1] sm:inline-block">
            View public page →
          </Link>
        </div>
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Preview card */}
          <div className="rounded-2xl border border-[#232329] bg-[#111114] px-6 pb-6 pt-8 text-center">
            <div className="flex justify-center"><Avatar name={pname} color={avColor} size={72} imageUrl={avUrl} /></div>
            <div className="mt-4 text-[20px] font-bold">{pname || "—"}</div>
            <div className="mt-[6px] font-[IBM_Plex_Mono,monospace] text-[11px] tracking-[0.08em] text-[#5c5c66]">
              @{pname || "player"}{since ? ` · SINCE ${since}` : ""}
            </div>
            {pbio && <div className="mx-auto mt-3 max-w-[280px] text-[13px] leading-[1.5] text-[#83838e]">{pbio}</div>}

            <div className="mt-6 rounded-[14px] border border-[#232329] bg-[#0d0d10] p-5 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: unranked ? UNRANKED_COLOR : tier.color }}>
                    {unranked ? "Unranked · Placement" : `${tier.name} · Ranked 1v1`}
                  </div>
                  <div className="mt-1 font-[IBM_Plex_Mono,monospace] text-[32px] font-semibold leading-none">
                    {unranked ? "—" : rating}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-[IBM_Plex_Mono,monospace] text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">Global rank</div>
                  <div className="mt-[5px] font-[IBM_Plex_Mono,monospace] text-[16px] font-semibold">{unranked ? "—" : (profile?.rank ? `#${profile.rank}` : "—")}</div>
                </div>
              </div>
              {unranked ? (
                <>
                  <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#1e1e24]">
                    <div className="h-full rounded-full" style={{ width: `${Math.round((rankedMatches / PLACEMENT_GAMES) * 100)}%`, background: "linear-gradient(90deg,#83838e,#c8cdd7)" }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between font-[IBM_Plex_Mono,monospace] text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">
                    <span>Placement {rankedMatches}/{PLACEMENT_GAMES}</span>
                    <span style={{ color: UNRANKED_COLOR }}>
                      {placementLeft} ranked game{placementLeft === 1 ? "" : "s"} to unlock rank
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#1e1e24]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--acc,#f5a524),#f5c542)]" style={{ width: `${progress}%`, background: `linear-gradient(90deg,${tier.color},#f5c542)` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between font-[IBM_Plex_Mono,monospace] text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">
                    <span>{tier.name} {tier.min}</span>
                    {tier.nextMin != null ? (
                      <span style={{ color: tier.color }}>{tier.nextMin - rating} to {tier.nextName}</span>
                    ) : <span style={{ color: tier.color }}>Max tier</span>}
                    <span>{tier.nextName ?? "—"} {tier.nextMin ?? ""}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-[10px] sm:grid-cols-4">
              <StatBox v={matches} l="Games" />
              <StatBox v={wins} l="Wins" />
              <StatBox v={`${winRate}%`} l="Win rate" />
              <StatBox v={streak} l="Win streak" />
            </div>
          </div>

          {/* Edit card */}
          <div className="rounded-2xl border border-[#232329] bg-[#111114] p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">Edit profile</div>

            <Label>Display name</Label>
            <input
              value={pname}
              disabled={nameLocked}
              onChange={(e) => setPname(e.target.value.slice(0, 16).replace(/[^a-zA-Z0-9_]/g, ""))}
              className={"mt-2 block w-full rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-3 text-[13.5px] text-[#ececf1] outline-none focus:border-[rgba(245,165,36,0.35)] " + (nameLocked ? "cursor-not-allowed opacity-60" : "")}
            />
            <div className="mt-[6px] text-[11px] text-[#5c5c66]">
              {nameLocked
                ? `Display name is locked. You can change it again in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (on ${nameLockedUntil!.toLocaleDateString()}).`
                : "You can change your display name once every 30 days."}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Label>Bio</Label>
              <span className="font-[IBM_Plex_Mono,monospace] text-[11px] text-[#5c5c66]">{pbio.length}/120</span>
            </div>
            <textarea rows={3} value={pbio} onChange={(e) => setPbio(e.target.value.slice(0, 120))}
              className="mt-2 block min-h-[90px] w-full resize-y rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-3 text-[13.5px] leading-[1.5] text-[#ececf1] outline-none focus:border-[rgba(245,165,36,0.35)]" />

            <Label className="mt-4">Avatar picture</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickAvatar(f);
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-[10px] border border-[#2b2b33] bg-[#17171b] px-4 py-2 text-[12.5px] font-semibold hover:border-[rgba(245,165,36,0.35)] disabled:opacity-60"
              >
                {uploading ? "SCANNING…" : avUrl ? "REPLACE IMAGE" : "UPLOAD IMAGE"}
              </button>
              {avUrl && (
                <button
                  onClick={removeAvatar}
                  disabled={uploading}
                  className="rounded-[10px] border border-[#2b2b33] bg-[#0d0d10] px-3 py-2 text-[12px] text-[#a4a4b0] hover:text-[#ececf1]"
                >
                  Remove
                </button>
              )}
              <span className="text-[11px] text-[#5c5c66]">Auto-scanned for unsafe content.</span>
            </div>

            <Label className="mt-4">Avatar color (fallback)</Label>
            <div className="mt-2 flex items-center gap-[10px]">
              {AVATAR_SWATCHES.map((c) => (
                <button key={c} onClick={() => setAvColor(c)} aria-label={"Pick " + c}
                  className={"h-[30px] w-[30px] rounded-full border-2 " + (c === avColor ? "border-[#09090b] shadow-[0_0_0_2px_#ececf1]" : "border-transparent shadow-[0_0_0_1px_#2b2b33]")}
                  style={{ background: c }} />
              ))}
            </div>

            {modMsg && (
              <div className="mt-4 rounded-[10px] border border-[rgba(245,165,36,0.35)] bg-[rgba(245,165,36,0.08)] px-3 py-2 text-[12.5px] text-[#f5c542]">
                {modMsg}
              </div>
            )}

            <button onClick={save} disabled={busy}
              className="mt-6 w-full rounded-[11px] bg-[#f5a524] px-4 py-[14px] text-[14.5px] font-bold tracking-[0.02em] text-[#160e00] transition-[filter] hover:brightness-110 disabled:opacity-60">
              {saved === "ok" ? "SAVED ✓" : saved === "err" ? "COULDN'T SAVE" : busy ? "SAVING…" : "SAVE CHANGES"}
            </button>
          </div>
        </div>

        {/* Badges */}
        <section className="mt-6 rounded-2xl border border-[#232329] bg-[#111114] p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">Badges</div>
              <div className="mt-1 text-[15px] font-semibold text-[#ececf1]">
                {badgeCounts.unlocked} <span className="text-[#5c5c66]">/ {badgeCounts.total || "…"} unlocked</span>
              </div>
            </div>
            <Link to="/achievements" className="rounded-[10px] border border-[#2b2b33] bg-[#17171b] px-3.5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#a4a4b0] hover:border-[rgba(245,165,36,0.35)] hover:text-[#ececf1]">
              Browse all →
            </Link>
          </div>
          {badgeCounts.total > 0 && (
            <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-[#1e1e24]">
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#f5a524,#f5c542)]" style={{ width: `${Math.round((badgeCounts.unlocked / badgeCounts.total) * 100)}%` }} />
            </div>
          )}
          <BadgesGrid catalog={catalog} unlocked={unlockedSet} />
        </section>

        {/* Match history */}
        <section className="mt-6 rounded-2xl border border-[#232329] bg-[#111114] p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">Recent matches</div>
              <div className="mt-1 text-[15px] font-semibold text-[#ececf1]">Last {Math.min(recent.length, 8) || "—"} game{recent.length === 1 ? "" : "s"}</div>
            </div>
            <Link to="/history" className="rounded-[10px] border border-[#2b2b33] bg-[#17171b] px-3.5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[#a4a4b0] hover:border-[rgba(245,165,36,0.35)] hover:text-[#ececf1]">
              Full history →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="mt-4 rounded-[12px] border border-dashed border-[#232329] px-4 py-6 text-center text-[12.5px] text-[#5c5c66]">
              No matches yet. Jump into a game to build your record.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#1e1e24] overflow-hidden rounded-[12px] border border-[#1f1f25] bg-[#0d0d10]">
              {recent.map((m) => {
                const color = m.result === "win" ? "#4ade80" : m.result === "forfeit" ? "#f5a524" : "#f87171";
                return (
                  <li key={m.matchId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 text-[13px]">
                    <span className="truncate text-[#ececf1]">vs <span className="font-semibold">{m.opponentName}</span></span>
                    <span className="font-[IBM_Plex_Mono,monospace] text-[10.5px] uppercase tracking-[0.1em] text-[#5c5c66]">
                      {m.mode === 4 ? "4P" : "1v1"}{m.ranked ? " · RANKED" : ""}
                    </span>
                    <span className="font-[IBM_Plex_Mono,monospace] text-[10.5px] text-[#5c5c66]">{new Date(m.endedAt).toLocaleDateString()}</span>
                    <span className="rounded-full border px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: color + "55", color, background: color + "12" }}>
                      {m.result}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </LobbyChrome>
  );
}

async function resizeToDataUrl(file: File, max: number, quality: number): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("decode failed"));
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66] " + className}>{children}</div>;
}
function StatBox({ v, l }: { v: React.ReactNode; l: string }) {
  return (
    <div className="rounded-[12px] border border-[#232329] bg-[#17171b] px-4 py-[14px] text-center">
      <div className="font-[IBM_Plex_Mono,monospace] text-[20px] font-semibold">{v}</div>
      <div className="mt-[5px] text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">{l}</div>
    </div>
  );
}

// Badges grid — collapses same-family tiered slugs (win_10..win_1000) into
// one card that shows a "Lv N / M" level pip below the sigil.
function BadgesGrid({ catalog, unlocked }: { catalog: SlugMeta[]; unlocked: Set<string> }) {
  if (catalog.length === 0) {
    return <div className="mt-5 text-[12.5px] text-[#5c5c66]">Play a ranked or casual match to start unlocking badges.</div>;
  }
  const { families, singles } = partitionCatalog(catalog, unlocked);
  type Cell = {
    key: string; sigil_key: string; tier: SigilTier; name: string; unlocked: boolean;
    level?: { cur: number; max: number };
  };
  const familyCells: Cell[] = families.map((f) => ({
    key: `fam-${f.family.id}`,
    sigil_key: f.sigilKey,
    tier: f.tier,
    name: f.family.name,
    unlocked: f.currentLevel > 0,
    level: { cur: f.currentLevel, max: f.family.slugs.length },
  }));
  const singleCells: Cell[] = singles.map((s) => ({
    key: `slug-${s.slug}`,
    sigil_key: s.sigil_key,
    tier: s.tier,
    name: s.name,
    unlocked: unlocked.has(s.slug),
  }));
  const cells = [...familyCells, ...singleCells];
  cells.sort((a, b) => (a.unlocked === b.unlocked ? 0 : a.unlocked ? -1 : 1));
  return (
    <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
      {cells.slice(0, 20).map((c) => (
        <Link
          key={c.key}
          to="/achievements"
          title={c.name}
          className="group flex flex-col items-center rounded-[12px] border border-[#1f1f25] bg-[#0d0d10] px-2 py-3 transition hover:border-[rgba(245,165,36,0.35)]"
        >
          <ConstellationSigil sigilKey={c.sigil_key} tier={c.tier} size={54} locked={!c.unlocked} />
          <div className={"mt-2 line-clamp-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] " + (c.unlocked ? "text-[#ececf1]" : "text-[#5c5c66]")}>
            {c.name}
          </div>
          {c.level && (
            <div className="mt-1 flex items-center gap-[3px]">
              {Array.from({ length: c.level.max }).map((_, i) => (
                <span
                  key={i}
                  className="block h-[3px] w-[6px] rounded-full"
                  style={{ background: i < c.level!.cur ? "#f5a524" : "#2a2a34" }}
                />
              ))}
              <span className="ml-1 text-[9px] font-mono tabular-nums text-[#a4a4b0]">Lv {c.level.cur}</span>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}