import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, LobbyChrome, tierFromRating } from "@/components/LobbyChrome";
import { requireRealUser } from "@/lib/auth-gate";
import {
  fetchAcceptedFriends, fetchFullLeaderboard, fetchMyStats,
  type FriendListItem, type FullLeaderRow,
} from "@/lib/stats";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Leaderboard · playquoridor.online" },
      { name: "description", content: "The global Quoridor leaderboard — top ranked players, tiers, win rates and rating changes." },
      { property: "og:title", content: "Quoridor Leaderboard — playquoridor.online" },
      { property: "og:description", content: "The global Quoridor leaderboard — top ranked players, tiers, and rating changes." },
      { property: "og:url", content: "https://playquoridor.online/stats" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://playquoridor.online/stats" }],
  }),
  component: LeaderboardPage,
});

type Me = Awaited<ReturnType<typeof requireRealUser>>;

function LeaderboardPage() {
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [rows, setRows] = useState<FullLeaderRow[] | null>(null);
  const [friends, setFriends] = useState<FriendListItem[] | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [myRow, setMyRow] = useState<FullLeaderRow | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    void requireRealUser().then(setMe);
    void fetchFullLeaderboard(30).then((r) => {
      setRows(r); setTotal(r.length);
    }).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (!me) return;
    void fetchAcceptedFriends(me.authUserId).then(setFriends);
    void fetchMyStats(me.playerId).then(async (s) => {
      if (!s) return;
      const row: FullLeaderRow = {
        id: me.playerId, name: me.username + " (you)",
        rating: (s as { rating?: number }).rating ?? 1000,
        wins: s.wins, matches: s.matches, losses: s.losses,
        walls_placed: s.walls_placed, pawns_eliminated: s.pawns_eliminated,
        streak: 0, delta7d: 0,
      };
      setMyRow(row);
    });
  }, [me]);

  useEffect(() => {
    if (!rows || !me) return;
    const idx = rows.findIndex((r) => r.id === me.playerId);
    setMyRank(idx >= 0 ? idx + 1 : null);
  }, [rows, me]);

  const friendIds = new Set((friends ?? []).map((f) => f.playerId));
  const list = tab === "friends"
    ? (rows ?? []).filter((r) => friendIds.has(r.id) || (me && r.id === me.playerId))
    : (rows ?? []);

  const podium = list.slice(0, 3);
  const rest = list.slice(3);

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[1240px] px-8 pb-14 pt-[70px]">
        <div className="text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#f5a524]">{season.label} · {season.endsLabel}</div>
          <h1 className="mt-4 text-[42px] font-bold tracking-[-0.03em]">Leaderboard</h1>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="h-[7px] w-[7px] rounded-full bg-[#2fd575] shadow-[0_0_8px_#2fd575]" />
            <span className="font-[IBM_Plex_Mono,monospace] text-[12px] tracking-[0.08em] text-[#5c5c66]">
              {total.toLocaleString()} RATED PLAYERS · UPDATED LIVE
            </span>
          </div>
        </div>

        <div className="mt-9 flex justify-center gap-2">
          {(["global", "friends"] as const).map((id) => (
            <button key={id} onClick={() => setTab(id)}
              className={"rounded-[9px] border px-5 py-[9px] text-[11.5px] font-bold uppercase tracking-[0.06em] " +
                (tab === id ? "border-[#34343e] bg-[#1e1e24] text-[#ececf1]" : "border-[#232329] bg-transparent text-[#83838e] hover:text-[#ececf1]")}>
              {id}
            </button>
          ))}
        </div>

        {rows === null ? (
          <p className="mt-16 text-center text-sm text-[#5c5c66]">Loading ladder…</p>
        ) : list.length === 0 ? (
          <p className="mt-16 text-center text-sm text-[#5c5c66]">
            {tab === "friends" ? "None of your friends have played ranked matches yet." : "No ranked matches yet. Be the first."}
          </p>
        ) : (
          <>
            {podium.length >= 3 && (
              <div className="mx-auto mt-14 grid max-w-[960px] items-end gap-6 md:grid-cols-[1fr_1.15fr_1fr]">
                {[podium[1]!, podium[0]!, podium[2]!].map((p, i) => {
                  const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                  const cardCls = rank === 1
                    ? "border-[rgba(245,197,66,0.45)] bg-[linear-gradient(180deg,#1d180c,#121014)] shadow-[0_0_70px_rgba(245,197,66,0.13)] py-12"
                    : rank === 2 ? "border-[rgba(200,205,215,0.28)] py-8" : "border-[rgba(205,127,50,0.35)] py-8";
                  const medalBg = rank === 1 ? "bg-[#f5c542] text-[#160e00] border-[#f5c542]"
                    : rank === 2 ? "bg-[#c8cdd7] text-[#111114] border-[#c8cdd7]"
                    : "bg-[#cd7f32] text-[#160e00] border-[#cd7f32]";
                  const t = tierFromRating(p.rating);
                  const wr = p.matches ? Math.round((p.wins / p.matches) * 100) : 0;
                  return (
                    <div key={p.id} className={"relative rounded-[20px] border bg-[linear-gradient(180deg,#17171b,#111114)] px-6 pb-7 text-center " + cardCls}>
                      <div className={"absolute left-1/2 top-[-14px] grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border font-[IBM_Plex_Mono,monospace] text-[12px] font-semibold " + medalBg}>{rank}</div>
                      <div className="mx-auto mt-3"><Avatar name={p.name} size={72} /></div>
                      <div className="mt-3 truncate text-[16px] font-bold">{p.name}</div>
                      <div className="mt-[3px] text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.color }}>{t.name}</div>
                      <div className="mt-4 font-[IBM_Plex_Mono,monospace] text-[36px] font-semibold leading-none">{p.rating}</div>
                      <div className="mt-1 text-[11px] tracking-[0.1em] text-[#5c5c66]">ELO RATING</div>
                      <div className="mt-3 text-[12px] text-[#83838e]">{p.matches} games · {wr}% wins</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="my-4 flex items-center justify-between">
              <span className="font-[IBM_Plex_Mono,monospace] text-[11px] tracking-[0.12em] text-[#5c5c66]">
                {tab === "friends" ? "TOP FRIENDS — RANKED 1V1" : "TOP GLOBAL — RANKED 1V1"}
              </span>
              <span className="font-[IBM_Plex_Mono,monospace] text-[11px] tracking-[0.12em] text-[#5c5c66]">Δ 7D = RATING CHANGE, LAST 7 DAYS</span>
            </div>

            <div className="rounded-2xl border border-[#232329] bg-[#111114] pb-2">
              <LbHead />
              {rest.map((r, i) => (
                <LbRow key={r.id} rank={i + 4} row={r} me={me?.playerId === r.id} />
              ))}
              {me && myRow && !list.some((r) => r.id === me.playerId) && (
                <LbRow rank={myRank ?? total + 1} row={myRow} me />
              )}
            </div>
          </>
        )}
      </div>
    </LobbyChrome>
  );
}

function LbHead() {
  const cell = "text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5c5c66]";
  return (
    <div className="grid items-center gap-3 px-6 pb-2 pt-4 md:grid-cols-[40px_32px_minmax(0,1fr)_90px_90px_80px_90px_70px]">
      <span className={cell + " !text-left"}>#</span>
      <span />
      <span className={cell + " !text-left"}>Player</span>
      <span className={cell + " hidden md:block"}>Games</span>
      <span className={cell + " hidden md:block"}>Win rate</span>
      <span className={cell + " hidden md:block"}>Streak</span>
      <span className={cell}>Rating</span>
      <span className={cell}>Δ 7d</span>
    </div>
  );
}
function LbRow({ rank, row, me }: { rank: number; row: FullLeaderRow; me?: boolean }) {
  const t = tierFromRating(row.rating);
  const wr = row.matches ? Math.round((row.wins / row.matches) * 100) : 0;
  const up = row.delta7d >= 0;
  return (
    <div className={"grid items-center gap-3 border-t border-[#1a1a1f] px-6 py-[15px] md:grid-cols-[40px_32px_minmax(0,1fr)_90px_90px_80px_90px_70px] " +
      (me ? "bg-[rgba(245,165,36,0.14)] shadow-[inset_3px_0_0_#f5a524]" : "")}>
      <span className="font-[IBM_Plex_Mono,monospace] text-[12px] text-[#5c5c66]">{rank}</span>
      <Avatar name={row.name} size={28} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{row.name}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: t.color }}>{t.name}</div>
      </div>
      <span className="hidden text-right font-[IBM_Plex_Mono,monospace] text-[12.5px] text-[#83838e] md:block">{row.matches}</span>
      <span className="hidden text-right font-[IBM_Plex_Mono,monospace] text-[12.5px] text-[#83838e] md:block">{wr}%</span>
      <span className="hidden text-right font-[IBM_Plex_Mono,monospace] text-[12.5px] text-[#83838e] md:block">{row.streak}</span>
      <span className="text-right font-[IBM_Plex_Mono,monospace] text-[12.5px] font-semibold text-[#ececf1]">{row.rating}</span>
      <span className={"text-right font-[IBM_Plex_Mono,monospace] text-[12.5px] " + (up ? "text-[#2fd575]" : "text-[#ff7a7a]")}>
        {up ? "+" : ""}{row.delta7d}
      </span>
    </div>
  );
}