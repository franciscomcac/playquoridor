import { createFileRoute, Link } from "@tanstack/react-router";

const SITE_URL = "https://playquoridor.online";
const PAGE_URL = `${SITE_URL}/about`;
const TITLE = "About Quoridor — Rules, History & Strategy";
const DESCRIPTION =
  "Quoridor rules, history, strategy tips and FAQ for the 2–4 player wall blocking board game. Play free in your browser at playquoridor.online.";
const OG_DESCRIPTION = DESCRIPTION;

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "quoridor, quoridor rules, how to play quoridor, quoridor strategy, wall blocking game, balls and walls game, pawn and walls board game, quoridor history, mirko marchesi, gigamic, abstract strategy game, 9x9 board game, free online quoridor",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: OG_DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: OG_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          url: PAGE_URL,
          mainEntityOfPage: PAGE_URL,
          about: {
            "@type": "Game",
            name: "Quoridor",
            genre: "Abstract strategy board game",
            numberOfPlayers: "2-4",
            gameLocation: "Online",
            url: SITE_URL,
          },
          author: { "@type": "Organization", name: "Play Quoridor Online" },
          publisher: { "@type": "Organization", name: "Play Quoridor Online" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "About", item: PAGE_URL },
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Is Quoridor the same as the balls and walls game?",
              acceptedAnswer: { "@type": "Answer", text: "Yes. Many players remember Quoridor by its components — round pawns and wall segments — and search for it as the balls and walls game or the wall blocking board game. It is called Quoridor." },
            },
            {
              "@type": "Question",
              name: "Is Quoridor a solved game?",
              acceptedAnswer: { "@type": "Answer", text: "9×9 Quoridor has not been formally solved. Smaller 5×5 variants have been computer-solved and are a first-player win with perfect play. On the full 9×9 board strong engines exist but the game remains rich for human play." },
            },
            {
              "@type": "Question",
              name: "Do I have to place walls?",
              acceptedAnswer: { "@type": "Answer", text: "No. On every turn you choose freely between moving your pawn and placing a wall. You can play an entire game without placing a wall — you just usually won't win against a player who does." },
            },
            {
              "@type": "Question",
              name: "Can I completely block my opponent with walls?",
              acceptedAnswer: { "@type": "Answer", text: "No. After any wall placement, every player must still have at least one legal path to their goal. A wall that would fully cut off any player is illegal." },
            },
            {
              "@type": "Question",
              name: "How long does a game of Quoridor take?",
              acceptedAnswer: { "@type": "Answer", text: "A casual two-player round usually takes 10–20 minutes. Best-of-five matches take around 30–60 minutes. Four-player games are quicker per round but often more chaotic." },
            },
            {
              "@type": "Question",
              name: "Where can I play Quoridor online for free?",
              acceptedAnswer: { "@type": "Answer", text: "At playquoridor.online. Create a private room and share the code with a friend, use Quick Match, or play a local bot. No account and no download required." },
            },
          ],
        }),
      },
    ],
  }),
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed text-foreground sm:px-6 sm:py-14 sm:text-base">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">← Back to game</Link>
      </nav>

      <article className="space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold sm:text-4xl">About Quoridor</h1>
          <p className="text-muted-foreground">
            Quoridor is a two- or four-player abstract strategy board game played on a 9×9 grid.
            Each turn you either walk your pawn one square or drop a wall to slow the opponent
            down. First pawn to reach the opposite edge wins. This page is a full reference to the
            game, its rules, its history, and how to play it well — a supplement to the free
            online version you can play at <a className="underline" href="https://playquoridor.online">playquoridor.online</a>.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What is Quoridor?</h2>
          <p>
            Quoridor is a modern abstract strategy game invented by Italian designer{" "}
            <strong>Mirko Marchesi</strong> and published by the French company{" "}
            <strong>Gigamic</strong> in 1997. It has been sold in over three million copies
            worldwide and has won a long list of awards, including the{" "}
            <em>Mensa Select</em> award (1997), the <em>Game of the Year</em> award in the
            United States (1998), the <em>Toy of the Year</em> in France, Belgium and Canada,
            and a nomination for the prestigious <em>Spiel des Jahres</em>. It is often
            described online as the "balls and walls game", the "wall blocking board game",
            or the "pawns and fences game" — all of which refer to Quoridor.
          </p>
          <p>
            The board is a 9×9 grid of squares. Each player has a single pawn and a personal
            pool of walls (10 in the two-player version, 5 each in the four-player version).
            Players alternate turns. On your turn you must do exactly one of two things: move
            your pawn one square, or place one of your walls. That is the entire rule
            surface — the depth comes from what those two actions imply.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Full rules</h2>
          <h3 className="text-lg font-semibold">Setup</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>Board: 9×9 squares (81 in total). Between the squares are 8×8 = 64 potential wall slots.</li>
            <li>Two players: pawns start on the middle square of opposite edges. Each player holds 10 walls.</li>
            <li>Four players: pawns start on the middle square of each of the four edges. Each player holds 5 walls.</li>
            <li>Every player's goal is to reach <em>any</em> square on the opposite edge from where they started.</li>
          </ul>

          <h3 className="text-lg font-semibold">Your turn</h3>
          <p>On your turn you must take exactly one action:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>Move your pawn</strong> one square up, down, left or right, unless a wall or
              the edge of the board is in the way. Pawns do not move diagonally by default.
            </li>
            <li>
              <strong>Place a wall</strong> from your reserve. Walls are two squares long and are
              placed on the grid lines between squares, either horizontally or vertically. Once
              placed, a wall stays where it is for the rest of the game — walls are never moved
              and never returned to the reserve.
            </li>
          </ul>

          <h3 className="text-lg font-semibold">Jumping over an opponent</h3>
          <p>
            If an opponent's pawn is on the square directly next to yours, you may jump straight
            over them to the square behind, provided that square exists and no wall is in the way.
            If the square directly behind the opponent is blocked (by a wall or the edge of the
            board), you may instead move diagonally to either of the squares beside the opponent —
            but only if those diagonals are not themselves blocked by walls.
          </p>

          <h3 className="text-lg font-semibold">Wall placement rules</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>A wall occupies two grid segments and must fit fully on the board.</li>
            <li>A wall may not cross or overlap another wall.</li>
            <li>
              <strong>The critical constraint:</strong> a wall may not completely trap any player.
              After the wall is placed, every player must still have at least one legal path from
              their current square to their goal edge. If your intended wall would cut off any
              player entirely, the wall is illegal and must be placed elsewhere.
            </li>
            <li>When you run out of walls you may still move your pawn — you just can't build.</li>
          </ul>

          <h3 className="text-lg font-semibold">Winning</h3>
          <p>
            The first player to land on any square of their goal edge wins the round. In our online
            version, matches are played as best-of-five rounds by default (first to three round
            wins takes the match), but you can configure the round count when creating a room.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Strategy and tips</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Count the shortest path.</strong> Both you and your opponent are running a
              race. On every turn, mentally count how many moves each side needs to reach their
              goal assuming no more walls are placed. Whoever has the shorter path is currently
              winning; the person who is behind should look for a wall that lengthens the
              opponent's path by more than it lengthens their own.
            </li>
            <li>
              <strong>Walls are a limited resource.</strong> With only 10 walls in two-player
              Quoridor, every wall you spend must earn its keep. A wall that adds one step to
              your opponent while adding zero to you is worth playing; a wall that adds one to
              them and one to you is a wash.
            </li>
            <li>
              <strong>Threaten, don't just block.</strong> Great walls do two jobs at once:
              lengthen the opponent's path <em>and</em> set up a future forced route (a corridor,
              a bottleneck) where a second wall becomes even more punishing.
            </li>
            <li>
              <strong>Watch for jump traps.</strong> If your pawn ends up adjacent to an opponent
              near a wall, the jump-and-diagonal rules can suddenly give them (or you) an
              unexpected shortcut. Always visualise the jump options before you commit.
            </li>
            <li>
              <strong>Save walls for the endgame.</strong> A player with walls left when the
              opponent has none is dictating the pace. If you can stay near even on path length
              through the early game, you enter the endgame with a decisive tool the other player
              no longer has.
            </li>
            <li>
              <strong>Four-player Quoridor is different.</strong> With only 5 walls each, walls
              are precious and it is easy for two players to help each other by accident.
              Diagonal moves and jump interactions come up much more often.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Glossary</h2>
          <dl className="space-y-3">
            <div>
              <dt className="font-semibold">Pawn</dt>
              <dd className="text-muted-foreground">The single round piece each player moves toward their goal edge.</dd>
            </div>
            <div>
              <dt className="font-semibold">Wall (fence)</dt>
              <dd className="text-muted-foreground">A two-square-long barrier placed between squares to block movement.</dd>
            </div>
            <div>
              <dt className="font-semibold">Goal edge / goal row</dt>
              <dd className="text-muted-foreground">The row or column on the opposite side of the board that your pawn must reach.</dd>
            </div>
            <div>
              <dt className="font-semibold">Jump</dt>
              <dd className="text-muted-foreground">Moving directly over an adjacent opponent to the square behind them.</dd>
            </div>
            <div>
              <dt className="font-semibold">Diagonal step</dt>
              <dd className="text-muted-foreground">The sideways move allowed when a straight jump is blocked by a wall or edge.</dd>
            </div>
            <div>
              <dt className="font-semibold">Path length</dt>
              <dd className="text-muted-foreground">The minimum number of moves you need to reach your goal edge given the current walls.</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Frequently asked questions</h2>

          <div>
            <h3 className="font-semibold">Is Quoridor the same as the "balls and walls game"?</h3>
            <p className="text-muted-foreground">
              Yes. Many players remember the game only by its components — round pawns and wall
              segments — and search for it as the "balls and walls game" or the "wall blocking
              board game". It is called Quoridor.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Is Quoridor a solved game?</h3>
            <p className="text-muted-foreground">
              9×9 Quoridor has not been formally solved. Smaller variants (5×5) have been
              computer-solved and are a first-player win with perfect play. On the full 9×9 board
              strong engines exist, but the game remains rich for human play.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Do I have to place walls?</h3>
            <p className="text-muted-foreground">
              No. On every turn you choose freely between moving your pawn and placing a wall.
              You can play an entire game without ever placing a wall — you just usually won't
              win against a player who does.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Can I completely block my opponent with walls?</h3>
            <p className="text-muted-foreground">
              No. The core wall rule is that after any wall placement, every player must still
              have at least one legal path to their goal. A wall that would fully cut off any
              player is illegal and cannot be placed.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">How long does a game of Quoridor take?</h3>
            <p className="text-muted-foreground">
              A casual two-player round usually takes 10–20 minutes. Best-of-five matches take
              around 30–60 minutes. Four-player games are quicker per round but often more
              chaotic.
            </p>
          </div>

          <div>
            <h3 className="font-semibold">Where can I play Quoridor online for free?</h3>
            <p className="text-muted-foreground">
              Right here at <a className="underline" href="https://playquoridor.online">playquoridor.online</a>.
              You can create a private room and share the code with a friend, use Quick Match to
              be paired with another player, or fall back to a local bot when nobody is around.
              No account and no download required.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Start playing</h2>
          <p>
            Ready to try it? <Link to="/" className="underline">Return to the game</Link> to create
            a room, join with a code, or jump into Quick Match. If you want to see how you stack
            up against other players, the <Link to="/stats" className="underline">stats page</Link>{" "}
            shows the current leaderboard.
          </p>
        </section>
      </article>
    </main>
  );
}
