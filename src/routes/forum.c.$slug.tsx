import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LobbyChrome, Avatar } from "@/components/LobbyChrome";
import { supabase } from "@/integrations/supabase/client";
import {
  createThread,
  fetchCategories,
  fetchThreadsByCategory,
  timeAgo,
  type ForumCategory,
  type ForumThread,
} from "@/lib/forum";

export const Route = createFileRoute("/forum/c/$slug")({
  component: CategoryPage,
  head: ({ params }) => {
    const title = `${prettySlug(params.slug)} — Quoridor Forum`;
    const desc = `Threads in the ${prettySlug(params.slug)} section of the playquoridor.online forum.`;
    const url = `https://playquoridor.online/forum/c/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function prettySlug(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CategoryPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [cats, setCats] = useState<ForumCategory[] | null>(null);
  const [threads, setThreads] = useState<ForumThread[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean>(false);
  const [composerOpen, setComposerOpen] = useState<boolean>(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setSignedIn(!!data.user && !data.user.is_anonymous);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, t] = await Promise.all([fetchCategories(), fetchThreadsByCategory(slug)]);
        if (!alive) return;
        setCats(c);
        setThreads(t);
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load threads.");
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  const cat = cats?.find((c) => c.slug === slug);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await createThread({ categorySlug: slug, title, body });
    setBusy(false);
    if ("error" in r) { setErr(r.error); return; }
    void navigate({ to: "/forum/t/$id", params: { id: r.id } });
  }

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[1000px] px-6 pb-16 pt-10">
        <div className="mb-4 text-[12px] text-[#5c5c66]">
          <Link to="/forum" className="hover:text-[#a7a7b2]">Forum</Link>
          <span className="mx-2">/</span>
          <span className="text-[#a7a7b2]">{cat?.name ?? prettySlug(slug)}</span>
        </div>

        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#ececf1]">
              {cat?.name ?? prettySlug(slug)}
            </h1>
            {cat?.description ? (
              <p className="mt-2 max-w-[600px] text-[14px] text-[#a7a7b2]">{cat.description}</p>
            ) : null}
          </div>
          {signedIn ? (
            <button
              onClick={() => setComposerOpen((v) => !v)}
              className="rounded-xl bg-[#2fd575] px-4 py-2 text-[13px] font-semibold text-[#0b0b0d] hover:bg-[#5be08d]"
            >
              {composerOpen ? "Cancel" : "New thread"}
            </button>
          ) : (
            <Link
              to="/auth"
              className="rounded-xl border border-[#2a2a33] px-4 py-2 text-[13px] font-medium text-[#ececf1] hover:bg-[#141418]"
            >
              Sign in to post
            </Link>
          )}
        </header>

        {composerOpen && signedIn ? (
          <form onSubmit={onSubmit} className="mb-6 rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Thread title"
              maxLength={140}
              className="w-full rounded-lg border border-[#1a1a1f] bg-[#111114] px-3 py-2 text-[14px] text-[#ececf1] outline-none focus:border-[#2fd575]"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your thoughts…"
              maxLength={8000}
              rows={6}
              className="mt-2 w-full rounded-lg border border-[#1a1a1f] bg-[#111114] px-3 py-2 text-[14px] text-[#ececf1] outline-none focus:border-[#2fd575]"
            />
            {err ? <div className="mt-2 text-[12px] text-[#ff9a8a]">{err}</div> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-lg border border-[#2a2a33] px-3 py-1.5 text-[12px] text-[#a7a7b2] hover:bg-[#141418]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || title.trim().length < 3 || body.trim().length < 1}
                className="rounded-lg bg-[#2fd575] px-4 py-1.5 text-[12px] font-semibold text-[#0b0b0d] disabled:opacity-50"
              >
                {busy ? "Posting…" : "Post thread"}
              </button>
            </div>
          </form>
        ) : null}

        {err && !composerOpen ? (
          <div className="mb-4 rounded-2xl border border-[#3a1a1a] bg-[#1a0d0d] p-4 text-[13px] text-[#ff9a8a]">{err}</div>
        ) : null}

        <ul className="divide-y divide-[#17171b] rounded-2xl border border-[#1a1a1f] bg-[#0d0d10]">
          {(threads ?? []).map((t) => (
            <li key={t.id}>
              <Link
                to="/forum/t/$id"
                params={{ id: t.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#111114]"
              >
                <Avatar name={t.author?.name ?? "Player"} imageUrl={t.author?.avatar_url ?? null} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.pinned ? (
                      <span className="rounded bg-[#f5a524]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f5a524]">
                        Pinned
                      </span>
                    ) : null}
                    {t.locked ? (
                      <span className="rounded bg-[#3a3a44] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a7a7b2]">
                        Locked
                      </span>
                    ) : null}
                    <span className="truncate text-[15px] font-medium text-[#ececf1]">{t.title}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-[#5c5c66]">
                    by {t.author?.name ?? "Player"} · {timeAgo(t.last_activity_at)}
                  </div>
                </div>
                <span className="rounded-md bg-[#141418] px-2 py-1 text-[11px] tabular-nums text-[#a7a7b2]">
                  {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}
                </span>
              </Link>
            </li>
          ))}
          {threads == null
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="h-[62px] animate-pulse bg-[#0d0d10]" />
              ))
            : null}
          {threads && threads.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-[#5c5c66]">
              No threads in this category yet.
            </li>
          ) : null}
        </ul>
      </div>
    </LobbyChrome>
  );
}