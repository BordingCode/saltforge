// The Battleship layer — pure, seeded, testable. Two hidden 8x8 grids of straight-line
// "structures" (one flagged as the Keep = the target). The player fires at the enemy grid and
// turns luck into deduction via Watchtower scans; the rival fires at the player's grid with a
// fair probability-density AI (+ honest, difficulty-scaled blunders). No DOM, no rendering.
import { RNG, hashSeed } from '../rng.js';
import { BS_GRID } from '../config.js';
import { DIFFICULTY } from '../config.js';
const k = (c, r) => `${c},${r}`;
const parse = (s) => { const [c, r] = s.split(',').map(Number); return [c, r]; };
// Standard fleet: the Keep (len 3, the target) + two secondary structures. Bulwark adds decoys
// to MY grid only (more cells for the rival to waste shots on).
const KEEP_LEN = 3;
const FLEET_BASE = [
    { kind: 'keep', len: KEEP_LEN },
    { kind: 'forge', len: 2 },
    { kind: 'wall', len: 2 },
];
function cellsFor(c, r, len, o) {
    const out = [];
    for (let i = 0; i < len; i++)
        out.push(o === 'h' ? k(c + i, r) : k(c, r + i));
    return out;
}
function placeFleet(rng, size, spec) {
    const occupied = new Set();
    const structures = [];
    let id = 0;
    for (const s of spec) {
        let placed = false;
        for (let tries = 0; tries < 400 && !placed; tries++) {
            const o = rng.chance(0.5) ? 'h' : 'v';
            const c = o === 'h' ? rng.int(0, size - s.len) : rng.int(0, size - 1);
            const r = o === 'v' ? rng.int(0, size - s.len) : rng.int(0, size - 1);
            const cells = cellsFor(c, r, s.len, o);
            // no overlap and no touching (keeps deduction clean) — check a 1-cell margin
            let ok = true;
            for (const cell of cells) {
                const [cc, rr] = parse(cell);
                for (let dc = -1; dc <= 1 && ok; dc++)
                    for (let dr = -1; dr <= 1; dr++) {
                        if (occupied.has(k(cc + dc, rr + dr))) {
                            ok = false;
                            break;
                        }
                    }
            }
            if (!ok)
                continue;
            cells.forEach((cell) => occupied.add(cell));
            structures.push({ id: `s${id++}`, kind: s.kind, len: s.len, col: c, row: r, orient: o, cells, hits: new Set() });
            placed = true;
        }
        if (!placed) { // extremely unlikely; degrade gracefully by dropping the margin rule
            for (let tries = 0; tries < 400 && !placed; tries++) {
                const o = rng.chance(0.5) ? 'h' : 'v';
                const c = o === 'h' ? rng.int(0, size - s.len) : rng.int(0, size - 1);
                const r = o === 'v' ? rng.int(0, size - s.len) : rng.int(0, size - 1);
                const cells = cellsFor(c, r, s.len, o);
                if (cells.some((cell) => occupied.has(cell)))
                    continue;
                cells.forEach((cell) => occupied.add(cell));
                structures.push({ id: `s${id++}`, kind: s.kind, len: s.len, col: c, row: r, orient: o, cells, hits: new Set() });
                placed = true;
            }
        }
    }
    return structures;
}
export function makeEnemyGrid(seed, _difficulty) {
    const rng = new RNG(hashSeed(seed, 0xE9e1));
    const structures = placeFleet(rng, BS_GRID, FLEET_BASE);
    return {
        size: BS_GRID, structures, shots: new Set(),
        knownEmpty: new Set(), knownShip: new Set(),
        fleet: FLEET_BASE.map((s) => s.len),
    };
}
export function makeMyGrid(seed) {
    const rng = new RNG(hashSeed(seed, 0x31d7));
    const structures = placeFleet(rng, BS_GRID, FLEET_BASE);
    return { size: BS_GRID, structures, shots: new Set(), ai: { mode: 'hunt', openHits: [] } };
}
// Add Bulwark decoys to MY grid (call when Bulwark levels up). idempotent-ish: pass total level.
export function applyBulwarkDecoys(grid, seed, level) {
    grid.structures = grid.structures.filter((s) => s.kind !== 'decoy');
    if (level <= 0)
        return;
    const rng = new RNG(hashSeed(seed, 0xDEC0 + level));
    const occupied = new Set(grid.structures.flatMap((s) => s.cells));
    let id = 1000;
    for (let n = 0; n < level; n++) {
        for (let tries = 0; tries < 200; tries++) {
            const o = rng.chance(0.5) ? 'h' : 'v';
            const len = rng.chance(0.5) ? 1 : 2;
            const c = o === 'h' ? rng.int(0, grid.size - len) : rng.int(0, grid.size - 1);
            const r = o === 'v' ? rng.int(0, grid.size - len) : rng.int(0, grid.size - 1);
            const cells = cellsFor(c, r, len, o);
            if (cells.some((cell) => occupied.has(cell)))
                continue;
            cells.forEach((cell) => occupied.add(cell));
            grid.structures.push({ id: `d${id++}`, kind: 'decoy', len, col: c, row: r, orient: o, cells, hits: new Set() });
            break;
        }
    }
}
// ---- structure helpers ---------------------------------------------------------------------
export const isSunk = (s) => s.hits.size >= s.cells.length;
export const keepOf = (g) => g.structures.find((s) => s.kind === 'keep');
export const keepSunk = (g) => { const kp = keepOf(g); return !!kp && isSunk(kp); };
// Keep-health snapshot for the UI race bar. `sighted` = the rival has landed (unfinished) hits on it.
export function keepHealth(g) {
    const kp = keepOf(g);
    if (!kp)
        return { hits: 0, len: 0, sighted: false };
    return { hits: kp.hits.size, len: kp.cells.length, sighted: kp.hits.size > 0 && !isSunk(kp) };
}
// Reinforce: patch one hit on MY keep AND scatter the rival's lock (it drops back to blind hunting).
export function repairKeep(g) {
    const kp = keepOf(g);
    if (!kp || kp.hits.size === 0)
        return false;
    const cell = [...kp.hits].pop();
    kp.hits.delete(cell);
    g.shots.delete(cell); // the rival must re-find that cell
    g.ai.openHits = g.ai.openHits.filter((c) => c !== cell);
    if (!g.ai.openHits.length)
        g.ai.mode = 'hunt';
    return true;
}
function structureAt(g, cell) { return g.structures.find((s) => s.cells.includes(cell)); }
export function playerFire(g, col, row) {
    const cell = k(col, row);
    if (g.shots.has(cell))
        return { cell, hit: false, sunk: null, won: false, alreadyShot: true };
    g.shots.add(cell);
    const s = structureAt(g, cell);
    if (!s) {
        g.knownEmpty.add(cell);
        return { cell, hit: false, sunk: null, won: false, alreadyShot: false };
    }
    s.hits.add(cell);
    g.knownShip.add(cell);
    const sunk = isSunk(s) ? s : null;
    return { cell, hit: true, sunk, won: keepSunk(g), alreadyShot: false };
}
// ---- PLAYER scouting (Watchtower) ----------------------------------------------------------
// Scan I — line elimination: reveal the emptiest unrevealed row OR column's empty cells.
export function scanLine(g, rng) {
    const occ = new Set(g.structures.flatMap((s) => s.cells));
    let best = null;
    for (let i = 0; i < g.size; i++) {
        let ro = 0, co = 0;
        for (let j = 0; j < g.size; j++) {
            if (occ.has(k(j, i)))
                ro++;
            if (occ.has(k(i, j)))
                co++;
        }
        if (!best || ro < best.occ)
            best = { kind: 'row', index: i, occ: ro };
        if (!best || co < best.occ)
            best = { kind: 'col', index: i, occ: co };
    }
    const cells = [];
    for (let j = 0; j < g.size; j++) {
        const cell = best.kind === 'row' ? k(j, best.index) : k(best.index, j);
        if (!occ.has(cell)) {
            g.knownEmpty.add(cell);
            cells.push(cell);
        }
    }
    void rng;
    return { kind: best.kind, index: best.index, cells };
}
// Scan II — hot/cold oracle: Chebyshev distance from a chosen cell to the nearest structure cell.
export function scanHotCold(g, col, row) {
    let best = Infinity;
    for (const s of g.structures)
        for (const cell of s.cells) {
            const [cc, rr] = parse(cell);
            best = Math.min(best, Math.max(Math.abs(cc - col), Math.abs(rr - row)));
        }
    return best === Infinity ? -1 : best;
}
// Scan III — anchor reveal: reveal one true, not-yet-known structure cell.
export function scanAnchor(g, rng) {
    const candidates = [];
    for (const s of g.structures)
        for (const cell of s.cells)
            if (!g.knownShip.has(cell))
                candidates.push(cell);
    if (!candidates.length)
        return null;
    const cell = rng.pick(candidates);
    g.knownShip.add(cell);
    return cell;
}
export function rivalFire(g, difficulty, rng) {
    const d = DIFFICULTY[difficulty];
    const target = chooseRivalTarget(g, d.accuracy, d.blunder, rng);
    if (!target)
        return null;
    g.shots.add(target);
    const s = structureAt(g, target);
    if (!s)
        return { cell: target, hit: false, sunk: null, wonForRival: false };
    s.hits.add(target);
    // update AI memory
    if (isSunk(s)) {
        g.ai.openHits = g.ai.openHits.filter((c) => !s.cells.includes(c));
        g.ai.mode = g.ai.openHits.length ? 'target' : 'hunt';
    }
    else {
        g.ai.openHits.push(target);
        g.ai.mode = 'target';
    }
    return { cell: target, hit: true, sunk: isSunk(s) ? s : null, wonForRival: keepSunk(g) };
}
function chooseRivalTarget(g, accuracy, blunder, rng) {
    const size = g.size;
    const unshot = [];
    for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
            if (!g.shots.has(k(c, r)))
                unshot.push(k(c, r));
    if (!unshot.length)
        return null;
    // honest blunder: sometimes just fire randomly (weaker on lower difficulty)
    if (rng.chance(blunder))
        return rng.pick(unshot);
    // TARGET mode: chase a line through open (hit-but-not-sunk) cells
    if (g.ai.openHits.length) {
        const cand = targetCandidates(g);
        if (cand.length) {
            // accuracy gates whether it plays the smart adjacency or a random unshot cell
            return rng.chance(accuracy) ? rng.pick(cand) : rng.pick(unshot);
        }
    }
    // HUNT mode: probability density over remaining fleet lengths.
    const density = densityMap(g);
    let max = -1;
    for (const cell of unshot)
        max = Math.max(max, density.get(cell) ?? 0);
    const hot = unshot.filter((cell) => (density.get(cell) ?? 0) >= max - 1e-9);
    // accuracy gates whether it takes a hot cell or any unshot cell
    return rng.chance(accuracy) ? rng.pick(hot) : rng.pick(unshot);
}
// Cells adjacent/inline to current open hits (classic target mode).
function targetCandidates(g) {
    const out = new Set();
    const open = g.ai.openHits;
    const hitSet = new Set(open);
    for (const h of open) {
        const [c, r] = parse(h);
        if (open.length >= 2) {
            // infer orientation, extend the line both ways
            const sameRow = open.every((o) => parse(o)[1] === r);
            const sameCol = open.every((o) => parse(o)[0] === c);
            if (sameRow) {
                addIf(g, out, hitSet, c - 1, r);
                addIf(g, out, hitSet, c + 1, r);
                for (const o of open) {
                    const [oc] = parse(o);
                    addIf(g, out, hitSet, oc - 1, r);
                    addIf(g, out, hitSet, oc + 1, r);
                }
            }
            else if (sameCol) {
                for (const o of open) {
                    const [, or2] = parse(o);
                    addIf(g, out, hitSet, c, or2 - 1);
                    addIf(g, out, hitSet, c, or2 + 1);
                }
            }
            else {
                addNeigh(g, out, hitSet, c, r);
            }
        }
        else {
            addNeigh(g, out, hitSet, c, r);
        }
    }
    return [...out];
}
function addNeigh(g, out, hits, c, r) {
    addIf(g, out, hits, c - 1, r);
    addIf(g, out, hits, c + 1, r);
    addIf(g, out, hits, c, r - 1);
    addIf(g, out, hits, c, r + 1);
}
function addIf(g, out, hits, c, r) {
    if (c < 0 || r < 0 || c >= g.size || r >= g.size)
        return;
    const cell = k(c, r);
    if (g.shots.has(cell) || hits.has(cell))
        return;
    out.add(cell);
}
// Probability density: slide every remaining (un-sunk) fleet length over all legal positions
// consistent with known misses, counting coverage of each un-shot cell.
function densityMap(g) {
    const map = new Map();
    const miss = (c, r) => g.shots.has(k(c, r)) && !structureAt(g, k(c, r))?.hits.has(k(c, r));
    const remaining = g.structures.filter((s) => !isSunk(s)).map((s) => s.len);
    const lens = remaining.length ? [...new Set(remaining)] : [2, 3];
    for (const len of lens) {
        for (let r = 0; r < g.size; r++)
            for (let c = 0; c < g.size; c++) {
                for (const o of ['h', 'v']) {
                    const cells = cellsFor(c, r, len, o);
                    if (cells.some((cell) => { const [cc, rr] = parse(cell); return cc >= g.size || rr >= g.size; }))
                        continue;
                    if (cells.some((cell) => { const [cc, rr] = parse(cell); return miss(cc, rr); }))
                        continue;
                    for (const cell of cells)
                        if (!g.shots.has(cell))
                            map.set(cell, (map.get(cell) ?? 0) + 1);
                }
            }
    }
    return map;
}
// Density map exposed for the player solver (headless deduction harness).
export { densityMap as _densityMap };
