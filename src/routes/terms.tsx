import { createFileRoute } from "@tanstack/react-router";
import { LobbyChrome } from "@/components/LobbyChrome";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · playquoridor.online" },
      { name: "description", content: "The rules for using playquoridor.online — accounts, conduct, moderation, and liability." },
      { property: "og:title", content: "Terms of Service · playquoridor.online" },
      { property: "og:description", content: "The rules for using playquoridor.online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const updated = "July 8, 2026";
  return (
    <LobbyChrome>
      <article className="mx-auto max-w-[780px] px-8 pb-16 pt-9 text-[14.5px] leading-[1.7] text-[#c8c8d0]">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#ececf1]">Terms of Service</h1>
        <p className="mt-1 font-[IBM_Plex_Mono,monospace] text-[11px] uppercase tracking-[0.12em] text-[#5c5c66]">Last updated {updated}</p>

        <p className="mt-6">
          Welcome to <strong>playquoridor.online</strong> ("the site", "we", "us"). By creating an account
          or playing on the site you agree to these Terms. If you disagree, don't use the site.
        </p>

        <H2>1. Eligibility</H2>
        <p>You must be at least 13 years old (or the minimum age in your country) to use the site.
          If you're under 18 you confirm a parent or guardian is aware you play here.</p>

        <H2>2. Your account</H2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Pick a display name that isn't offensive, misleading, or impersonating.</li>
          <li>You're responsible for activity on your account. Don't share credentials.</li>
          <li>You may change your display name once every 30 days.</li>
        </ul>

        <H2>3. Fair play & conduct</H2>
        <p>Don't do any of the following:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cheat, script, bot, or exploit bugs to affect ranked outcomes.</li>
          <li>Harass, threaten, or use slurs against other players.</li>
          <li>Post sexual content, hate symbols, or violent imagery in your bio, avatar, or chat.</li>
          <li>Rage-quit ranked games to dodge losses; forfeits count.</li>
        </ul>

        <H2>4. Automated moderation</H2>
        <p>Chat messages, bios, display names, and avatar images are automatically scanned for unsafe
          content. Violations may trigger warnings, match mutes, or temporary/permanent chat bans.
          Unsafe avatars are rejected on upload without a penalty. We may remove content or accounts
          that break these Terms.</p>

        <H2>5. User content</H2>
        <p>You keep ownership of what you post (display name, bio, avatar). You grant us a
          non-exclusive, worldwide license to store and display it as needed to run the site.</p>

        <H2>6. Availability</H2>
        <p>The site is provided "as is". We may change, pause, or discontinue features at any time
          and don't guarantee uninterrupted service.</p>

        <H2>7. Liability</H2>
        <p>To the maximum extent permitted by law, we're not liable for indirect or consequential
          damages arising from your use of the site.</p>

        <H2>8. Termination</H2>
        <p>We may suspend or terminate accounts that violate these Terms. You can delete your
          account at any time by contacting <a className="text-[#f5c542] underline" href="mailto:hi@playquoridor.online">hi@playquoridor.online</a>.</p>

        <H2>9. Changes</H2>
        <p>We may update these Terms. Material changes will be posted here with a new "Last updated"
          date. Continued use after changes means you accept them.</p>

        <H2>10. Contact</H2>
        <p>Questions? <a className="text-[#f5c542] underline" href="mailto:hi@playquoridor.online">hi@playquoridor.online</a></p>
      </article>
    </LobbyChrome>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-[17px] font-bold text-[#ececf1]">{children}</h2>;
}