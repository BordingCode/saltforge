// The exploration HUD: a top status bar (resources, Vigor, HP, the rival's menace) and a bottom
// control cluster (D-pad + context action + Base / Strike buttons).
import { Game } from '../state.js';
import { el, clear } from './dom.js';
import { tileAt } from '../world/worldgen.js';
import { bandAt } from '../world/actions.js';
import { RES_META, BASE_POS } from '../config.js';
import { currentStage } from '../tutorial.js';
export function renderExploreHUD(hud, h) {
    clear(hud);
    const run = Game.run;
    const world = Game.world;
    const top = el('div', { class: 'hud-top' }, [topBar(run)]);
    const goal = currentStage();
    if (goal)
        top.appendChild(objectiveRibbon(goal, h));
    hud.appendChild(top);
    hud.appendChild(controls(run, world, h));
}
function objectiveRibbon(goal, h) {
    return el('div', { class: 'objective' }, [
        el('div', { class: 'obj-badge' }, [`GOAL ${goal.n}/${goal.total}`]),
        el('div', { class: 'obj-text' }, [goal.text]),
        el('button', { class: 'obj-skip', onclick: () => h.skipTutorial(), title: 'Hide tutorial' }, ['✕']),
    ]);
}
function topBar(run) {
    const res = Object.keys(RES_META).map((k) => el('div', { class: 'res' }, [
        el('span', { class: 'res-glyph', style: { color: RES_META[k].color } }, [RES_META[k].glyph]),
        el('span', { class: 'res-n' }, [String(run.resources[k])]),
    ]));
    const band = bandAt(run.hero.col, run.hero.row);
    return el('div', { class: 'topbar' }, [
        el('div', { class: 'res-row' }, res),
        el('div', { class: 'bars' }, [
            bar('Vigor', run.hero.vigor, run.hero.maxVigor, '#7fe0d2'),
            bar('HP', run.hero.hp, run.hero.maxHp, '#ff6b6b'),
            menaceBar(run.rival.menace, run.rival.canFire),
        ]),
        el('div', { class: 'band-tag' }, [band.id === 0 ? 'Home' : band.name + (run.rival.canFire ? '  •  UNDER THREAT' : '')]),
    ]);
}
function bar(label, val, max, color) {
    return el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label' }, [label]),
        el('div', { class: 'stat-track' }, [el('div', { class: 'stat-fill', style: { width: `${Math.max(0, (val / max) * 100)}%`, background: color } }, [])]),
        el('div', { class: 'stat-val' }, [`${Math.round(val)}/${max}`]),
    ]);
}
function menaceBar(val, armed) {
    return el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label' }, ['Rival']),
        el('div', { class: 'stat-track' }, [el('div', { class: 'stat-fill menace', style: { width: `${val}%`, background: armed ? '#ff5c5c' : '#e8b84b' } }, [])]),
        el('div', { class: 'stat-val' }, [`${Math.round(val)}%`]),
    ]);
}
function controls(run, world, h) {
    const here = tileAt(world, run.hero.col, run.hero.row);
    const atBase = run.hero.col === BASE_POS.col && run.hero.row === BASE_POS.row;
    // context action button
    let action;
    if (here.node)
        action = btn(`Harvest ${RES_META[here.node.kind].name}`, 'act-harvest', () => h.harvest());
    else if (here.loot)
        action = btn('Open cache', 'act-loot', () => h.grab());
    else
        action = btn('—', 'act-none disabled', () => { });
    const dpad = el('div', { class: 'dpad' }, [
        el('div', {}, []),
        padBtn('↑', () => h.move('up')),
        el('div', {}, []),
        padBtn('←', () => h.move('left')),
        el('div', { class: 'dpad-mid' }, []),
        padBtn('→', () => h.move('right')),
        el('div', {}, []),
        padBtn('↓', () => h.move('down')),
        el('div', {}, []),
    ]);
    const right = el('div', { class: 'ctl-right' }, [
        action,
        btn('Base', 'act-base', () => h.openBase()),
        atBase ? btn('Strike', 'act-strike', () => h.openBattleship()) : el('div', { class: 'hint' }, ['Return home to strike']),
    ]);
    return el('div', { class: 'controls' }, [dpad, right]);
}
function padBtn(label, onclick) {
    return el('button', { class: 'pad', onclick }, [label]);
}
function btn(label, cls, onclick) {
    return el('button', { class: `act ${cls}`, onclick }, [label]);
}
