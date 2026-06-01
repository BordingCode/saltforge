// Headless harness — runs the PURE sim modules (no DOM) to verify the two riskiest systems:
//  1. World gen is always traversable base->rival, banded, with Firesalt only deep.
//  2. Battleship is DEDUCTION, not luck: a solver using scan tiers sinks the enemy Keep in far
//     fewer shots with better scouting, and is always solvable well under a full 64-cell sweep.
// Run: node test/run.mjs   (after `npx tsc`)
import { RNG, seedFromString, hashSeed } from '../js/rng.js';
import { bfsDistance } from '../js/grid.js';
import { generateWorld, tileAt, passable } from '../js/world/worldgen.js';
import { BANDS, BS_GRID } from '../js/config.js';
import {
  makeEnemyGrid, makeMyGrid, playerFire, scanLine, scanAnchor, scanHotCold,
  rivalFire, keepSunk, isSunk,
} from '../js/sim/battleship.js';

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); } };
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// ============================ 1. WORLD ============================
console.log('\n=== WORLD GENERATION ===');
{
  const seeds = ['salt-1', 'salt-2', 'deep', 'frontier', 'abcd', 'zzz', 'rival', 'tide'].map(seedFromString);
  let allReach = true, allBands = true, firesaltDeepOnly = true, firesaltExists = true;
  for (const s of seeds) {
    const w = generateWorld(s);
    const d = bfsDistance(w.base, w.rival, (c, r) => passable(w, c, r), w.w, w.h);
    if (d < 0) allReach = false;
    const bandsSeen = new Set();
    let fsDeep = 0, fsShallow = 0;
    for (let r = 0; r < w.h; r++) for (let c = 0; c < w.w; c++) {
      const t = tileAt(w, c, r);
      bandsSeen.add(t.band);
      if (t.node && t.node.kind === 'firesalt') { if (t.band === 4) fsDeep++; else fsShallow++; }
    }
    if (![1, 2, 3, 4].every((b) => bandsSeen.has(b))) allBands = false;
    if (fsShallow > 0) firesaltDeepOnly = false;
    if (fsDeep === 0) firesaltExists = false;
  }
  ok('every map is traversable base → rival', allReach);
  ok('every map contains all 4 danger bands', allBands);
  ok('Firesalt spawns (in the deep)', firesaltExists);
  ok('Firesalt is Saltmaw-only (never shallow)', firesaltDeepOnly);
}

// ============================ 2. BATTLESHIP DEDUCTION ============================
console.log('\n=== BATTLESHIP: luck → deduction ===');

// A player solver: apply scan tier up-front, then fire by knowledge + probability density.
function solve(enemy, scanTier, rng) {
  if (scanTier >= 1) scanLine(enemy, rng);
  if (scanTier >= 3) scanAnchor(enemy, rng);
  let shots = 0;
  const fired = new Set();
  while (!keepSunk(enemy) && shots < 64) {
    // tier-2 hot/cold: query the current densest cell, mark the proven-empty ring
    if (scanTier >= 2 && shots === 0) {
      const probe = densest(enemy, fired);
      if (probe) {
        const [pc, pr] = probe.split(',').map(Number);
        const dd = scanHotCold(enemy, pc, pr);
        for (let r = 0; r < enemy.size; r++) for (let c = 0; c < enemy.size; c++) {
          if (Math.max(Math.abs(c - pc), Math.abs(r - pr)) < dd) enemy.knownEmpty.add(`${c},${r}`);
        }
      }
    }
    const cell = chooseShot(enemy, fired);
    if (!cell) break;
    const [c, r] = cell.split(',').map(Number);
    playerFire(enemy, c, r); fired.add(cell); shots++;
  }
  return shots;
}

function chooseShot(enemy, fired) {
  // target mode: extend around open hits on un-sunk structures
  const openHits = [];
  for (const s of enemy.structures) if (!isSunk(s)) for (const cell of s.cells) if (enemy.shots.has(cell)) openHits.push(cell);
  for (const h of openHits) {
    const [c, r] = h.split(',').map(Number);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = `${nc},${nr}`;
      if (nc < 0 || nr < 0 || nc >= enemy.size || nr >= enemy.size) continue;
      if (!enemy.shots.has(k) && !enemy.knownEmpty.has(k)) return k;
    }
  }
  // known ship cells from anchor scan not yet fired
  for (const k of enemy.knownShip) if (!enemy.shots.has(k)) return k;
  // density hunt
  return densest(enemy, fired);
}

function densest(enemy, fired) {
  const remaining = enemy.structures.filter((s) => !isSunk(s)).map((s) => s.len);
  const lens = remaining.length ? [...new Set(remaining)] : [2, 3];
  const map = new Map();
  for (const len of lens) {
    for (let r = 0; r < enemy.size; r++) for (let c = 0; c < enemy.size; c++) {
      for (const o of ['h', 'v']) {
        const cells = [];
        let okp = true;
        for (let i = 0; i < len; i++) {
          const cc = o === 'h' ? c + i : c, rr = o === 'v' ? r + i : r;
          if (cc >= enemy.size || rr >= enemy.size) { okp = false; break; }
          const k = `${cc},${rr}`;
          if (enemy.knownEmpty.has(k)) { okp = false; break; }
          cells.push(k);
        }
        if (!okp) continue;
        for (const k of cells) if (!enemy.shots.has(k)) map.set(k, (map.get(k) || 0) + 1);
      }
    }
  }
  let best = null, bv = -1;
  for (const [k, v] of map) if (v > bv) { bv = v; best = k; }
  return best;
}

{
  const N = 60;
  const byTier = [[], [], [], []];
  let alwaysSolved = true;
  for (let i = 0; i < N; i++) {
    const seed = hashSeed(seedFromString('bs'), i * 2654435761);
    for (let tier = 0; tier <= 3; tier++) {
      const enemy = makeEnemyGrid(seed, 2);
      const rng = new RNG(hashSeed(seed, 777 + tier));
      const shots = solve(enemy, tier, rng);
      if (!keepSunk(enemy)) alwaysSolved = false;
      byTier[tier].push(shots);
    }
  }
  const a = byTier.map(avg);
  ok('every game is solvable (Keep always sinkable)', alwaysSolved);
  ok('no scouting is meaningfully better than a full sweep', a[0] < 40, `~${a[0].toFixed(1)} shots avg (of 64)`);
  ok('scouting reduces shots-to-win (tier3 < tier0)', a[3] < a[0] - 2, `tier0 ${a[0].toFixed(1)} → tier3 ${a[3].toFixed(1)}`);
  ok('better scouting trends monotonic-ish', a[3] <= a[1] + 0.5, `${a.map((x) => x.toFixed(1)).join(' / ')}`);
  console.log(`     avg shots by scan tier: ${a.map((x) => x.toFixed(1)).join('  ')}`);
}

// ============================ 3. RIVAL FIRE AI ============================
console.log('\n=== RIVAL FIRE AI (fair, difficulty-scaled) ===');
{
  const N = 60;
  function rivalShotsToSinkKeep(seed, difficulty) {
    const mine = makeMyGrid(seed);
    const rng = new RNG(hashSeed(seed, 9001 + difficulty));
    let shots = 0;
    while (!keepSunk(mine) && shots < 64) { rivalFire(mine, difficulty, rng); shots++; }
    return shots;
  }
  const d1 = [], d3 = [];
  for (let i = 0; i < N; i++) {
    const seed = hashSeed(seedFromString('rv'), i * 40503);
    d1.push(rivalShotsToSinkKeep(seed, 1));
    d3.push(rivalShotsToSinkKeep(seed, 3));
  }
  ok('Brutal rival is sharper than Calm (fewer shots to sink)', avg(d3) < avg(d1), `calm ${avg(d1).toFixed(1)} vs brutal ${avg(d3).toFixed(1)}`);
  ok('even Brutal is not a sure-thing sweep (player has time)', avg(d3) > 12, `brutal avg ${avg(d3).toFixed(1)} shots`);
}

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED: ' + fails.join(', ')}  (${pass} passed, ${fail} failed)\n`);
process.exit(fail ? 1 : 0);
