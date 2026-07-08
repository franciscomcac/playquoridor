// Renders a shareable PNG summary of a finished Quoridor game onto an
// offscreen canvas. Pure canvas 2D — no DOM dependency at draw time.
import { BOARD, type GameState, type PlayerId } from "./quoridor";

const PLAYER_HEX = ["#e6b647", "#7a8fd4", "#d4544a", "#68b78a"];
const BG = "#f2ead9";
const CARD = "#faf3e2";
const FG = "#2c241b";
const MUTED = "#8a7a63";
const BOARD_BG = "#d9c69a";
const CELL = "#e6d4a8";
const CELL_ALT = "#dcc99b";
const LINE = "rgba(70,50,20,0.28)";
const WALL = "#4b3a24";

export type ResultCardInput = {
  state: GameState;
  winner: PlayerId;
  you: PlayerId;
  nameOf: (s: PlayerId) => string;
  reason?: "goal" | "time" | "forfeit" | "afk";
  matchOver: boolean;
};

export async function renderResultCard(input: ResultCardInput): Promise<Blob> {
  const { state, winner, you, nameOf, reason, matchOver } = input;
  const W = 1200, H = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // Background wash
  const grd = ctx.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, "#f6ecd4");
  grd.addColorStop(1, "#ecdfbe");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = MUTED;
  ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("QUORIDOR · MATCH RESULT".split("").join(" "), 80, 90);

  const youWon = winner === you;
  ctx.fillStyle = FG;
  ctx.textAlign = "left";
  ctx.font = "600 68px ui-serif, Georgia, serif";
  const title = matchOver
    ? (youWon ? "Match won" : `${nameOf(winner)} wins the match`)
    : (youWon ? "Round won" : `${nameOf(winner)} takes the round`);
  ctx.fillText(title, 80, 170);

  ctx.fillStyle = MUTED;
  ctx.font = "400 26px ui-sans-serif, system-ui, sans-serif";
  const sub =
    reason === "time" ? "Won on time" :
    reason === "afk" ? "Won by idle forfeit" :
    reason === "forfeit" ? "Won by forfeit" :
    "Reached the goal";
  ctx.fillText(sub, 80, 210);

  // Board area
  const boardSize = 880;
  const boardX = (W - boardSize) / 2;
  const boardY = 260;
  drawBoard(ctx, state, boardX, boardY, boardSize);

  // Stats row
  const statsY = boardY + boardSize + 70;
  const moves = state.moveCount ?? state.walls.length;
  const wallsUsed = state.walls.length;
  drawStat(ctx, W * 0.22, statsY, String(moves), "Total moves");
  drawStat(ctx, W * 0.5,  statsY, String(wallsUsed), "Walls placed");
  drawStat(ctx, W * 0.78, statsY, `${state.score.join(" — ")}`, "Score");

  // Watermark
  ctx.fillStyle = MUTED;
  ctx.font = "500 22px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("playquoridor.online", W / 2, H - 50);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, value: string, label: string) {
  ctx.textAlign = "center";
  ctx.fillStyle = FG;
  ctx.font = "600 54px ui-serif, Georgia, serif";
  ctx.fillText(value, x, y);
  ctx.fillStyle = MUTED;
  ctx.font = "500 20px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(label.toUpperCase().split("").join(" "), x, y + 34);
}

function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, size: number) {
  // Frame
  ctx.fillStyle = "#8a6a3d";
  roundRect(ctx, x - 18, y - 18, size + 36, size + 36, 22);
  ctx.fill();

  // Board bg
  ctx.fillStyle = BOARD_BG;
  roundRect(ctx, x, y, size, size, 12);
  ctx.fill();

  const cell = size / BOARD;
  // Cells
  for (let r = 0; r < BOARD; r++) {
    for (let c = 0; c < BOARD; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? CELL : CELL_ALT;
      ctx.fillRect(x + c * cell + 2, y + r * cell + 2, cell - 4, cell - 4);
    }
  }

  // Grid lines
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  for (let i = 1; i < BOARD; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * cell, y);
    ctx.lineTo(x + i * cell, y + size);
    ctx.moveTo(x, y + i * cell);
    ctx.lineTo(x + size, y + i * cell);
    ctx.stroke();
  }

  // Walls
  const wallT = Math.max(6, cell * 0.16);
  ctx.fillStyle = WALL;
  for (const w of state.walls) {
    if (w.o === "h") {
      const wx = x + w.c * cell + 4;
      const wy = y + (w.r + 1) * cell - wallT / 2;
      roundRect(ctx, wx, wy, cell * 2 - 8, wallT, wallT / 2);
      ctx.fill();
    } else {
      const wx = x + (w.c + 1) * cell - wallT / 2;
      const wy = y + w.r * cell + 4;
      roundRect(ctx, wx, wy, wallT, cell * 2 - 8, wallT / 2);
      ctx.fill();
    }
  }

  // Pawns
  for (let i = 0; i < state.mode; i++) {
    if (!state.active[i] && state.winner !== i) continue;
    const [pr, pc] = state.pawns[i];
    const cx = x + pc * cell + cell / 2;
    const cy = y + pr * cell + cell / 2;
    const rad = cell * 0.32;
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.ellipse(cx, cy + rad * 0.55, rad * 0.9, rad * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.15, cx, cy, rad);
    g.addColorStop(0, "rgba(255,255,255,0.6)");
    g.addColorStop(0.35, PLAYER_HEX[i]);
    g.addColorStop(1, shade(PLAYER_HEX[i], -0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#231a10";
    ctx.font = `700 ${Math.round(cell * 0.28)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), cx, cy + 1);
    ctx.textBaseline = "alphabetic";
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amt)));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amt)));
  const b = Math.max(0, Math.min(255, (n & 0xff) + Math.round(255 * amt)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export async function shareResultCard(blob: Blob, filename = "quoridor-result.png") {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };
  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: "Quoridor result",
        text: "Played a game on playquoridor.online",
      });
      return "shared" as const;
    } catch {
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded" as const;
}