import { useEffect, useMemo, useRef, useState } from "react";
import { tierFromRating } from "@/components/LobbyChrome";

// Tier styling (matches the standalone rank-up design). Keys map to the
// app's 7 tier names, with Grandmaster promoted to the "top10" treatment
// (gold badge + shimmering crown tag).
type TierKey = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master" | "top10";

const TIER_STYLES: Record<
  TierKey,
  { name: string; c1: string; c2: string; glow: string; size: number }
> = {
  bronze: { name: "Bronze", c1: "#8a5a34", c2: "#d3a06c", glow: "154,102,55", size: 126 },
  silver: { name: "Silver", c1: "#9aa1ab", c2: "#eef1f4", glow: "186,192,201", size: 132 },
  gold: { name: "Gold", c1: "#c9931a", c2: "#ffe08a", glow: "245,197,24", size: 138 },
  platinum: { name: "Platinum", c1: "#178f7d", c2: "#9ff5e6", glow: "95,217,201", size: 144 },
  diamond: { name: "Diamond", c1: "#2f6fd6", c2: "#cfe9ff", glow: "125,196,255", size: 150 },
  master: { name: "Master", c1: "#e11d48", c2: "#ffc2b8", glow: "244,63,94", size: 163 },
  top10: { name: "Grandmaster", c1: "#c9931a", c2: "#fff6d6", glow: "245,197,24", size: 172 },
};

const TIER_ORDER: TierKey[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
  "top10",
];

function tierKeyFor(rating: number): TierKey {
  const t = tierFromRating(rating);
  if (t.name === "Grandmaster") return "top10";
  const lower = t.name.toLowerCase();
  return TIER_ORDER.includes(lower as TierKey) ? (lower as TierKey) : "bronze";
}

export function tierIndexFor(rating: number): number {
  return TIER_ORDER.indexOf(tierKeyFor(rating));
}

type Phase = "idle" | "show" | "exit" | "gone";

export function RankUpOverlay({
  oldRating,
  newRating,
  onDone,
}: {
  oldRating: number;
  newRating: number;
  onDone: () => void;
}) {
  const oldKey = tierKeyFor(oldRating);
  const newKey = tierKeyFor(newRating);
  const fromStyle = TIER_STYLES[oldKey];
  const toStyle = TIER_STYLES[newKey];
  const tierUp = oldKey !== newKey;

  const [phase, setPhase] = useState<Phase>("idle");
  const [badgeStage, setBadgeStage] = useState<"old" | "breaking" | "new">("old");
  const [eloNow, setEloNow] = useState<number>(oldRating);

  // Precompute particles for the burst.
  const particles = useMemo(() => {
    const toIdx = TIER_ORDER.indexOf(newKey);
    const pcount = 10 + toIdx * 3;
    const dist = 78 + toIdx * 6;
    return Array.from({ length: pcount }, (_, i) => {
      const ang = (i / pcount) * Math.PI * 2 + Math.random() * 0.4;
      const d = dist + Math.random() * 24;
      const color = Math.random() < 0.5 ? toStyle.c2 : toStyle.c1;
      return { dx: Math.cos(ang) * d, dy: Math.sin(ang) * d, color };
    });
  }, [newKey, toStyle]);

  const startRef = useRef<number>(performance.now());
  const doneRef = useRef(false);
  useEffect(() => {
    startRef.current = performance.now();
    doneRef.current = false;
    setPhase("idle");
    setBadgeStage("old");
    setEloNow(oldRating);

    const tl = {
      showAt: 100,
      breakAt: 750,
      popAt: 750 + (tierUp ? 300 : 0),
      countStart: 750 + (tierUp ? 300 : 0) + 80,
      countDur: 800,
    };
    const holdAt = tl.countStart + tl.countDur + 500;
    const exitAt = holdAt + 1300;
    const goneAt = exitAt + 650;

    let raf = 0;
    const flags = { show: false, brk: false, pop: false, exit: false, gone: false };
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      if (elapsed >= tl.showAt && !flags.show) {
        flags.show = true;
        setPhase("show");
      }
      if (elapsed >= tl.breakAt && !flags.brk) {
        flags.brk = true;
        if (tierUp) setBadgeStage("breaking");
      }
      if (elapsed >= tl.popAt && !flags.pop) {
        flags.pop = true;
        setBadgeStage("new");
      }
      if (elapsed >= tl.countStart) {
        const prog = Math.max(0, Math.min(1, (elapsed - tl.countStart) / tl.countDur));
        const eased = 1 - Math.pow(1 - prog, 3);
        setEloNow(Math.round(oldRating + (newRating - oldRating) * eased));
      }
      if (elapsed >= exitAt && !flags.exit) {
        flags.exit = true;
        setPhase("exit");
      }
      if (elapsed >= goneAt && !flags.gone) {
        flags.gone = true;
        setPhase("gone");
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [oldRating, newRating, tierUp, onDone]);

  const rayEligible = TIER_ORDER.indexOf(newKey) >= 4;
  const showCrown = newKey === "top10" && badgeStage === "new";
  const framePhaseClass =
    phase === "show" ? "ru-show" : phase === "exit" || phase === "gone" ? "ru-exit" : "";

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-hidden"
      style={{
        background: "#0a0a0a",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
        backgroundSize: "42px 42px",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 900px 560px at 50% 46%, rgba(${toStyle.glow},.14), transparent 70%)`,
        }}
      />
      <RankUpStyles />
      <div
        className={"ru-frame relative z-[1] flex flex-col items-center gap-6 " + framePhaseClass}
      >
        <div className="text-[12px] font-bold uppercase tracking-[0.22em] text-zinc-500">
          Rank up
        </div>

        <div className="relative grid h-[220px] w-[220px] place-items-center">
          {rayEligible && badgeStage === "new" && (
            <div
              className="ru-rays absolute inset-[-70px] rounded-full"
              style={{
                background: `conic-gradient(from 0deg,transparent 0deg,rgba(${toStyle.glow},.35) 8deg,transparent 20deg,transparent 40deg,rgba(${toStyle.glow},.35) 48deg,transparent 60deg,transparent 80deg,rgba(${toStyle.glow},.35) 88deg,transparent 100deg,transparent 130deg,rgba(${toStyle.glow},.35) 138deg,transparent 150deg,transparent 190deg,rgba(${toStyle.glow},.35) 198deg,transparent 210deg,transparent 260deg,rgba(${toStyle.glow},.35) 268deg,transparent 280deg,transparent 320deg,rgba(${toStyle.glow},.35) 328deg,transparent 340deg)`,
              }}
            />
          )}
          {showCrown && (
            <div
              className="ru-crown absolute -top-4 left-1/2 z-[4] -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.09em] text-[#1a1200]"
              style={{
                background: "linear-gradient(90deg,#f5c518,#fff6d6,#f5c518)",
                backgroundSize: "220% 100%",
              }}
            >
              Grandmaster · Quoridor Rank
            </div>
          )}

          {/* Old badge */}
          <Badge
            style={fromStyle}
            className={"absolute " + (badgeStage === "old" ? "" : "ru-break")}
          />
          {/* New badge */}
          <Badge
            style={toStyle}
            className={"absolute " + (badgeStage === "new" ? "ru-pop" : "opacity-0 scale-[0.2]")}
          />

          {/* Particles */}
          {particles.map((pt, i) => (
            <span
              key={i}
              className={
                "absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full " +
                (badgeStage === "new" ? "ru-burst" : "opacity-0")
              }
              style={{
                background: pt.color,
                // @ts-expect-error CSS custom props
                "--dx": `${pt.dx}px`,
                "--dy": `${pt.dy}px`,
              }}
            />
          ))}
        </div>

        <div className="text-[26px] font-extrabold transition-colors" style={{ color: toStyle.c2 }}>
          {badgeStage === "new" ? toStyle.name : tierUp ? fromStyle.name : toStyle.name}
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-[38px] font-extrabold tabular-nums text-zinc-100">{eloNow}</div>
          <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500">ELO</div>
        </div>
      </div>
    </div>
  );
}

function Badge({
  style,
  className = "",
}: {
  style: (typeof TIER_STYLES)[TierKey];
  className?: string;
}) {
  return (
    <div
      className={"grid place-items-center rounded-full " + className}
      style={{
        width: style.size,
        height: style.size,
        background: `radial-gradient(circle at 34% 28%, ${style.c2}, ${style.c1} 72%)`,
        boxShadow: `inset 0 0 0 3px rgba(255,255,255,.18), 0 0 44px 6px rgba(${style.glow},.55), 0 18px 36px rgba(0,0,0,.5)`,
      }}
    >
      <div
        className="h-[38%] w-[38%] rotate-45"
        style={{
          background: `linear-gradient(145deg, ${style.c2}, ${style.c1})`,
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.4), 0 2px 6px rgba(0,0,0,.3)",
        }}
      />
    </div>
  );
}

function RankUpStyles() {
  return (
    <style>{`
      .ru-frame { opacity: 0; transform: scale(.94) translateY(6px); transition: opacity .5s ease, transform .5s ease; }
      .ru-frame.ru-show { opacity: 1; transform: scale(1) translateY(0); }
      .ru-frame.ru-exit { opacity: 0; transform: scale(.95) translateY(-10px); }
      .ru-rays { opacity: 1; animation: ru-rayspin 7s linear infinite; }
      @keyframes ru-rayspin { to { transform: rotate(360deg); } }
      .ru-break { animation: ru-breakout .55s ease forwards; }
      @keyframes ru-breakout { 0% { opacity: 1; transform: scale(1) rotate(0); } 100% { opacity: 0; transform: scale(1.35) rotate(20deg); } }
      .ru-pop { animation: ru-popin .6s cubic-bezier(.22,1.6,.32,1) forwards; }
      @keyframes ru-popin { 0% { opacity: 0; transform: scale(.2); } 58% { opacity: 1; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
      .ru-burst { animation: ru-pburst .85s ease-out forwards; }
      @keyframes ru-pburst {
        0% { opacity: 1; transform: translate(-50%,-50%) translate(0,0) scale(1); }
        100% { opacity: 0; transform: translate(-50%,-50%) translate(var(--dx),var(--dy)) scale(.3); }
      }
      .ru-crown { animation: ru-shimmer 2.4s linear infinite; }
      @keyframes ru-shimmer { 0% { background-position: 0% 0; } 100% { background-position: 220% 0; } }
    `}</style>
  );
}
