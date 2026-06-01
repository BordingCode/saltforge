// Title screen, difficulty pick, and the win/lose end screen.
import { Game } from '../state.js';
import { el } from './dom.js';
import { hasSave } from '../state.js';
import { DIFFICULTY } from '../config.js';
import { INTRO_LINES } from '../tutorial.js';
export function renderTitle(overlay, h) {
    let diff = 2;
    const seedBox = el('input', { class: 'seed-in', placeholder: 'seed (optional)', maxlength: 16 });
    const diffBtns = el('div', { class: 'diff-row' }, Object.keys(DIFFICULTY).map((d) => el('button', { class: `diff ${d === diff ? 'on' : ''}`, onclick: (e) => {
            diff = Number(e.currentTarget.dataset.d);
            [...diffBtns.children].forEach((c) => c.classList.toggle('on', Number(c.dataset.d) === diff));
        }, dataset: { d: String(d) } }, [DIFFICULTY[d].name])));
    const start = () => {
        const seed = seedBox.value.trim() || ('salt-' + Math.floor(Date.now() % 1e7).toString(36));
        h.newGame(seed, diff);
    };
    return el('div', { class: 'menu' }, [
        el('div', { class: 'menu-mark' }, ['SALTFORGE']),
        el('div', { class: 'menu-tag' }, ['Explore the fog. Forge your hold. Sink a hidden rival.']),
        hasSave() ? el('button', { class: 'menu-btn primary', onclick: () => h.resume() }, ['Continue run']) : el('div', {}, []),
        el('div', { class: 'menu-label' }, ['Difficulty']),
        diffBtns,
        el('div', { class: 'menu-label' }, ['Seed']),
        seedBox,
        el('button', { class: 'menu-btn primary', onclick: start }, ['New run']),
        el('button', { class: 'menu-btn', onclick: () => h.showHelp() }, ['How to play']),
        el('div', { class: 'menu-foot' }, ['A turn-based frontier. Every step, the rival arms too.']),
    ]);
}
// First-run welcome card (also reachable from the title's "How to play").
export function renderIntro(overlay, h) {
    return el('div', { class: 'sheet intro-sheet' }, [
        el('div', { class: 'sheet-head' }, [el('div', { class: 'sheet-title' }, ['How to play'])]),
        el('div', { class: 'intro-body' }, [
            el('div', { class: 'intro-tag' }, ['Three loops, woven together:']),
            ...INTRO_LINES.map(([title, body], i) => el('div', { class: 'intro-step' }, [
                el('div', { class: 'intro-num' }, [String(i + 1)]),
                el('div', {}, [el('div', { class: 'intro-step-title' }, [title]), el('div', { class: 'intro-step-body' }, [body])]),
            ])),
            el('div', { class: 'intro-hint' }, ['Move by tapping a tile next to your hero (or arrow keys). A goal banner will guide your first run.']),
        ]),
        el('div', { class: 'intro-actions' }, [
            el('button', { class: 'buy wide', onclick: () => h.closeOverlay() }, ['Begin']),
            el('button', { class: 'buy ghost', onclick: () => h.skipTutorial() }, ['Skip the tips']),
        ]),
    ]);
}
export function renderEnd(overlay, won, h) {
    const run = Game.run;
    return el('div', { class: 'menu end' }, [
        el('div', { class: `menu-mark ${won ? 'win' : 'lose'}` }, [won ? 'VICTORY' : 'YOUR KEEP FALLS']),
        el('div', { class: 'menu-tag' }, [won
                ? 'The rival’s Keep is rubble beneath the tide. The frontier is yours.'
                : 'The rival’s guns found your heart. The frontier swallows another hold.']),
        el('div', { class: 'end-stats' }, [
            stat('Steps taken', String(run.step)),
            stat('Seed', run.seedStr),
            stat('Difficulty', DIFFICULTY[run.difficulty].name),
        ]),
        el('button', { class: 'menu-btn primary', onclick: () => h.toMenu() }, ['Back to title']),
    ]);
}
function stat(label, val) {
    return el('div', { class: 'end-stat' }, [el('span', {}, [label]), el('b', {}, [val])]);
}
