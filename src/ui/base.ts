// Base overlay — upgrade buildings and craft hero gear. Reads costs/effects from config via the
// economy module's helpers.
import { Game } from '../state.js';
import { el } from './dom.js';
import { nextBuildingCost, meetsRequirements, nextGearCost, canAfford } from '../economy.js';
import {
  BUILDINGS, GEAR_SLOTS, GEAR_META, GEAR_TIER_NAMES, RES_META, BUILDING_BY_ID,
  WEAPON_ATK, ARMOR_DEF, LANTERN_RADIUS, SALTERN_INCOME, CANNON_SHOTS, KEEP_GRID_HP, MAX_GEAR_TIER,
} from '../config.js';
import type { Handlers } from './handlers.js';
import type { ResourceKind, BuildingId, GearSlot } from '../types.js';

export function renderBase(overlay: HTMLElement, h: Handlers): HTMLElement {
  const run = Game.run!;
  const panel = el('div', { class: 'sheet' }, [
    header('Your Hold', h),
    resStrip(run),
    el('div', { class: 'sheet-scroll' }, [
      sectionTitle('Buildings'),
      ...BUILDINGS.map((b) => buildingRow(b.id, h)),
      sectionTitle('Hero Gear'),
      ...GEAR_SLOTS.map((s) => gearRow(s, h)),
    ]),
  ]);
  return panel;
}

function header(title: string, h: Handlers): HTMLElement {
  return el('div', { class: 'sheet-head' }, [
    el('div', { class: 'sheet-title' }, [title]),
    el('button', { class: 'close-x', onclick: () => h.closeOverlay() }, ['Close']),
  ]);
}
function sectionTitle(t: string): HTMLElement { return el('div', { class: 'section-title' }, [t]); }

function resStrip(run: any): HTMLElement {
  return el('div', { class: 'res-strip' }, (Object.keys(RES_META) as ResourceKind[]).map((k) =>
    el('div', { class: 'res' }, [
      el('span', { class: 'res-glyph', style: { color: RES_META[k].color } }, [RES_META[k].glyph]),
      el('span', { class: 'res-n' }, [`${run.resources[k]}`]),
      el('span', { class: 'res-name' }, [RES_META[k].name]),
    ])));
}

function costStr(cost: Record<string, number> | null): string {
  if (!cost) return '';
  return (Object.keys(cost) as ResourceKind[]).map((k) => `${cost[k]} ${RES_META[k].glyph}`).join('  ');
}

function buildingEffect(id: BuildingId, lvl: number): string {
  switch (id) {
    case 'keep': return `Hidden Keep withstands ${KEEP_GRID_HP[lvl] || KEEP_GRID_HP[1]} hits`;
    case 'saltern': return `+${SALTERN_INCOME[lvl] || 0} Salt per return`;
    case 'forge': return lvl ? `Craft gear to tier ${Math.min(MAX_GEAR_TIER, lvl + 1)}` : 'Unlocks gear crafting';
    case 'cannon': return `${CANNON_SHOTS[lvl] || 1} salvo shot${(CANNON_SHOTS[lvl] || 1) > 1 ? 's' : ''} / turn`;
    case 'watchtower': return lvl ? `Scan tier ${lvl} unlocked` : 'No scans yet';
    case 'bulwark': return lvl ? `${lvl} decoy hull${lvl > 1 ? 's' : ''}` : 'No decoys';
    default: return '';
  }
}

function buildingRow(id: BuildingId, h: Handlers): HTMLElement {
  const run = Game.run!;
  const def = BUILDING_BY_ID[id];
  const lvl = run.buildings[id];
  const maxed = lvl >= def.maxLevel;
  const cost = nextBuildingCost(id);
  const req = meetsRequirements(id);
  const afford = cost ? canAfford(cost) : false;
  const locked = !req;

  const btnLabel = maxed ? 'Max' : lvl === 0 ? 'Build' : `Upgrade → ${lvl + 1}`;
  const reqText = def.requires ? 'Needs ' + Object.entries(def.requires).map(([k, v]) => `${BUILDING_BY_ID[k as BuildingId].name} ${v}`).join(', ') : '';

  return el('div', { class: `card ${locked ? 'locked' : ''}` }, [
    el('div', { class: 'card-main' }, [
      el('div', { class: 'card-name' }, [`${def.name}`, el('span', { class: 'lvl' }, [lvl ? `Lv ${lvl}` : 'not built'])]),
      el('div', { class: 'card-blurb' }, [def.blurb]),
      el('div', { class: 'card-eff' }, [buildingEffect(id, lvl)]),
      locked ? el('div', { class: 'card-req' }, [reqText]) : el('div', {}, []),
    ]),
    el('div', { class: 'card-buy' }, [
      maxed ? el('div', { class: 'cost done' }, ['Maxed'])
            : el('div', { class: `cost ${afford ? '' : 'short'}` }, [costStr(cost)]),
      el('button', {
        class: `buy ${(!maxed && req && afford) ? '' : 'disabled'}`,
        onclick: () => { if (!maxed && req && afford) h.upgrade(id); },
      }, [btnLabel]),
    ]),
  ]);
}

function gearEffect(slot: GearSlot, tier: number): string {
  if (slot === 'weapon') return `Attack ${WEAPON_ATK[tier]}`;
  if (slot === 'armor') return `Block ${ARMOR_DEF[tier]} / hit`;
  return `See ${LANTERN_RADIUS[tier]} tiles, faster harvest`;
}

function gearRow(slot: GearSlot, h: Handlers): HTMLElement {
  const run = Game.run!;
  const tier = run.hero.gear[slot];
  const maxed = tier >= MAX_GEAR_TIER;
  const cost = nextGearCost(slot);
  const hasForge = run.buildings.forge >= 1;
  const forgeGate = hasForge && !maxed && tier >= run.buildings.forge + 1; // Forge level caps craftable tier
  const afford = cost ? canAfford(cost) : false;
  const canBuy = !maxed && hasForge && !forgeGate && afford;

  const reqLine = !hasForge ? el('div', { class: 'card-req' }, ['Needs a Forge'])
    : forgeGate ? el('div', { class: 'card-req' }, ['Upgrade the Forge to craft higher'])
    : el('div', {}, []);

  return el('div', { class: `card ${(hasForge && !forgeGate) ? '' : 'locked'}` }, [
    el('div', { class: 'card-main' }, [
      el('div', { class: 'card-name' }, [GEAR_META[slot].name, el('span', { class: 'lvl' }, [`${GEAR_TIER_NAMES[tier]}`])]),
      el('div', { class: 'card-blurb' }, [GEAR_META[slot].desc]),
      el('div', { class: 'card-eff' }, [gearEffect(slot, tier) + (maxed ? '' : `  →  ${gearEffect(slot, tier + 1)}`)]),
      reqLine,
    ]),
    el('div', { class: 'card-buy' }, [
      maxed ? el('div', { class: 'cost done' }, ['Mastered'])
            : el('div', { class: `cost ${afford ? '' : 'short'}` }, [costStr(cost)]),
      el('button', {
        class: `buy ${canBuy ? '' : 'disabled'}`,
        onclick: () => { if (canBuy) h.craft(slot); },
      }, [maxed ? 'Max' : tier === 0 ? 'Forge' : 'Improve']),
    ]),
  ]);
}
