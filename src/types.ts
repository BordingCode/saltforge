// Shared types for Saltforge. Plain data — entities are objects, not classes (KB pattern).

export type DifficultyTier = 1 | 2 | 3;
export type ResourceKind = 'salt' | 'timber' | 'iron' | 'firesalt';
export type Resources = Record<ResourceKind, number>;

export type BuildingId = 'keep' | 'saltern' | 'bulwark' | 'cannon' | 'watchtower' | 'forge';
export type GearSlot = 'weapon' | 'armor' | 'lantern';

export type Terrain = 'ground' | 'rock' | 'water' | 'base';

export interface NodeData {
  kind: ResourceKind;     // what it yields
  amount: number;         // units remaining
  hp: number;             // harvest "hits" left (tool speed reduces hits)
}

export interface CreatureData {
  defId: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  band: number;
  bounty: Partial<Resources>; // dropped on kill
}

export interface Tile {
  col: number;
  row: number;
  band: number;           // 1..4 danger band (0 = base ring)
  terrain: Terrain;
  revealed: boolean;      // ever seen
  node: NodeData | null;
  creature: CreatureData | null;
  loot: ResourceKind | null; // wreck/cache marker (one-time)
}

export interface Hero {
  col: number;
  row: number;
  vigor: number;
  maxVigor: number;
  hp: number;
  maxHp: number;
  gear: Record<GearSlot, number>; // tier 0..4 (0 = none/starter)
}

export interface RivalState {
  menace: number;         // 0..100 visible armament
  canFire: boolean;       // crossed the fire threshold
  accuracy: number;       // 0..1 fire-back skill (difficulty)
  blunder: number;        // 0..1 chance to misplay on purpose
  lastTelegraph: number;  // last menace threshold announced
  // their hidden grid is owned by the battleship sim; this is the "clock" half
}

export type Phase = 'explore' | 'base' | 'battleship' | 'won' | 'lost';

export interface RunState {
  seed: number;
  seedStr: string;
  difficulty: DifficultyTier; // 1..3
  step: number;           // shared clock — every hero step advances it
  phase: Phase;
  resources: Resources;
  haul: Resources;        // resources gathered since the last time home (forfeit if downed deep)
  storageCap: number;
  buildings: Record<BuildingId, number>; // level, 0 = not built (keep starts 1)
  hero: Hero;
  rival: RivalState;
  // world + battleship grids are large; stored alongside but (de)serialised carefully
  worldW: number;
  worldH: number;
  basePos: { col: number; row: number };
  objectivesDone: string[]; // onboarding soft-objective ids completed
  over: boolean;
  result: 'won' | 'lost' | null;
}
