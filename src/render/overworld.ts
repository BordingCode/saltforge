// Draws the fog overworld to canvas from Game state. Pure draw — reads state, never mutates it.
import { Game } from '../state.js';
import { type View, centerOn, worldToScreenX, worldToScreenY } from '../engine/canvas.js';
import { tileAt } from '../world/worldgen.js';
import { BANDS, RES_META } from '../config.js';
import { CREATURE_SHAPE, CREATURE_ACCENT } from '../data/creatures.js';

export function drawOverworld(view: View): void {
  const run = Game.run, world = Game.world;
  const { ctx } = view;
  ctx.clearRect(0, 0, view.w, view.h);
  if (!run || !world) return;

  // animated hero position (lerp from anim.heroFrom)
  const a = Game.anim;
  const ease = a.heroFrom ? Math.min(1, a.t) : 1;
  const e = ease < 1 ? 1 - Math.pow(1 - ease, 3) : 1;
  const hx = a.heroFrom ? a.heroFrom.col + (run.hero.col - a.heroFrom.col) * e : run.hero.col;
  const hy = a.heroFrom ? a.heroFrom.row + (run.hero.row - a.heroFrom.row) * e : run.hero.row;

  centerOn(view, hx, hy, world.w, world.h);
  const ts = view.tile;

  // water backdrop
  ctx.fillStyle = '#0a1116';
  ctx.fillRect(0, 0, view.w, view.h);

  const c0 = Math.max(0, Math.floor(view.camX / ts) - 1);
  const r0 = Math.max(0, Math.floor(view.camY / ts) - 1);
  const c1 = Math.min(world.w - 1, Math.ceil((view.camX + view.w) / ts));
  const r1 = Math.min(world.h - 1, Math.ceil((view.camY + view.h) / ts));

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const t = tileAt(world, c, r);
      const x = worldToScreenX(view, c), y = worldToScreenY(view, r);
      if (!t.revealed) { drawFog(ctx, x, y, ts); continue; }
      drawTile(ctx, t, x, y, ts);
    }
  }

  // adjacency hints (where you can step)
  const adj = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dc, dr] of adj) {
    const nc = run.hero.col + dc, nr = run.hero.row + dr;
    if (nc < 0 || nr < 0 || nc >= world.w || nr >= world.h) continue;
    const t = tileAt(world, nc, nr);
    if (t.terrain === 'rock' || t.terrain === 'water') continue;
    const x = worldToScreenX(view, nc), y = worldToScreenY(view, nr);
    ctx.strokeStyle = 'rgba(127,224,210,0.5)'; ctx.lineWidth = 2;
    roundRect(ctx, x + 3, y + 3, ts - 6, ts - 6, 7); ctx.stroke();
  }

  drawHero(ctx, worldToScreenX(view, hx), worldToScreenY(view, hy), ts);
}

function drawFog(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number): void {
  ctx.fillStyle = '#0c1418';
  ctx.fillRect(x, y, ts, ts);
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
}

function drawTile(ctx: CanvasRenderingContext2D, t: any, x: number, y: number, ts: number): void {
  const band = BANDS[Math.max(0, t.band - 1)] ?? BANDS[0];
  let fill = t.band === 0 ? '#243a44' : band.tint;
  if (t.terrain === 'rock') fill = '#2a2f33';
  if (t.terrain === 'base') fill = '#3a4d57';
  ctx.fillStyle = fill;
  roundRect(ctx, x + 1, y + 1, ts - 2, ts - 2, 6); ctx.fill();

  if (t.terrain === 'rock') { drawRock(ctx, x, y, ts); return; }
  if (t.terrain === 'base') { drawBase(ctx, x, y, ts); return; }
  if (t.node) drawNode(ctx, t.node.kind, x, y, ts);
  else if (t.creature) drawCreature(ctx, t.creature, x, y, ts);
  else if (t.loot) drawLoot(ctx, x, y, ts);
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number): void {
  ctx.fillStyle = '#3c4248';
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.3, y + ts * 0.7);
  ctx.lineTo(x + ts * 0.45, y + ts * 0.35);
  ctx.lineTo(x + ts * 0.62, y + ts * 0.5);
  ctx.lineTo(x + ts * 0.72, y + ts * 0.72);
  ctx.closePath(); ctx.fill();
}

function drawBase(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number): void {
  const cx = x + ts / 2, m = ts * 0.18;
  ctx.fillStyle = '#e8b84b';
  ctx.fillRect(x + m, y + ts * 0.42, ts - 2 * m, ts * 0.4);
  // battlements
  ctx.fillRect(x + m, y + ts * 0.34, ts * 0.16, ts * 0.12);
  ctx.fillRect(cx - ts * 0.08, y + ts * 0.34, ts * 0.16, ts * 0.12);
  ctx.fillRect(x + ts - m - ts * 0.16, y + ts * 0.34, ts * 0.16, ts * 0.12);
  ctx.fillStyle = '#7fe0d2';
  ctx.fillRect(cx - ts * 0.04, y + ts * 0.5, ts * 0.08, ts * 0.18);
}

function drawNode(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, ts: number): void {
  const meta = (RES_META as any)[kind];
  const cx = x + ts / 2, cy = y + ts / 2, r = ts * 0.2;
  ctx.fillStyle = meta.color;
  if (kind === 'timber') { ctx.fillRect(cx - r, cy - r * 1.2, r * 2, r * 2.4); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(cx - r, cy - 1, r * 2, 2); }
  else if (kind === 'firesalt') { star(ctx, cx, cy, r * 1.3, r * 0.5, 5); ctx.fillStyle = meta.color; ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); }
}

function drawLoot(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number): void {
  const cx = x + ts / 2, cy = y + ts / 2, r = ts * 0.18;
  ctx.fillStyle = '#caa86a';
  roundRect(ctx, cx - r, cy - r * 0.7, r * 2, r * 1.4, 3); ctx.fill();
  ctx.fillStyle = '#7fe0d2'; ctx.fillRect(cx - r, cy - 1, r * 2, 2);
}

function drawCreature(ctx: CanvasRenderingContext2D, cr: any, x: number, y: number, ts: number): void {
  const shape = CREATURE_SHAPE[cr.defId] ?? 'brute';
  const col = CREATURE_ACCENT[cr.defId] ?? '#c66';
  const cx = x + ts / 2, cy = y + ts / 2, r = ts * 0.26;
  ctx.fillStyle = col;
  if (shape === 'wisp') { ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  else if (shape === 'serpent') { ctx.beginPath(); ctx.moveTo(cx - r, cy + r * 0.4); ctx.quadraticCurveTo(cx, cy - r, cx + r, cy + r * 0.4); ctx.lineWidth = r * 0.5; ctx.strokeStyle = col; ctx.stroke(); }
  else if (shape === 'crab') { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - r * 1.1, cy - 2, r * 0.5, 4); ctx.fillRect(cx + r * 0.6, cy - 2, r * 0.5, 4); }
  else if (shape === 'maw') { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a0d0a'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.fill(); }
  else { roundRect(ctx, cx - r, cy - r, r * 2, r * 2, 5); ctx.fill(); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(cx - r * 0.5, cy - r * 0.3, r * 0.3, r * 0.3); ctx.fillRect(cx + r * 0.2, cy - r * 0.3, r * 0.3, r * 0.3); }
  // health pip
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - r, y + ts - 6, r * 2, 3);
  ctx.fillStyle = '#ff6b6b'; ctx.fillRect(cx - r, y + ts - 6, r * 2 * (cr.hp / cr.maxHp), 3);
}

function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number): void {
  const cx = x + ts / 2, cy = y + ts / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.28, ts * 0.22, ts * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4e9d0'; ctx.beginPath(); ctx.arc(cx, cy - ts * 0.16, ts * 0.12, 0, Math.PI * 2); ctx.fill(); // head
  ctx.fillStyle = '#2f6f78'; roundRect(ctx, cx - ts * 0.14, cy - ts * 0.04, ts * 0.28, ts * 0.3, 4); ctx.fill(); // body
  ctx.strokeStyle = '#e8b84b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + ts * 0.16, cy - ts * 0.1); ctx.lineTo(cx + ts * 0.16, cy + ts * 0.2); ctx.stroke(); // tool
}

// ---- small canvas helpers ------------------------------------------------------------------
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}
