// The controller: implements every UI Handler, owns overlay/combat/battleship turn state, and
// refreshes the DOM after each action. The canvas world redraws continuously in main's loop.
import { Game, newRun, loadRun, saveRun } from './state.js';
import { RNG, hashSeed } from './rng.js';
import { tryMove, moveInto, harvest, grabLoot, grant, toast as queueToast, forceDowned, winRun, loseRun, } from './world/actions.js';
import { exchange, flee } from './sim/combat.js';
import { upgradeBuilding, craftGear } from './economy.js';
import { playerFire, scanLine, scanHotCold, scanAnchor, rivalFire, keepSunk, } from './sim/battleship.js';
import { CANNON_SHOTS, SCAN_COST, BASE_POS } from './config.js';
import { sfx, setMuted, isMuted } from './engine/audio.js';
import { $, clear, showToast } from './ui/dom.js';
import { renderExploreHUD } from './ui/explore.js';
import { renderBase } from './ui/base.js';
import { renderBattleship } from './ui/battleship.js';
import { renderCombat } from './ui/combat.js';
import { renderTitle, renderEnd } from './ui/menu.js';
let overlay = 'title';
let encounter = null;
let bsTurn = 0;
const bs = { shotsLeft: 0, scanUsed: false, mode: 'fire', message: '' };
function flush() { while (Game.toastQueue.length)
    showToast(Game.toastQueue.shift()); }
function afterAction() { flush(); if (Game.run?.over)
    toEnd();
else
    renderUI(); saveRun(); }
function toEnd() { overlay = 'end'; renderUI(); }
// ---- Handlers ------------------------------------------------------------------------------
export const handlers = {
    move(dir) {
        if (overlay !== 'none' || !Game.run || Game.run.over)
            return;
        const out = tryMove(dir);
        if (out.encounter) {
            openCombat(out.encounter);
            return;
        }
        if (out.moved) {
            sfx.step();
            if (out.downed)
                sfx.hurt();
        }
        afterAction();
    },
    harvest() { if (harvest())
        sfx.harvest(); afterAction(); },
    grab() { if (grabLoot())
        sfx.loot(); afterAction(); },
    openBase() { if (Game.run && !Game.run.over) {
        overlay = 'base';
        renderUI();
    } },
    openBattleship() {
        const run = Game.run;
        if (!run || run.over)
            return;
        if (run.hero.col !== BASE_POS.col || run.hero.row !== BASE_POS.row) {
            queueToast('Return home to strike.');
            flush();
            return;
        }
        overlay = 'battleship';
        bs.shotsLeft = 0;
        bs.scanUsed = false;
        bs.mode = 'fire';
        bs.message = 'Load a salvo to open fire.';
        renderUI();
    },
    closeOverlay() { overlay = 'none'; renderUI(); saveRun(); },
    upgrade(id) {
        const res = upgradeBuilding(id);
        if (res.ok)
            sfx.build();
        else if (res.reason)
            queueToast(res.reason);
        afterAction();
    },
    craft(slot) {
        const res = craftGear(slot);
        if (res.ok)
            sfx.craft();
        else if (res.reason)
            queueToast(res.reason);
        afterAction();
    },
    beginSalvo() { beginOrEndSalvo(); },
    fireSalvo(c, r) { doFire(c, r); },
    scan(kind) { doScan(kind); },
    pickHotCold(c, r) { doHotCold(c, r); },
    combatAttack() { doAttack(); },
    combatFlee() { doFlee(); },
    newGame(seedStr, difficulty) {
        newRun(seedStr, difficulty);
        overlay = 'none';
        encounter = null;
        queueToast('Wash ashore. Gather Timber & Salt, then raise a Saltern and a Forge.');
        afterAction();
    },
    resume() { if (loadRun()) {
        overlay = 'none';
        renderUI();
    } },
    toMenu() { overlay = 'title'; renderUI(); },
    toggleMute() { setMuted(!isMuted()); renderUI(); },
};
// ---- combat --------------------------------------------------------------------------------
function openCombat(tile) {
    if (!tile.creature)
        return;
    encounter = { creature: tile.creature, tile, log: [`A ${tile.creature.name} blocks your path.`] };
    overlay = 'combat';
    renderUI();
}
function doAttack() {
    if (!encounter)
        return;
    const run = Game.run;
    const ex = exchange(run.hero, encounter.creature);
    encounter.log.push(ex.log);
    sfx.hit();
    if (ex.creatureDead) {
        const b = encounter.creature.bounty;
        Object.entries(b).forEach(([k, v]) => grant(k, v));
        const bounty = Object.entries(b).map(([k, v]) => `${v} ${k}`).join(', ');
        queueToast(`${encounter.creature.name} falls. Loot: ${bounty}.`);
        const tile = encounter.tile;
        tile.creature = null;
        encounter = null;
        overlay = 'none';
        moveInto(tile.col, tile.row);
        afterAction();
        return;
    }
    if (ex.creatureDmg > 0)
        sfx.hurt();
    if (ex.heroDowned) {
        encounter = null;
        overlay = 'none';
        forceDowned();
        afterAction();
        return;
    }
    renderUI();
}
function doFlee() {
    if (!encounter)
        return;
    const dmg = flee(Game.run.hero, encounter.creature);
    sfx.flee();
    queueToast(dmg > 0 ? `You break away (-${dmg} HP).` : 'You slip away clean.');
    const downed = Game.run.hero.hp <= 0;
    encounter = null;
    overlay = 'none';
    if (downed)
        forceDowned();
    afterAction();
}
// ---- battleship turns ----------------------------------------------------------------------
function rng(salt) { return new RNG(hashSeed(Game.run.seed, (bsTurn << 8) ^ salt ^ Game.run.step)); }
function beginOrEndSalvo() {
    const run = Game.run;
    if (bs.shotsLeft > 0) {
        endPlayerTurn();
        return;
    }
    if (run.resources.firesalt < 1) {
        queueToast('No Firesalt — sail to the Saltmaw.');
        flush();
        return;
    }
    run.resources.firesalt -= 1;
    bs.shotsLeft = CANNON_SHOTS[run.buildings.cannon] ?? 1;
    bs.scanUsed = false;
    bs.message = `Salvo loaded — ${bs.shotsLeft} shot${bs.shotsLeft > 1 ? 's' : ''}.`;
    sfx.salvoFire();
    renderUI();
    saveRun();
}
function doFire(c, r) {
    if (bs.shotsLeft <= 0) {
        bs.message = 'No shots — load a salvo.';
        renderUI();
        return;
    }
    const res = playerFire(Game.enemy, c, r);
    if (res.alreadyShot) {
        bs.message = 'Already struck there.';
        renderUI();
        return;
    }
    bs.shotsLeft--;
    if (res.hit) {
        sfx.salvoHit();
        bs.message = res.sunk ? `Sunk their ${res.sunk.kind}!` : 'A hit!';
    }
    else {
        sfx.splash();
        bs.message = 'Splash — into open water.';
    }
    if (res.won) {
        winRun();
        sfx.win();
        flush();
        toEnd();
        saveRun();
        return;
    }
    if (bs.shotsLeft <= 0)
        bs.message += ' Salvo spent — end the turn.';
    renderUI();
    saveRun();
}
function endPlayerTurn() {
    bsTurn++;
    const run = Game.run;
    // rival returns fire: 1 shot, +1 if heavily armed
    const shots = run.rival.menace >= 75 ? 2 : 1;
    let hits = 0;
    let sunk = '';
    for (let i = 0; i < shots; i++) {
        const shot = rivalFire(Game.mine, run.difficulty, rng(0x9 + i));
        if (shot?.hit) {
            hits++;
            if (shot.sunk)
                sunk = shot.sunk.kind;
        }
        if (shot?.wonForRival || keepSunk(Game.mine)) {
            loseRun();
            sfx.lose();
            flush();
            toEnd();
            saveRun();
            return;
        }
    }
    // menace keeps climbing while the guns trade
    run.rival.menace = Math.min(100, run.rival.menace + 1.5);
    run.step++;
    bs.shotsLeft = 0;
    bs.message = hits ? (sunk ? `The rival's guns sink your ${sunk}!` : `The rival lands ${hits} hit${hits > 1 ? 's' : ''} on your hold.`) : 'The rival fires — and misses.';
    if (hits)
        sfx.hurt();
    renderUI();
    saveRun();
}
function doScan(kind) {
    const run = Game.run;
    if (bs.scanUsed) {
        bs.message = 'Only one scan per turn.';
        renderUI();
        return;
    }
    const lvl = kind === 'line' ? 1 : kind === 'hot' ? 2 : 3;
    const cost = SCAN_COST[lvl]?.firesalt ?? 0;
    if (run.buildings.watchtower < lvl) {
        queueToast('Watchtower not high enough.');
        flush();
        return;
    }
    if (run.resources.firesalt < cost) {
        queueToast('Not enough Firesalt to scan.');
        flush();
        return;
    }
    run.resources.firesalt -= cost;
    if (kind === 'line') {
        const res = scanLine(Game.enemy, rng(11));
        bs.message = `Scan: ${res.kind} ${res.index + 1} — ${res.cells.length} cells are open water.`;
        bs.scanUsed = true;
        sfx.scan();
    }
    else if (kind === 'anchor') {
        const cell = scanAnchor(Game.enemy, rng(22));
        bs.message = cell ? 'A berth is revealed — a structure sits there.' : 'Nothing left to reveal.';
        bs.scanUsed = true;
        sfx.scan();
    }
    else {
        bs.mode = 'hotcold';
        bs.message = 'Hot/cold ready — tap any cell.';
        sfx.scan();
    }
    renderUI();
    saveRun();
}
function doHotCold(c, r) {
    const d = scanHotCold(Game.enemy, c, r);
    bs.message = d < 0 ? 'The grid reads empty?!' : d === 0 ? 'A structure lies in THIS very cell.' : `Nearest structure: ${d} cell${d > 1 ? 's' : ''} away.`;
    bs.mode = 'fire';
    bs.scanUsed = true;
    sfx.scan();
    renderUI();
    saveRun();
}
// ---- render orchestration ------------------------------------------------------------------
export function renderUI() {
    const hud = $('#hud');
    const ov = $('#overlay');
    if (!hud || !ov)
        return;
    if (!Game.run || overlay === 'title') {
        clear(hud);
        ov.replaceChildren(renderTitle(ov, handlers));
        return;
    }
    if (overlay === 'end' || Game.run.over) {
        clear(hud);
        ov.replaceChildren(renderEnd(ov, Game.run.result === 'won', handlers));
        return;
    }
    // explore HUD is the base layer
    renderExploreHUD(hud, handlers);
    if (overlay === 'base')
        ov.replaceChildren(renderBase(ov, handlers));
    else if (overlay === 'battleship')
        ov.replaceChildren(renderBattleship(ov, bs, handlers));
    else if (overlay === 'combat' && encounter)
        ov.replaceChildren(renderCombat(ov, encounter.creature, encounter.log, handlers));
    else
        clear(ov);
}
export function bootOverlay() { return overlay; }
export function setOverlay(o) { overlay = o; }
