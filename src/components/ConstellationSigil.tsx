// Procedural constellation sigil renderer. Each achievement's `sigil_key` is
// hashed to a deterministic star pattern (5-9 nodes) connected by fine lines.
// Tier tints the palette and adds an aura ring for platinum / mythic.
//
// The point: 60+ unique badges without hand-drawing 60 SVGs, but each one is
// consistent across every render (same key = same constellation) and reads as
// intentional artwork rather than a generic icon.
import { useMemo } from "react";

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

export function ConstellationSigil({ sigilKey, tier, size = 96, locked = false, className }: Props) {
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
      </defs>

      {/* Aura for prestigious tiers */}
      {!locked && p.aura && (
        <circle cx="0" cy="0" r="47" fill={p.aura} opacity="0.6" />
      )}

      {/* Disc */}
      <circle cx="0" cy="0" r="46" fill={`url(#${discId})`} stroke={discEdge} strokeWidth="1" />
      {/* Inner rim */}
      <circle cx="0" cy="0" r="43" fill="none" stroke={`url(#${ringId})`} strokeWidth="0.6" opacity="0.6" />

      {/* Scattered background stars */}
      {!locked && Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2 + hash(sigilKey + i) * 0.0001;
        const rd = 20 + ((hash(sigilKey + "bg" + i) % 100) / 100) * 20;
        const x = Math.cos(a) * rd;
        const y = Math.sin(a) * rd;
        return <circle key={i} cx={x} cy={y} r={0.35} fill={p.glow} opacity={0.35} />;
      })}

      {/* Constellation edges */}
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x} y1={nodes[a].y}
          x2={nodes[b].x} y2={nodes[b].y}
          stroke={stroke}
          strokeWidth="0.6"
          strokeLinecap="round"
          opacity={locked ? 0.35 : 0.75}
        />
      ))}

      {/* Star nodes with glow */}
      {nodes.map((n, i) => (
        <g key={i}>
          {!locked && <circle cx={n.x} cy={n.y} r={n.r * 3.5} fill={`url(#${glowId})`} />}
          <circle cx={n.x} cy={n.y} r={n.r} fill={dot} />
          {!locked && <circle cx={n.x} cy={n.y} r={n.r * 0.45} fill={p.glow} />}
        </g>
      ))}

      {/* Lock indicator */}
      {locked && (
        <g opacity="0.55">
          <rect x="-6" y="-2" width="12" height="10" rx="1.5" fill="#1a1a22" stroke="#555560" strokeWidth="0.6" />
          <path d="M-3.5,-2 v-3 a3.5,3.5 0 0 1 7,0 v3" fill="none" stroke="#555560" strokeWidth="0.9" />
        </g>
      )}
    </svg>
  );
}