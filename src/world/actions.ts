// Player/world actions: move (shared clock + fog + vigor), harvest, arrive-home, and the rival
// clock tick. Mutates Game state and returns small result objects + queues toasts for the UI.
import { Game } from '../state.js';
import { RNG, hashSeed } from '../rng.js';
import { within, chebyshev, inBounds, type Cell } from '../grid.js';
import { tileAt, passable, type World } from './worldgen.js';
import { rivalFire, keepSunk } from '../sim/battleship.js';
import {
  BANDS, bandFor, BASE_POS, LANTERN_RADIUS, LANTERN_HARVEST, HARVEST_VIGOR,
  SALTERN_INCOME, DIFFICULTY, RES_META, emptyResources,
} from '../config.js';
import type { ResourceKind, Tile } from '../types.js';

const EXHAUST_HP = 2;

export function toast(msg: string): void { Game.toastQueue.push(msg); }

export function distToBase(col: number, row: number): number {
  return chebyshev({ col, row }, BASE_POS);
}
export function bandAt(col: number, row: number) { return bandFor(distToBase(col, row)); }

export function revealAround(world: World, col: number, row: number): void {
  const tier = Game.run?.hero.gear.lantern ?? 0;
  const radius = LANTERN_RADIUS[tier] ?? 1;
  for (const c of within(col, row, radius, world.w, world.h)) tileAt(world, c.col, c.row).revealed = true;
}

export interface MoveOutcome {
  moved: boolean;
  encounter: Tile | null;      // creature tile blocking the step
  arrivedBase: boolean;
  downed: boolean;
}

const DELTA: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Attempt a step. If the target holds a creature, return an encounter (caller opens combat) and
// DON'T move yet. Otherwise move in.
export function tryMove(dir: keyof typeof DELTA): MoveOutcome {
  const run = Game.run, world = Game.world;
  const none: MoveOutcome = { moved: false, encounter: null, arrivedBase: false, downed: false };
  if (!run || !world || run.phase !== 'explore') return none;
  const [dc, dr] = DELTA[dir];
  const nc = run.hero.col + dc, nr = run.hero.row + dr;
  if (!inBounds(nc, nr, world.w, world.h) || !passable(world, nc, nr)) return none;
  const t = tileAt(world, nc, nr);
  if (t.creature) return { moved: false, encounter: t, arrivedBase: false, downed: false };
  return moveInto(nc, nr);
}

// Commit a move into an (already creature-free) tile.
export function moveInto(nc: number, nr: number): MoveOutcome {
  const run = Game.run!, world = Game.world!;
  Game.anim.heroFrom = { col: run.hero.col, row: run.hero.row };
  Game.anim.t = 0;
  run.hero.col = nc; run.hero.row = nr;

  // Deep travel costs Vigor (per the band you step INTO): the Reach/Saltmaw drain your budget so a
  // deep run trades reach for haul and you can't loiter in lethal water. The Shoals/Marsh stay free.
  const step = bandFor(distToBase(nc, nr)).vigorStep;
  if (step > 0) run.hero.vigor = Math.max(0, run.hero.vigor - step);
  run.step++;
  revealAround(world, nc, nr);

  let downed = false;
  if (run.hero.hp <= 0) { onDowned(); downed = true; }

  const arrivedBase = nc === BASE_POS.col && nr === BASE_POS.row;
  if (arrivedBase && !downed) onArriveBase();
  return { moved: true, encounter: null, arrivedBase, downed };
}

// Harvest the node on the hero's tile. Returns yielded amount (null if nothing / out of vigor).
export function harvest(): { kind: ResourceKind; amount: number } | null {
  const run = Game.run!, world = Game.world!;
  const t = tileAt(world, run.hero.col, run.hero.row);
  if (!t.node) return null;
  if (run.hero.vigor < HARVEST_VIGOR) { toast('Out of Vigor — head home to rest.'); return null; }
  run.hero.vigor -= HARVEST_VIGOR;
  const kind = t.node.kind;
  // Nodes are RENEWABLE taps — the land keeps giving; Vigor (actions/trip) is the real throttle,
  // so a compact map never strip-mines into a dead end. Firesalt is scarcer than bulk materials.
  const hits = LANTERN_HARVEST[run.hero.gear.lantern] ?? 1;
  const base = kind === 'firesalt' ? 1 : 2;
  const got = base * hits;
  grant(kind, got);
  run.step++;
  return { kind, amount: got };
}

export function grant(kind: ResourceKind, amount: number): void {
  const run = Game.run!;
  const before = run.resources[kind];
  run.resources[kind] = Math.min(run.storageCap, run.resources[kind] + amount);
  // track the unbanked haul (what actually landed, after the cap) so a deep wipe can forfeit it
  if (run.haul) run.haul[kind] += run.resources[kind] - before;
}

// Picking up a loot cache on the current tile.
export function grabLoot(): { kind: ResourceKind; amount: number } | null {
  const run = Game.run!, world = Game.world!;
  const t = tileAt(world, run.hero.col, run.hero.row);
  if (!t.loot) return null;
  const kind = t.loot; const amount = 3 + Math.floor(bandAt(run.hero.col, run.hero.row).id * 1.5);
  grant(kind, amount); t.loot = null;
  return { kind, amount };
}

function onArriveBase(): void {
  const run = Game.run!;
  // the haul is banked the instant you reach home — safe from here on
  resetHaul();
  run.hero.vigor = run.hero.maxVigor;
  const income = SALTERN_INCOME[run.buildings.saltern] ?? 0;
  if (income > 0) { grant('salt', income); toast(`Home. Saltern yields ${income} Salt. Vigor restored.`); }
  else toast('Home. Vigor restored.');
  rivalReturnTurn();
}

// The rival's clock — advances once per expedition (homecoming). Once armed it shells your hidden
// grid here too, so a turtle who never strikes still loses.
function rivalReturnTurn(): void {
  const run = Game.run!;
  const d = DIFFICULTY[run.difficulty];
  run.rival.menace = Math.min(100, run.rival.menace + d.menacePerExpedition);
  telegraph();
  if (!run.rival.canFire && run.rival.menace >= d.fireThreshold) {
    run.rival.canFire = true;
    toast('Their guns now range your shores. Fortify, and strike first.');
  }
  if (run.rival.canFire && Game.mine) {
    const shots = (run.difficulty >= 2 ? 2 : 1) + (run.rival.menace >= 85 ? 1 : 0);
    const rng = new RNG(hashSeed(run.seed, 0xF14e ^ run.step));
    for (let i = 0; i < shots; i++) {
      const shot = rivalFire(Game.mine, run.difficulty, rng);
      if (shot?.hit) toast(shot.sunk ? `The rival's salvo sinks your ${shot.sunk.kind}!` : 'A rival salvo scores a hit on your hold.');
      if (shot?.wonForRival || keepSunk(Game.mine)) { loseRun(); return; }
    }
  }
}

export function forceDowned(): void { onDowned(); }

function resetHaul(): void {
  const run = Game.run!;
  run.haul = emptyResources();
}

function onDowned(): void {
  const run = Game.run!;
  run.hero.col = BASE_POS.col; run.hero.row = BASE_POS.row;
  run.hero.hp = Math.max(1, Math.round(run.hero.maxHp * 0.5));
  run.hero.vigor = run.hero.maxVigor;
  // REAL setback: everything you gathered this expedition is lost where you fell — only what you
  // already carried home is safe. Going down deep with a heavy unbanked haul genuinely hurts.
  const haul = run.haul ?? emptyResources();
  const parts: string[] = [];
  (Object.keys(haul) as ResourceKind[]).forEach((kk) => {
    const drop = Math.min(run.resources[kk], haul[kk]);
    if (drop > 0) { run.resources[kk] -= drop; parts.push(`${drop} ${RES_META[kk].name}`); }
  });
  resetHaul();
  toast(parts.length
    ? `You were overcome and dragged home. Your haul is lost: ${parts.join(', ')}.`
    : 'You were overcome and dragged home — but carried nothing to lose.');
}

// ---- rival clock (telegraphs) --------------------------------------------------------------
function telegraph(): void {
  const run = Game.run!;
  const marks: Array<[number, string]> = [
    [25, 'Smoke rises across the strait — the rival is building.'],
    [50, 'Their forges are smoking. Cannons are being cast.'],
    [75, 'Scouts have mapped the shoals. Their fire is finding its range.'],
    [100, 'The rival is fully armed. End this now.'],
  ];
  for (const [thr, msg] of marks) {
    if (run.rival.menace >= thr && run.rival.lastTelegraph < thr) { run.rival.lastTelegraph = thr; toast(msg); }
  }
}

export function loseRun(): void {
  const run = Game.run!;
  if (run.over) return;
  run.over = true; run.result = 'lost'; run.phase = 'lost';
}
export function winRun(): void {
  const run = Game.run!;
  if (run.over) return;
  run.over = true; run.result = 'won'; run.phase = 'won';
}
