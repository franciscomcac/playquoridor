// Top navigation bar for the lobby/game screens: brand, streak pill,
// account menu, and a settings gear. Extracted from src/routes/game.tsx.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AccountNav } from "@/components/AccountNav";
import { fetchMyWinStreak } from "@/lib/stats";
import type { Identity } from "@/lib/identity";

export function Header({
  ident,
  onOpenSettings,
}: {
  ident: Identity | null;
  onOpenSettings: () => void;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <Link
        to="/"
        className="flex min-w-0 items-center gap-3"
        aria-label="playquoridor.online — home"
      >
        <img
          src="/favicon.svg"
          alt="playquoridor.online logo"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0"
        />
        <span className="truncate text-[15px] font-bold">
          playquoridor<span className="text-[#5c5c66]">.online</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {ident && <StreakBadge playerId={ident.id} />}
        <AccountNav compact />
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[10px] uppercase tracking-widest hover:bg-secondary sm:px-3"
        >
          <span className="hidden sm:inline">Settings</span>
          <span className="sm:hidden" aria-hidden>
            ⚙
          </span>
        </button>
      </div>
    </header>
  );
}

function StreakBadge({ playerId }: { playerId: string }) {
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    void fetchMyWinStreak(playerId).then(setStreak);
  }, [playerId]);
  if (streak === null) return null;
  const hot = streak >= 3;
  return (
    <span
      className={
        "hidden items-center gap-1 rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-widest sm:inline-flex " +
        (hot ? "border-orange-500/50 bg-orange-500/10" : "border-border bg-card")
      }
    >
      <span aria-hidden>{hot ? "🔥" : "✦"}</span>
      <span className="text-muted-foreground">Streak</span>
      <span className={"ml-0.5 font-semibold " + (hot ? "text-orange-300" : "text-primary")}>
        {streak}
      </span>
    </span>
  );
}
