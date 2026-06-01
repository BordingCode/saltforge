// Central mutable game state + run lifecycle (create / save / load). One object the whole app
// reads and writes (KB canvas-engine pattern).
import { seedFromString } from './rng.js';
import { generateWorld } from './world/worldgen.js';
import { WORLD_W, WORLD_H, BASE_POS, STARTING_RESOURCES, BASE_STORAGE_CAP, HERO_MAX_VIGOR, HERO_MAX_HP, ARMOR_HP, DIFFICULTY, SAVE_KEY, } from './config.js';
import { makeEnemyGrid, makeMyGrid } from './sim/battleship.js';
export const Game = {
    run: null, world: null, enemy: null, mine: null,
    view: { ox: 0, oy: 0, tile: 36, followedOnce: false },
    anim: { heroFrom: null, t: 0 },
    toastQueue: [],
};
export function newRun(seedStr, difficulty) {
    const seed = seedFromString(seedStr);
    const world = generateWorld(seed);
    Game.world = world;
    const d = DIFFICULTY[difficulty];
    const run = {
        seed, seedStr, difficulty,
        step: 0, phase: 'explore',
        resources: STARTING_RESOURCES(),
        storageCap: BASE_STORAGE_CAP,
        buildings: { keep: 1, saltern: 0, bulwark: 0, cannon: 0, watchtower: 0, forge: 0 },
        hero: {
            col: BASE_POS.col, row: BASE_POS.row,
            vigor: HERO_MAX_VIGOR, maxVigor: HERO_MAX_VIGOR,
            hp: HERO_MAX_HP, maxHp: HERO_MAX_HP,
            gear: { weapon: 0, armor: 0, lantern: 0 },
        },
        rival: { menace: 0, canFire: false, accuracy: d.accuracy, blunder: d.blunder, lastTelegraph: 0 },
        worldW: WORLD_W, worldH: WORLD_H,
        basePos: { ...BASE_POS },
        objectivesDone: [],
        over: false, result: null,
    };
    Game.run = run;
    Game.enemy = makeEnemyGrid(seed, difficulty);
    Game.mine = makeMyGrid(seed);
    Game.view.followedOnce = false;
    return run;
}
// ---- persistence ---------------------------------------------------------------------------
export function saveRun() {
    if (!Game.run || !Game.world)
        return;
    if (Game.run.over) {
        clearSave();
        return;
    }
    try {
        const blob = {
            run: Game.run,
            world: Game.world,
            enemy: Game.enemy,
            mine: Game.mine,
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    }
    catch { /* storage full / disabled — ignore */ }
}
export function loadRun() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw)
            return null;
        const blob = JSON.parse(raw);
        if (!blob || !blob.run || !blob.world)
            return null;
        if (blob.run.over) {
            clearSave();
            return null;
        }
        Game.run = blob.run;
        Game.world = blob.world;
        Game.enemy = blob.enemy;
        Game.mine = blob.mine;
        Game.view.followedOnce = false;
        return Game.run;
    }
    catch {
        return null;
    }
}
export function clearSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
    }
    catch { /* ignore */ }
}
export function hasSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw)
            return false;
        const b = JSON.parse(raw);
        return b && b.run && !b.run.over;
    }
    catch {
        return false;
    }
}
// armor tier sets max hp; call when gear changes
export function syncHeroMaxHp() {
    if (!Game.run)
        return;
    const tier = Game.run.hero.gear.armor;
    const max = ARMOR_HP[tier] ?? HERO_MAX_HP;
    const ratio = Game.run.hero.hp / Game.run.hero.maxHp;
    Game.run.hero.maxHp = max;
    Game.run.hero.hp = Math.round(max * Math.min(1, ratio));
}
