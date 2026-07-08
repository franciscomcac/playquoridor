import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireRealUser } from "@/lib/auth-gate";
import { QuoridorBoard } from "@/components/QuoridorBoard";
import type { GameState } from "@/lib/quoridor";

export const Route = createFileRoute("/clips")({
  head: () => ({
    meta: [
      { title: "Saved clips · playquoridor.online" },
      { name: "description", content: "Your saved Quoridor board positions." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClipsPage,
});

type Clip = { id: string; title: string; mode: number; snapshot: unknown; created_at: string };

function ClipsPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Awaited<ReturnType<typeof requireRealUser>>>(null);
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [active, setActive] = useState<Clip | null>(null);

  useEffect(() => {
    void (async () => {
      const u = await requireRealUser();
      if (!u) { void navigate({ to: "/auth" }); return; }
      setMe(u);
      const { data } = await supabase
        .from("saved_clips")
        .select("id,title,mode,snapshot,created_at")
        .order("created_at", { ascending: false });
      setClips((data ?? []) as Clip[]);
    })();
  }, [navigate]);

  async function del(id: string) {
    await supabase.from("saved_clips").delete().eq("id", id);
    setClips((c) => (c ?? []).filter((x) => x.id !== id));
    if (active?.id === id) setActive(null);
  }

  if (!me) return <Shell><p className="text-zinc-500">Loading…</p></Shell>;

  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Saved clips</h1>
        <p className="text-xs text-zinc-500">{clips?.length ?? 0} saved</p>
      </div>

      {clips?.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
          <p className="text-sm text-zinc-400">No clips yet. During a match, use "Save clip" on the round summary.</p>
          <Link to="/" className="mt-3 inline-block rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-950 hover:bg-emerald-400">Play a game</Link>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
        <ul className="space-y-2">
          {(clips ?? []).map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setActive(c)}
                className={"flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors " +
                  (active?.id === c.id ? "border-emerald-500/60 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900")}
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{c.title}</p>
                  <p className="text-[11px] text-zinc-500">{c.mode}p · {new Date(c.created_at).toLocaleString()}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); void del(c.id); }}
                  className="rounded-md border border-zinc-800 px-2 py-1 text-[10px] uppercase tracking-widest text-rose-400 hover:bg-rose-500/10"
                >
                  Delete
                </button>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          {active ? (
            <ClipView clip={active} />
          ) : (
            <p className="p-6 text-center text-xs text-zinc-500">Select a clip to view the position.</p>
          )}
        </div>
      </div>
    </Shell>
  );
}

function ClipView({ clip }: { clip: Clip }) {
  // Snapshot stored as full GameState; render read-only.
  try {
    const state = clip.snapshot as GameState;
    return (
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">{clip.title}</p>
        <QuoridorBoard state={state} you={0} onMove={() => {}} interactive={false} />
      </div>
    );
  } catch {
    return <p className="p-6 text-center text-xs text-rose-400">Clip data is invalid.</p>;
  }
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