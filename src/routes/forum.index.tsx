import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LobbyChrome, Avatar } from "@/components/LobbyChrome";
import {
  fetchCategories,
  fetchRecentThreads,
  timeAgo,
  type ForumCategory,
  type ForumThread,
} from "@/lib/forum";

const SITE_URL = "https://playquoridor.online";
const PAGE_URL = `${SITE_URL}/forum`;
const TITLE = "Quoridor Forum — Strategy debates & community";
const DESCRIPTION =
  "Talk Quoridor strategy, rules, and updates with other players on the playquoridor.online community forum.";

export const Route = createFileRoute("/forum/")({
  component: ForumIndex,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
});

function ForumIndex() {
  const [cats, setCats] = useState<ForumCategory[] | null>(null);
  const [recent, setRecent] = useState<ForumThread[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, r] = await Promise.all([fetchCategories(), fetchRecentThreads(8)]);
        if (!alive) return;
        setCats(c);
        setRecent(r);
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Failed to load forum.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[1100px] px-6 pb-16 pt-10">
        <header className="mb-8">
          <p className="font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.14em] text-[#f5a524]">
            playquoridor.online / forum
          </p>
          <h1 className="mt-2 text-[34px] font-bold tracking-[-0.02em] text-[#ececf1]">
            Community forum
          </h1>
          <p className="mt-3 max-w-[640px] text-[15px] leading-[1.6] text-[#a7a7b2]">
            Discuss openings, wall traps, ladder climbs, and new game modes. Anyone can read — sign
            in to post or reply.
          </p>
        </header>

        {err ? (
          <div className="rounded-2xl border border-[#3a1a1a] bg-[#1a0d0d] p-4 text-[13px] text-[#ff9a8a]">
            {err}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          {(cats ?? []).map((c) => (
            <Link
              key={c.slug}
              to="/forum/c/$slug"
              params={{ slug: c.slug }}
              className="group rounded-2xl border border-[#1a1a1f] bg-[#0d0d10] p-5 transition hover:border-[#2a2a33] hover:bg-[#111114]"
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl text-[13px] font-bold text-[#0b0b0d]"
                  style={{ background: catColor(c.slug) }}
                >
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-[#ececf1]">{c.name}</div>
                  {c.description ? (
                    <div className="mt-0.5 truncate text-[12px] text-[#83838e]">
                      {c.description}
                    </div>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
          {cats == null
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[76px] animate-pulse rounded-2xl border border-[#1a1a1f] bg-[#0d0d10]"
                />
              ))
            : null}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.14em] text-[#83838e]">
            Recent activity
          </h2>
          <ul className="divide-y divide-[#17171b] rounded-2xl border border-[#1a1a1f] bg-[#0d0d10]">
            {(recent ?? []).map((t) => (
              <li key={t.id}>
                <Link
                  to="/forum/t/$id"
                  params={{ id: t.id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#111114]"
                >
                  <Avatar
                    name={t.author?.name ?? "Player"}
                    imageUrl={t.author?.avatar_url ?? null}
                    size={30}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {t.pinned ? (
                        <span className="rounded bg-[#f5a524]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f5a524]">
                          Pinned
                        </span>
                      ) : null}
                      <span className="truncate text-[14px] font-medium text-[#ececf1]">
                        {t.title}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[#5c5c66]">
                      {t.author?.name ?? "Player"} · {catNameFor(cats, t.category_slug)} ·{" "}
                      {timeAgo(t.last_activity_at)}
                    </div>
                  </div>
                  <span className="rounded-md bg-[#141418] px-2 py-1 text-[11px] tabular-nums text-[#a7a7b2]">
                    {t.reply_count} {t.reply_count === 1 ? "reply" : "replies"}
                  </span>
                </Link>
              </li>
            ))}
            {recent == null
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="h-[56px] animate-pulse bg-[#0d0d10]" />
                ))
              : null}
            {recent && recent.length === 0 ? (
              <li className="px-4 py-6 text-center text-[13px] text-[#5c5c66]">
                No threads yet — be the first to start a discussion.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </LobbyChrome>
  );
}

function catColor(slug: string): string {
  const map: Record<string, string> = {
    strategy: "#f5a524",
    rules: "#6aa5ff",
    "off-topic": "#c48bff",
    "bug-reports": "#ff6b4a",
  };
  return map[slug] ?? "#83838e";
}

function catNameFor(cats: ForumCategory[] | null, slug: string): string {
  return cats?.find((c) => c.slug === slug)?.name ?? slug;
}
