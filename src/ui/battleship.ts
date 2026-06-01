// Strike overlay — fire blind salvos at the rival's hidden grid and spend Watchtower scans to
// turn guesses into deductions. Turn model lives in the controller; this just renders + dispatches.
import { Game } from '../state.js';
import { el } from './dom.js';
import { isSunk, keepHealth, type Structure } from '../sim/battleship.js';
import {
  BS_GRID, RES_META, CANNON_SHOTS, SCAN_COST, DUEL_BASE_SHOTS, DUEL_MAX_SHOTS, DUEL_RAMP_EVERY, REINFORCE_COST,
} from '../config.js';
import type { Handlers } from './handlers.js';

export interface BSState {
  shotsLeft: number;
  scanUsed: boolean;
  mode: 'fire' | 'hotcold';
  message: string;
  duelTurn: number;   // turns survived this duel — drives the rival's escalating barrage
}

const k = (c: number, r: number) => `${c},${r}`;

export function renderBattleship(overlay: HTMLElement, bs: BSState, h: Handlers): HTMLElement {
  const run = Game.run!; const enemy = Game.enemy!; const mine = Game.mine!;
  const ammo = run.resources.firesalt;
  const cannon = CANNON_SHOTS[run.buildings.cannon] ?? 1;
  const wt = run.buildings.watchtower;

  // enemy cell lookup
  const occ = new Set<string>(enemy.structures.flatMap((s) => s.cells));
  const sunkCells = new Set<string>(enemy.structures.filter(isSunk).flatMap((s) => s.cells));

  const grid = el('div', { class: 'bs-grid', style: { gridTemplateColumns: `repeat(${BS_GRID}, 1fr)` } });
  for (let r = 0; r < BS_GRID; r++) for (let c = 0; c < BS_GRID; c++) {
    const cell = k(c, r);
    const shot = enemy.shots.has(cell);
    const hit = shot && occ.has(cell);
    let cls = 'bs-cell';
    if (sunkCells.has(cell)) cls += ' sunk';
    else if (hit) cls += ' hit';
    else if (shot) cls += ' miss';
    else if (enemy.knownShip.has(cell)) cls += ' know-ship';
    else if (enemy.knownEmpty.has(cell)) cls += ' know-empty';
    const label = sunkCells.has(cell) ? '✺' : hit ? '✕' : shot ? '·' : enemy.knownShip.has(cell) ? '◎' : '';
    grid.appendChild(el('button', {
      class: cls, onclick: () => onCell(c, r, bs, h),
    }, [label]));
  }

  // the two-keep race — the heart of the tension
  const theirs = keepHealth(enemy);
  const mineKh = keepHealth(mine);
  const barrage = Math.min(DUEL_MAX_SHOTS, DUEL_BASE_SHOTS[run.difficulty] + Math.floor(bs.duelTurn / DUEL_RAMP_EVERY));
  const rising = Math.floor((bs.duelTurn + 1) / DUEL_RAMP_EVERY) > Math.floor(bs.duelTurn / DUEL_RAMP_EVERY);
  const canReinforce = mineKh.hits > 0 && run.resources.firesalt >= 0 && (run.resources.iron >= (REINFORCE_COST.iron ?? 0));

  const scanBar = el('div', { class: 'scan-bar' }, [
    scanBtn('Scan a line', 'line', wt >= 1, SCAN_COST[1], bs, h),
    scanBtn('Hot / cold', 'hot', wt >= 2, SCAN_COST[2], bs, h),
    scanBtn('Reveal a berth', 'anchor', wt >= 3, SCAN_COST[3], bs, h),
  ]);

  return el('div', { class: 'sheet bs-sheet' }, [
    el('div', { class: 'sheet-head' }, [
      el('div', { class: 'sheet-title' }, ['Strike the Rival']),
      el('button', { class: 'close-x', onclick: () => h.closeOverlay() }, ['Retreat']),
    ]),
    // dual keep-health race
    el('div', { class: 'duel-race' }, [
      keepBar('THEIR KEEP', theirs.len - theirs.hits, theirs.len, 'enemy'),
      el('div', { class: 'vs' }, ['vs']),
      keepBar('YOUR KEEP', mineKh.len - mineKh.hits, mineKh.len, mineKh.sighted ? 'sighted' : 'mine'),
    ]),
    mineKh.sighted ? el('div', { class: 'sighted-warn' }, ['⚠ Your Keep is sighted — reinforce, or sink them first!']) : el('div', {}, []),
    el('div', { class: 'bs-info' }, [
      el('div', { class: 'bs-stat' }, [el('b', {}, [`${RES_META.firesalt.glyph} ${ammo}`]), ' Firesalt']),
      el('div', { class: 'bs-stat' }, [el('b', {}, [`${bs.shotsLeft}`]), ` shots (Battery ${cannon}/turn)`]),
      el('div', { class: `bs-stat ${barrage >= 4 ? 'danger' : ''}` }, ['Rival barrage ', el('b', {}, [`${barrage}`]), rising ? ' ▲ rising' : '']),
    ]),
    el('div', { class: 'bs-msg' }, [bs.message || (bs.mode === 'hotcold' ? 'Tap a cell to read its distance.' : 'Tap a cell to fire.')]),
    grid,
    scanBar,
    el('div', { class: 'bs-actions' }, [
      ammo <= 0 && bs.shotsLeft <= 0
        ? el('div', { class: 'hint big' }, ['Out of Firesalt — retreat to the Saltmaw for more (they keep firing).'])
        : el('button', { class: 'buy wide', onclick: () => h.beginSalvo() }, [bs.shotsLeft > 0 ? 'End turn — rival fires' : `Load salvo  (${RES_META.firesalt.glyph}1)`]),
      mineKh.hits > 0
        ? el('button', { class: `buy wide ${canReinforce ? 'ghost' : 'disabled'}`, onclick: () => { if (canReinforce) h.reinforce(); } },
            [`Reinforce Keep  (${REINFORCE_COST.iron} ${RES_META.iron.glyph}, hold fire)`])
        : el('div', {}, []),
    ]),
  ]);
}

function keepBar(label: string, intact: number, len: number, tone: string): HTMLElement {
  const pips = el('div', { class: 'keep-pips' }, Array.from({ length: len }, (_, i) =>
    el('span', { class: `pip ${i < intact ? 'on' : 'off'} ${tone}` }, [])));
  return el('div', { class: `keep-side ${tone}` }, [
    el('div', { class: 'keep-label' }, [label]),
    pips,
    el('div', { class: 'keep-num' }, [`${intact}/${len}`]),
  ]);
}

function onCell(c: number, r: number, bs: BSState, h: Handlers): void {
  if (bs.mode === 'hotcold') { h.pickHotCold(c, r); return; }
  if (bs.shotsLeft <= 0) { bs.message = 'No shots left — load a salvo.'; return; }
  h.fireSalvo(c, r);
}

function scanBtn(label: string, kind: 'line' | 'hot' | 'anchor', avail: boolean, cost: any, bs: BSState, h: Handlers): HTMLElement {
  const ammo = Game.run!.resources.firesalt;
  const costN = cost.firesalt ?? 0;
  const ok = avail && !bs.scanUsed && ammo >= costN;
  return el('button', { class: `scan ${ok ? '' : 'disabled'}`, onclick: () => { if (ok) h.scan(kind); } }, [
    label, costN ? el('span', { class: 'scan-cost' }, [` ${RES_META.firesalt.glyph}${costN}`]) : el('span', {}, []),
  ]);
}
