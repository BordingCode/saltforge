// Player/world actions: move (shared clock + fog + vigor), harvest, arrive-home, and the rival
// clock tick. Mutates Game state and returns small result objects + queues toasts for the UI.
import { Game } from '../state.js';
import { RNG, hashSeed } from '../rng.js';
import { within, chebyshev, inBounds } from '../grid.js';
import { tileAt, passable } from './worldgen.js';
import { rivalFire, keepSunk } from '../sim/battleship.js';
import { bandFor, BASE_POS, LANTERN_RADIUS, LANTERN_HARVEST, HARVEST_VIGOR, SALTERN_INCOME, DIFFICULTY, RES_META, } from '../config.js';
const EXHAUST_HP = 2;
export function toast(msg) { Game.toastQueue.push(msg); }
export function distToBase(col, row) {
    return chebyshev({ col, row }, BASE_POS);
}
export function bandAt(col, row) { return bandFor(distToBase(col, row)); }
export function revealAround(world, col, row) {
    const tier = Game.run?.hero.gear.lantern ?? 0;
    const radius = LANTERN_RADIUS[tier] ?? 1;
    for (const c of within(col, row, radius, world.w, world.h))
        tileAt(world, c.col, c.row).revealed = true;
}
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// Attempt a step. If the target holds a creature, return an encounter (caller opens combat) and
// DON'T move yet. Otherwise move in.
export function tryMove(dir) {
    const run = Game.run, world = Game.world;
    const none = { moved: false, encounter: null, arrivedBase: false, downed: false };
    if (!run || !world || run.phase !== 'explore')
        return none;
    const [dc, dr] = DELTA[dir];
    const nc = run.hero.col + dc, nr = run.hero.row + dr;
    if (!inBounds(nc, nr, world.w, world.h) || !passable(world, nc, nr))
        return none;
    const t = tileAt(world, nc, nr);
    if (t.creature)
        return { moved: false, encounter: t, arrivedBase: false, downed: false };
    return moveInto(nc, nr);
}
// Commit a move into an (already creature-free) tile.
export function moveInto(nc, nr) {
    const run = Game.run, world = Game.world;
    Game.anim.heroFrom = { col: run.hero.col, row: run.hero.row };
    Game.anim.t = 0;
    run.hero.col = nc;
    run.hero.row = nr;
    // vigor / exhaustion
    const cost = bandAt(nc, nr).vigorStep;
    if (run.hero.vigor >= cost)
        run.hero.vigor -= cost;
    else {
        run.hero.hp = Math.max(0, run.hero.hp - EXHAUST_HP);
    }
    run.step++;
    revealAround(world, nc, nr);
    rivalTick();
    let downed = false;
    if (run.hero.hp <= 0) {
        onDowned();
        downed = true;
    }
    const arrivedBase = nc === BASE_POS.col && nr === BASE_POS.row;
    if (arrivedBase && !downed)
        onArriveBase();
    return { moved: true, encounter: null, arrivedBase, downed };
}
// Harvest the node on the hero's tile. Returns yielded amount (null if nothing / out of vigor).
export function harvest() {
    const run = Game.run, world = Game.world;
    const t = tileAt(world, run.hero.col, run.hero.row);
    if (!t.node)
        return null;
    if (run.hero.vigor < HARVEST_VIGOR) {
        toast('Out of Vigor — head home to rest.');
        return null;
    }
    run.hero.vigor -= HARVEST_VIGOR;
    const kind = t.node.kind;
    const hits = LANTERN_HARVEST[run.hero.gear.lantern] ?? 1;
    const per = Math.max(1, Math.round(t.node.amount / Math.max(1, t.node.hp)));
    const got = Math.min(t.node.amount, per * hits);
    t.node.amount -= got;
    t.node.hp -= hits;
    grant(kind, got);
    if (t.node.amount <= 0 || t.node.hp <= 0)
        t.node = null;
    run.step++;
    rivalTick();
    return { kind, amount: got };
}
export function grant(kind, amount) {
    const run = Game.run;
    run.resources[kind] = Math.min(run.storageCap, run.resources[kind] + amount);
}
// Picking up a loot cache on the current tile.
export function grabLoot() {
    const run = Game.run, world = Game.world;
    const t = tileAt(world, run.hero.col, run.hero.row);
    if (!t.loot)
        return null;
    const kind = t.loot;
    const amount = 3 + Math.floor(bandAt(run.hero.col, run.hero.row).id * 1.5);
    grant(kind, amount);
    t.loot = null;
    return { kind, amount };
}
function onArriveBase() {
    const run = Game.run;
    run.hero.vigor = run.hero.maxVigor;
    const income = SALTERN_INCOME[run.buildings.saltern] ?? 0;
    if (income > 0) {
        grant('salt', income);
        toast(`Home. Saltern yields ${income} Salt. Vigor restored.`);
    }
    else
        toast('Home. Vigor restored.');
}
export function forceDowned() { onDowned(); }
function onDowned() {
    const run = Game.run;
    run.hero.col = BASE_POS.col;
    run.hero.row = BASE_POS.row;
    run.hero.hp = Math.max(1, Math.round(run.hero.maxHp * 0.5));
    run.hero.vigor = run.hero.maxVigor;
    // lose a little of the most-held resource as a setback (never run-ending)
    let worst = 'salt';
    let mx = -1;
    Object.keys(run.resources).forEach((kk) => { if (run.resources[kk] > mx) {
        mx = run.resources[kk];
        worst = kk;
    } });
    const lost = Math.min(run.resources[worst], 3);
    run.resources[worst] -= lost;
    toast(`You were overcome and dragged home. Lost ${lost} ${RES_META[worst].name}.`);
}
// ---- rival clock ---------------------------------------------------------------------------
export function rivalTick() {
    const run = Game.run;
    const d = DIFFICULTY[run.difficulty];
    run.rival.menace = Math.min(100, run.rival.menace + d.menacePerStep);
    telegraph();
    if (!run.rival.canFire && run.rival.menace >= d.fireThreshold) {
        run.rival.canFire = true;
        toast('Their guns now range your shores. Fortify, and strike first.');
    }
    // once armed, the rival periodically shells YOUR hidden grid
    if (run.rival.canFire && run.step % d.fireEvery === 0 && Game.mine) {
        const rng = new RNG(hashSeed(run.seed, 0xF14e ^ run.step));
        const shot = rivalFire(Game.mine, run.difficulty, rng);
        if (shot?.hit) {
            toast(shot.sunk ? `The rival's salvo sinks your ${shot.sunk.kind}!` : 'A rival salvo scores a hit on your hold.');
        }
        if (shot?.wonForRival || keepSunk(Game.mine))
            loseRun();
    }
}
function telegraph() {
    const run = Game.run;
    const marks = [
        [25, 'Smoke rises across the strait — the rival is building.'],
        [50, 'Their forges are smoking. Cannons are being cast.'],
        [75, 'Scouts have mapped the shoals. Their fire is finding its range.'],
        [100, 'The rival is fully armed. End this now.'],
    ];
    for (const [thr, msg] of marks) {
        if (run.rival.menace >= thr && run.rival.lastTelegraph < thr) {
            run.rival.lastTelegraph = thr;
            toast(msg);
        }
    }
}
export function loseRun() {
    const run = Game.run;
    if (run.over)
        return;
    run.over = true;
    run.result = 'lost';
    run.phase = 'lost';
}
export function winRun() {
    const run = Game.run;
    if (run.over)
        return;
    run.over = true;
    run.result = 'won';
    run.phase = 'won';
}
