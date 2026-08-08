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
    title: "Quoridor vs Chess: Why It's Called the Wall Chess Game",
    description:
      "Why Quoridor is nicknamed the wall chess game — how the wall chess board, rules, learning curve and depth compare to chess, and which one you should play.",
    date: "2026-07-05",
    readMinutes: 7,
    tags: ["comparison", "wall chess", "beginner"],
    body: [
      { type: "p", text: "Search for \"wall chess game\" and you end up at Quoridor. The nickname stuck because Quoridor looks like chess — a square grid, two players, no dice, no hidden cards, no luck — except each player has a single pawn and the real weapon is a wall you slot between squares. Here is where the wall chess comparison holds up, where it breaks, and which game fits you better." },
      { type: "h2", text: "Why people call Quoridor \"wall chess\"" },
      { type: "p", text: "Quoridor shares chess's DNA: a grid board (9×9 instead of 8×8), strictly alternating turns, complete information and zero randomness. Every loss is your own. What replaces chess's six piece types is one pawn plus 10 walls, so the tactics are about blocking and pathfinding instead of captures. Hence \"wall chess\": chess-like reasoning, wall-based tools." },
      { type: "h2", text: "The wall chess board vs the chessboard" },
      { type: "ul", items: [
        "Quoridor: 9×9 squares, one pawn per player, 10 walls each (5 walls in a 4-player game).",
        "Chess: 8×8 squares, 16 pieces per player, and no move that alters the board itself.",
        "Quoridor walls are two squares long and sit in the grooves between squares, so they change the geometry of the board — something no chess move can do.",
      ] },
      { type: "h2", text: "Rules: captures vs blocking" },
      { type: "p", text: "In chess you win by attacking the king. In Quoridor nothing is ever captured — you win by walking your pawn to the opposite edge first. Each turn you either step one square orthogonally or place a wall, never both. One rule keeps it fair: you can never fully seal a player off, so every pawn always keeps at least one legal path to its goal row. If a pawn stands next to yours you may jump over it, or sidestep diagonally when a wall blocks the jump." },
      { type: "h2", text: "Learning curve" },
      { type: "p", text: "Quoridor's entire ruleset fits in a paragraph, and a new player can be competitive within a single evening. Chess takes weeks just to stop hanging pieces, and opening theory alone is a lifetime of study. If you want chess's feeling of pure skill without the homework, wall chess is the shortcut." },
      { type: "h2", text: "Game length" },
      { type: "p", text: "A Quoridor game usually lasts 5–15 minutes. Rapid chess starts at 10 minutes per side and classical games run for hours. Quoridor fits in a coffee break, which is why most online matches here get played back-to-back." },
      { type: "h2", text: "Depth" },
      { type: "p", text: "Chess has been analysed for centuries and engines are far beyond humans. Quoridor is solved only on small boards such as 5×5; the standard 9×9 game is still wide open, engines keep improving, and human intuition stays competitive with strong bots in many positions. Less theory, more thinking on the spot." },
      { type: "h2", text: "Skills that transfer both ways" },
      { type: "ul", items: [
        "Tempo: in both games, a move not spent advancing is a move you owe back later.",
        "Prophylaxis: chess players who enjoy restricting the opponent will love wall placement.",
        "Calculation: counting shortest paths in Quoridor is the same habit as counting tempi in a chess pawn race.",
      ] },
      { type: "h2", text: "Which should you play?" },
      { type: "p", text: "Play chess if you want a lifelong study project with a huge community and endless literature. Play Quoridor — wall chess — if you want fast, spatial, luck-free strategy you can learn tonight. Many chess players use it as a warm-up because it trains pattern recognition without opening theory." },
      { type: "h2", text: "Play wall chess online free" },
      { type: "p", text: "You can play Quoridor free in your browser at playquoridor.online — no download: quick casual matches, ranked play with an ELO rating, private rooms against a friend, bots from beginner to engine strength, and daily puzzles." },
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