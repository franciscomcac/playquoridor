import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LobbyChrome, Avatar } from "@/components/LobbyChrome";
import { supabase } from "@/integrations/supabase/client";
import {
  createReply,
  deletePost,
  deleteThread,
  fetchPosts,
  fetchThread,
  isAdminOrMod,
  timeAgo,
  togglePinned,
  toggleLocked,
  type ForumPost,
  type ForumThread,
} from "@/lib/forum";

export const Route = createFileRoute("/forum/t/$id")({
  component: ThreadPage,
  head: ({ params }) => {
    const url = `https://playquoridor.online/forum/t/${params.id}`;
    const title = "Forum thread — playquoridor.online";
    const desc = "Read and reply to this Quoridor forum thread.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function ThreadPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [thread, setThread] = useState<ForumThread | null | undefined>(undefined);
  const [posts, setPosts] = useState<ForumPost[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isMod, setIsMod] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUid(data.user && !data.user.is_anonymous ? data.user.id : null);
    });
    void isAdminOrMod().then((v) => alive && setIsMod(v));
    return () => { alive = false; };
  }, []);

  async function reload() {
    try {
      const [t, p] = await Promise.all([fetchThread(id), fetchPosts(id)]);
      setThread(t);
      setPosts(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load thread.");
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onReply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await createReply({ threadId: id, body: reply });
    setBusy(false);
    if ("error" in r) { setErr(r.error); return; }
    setReply("");
    void reload();
  }

  async function onDeleteThread() {
    if (!confirm("Delete this thread and all replies?")) return;
    const { error } = await deleteThread(id);
    if (error) { setErr(error); return; }
    void navigate({ to: "/forum" });
  }

  if (thread === undefined) {
    return (
      <LobbyChrome>
        <div className="mx-auto max-w-[820px] px-6 pb-16 pt-10">
          <div className="h-6 w-40 animate-pulse rounded bg-[#141418]" />
          <div className="mt-4 h-32 animate-pulse rounded-2xl bg-[#0d0d10]" />
        </div>
      </LobbyChrome>
    );
  }

  if (thread === null) {
    return (
      <LobbyChrome>
        <div className="mx-auto max-w-[820px] px-6 pb-16 pt-10 text-center">
          <p className="text-[15px] text-[#a7a7b2]">Thread not found.</p>
          <Link to="/forum" className="mt-4 inline-block text-[13px] text-[#f5a524] hover:underline">
            ← Back to forum
          </Link>
        </div>
      </LobbyChrome>
    );
  }

  const isAuthor = uid && uid === thread.author_id;
  const canModerate = isMod;
  const canReply = !!uid && !thread.locked;

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[820px] px-6 pb-16 pt-10">
        <div className="mb-4 text-[12px] text-[#5c5c66]">
          <Link to="/forum" className="hover:text-[#a7a7b2]">Forum</Link>
          <span className="mx-2">/</span>
          <Link
            to="/forum/c/$slug"
            params={{ slug: thread.category_slug }}
            className="hover:text-[#a7a7b2]"
          >
            {thread.category_slug}
          </Link>
        </div>

        <header className="mb-6">
          <div className="flex items-center gap-2">
            {thread.pinned ? (
              <span className="rounded bg-[#f5a524]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f5a524]">
                Pinned
              </span>
            ) : null}
            {thread.locked ? (
              <span className="rounded bg-[#3a3a44] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a7a7b2]">
                Locked
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-[#ececf1]">
            {thread.title}
          </h1>
        </header>

        <article className="rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-5">
          <div className="flex items-center gap-3">
            <Avatar name={thread.author?.name ?? "Player"} imageUrl={thread.author?.avatar_url ?? null} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[#ececf1]">{thread.author?.name ?? "Player"}</div>
              <div className="text-[11px] text-[#5c5c66]">{timeAgo(thread.created_at)}</div>
            </div>
            {(isAuthor || canModerate) && (
              <div className="flex gap-1">
                {canModerate && (
                  <>
                    <button
                      onClick={() => togglePinned(thread.id, !thread.pinned).then(reload)}
                      className="rounded-md border border-[#2a2a33] px-2 py-1 text-[11px] text-[#a7a7b2] hover:bg-[#141418]"
                    >
                      {thread.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      onClick={() => toggleLocked(thread.id, !thread.locked).then(reload)}
                      className="rounded-md border border-[#2a2a33] px-2 py-1 text-[11px] text-[#a7a7b2] hover:bg-[#141418]"
                    >
                      {thread.locked ? "Unlock" : "Lock"}
                    </button>
                  </>
                )}
                <button
                  onClick={onDeleteThread}
                  className="rounded-md border border-[#3a1a1a] px-2 py-1 text-[11px] text-[#ff9a8a] hover:bg-[#1a0d0d]"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.6] text-[#ececf1]">
            {thread.body}
          </div>
        </article>

        <h2 className="mt-8 mb-3 font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.14em] text-[#83838e]">
          {posts?.length ?? 0} {(posts?.length ?? 0) === 1 ? "reply" : "replies"}
        </h2>

        <ul className="space-y-3">
          {(posts ?? []).map((p) => {
            const own = uid && uid === p.author_id;
            return (
              <li key={p.id} className="rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={p.author?.name ?? "Player"} imageUrl={p.author?.avatar_url ?? null} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#ececf1]">{p.author?.name ?? "Player"}</div>
                    <div className="text-[11px] text-[#5c5c66]">{timeAgo(p.created_at)}</div>
                  </div>
                  {(own || canModerate) && (
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this reply?")) return;
                        const { error } = await deletePost(p.id);
                        if (error) setErr(error);
                        else void reload();
                      }}
                      className="rounded-md border border-[#3a1a1a] px-2 py-1 text-[11px] text-[#ff9a8a] hover:bg-[#1a0d0d]"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-[14px] leading-[1.6] text-[#ececf1]">
                  {p.body}
                </div>
              </li>
            );
          })}
          {posts == null
            ? Array.from({ length: 2 }).map((_, i) => (
                <li key={i} className="h-24 animate-pulse rounded-2xl bg-[#0d0d10]" />
              ))
            : null}
        </ul>

        <div className="mt-8">
          {canReply ? (
            <form onSubmit={onReply} className="rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                maxLength={4000}
                rows={4}
                className="w-full rounded-lg border border-[#1a1a1f] bg-[#111114] px-3 py-2 text-[14px] text-[#ececf1] outline-none focus:border-[#2fd575]"
              />
              {err ? <div className="mt-2 text-[12px] text-[#ff9a8a]">{err}</div> : null}
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={busy || reply.trim().length < 1}
                  className="rounded-lg bg-[#2fd575] px-4 py-1.5 text-[12px] font-semibold text-[#0b0b0d] disabled:opacity-50"
                >
                  {busy ? "Posting…" : "Reply"}
                </button>
              </div>
            </form>
          ) : thread.locked ? (
            <div className="rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-4 text-center text-[13px] text-[#83838e]">
              This thread is locked.
            </div>
          ) : (
            <div className="rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-4 text-center text-[13px] text-[#a7a7b2]">
              <Link to="/auth" className="font-semibold text-[#2fd575] hover:underline">Sign in</Link> to reply.
            </div>
          )}
        </div>
      </div>
    </LobbyChrome>
  );
}