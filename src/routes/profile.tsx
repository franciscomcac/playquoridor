import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AVATAR_SWATCHES, Avatar, LobbyChrome, tierFromRating } from "@/components/LobbyChrome";
import { requireRealUser } from "@/lib/auth-gate";
import { fetchProfile, fetchMyWinStreak, updateMyProfile } from "@/lib/stats";
import { saveBio, saveAvatar } from "@/lib/moderation.functions";

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

  const [pname, setPname] = useState("");
  const [pbio, setPbio] = useState("");
  const [avColor, setAvColor] = useState<string>(AVATAR_SWATCHES[0]!);
  const [avUrl, setAvUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState<null | "ok" | "err">(null);
  const [busy, setBusy] = useState(false);
  const [modMsg, setModMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const callSaveBio = useServerFn(saveBio);
  const callSaveAvatar = useServerFn(saveAvatar);

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
      setPname(pl?.name ?? me.username);
      setPbio(pl?.bio ?? "");
      setAvColor(pl?.avatar_color ?? AVATAR_SWATCHES[0]!);
      setAvUrl(pl?.avatar_url ?? null);
    });
    void fetchMyWinStreak(me.playerId).then(setStreak);
  }, [me]);

  const stats = profile?.stats as
    | { rating?: number; matches?: number; wins?: number; losses?: number }
    | null | undefined;
  const rating = stats?.rating ?? 1000;
  const matches = stats?.matches ?? 0;
  const wins = stats?.wins ?? 0;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
  const tier = tierFromRating(rating);
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
    // Save color + name directly; bio goes through moderation.
    const { error } = await updateMyProfile(me.playerId, {
      avatar_color: avColor,
      ...(pname !== me.username ? { name: pname } : {}),
    });
    let ok = !error;
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
      <div className="mx-auto max-w-[1240px] px-8 pb-8 pt-9">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Your profile</h1>
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Preview card */}
          <div className="rounded-2xl border border-[#232329] bg-[#111114] px-6 pb-6 pt-8 text-center">
            <div className="mx-auto"><Avatar name={pname} color={avColor} size={72} imageUrl={avUrl} /></div>
            <div className="mt-4 text-[20px] font-bold">{pname || "—"}</div>
            <div className="mt-[6px] font-[IBM_Plex_Mono,monospace] text-[11px] tracking-[0.08em] text-[#5c5c66]">
              @{pname || "player"}{since ? ` · SINCE ${since}` : ""}
            </div>
            {pbio && <div className="mx-auto mt-3 max-w-[280px] text-[13px] leading-[1.5] text-[#83838e]">{pbio}</div>}

            <div className="mt-6 rounded-[14px] border border-[#232329] bg-[#0d0d10] p-5 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: tier.color }}>
                    {tier.name} · Ranked 1v1
                  </div>
                  <div className="mt-1 font-[IBM_Plex_Mono,monospace] text-[32px] font-semibold leading-none">{rating}</div>
                </div>
                <div className="text-right">
                  <div className="font-[IBM_Plex_Mono,monospace] text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">Global rank</div>
                  <div className="mt-[5px] font-[IBM_Plex_Mono,monospace] text-[16px] font-semibold">{profile?.rank ? `#${profile.rank}` : "—"}</div>
                </div>
              </div>
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
            <input value={pname} onChange={(e) => setPname(e.target.value.slice(0, 20).replace(/[^a-zA-Z0-9_]/g, ""))}
              className="mt-2 block w-full rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-3 text-[13.5px] text-[#ececf1] outline-none focus:border-[rgba(245,165,36,0.35)]" />

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