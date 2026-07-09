// In-game player banner shown above (opponent) and below (you) the board.
// Contents: avatar disc with seat number, name, country flag + ELO, up to 3
// showcased badge sigils, and the wall counter. Data comes from
// `fetchBannerDataMany(playerIds)` — see game.tsx for the wiring.

import { useEffect, useMemo, useState } from "react";
import { ConstellationSigil, type SigilTier } from "@/components/ConstellationSigil";
import { COUNTRIES } from "@/lib/countries";
import type { BannerData } from "@/lib/stats";
import { fetchAchievementMeta } from "@/lib/stats";

type Props = {
  slot: number;                 // 0..3 (drives seat number + color)
  color: string;                // PLAYER_COLORS[slot]
  name: string;
  isYou: boolean;
  isTurn: boolean;
  wallsLeft: number;
  totalWalls?: number;          // default 10
  banner: BannerData | null;    // async-loaded; null until it arrives
  align?: "top" | "bottom";     // affects avatar position on very narrow widths
};

const COUNTRY_MAP: Map<string, { flag: string; name: string }> = (() => {
  const m = new Map<string, { flag: string; name: string }>();
  for (const c of COUNTRIES) m.set(c.iso.toUpperCase(), { flag: c.flag, name: c.name });
  return m;
})();

export function PlayerBanner({ slot, color, name, isYou, isTurn, wallsLeft, totalWalls = 10, banner, align = "bottom" }: Props) {
  const country = banner?.country ? COUNTRY_MAP.get(banner.country.toUpperCase()) : null;
  const rating = banner?.rating ?? null;
  const showcased = banner?.showcased ?? [];

  // Fetch metadata for the showcased slugs so we can render the correct sigils.
  const [sigilMeta, setSigilMeta] = useState<Map<string, { sigil_key: string; tier: string }>>(new Map());
  useEffect(() => {
    if (showcased.length === 0) { setSigilMeta(new Map()); return; }
    let cancel = false;
    void fetchAchievementMeta(showcased).then((m) => {
      if (!cancel) setSigilMeta(new Map(Array.from(m.entries()).map(([k, v]) => [k, { sigil_key: v.sigil_key, tier: v.tier }])));
    });
    return () => { cancel = true; };
  }, [showcased.join(",")]);

  const shown = Math.min(wallsLeft, totalWalls);

  const avatarInitial = useMemo(() => {
    const s = (name ?? "").trim();
    return s ? s[0]!.toUpperCase() : "?";
  }, [name]);

  const alignedTop = align === "top";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3"
      style={{
        borderColor: isTurn ? color : "color-mix(in oklab, var(--border) 70%, transparent)",
        background: isTurn
          ? `color-mix(in oklab, ${color} 10%, var(--card))`
          : "color-mix(in oklab, var(--card) 94%, black 6%)",
        boxShadow: isTurn ? `0 0 0 1px ${color}, 0 4px 22px -8px ${color}` : "0 2px 10px rgba(0,0,0,0.25)",
        transition: "background .25s ease, border-color .25s ease, box-shadow .25s ease",
      }}
    >
      {/* Avatar */}
      <div
        className="grid h-11 w-11 flex-none place-items-center rounded-full text-sm font-extrabold sm:h-12 sm:w-12 sm:text-base"
        style={{
          background: banner?.avatarUrl
            ? `url(${banner.avatarUrl}) center/cover`
            : `radial-gradient(circle at 32% 28%, color-mix(in oklab, ${banner?.avatarColor ?? color} 55%, white 55%), ${banner?.avatarColor ?? color} 55%, color-mix(in oklab, ${banner?.avatarColor ?? color} 60%, black 40%) 100%)`,
          border: `2.5px solid ${color}`,
          color: "oklch(0.15 0.02 55)",
        }}
      >
        {!banner?.avatarUrl && avatarInitial}
      </div>

      {/* Name / country / ELO / showcased */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold" style={{ background: color, color: "oklch(0.15 0.02 55)" }}>
            {slot + 1}
          </span>
          <span className="truncate text-[14px] font-extrabold text-foreground sm:text-[15px]">
            {name}{isYou && <span className="ml-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">you</span>}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {country && (
            <span title={country.name} className="inline-flex items-center gap-1 rounded-full border border-white/5 bg-white/5 px-1.5 py-0.5 font-semibold uppercase tracking-[0.14em]">
              <span aria-hidden className="text-[13px] leading-none">{country.flag}</span>
              <span>{banner?.country?.toUpperCase()}</span>
            </span>
          )}
          {rating != null && (
            <span className="rounded-full border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono tabular-nums text-foreground/80">
              {rating}
            </span>
          )}
          {showcased.length > 0 && (
            <span className="ml-0.5 flex items-center gap-1">
              {showcased.map((slug) => {
                const meta = sigilMeta.get(slug);
                if (!meta) return <span key={slug} className="h-5 w-5 rounded-full border border-dashed border-white/10" />;
                return (
                  <ConstellationSigil
                    key={slug}
                    sigilKey={meta.sigil_key}
                    tier={meta.tier as SigilTier}
                    size={22}
                  />
                );
              })}
            </span>
          )}
        </div>
      </div>

      {/* Wall counter */}
      <div className="flex flex-none items-center gap-1.5">
        <div className="flex items-center gap-[3px]">
          {Array.from({ length: totalWalls }).map((_, i) => (
            <span
              key={i}
              className="block h-3.5 w-1.5 rounded-sm sm:h-4"
              style={{ background: i < shown ? color : "var(--border)", opacity: i < shown ? 1 : 0.5 }}
            />
          ))}
        </div>
        <span className="ml-1 hidden font-mono text-[11px] font-bold tabular-nums sm:inline" style={{ color }}>
          {wallsLeft}
        </span>
      </div>
      {alignedTop /* no-op, reserved for future asymmetric layout */ && null}
    </div>
  );
}