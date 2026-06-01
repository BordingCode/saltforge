// Full-run pacing harness — a "player bot" drives the REAL game code (newRun + the same movement,
// economy, combat and salvo functions the UI calls) with a sensible human strategy, across many
// seeds x difficulties. Reports win-rate and the pacing milestones we tune against.
// Run: node test/playthrough.mjs   (after `npx tsc`)
import { Game, newRun } from '../js/state.js';
import { RNG, hashSeed, seedFromString } from '../js/rng.js';
import { moveInto, harvest, grabLoot, grant, distToBase, bandAt } from '../js/world/actions.js';
import { tileAt, passable } from '../js/world/worldgen.js';
import { neighbours4 } from '../js/grid.js';
import { upgradeBuilding, craftGear, nextBuildingCost, nextGearCost, canAfford, meetsRequirements } from '../js/economy.js';
import { exchange, flee } from '../js/sim/combat.js';
import { playerFire, scanLine, scanAnchor, scanHotCold, rivalFire, keepSunk, isSunk } from '../js/sim/battleship.js';
import { WEAPON_ATK, ARMOR_DEF, BANDS, CANNON_SHOTS, RIVAL_POS, BASE_POS } from '../js/config.js';

const CAP = 4000;
const k = (c, r) => `${c},${r}`;

// ---- bot helpers ---------------------------------------------------------------------------
function safeMaxDist() {
  const at = Game.run.hero.gear.armor;
  const targetBand = Math.max(1, Math.min(4, at + 1));
  return targetBand >= 4 ? 40 : BANDS[targetBand].minDist - 1; // stay within the gear-safe band
}
function canBeat(creature) {
  const r = Game.run.hero;
  const dmg = Math.max(1, WEAPON_ATK[r.gear.weapon] - creature.def);
  const taken = Math.max(1, creature.atk - ARMOR_DEF[r.gear.armor]);
  const hits = Math.ceil(creature.hp / dmg);
  return taken * (hits - 1) < r.hp * 0.7 && r.vigor >= hits;
}
// BFS next step from hero toward goal over passable tiles, avoiding `blocked` cells.
function stepToward(goal, blocked) {
  const w = Game.world, start = { col: Game.run.hero.col, row: Game.run.hero.row };
  if (start.col === goal.col && start.row === goal.row) return null;
  const prev = new Map(); const seen = new Set([k(start.col, start.row)]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      for (const n of neighbours4(cur.col, cur.row, w.w, w.h)) {
        const key = k(n.col, n.row);
        if (seen.has(key) || !passable(w, n.col, n.row)) continue;
        if (blocked.has(key) && !(n.col === goal.col && n.row === goal.row)) continue;
        seen.add(key); prev.set(key, cur);
        if (n.col === goal.col && n.row === goal.row) {
          let node = n; while (prev.get(k(node.col, node.row)) && !(prev.get(k(node.col, node.row)).col === start.col && prev.get(k(node.col, node.row)).row === start.row)) node = prev.get(k(node.col, node.row));
          return node;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}
// how deep the bot dares venture, by armour tier (don't take a naked hero into the Saltmaw)
function ventureMaxDist() {
  const vBand = Math.min(4, Game.run.hero.gear.armor + 3); // only a fully-naked hero is kept shallow
  return vBand >= 4 ? 99 : BANDS[vBand].minDist - 1;
}
// nearest REACHABLE wanted node within the venture range (skips ones walled off by tough creatures)
function nearestWantedNode(blocked, maxDist) {
  const w = Game.world;
  const need = wantedResources();
  const cands = [];
  for (let r = 0; r < w.h; r++) for (let c = 0; c < w.w; c++) {
    const t = tileAt(w, c, r);
    if (!t.revealed || !t.node || t.node.amount <= 0) continue;
    if (!need.has(t.node.kind)) continue;
    if (distToBase(c, r) > maxDist) continue;
    const d = Math.abs(c - Game.run.hero.col) + Math.abs(r - Game.run.hero.row);
    cands.push({ col: c, row: r, d });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const cand of cands.slice(0, 8)) if (stepToward(cand, blocked)) return cand;
  return null;
}
// want only what we're short of — don't burn the Vigor budget topping up capped Salt
function wantedResources() {
  const R = Game.run.resources, g = Game.run.hero.gear;
  const want = new Set();
  if (R.salt < 22) want.add('salt');
  if (R.timber < 45) want.add('timber');
  if (R.iron < 45) want.add('iron');
  if (g.armor >= 2 && R.firesalt < 14) want.add('firesalt'); // brave the Saltmaw once armored
  return want;
}

// priority purchase list — buy the most valuable affordable thing each base visit
// Buy ONE level of each priority each pass (so investment spreads instead of maxing the first
// building). Forge + gear first; the salt-only Saltern is lowest value (Salt rarely the wall).
function shop() {
  const order = [
    ['b', 'forge'], ['g', 'weapon'], ['g', 'armor'],
    ['b', 'cannon'], ['b', 'watchtower'], ['g', 'lantern'], ['b', 'bulwark'],
    ['b', 'saltern'], ['b', 'keep'],
  ];
  let progress = true;
  while (progress) {
    progress = false;
    for (const [kind, id] of order) {
      if (kind === 'b') {
        const cost = nextBuildingCost(id);
        if (cost && meetsRequirements(id) && canAfford(cost) && upgradeBuilding(id).ok) progress = true;
      } else {
        if (Game.run.buildings.forge < 1) continue;
        const cost = nextGearCost(id);
        if (cost && canAfford(cost) && craftGear(id).ok) progress = true;
      }
    }
  }
}

function shouldStrike() {
  const r = Game.run;
  if (r.buildings.cannon < 1) return false;
  if (r.resources.firesalt >= 6 && r.buildings.watchtower >= 1) return true;
  if (r.rival.menace >= 88 && r.resources.firesalt >= 2) return true; // desperate
  return false;
}

// ---- battleship solver (player) ------------------------------------------------------------
function densest(enemy) {
  const remaining = enemy.structures.filter((s) => !isSunk(s)).map((s) => s.len);
  const lens = remaining.length ? [...new Set(remaining)] : [2, 3];
  const map = new Map();
  for (const len of lens) for (let r = 0; r < enemy.size; r++) for (let c = 0; c < enemy.size; c++) for (const o of ['h', 'v']) {
    const cells = []; let ok = true;
    for (let i = 0; i < len; i++) { const cc = o === 'h' ? c + i : c, rr = o === 'v' ? r + i : r; if (cc >= enemy.size || rr >= enemy.size) { ok = false; break; } const key = k(cc, rr); if (enemy.knownEmpty.has(key)) { ok = false; break; } cells.push(key); }
    if (!ok) continue;
    for (const key of cells) if (!enemy.shots.has(key)) map.set(key, (map.get(key) || 0) + 1);
  }
  let best = null, bv = -1; for (const [key, v] of map) if (v > bv) { bv = v; best = key; }
  return best;
}
function chooseShot(enemy) {
  const openHits = [];
  for (const s of enemy.structures) if (!isSunk(s)) for (const cell of s.cells) if (enemy.shots.has(cell)) openHits.push(cell);
  for (const h of openHits) { const [c, r] = h.split(',').map(Number); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, key = k(nc, nr); if (nc < 0 || nr < 0 || nc >= enemy.size || nr >= enemy.size) continue; if (!enemy.shots.has(key) && !enemy.knownEmpty.has(key)) return key; } }
  for (const key of enemy.knownShip) if (!enemy.shots.has(key)) return key;
  return densest(enemy);
}
function runEndgame(seed) {
  const run = Game.run, enemy = Game.enemy, mine = Game.mine;
  let turn = 0;
  // scout up front with whatever the Watchtower allows (one scan per turn, but bulk it here)
  const rng = new RNG(hashSeed(seed, 4242));
  while (!run.over && run.resources.firesalt >= 1) {
    // a scan if affordable & useful (alternate tiers)
    if (run.buildings.watchtower >= 1 && run.resources.firesalt >= 2 && turn < 4) {
      const wt = run.buildings.watchtower;
      if (turn === 0 && wt >= 1) { run.resources.firesalt -= 1; scanLine(enemy, rng); }
      else if (turn === 1 && wt >= 3) { run.resources.firesalt -= 2; scanAnchor(enemy, rng); }
      else if (turn === 1 && wt >= 2) { run.resources.firesalt -= 1; const p = densest(enemy); if (p) { const [pc, pr] = p.split(',').map(Number); const d = scanHotCold(enemy, pc, pr); for (let r = 0; r < enemy.size; r++) for (let c = 0; c < enemy.size; c++) if (Math.max(Math.abs(c - pc), Math.abs(r - pr)) < d) enemy.knownEmpty.add(k(c, r)); } }
    }
    if (run.resources.firesalt < 1) break;
    run.resources.firesalt -= 1;
    let shots = CANNON_SHOTS[run.buildings.cannon] ?? 1;
    while (shots-- > 0 && !run.over) { const cell = chooseShot(enemy); if (!cell) break; const [c, r] = cell.split(',').map(Number); const res = playerFire(enemy, c, r); if (res.won) { run.over = true; run.result = 'won'; return; } }
    // rival returns fire
    const rshots = run.rival.menace >= 75 ? 2 : 1;
    for (let i = 0; i < rshots; i++) { const sh = rivalFire(mine, run.difficulty, new RNG(hashSeed(seed, (turn << 8) ^ i ^ 0x55))); if (sh?.wonForRival || keepSunk(mine)) { run.over = true; run.result = 'lost'; return; } }
    run.rival.menace = Math.min(100, run.rival.menace + 0.6);
    turn++;
    if (turn > 60) break;
  }
}

// ---- one full run --------------------------------------------------------------------------
function playRun(seedStr, difficulty, log = false) {
  const seed = seedFromString(seedStr);
  newRun(seedStr, difficulty);
  const run = Game.run;
  const milestones = { band4Step: 0, firstStrikeStep: 0, firstStrikeMenace: 0, expeditions: 0, maxDist: 0, nullSteps: 0, harvests: 0 };
  let returning = false;
  const blocked = new Set();

  let guard = 0;
  while (!run.over && guard++ < CAP) {
    const atBase = run.hero.col === BASE_POS.col && run.hero.row === BASE_POS.row;
    if (atBase) {
      shop(); blocked.clear(); returning = false; milestones.expeditions++;
      if (log && milestones.expeditions % 4 === 0) {
        const b = run.buildings, g = run.hero.gear, R = run.resources;
        const hd = Math.round(distToBase(run.hero.col, run.hero.row));
        console.log(`  exp${milestones.expeditions} step${run.step} | S${R.salt} T${R.timber} I${R.iron} F${R.firesalt} | forge${b.forge}salt${b.saltern}can${b.cannon}wt${b.watchtower}bul${b.bulwark} | wpn${g.weapon}arm${g.armor}lan${g.lantern}`);
      }
      if (shouldStrike()) {
        if (!milestones.firstStrikeStep) { milestones.firstStrikeStep = run.step; milestones.firstStrikeMenace = Math.round(run.rival.menace); }
        runEndgame(seed);
        if (run.over) break;
        continue; // gather more and retry
      }
    }

    const r = run.hero;
    if (run.over) break;
    // retreat when the extraction budget is spent or we're badly hurt
    if (r.vigor <= 1 || r.hp < r.maxHp * 0.35) returning = true;

    let target;
    if (returning) target = { col: BASE_POS.col, row: BASE_POS.row };
    else {
      const here = tileAt(Game.world, r.col, r.row);
      if (here.node && here.node.amount > 0 && wantedResources().has(here.node.kind)) {
        let did = false;
        while (here.node && r.vigor >= 1 && wantedResources().has(here.node.kind)) { if (!harvest()) break; did = true; milestones.harvests++; }
        if (here.loot) grabLoot();
        if (did) continue;
      }
      const vMax = ventureMaxDist();
      const node = nearestWantedNode(blocked, vMax);
      if (node) target = node;
      else if (distToBase(r.col, r.row) < vMax) target = { col: RIVAL_POS.col, row: RIVAL_POS.row }; // probe deeper within range
      else { returning = true; target = { col: BASE_POS.col, row: BASE_POS.row }; }
    }

    const next = stepToward(target, blocked);
    if (!next) { // stuck — bail to base or give up
      milestones.nullSteps++;
      if (!returning) { returning = true; continue; }
      break;
    }
    if (distToBase(next.col, next.row) > milestones.maxDist) milestones.maxDist = distToBase(next.col, next.row);
    const t = tileAt(Game.world, next.col, next.row);
    if (t.creature) {
      if (canBeat(t.creature)) {
        while (t.creature && t.creature.hp > 0 && run.hero.hp > 0 && run.hero.vigor > 0) {
          const ex = exchange(run.hero, t.creature);
          if (ex.creatureDead) { Object.entries(t.creature.bounty).forEach(([kk, v]) => grant(kk, v)); t.creature = null; }
          if (ex.heroDowned) break;
        }
        if (run.hero.hp <= 0) { /* moveInto handles downed on next step */ returning = true; }
        if (!t.creature) moveInto(next.col, next.row);
        else { blocked.add(k(next.col, next.row)); returning = true; }
      } else { blocked.add(k(next.col, next.row)); returning = true; }
    } else {
      moveInto(next.col, next.row);
    }

    if (run.hero.col === BASE_POS.col && run.hero.row === BASE_POS.row) returning = false;
    if (!milestones.band4Step && bandAt(run.hero.col, run.hero.row).id === 4) milestones.band4Step = run.step;
  }

  return {
    result: run.over ? run.result : 'timeout',
    steps: run.step,
    expeditions: milestones.expeditions,
    band4Step: milestones.band4Step,
    firstStrikeStep: milestones.firstStrikeStep,
    firstStrikeMenace: milestones.firstStrikeMenace,
    finalMenace: Math.round(run.rival.menace),
    gear: { ...run.hero.gear },
    buildings: { ...run.buildings },
    maxDist: milestones.maxDist,
    harvests: milestones.harvests,
    nullSteps: milestones.nullSteps,
  };
}

// ---- sweep ---------------------------------------------------------------------------------
const DIFFS = { 1: 'Calm', 2: 'Tense', 3: 'Brutal' };
const N = Number(process.env.N) || 24;
const OFF = Number(process.env.OFF) || 0;
console.log(`\n=== SALTFORGE FULL-RUN PACING (${N} seeds x 3 difficulties) ===\n`);
if (process.env.DBG) { const seed = process.env.SEED || 'run-5'; console.log(`--- trace: Calm ${seed} ---`); const r = playRun(seed, 1, true); console.log('  result:', r.result, 'steps', r.steps, 'maxDist', r.maxDist, 'harvests', r.harvests, 'nullSteps', r.nullSteps, '\n'); }
if (process.env.DBG2) {
  console.log('--- per-seed (Calm) ---');
  for (let i = 0; i < 24; i++) {
    const r = playRun('run-' + i, 1);
    const b = r.buildings, g = r.gear;
    console.log(`  run-${i}: ${r.result.padEnd(7)} saltmaw@${r.band4Step || '—'} strike@${r.firstStrikeStep || '—'} | wpn${g.weapon}arm${g.armor} can${b.cannon}wt${b.watchtower}bul${b.bulwark} exp${r.expeditions}`);
  }
  console.log('');
}
for (const d of [1, 2, 3]) {
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(playRun('run-' + (i + OFF), Number(d)));
  const wins = runs.filter((r) => r.result === 'won');
  const losses = runs.filter((r) => r.result === 'lost');
  const timeouts = runs.filter((r) => r.result === 'timeout');
  const avg = (a, f) => a.length ? (a.reduce((s, r) => s + f(r), 0) / a.length) : 0;
  console.log(`${DIFFS[d]}:  win ${wins.length}/${N} (${Math.round(wins.length / N * 100)}%)   loss ${losses.length}   timeout ${timeouts.length}`);
  console.log(`   avg steps ${avg(runs, (r) => r.steps).toFixed(0)} | expeditions ${avg(runs, (r) => r.expeditions).toFixed(1)} | first reach Saltmaw @step ${avg(runs.filter((r) => r.band4Step), (r) => r.band4Step).toFixed(0)} | first strike @step ${avg(runs.filter((r) => r.firstStrikeStep), (r) => r.firstStrikeStep).toFixed(0)} (menace ${avg(runs.filter((r) => r.firstStrikeStep), (r) => r.firstStrikeMenace).toFixed(0)}%)`);
  const reachedSaltmaw = runs.filter((r) => r.band4Step).length;
  const everStruck = runs.filter((r) => r.firstStrikeStep).length;
  console.log(`   reached Saltmaw: ${reachedSaltmaw}/${N} | ever struck: ${everStruck}/${N} | avg final menace ${avg(runs, (r) => r.finalMenace).toFixed(0)}%\n`);
}
console.log('(tuning targets: Calm ~75-90% win, Tense ~50-65%, Brutal ~25-40%; everyone reaches Saltmaw & gets to strike)\n');
