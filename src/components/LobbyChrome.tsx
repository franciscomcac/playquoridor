import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AccountNav } from "@/components/AccountNav";

const FONT_LINKS = (
  <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
  </>
);

export function LobbyChrome({ children, online }: { children: React.ReactNode; online?: number }) {
  const [driftOnline, setDriftOnline] = useState<number>(online ?? 179);
  useEffect(() => {
    if (online != null) return;
    const t = setInterval(
      () => setDriftOnline((v) => Math.max(120, v + Math.round((Math.random() - 0.48) * 5))),
      3500,
    );
    return () => clearInterval(t);
  }, [online]);
  const shownOnline = online ?? driftOnline;

  return (
    <main className="min-h-screen bg-[#09090b] font-[Space_Grotesk,ui-sans-serif,system-ui] text-[#ececf1] antialiased">
      {FONT_LINKS}
      <header className="h-[68px] border-b border-[#1a1a1f]">
        <div className="mx-auto grid h-full max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img
              src="/favicon.svg"
              alt="playquoridor.online logo"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
            />
            <span className="truncate text-[14px] font-bold sm:text-[15px]">
              playquoridor<span className="text-[#5c5c66]">.online</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#232329] bg-[#0e0e11] px-3 py-1.5 sm:flex">
              <span className="h-[7px] w-[7px] rounded-full bg-[#2fd575] shadow-[0_0_8px_#2fd575]" />
              <span className="font-[IBM_Plex_Mono,monospace] text-[12px] text-[#a7a7b2]">
                {shownOnline} online
              </span>
            </div>
            <AccountNav />
          </div>
        </div>
      </header>
      {children}
      <footer className="mt-6 border-t border-[#1a1a1f] pb-8 pt-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 sm:px-8">
          <span className="text-[12px] text-[#5c5c66]">
            © {new Date().getFullYear()} playquoridor.online
          </span>
          <nav className="-mx-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] sm:gap-x-5">
            <Link to="/about" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              About
            </Link>
            <Link to="/blog" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              Blog
            </Link>
            <Link to="/forum" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              Forum
            </Link>
            <Link to="/stats" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              Leaderboard
            </Link>
            <Link to="/puzzle" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              Puzzles
            </Link>
            <a
              href="mailto:hi@playquoridor.online"
              className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]"
            >
              Contact
            </a>
            <Link to="/terms" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              Terms
            </Link>
            <Link to="/privacy" className="px-2 py-2 text-[#5c5c66] hover:text-[#a7a7b2]">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

/* ---------- shared tier helpers ---------- */

export const AVATAR_SWATCHES = ["#f5a524", "#2fd575", "#6aa5ff", "#ff6b4a", "#c48bff"] as const;

export function initials(name: string): string {
  return (name || "??").slice(0, 2).toUpperCase();
}

export type Tier = {
  name: "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Master" | "Grandmaster";
  color: string;
  min: number;
  nextMin: number | null;
  nextName: string | null;
};

const TIER_BANDS: Array<{ name: Tier["name"]; min: number; color: string }> = [
  { name: "Bronze", min: 0, color: "#cd7f32" },
  { name: "Silver", min: 1200, color: "#c8cdd7" },
  { name: "Gold", min: 1350, color: "#f5a524" },
  { name: "Platinum", min: 1550, color: "#7ee0d2" },
  { name: "Diamond", min: 1600, color: "#6aa5ff" },
  { name: "Master", min: 1750, color: "#c48bff" },
  { name: "Grandmaster", min: 1800, color: "#f5c542" },
];

export function tierFromRating(rating: number): Tier {
  let cur = TIER_BANDS[0]!;
  for (const b of TIER_BANDS) if (rating >= b.min) cur = b;
  const idx = TIER_BANDS.indexOf(cur);
  const nxt = TIER_BANDS[idx + 1] ?? null;
  return {
    name: cur.name,
    color: cur.color,
    min: cur.min,
    nextMin: nxt?.min ?? null,
    nextName: nxt?.name ?? null,
  };
}

/* ---------- placement (unranked) helpers ---------- */
// New players are unranked until they finish this many ranked 1v1 games.
// During placement, the server applies a larger K-factor so the rating
// moves toward their true skill quickly.
export const PLACEMENT_GAMES = 5;
export const UNRANKED_COLOR = "#83838e";

export function isPlacement(rankedMatches?: number | null): boolean {
  return (rankedMatches ?? 0) < PLACEMENT_GAMES;
}

export function placementRemaining(rankedMatches?: number | null): number {
  return Math.max(0, PLACEMENT_GAMES - (rankedMatches ?? 0));
}

export function avatarColorFor(name: string, override?: string | null): string {
  if (override) return override;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_SWATCHES[Math.abs(h) % AVATAR_SWATCHES.length]!;
}

export function Avatar({
  name,
  color,
  size = 34,
  imageUrl,
}: {
  name: string;
  color?: string | null;
  size?: number;
  imageUrl?: string | null;
}) {
  const bg = avatarColorFor(name, color);
  const fs = Math.max(10, Math.round(size * 0.34));
  if (imageUrl) {
    return (
      <span
        className="grid flex-none place-items-center overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: size >= 60 ? 22 : 999,
          background: "#0d0d10",
        }}
      >
        <img
          src={imageUrl}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-bold text-[#0b0b0d]"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: fs,
        borderRadius: size >= 60 ? 22 : 999,
      }}
    >
      {initials(name)}
    </span>
  );
}
