// Creature definitions per danger band. Plain templates; worldgen stamps instances with full hp.
import type { CreatureData, Resources } from '../types.js';

interface CreatureDef {
  defId: string;
  name: string;
  shape: 'crab' | 'wisp' | 'brute' | 'serpent' | 'maw';
  accent: string;
  hp: number;
  atk: number;
  def: number;
  band: number;
  bounty: Partial<Resources>;
}

export const CREATURE_DEFS: CreatureDef[] = [
  // Band 1 — weak
  { defId: 'salt_crab',  name: 'Salt Crab',    shape: 'crab',    accent: '#7fb0bd', hp: 10, atk: 3,  def: 1, band: 1, bounty: { salt: 3 } },
  { defId: 'mud_wisp',   name: 'Mud Wisp',     shape: 'wisp',    accent: '#8fa56a', hp: 8,  atk: 4,  def: 0, band: 1, bounty: { timber: 2 } },
  // Band 2 — moderate
  { defId: 'marsh_brute',name: 'Marsh Brute',  shape: 'brute',   accent: '#6b8f5a', hp: 22, atk: 6,  def: 2, band: 2, bounty: { timber: 4, iron: 1 } },
  { defId: 'reed_serpent',name:'Reed Serpent',  shape: 'serpent', accent: '#5aa08f', hp: 18, atk: 8,  def: 1, band: 2, bounty: { iron: 2 } },
  // Band 3 — dangerous
  { defId: 'iron_brute', name: 'Iron Brute',   shape: 'brute',   accent: '#9aa7b2', hp: 40, atk: 11, def: 5, band: 3, bounty: { iron: 4, salt: 4 } },
  { defId: 'ash_wisp',   name: 'Ash Wisp',     shape: 'wisp',    accent: '#c98a5a', hp: 30, atk: 14, def: 2, band: 3, bounty: { iron: 3 } },
  // Band 4 — brutal (guard the Firesalt)
  { defId: 'cinder_maw', name: 'Cinder Maw',   shape: 'maw',     accent: '#ff7a3c', hp: 64, atk: 18, def: 7, band: 4, bounty: { firesalt: 2, iron: 3 } },
  { defId: 'salt_wyrm',  name: 'Salt Wyrm',    shape: 'serpent', accent: '#ff5c7a', hp: 78, atk: 22, def: 6, band: 4, bounty: { firesalt: 3 } },
];

export const CREATURES_BY_BAND: Record<number, CreatureDef[]> = { 1: [], 2: [], 3: [], 4: [] };
for (const c of CREATURE_DEFS) CREATURES_BY_BAND[c.band].push(c);

export function makeCreature(def: CreatureDef): CreatureData {
  return { defId: def.defId, name: def.name, hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def, band: def.band, bounty: { ...def.bounty } };
}
export const CREATURE_SHAPE: Record<string, string> = Object.fromEntries(CREATURE_DEFS.map((c) => [c.defId, c.shape]));
export const CREATURE_ACCENT: Record<string, string> = Object.fromEntries(CREATURE_DEFS.map((c) => [c.defId, c.accent]));
