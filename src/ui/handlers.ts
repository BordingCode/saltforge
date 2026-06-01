// The contract the controller implements and passes to each UI screen. Type-only import in the
// screens, so there's no runtime import cycle with the controller.
import type { BuildingId, GearSlot, DifficultyTier } from '../types.js';

export interface Handlers {
  move(dir: 'up' | 'down' | 'left' | 'right'): void;
  harvest(): void;
  grab(): void;
  openBase(): void;
  openBattleship(): void;
  closeOverlay(): void;
  upgrade(id: BuildingId): void;
  craft(slot: GearSlot): void;
  beginSalvo(): void;
  fireSalvo(col: number, row: number): void;
  scan(kind: 'line' | 'hot' | 'anchor'): void;
  pickHotCold(col: number, row: number): void;
  combatAttack(): void;
  combatFlee(): void;
  newGame(seedStr: string, difficulty: DifficultyTier): void;
  resume(): void;
  toMenu(): void;
  toggleMute(): void;
}
