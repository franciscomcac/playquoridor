export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO
  readMinutes: number;
  tags: string[];
  // Article body — array of block objects rendered by the post page.
  body: BlogBlock[];
}

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string };

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-play-quoridor",
    title: "How to Play Quoridor: Complete Beginner's Guide (2026)",
    description:
      "Learn Quoridor in 5 minutes — full rules, setup, wall placement, movement, and jumping over pawns, with clear examples for 2 and 4 player games.",
    date: "2026-07-01",
    readMinutes: 6,
    tags: ["rules", "beginner"],
    body: [
      { type: "p", text: "Quoridor is a 2- or 4-player abstract strategy game played on a 9×9 grid. Each player controls a single pawn and 10 walls (5 walls with 4 players). The goal is simple: be the first to reach the opposite side of the board. But the twist — walls — turns every match into a spatial puzzle." },
      { type: "h2", text: "Setup" },
      { type: "p", text: "Place each pawn on the middle square of their starting edge. In a 2-player game, players face off top and bottom. In a 4-player game, pawns start on all four edges and each player begins with 5 walls." },
      { type: "h2", text: "On your turn" },
      { type: "p", text: "On each turn you either move your pawn one square (up, down, left, right — no diagonals) or place one wall. You cannot do both." },
      { type: "h3", text: "Movement" },
      { type: "ul", items: [
        "Move one square orthogonally into an empty square.",
        "If an opponent's pawn is adjacent, you may jump over it, landing on the square directly behind.",
        "If a wall or the edge blocks the jump, you may sidestep diagonally around the opponent instead.",
      ] },
      { type: "h3", text: "Wall placement" },
      { type: "ul", items: [
        "Walls are two squares long and slot between rows or columns.",
        "You may never fully seal off a player — every pawn must always have at least one path to their goal row.",
        "Walls cannot overlap or cross each other.",
      ] },
      { type: "h2", text: "Winning" },
      { type: "p", text: "The first pawn to touch any square of the opposite edge wins. In 4-player games, each pawn's goal is the edge directly opposite where they started." },
      { type: "h2", text: "Play online" },
      { type: "p", text: "You can play Quoridor free in your browser at playquoridor.online — quick match, private rooms, bot practice, or a live 4-player free-for-all." },
    ],
  },
  {
    slug: "quoridor-strategy-tips",
    title: "10 Quoridor Strategy Tips to Climb the Leaderboard",
    description:
      "Actionable Quoridor strategy: wall economy, tempo, the shortest-path principle, mirroring, and endgame tactics used by top-rated online players.",
    date: "2026-07-03",
    readMinutes: 8,
    tags: ["strategy", "advanced"],
    body: [
      { type: "p", text: "Once you know the rules, Quoridor becomes a race conditioned by walls. These 10 principles will lift you from casual to competitive." },
      { type: "h2", text: "1. Count tempo, not walls" },
      { type: "p", text: "Every wall costs a tempo — a move you didn't use to advance. Place a wall only if it costs your opponent more tempo than it costs you." },
      { type: "h2", text: "2. Follow the shortest path" },
      { type: "p", text: "Before each move, recompute both players' shortest paths. Your target: keep your path ≤ theirs by at least 1." },
      { type: "h2", text: "3. Wall the leader, race the trailer" },
      { type: "p", text: "If you're behind on path length, place a wall. If you're ahead, race — don't waste tempo defending a lead." },
      { type: "h2", text: "4. Threaten forks" },
      { type: "p", text: "The strongest walls create two threats — extending the path and setting up the next wall. A single-purpose wall is usually a losing trade." },
      { type: "h2", text: "5. Save walls for the second half" },
      { type: "p", text: "Walls placed near the finish line lengthen the path far more than walls placed near the start. Don't blow all 10 walls in the opening." },
      { type: "h2", text: "6. Watch the diagonal jump" },
      { type: "p", text: "When pawns meet, the diagonal sidestep can gain or lose a whole tempo. Practice recognizing it — beginners miss it constantly." },
      { type: "h2", text: "7. Mirror against symmetric openings" },
      { type: "p", text: "If your opponent plays a symmetric race, mirror. The first player who breaks symmetry with a bad wall loses the tempo." },
      { type: "h2", text: "8. Corner traps" },
      { type: "p", text: "Two walls near a board corner can force a 6+ tempo detour. Look for these patterns whenever an opponent hugs the edge." },
      { type: "h2", text: "9. Endgame: burn walls only to win" },
      { type: "p", text: "In the last 3–4 moves, a wall must directly win the race. Otherwise, just move." },
      { type: "h2", text: "10. Play a lot" },
      { type: "p", text: "Pattern recognition dominates Quoridor. Every ranked match on playquoridor.online sharpens your intuition faster than reading tips." },
    ],
  },
  {
    slug: "quoridor-vs-chess",
    title: "Quoridor vs Chess: Which Strategy Game Should You Play?",
    description:
      "Comparing Quoridor and Chess — learning curve, game length, depth, and why Quoridor is one of the best gateway abstract strategy games for chess players.",
    date: "2026-07-05",
    readMinutes: 5,
    tags: ["comparison", "beginner"],
    body: [
      { type: "p", text: "Chess is the giant of abstract strategy — but its 6-piece movement rules and 400-year theory library make it a mountain to climb. Quoridor offers a lighter alternative with surprising depth." },
      { type: "h2", text: "Learning curve" },
      { type: "p", text: "Quoridor's entire ruleset fits in a paragraph. A new player can be competitive within a single evening. Chess takes weeks just to stop hanging pieces." },
      { type: "h2", text: "Game length" },
      { type: "p", text: "A Quoridor game usually lasts 5–15 minutes. Rapid chess starts at 10 minutes and often runs longer." },
      { type: "h2", text: "Depth" },
      { type: "p", text: "Quoridor is solved for the 5×5 board but wide open at 9×9. Engines are still improving, and human intuition remains competitive with the best bots for many positions." },
      { type: "h2", text: "Which should you play?" },
      { type: "p", text: "Play both. Chess for deep long-term study; Quoridor for fast, spatial thinking. Many top chess players use Quoridor as a warm-up because it retrains pattern recognition without opening theory." },
    ],
  },
  {
    slug: "fog-of-walls-ltm",
    title: "Fog of Walls: A New Way to Play Quoridor",
    description:
      "Fog of Walls is a limited-time Quoridor mode where walls are hidden until you see them. Read the rules, the strategy shift, and how to master line-of-sight play.",
    date: "2026-07-07",
    readMinutes: 4,
    tags: ["ltm", "fog"],
    body: [
      { type: "p", text: "Fog of Walls is our new limited-time mode. The rules are the same as standard Quoridor — but you only see the board along a straight line from your pawn. Walls, and even your opponent, disappear into the fog until sight touches them." },
      { type: "h2", text: "Why it matters" },
      { type: "p", text: "Standard Quoridor is a game of perfect information. Fog of Walls flips that: every move is also a scouting decision. Do you race blind, or take a slower path that reveals more of the board?" },
      { type: "h2", text: "Strategy shift" },
      { type: "ul", items: [
        "Move into corridors that reveal long straight lines.",
        "Place walls near the fog line — your opponent won't see them until it's too late.",
        "Remember revealed walls — the board doesn't remind you.",
      ] },
      { type: "h2", text: "Try it" },
      { type: "p", text: "Fog of Walls lives on the front page as a limited-time button. It's currently 1v1 versus a fog-aware bot. Give it a spin — normal Quoridor will feel refreshingly clear afterwards." },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}