import { useEffect, useMemo, useRef, useState } from "react";
import { ConstellationSigil, type SigilTier } from "@/components/ConstellationSigil";
import { familyOf } from "@/lib/achievement-families";

// Full-screen cinematic reveal for a queue of newly-unlocked badges. Each
// badge sits on screen ~2.6s (enter → hold → exit), then the next one takes
// its place. onDone fires after every badge has played.

export type UnlockItem = {
  slug: string;
  name: string;
  description: string;
  tier: SigilTier;
  sigil_key: string;
};

const TIER_ACCENT: Record<SigilTier, { c1: string; c2: string; glow: string; label: string }> = {
  bronze:   { c1: "#8a5a34", c2: "#d3a06c", glow: "154,102,55",  label: "Bronze" },
  silver:   { c1: "#9aa1ab", c2: "#eef1f4", glow: "186,192,201", label: "Silver" },
  gold:     { c1: "#c9931a", c2: "#ffe08a", glow: "245,197,24",  label: "Gold" },
  platinum: { c1: "#178f7d", c2: "#9ff5e6", glow: "95,217,201",  label: "Platinum" },
  mythic:   { c1: "#e11d48", c2: "#ffc2b8", glow: "244,63,94",   label: "Mythic" },
};

type Phase = "enter" | "hold" | "exit";

export function AchievementUnlockOverlay({ items, onDone }: { items: UnlockItem[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("enter");
  const doneRef = useRef(false);

  useEffect(() => {
    setPhase("enter");
    const t1 = window.setTimeout(() => setPhase("hold"), 60);
    const t2 = window.setTimeout(() => setPhase("exit"), 2000);
    const t3 = window.setTimeout(() => {
      if (idx + 1 >= items.length) {
        if (!doneRef.current) { doneRef.current = true; onDone(); }
      } else {
        setIdx((v) => v + 1);
      }
    }, 2600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); window.clearTimeout(t3); };
  }, [idx, items.length, onDone]);

  const item = items[idx];
  const accent = useMemo(() => (item ? TIER_ACCENT[item.tier] : TIER_ACCENT.bronze), [item]);
  if (!item) return null;

  const fam = familyOf(item.slug);

  const cardCls =
    phase === "enter" ? "opacity-0 translate-y-4 scale-[0.94]" :
    phase === "hold"  ? "opacity-100 translate-y-0 scale-100" :
                        "opacity-0 -translate-y-3 scale-[0.98]";

  return (
    <div className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div
        className={"relative flex w-[min(92vw,380px)] flex-col items-center rounded-3xl border px-8 pb-8 pt-9 text-center transition-all duration-500 ease-out " + cardCls}
        style={{
          background: `radial-gradient(120% 100% at 50% 0%, rgba(${accent.glow},0.20) 0%, rgba(10,10,12,0.96) 55%, rgba(10,10,12,0.98) 100%)`,
          borderColor: `rgba(${accent.glow},0.45)`,
          boxShadow: `0 40px 120px -30px rgba(${accent.glow},0.45), 0 0 0 1px rgba(${accent.glow},0.15) inset`,
        }}
      >
        {/* Aura ring */}
        <div
          className="pointer-events-none absolute -inset-px rounded-3xl opacity-70"
          style={{ boxShadow: `0 0 60px 4px rgba(${accent.glow},0.35) inset` }}
          aria-hidden
        />
        <div className="text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: accent.c2 }}>
          Badge unlocked
        </div>
        <div className="mt-5">
          <ConstellationSigil sigilKey={item.sigil_key} tier={item.tier} size={140} />
        </div>
        {fam && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em]"
            style={{ borderColor: `rgba(${accent.glow},0.45)`, color: accent.c2, background: `rgba(${accent.glow},0.10)` }}>
            <span>Level {fam.level}</span>
            <span className="opacity-60">/ {fam.maxLevel}</span>
          </div>
        )}
        <div className="mt-3 text-[22px] font-bold tracking-[-0.01em] text-white">{item.name}</div>
        <div className="mt-1 font-[IBM_Plex_Mono,monospace] text-[10.5px] uppercase tracking-[0.16em]" style={{ color: accent.c1 }}>
          {accent.label} tier
        </div>
        <div className="mt-3 max-w-[300px] text-[12.5px] leading-[1.55] text-zinc-300">{item.description}</div>
        {items.length > 1 && (
          <div className="mt-6 flex items-center gap-1.5">
            {items.map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all"
                style={{
                  width: i === idx ? 18 : 6,
                  background: i <= idx ? `rgba(${accent.glow},0.85)` : "rgba(255,255,255,0.14)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
