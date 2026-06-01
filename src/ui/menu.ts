// Title screen, difficulty pick, and the win/lose end screen.
import { Game } from '../state.js';
import { el } from './dom.js';
import { hasSave } from '../state.js';
import { DIFFICULTY } from '../config.js';
import type { Handlers } from './handlers.js';
import type { DifficultyTier } from '../types.js';

export function renderTitle(overlay: HTMLElement, h: Handlers): HTMLElement {
  let diff: DifficultyTier = 2;
  const seedBox = el('input', { class: 'seed-in', placeholder: 'seed (optional)', maxlength: 16 }) as HTMLInputElement;

  const diffBtns = el('div', { class: 'diff-row' },
    (Object.keys(DIFFICULTY) as unknown as DifficultyTier[]).map((d) =>
      el('button', { class: `diff ${d === diff ? 'on' : ''}`, onclick: (e: Event) => {
        diff = Number((e.currentTarget as HTMLElement).dataset.d) as DifficultyTier;
        [...diffBtns.children].forEach((c) => c.classList.toggle('on', Number((c as HTMLElement).dataset.d) === diff));
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
    el('div', { class: 'menu-foot' }, ['A turn-based frontier. Every step, the rival arms too.']),
  ]);
}

export function renderEnd(overlay: HTMLElement, won: boolean, h: Handlers): HTMLElement {
  const run = Game.run!;
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

function stat(label: string, val: string): HTMLElement {
  return el('div', { class: 'end-stat' }, [el('span', {}, [label]), el('b', {}, [val])]);
}
