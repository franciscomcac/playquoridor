import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Avatar, LobbyChrome } from "@/components/LobbyChrome";
import { requireRealUser } from "@/lib/auth-gate";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAcceptedFriends,
  fetchH2HHistory,
  fetchHeadToHead,
  fetchRecentOpponents,
  type FriendListItem,
  type RecentOpponent,
} from "@/lib/stats";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends · playquoridor.online" },
      {
        name: "description",
        content: "Your Quoridor friends, recent opponents, and head-to-head history.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FriendsPage,
});

type Me = Awaited<ReturnType<typeof requireRealUser>>;
type Selected =
  | { kind: "friend"; item: FriendListItem }
  | { kind: "recent"; item: RecentOpponent & { rating?: number; matches?: number } };

function FriendsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tab, setTab] = useState<"friends" | "recent">("friends");
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [recents, setRecents] = useState<RecentOpponent[]>([]);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [q, setQ] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [addName, setAddName] = useState("");
  const [addMsg, setAddMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const [h2hCounts, setH2hCounts] = useState<{ a: number; b: number } | null>(null);
  const [h2hHist, setH2hHist] = useState<Awaited<ReturnType<typeof fetchH2HHistory>> | null>(null);
  const [selStats, setSelStats] = useState<{
    rating: number;
    matches: number;
    wins: number;
    losses: number;
  } | null>(null);

  useEffect(() => {
    void requireRealUser().then((u) => {
      if (!u) {
        void navigate({ to: "/auth" });
        return;
      }
      setMe(u);
    });
  }, [navigate]);

  useEffect(() => {
    if (!me) return;
    void fetchAcceptedFriends(me.authUserId).then((r) => {
      setFriends(r);
      if (r.length && !selected) setSelected({ kind: "friend", item: r[0]! });
    });
    void fetchRecentOpponents(me.playerId, 10).then(setRecents);
  }, [me]);

  useEffect(() => {
    if (!me || !selected) return;
    const targetId = selected.kind === "friend" ? selected.item.playerId : selected.item.playerId;
    void fetchHeadToHead(me.playerId, targetId).then(setH2hCounts);
    void fetchH2HHistory(me.playerId, targetId, 5).then(setH2hHist);
    void supabase
      .from("player_stats")
      .select("rating,matches,wins,losses")
      .eq("player_id", targetId)
      .maybeSingle()
      .then(({ data }) =>
        setSelStats(
          data
            ? {
                rating: (data as { rating?: number }).rating ?? 1000,
                matches: data.matches,
                wins: data.wins,
                losses: data.losses,
              }
            : { rating: 1000, matches: 0, wins: 0, losses: 0 },
        ),
      );
  }, [me, selected]);

  const filteredFriends = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(s));
  }, [friends, q]);
  const filteredRecents = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return recents;
    return recents.filter((r) => r.name.toLowerCase().includes(s));
  }, [recents, q]);

  async function addFriend(op: RecentOpponent) {
    if (!me) return;
    // Look up the target's auth id.
    const { data: p } = await supabase
      .from("players")
      .select("auth_user_id")
      .eq("id", op.playerId)
      .maybeSingle();
    const auth = (p as { auth_user_id?: string } | null)?.auth_user_id;
    if (!auth) {
      setSent((s) => ({ ...s, [op.playerId]: true }));
      return;
    }
    await supabase.from("friendships").insert({
      requester_id: me.playerId,
      addressee_id: op.playerId,
      requester_auth: me.authUserId,
      addressee_auth: auth,
      status: "pending",
    });
    setSent((s) => ({ ...s, [op.playerId]: true }));
  }
  function challenge() {
    try {
      sessionStorage.setItem("quoridor:pendingAction", "create");
    } catch {
      /* noop */
    }
    void navigate({ to: "/game" });
  }

  async function addFriendByUsername() {
    if (!me) return;
    const name = addName.trim();
    if (!name) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const { data: p } = await supabase
        .from("players")
        .select("id, auth_user_id, name")
        .ilike("name", name)
        .maybeSingle();
      const target = p as { id: string; auth_user_id: string | null; name: string } | null;
      if (!target) {
        setAddMsg({ kind: "err", text: `No player named "${name}".` });
        return;
      }
      if (target.id === me.playerId) {
        setAddMsg({ kind: "err", text: "That's you." });
        return;
      }
      if (!target.auth_user_id) {
        setAddMsg({ kind: "err", text: "That player can't receive requests." });
        return;
      }
      const { error } = await supabase.from("friendships").insert({
        requester_id: me.playerId,
        addressee_id: target.id,
        requester_auth: me.authUserId,
        addressee_auth: target.auth_user_id,
        status: "pending",
      });
      if (error) {
        const msg = /duplicate|unique/i.test(error.message)
          ? "Request already sent."
          : error.message;
        setAddMsg({ kind: "err", text: msg });
        return;
      }
      setAddMsg({ kind: "ok", text: `Request sent to ${target.name}.` });
      setAddName("");
    } finally {
      setAdding(false);
    }
  }

  if (me === undefined)
    return (
      <LobbyChrome>
        <div className="mx-auto max-w-[1600px] px-8 py-16 text-sm text-[#5c5c66]">Loading…</div>
      </LobbyChrome>
    );

  const selectedName =
    selected?.kind === "friend" ? selected.item.name : (selected?.item.name ?? "—");
  const selectedColor = selected?.kind === "friend" ? selected.item.avatarColor : null;
  const selectedElo =
    selected?.kind === "friend" ? selected.item.rating : (selStats?.rating ?? 1000);
  const selectedMatches =
    selected?.kind === "friend" ? selected.item.matches : (selStats?.matches ?? 0);
  const wr =
    selStats && selStats.matches > 0 ? Math.round((selStats.wins / selStats.matches) * 100) : 0;

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[1600px] px-8 pb-8 pt-9">
        <div className="flex items-center justify-between">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Friends</h1>
          <button
            onClick={() => navigate({ to: "/game" })}
            className="rounded-[10px] border border-[#2b2b33] bg-transparent px-[18px] py-[9px] text-[13px] font-semibold tracking-[0.04em] text-[#ececf1] hover:border-[#3a3a44] hover:bg-[#17171b]"
          >
            + PLAY A MATCH
          </button>
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* List card */}
          <div className="rounded-2xl border border-[#232329] bg-[#111114]">
            <div className="flex gap-[6px] px-5 pt-4">
              {(["friends", "recent"] as const).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setSelected(null);
                  }}
                  className={
                    "flex-1 rounded-[9px] border px-3 py-[9px] text-[11.5px] font-bold uppercase tracking-[0.06em] " +
                    (tab === id
                      ? "border-[#34343e] bg-[#1e1e24] text-[#ececf1]"
                      : "border-[#232329] bg-transparent text-[#83838e] hover:text-[#ececf1]")
                  }
                >
                  {id === "friends" ? "Friends" : "Recent players"}
                </button>
              ))}
            </div>
            <div className="px-5 py-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tab === "recent" ? "Search recent players…" : "Search friends…"}
                className="w-full rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[14px] py-3 font-[IBM_Plex_Mono,monospace] text-[13px] text-[#ececf1] outline-none focus:border-[rgba(245,165,36,0.35)]"
              />
            </div>
            {tab === "friends" && (
              <div className="border-t border-[#1a1a1f] px-5 py-3">
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">
                  Add by username
                </div>
                <div className="flex gap-2">
                  <input
                    value={addName}
                    onChange={(e) => {
                      setAddName(e.target.value);
                      setAddMsg(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addFriendByUsername();
                    }}
                    placeholder="username"
                    className="min-w-0 flex-1 rounded-[10px] border border-[#232329] bg-[#0d0d10] px-[12px] py-[9px] font-[IBM_Plex_Mono,monospace] text-[13px] text-[#ececf1] outline-none focus:border-[rgba(245,165,36,0.35)]"
                  />
                  <button
                    onClick={() => void addFriendByUsername()}
                    disabled={adding || !addName.trim()}
                    className="flex-none rounded-[9px] border border-[#2b2b33] bg-[#17171b] px-3 py-[9px] font-[IBM_Plex_Mono,monospace] text-[11px] font-semibold text-[#f5a524] hover:border-[rgba(245,165,36,0.35)] disabled:opacity-50"
                  >
                    {adding ? "…" : "+ ADD"}
                  </button>
                </div>
                {addMsg && (
                  <div
                    className={
                      "mt-2 text-[11.5px] " +
                      (addMsg.kind === "ok" ? "text-[#2fd575]" : "text-[#ff7a7a]")
                    }
                  >
                    {addMsg.text}
                  </div>
                )}
              </div>
            )}
            {tab === "friends" ? (
              <>
                {filteredFriends.length === 0 && (
                  <div className="border-t border-[#1a1a1f] px-5 py-6 text-[12.5px] text-[#5c5c66]">
                    No friends yet — add someone from Recent players.
                  </div>
                )}
                {filteredFriends.map((f) => {
                  const on = selected?.kind === "friend" && selected.item.playerId === f.playerId;
                  return (
                    <button
                      key={f.friendshipId}
                      onClick={() => setSelected({ kind: "friend", item: f })}
                      className={
                        "flex w-full items-center gap-3 border-t border-[#1a1a1f] px-5 py-3 text-left transition-colors " +
                        (on ? "bg-[#15151a] shadow-[inset_3px_0_0_#f5a524]" : "hover:bg-[#15151a]")
                      }
                    >
                      <Avatar name={f.name} color={f.avatarColor} size={34} />
                      <div className="flex-1 truncate">
                        <div className="text-[13px] font-semibold">{f.name}</div>
                        <div className="text-[11px] text-[#2fd575]">Friend · {f.matches} games</div>
                      </div>
                      <span className="font-[IBM_Plex_Mono,monospace] text-[12.5px] text-[#83838e]">
                        {f.rating}
                      </span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {filteredRecents.length === 0 && (
                  <div className="border-t border-[#1a1a1f] px-5 py-6 text-[12.5px] text-[#5c5c66]">
                    Play a few matches and your opponents will show up here.
                  </div>
                )}
                {filteredRecents.map((r) => {
                  const on = selected?.kind === "recent" && selected.item.playerId === r.playerId;
                  return (
                    <div
                      key={r.playerId}
                      className={
                        "flex w-full items-center gap-3 border-t border-[#1a1a1f] px-5 py-3 text-left transition-colors " +
                        (on ? "bg-[#15151a] shadow-[inset_3px_0_0_#f5a524]" : "hover:bg-[#15151a]")
                      }
                    >
                      <button
                        onClick={() => setSelected({ kind: "recent", item: r })}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <Avatar name={r.name} size={34} />
                        <div className="flex-1 truncate">
                          <div className="text-[13px] font-semibold">{r.name}</div>
                          <div className="text-[11px] text-[#5c5c66]">
                            {r.mode} · {timeAgo(r.when)} ago
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void addFriend(r);
                        }}
                        className="flex-none rounded-[7px] border border-[#2b2b33] bg-[#17171b] px-[9px] py-[5px] font-[IBM_Plex_Mono,monospace] text-[10.5px] font-semibold text-[#f5a524] hover:border-[rgba(245,165,36,0.35)]"
                      >
                        {sent[r.playerId] ? "SENT ✓" : "+ ADD"}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Detail card */}
          <div className="rounded-2xl border border-[#232329] bg-[#111114] pb-2">
            {!selected ? (
              <div className="grid h-[280px] place-items-center text-[13px] text-[#5c5c66]">
                Select a player to view their profile.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4 px-6 pt-6">
                  <Avatar name={selectedName} color={selectedColor} size={72} />
                  <div className="flex-1">
                    <div className="text-[20px] font-bold">{selectedName}</div>
                    <div className="mt-[3px] text-[12px] font-medium text-[#83838e]">
                      {selected.kind === "friend"
                        ? "Friend"
                        : selected.item.mode + " · " + timeAgo(selected.item.when) + " ago"}
                    </div>
                  </div>
                  <button
                    onClick={challenge}
                    className="whitespace-nowrap rounded-[11px] bg-[#f5a524] px-[22px] py-3 text-[13px] font-bold tracking-[0.02em] text-[#160e00] hover:brightness-110"
                  >
                    ⚔ CHALLENGE
                  </button>
                  <button
                    onClick={challenge}
                    className="whitespace-nowrap rounded-[10px] border border-[#2b2b33] px-[18px] py-[9px] text-[13px] font-semibold tracking-[0.04em] hover:border-[#3a3a44] hover:bg-[#17171b]"
                  >
                    INVITE TO ROOM
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-4">
                  <StatBox v={selectedElo} l="ELO rating" />
                  <StatBox v={`${wr}%`} l="Win rate" />
                  <StatBox v={selectedMatches} l="Games" />
                  <StatBox v={h2hCounts ? `${h2hCounts.a}–${h2hCounts.b}` : "—"} l="H2H vs you" />
                </div>
                <div className="flex items-center justify-between px-6 pb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5c5c66]">
                    Past games together
                  </span>
                  <span className="font-[IBM_Plex_Mono,monospace] text-[11px] text-[#5c5c66]">
                    head-to-head: {h2hCounts ? `${h2hCounts.a}–${h2hCounts.b}` : "—"}
                  </span>
                </div>
                {h2hHist === null && (
                  <div className="border-t border-[#1a1a1f] px-6 py-4 text-[12.5px] text-[#5c5c66]">
                    Loading…
                  </div>
                )}
                {h2hHist?.length === 0 && (
                  <div className="border-t border-[#1a1a1f] px-6 py-4 text-[12.5px] text-[#5c5c66]">
                    You haven't faced each other yet.
                  </div>
                )}
                {h2hHist?.map((m) => {
                  const win = m.result === "win";
                  return (
                    <div
                      key={m.matchId}
                      className="flex items-center gap-3 border-t border-[#1a1a1f] px-6 py-[11px]"
                    >
                      <span
                        className={
                          "grid h-[26px] w-[26px] place-items-center rounded-lg font-[IBM_Plex_Mono,monospace] text-[11.5px] font-bold " +
                          (win
                            ? "bg-[rgba(47,213,117,0.12)] text-[#2fd575]"
                            : "bg-[rgba(255,92,92,0.1)] text-[#ff7a7a]")
                        }
                      >
                        {win ? "W" : "L"}
                      </span>
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold">vs {m.opponentName}</div>
                        <div className="text-[11px] text-[#5c5c66]">
                          {m.ranked ? "Ranked" : "Casual"} · {m.mode}p
                        </div>
                      </div>
                      <span className="font-[IBM_Plex_Mono,monospace] text-[11px] text-[#5c5c66]">
                        {timeAgo(m.endedAt)}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </LobbyChrome>
  );
}

function StatBox({ v, l }: { v: React.ReactNode; l: string }) {
  return (
    <div className="rounded-[12px] border border-[#232329] bg-[#17171b] px-4 py-[14px]">
      <div className="font-[IBM_Plex_Mono,monospace] text-[20px] font-semibold">{v}</div>
      <div className="mt-[5px] text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]">
        {l}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
