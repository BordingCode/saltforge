// New-player onboarding: a short intro card (first run only) + a contextual objective ribbon that
// walks through the whole loop, auto-advancing as the player actually does each step. Teaches by
// doing, one concept at a time (KB ui-ux). Persisted so it never nags returning players; skippable.
import { Game } from './state.js';

const TKEY = 'saltforge_tutorial_v1';

interface TMeta { introSeen: boolean; done: boolean; }
let meta: TMeta = (() => {
  try { const m = JSON.parse(localStorage.getItem(TKEY) || '{}'); return { introSeen: !!m.introSeen, done: !!m.done }; }
  catch { return { introSeen: false, done: false }; }
})();
function persist(): void { try { localStorage.setItem(TKEY, JSON.stringify(meta)); } catch { /* ignore */ } }

export function tutorialActive(): boolean { return !meta.done; }
export function shouldShowIntro(): boolean { return !meta.introSeen; }
export function markIntroSeen(): void { if (!meta.introSeen) { meta.introSeen = true; persist(); } }
export function completeTutorial(): void { if (!meta.done) { meta.done = true; persist(); } }

// Each stage = one loop concept; `done` reads live game state (or a tagged event in objectivesDone).
interface Stage { text: string; done: () => boolean; }
const STAGES: Stage[] = [
  { text: 'Explore the fog — tap a tile next to your hero, then stand on a resource and tap Harvest.',
    done: () => { const r = Game.run; return !!r && (r.resources.timber > 6 || r.resources.iron > 0 || r.resources.firesalt > 0 || r.resources.salt > 12); } },
  { text: 'Haul it home, open Base, and build a Forge (needs Timber + Salt).',
    done: () => !!Game.run && Game.run.buildings.forge >= 1 },
  { text: 'At the Forge, craft a Weapon so you can fight your way deeper.',
    done: () => !!Game.run && Game.run.hero.gear.weapon >= 1 },
  { text: 'Push into the Marsh for Iron — it builds nearly everything that matters.',
    done: () => !!Game.run && Game.run.resources.iron >= 6 },
  { text: 'Build a Cannon Battery and a Watchtower — your guns, and your eyes on the enemy grid.',
    done: () => !!Game.run && Game.run.buildings.cannon >= 1 && Game.run.buildings.watchtower >= 1 },
  { text: 'Brave the Saltmaw, the deepest band — only it holds Firesalt, your salvo ammo.',
    done: () => !!Game.run && Game.run.resources.firesalt >= 1 },
  { text: 'Return home and tap Strike — spend a Scan to deduce, then fire blind salvos at their Keep.',
    done: () => !!Game.run && Game.run.objectivesDone.includes('struck') },
];

export function currentStage(): { n: number; total: number; text: string } | null {
  if (meta.done || !Game.run) return null;
  for (let i = 0; i < STAGES.length; i++) if (!STAGES[i].done()) return { n: i + 1, total: STAGES.length, text: STAGES[i].text };
  return null; // every stage cleared
}
export function allStagesDone(): boolean { return !!Game.run && STAGES.every((s) => s.done()); }

// First-time hint copy for the intro card.
export const INTRO_LINES: Array<[string, string]> = [
  ['Explore & gather', 'Steer your hero into the fog. Harvest Salt, Timber, Iron — and, in the deep, Firesalt.'],
  ['Forge your hold', 'Haul it home to raise buildings and arm your hero, so you can survive ever deeper.'],
  ['Sink the rival', 'A hidden enemy is doing the same. Scout their grid and fire blind salvos to smash their Keep — before they smash yours.'],
];
