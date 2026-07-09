import { createFileRoute, Link } from "@tanstack/react-router";
import { LobbyChrome } from "@/components/LobbyChrome";
import { BLOG_POSTS } from "@/lib/blog-posts";

const SITE_URL = "https://playquoridor.online";
const PAGE_URL = `${SITE_URL}/blog`;
const TITLE = "Quoridor Blog — Strategy, Rules & Game Modes";
const DESCRIPTION =
  "The playquoridor.online blog: Quoridor rules, strategy guides, comparisons and updates on new game modes like Fog of Walls.";

export const Route = createFileRoute("/blog/")({
  component: BlogIndex,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "playquoridor.online blog",
          url: PAGE_URL,
          blogPost: BLOG_POSTS.map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            description: p.description,
            datePublished: p.date,
            url: `${SITE_URL}/blog/${p.slug}`,
          })),
        }),
      },
    ],
  }),
});

function BlogIndex() {
  const posts = [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[860px] px-6 pb-16 pt-10">
        <header className="mb-8">
          <p className="font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.14em] text-[#f5a524]">
            playquoridor.online / blog
          </p>
          <h1 className="mt-2 text-[34px] font-bold tracking-[-0.02em] text-[#ececf1]">
            Quoridor strategy, rules & updates
          </h1>
          <p className="mt-3 max-w-[640px] text-[15px] leading-[1.6] text-[#a7a7b2]">
            Guides for new players, deep-dives for competitive climbers, and news
            on new modes shipping to playquoridor.online.
          </p>
        </header>
        <ul className="space-y-4">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                to="/blog/$slug"
                params={{ slug: p.slug }}
                className="block rounded-2xl border border-[#232329] bg-[#0e0e11] p-6 transition-colors hover:border-[#3a3a44] hover:bg-[#131318]"
              >
                <div className="flex flex-wrap items-center gap-2 font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.12em] text-[#5c5c66]">
                  <time dateTime={p.date}>
                    {new Date(p.date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </time>
                  <span>·</span>
                  <span>{p.readMinutes} min read</span>
                  {p.tags.map((t) => (
                    <span key={t} className="rounded-full border border-[#232329] px-2 py-[2px] text-[10px] text-[#a7a7b2]">
                      {t}
                    </span>
                  ))}
                </div>
                <h2 className="mt-2 text-[20px] font-bold text-[#ececf1]">{p.title}</h2>
                <p className="mt-2 text-[14.5px] leading-[1.6] text-[#a7a7b2]">{p.description}</p>
                <span className="mt-3 inline-block text-[13px] font-medium text-[#f5c542]">
                  Read post →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </LobbyChrome>
  );
}