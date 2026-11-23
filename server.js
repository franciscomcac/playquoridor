'use strict';
/*
 * YAPSNAKE — authoritative game server
 *  - serves /public over HTTP
 *  - runs the snake simulation at 30 Hz
 *  - streams culled state to each client over WebSocket
 *  - relays WebRTC signaling for proximity voice chat
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// ---------------------------------------------------------------- config
const PORT = +(process.env.PORT || 3000);
const TICK_RATE = 30;
const WORLD_R = 4000;
const FOOD_TARGET = 5000;
const BOT_POP = +(process.env.BOTS ?? 40);      // bots fill the world up to this many snakes
const BOT_MIN = +(process.env.BOTS_MIN ?? 8);     // ...but never fewer than this many bots
const BASE_VIEW = 1500;          // world units visible (radius) at minimum size
const BASE_SPEED = 5.4;
const BOOST_SPEED = 11;
const START_SCORE = +(process.env.START_SCORE || 10);
const MIN_BOOST_SCORE = 6;        // can boost from the start, down to a tiny snake
const BOOST_COST = 0.075;       // score per tick while boosting (~2.25 length/s, drops a pellet every ~0.45 s)
const CELL = 120;                // spatial hash cell size
const KEYFRAME_EVERY = 15;       // full body resync interval (ticks)
const MAX_MSG = 16384;

// ---------------------------------------------------------------- http
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.json': 'application/json'
};
const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(PUBLIC, url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: MAX_MSG });

// ---------------------------------------------------------------- helpers
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function randInWorld(f = 0.95) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * WORLD_R * f;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}
const radiusFor = s => Math.min(44, 10 + Math.sqrt(Math.max(0, s)) * 0.85);
const segCountFor = s => Math.min(520, Math.floor(10 + s / 4));
const spacingFor = r => r * 0.5;
const foodRadius = v => 3 + v * 1.2;
const cellKey = (cx, cy) => ((cx + 512) << 10) | (cy + 512);
const cellOf = v => Math.floor(v / CELL);
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function cleanName(n) {
  n = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
  return n || 'Anonymous';
}

// ---------------------------------------------------------------- food
const food = new Map();
const foodGrid = new Map();
let nextFoodId = 1;
function addFood(x, y, v, h, ttl = 0) {
  const d = Math.hypot(x, y);
  if (d > WORLD_R - 20) { x *= (WORLD_R - 20) / d; y *= (WORLD_R - 20) / d; }
  const f = { id: nextFoodId++, x, y, v, h, k: cellKey(cellOf(x), cellOf(y)), exp: ttl ? tickNo + ttl : 0 };
  food.set(f.id, f);
  let c = foodGrid.get(f.k); if (!c) foodGrid.set(f.k, c = new Set());
  c.add(f);
  return f;
}
function removeFood(f) {
  food.delete(f.id);
  const c = foodGrid.get(f.k); if (c) { c.delete(f); if (!c.size) foodGrid.delete(f.k); }
}
function forFoodNear(x, y, rad, fn) {
  const x0 = cellOf(x - rad), x1 = cellOf(x + rad), y0 = cellOf(y - rad), y1 = cellOf(y + rad);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const c = foodGrid.get(cellKey(cx, cy)); if (!c) continue;
    for (const f of c) fn(f);
  }
}
// dropped food (deaths, boosting) fades out after a while, and the world never holds more than
// FOOD_MAX pellets: the oldest dropped pellets go first, so it can't pile up forever
const FOOD_MAX = FOOD_TARGET * 2;
function sweepFood() {
  const dropped = [];
  for (const f of food.values()) {
    if (!f.exp) continue;
    if (f.exp <= tickNo) removeFood(f); else dropped.push(f);
  }
  let extra = food.size - FOOD_MAX;
  if (extra > 0) { dropped.sort((a, b) => a.exp - b.exp); for (let i = 0; i < dropped.length && extra > 0; i++, extra--) removeFood(dropped[i]); }
}
function spawnRandomFood(n) {
  for (let i = 0; i < n; i++) {
    const p = randInWorld(0.98);
    const v = Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1;
    addFood(p.x, p.y, v, Math.floor(Math.random() * 360));
  }
}

// ---------------------------------------------------------------- snakes
const snakes = new Map();
let nextSnakeId = 1;
let segGrid = new Map();   // rebuilt every tick: key -> [snake, segIndex, snake, segIndex...]

function safeSpawn() {
  let best = randInWorld(0.75), bestD = -1;
  for (let t = 0; t < 30; t++) {
    const p = randInWorld(0.75);
    let minD = Infinity;
    for (const s of snakes.values()) for (let i = 0; i < s.segs.length; i += 4) {
      const d = Math.hypot(s.segs[i].x - p.x, s.segs[i].y - p.y);
      if (d < minD) minD = d;
    }
    if (minD > 500) return p;
    if (minD > bestD) { bestD = minD; best = p; }
  }
  return best;
}
function createSnake({ name, hue, skin = 0, isBot = false, player = null, score = START_SCORE, bot = null, at = null }) {
  const p = at || safeSpawn();
  const angle = Math.atan2(-p.y, -p.x) + rand(-1, 1);
  const s = {
    id: nextSnakeId++, name, hue, skin, isBot, player, alive: true,
    score, angle, target: angle, boost: false, boosting: false, boostAcc: 0,
    r: radiusFor(score), segs: [], bbox: null,
    bot: isBot ? Object.assign({ foodT: null, think: 0, wander: angle, boostT: 0, target: null, retarget: 0, mode: 'eat' }, bot) : null
  };
  const n = segCountFor(s.score), sp = spacingFor(s.r);
  if (n * sp < 700) {
    for (let i = 0; i < n; i++) s.segs.push({ x: p.x - Math.cos(angle) * sp * i, y: p.y - Math.sin(angle) * sp * i });
  } else {
    // long snakes spawn coiled up in a spiral (tail in the middle, head on the outside)
    const b = (s.r * 2.3) / (Math.PI * 2), a0 = s.r * 2.5;
    const pts = []; let th = 0;
    while (pts.length < n) { const rr = a0 + b * th; pts.push({ x: p.x + Math.cos(th) * rr, y: p.y + Math.sin(th) * rr }); th += sp / rr; }
    pts.reverse(); s.segs = pts;
    s.angle = s.target = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
  }
  computeBBox(s);
  snakes.set(s.id, s);
  return s;
}
function computeBBox(s) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of s.segs) { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; }
  s.bbox = [a - s.r, b - s.r, c + s.r, d + s.r];
}
// same algorithm runs on the client to reconstruct bodies between keyframes
function chainBody(segs, hx, hy, n, spacing) {
  segs[0].x = hx; segs[0].y = hy;
  while (segs.length < n) { const t = segs[segs.length - 1]; segs.push({ x: t.x, y: t.y }); }
  while (segs.length > n && segs.length > 3) segs.pop();
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1], b = segs[i];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > spacing) { const k = spacing / d; b.x = a.x + dx * k; b.y = a.y + dy * k; }
  }
}
function step(s) {
  const h = s.segs[0];
  const turn = 0.19 / (1 + (s.r - 10) / 25);
  s.angle += clamp(angDiff(s.target, s.angle), -turn, turn);
  s.angle = Math.atan2(Math.sin(s.angle), Math.cos(s.angle));
  s.boosting = s.boost && s.score > MIN_BOOST_SCORE;
  // ease into / out of a boost (~150 ms) instead of snapping between speeds
  s.spd = (s.spd || BASE_SPEED) + ((s.boosting ? BOOST_SPEED : BASE_SPEED) - (s.spd || BASE_SPEED)) * 0.32;
  const sp = s.spd;
  if (s.boosting) {
    s.score -= BOOST_COST; s.boostAcc += BOOST_COST;
    if (s.boostAcc >= 1) {
      s.boostAcc -= 1;
      const t = s.segs[s.segs.length - 1];
      addFood(t.x + rand(-6, 6), t.y + rand(-6, 6), 1, s.hue, Math.floor(rand(25, 40) * TICK_RATE));
    }
  }
  s.r = radiusFor(s.score);
  chainBody(s.segs, h.x + Math.cos(s.angle) * sp, h.y + Math.sin(s.angle) * sp, segCountFor(s.score), spacingFor(s.r));
  computeBBox(s);
}
function buildSegGrid() {
  segGrid = new Map();
  for (const s of snakes.values()) {
    for (let i = 0; i < s.segs.length; i++) {
      const p = s.segs[i], k = cellKey(cellOf(p.x), cellOf(p.y));
      let c = segGrid.get(k); if (!c) segGrid.set(k, c = []);
      c.push(s, i);
    }
  }
}
function forSegsNear(x, y, rad, fn) {
  const x0 = cellOf(x - rad), x1 = cellOf(x + rad), y0 = cellOf(y - rad), y1 = cellOf(y + rad);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const c = segGrid.get(cellKey(cx, cy)); if (!c) continue;
    for (let j = 0; j < c.length; j += 2) if (fn(c[j], c[j + 1]) === true) return true;
  }
  return false;
}
const deathsThisTick = [];
const feasts = [];   // death piles bots race to: {x, y, v, until}
function kill(s, killer) {
  if (!s.alive) return;
  s.alive = false;
  deathsThisTick.push(s.id);
  // mark the pile: a point every ~quarter of the body (long snakes leave a long trail of food)
  const nPts = Math.min(6, Math.max(1, Math.round(s.segs.length / 40)));
  for (let k = 0; k < nPts; k++) {
    const p = s.segs[Math.floor((k + 0.5) / nPts * s.segs.length)];
    feasts.push({ x: p.x, y: p.y, v: s.score * 0.8 / nPts, until: tickNo + 20 * TICK_RATE });
  }
  snakes.delete(s.id);
  // turn the body into food
  const total = Math.max(4, s.score * 0.8);
  const step = Math.max(1, Math.floor(s.segs.length / Math.min(s.segs.length, Math.ceil(total / 2))));
  const drops = Math.ceil(s.segs.length / step);
  const per = clamp(total / drops, 1, 12);
  for (let i = 0; i < s.segs.length; i += step) {
    const p = s.segs[i];
    addFood(p.x + rand(-s.r * 0.6, s.r * 0.6), p.y + rand(-s.r * 0.6, s.r * 0.6), r1(per * rand(0.7, 1.3)), s.hue, Math.floor(rand(50, 90) * TICK_RATE));
  }
  if (s.player) {
    const pl = s.player;
    pl.snake = null;
    send(pl.ws, { t: 'dead', score: Math.floor(s.score), by: killer ? killer.name : null });
  } else {
    botRespawns.push(tickNo + Math.floor(rand(2, 5) * TICK_RATE));
  }
}

// ---------------------------------------------------------------- bots
// Bots look and play like people: player-style names, mixed sizes, and three personalities.
//   farmer - mostly eats, avoids fights, boosts for big food
//   hunter - picks smaller snakes, cuts in front of their heads, coils around much smaller ones
//   coward - eats, but runs (and boosts) away from anything bigger that comes close
// Each bot also has a skill level that controls how far ahead it looks, so some are easy kills.
const BOT_NAMES = ['xXViperXx', 'noodle', 'pedro', 'ana', 'lil coil', 'BRUH', 'snek lord', 'tuga', 'joao', 'ines',
  'Zigzag', 'mamba', 'Pretzel', 'wiggles', 'sir hiss', 'Lasso', 'doodle', 'squiggle', 'rope', 'linguine',
  'garden hose', 'bendy', 'no u', 'hi mom', 'gg', 'afk', 'pls dont eat me', 'big boi', 'tiny', 'speedy',
  'Kaio', 'marta', 'rafa', 'lucas', 'sofia', 'diogo', 'beatriz', 'tiago', 'mariana', 'goncalo',
  'Shadow', 'Neon', 'toxic', 'chill', 'sneaky', 'Cobra', 'python3', 'segfault', 'null', 'pizza',
  'danger noodle', 'hissy fit', 'Mr Long', 'slurp', 'Ribbon', 'zoom', 'loop', 'twisty', 'the coil', 'unknown'];
const PERSONAS = ['farmer', 'farmer', 'farmer', 'farmer', 'coward', 'coward', 'hunter'];
const botRespawns = [];
function botStartScore() { return Math.floor(rand(START_SCORE, START_SCORE + 12)); }   // newcomers, like a real player
function spawnBot() {
  const used = new Set([...snakes.values()].map(o => o.name));
  let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  for (let t = 0; t < 5 && used.has(name); t++) name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  createSnake({
    name, hue: Math.floor(Math.random() * 360), skin: Math.floor(Math.random() * 6), isBot: true,
    score: botStartScore(), at: hiddenSpawn(),
    bot: { persona: PERSONAS[Math.floor(Math.random() * PERSONAS.length)], skill: rand(0.85, 1.2) }
  });
}
// Spawn point for a bot: off every real player's screen (their actual view radius, which grows
// with their size; spectators count too), and at least 600 units from any other snake so it never
// appears right next to someone. With many players the map can be fully watched; then we take the
// least-visible spot we found.
function viewRadiusOf(o) { return BASE_VIEW * (1 + (o.r - 10) / 40) + 250; }
function hiddenSpawn() {
  let best = null, bestScore = -Infinity;
  for (let t = 0; t < 120; t++) {
    // mostly near the middle: 3 in 4 tries pick a point within 45% of the radius
    let p;
    if (t % 4 !== 3) { const ang = Math.random() * Math.PI * 2, rr = WORLD_R * 0.45 * Math.sqrt(Math.random()); p = { x: Math.cos(ang) * rr, y: Math.sin(ang) * rr }; }
    else p = randInWorld(0.85);
    let seen = Infinity;                                  // distance outside the nearest player's view (negative = visible)
    for (const pl of players.values()) {
      const me = pl.snake && pl.snake.alive ? pl.snake : null;
      const vr = me ? viewRadiusOf(me) : BASE_VIEW * 1.1 + 250;
      seen = Math.min(seen, Math.hypot(pl.cam.x - p.x, pl.cam.y - p.y) - vr);
    }
    let near = Infinity;                                  // distance to the closest snake segment
    for (const o of snakes.values()) for (let i = 0; i < o.segs.length; i += 6) near = Math.min(near, Math.hypot(o.segs[i].x - p.x, o.segs[i].y - p.y));
    if (seen > 0 && near > 600) return p;
    const score = Math.min(seen, 0) * 3 + Math.min(near - 600, 0);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}
function botCount() { let n = 0; for (const s of snakes.values()) if (s.isBot) n++; return n + botRespawns.length; }
function wantedBots() { return Math.max(BOT_MIN, BOT_POP - players.size); }
function manageBots() {
  const have = botCount(), want = wantedBots();
  if (have < want) for (let i = have; i < want; i++) botRespawns.push(tickNo + Math.floor(rand(0.5, 3) * TICK_RATE));
  else if (have > want) {
    // retire the smallest bot that nobody can see
    let pick = null;
    for (const s of snakes.values()) {
      if (!s.isBot) continue;
      let seen = false;
      for (const pl of players.values()) if (Math.hypot(pl.cam.x - s.segs[0].x, pl.cam.y - s.segs[0].y) < 2200) { seen = true; break; }
      if (!seen && (!pick || s.score < pick.score)) pick = s;
    }
    if (pick) { pick.alive = false; snakes.delete(pick.id); }
    else if (botRespawns.length) botRespawns.pop();
  }
}
function isDanger(s, x, y, pad) {
  if (Math.hypot(x, y) > WORLD_R - s.r - 40) return true;
  return forSegsNear(x, y, 60 + pad, (o, i) => {
    if (o === s) return false;
    const p = o.segs[i];
    const rr = o.r + s.r + pad;
    return (p.x - x) ** 2 + (p.y - y) ** 2 < rr * rr;
  });
}
function nearestThreat(s, range) {
  const h = s.segs[0]; let best = null, bestDanger = 0;
  for (const o of snakes.values()) {
    if (o === s) continue;
    const oh = o.segs[0], d = Math.hypot(oh.x - h.x, oh.y - h.y);
    if (d > range + o.r * 4) continue;
    const toMe = Math.atan2(h.y - oh.y, h.x - oh.x);
    const aimed = Math.abs(angDiff(o.angle, toMe)) < 0.6;          // their head is pointed at us
    const bigger = o.score > s.score * 0.8;
    if (!bigger && !(aimed && d < 170 + s.r * 3)) continue;           // small snakes only matter if about to cut us
    const danger = (bigger ? 1.5 : 1) * (aimed ? 1.6 : 1) * (o.boosting ? 1.3 : 1) / (d + 40);
    if (danger > bestDanger) { bestDanger = danger; best = { o, d, aimed }; }
  }
  return best;
}
function pickPrey(s) {
  const h = s.segs[0]; let best = null, bestScore = 0;
  for (const o of snakes.values()) {
    if (o === s || o.score > s.score * 1.1 || o.score < 15) continue;
    const d = Math.hypot(o.segs[0].x - h.x, o.segs[0].y - h.y);
    if (d > 950) continue;
    const sc = (o.player ? 1.6 : 1) * (o.score + 20) / (d + 150);   // juicy, close, and preferably human
    if (sc > bestScore) { bestScore = sc; best = o; }
  }
  return best;
}
function botThink(s) {
  const b = s.bot, h = s.segs[0];
  b.think--; b.retarget--;
  let desired = b.wander, wantBoost = false;
  // stuck detection: if we've barely gone anywhere in 2 seconds we're circling something
  b.chkT = (b.chkT || 0) + 1;
  if (b.chkT >= 60) {
    if (b.chkX !== undefined && Math.hypot(h.x - b.chkX, h.y - b.chkY) < 220 && b.mode !== 'coil') {
      b.unstuck = 45; b.wander = s.angle + rand(-0.4, 0.4);
      if (b.foodT) { (b.skip = b.skip || new Set()).add(b.foodT); b.foodT = null; }
    }
    b.chkX = h.x; b.chkY = h.y; b.chkT = 0;
    if (b.skip && b.skip.size > 50) b.skip.clear();
  }
  if (b.unstuck > 0) {
    b.unstuck--;
    desired = b.wander;
    // fall through to avoidance only
    return botSteer(s, desired, false);
  }

  // --- what to do
  if (b.retarget <= 0) {
    b.retarget = 25 + Math.floor(Math.random() * 20);
    b.target = null;
    if (b.persona === 'hunter' && s.score > 80) { const prey = pickPrey(s); if (prey && prey.score < s.score * 0.65) b.target = prey.id; }
    else if (b.persona === 'farmer' && s.score > 400 && Math.random() < 0.1) { const prey = pickPrey(s); if (prey && prey.score < s.score * 0.3) b.target = prey.id; }
  }
  const prey = b.target && snakes.get(b.target);
  // food first: only a close or aimed threat breaks a bot off its meal
  let threat = nearestThreat(s, b.persona === 'coward' ? 300 : b.persona === 'hunter' ? 150 : 200);
  if (threat && !threat.aimed && threat.d > (b.persona === 'coward' ? 200 : 130)) threat = null;
  // nearest worthwhile feast (death pile) within reach
  let feast = null, feastScore = 0;
  for (const F of feasts) {
    const d = Math.hypot(F.x - h.x, F.y - h.y);
    if (d > 1400) continue;
    const sc = (F.v + 10) / (d + 150);
    if (sc > feastScore) { feastScore = sc; feast = F; }
  }

  if (threat) {
    // run: away from the threat's head, slightly sideways so we don't run in a straight line forever
    const th = threat.o.segs[0];
    desired = Math.atan2(h.y - th.y, h.x - th.x) + (b.id2 = b.id2 || (Math.random() < 0.5 ? 0.4 : -0.4));
    wantBoost = (threat.aimed || threat.d < 150) && s.score > MIN_BOOST_SCORE + 1;
    b.mode = 'flee';
  } else if (feast && Math.hypot(feast.x - h.x, feast.y - h.y) > 110) {
    // a snake just died: sprint to the pile
    desired = Math.atan2(feast.y - h.y, feast.x - h.x);
    wantBoost = s.score > MIN_BOOST_SCORE + 1;
    b.mode = 'feast'; b.foodT = null;
  } else if (prey && prey.alive) {
    const ph = prey.segs[0], d = Math.hypot(ph.x - h.x, ph.y - h.y);
    if (s.score > prey.score * 3.5 && d < 420) {
      // much bigger: orbit around them to coil them in
      desired = Math.atan2(ph.y - h.y, ph.x - h.x) + Math.PI / 2 * (b.orbit = b.orbit || (Math.random() < 0.5 ? 1 : -1));
      b.mode = 'coil';
    } else {
      // cut them off: aim for a point in front of their head
      const lead = Math.min(320, d * 0.6) + prey.r * 3;
      const ix = ph.x + Math.cos(prey.angle) * lead, iy = ph.y + Math.sin(prey.angle) * lead;
      desired = Math.atan2(iy - h.y, ix - h.x);
      wantBoost = d < 380 && d > 90 && Math.abs(angDiff(desired, s.angle)) < 0.35 && s.score > 40 && Math.random() < 0.9;
      b.mode = 'hunt';
    }
    if (d > 1300) b.target = null;
  } else {
    b.mode = 'eat';
    if (b.think <= 0) {
      b.think = 6 + Math.floor(Math.random() * 6);
      let best = null, bestScore = 0;
      const turnR = BASE_SPEED / (0.19 / (1 + (s.r - 10) / 25));   // tightest circle we can turn
      forFoodNear(h.x, h.y, 850, f => {
        const d = Math.hypot(f.x - h.x, f.y - h.y);
        if (d > 850 || (b.skip && b.skip.has(f.id))) return;
        const off = Math.abs(angDiff(Math.atan2(f.y - h.y, f.x - h.x), s.angle));
        if (d < turnR * 2.2 && off > 0.7) return;                    // beside us, inside our turn: unreachable
        const sc = f.v / (d + 60) * (1.5 - off / Math.PI);           // prefer food ahead of us
        if (sc > bestScore) { bestScore = sc; best = f; }
      });
      if (best && best.id !== b.foodT) b.foodAge = 0;
      b.foodT = best ? best.id : null;
      if (!best) b.wander += rand(-0.8, 0.8);
      if (best) {
        // how much food is in that patch? (death piles and boost trails)
        let patch = 0; forFoodNear(best.x, best.y, 90, f => { if ((f.x - best.x) ** 2 + (f.y - best.y) ** 2 < 8100) patch += f.v; });
        const d = Math.hypot(best.x - h.x, best.y - h.y);
        if (patch >= 3 && d > 70 && s.score > MIN_BOOST_SCORE + 1)
          b.boostT = Math.min(40, Math.ceil(d / BOOST_SPEED));      // sprint there, just long enough to arrive
      }
    }
    const f = b.foodT && food.get(b.foodT);
    if (f) desired = Math.atan2(f.y - h.y, f.x - h.x); else b.foodT = null;
    if (f && ++b.foodAge > 75) { (b.skip = b.skip || new Set()).add(f.id); b.foodT = null; b.think = 0; }  // took too long: give up
  }
  botSteer(s, desired, wantBoost);
}
// Simulate our own movement for the next ~0.7 s while steering toward `heading`, at the given
// speed and with our real turning limit, and report whether that path stays clear.
function pathClear(s, heading, speed) {
  const h = s.segs[0];
  const turn = 0.19 / (1 + (s.r - 10) / 25);
  let x = h.x, y = h.y, a = s.angle;
  const steps = 20, pad = 10 + speed;              // a wider margin when moving fast
  for (let i = 1; i <= steps; i++) {
    a += clamp(angDiff(heading, a), -turn, turn);
    x += Math.cos(a) * speed; y += Math.sin(a) * speed;
    if (i % 2 === 0 && isDanger(s, x, y, pad)) return false;
  }
  return true;
}
function botSteer(s, desired, wantBoost) {
  const b = s.bot, h = s.segs[0];
  if (Math.hypot(h.x, h.y) > WORLD_R - 500) { desired = Math.atan2(-h.y, -h.x); wantBoost = false; }

  // re-plan every 2nd tick (cheap enough for the free server), keep the last plan in between
  b.plan = (b.plan || 0) - 1;
  if (b.plan > 0 && b.lastDesired !== undefined && Math.abs(angDiff(desired, b.lastDesired)) < 0.3) {
    s.target = b.chosen; if (b.boostT > 0) b.boostT--; s.boost = b.boostOk && (wantBoost || b.boostT > 0); return;
  }
  b.plan = 2; b.lastDesired = desired;

  // closest heading to the one we want whose simulated path is clear
  const offsets = [0, 0.3, -0.3, 0.65, -0.65, 1.0, -1.0, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5, Math.PI];
  let chosen = null;
  for (const o of offsets) if (pathClear(s, desired + o, BASE_SPEED)) { chosen = desired + o; break; }
  if (chosen === null) chosen = s.angle + Math.PI * 0.75;     // boxed in: turn hard, and never boost into it
  const boostRequested = wantBoost || b.boostT > 0;
  // only sprint if the path is also clear at sprint speed
  b.boostOk = chosen !== null && boostRequested && pathClear(s, chosen, BOOST_SPEED);
  b.chosen = chosen;
  s.target = chosen;
  if (Math.abs(angDiff(chosen, desired)) > 0.5) b.wander = chosen;
  if (b.boostT > 0) b.boostT--;
  s.boost = b.boostOk;
}

// ---------------------------------------------------------------- players
const players = new Map();
let nextCid = 1;

wss.on('connection', ws => {
  const p = { cid: nextCid++, ws, snake: null, cam: { x: 0, y: 0 }, voice: false, known: new Set(), foodKnown: new Set(), msgCount: 0 };
  players.set(p.cid, p);
  send(ws, { t: 'hello', cid: p.cid, worldR: WORLD_R, tickRate: TICK_RATE });

  ws.on('message', raw => {
    if (++p.msgCount > 240) { ws.close(1008, 'rate'); return; }
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'play': {
        if (p.snake && p.snake.alive) return;
        p.snake = createSnake({ name: cleanName(m.name), hue: (Math.floor(+m.hue) || 0) % 360, skin: clamp(Math.floor(+m.skin) || 0, 0, 5), player: p });
        p.known.clear();
        send(ws, { t: 'spawn', id: p.snake.id });
        break;
      }
      case 'in': {
        const s = p.snake; if (!s || !s.alive) return;
        const a = +m.a; if (Number.isFinite(a)) s.target = a;
        s.boost = !!m.b;
        break;
      }
      case 'voice': p.voice = !!m.on; break;
      case 'sig': {
        const to = players.get(m.to | 0);
        if (!to || to === p || !p.voice || !to.voice) return;
        send(to.ws, { t: 'sig', from: p.cid, d: m.d });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (p.snake && p.snake.alive) kill(p.snake, null);
    players.delete(p.cid);
  });
});
setInterval(() => { for (const p of players.values()) p.msgCount = 0; }, 1000);

// ---------------------------------------------------------------- tick
let tickNo = 0;
function tick() {
  tickNo++;
  for (const s of snakes.values()) if (s.isBot) botThink(s);
  for (const s of snakes.values()) step(s);

  // eat
  for (const s of snakes.values()) {
    const h = s.segs[0];
    forFoodNear(h.x, h.y, s.r + 30, f => {
      const rr = s.r + foodRadius(f.v) + 10;
      if ((f.x - h.x) ** 2 + (f.y - h.y) ** 2 < rr * rr) { s.score += f.v; removeFood(f); }
    });
  }

  // collisions
  buildSegGrid();
  const deaths = [];
  for (const s of snakes.values()) {
    const h = s.segs[0];
    if (Math.hypot(h.x, h.y) > WORLD_R - s.r * 0.5) { deaths.push([s, null]); continue; }
    let killer = null;
    forSegsNear(h.x, h.y, s.r + 50, (o, i) => {
      if (o === s) return false;
      const p = o.segs[i], rr = (s.r + o.r) * 0.72;
      if ((p.x - h.x) ** 2 + (p.y - h.y) ** 2 < rr * rr) { killer = o; return true; }
      return false;
    });
    if (killer) deaths.push([s, killer]);
  }
  for (const [s, k] of deaths) kill(s, k);

  // world upkeep
  if (food.size < FOOD_TARGET) spawnRandomFood(Math.min(25, FOOD_TARGET - food.size));
  for (let i = botRespawns.length - 1; i >= 0; i--) if (botRespawns[i] <= tickNo) { botRespawns.splice(i, 1); spawnBot(); }
  if (tickNo % TICK_RATE === 0) {
    manageBots(); sweepFood();
    // drop feasts that are old or eaten
    for (let i = feasts.length - 1; i >= 0; i--) {
      const F = feasts[i]; let left = 0;
      if (F.until > tickNo) forFoodNear(F.x, F.y, 120, f => { if ((f.x - F.x) ** 2 + (f.y - F.y) ** 2 < 14400) left += f.v; });
      if (left < 3) feasts.splice(i, 1);
    }
  }

  broadcast();
}

function broadcast() {
  try { broadcastInner(); } finally { deathsThisTick.length = 0; }
}
function broadcastInner() {
  const sendLb = tickNo % 15 === 0;
  let lb = null, ranked = null, mm = null;
  if (sendLb) {
    ranked = [...snakes.values()].sort((a, b) => b.score - a.score);
    lb = ranked.slice(0, 10).map(s => [s.name, Math.floor(s.score), s.player ? s.player.cid : 0]);
    mm = [];
    for (const s of snakes.values()) mm.push(Math.round(s.segs[0].x / WORLD_R * 100), Math.round(s.segs[0].y / WORLD_R * 100), s.player ? 1 : 0);
  }

  for (const p of players.values()) {
    if (p.ws.readyState !== 1) continue;
    const me = p.snake;
    if (me && me.alive) p.cam = { x: me.segs[0].x, y: me.segs[0].y };
    const vr = BASE_VIEW * (me ? 1 + (me.r - 10) / 40 : 1.1);
    const cx = p.cam.x, cy = p.cam.y;

    // snakes
    const out = [];
    const seen = new Set();
    for (const o of snakes.values()) {
      const [a, b, c, d] = o.bbox;
      const nx = clamp(cx, a, c), ny = clamp(cy, b, d);
      if ((nx - cx) ** 2 + (ny - cy) ** 2 > vr * vr) continue;
      seen.add(o.id);
      const h = o.segs[0];
      const e = { i: o.id, x: r1(h.x), y: r1(h.y), a: r2(o.angle), r: r2(o.r), n: o.segs.length, b: o.boosting ? 1 : 0, v: o.player && o.player.voice ? 1 : 0 };
      if (!p.known.has(o.id) || (tickNo + o.id) % KEYFRAME_EVERY === 0) {
        const flat = new Array(o.segs.length * 2);
        for (let i = 0; i < o.segs.length; i++) { flat[i * 2] = r1(o.segs[i].x); flat[i * 2 + 1] = r1(o.segs[i].y); }
        e.s = flat; e.nm = o.name; e.h = o.hue; e.k = o.skin; e.c = o.player ? o.player.cid : 0;
      }
      out.push(e);
    }
    const dd = deathsThisTick.filter(id => p.known.has(id));
    p.known = seen;

    // food diff
    const vis = new Set(), fa = [];
    forFoodNear(cx, cy, vr, f => {
      vis.add(f.id);
      if (!p.foodKnown.has(f.id)) fa.push(f.id, Math.round(f.x), Math.round(f.y), f.v, f.h);
    });
    const fr = [];
    for (const id of p.foodKnown) if (!vis.has(id)) fr.push(id);
    p.foodKnown = vis;

    const msg = { t: 'st', s: out, cx: r1(cx), cy: r1(cy) };
    if (dd.length) msg.dd = dd;
    if (fa.length) msg.fa = fa;
    if (fr.length) msg.fr = fr;
    if (sendLb) {
      msg.lb = lb; msg.mm = mm; msg.tot = ranked.length;
      if (me) msg.rk = ranked.indexOf(me) + 1;
    }
    p.ws.send(JSON.stringify(msg));
  }
}

// ---------------------------------------------------------------- boot
spawnRandomFood(FOOD_TARGET);
for (let i = 0; i < wantedBots(); i++) spawnBot();
setInterval(tick, 1000 / TICK_RATE);
server.listen(PORT, () => console.log(`yapsnake running on http://localhost:${PORT}`));
