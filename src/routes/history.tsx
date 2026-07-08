import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { requireRealUser } from "@/lib/auth-gate";
import { isMatchSnapshot, type MatchSnapshot } from "@/lib/matchHistory";
import { renderMatchGif, downloadBlob } from "@/lib/gifExport";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Match history · playquoridor.online" },
      { name: "description", content: "Review your Quoridor match history with per-round analysis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HistoryPage,
});

type MatchRow = {
  match_id: string;
  mode: number;
  rounds: number;
  ranked: boolean;
  ended_at: string;
  winner_player_id: string | null;
  snapshot: unknown;
  players: Array<{
    slot: number;
    name: string;
    player_id: string | null;
    result: string;
    rounds_won: number;
    walls_placed: number;
    pawns_eliminated: number;
    forfeited: boolean;
  }>;
};

function HistoryPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Awaited<ReturnType<typeof requireRealUser>>>(null);
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await requireRealUser();
      if (!u) { void navigate({ to: "/auth" }); return; }
      setMe(u);
      const { data: myRows } = await supabase
        .from("match_players")
        .select("match_id")
        .eq("auth_user_id", u.authUserId)
        .order("match_id", { ascending: false })
        .limit(50);
      const ids = Array.from(new Set((myRows ?? []).map((r) => r.match_id)));
      if (ids.length === 0) { setRows([]); return; }
      const { data: matches } = await supabase
        .from("matches")
        .select("id,mode,rounds,ranked,ended_at,winner_player_id,snapshot")
        .in("id", ids)
        .order("ended_at", { ascending: false });
      const { data: mps } = await supabase
        .from("match_players")
        .select("match_id,slot,name,player_id,result,rounds_won,walls_placed,pawns_eliminated,forfeited")
        .in("match_id", ids);
      const grouped: MatchRow[] = (matches ?? []).map((m) => ({
        match_id: m.id,
        mode: m.mode,
        rounds: m.rounds,
        ranked: m.ranked,
        ended_at: m.ended_at,
        winner_player_id: m.winner_player_id,
        snapshot: (m as unknown as { snapshot?: unknown }).snapshot ?? null,
        players: (mps ?? []).filter((p) => p.match_id === m.id).sort((a, b) => a.slot - b.slot),
      }));
      setRows(grouped);
    })();
  }, [navigate]);

  if (!me) return <Shell><p className="text-zinc-500">Loading…</p></Shell>;

  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Match history</h1>
        <p className="text-xs text-zinc-500">{rows?.length ?? 0} matches</p>
      </div>

      {rows === null && <p className="mt-6 text-sm text-zinc-500">Loading matches…</p>}
      {rows?.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
          <p className="text-sm text-zinc-400">No matches recorded yet.</p>
          <Link to="/" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-950 hover:bg-emerald-400">Play a game</Link>
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {(rows ?? []).map((m) => {
          const mine = m.players.find((p) => p.player_id === me.playerId);
          const iWon = m.winner_player_id === me.playerId;
          const iForfeited = !!mine?.forfeited;
          const outcome: "win" | "loss" | "forfeit" = iWon ? "win" : iForfeited ? "forfeit" : "loss";
          const opp = m.players.find((p) => p.slot !== mine?.slot);
          const oppName = opp?.name ?? (m.mode > 2 ? "Room" : "Opponent");
          const myRounds = mine?.rounds_won ?? 0;
          const oppRounds = opp?.rounds_won ?? 0;
          const dateStr = new Date(m.ended_at).toLocaleString();
          const isOpen = openId === m.match_id;
          const tone =
            outcome === "win"
              ? { bar: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40", label: "Win",     border: "border-emerald-500/25 hover:border-emerald-400/50", glow: "shadow-[inset_3px_0_0_0_theme(colors.emerald.500)]" }
              : outcome === "forfeit"
                ? { bar: "bg-amber-500",   chip: "bg-amber-500/15 text-amber-300 ring-amber-500/40",   label: "Forfeit", border: "border-amber-500/25 hover:border-amber-400/50",   glow: "shadow-[inset_3px_0_0_0_theme(colors.amber.500)]" }
                : { bar: "bg-rose-500",    chip: "bg-rose-500/15 text-rose-300 ring-rose-500/40",     label: "Loss",    border: "border-rose-500/25 hover:border-rose-400/50",     glow: "shadow-[inset_3px_0_0_0_theme(colors.rose.500)]" };
          return (
            <li key={m.match_id} className={"overflow-hidden rounded-xl border bg-zinc-900/50 transition-colors " + tone.border + " " + tone.glow}>
              <button
                onClick={() => setOpenId(isOpen ? null : m.match_id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-zinc-900"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={"grid h-10 w-10 flex-none place-items-center rounded-full text-[11px] font-black uppercase tracking-wide ring-1 " + tone.chip}>
                    {outcome === "win" ? "W" : outcome === "forfeit" ? "FF" : "L"}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
                      <span className={"rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 " + tone.chip}>{tone.label}</span>
                      <span className="truncate">vs {oppName}</span>
                      {m.ranked && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary ring-1 ring-primary/40">Ranked</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      <span className="font-mono text-zinc-400">{myRounds}<span className="mx-1 text-zinc-600">–</span>{oppRounds}</span>
                      <span className="mx-2 text-zinc-700">·</span>
                      {m.mode}p · {m.rounds} rounds
                      <span className="mx-2 text-zinc-700">·</span>
                      {dateStr}
                    </p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-3">
                  {mine && (
                    <span className="hidden text-[11px] text-zinc-400 sm:inline">
                      {mine.walls_placed} walls · {mine.pawns_eliminated} pops
                    </span>
                  )}
                  <svg className={"h-4 w-4 text-zinc-600 transition-transform " + (isOpen ? "rotate-180" : "")} viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4z" /></svg>
                </div>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-4"
                  >
                    <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Analysis</p>
                    <table className="mt-3 w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-widest text-zinc-500">
                        <tr><th className="pb-2 text-left">Player</th><th className="pb-2">Rounds</th><th className="pb-2">Walls</th><th className="pb-2">Pops</th><th className="pb-2">Result</th></tr>
                      </thead>
                      <tbody>
                        {m.players.map((p) => (
                          <tr key={p.slot} className={"border-t border-zinc-800 " + (p.player_id === me.playerId ? "text-emerald-300" : "text-zinc-300")}>
                            <td className="py-2">{p.name}{p.forfeited ? " · forfeit" : ""}</td>
                            <td className="text-center">{p.rounds_won}</td>
                            <td className="text-center">{p.walls_placed}</td>
                            <td className="text-center">{p.pawns_eliminated}</td>
                            <td className="text-center">{p.result}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <MatchActions row={m} meId={me.playerId} />
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

function MatchActions({ row, meId }: { row: MatchRow; meId: string | null }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const snap = isMatchSnapshot(row.snapshot) ? (row.snapshot as MatchSnapshot) : null;
  const opp = row.players.find((p) => p.player_id && p.player_id !== meId);
  const analyze = () => {
    if (!snap) return;
    try { sessionStorage.setItem("analyze:pending", JSON.stringify(snap)); } catch {}
    void nav({ to: "/analyze/$clipId", params: { clipId: "local" } });
  };
  const gif = async () => {
    if (!snap) return;
    setBusy(true);
    try {
      const blob = await renderMatchGif(snap);
      const stamp = new Date(row.ended_at).toISOString().slice(0, 10);
      downloadBlob(blob, `quoridor-${stamp}.gif`);
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button onClick={analyze} disabled={!snap}
        title={snap ? "Open engine analysis" : "This match has no saved replay"}
        className="rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40">
        Analyze
      </button>
      <button onClick={gif} disabled={!snap || busy}
        title={snap ? "Download animated GIF" : "This match has no saved replay"}
        className="rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-40">
        {busy ? "Rendering…" : "Download Clip"}
      </button>
      {opp?.player_id && (
        <Link to="/player/$playerId" params={{ playerId: opp.player_id }}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">
          View {opp.name}'s profile
        </Link>
      )}
      {!snap && (
        <span className="text-[11px] text-zinc-500">Older match — no replay stored.</span>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <Link to="/" className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300">← Home</Link>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}