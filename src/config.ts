// Central tunables. EVERY balance number lives here so the whole game is tuned from one file
// (and the headless harness imports the same constants). Numbers are design starting points.
import type { ResourceKind, Resources, BuildingId, GearSlot } from './types.js';

export const WORLD_W = 22;
export const WORLD_H = 22;

// Base sits at a corner; the rival's hold is diagonally far across the fog.
export const BASE_POS = { col: 2, row: WORLD_H - 3 };
export const RIVAL_POS = { col: WORLD_W - 3, row: 2 };

// ---- Resources -----------------------------------------------------------------------------
export const RESOURCES: ResourceKind[] = ['salt', 'timber', 'iron', 'firesalt'];
export const RES_META: Record<ResourceKind, { name: string; color: string; glyph: string }> = {
  salt:     { name: 'Salt',     color: '#dfe9ee', glyph: '◇' },
  timber:   { name: 'Timber',   color: '#c08a4a', glyph: '▮' },
  iron:     { name: 'Iron',     color: '#9fb1bd', glyph: '◆' },
  firesalt: { name: 'Firesalt', color: '#ff7a3c', glyph: '✦' },
};
export const emptyResources = (): Resources => ({ salt: 0, timber: 0, iron: 0, firesalt: 0 });
export const STARTING_RESOURCES = (): Resources => ({ salt: 12, timber: 6, iron: 0, firesalt: 0 });
export const BASE_STORAGE_CAP = 60; // per-resource soft cap (Saltern raises it)

// ---- Danger bands --------------------------------------------------------------------------
// Distance-from-base rings. Deeper = better materials + tougher creatures + more vigor drain.
export interface BandDef {
  id: number;
  name: string;
  tint: string;            // map tint
  minDist: number;         // chebyshev distance from base (inclusive)
  vigorStep: number;       // vigor cost per step taken while in this band
  nodeChance: number;      // chance a ground tile spawns a resource node
  yields: ResourceKind[];  // which resources nodes here can be
  nodeAmount: [number, number];
  creatureChance: number;
  creatureBand: number;    // which creature tier spawns
}
export const BANDS: BandDef[] = [
  { id: 1, name: 'The Shoals',  tint: '#1d3a42', minDist: 0,  vigorStep: 1, nodeChance: 0.28, yields: ['salt', 'timber'],         nodeAmount: [3, 6],  creatureChance: 0.05, creatureBand: 1 },
  { id: 2, name: 'The Marsh',   tint: '#243a2c', minDist: 6,  vigorStep: 1, nodeChance: 0.30, yields: ['timber', 'iron', 'salt'], nodeAmount: [4, 7],  creatureChance: 0.16, creatureBand: 2 },
  { id: 3, name: 'The Reach',   tint: '#3a2e1d', minDist: 11, vigorStep: 2, nodeChance: 0.32, yields: ['iron', 'salt'],           nodeAmount: [5, 9],  creatureChance: 0.28, creatureBand: 3 },
  { id: 4, name: 'The Saltmaw', tint: '#3a1d2b', minDist: 16, vigorStep: 2, nodeChance: 0.34, yields: ['firesalt', 'iron'],       nodeAmount: [3, 6],  creatureChance: 0.40, creatureBand: 4 },
];
export function bandFor(dist: number): BandDef {
  let b = BANDS[0];
  for (const band of BANDS) if (dist >= band.minDist) b = band;
  return b;
}

// ---- Hero / Vigor --------------------------------------------------------------------------
export const HERO_MAX_VIGOR = 10;
export const HERO_MAX_HP = 30;
export const HARVEST_VIGOR = 1;     // vigor to land one harvest hit
export const FIGHT_VIGOR = 1;       // vigor per attack exchange

// ---- Gear ----------------------------------------------------------------------------------
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'lantern'];
export const GEAR_META: Record<GearSlot, { name: string; desc: string }> = {
  weapon: { name: 'Weapon', desc: 'Hit harder — fell deeper creatures.' },
  armor:  { name: 'Armor',  desc: 'Soak hits — survive deeper bands.' },
  lantern:{ name: 'Lantern',desc: 'See further, travel cheaper, harvest faster.' },
};
export const GEAR_TIER_NAMES = ['—', 'Crude', 'Forged', 'Tempered', 'Saltforged'];
export const MAX_GEAR_TIER = 4;
// Effects per tier (index = tier 0..4):
export const WEAPON_ATK = [3, 6, 10, 15, 22];   // hero attack
export const ARMOR_DEF  = [0, 2, 4, 7, 11];     // damage reduction
export const ARMOR_HP   = [30, 38, 48, 62, 80]; // hero max hp by armor tier
export const LANTERN_RADIUS = [1, 1, 2, 2, 3];  // fog reveal radius
export const LANTERN_HARVEST = [1, 1, 2, 2, 3]; // harvest hits per action (faster)
// Forge cost to craft slot -> tier (cost to reach that tier):
export const GEAR_COST: Record<GearSlot, Array<Partial<Resources>>> = {
  weapon:  [{}, { iron: 4, timber: 2 }, { iron: 9, salt: 6 }, { iron: 18, firesalt: 2 }, { iron: 30, firesalt: 5 }],
  armor:   [{}, { timber: 5, iron: 2 }, { iron: 8, timber: 6 }, { iron: 16, salt: 10 }, { iron: 28, firesalt: 4 }],
  lantern: [{}, { salt: 6, timber: 4 }, { salt: 12, iron: 4 }, { iron: 12, salt: 16 }, { iron: 22, firesalt: 3 }],
};

// ---- Buildings -----------------------------------------------------------------------------
export interface BuildingDef {
  id: BuildingId;
  name: string;
  role: 'core' | 'economy' | 'defense' | 'offense' | 'scouting' | 'gear';
  blurb: string;
  maxLevel: number;
  cost: Array<Partial<Resources>>;     // cost to reach level (index = level)
  requires?: Partial<Record<BuildingId, number>>; // prerequisite building levels
}
export const BUILDINGS: BuildingDef[] = [
  { id: 'keep', name: 'The Keep', role: 'core', blurb: 'Your heart. Lose it and the run ends. Upgrades harden your hidden grid.',
    maxLevel: 4, cost: [{}, { timber: 14, iron: 6 }, { iron: 16, salt: 12 }, { iron: 30, firesalt: 4 }] },
  { id: 'saltern', name: 'Saltern', role: 'economy', blurb: '+Salt each expedition and a bigger storehouse.',
    maxLevel: 4, cost: [{}, { timber: 6 }, { timber: 10, salt: 8 }, { timber: 16, iron: 6 }] },
  { id: 'forge', name: 'Forge', role: 'gear', blurb: 'Craft and upgrade your hero gear.',
    maxLevel: 4, cost: [{}, { timber: 8, salt: 4 }, { iron: 8, timber: 8 }, { iron: 18, firesalt: 2 }] },
  { id: 'bulwark', name: 'Bulwark', role: 'defense', blurb: 'Decoy hulls scatter the rival’s fire across empty water.',
    maxLevel: 4, cost: [{}, { timber: 10, iron: 3 }, { iron: 10, timber: 8 }, { iron: 20, salt: 14 }], requires: { keep: 1 } },
  { id: 'cannon', name: 'Cannon Battery', role: 'offense', blurb: '+1 salvo shot per turn for every level.',
    maxLevel: 4, cost: [{}, { iron: 8, timber: 6 }, { iron: 16, firesalt: 1 }, { iron: 28, firesalt: 3 }], requires: { forge: 1 } },
  { id: 'watchtower', name: 'Watchtower', role: 'scouting', blurb: 'Scans that turn blind guesses into deductions.',
    maxLevel: 3, cost: [{}, { timber: 10, iron: 4 }, { iron: 14, salt: 12 }], requires: { keep: 1 } },
];
export const BUILDING_BY_ID: Record<BuildingId, BuildingDef> =
  Object.fromEntries(BUILDINGS.map((b) => [b.id, b])) as Record<BuildingId, BuildingDef>;

export const SALTERN_INCOME = [0, 4, 8, 14, 22];      // salt granted per expedition return, by level
export const CANNON_SHOTS = [1, 2, 3, 4, 5];          // salvo shots/turn = base 1 + extra; index = cannon level
export const KEEP_GRID_HP = [0, 2, 3, 4, 6];          // # of cells the rival must hit to fell your keep (by level)

// ---- Battleship layer ----------------------------------------------------------------------
export const BS_GRID = 8;                              // enemy/your hidden grid is 8x8
export const SALVO_AMMO_COST: Partial<Resources> = { firesalt: 1 }; // each salvo turn burns ammo
export const SCAN_COST: Partial<Resources>[] = [{}, { firesalt: 1 }, { firesalt: 1 }, { firesalt: 2 }]; // by watchtower level

// ---- Rival clock ---------------------------------------------------------------------------
export const DIFFICULTY = {
  1: { name: 'Calm',   menacePerStep: 0.18, fireThreshold: 55, accuracy: 0.45, blunder: 0.45, fireEvery: 9 },
  2: { name: 'Tense',  menacePerStep: 0.26, fireThreshold: 45, accuracy: 0.62, blunder: 0.25, fireEvery: 7 },
  3: { name: 'Brutal', menacePerStep: 0.36, fireThreshold: 38, accuracy: 0.80, blunder: 0.10, fireEvery: 5 },
} as const;
export type { DifficultyTier } from './types.js';

export const SAVE_KEY = 'saltforge_run_v1';
export const META_KEY = 'saltforge_meta_v1';
