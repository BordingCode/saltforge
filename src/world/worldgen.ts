// Seeded world generation. Builds the tile grid: terrain, danger bands (by distance from base),
// resource nodes, creatures, and loot caches. Deterministic from the run seed so a daily/shared
// seed reproduces the whole map. Guarantees a passable path from base toward the deep (verified
// in the headless harness).
import { RNG, hashSeed } from '../rng.js';
import { chebyshev, inBounds, neighbours4, type Cell } from '../grid.js';
import { WORLD_W, WORLD_H, BASE_POS, RIVAL_POS, BANDS, bandFor } from '../config.js';
import { CREATURES_BY_BAND, makeCreature } from '../data/creatures.js';
import type { Tile, ResourceKind } from '../types.js';

export interface World {
  w: number;
  h: number;
  tiles: Tile[]; // row-major, length w*h
  base: Cell;
  rival: Cell;
}

export const idx = (w: World, c: number, r: number): number => r * w.w + c;
export const tileAt = (w: World, c: number, r: number): Tile => w.tiles[r * w.w + c];

function distToBase(c: number, r: number): number {
  return chebyshev({ col: c, row: r }, BASE_POS);
}

export function generateWorld(seed: number): World {
  const rng = new RNG(hashSeed(seed, 0x5a17));
  const w = WORLD_W, h = WORLD_H;
  const tiles: Tile[] = new Array(w * h);

  // 1) terrain + bands
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const dist = distToBase(c, r);
      const band = bandFor(dist).id;
      let terrain: Tile['terrain'] = 'ground';
      // scattered rocks (impassable) for texture — never on base/rival, denser in deep bands
      const rockChance = 0.05 + band * 0.02;
      if (rng.chance(rockChance)) terrain = 'rock';
      tiles[r * w + c] = { col: c, row: r, band, terrain, revealed: false, node: null, creature: null, loot: null };
    }
  }
  // base + rival anchors are clear ground
  tiles[BASE_POS.row * w + BASE_POS.col].terrain = 'base';
  tiles[BASE_POS.row * w + BASE_POS.col].band = 0;
  tiles[RIVAL_POS.row * w + RIVAL_POS.col].terrain = 'ground';
  for (const n of neighbours4(BASE_POS.col, BASE_POS.row, w, h)) tiles[n.row * w + n.col].terrain = 'ground';

  const world: World = { w, h, tiles, base: { ...BASE_POS }, rival: { ...RIVAL_POS } };

  // 2) carve a guaranteed corridor from base to rival so the world is always traversable
  const corridor = carveCorridor(world, BASE_POS, RIVAL_POS);

  // 3) nodes + creatures + loot per band rules
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const t = tiles[r * w + c];
      if (t.terrain !== 'ground') continue;
      if (c === BASE_POS.col && r === BASE_POS.row) continue;
      const dist = distToBase(c, r);
      const band = bandFor(dist);
      // keep only the immediate base tile + ring clear (else the whole Shoals would be node-free)
      const nearBase = dist <= 1;
      if (!nearBase && rng.chance(band.nodeChance)) {
        const kind = rng.pick(band.yields) as ResourceKind;
        const amount = rng.int(band.nodeAmount[0], band.nodeAmount[1]);
        t.node = { kind, amount, hp: Math.max(1, Math.ceil(amount / 2)) };
      } else if (!nearBase && rng.chance(band.creatureChance)) {
        const pool = CREATURES_BY_BAND[band.creatureBand];
        if (pool.length) t.creature = makeCreature(rng.pick(pool));
      } else if (!nearBase && rng.chance(0.04)) {
        // a loot cache — one-time bonus of a band-appropriate resource
        t.loot = rng.pick(band.yields) as ResourceKind;
      }
    }
  }

  // 3.5) GUARANTEE a reachable supply line: stamp Firesalt on a few Saltmaw corridor cells (the
  // corridor is creature-cleared and reachable from base), so no map can wall off the ammo.
  let fsPlaced = 0;
  for (const cell of corridor) {
    if (fsPlaced >= 4) break;
    if (cell.col === RIVAL_POS.col && cell.row === RIVAL_POS.row) continue;
    if (bandFor(distToBase(cell.col, cell.row)).id !== 4) continue;
    const t = tileAt(world, cell.col, cell.row);
    t.creature = null;
    t.node = { kind: 'firesalt', amount: 5, hp: 1 };
    fsPlaced++;
  }

  // 4) reveal the base ring at the start
  for (const n of [BASE_POS, ...neighbours4(BASE_POS.col, BASE_POS.row, w, h)]) {
    const t = tiles[n.row * w + n.col];
    t.revealed = true;
  }
  return world;
}

// Bresenham-ish corridor: clear rocks/creatures along a line so there is always a way through.
function carveCorridor(world: World, a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  let { col: c, row: r } = a;
  const stepC = Math.sign(b.col - a.col), stepR = Math.sign(b.row - a.row);
  let guard = 0;
  while ((c !== b.col || r !== b.row) && guard++ < world.w * world.h) {
    if (Math.abs(b.col - c) >= Math.abs(b.row - r) && c !== b.col) c += stepC;
    else if (r !== b.row) r += stepR;
    else c += stepC;
    if (!inBounds(c, r, world.w, world.h)) break;
    const t = tileAt(world, c, r);
    if (t.terrain === 'rock') t.terrain = 'ground';
    t.creature = null;
    cells.push({ col: c, row: r });
    // widen the safe lane: clear creatures off the immediate neighbours too, so the deep is
    // approachable by a careful (unarmoured) hero instead of walled off by ambushers
    for (const n of neighbours4(c, r, world.w, world.h)) {
      const nt = tileAt(world, n.col, n.row);
      if (nt.terrain === 'rock') nt.terrain = 'ground';
      nt.creature = null;
    }
  }
  return cells;
}

export function passable(world: World, c: number, r: number): boolean {
  if (!inBounds(c, r, world.w, world.h)) return false;
  return tileAt(world, c, r).terrain !== 'rock' && tileAt(world, c, r).terrain !== 'water';
}
