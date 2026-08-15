import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { LobbyChrome } from "@/components/LobbyChrome";
import { BLOG_POSTS, getPost, type BlogBlock, type BlogPost } from "@/lib/blog-posts";

const SITE_URL = "https://playquoridor.online";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPost(params.slug);
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData, params }) => {
    const url = `${SITE_URL}/blog/${params.slug}`;
    if (!loaderData) {
      return {
        meta: [
          { title: "Post not found · playquoridor.online" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const p = loaderData;
    return {
      meta: [
        { title: `${p.title} · playquoridor.online` },
        { name: "description", content: p.description },
        { property: "og:title", content: p.title },
        { property: "og:description", content: p.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: p.title },
        { name: "twitter:description", content: p.description },
        { name: "article:published_time", content: p.date },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: p.title,
            description: p.description,
            datePublished: p.date,
            url,
            mainEntityOfPage: url,
            author: { "@type": "Organization", name: "playquoridor.online" },
            publisher: { "@type": "Organization", name: "playquoridor.online" },
          }),
        },
      ],
    };
  },
  notFoundComponent: PostNotFound,
  component: PostPage,
});

function PostNotFound() {
  return (
    <LobbyChrome>
      <div className="mx-auto max-w-[720px] px-6 pb-16 pt-14 text-center">
        <h1 className="text-[28px] font-bold text-[#ececf1]">Post not found</h1>
        <p className="mt-3 text-[#a7a7b2]">That article doesn't exist or has moved.</p>
        <Link to="/blog" className="mt-6 inline-block text-[#f5c542] underline">
          Back to the blog
        </Link>
      </div>
    </LobbyChrome>
  );
}

function PostPage() {
  const p = Route.useLoaderData() as BlogPost;
  const related = BLOG_POSTS.filter((x) => x.slug !== p.slug).slice(0, 3);
  return (
    <LobbyChrome>
      <article className="mx-auto max-w-[760px] px-6 pb-16 pt-10">
        <Link
          to="/blog"
          className="font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.14em] text-[#5c5c66] hover:text-[#a7a7b2]"
        >
          ← All posts
        </Link>
        <header className="mt-4 border-b border-[#1a1a1f] pb-6">
          <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em] text-[#ececf1]">
            {p.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.12em] text-[#5c5c66]">
            <time dateTime={p.date}>
              {new Date(p.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span>·</span>
            <span>{p.readMinutes} min read</span>
          </div>
        </header>
        <div className="mt-6 space-y-4 text-[15.5px] leading-[1.75] text-[#c8c8d0]">
          {p.body.map((b: BlogBlock, i: number) => (
            <Block key={i} block={b} />
          ))}
        </div>

        <section className="mt-12 rounded-2xl border border-[#232329] bg-[#0e0e11] p-6">
          <h2 className="text-[18px] font-bold text-[#ececf1]">Play Quoridor now</h2>
          <p className="mt-2 text-[14px] text-[#a7a7b2]">
            Free, no download, no signup. Quick match, private rooms, bot practice, and 4-player
            free-for-alls.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-lg bg-[#f5a524] px-4 py-2 text-[13px] font-bold text-[#0b0b0d] hover:bg-[#ffb63a]"
          >
            Play now →
          </Link>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[18px] font-bold text-[#ececf1]">More posts</h2>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    to="/blog/$slug"
                    params={{ slug: r.slug }}
                    className="block rounded-lg border border-[#232329] bg-[#0e0e11] px-4 py-3 hover:border-[#3a3a44]"
                  >
                    <div className="text-[14.5px] font-semibold text-[#ececf1]">{r.title}</div>
                    <div className="mt-1 text-[13px] text-[#a7a7b2]">{r.description}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </LobbyChrome>
  );
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "p":
      return <p>{block.text}</p>;
    case "h2":
      return <h2 className="mt-6 text-[22px] font-bold text-[#ececf1]">{block.text}</h2>;
    case "h3":
      return <h3 className="mt-4 text-[17px] font-bold text-[#ececf1]">{block.text}</h3>;
    case "ul":
      return (
        <ul className="list-disc space-y-1 pl-6">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-1 pl-6">
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-[#f5a524] pl-4 italic text-[#a7a7b2]">
          {block.text}
        </blockquote>
      );
  }
}
