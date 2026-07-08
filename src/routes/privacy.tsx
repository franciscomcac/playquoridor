import { createFileRoute } from "@tanstack/react-router";
import { LobbyChrome } from "@/components/LobbyChrome";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · playquoridor.online" },
      { name: "description", content: "How playquoridor.online collects, uses, and protects your data." },
      { property: "og:title", content: "Privacy Policy · playquoridor.online" },
      { property: "og:description", content: "How playquoridor.online handles your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const updated = "July 8, 2026";
  return (
    <LobbyChrome>
      <article className="mx-auto max-w-[780px] px-8 pb-16 pt-9 text-[14.5px] leading-[1.7] text-[#c8c8d0]">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#ececf1]">Privacy Policy</h1>
        <p className="mt-1 font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.12em] text-[#5c5c66]">Last updated {updated}</p>

        <p className="mt-6">
          This page is maintained by the operator of <strong>playquoridor.online</strong> to explain
          what we store, why, and your choices. It is not a legal certification.
        </p>

        <H2>What we collect</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Account:</strong> email (for sign-in), display name, country, and — if you upload one — an avatar image.</li>
          <li><strong>Profile:</strong> optional bio text you write.</li>
          <li><strong>Gameplay:</strong> match results, ratings, moves, wall placements, forfeits, and puzzle attempts.</li>
          <li><strong>Chat & moderation:</strong> chat messages sent in matches and moderation events (severity, category, action taken).</li>
          <li><strong>Technical:</strong> basic session data needed to run the site (auth tokens, request metadata).</li>
        </ul>

        <H2>How we use it</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Run matches, rankings, friends, and puzzles.</li>
          <li>Show your public profile (name, avatar, country, rating, stats) to other players.</li>
          <li>Automatically scan bios, display names, avatars, and chat for unsafe content.</li>
          <li>Enforce our <a className="text-[#f5c542] underline" href="/terms">Terms of Service</a> (warnings, mutes, bans).</li>
        </ul>

        <H2>Who we share it with</H2>
        <p>We don't sell your data. We use a small number of processors to operate the site:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Lovable Cloud</strong> — hosting, database, authentication, storage.</li>
          <li><strong>Lovable AI Gateway</strong> — automated content-moderation classification for text and images.</li>
          <li><strong>Google</strong> — only if you sign in with Google.</li>
        </ul>

        <H2>Retention</H2>
        <p>Account, profile, and gameplay data are kept for as long as your account exists.
          Chat messages and moderation records may be retained for auditing and abuse-prevention purposes.
          You can request deletion by emailing us.</p>

        <H2>Cookies</H2>
        <p>We use only essential cookies / local storage required for sign-in and preferences (theme,
          local player identity). No advertising trackers.</p>

        <H2>Your rights</H2>
        <p>You can access, correct, export, or delete your data by contacting
          <a className="text-[#f5c542] underline" href="mailto:hi@playquoridor.online"> hi@playquoridor.online</a>. If you're in the EU/UK, GDPR/UK-GDPR rights apply.</p>

        <H2>Children</H2>
        <p>The site isn't intended for children under 13 (or the local minimum age). We don't
          knowingly collect data from them.</p>

        <H2>Changes</H2>
        <p>We'll update this page and the "Last updated" date when material things change.</p>

        <H2>Contact</H2>
        <p><a className="text-[#f5c542] underline" href="mailto:hi@playquoridor.online">hi@playquoridor.online</a></p>
      </article>
    </LobbyChrome>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-[17px] font-bold text-[#ececf1]">{children}</h2>;
}