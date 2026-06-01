// The controller: implements every UI Handler, owns overlay/combat/battleship turn state, and
// refreshes the DOM after each action. The canvas world redraws continuously in main's loop.
import { Game, newRun, loadRun, saveRun } from './state.js';
import { RNG, hashSeed } from './rng.js';
import {
  tryMove, moveInto, harvest, grabLoot, grant, toast as queueToast, forceDowned, winRun, loseRun,
} from './world/actions.js';
import { tileAt } from './world/worldgen.js';
import { exchange, flee } from './sim/combat.js';
import { upgradeBuilding, craftGear, canAfford, pay } from './economy.js';
import {
  playerFire, scanLine, scanHotCold, scanAnchor, rivalFire, keepSunk, keepHealth, repairKeep,
} from './sim/battleship.js';
import {
  CANNON_SHOTS, SCAN_COST, BASE_POS, DUEL_BASE_SHOTS, DUEL_MAX_SHOTS, DUEL_RAMP_EVERY, REINFORCE_COST,
} from './config.js';
import { sfx, setMuted, isMuted } from './engine/audio.js';
import { el, $, clear, showToast } from './ui/dom.js';
import { renderExploreHUD } from './ui/explore.js';
import { renderBase } from './ui/base.js';
import { renderBattleship, type BSState } from './ui/battleship.js';
import { renderCombat } from './ui/combat.js';
import { renderTitle, renderEnd } from './ui/menu.js';
import type { Handlers } from './ui/handlers.js';
import type { CreatureData, Tile, BuildingId, GearSlot, DifficultyTier } from './types.js';

type Overlay = 'title' | 'none' | 'base' | 'battleship' | 'combat' | 'end';
let overlay: Overlay = 'title';
let encounter: { creature: CreatureData; tile: Tile; log: string[] } | null = null;
let bsTurn = 0;
const bs: BSState = { shotsLeft: 0, scanUsed: false, mode: 'fire', message: '', duelTurn: 0 };

function flush(): void { while (Game.toastQueue.length) showToast(Game.toastQueue.shift()!); }
function afterAction(): void { flush(); if (Game.run?.over) toEnd(); else renderUI(); saveRun(); }

function toEnd(): void { overlay = 'end'; renderUI(); }

// ---- Handlers ------------------------------------------------------------------------------
export const handlers: Handlers = {
  move(dir) {
    if (overlay !== 'none' || !Game.run || Game.run.over) return;
    const out = tryMove(dir);
    if (out.encounter) { openCombat(out.encounter); return; }
    if (out.moved) { sfx.step(); if (out.downed) sfx.hurt(); }
    afterAction();
  },
  harvest() { if (harvest()) sfx.harvest(); afterAction(); },
  grab() { if (grabLoot()) sfx.loot(); afterAction(); },
  openBase() { if (Game.run && !Game.run.over) { overlay = 'base'; renderUI(); } },
  openBattleship() {
    const run = Game.run; if (!run || run.over) return;
    if (run.hero.col !== BASE_POS.col || run.hero.row !== BASE_POS.row) { queueToast('Return home to strike.'); flush(); return; }
    overlay = 'battleship'; bs.shotsLeft = 0; bs.scanUsed = false; bs.mode = 'fire'; bs.duelTurn = 0;
    bs.message = 'Load a salvo to open fire. Their guns answer — and sharpen the longer you take.';
    renderUI();
  },
  closeOverlay() { overlay = 'none'; renderUI(); saveRun(); },
  upgrade(id: BuildingId) {
    const res = upgradeBuilding(id);
    if (res.ok) sfx.build(); else if (res.reason) queueToast(res.reason);
    afterAction();
  },
  craft(slot: GearSlot) {
    const res = craftGear(slot);
    if (res.ok) sfx.craft(); else if (res.reason) queueToast(res.reason);
    afterAction();
  },
  beginSalvo() { beginOrEndSalvo(); },
  reinforce() { doReinforce(); },
  fireSalvo(c, r) { doFire(c, r); },
  scan(kind) { doScan(kind); },
  pickHotCold(c, r) { doHotCold(c, r); },
  combatAttack() { doAttack(); },
  combatFlee() { doFlee(); },
  newGame(seedStr: string, difficulty: DifficultyTier) {
    newRun(seedStr, difficulty);
    overlay = 'none'; encounter = null;
    queueToast('Wash ashore. Gather Timber & Salt, then raise a Saltern and a Forge.');
    afterAction();
  },
  resume() { if (loadRun()) { overlay = 'none'; renderUI(); } },
  toMenu() { overlay = 'title'; renderUI(); },
  toggleMute() { setMuted(!isMuted()); renderUI(); },
};

// ---- combat --------------------------------------------------------------------------------
function openCombat(tile: Tile): void {
  if (!tile.creature) return;
  encounter = { creature: tile.creature, tile, log: [`A ${tile.creature.name} blocks your path.`] };
  overlay = 'combat'; renderUI();
}
function doAttack(): void {
  if (!encounter) return;
  const run = Game.run!;
  const ex = exchange(run.hero, encounter.creature);
  encounter.log.push(ex.log);
  sfx.hit();
  if (ex.creatureDead) {
    const b = encounter.creature.bounty;
    Object.entries(b).forEach(([k, v]) => grant(k as any, v as number));
    const bounty = Object.entries(b).map(([k, v]) => `${v} ${k}`).join(', ');
    queueToast(`${encounter.creature.name} falls. Loot: ${bounty}.`);
    const tile = encounter.tile; tile.creature = null;
    encounter = null; overlay = 'none';
    moveInto(tile.col, tile.row);
    afterAction();
    return;
  }
  if (ex.creatureDmg > 0) sfx.hurt();
  if (ex.heroDowned) { encounter = null; overlay = 'none'; forceDowned(); afterAction(); return; }
  renderUI();
}
function doFlee(): void {
  if (!encounter) return;
  const dmg = flee(Game.run!.hero, encounter.creature);
  sfx.flee();
  queueToast(dmg > 0 ? `You break away (-${dmg} HP).` : 'You slip away clean.');
  const downed = Game.run!.hero.hp <= 0;
  encounter = null; overlay = 'none';
  if (downed) forceDowned();
  afterAction();
}

// ---- battleship turns ----------------------------------------------------------------------
function rng(salt: number): RNG { return new RNG(hashSeed(Game.run!.seed, (bsTurn << 8) ^ salt ^ Game.run!.step)); }

function beginOrEndSalvo(): void {
  const run = Game.run!;
  if (bs.shotsLeft > 0) { endPlayerTurn(); return; }
  if (run.resources.firesalt < 1) { queueToast('No Firesalt — sail to the Saltmaw.'); flush(); return; }
  run.resources.firesalt -= 1;
  bs.shotsLeft = CANNON_SHOTS[run.buildings.cannon] ?? 1;
  bs.scanUsed = false;
  bs.message = `Salvo loaded — ${bs.shotsLeft} shot${bs.shotsLeft > 1 ? 's' : ''}.`;
  sfx.salvoFire();
  renderUI(); saveRun();
}
function doFire(c: number, r: number): void {
  if (bs.shotsLeft <= 0) { bs.message = 'No shots — load a salvo.'; renderUI(); return; }
  const res = playerFire(Game.enemy!, c, r);
  if (res.alreadyShot) { bs.message = 'Already struck there.'; renderUI(); return; }
  bs.shotsLeft--;
  if (res.hit) { sfx.salvoHit(); bs.message = res.sunk ? `Sunk their ${res.sunk.kind}!` : 'A hit!'; }
  else { sfx.splash(); bs.message = 'Splash — into open water.'; }
  if (res.won) { winRun(); sfx.win(); flush(); toEnd(); saveRun(); return; }
  if (bs.shotsLeft <= 0) bs.message += ' Salvo spent — end the turn.';
  renderUI(); saveRun();
}
function endPlayerTurn(): void { bsTurn++; rivalBarrage(); }

// The rival's return barrage — its size ESCALATES with each duel turn survived, so a drawn-out
// hunt gets you overwhelmed. Returns early (to the end screen) if your Keep falls.
function rivalBarrage(): void {
  const run = Game.run!;
  const shots = Math.min(DUEL_MAX_SHOTS, DUEL_BASE_SHOTS[run.difficulty] + Math.floor(bs.duelTurn / DUEL_RAMP_EVERY));
  let hits = 0; let sunk = '';
  for (let i = 0; i < shots; i++) {
    const shot = rivalFire(Game.mine!, run.difficulty, rng(0x9 + i));
    if (shot?.hit) { hits++; if (shot.sunk) sunk = shot.sunk.kind; }
    if (shot?.wonForRival || keepSunk(Game.mine!)) { loseRun(); sfx.lose(); flush(); toEnd(); saveRun(); return; }
  }
  run.rival.menace = Math.min(100, run.rival.menace + 1.5);
  run.step++;
  bs.duelTurn++;
  bs.shotsLeft = 0;
  const kh = keepHealth(Game.mine!);
  bs.message = hits
    ? (sunk ? `Their guns sink your ${sunk}!` : `Rival barrage: ${hits} hit${hits > 1 ? 's' : ''}${kh.sighted ? ' — your KEEP is sighted! Reinforce or finish them.' : '.'}`)
    : 'The rival fires — and misses.';
  if (hits) sfx.hurt();
  renderUI(); saveRun();
}

// Reinforce: forfeit your salvo this turn to patch your Keep + break the rival's lock (then they fire).
function doReinforce(): void {
  const run = Game.run!;
  const kh = keepHealth(Game.mine!);
  if (kh.hits === 0) { bs.message = 'Your Keep is unscathed — pour fire into them instead.'; renderUI(); return; }
  if (!canAfford(REINFORCE_COST)) { queueToast(`Need ${REINFORCE_COST.iron} Iron to reinforce the Keep.`); flush(); return; }
  pay(REINFORCE_COST);
  repairKeep(Game.mine!);
  sfx.build();
  bs.message = 'You shore up the Keep and scatter their lock — guns silent this turn.';
  bsTurn++;
  rivalBarrage();
}
function doScan(kind: 'line' | 'hot' | 'anchor'): void {
  const run = Game.run!;
  if (bs.scanUsed) { bs.message = 'Only one scan per turn.'; renderUI(); return; }
  const lvl = kind === 'line' ? 1 : kind === 'hot' ? 2 : 3;
  const cost = SCAN_COST[lvl]?.firesalt ?? 0;
  if (run.buildings.watchtower < lvl) { queueToast('Watchtower not high enough.'); flush(); return; }
  if (run.resources.firesalt < cost) { queueToast('Not enough Firesalt to scan.'); flush(); return; }
  run.resources.firesalt -= cost;
  if (kind === 'line') { const res = scanLine(Game.enemy!, rng(11)); bs.message = `Scan: ${res.kind} ${res.index + 1} — ${res.cells.length} cells are open water.`; bs.scanUsed = true; sfx.scan(); }
  else if (kind === 'anchor') { const cell = scanAnchor(Game.enemy!, rng(22)); bs.message = cell ? 'A berth is revealed — a structure sits there.' : 'Nothing left to reveal.'; bs.scanUsed = true; sfx.scan(); }
  else { bs.mode = 'hotcold'; bs.message = 'Hot/cold ready — tap any cell.'; sfx.scan(); }
  renderUI(); saveRun();
}
function doHotCold(c: number, r: number): void {
  const d = scanHotCold(Game.enemy!, c, r);
  bs.message = d < 0 ? 'The grid reads empty?!' : d === 0 ? 'A structure lies in THIS very cell.' : `Nearest structure: ${d} cell${d > 1 ? 's' : ''} away.`;
  bs.mode = 'fire'; bs.scanUsed = true; sfx.scan();
  renderUI(); saveRun();
}

// ---- render orchestration ------------------------------------------------------------------
export function renderUI(): void {
  const hud = $('#hud'); const ov = $('#overlay');
  if (!hud || !ov) return;

  if (!Game.run || overlay === 'title') { clear(hud); ov.replaceChildren(renderTitle(ov, handlers)); return; }
  if (overlay === 'end' || Game.run.over) { clear(hud); ov.replaceChildren(renderEnd(ov, Game.run.result === 'won', handlers)); return; }

  // explore HUD is the base layer
  renderExploreHUD(hud, handlers);

  if (overlay === 'base') ov.replaceChildren(renderBase(ov, handlers));
  else if (overlay === 'battleship') ov.replaceChildren(renderBattleship(ov, bs, handlers));
  else if (overlay === 'combat' && encounter) ov.replaceChildren(renderCombat(ov, encounter.creature, encounter.log, handlers));
  else clear(ov);
}

export function bootOverlay(): Overlay { return overlay; }
export function setOverlay(o: Overlay): void { overlay = o; }
