import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { requireRealUser } from "@/lib/auth-gate";
import { COUNTRY_BY_ISO } from "@/lib/countries";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends · playquoridor.online" },
      { name: "description", content: "Find friends and manage your Quoridor friend list." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FriendsPage,
});

type Me = Awaited<ReturnType<typeof requireRealUser>>;
type SearchHit = { player_id: string; name: string; country: string | null; auth_user_id: string | null };
type Row = {
  id: string;
  requester_id: string;
  addressee_id: string;
  requester_auth: string;
  addressee_auth: string;
  status: "pending" | "accepted" | "declined" | "blocked";
  other: { name: string; country: string | null };
};

function FriendsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    void requireRealUser().then((u) => {
      if (!u) { void navigate({ to: "/auth" }); return; }
      setMe(u);
    });
  }, [navigate]);

  const loadFriends = async () => {
    if (!me) return;
    const { data } = await supabase
      .from("friendships")
      .select("id,requester_id,addressee_id,requester_auth,addressee_auth,status,requester:requester_id(name,country),addressee:addressee_id(name,country)")
      .order("created_at", { ascending: false });
    if (!data) return;
    const mapped: Row[] = data.map((r: any) => {
      const iAmReq = r.requester_auth === me.authUserId;
      const other = iAmReq ? r.addressee : r.requester;
      return {
        id: r.id,
        requester_id: r.requester_id,
        addressee_id: r.addressee_id,
        requester_auth: r.requester_auth,
        addressee_auth: r.addressee_auth,
        status: r.status,
        other: { name: other?.name ?? "player", country: other?.country ?? null },
      };
    });
    setRows(mapped);
  };

  useEffect(() => { if (me) void loadFriends(); /* eslint-disable-next-line */ }, [me]);

  // Live search
  useEffect(() => {
    if (!me) return;
    const s = q.trim();
    if (s.length < 2) { setResults([]); return; }
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("search_players", { _q: s, _limit: 8 });
      setResults((data ?? []).filter((r: SearchHit) => r.auth_user_id !== me.authUserId));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, me]);

  async function sendRequest(hit: SearchHit) {
    if (!me || !hit.auth_user_id) return;
    setBusy(true);
    const { error } = await supabase.from("friendships").insert({
      requester_id: me.playerId, addressee_id: hit.player_id,
      requester_auth: me.authUserId, addressee_auth: hit.auth_user_id,
      status: "pending",
    });
    setBusy(false);
    setFlash(error ? (error.message.includes("duplicate") ? "Already sent." : error.message) : `Request sent to @${hit.name}`);
    window.setTimeout(() => setFlash(null), 2200);
    if (!error) { setQ(""); setResults([]); await loadFriends(); }
  }
  async function respond(row: Row, status: "accepted" | "declined") {
    await supabase.from("friendships").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id);
    await loadFriends();
  }
  async function remove(row: Row) {
    await supabase.from("friendships").delete().eq("id", row.id);
    await loadFriends();
  }

  const incoming = rows.filter((r) => r.status === "pending" && r.addressee_auth === me?.authUserId);
  const outgoing = rows.filter((r) => r.status === "pending" && r.requester_auth === me?.authUserId);
  const accepted = rows.filter((r) => r.status === "accepted");

  if (me === undefined) return <PageShell><p className="text-zinc-500">Loading…</p></PageShell>;

  return (
    <PageShell>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Friends</h1>
        <p className="text-xs text-zinc-500">{accepted.length} friends</p>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500">Find players</label>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search usernames…"
          className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-emerald-500/60"
        />
        <AnimatePresence>
          {flash && (
            <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-xs text-emerald-400">
              {flash}
            </motion.p>
          )}
        </AnimatePresence>
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-950">
            {results.map((r) => (
              <li key={r.player_id} className="flex items-center justify-between px-4 py-2.5">
                <PlayerBadge name={r.name} country={r.country} />
                <button disabled={busy}
                  onClick={() => sendRequest(r)}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-950 hover:bg-emerald-400 disabled:opacity-50">
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Section title={`Incoming requests (${incoming.length})`}>
        {incoming.length === 0 ? <Empty text="No incoming requests." /> : incoming.map((r) => (
          <RowCard key={r.id} row={r}>
            <button onClick={() => respond(r, "accepted")} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-950 hover:bg-emerald-400">Accept</button>
            <button onClick={() => respond(r, "declined")} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:bg-zinc-900">Decline</button>
          </RowCard>
        ))}
      </Section>

      <Section title={`Pending (${outgoing.length})`}>
        {outgoing.length === 0 ? <Empty text="No pending outgoing requests." /> : outgoing.map((r) => (
          <RowCard key={r.id} row={r}>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Waiting…</span>
            <button onClick={() => remove(r)} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-zinc-900">Cancel</button>
          </RowCard>
        ))}
      </Section>

      <Section title={`Your friends (${accepted.length})`}>
        {accepted.length === 0 ? <Empty text="No friends yet — search above." /> : accepted.map((r) => (
          <RowCard key={r.id} row={r}>
            <button onClick={() => remove(r)} className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-300 hover:bg-rose-500/20">Remove</button>
          </RowCard>
        ))}
      </Section>
    </PageShell>
  );
}

function PlayerBadge({ name, country }: { name: string; country: string | null }) {
  const flag = country ? (COUNTRY_BY_ISO[country]?.flag ?? "🌐") : "🌐";
  return (
    <span className="flex items-center gap-3">
      <span className="text-lg">{flag}</span>
      <span className="text-sm font-semibold text-zinc-100">@{name}</span>
    </span>
  );
}
function RowCard({ row, children }: { row: Row; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <PlayerBadge name={row.other.name} country={row.other.country} />
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-xs text-zinc-500">{text}</p>;
}
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link to="/" className="text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-300">← Home</Link>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}