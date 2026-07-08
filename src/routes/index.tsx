import { createFileRoute, Link } from "@tanstack/react-router";

const SITE_URL = "https://playquoridor.online";
const TITLE = "Quoridor Online — Move. Wall. Win.";
const DESC =
  "Free browser Quoridor. Peer-to-peer rooms, quick match, 4-player free-for-alls, bot practice, and a daily puzzle. No download, no signup.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: SITE_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Play Quoridor Online",
          url: SITE_URL,
          description: DESC,
          applicationCategory: "GameApplication",
          genre: "Strategy",
          operatingSystem: "Web Browser",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is the game where you place walls to block your opponent?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "It's Quoridor — a 2- or 4-player strategy game where each player moves a pawn across a 9×9 grid while placing fence-walls to slow the opponents down. First pawn to reach the opposite side wins.",
              },
            },
            {
              "@type": "Question",
              name: "What is the balls and walls game called?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "The board game people describe as 'balls and walls' is Quoridor. Play it free in your browser at playquoridor.online.",
              },
            },
            {
              "@type": "Question",
              name: "How do you play Quoridor online?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Open playquoridor.online, hit Play, pick Quick Match or share a private room code. Move your pawn one square or drop a wall to block a rival; first to reach the opposite side wins.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Marquee />
      <Modes />
      <HowItWorks />
      <FAQ />
      <FooterCTA />
    </main>
  );
}

/* -------------------------- HERO -------------------------- */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Layered warm gradient + noise. Sits on top of the app's radial body bg. */}
      <div aria-hidden className="hero-orb hero-orb-a" />
      <div aria-hidden className="hero-orb hero-orb-b" />
      <div aria-hidden className="hero-grain" />

      <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-24 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:pt-16 lg:pb-32">
        <NavBar />

        <div className="relative">
          <span className="hero-eyebrow inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_2px_var(--primary)]" />
            Free · No install · Peer-to-peer
          </span>

          <h1
            className="hero-title mt-6 font-serif text-[clamp(3rem,9vw,7.5rem)] leading-[0.9] tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="hero-word">Move.</span>{" "}
            <span className="hero-word hero-word-2">Wall.</span>{" "}
            <span className="hero-word hero-word-3 hero-accent">Win.</span>
          </h1>

          <p className="hero-sub mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            The classic <strong className="text-foreground/90">Quoridor</strong> strategy game — reborn
            for the browser. Quick matches, private rooms with a code, four-player free-for-alls,
            bot practice, and a fresh puzzle every day.
          </p>

          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/game"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold uppercase tracking-widest text-background shadow-[0_20px_60px_-20px_var(--foreground)] transition-transform hover:-translate-y-0.5"
            >
              <span className="relative z-10">Play now</span>
              <span aria-hidden className="relative z-10 transition-transform group-hover:translate-x-1">→</span>
              <span aria-hidden className="hero-shimmer" />
            </Link>
            <Link
              to="/puzzle"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-5 py-3.5 text-sm font-medium text-foreground/80 backdrop-blur hover:bg-card"
            >
              <span aria-hidden>◆</span> Daily puzzle
            </Link>
            <Link
              to="/stats"
              className="inline-flex items-center gap-2 rounded-full px-4 py-3.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Leaderboard
            </Link>
          </div>

          <dl className="hero-stats mt-10 grid max-w-md grid-cols-3 gap-6">
            <Stat k="2 min" v="to learn" />
            <Stat k="4-player" v="free-for-all" />
            <Stat k="0 downloads" v="all browser" />
          </dl>
        </div>

        <div className="relative">
          <HeroBoard />
        </div>
      </div>
    </section>
  );
}

function NavBar() {
  return (
    <nav className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-4 pt-5 sm:px-6">
      <Link to="/" className="flex items-center gap-2.5">
        <img src="/favicon.png" alt="Quoridor" width={32} height={32}
          className="h-8 w-8 rounded-md shadow-[0_6px_14px_-6px_oklch(0_0_0/0.6)]" />
        <span className="text-sm font-semibold tracking-tight">playquoridor.online</span>
      </Link>
      <div className="flex items-center gap-1">
        <Link to="/puzzle" className="hidden rounded-md px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground sm:inline-block">Puzzle</Link>
        <Link to="/stats" className="hidden rounded-md px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground sm:inline-block">Stats</Link>
        <Link to="/about" className="hidden rounded-md px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground sm:inline-block">About</Link>
        <Link to="/auth" className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-secondary">Sign in</Link>
      </div>
    </nav>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-lg font-semibold text-foreground sm:text-xl">{k}</dt>
      <dd className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">{v}</dd>
    </div>
  );
}

/* -------------------------- HERO BOARD (animated) -------------------------- */

function HeroBoard() {
  // 9x9 mini-board. Two pawns advance, a couple of walls "drop" in — pure CSS
  // animation, loops forever. This is the wow moment beside the headline.
  const cells = Array.from({ length: 9 * 9 }, (_, i) => i);
  return (
    <div className="hero-board relative mx-auto aspect-square w-full max-w-[520px]">
      <div aria-hidden className="hero-board-glow" />
      <div className="hero-board-frame relative h-full w-full rounded-[28px] border border-border/60 bg-[color:var(--board-bg)] p-3 shadow-[0_40px_80px_-30px_oklch(0.15_0.02_55/0.55),0_2px_0_oklch(1_0_0/0.4)_inset]">
        <div className="hero-board-grid relative grid h-full w-full grid-cols-9 gap-[3px] rounded-2xl bg-[color:var(--board-line)] p-[3px]">
          {cells.map((i) => (
            <div key={i} className="rounded-[3px] bg-[color:var(--board-cell)]" />
          ))}
          {/* pawns */}
          <span className="hero-pawn hero-pawn-a" style={{ background: "var(--p1)" }} />
          <span className="hero-pawn hero-pawn-b" style={{ background: "var(--p2)" }} />
          {/* walls */}
          <span className="hero-wall hero-wall-a" />
          <span className="hero-wall hero-wall-b" />
          <span className="hero-wall hero-wall-c" />
        </div>
      </div>
      <div className="hero-board-caption absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        9 × 9 · 2 or 4 players
      </div>
    </div>
  );
}

/* -------------------------- MARQUEE -------------------------- */

function Marquee() {
  const items = [
    "Quick Match", "Private rooms", "4-player free-for-all", "Bot practice",
    "Daily puzzle", "Move history", "Share result cards", "Peer-to-peer",
  ];
  const strip = [...items, ...items];
  return (
    <section aria-hidden className="relative overflow-hidden border-y border-border/50 bg-card/40 py-3 backdrop-blur-sm">
      <div className="marquee flex min-w-max gap-10 px-6 text-[11px] font-medium uppercase tracking-[0.35em] text-muted-foreground">
        {strip.map((t, i) => (
          <span key={i} className="flex items-center gap-10">
            <span>{t}</span>
            <span aria-hidden className="text-primary">◆</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/* -------------------------- MODES -------------------------- */

function Modes() {
  const mods = [
    { t: "Quick Match", d: "One click, next open room. If none, a bot rides in.", href: "/game", tag: "1v1" },
    { t: "Private Room", d: "Share a 4-letter code. Play a friend across the world.", href: "/game", tag: "Invite" },
    { t: "Free-for-All", d: "Four players, four goals, five walls each. Chaos.", href: "/game", tag: "4P" },
    { t: "Daily Puzzle", d: "A hand-crafted position. Solve it in N moves.", href: "/puzzle", tag: "Daily" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Ways to play</p>
          <h2 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
            Four modes. Zero friction.
          </h2>
        </div>
        <Link to="/game" className="text-xs uppercase tracking-widest text-primary hover:underline">Jump into the lobby →</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {mods.map((m, i) => (
          <Link
            key={m.t}
            to={m.href}
            className="modes-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-1"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div>
              <span className="text-[10px] uppercase tracking-[0.35em] text-primary">{m.tag}</span>
              <h3 className="mt-2 font-serif text-2xl leading-tight" style={{ fontFamily: "var(--font-display)" }}>{m.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{m.d}</p>
            </div>
            <span className="mt-6 inline-flex items-center gap-1 text-xs uppercase tracking-widest text-foreground/70 group-hover:text-foreground">
              Play <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </span>
            <span aria-hidden className="modes-card-glow" />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------- HOW IT WORKS -------------------------- */

function HowItWorks() {
  const steps = [
    { n: "01", t: "Move a pawn", d: "One square in any direction. Reach the opposite edge to win the round." },
    { n: "02", t: "Or drop a wall", d: "Two squares long. Slows the other player without ever fully trapping them." },
    { n: "03", t: "Repeat until someone crosses", d: "Best strategist wins the match — anywhere from 1 to 5 rounds." },
  ];
  return (
    <section className="relative border-t border-border/50 bg-card/30 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">Learn in 2 minutes</p>
        <h2 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
          The whole game in three moves.
        </h2>
        <ol className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="relative rounded-2xl border border-border/60 bg-background/40 p-6">
              <span className="text-4xl font-semibold text-primary/70" style={{ fontFamily: "var(--font-display)" }}>{s.n}</span>
              <h3 className="mt-3 text-xl font-medium">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------- FAQ -------------------------- */

function FAQ() {
  const qs = [
    { q: "What is Quoridor?", a: "A 2- or 4-player strategy game on a 9×9 grid. Move your pawn one square per turn, or drop a wall to slow a rival. First to the opposite side wins." },
    { q: "Do I need an account?", a: "No. Everything works anonymously in your browser. Sign in only if you want your stats to follow you across devices." },
    { q: "How does multiplayer work?", a: "Rooms are peer-to-peer WebRTC. Share a code with a friend, or hit Quick Match to be paired with the next open room." },
    { q: "Full rules?", a: "2p starts with 10 walls each; 4p starts with 5. Walls are two squares long and can never fully trap a player. Adjacent pawns can jump each other; if a wall or edge blocks the landing, you may step diagonally instead." },
    { q: "What's the 'balls and walls' game?", a: "That's Quoridor — round pawns and wall segments. You're in the right place." },
  ];
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
      <p className="text-[10px] uppercase tracking-[0.35em] text-muted-foreground">FAQ</p>
      <h2 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
        Questions, answered.
      </h2>
      <ul className="mt-10 divide-y divide-border/50 border-y border-border/50">
        {qs.map((q) => (
          <li key={q.q}>
            <details className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium hover:text-primary">
                <span>{q.q}</span>
                <span aria-hidden className="text-xs opacity-50 transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{q.a}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------- CTA + FOOTER -------------------------- */

function FooterCTA() {
  return (
    <>
      <section className="relative overflow-hidden border-t border-border/50 py-24 text-center sm:py-32">
        <div aria-hidden className="hero-orb hero-orb-b" style={{ opacity: 0.55 }} />
        <div className="relative mx-auto max-w-2xl px-6">
          <h2 className="font-serif text-5xl leading-[0.95] sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>
            Your move.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
            Grab a friend, an internet connection, and two minutes. That's the whole setup.
          </p>
          <Link
            to="/game"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-4 text-sm font-semibold uppercase tracking-widest text-background transition-transform hover:-translate-y-0.5"
          >
            Start playing <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
      <footer className="border-t border-border/40 py-8 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        playquoridor.online · peer-to-peer · no accounts required
      </footer>
    </>
  );
}