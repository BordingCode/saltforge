// Spending: building upgrades and hero gear crafting, with their side-effects (storage cap,
// hero max HP, Bulwark decoys). All cost/effect numbers come from config.
import { Game, syncHeroMaxHp } from './state.js';
import { applyBulwarkDecoys, applyKeepLevel } from './sim/battleship.js';
import {
  BUILDING_BY_ID, BUILDINGS, BASE_STORAGE_CAP, GEAR_COST, MAX_GEAR_TIER,
} from './config.js';
import type { Resources, ResourceKind, BuildingId, GearSlot } from './types.js';

export function canAfford(cost: Partial<Resources>): boolean {
  const res = Game.run!.resources;
  return (Object.keys(cost) as ResourceKind[]).every((k) => res[k] >= (cost[k] ?? 0));
}
export function pay(cost: Partial<Resources>): void {
  const res = Game.run!.resources;
  (Object.keys(cost) as ResourceKind[]).forEach((k) => { res[k] -= cost[k] ?? 0; });
}

export function nextBuildingCost(id: BuildingId): Partial<Resources> | null {
  const def = BUILDING_BY_ID[id];
  const lvl = Game.run!.buildings[id];
  if (lvl >= def.maxLevel) return null;
  return def.cost[lvl + 1] ?? null;
}
export function meetsRequirements(id: BuildingId): boolean {
  const def = BUILDING_BY_ID[id];
  if (!def.requires) return true;
  const b = Game.run!.buildings;
  return (Object.keys(def.requires) as BuildingId[]).every((req) => b[req] >= (def.requires![req] ?? 0));
}

export function upgradeBuilding(id: BuildingId): { ok: boolean; reason?: string } {
  const run = Game.run!;
  const def = BUILDING_BY_ID[id];
  if (run.buildings[id] >= def.maxLevel) return { ok: false, reason: 'Already at max level.' };
  if (!meetsRequirements(id)) return { ok: false, reason: 'Requires another building first.' };
  const cost = nextBuildingCost(id);
  if (!cost) return { ok: false, reason: 'Maxed.' };
  if (!canAfford(cost)) return { ok: false, reason: 'Not enough materials.' };
  pay(cost);
  run.buildings[id]++;
  applyBuildingEffects(id);
  return { ok: true };
}

function applyBuildingEffects(id: BuildingId): void {
  const run = Game.run!;
  if (id === 'saltern') run.storageCap = BASE_STORAGE_CAP + run.buildings.saltern * 30;
  if (id === 'bulwark' && Game.mine) applyBulwarkDecoys(Game.mine, run.seed, run.buildings.bulwark);
  if (id === 'keep' && Game.mine) {
    // a longer keep = more hits-to-sink. Re-fit then re-stamp decoys (placement may have shifted).
    applyKeepLevel(Game.mine, run.seed, run.buildings.keep);
    if (run.buildings.bulwark) applyBulwarkDecoys(Game.mine, run.seed, run.buildings.bulwark);
  }
  // cannon / watchtower effects are read live from levels elsewhere
}

// ---- gear ----------------------------------------------------------------------------------
export function nextGearCost(slot: GearSlot): Partial<Resources> | null {
  const tier = Game.run!.hero.gear[slot];
  if (tier >= MAX_GEAR_TIER) return null;
  return GEAR_COST[slot][tier + 1] ?? null;
}
export function craftGear(slot: GearSlot): { ok: boolean; reason?: string } {
  const run = Game.run!;
  if (run.buildings.forge < 1) return { ok: false, reason: 'Build a Forge first.' };
  const tier = run.hero.gear[slot];
  if (tier >= MAX_GEAR_TIER) return { ok: false, reason: 'Already mastered.' };
  // the Forge gates how high you can craft: level 1 -> tier 2, level 2 -> tier 3, level 3 -> tier 4
  if (tier >= run.buildings.forge + 1) return { ok: false, reason: 'Upgrade the Forge to craft higher.' };
  const cost = nextGearCost(slot);
  if (!cost) return { ok: false, reason: 'Maxed.' };
  if (!canAfford(cost)) return { ok: false, reason: 'Not enough materials.' };
  pay(cost);
  run.hero.gear[slot]++;
  if (slot === 'armor') syncHeroMaxHp();
  return { ok: true };
}

export const ALL_BUILDINGS = BUILDINGS;
