// Sigil renderer. A tier-tinted disc + aura sets the rarity; a per-key
// colorful emblem in the middle tells you *what* the badge is (crossed
// swords for a duelist, a lightning bolt for a speedrun, a wall of pillars
// for a wall-based badge, etc). Unknown keys fall back to a procedural
// constellation so nothing renders empty.
import { useMemo, type ReactNode } from "react";

export type SigilTier = "bronze" | "silver" | "gold" | "platinum" | "mythic";

type Props = {
  sigilKey: string;
  tier: SigilTier;
  size?: number;
  locked?: boolean;
  className?: string;
};

type Palette = {
  base: string;
  glow: string;
  ring: string;
  disc: string;
  discEdge: string;
  aura?: string;
};

const PALETTES: Record<SigilTier, Palette> = {
  bronze: {
    base: "#e0a874",
    glow: "#f6c896",
    ring: "rgba(224,168,116,0.35)",
    disc: "#1a120c",
    discEdge: "#3a2618",
  },
  silver: {
    base: "#c9d6e8",
    glow: "#eef4ff",
    ring: "rgba(201,214,232,0.35)",
    disc: "#0e131c",
    discEdge: "#2a3446",
  },
  gold: {
    base: "#f4cf5a",
    glow: "#fff2a8",
    ring: "rgba(244,207,90,0.45)",
    disc: "#181207",
    discEdge: "#4a3812",
  },
  platinum: {
    base: "#a8f0ff",
    glow: "#e8fbff",
    ring: "rgba(168,240,255,0.55)",
    disc: "#08161c",
    discEdge: "#1e4a5c",
    aura: "rgba(168,240,255,0.18)",
  },
  mythic: {
    base: "#d59bff",
    glow: "#fbe8ff",
    ring: "rgba(213,155,255,0.6)",
    disc: "#150820",
    discEdge: "#4a1e6c",
    aura: "rgba(213,155,255,0.22)",
  },
};

// Per-key emblem colors — the *intrinsic* color of the badge, independent
// of tier. Tier still controls the disc/rim/aura around the emblem.
type Emblem = { c1: string; c2: string; accent?: string };
const EMBLEMS: Record<string, Emblem> = {
  // fire / heat
  flame: { c1: "#ff4d1a", c2: "#ffd166", accent: "#ffe58a" },
  phoenix: { c1: "#ff2d55", c2: "#ffb347", accent: "#fff2b0" },
  sunrise: { c1: "#ff8a3d", c2: "#ffd97a", accent: "#ffe9a8" },
  bolt: { c1: "#ffd60a", c2: "#fff3a0", accent: "#ffffff" },
  // gold / laurels / crowns
  crown: { c1: "#f4c430", c2: "#fff2a8", accent: "#ffe58a" },
  crown_star: { c1: "#ffd166", c2: "#fff2a8", accent: "#ffffff" },
  laurel: { c1: "#7ecf6a", c2: "#d5f5b8", accent: "#f4c430" },
  wreath: { c1: "#8ee08a", c2: "#f0ffcf", accent: "#f4c430" },
  halo: { c1: "#ffe58a", c2: "#ffffff", accent: "#ffd166" },
  banner: { c1: "#e5484d", c2: "#ffb2b8", accent: "#f4c430" },
  // stone / walls
  pillar: { c1: "#7ec4c9", c2: "#d9f2f4", accent: "#5aa4a9" },
  maze: { c1: "#5ec6a3", c2: "#c2f0dd", accent: "#2e7a63" },
  // steel / blades
  sword: { c1: "#c9d6e8", c2: "#ffffff", accent: "#e5484d" },
  scalpel: { c1: "#e8f0f8", c2: "#ffffff", accent: "#ff6b6b" },
  arrow: { c1: "#ff6b6b", c2: "#ffd6d6", accent: "#c9d6e8" },
  // arcane / mystery
  oracle: { c1: "#c084fc", c2: "#f3e8ff", accent: "#22d3ee" },
  void: { c1: "#a855f7", c2: "#f0abfc", accent: "#0ea5e9" },
  origin: { c1: "#d59bff", c2: "#fbe8ff", accent: "#ffd166" },
  // night / cool
  moon: { c1: "#a8c5ff", c2: "#eaf1ff", accent: "#ffffff" },
  owl: { c1: "#b5a37a", c2: "#f2e7c9", accent: "#ffd166" },
  mirror: { c1: "#a8f0ff", c2: "#ffffff", accent: "#c084fc" },
  clock: { c1: "#7dd3fc", c2: "#e0f2fe", accent: "#f4c430" },
  // documents / arcana
  key: { c1: "#f4c430", c2: "#fff2a8", accent: "#c9d6e8" },
  signature: { c1: "#e0a874", c2: "#ffe4c4", accent: "#4a3812" },
  // social / geometry
  link: { c1: "#e0a874", c2: "#ffd6a5", accent: "#f4c430" },
  pair: { c1: "#22d3ee", c2: "#a5f3fc", accent: "#c084fc" },
  triangle: { c1: "#f472b6", c2: "#fbcfe8", accent: "#22d3ee" },
  quad: { c1: "#4ade80", c2: "#bbf7d0", accent: "#f472b6" },
  disc: { c1: "#38bdf8", c2: "#bae6fd", accent: "#ffffff" },
  // constellations fall through to the procedural stars renderer
  ursa_minor: { c1: "#e8f0f8", c2: "#ffffff", accent: "#7dd3fc" },
};

// Strip trailing tier suffixes like `_2` `_3` to find the base emblem key.
function baseKey(sigilKey: string): string {
  return sigilKey.replace(/_\d+$/, "");
}

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Node = { x: number; y: number; r: number };

function buildConstellation(sigilKey: string): { nodes: Node[]; edges: [number, number][] } {
  const seed = hash(sigilKey);
  const rand = mulberry32(seed);
  const count = 5 + Math.floor(rand() * 5); // 5-9

  // Poisson-ish disc sampling: sample within a smaller inner disc, keep spacing.
  const nodes: Node[] = [];
  const R_MAX = 38;
  const MIN_DIST = 14;
  let attempts = 0;
  while (nodes.length < count && attempts < 300) {
    attempts++;
    const angle = rand() * Math.PI * 2;
    const radius = Math.sqrt(rand()) * R_MAX;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (nodes.every((n) => Math.hypot(n.x - x, n.y - y) >= MIN_DIST)) {
      nodes.push({ x, y, r: 1.6 + rand() * 1.8 });
    }
  }

  // Minimum-spanning-tree edges for a clean constellation look.
  const edges: [number, number][] = [];
  if (nodes.length > 1) {
    const inTree = new Set<number>([0]);
    while (inTree.size < nodes.length) {
      let best: { a: number; b: number; d: number } | null = null;
      for (const a of inTree) {
        for (let b = 0; b < nodes.length; b++) {
          if (inTree.has(b)) continue;
          const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      if (!best) break;
      edges.push([best.a, best.b]);
      inTree.add(best.b);
    }
    // Add one or two extra chords for visual variety.
    const extras = 1 + Math.floor(rand() * 2);
    for (let e = 0; e < extras && nodes.length > 3; e++) {
      const a = Math.floor(rand() * nodes.length);
      let b = Math.floor(rand() * nodes.length);
      if (b === a) b = (b + 1) % nodes.length;
      if (!edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) {
        edges.push([a, b]);
      }
    }
  }

  return { nodes, edges };
}

// ================= Emblem shapes =================
// All shapes drawn inside a ~-30..30 box, centered. Kept intentionally
// chunky and iconic so they read at 40px badge sizes on the profile grid.
function renderEmblem(
  key: string,
  c1: string,
  c2: string,
  accent: string,
  gradId: string,
): ReactNode {
  const g = `url(#${gradId})`;
  switch (key) {
    case "flame":
      return (
        <path
          d="M0,-26 C10,-14 18,-6 18,6 C18,18 9,26 0,26 C-9,26 -18,18 -18,6 C-18,-2 -12,-6 -8,-10 C-6,-4 -2,-4 -2,-10 C-2,-18 -4,-22 0,-26 Z"
          fill={g}
          stroke={accent}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      );
    case "phoenix":
      return (
        <g fill={g} stroke={accent} strokeWidth="1" strokeLinejoin="round">
          <path d="M0,-24 C8,-14 18,-10 26,-4 C14,-4 8,-2 4,4 L0,20 L-4,4 C-8,-2 -14,-4 -26,-4 C-18,-10 -8,-14 0,-24 Z" />
          <circle cx="0" cy="-6" r="3" fill={accent} stroke="none" />
        </g>
      );
    case "sunrise":
      return (
        <g stroke={accent} strokeWidth="1.2" strokeLinecap="round">
          <path d="M-26,10 L26,10" />
          <circle cx="0" cy="10" r="14" fill={g} />
          {Array.from({ length: 7 }).map((_, i) => {
            const a = (Math.PI * (i + 0.5)) / 7 + Math.PI;
            const x1 = Math.cos(a) * 18,
              y1 = 10 + Math.sin(a) * 18;
            const x2 = Math.cos(a) * 26,
              y2 = 10 + Math.sin(a) * 26;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
      );
    case "bolt":
      return (
        <path
          d="M4,-26 L-14,4 L-2,4 L-6,26 L14,-6 L2,-6 L6,-26 Z"
          fill={g}
          stroke={accent}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      );
    case "crown":
      return (
        <g fill={g} stroke={accent} strokeWidth="1" strokeLinejoin="round">
          <path d="M-24,10 L-20,-14 L-8,0 L0,-18 L8,0 L20,-14 L24,10 Z" />
          <rect x="-24" y="10" width="48" height="6" rx="1" />
          <circle cx="-20" cy="-14" r="2.5" fill={accent} stroke="none" />
          <circle cx="0" cy="-18" r="3" fill={accent} stroke="none" />
          <circle cx="20" cy="-14" r="2.5" fill={accent} stroke="none" />
        </g>
      );
    case "crown_star":
      return (
        <g stroke={accent} strokeWidth="1" strokeLinejoin="round">
          <path d="M-22,12 L-18,-10 L-6,2 L0,-14 L6,2 L18,-10 L22,12 Z" fill={g} />
          <rect x="-22" y="12" width="44" height="5" rx="1" fill={g} />
          <path
            d="M0,-26 L2.4,-20 L8.4,-20 L3.6,-16.4 L5.6,-10.4 L0,-14 L-5.6,-10.4 L-3.6,-16.4 L-8.4,-20 L-2.4,-20 Z"
            fill={accent}
            stroke="none"
          />
        </g>
      );
    case "laurel":
    case "wreath": {
      const leaf = (side: 1 | -1) => (
        <g>
          {[-18, -10, -2, 6, 14].map((y, i) => (
            <ellipse
              key={i}
              cx={side * (18 - Math.abs(y) * 0.15)}
              cy={y}
              rx="5"
              ry="2.4"
              fill={g}
              stroke={accent}
              strokeWidth="0.6"
              transform={`rotate(${side * (35 - i * 8)} ${side * 18} ${y})`}
            />
          ))}
        </g>
      );
      return (
        <g>
          {leaf(-1)}
          {leaf(1)}
          {key === "wreath" && <circle cx="0" cy="18" r="3" fill={accent} />}
          {key === "laurel" && (
            <path
              d="M-4,-2 L0,4 L4,-2 M0,4 L0,10"
              stroke={accent}
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
            />
          )}
        </g>
      );
    }
    case "halo":
      return (
        <g>
          <ellipse cx="0" cy="-4" rx="22" ry="6" fill="none" stroke={g} strokeWidth="4" />
          <ellipse cx="0" cy="-4" rx="22" ry="6" fill="none" stroke={accent} strokeWidth="1" />
          <path
            d="M-14,8 Q0,22 14,8"
            stroke={c2}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      );
    case "banner":
      return (
        <g>
          <line
            x1="-16"
            y1="-26"
            x2="-16"
            y2="26"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M-16,-22 L20,-18 L14,-8 L20,2 L-16,-2 Z"
            fill={g}
            stroke={accent}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="-16" cy="-26" r="2.5" fill={accent} />
        </g>
      );
    case "pillar":
      return (
        <g fill={g} stroke={accent} strokeWidth="1" strokeLinejoin="round">
          {[-16, 0, 16].map((x, i) => (
            <g key={i}>
              <rect x={x - 5} y="-16" width="10" height="28" rx="1" />
              <rect x={x - 7} y="-20" width="14" height="4" rx="1" />
              <rect x={x - 7} y="12" width="14" height="4" rx="1" />
            </g>
          ))}
        </g>
      );
    case "maze":
      return (
        <g fill="none" stroke={g} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
          <rect x="-20" y="-20" width="40" height="40" rx="2" />
          <path d="M-14,-20 L-14,10 L6,10 L6,-6 L-6,-6 L-6,2 L0,2" stroke={accent} />
          <path d="M14,-20 L14,14 M20,-6 L10,-6" />
        </g>
      );
    case "sword": {
      const blade = (rot: number) => (
        <g transform={`rotate(${rot})`}>
          <path
            d="M0,-22 L3,-16 L3,10 L-3,10 L-3,-16 Z"
            fill={g}
            stroke={accent}
            strokeWidth="0.8"
          />
          <rect x="-8" y="10" width="16" height="3" fill={accent} />
          <rect x="-2" y="13" width="4" height="8" fill={c2} stroke={accent} strokeWidth="0.6" />
          <circle cx="0" cy="22" r="2.4" fill={accent} />
        </g>
      );
      return (
        <g>
          {blade(35)}
          {blade(-35)}
        </g>
      );
    }
    case "scalpel":
      return (
        <g transform="rotate(35)">
          <path d="M-2,-24 L4,-24 L4,4 L-2,10 Z" fill={g} stroke={accent} strokeWidth="0.8" />
          <rect x="-3" y="4" width="6" height="18" rx="1" fill={accent} />
          <rect x="-3" y="10" width="6" height="2" fill={c2} />
        </g>
      );
    case "arrow":
      return (
        <g transform="rotate(-40)">
          <line x1="-22" y1="0" x2="18" y2="0" stroke={g} strokeWidth="3" strokeLinecap="round" />
          <path d="M22,0 L10,-8 L14,0 L10,8 Z" fill={accent} stroke={accent} strokeWidth="0.6" />
          <path
            d="M-22,0 L-16,-4 M-22,0 L-16,4"
            stroke={accent}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </g>
      );
    case "oracle":
      return (
        <g>
          <path d="M-24,0 Q0,-18 24,0 Q0,18 -24,0 Z" fill={g} stroke={accent} strokeWidth="1" />
          <circle cx="0" cy="0" r="8" fill={accent} />
          <circle cx="0" cy="0" r="4" fill={c2} />
          <circle cx="2" cy="-2" r="1.4" fill="#fff" />
        </g>
      );
    case "void":
      return (
        <g>
          <circle cx="0" cy="0" r="20" fill="#04040a" stroke={g} strokeWidth="3" />
          <circle cx="0" cy="0" r="20" fill="none" stroke={accent} strokeWidth="0.6" />
          <circle cx="-6" cy="-6" r="3" fill={c2} opacity="0.7" />
        </g>
      );
    case "origin":
      return (
        <g>
          <circle cx="0" cy="0" r="18" fill="none" stroke={g} strokeWidth="1.4" />
          <path d="M0,-22 L4,0 L0,22 L-4,0 Z" fill={g} stroke={accent} strokeWidth="0.8" />
          <path d="M-22,0 L0,-4 L22,0 L0,4 Z" fill={c2} stroke={accent} strokeWidth="0.8" />
          <circle cx="0" cy="0" r="2.4" fill={accent} />
        </g>
      );
    case "moon":
      return (
        <g>
          <circle cx="0" cy="0" r="20" fill={g} />
          <circle cx="7" cy="-3" r="18" fill="#04040a" />
          <circle cx="-10" cy="-10" r="1.6" fill={accent} />
          <circle cx="-6" cy="6" r="1" fill={accent} />
        </g>
      );
    case "owl":
      return (
        <g fill={g} stroke={accent} strokeWidth="0.8">
          <ellipse cx="0" cy="4" rx="18" ry="20" />
          <path d="M-16,-14 L-10,-4 L-4,-12 Z" />
          <path d="M16,-14 L10,-4 L4,-12 Z" />
          <circle cx="-7" cy="-2" r="6" fill={c2} />
          <circle cx="7" cy="-2" r="6" fill={c2} />
          <circle cx="-7" cy="-2" r="2.4" fill="#04040a" />
          <circle cx="7" cy="-2" r="2.4" fill="#04040a" />
          <path d="M-2,4 L0,8 L2,4 Z" fill={accent} />
        </g>
      );
    case "mirror":
      return (
        <g>
          <ellipse cx="0" cy="-2" rx="14" ry="18" fill={g} stroke={accent} strokeWidth="1" />
          <path
            d="M-4,-16 Q-10,-10 -10,-2"
            stroke="#fff"
            strokeWidth="1.4"
            fill="none"
            opacity="0.7"
          />
          <rect x="-3" y="16" width="6" height="8" fill={accent} />
          <rect x="-8" y="22" width="16" height="3" fill={accent} />
        </g>
      );
    case "clock":
      return (
        <g>
          <circle cx="0" cy="0" r="20" fill={g} stroke={accent} strokeWidth="1.4" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={Math.cos(a) * 17}
                y1={Math.sin(a) * 17}
                x2={Math.cos(a) * 20}
                y2={Math.sin(a) * 20}
                stroke={accent}
                strokeWidth="1"
              />
            );
          })}
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="-12"
            stroke={accent}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <line
            x1="0"
            y1="0"
            x2="10"
            y2="4"
            stroke={accent}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="0" cy="0" r="2" fill={accent} />
        </g>
      );
    case "key":
      return (
        <g transform="rotate(-30)">
          <circle cx="-12" cy="0" r="9" fill="none" stroke={g} strokeWidth="4" />
          <circle cx="-12" cy="0" r="9" fill="none" stroke={accent} strokeWidth="1" />
          <rect x="-3" y="-2" width="24" height="4" fill={g} stroke={accent} strokeWidth="0.6" />
          <rect x="14" y="2" width="4" height="6" fill={accent} />
          <rect x="8" y="2" width="4" height="4" fill={accent} />
        </g>
      );
    case "signature":
      return (
        <g fill="none" stroke={g} strokeWidth="2.4" strokeLinecap="round">
          <path d="M-22,8 C-14,-8 -6,-8 -2,4 C2,16 8,-8 14,-8 C18,-8 20,-4 22,4" />
          <path d="M-18,14 L18,14" stroke={accent} strokeWidth="1.2" />
        </g>
      );
    case "link":
      return (
        <g fill="none" strokeWidth="4" strokeLinecap="round">
          <ellipse cx="-8" cy="0" rx="10" ry="7" stroke={g} transform="rotate(-30 -8 0)" />
          <ellipse cx="8" cy="0" rx="10" ry="7" stroke={accent} transform="rotate(-30 8 0)" />
        </g>
      );
    case "pair":
      return (
        <g fill={g} stroke={accent} strokeWidth="1">
          <circle cx="-8" cy="0" r="12" />
          <circle cx="8" cy="0" r="12" fill={c2} />
        </g>
      );
    case "triangle":
      return (
        <g fill={g} stroke={accent} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M0,-22 L20,14 L-20,14 Z" />
          <path d="M0,-10 L10,10 L-10,10 Z" fill={accent} />
        </g>
      );
    case "quad":
      return (
        <g stroke={accent} strokeWidth="1">
          <rect x="-18" y="-18" width="16" height="16" rx="2" fill={g} />
          <rect x="2" y="-18" width="16" height="16" rx="2" fill={c2} />
          <rect x="-18" y="2" width="16" height="16" rx="2" fill={c2} />
          <rect x="2" y="2" width="16" height="16" rx="2" fill={g} />
        </g>
      );
    case "disc":
      return (
        <g>
          <circle cx="0" cy="0" r="20" fill={g} stroke={accent} strokeWidth="1.4" />
          <circle cx="0" cy="0" r="12" fill="none" stroke={accent} strokeWidth="0.8" />
          <circle cx="0" cy="0" r="4" fill={accent} />
        </g>
      );
    default:
      return null;
  }
}

export function ConstellationSigil({
  sigilKey,
  tier,
  size = 96,
  locked = false,
  className,
}: Props) {
  const { nodes, edges } = useMemo(() => buildConstellation(sigilKey), [sigilKey]);
  const p = PALETTES[tier];
  const uid = useMemo(() => `sigil-${hash(sigilKey).toString(36)}-${tier}`, [sigilKey, tier]);
  const glowId = `${uid}-glow`;
  const discId = `${uid}-disc`;
  const ringId = `${uid}-ring`;

  const stroke = locked ? "#3a3a44" : p.base;
  const dot = locked ? "#555560" : p.base;
  const dotGlow = locked ? "#555560" : p.glow;
  const discFill = locked ? "#0d0d12" : p.disc;
  const discEdge = locked ? "#2a2a34" : p.discEdge;

  const bk = baseKey(sigilKey);
  const emblem = EMBLEMS[bk];
  const useEmblem = !!emblem && !locked;
  const emblemGradId = `${uid}-emblem`;

  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={locked ? "Locked badge" : "Achievement sigil"}
    >
      <defs>
        <radialGradient id={discId} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={discFill} />
          <stop offset="100%" stopColor="#04040a" />
        </radialGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={dotGlow} stopOpacity={locked ? 0 : 0.9} />
          <stop offset="100%" stopColor={dotGlow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.base} stopOpacity={locked ? 0.15 : 0.9} />
          <stop offset="100%" stopColor={p.glow} stopOpacity={locked ? 0.05 : 0.4} />
        </linearGradient>
        {useEmblem && (
          <linearGradient id={emblemGradId} x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0%" stopColor={emblem!.c2} />
            <stop offset="100%" stopColor={emblem!.c1} />
          </linearGradient>
        )}
      </defs>

      {/* Aura for prestigious tiers */}
      {!locked && p.aura && <circle cx="0" cy="0" r="47" fill={p.aura} opacity="0.6" />}

      {/* Disc */}
      <circle cx="0" cy="0" r="46" fill={`url(#${discId})`} stroke={discEdge} strokeWidth="1" />
      {/* Inner rim */}
      <circle
        cx="0"
        cy="0"
        r="43"
        fill="none"
        stroke={`url(#${ringId})`}
        strokeWidth="0.6"
        opacity="0.6"
      />

      {/* Scattered background stars */}
      {!locked &&
        Array.from({ length: useEmblem ? 8 : 14 }).map((_, i) => {
          const a = (i / 14) * Math.PI * 2 + hash(sigilKey + i) * 0.0001;
          const rd = 20 + ((hash(sigilKey + "bg" + i) % 100) / 100) * 20;
          const x = Math.cos(a) * rd;
          const y = Math.sin(a) * rd;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={0.35}
              fill={p.glow}
              opacity={useEmblem ? 0.22 : 0.35}
            />
          );
        })}

      {/* Emblem OR procedural constellation fallback */}
      {useEmblem ? (
        <g>
          {/* soft colored glow behind emblem */}
          <circle cx="0" cy="0" r="26" fill={emblem!.c1} opacity="0.14" />
          {renderEmblem(bk, emblem!.c1, emblem!.c2, emblem!.accent ?? p.base, emblemGradId)}
        </g>
      ) : (
        <>
          {edges.map(([a, b], i) => (
            <line
              key={i}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke={stroke}
              strokeWidth="0.6"
              strokeLinecap="round"
              opacity={locked ? 0.35 : 0.75}
            />
          ))}
          {nodes.map((n, i) => (
            <g key={i}>
              {!locked && <circle cx={n.x} cy={n.y} r={n.r * 3.5} fill={`url(#${glowId})`} />}
              <circle cx={n.x} cy={n.y} r={n.r} fill={dot} />
              {!locked && <circle cx={n.x} cy={n.y} r={n.r * 0.45} fill={p.glow} />}
            </g>
          ))}
        </>
      )}

      {/* Lock indicator */}
      {locked && (
        <g opacity="0.55">
          <rect
            x="-6"
            y="-2"
            width="12"
            height="10"
            rx="1.5"
            fill="#1a1a22"
            stroke="#555560"
            strokeWidth="0.6"
          />
          <path
            d="M-3.5,-2 v-3 a3.5,3.5 0 0 1 7,0 v3"
            fill="none"
            stroke="#555560"
            strokeWidth="0.9"
          />
        </g>
      )}
    </svg>
  );
}
