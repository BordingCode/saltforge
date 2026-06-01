// Combat overlay — turn-based hero vs a single creature. Attack trades blows; Flee bails for a
// parting hit. The controller owns the encounter state + resolution.
import { Game } from '../state.js';
import { el } from './dom.js';
import { WEAPON_ATK, ARMOR_DEF } from '../config.js';
import type { Handlers } from './handlers.js';
import type { CreatureData } from '../types.js';

export function renderCombat(overlay: HTMLElement, creature: CreatureData, log: string[], h: Handlers): HTMLElement {
  const run = Game.run!;
  const atk = WEAPON_ATK[run.hero.gear.weapon];
  const arm = ARMOR_DEF[run.hero.gear.armor];
  return el('div', { class: 'sheet combat-sheet' }, [
    el('div', { class: 'sheet-head' }, [el('div', { class: 'sheet-title' }, ['Ambush!'])]),
    el('div', { class: 'combat-body' }, [
      el('div', { class: 'foe' }, [
        el('div', { class: 'foe-name' }, [creature.name]),
        bar('Foe', creature.hp, creature.maxHp, '#ff6b6b'),
        el('div', { class: 'foe-stat' }, [`Attack ${creature.atk}  •  Hide ${creature.def}`]),
      ]),
      el('div', { class: 'me' }, [
        bar('You', run.hero.hp, run.hero.maxHp, '#7fe0d2'),
        el('div', { class: 'foe-stat' }, [`Attack ${atk}  •  Block ${arm}  •  Vigor ${run.hero.vigor}`]),
      ]),
      el('div', { class: 'combat-log' }, log.slice(-3).map((l) => el('div', {}, [l]))),
    ]),
    el('div', { class: 'combat-actions' }, [
      el('button', { class: 'buy', onclick: () => h.combatAttack() }, ['Strike']),
      el('button', { class: 'buy ghost', onclick: () => h.combatFlee() }, ['Flee']),
    ]),
  ]);
}

function bar(label: string, val: number, max: number, color: string): HTMLElement {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-label' }, [label]),
    el('div', { class: 'stat-track' }, [el('div', { class: 'stat-fill', style: { width: `${Math.max(0, (val / max) * 100)}%`, background: color } }, [])]),
    el('div', { class: 'stat-val' }, [`${Math.round(val)}/${max}`]),
  ]);
}
