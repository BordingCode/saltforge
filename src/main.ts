// Boot: set up the canvas + render loop, wire input (tap-an-adjacent-tile + keyboard), show the
// title, and register the service worker. Game logic lives in the controller.
import { Game } from './state.js';
import { setupCanvas, screenToTile, type View } from './engine/canvas.js';
import { drawOverworld } from './render/overworld.js';
import { handlers, renderUI } from './controller.js';
// (Game + handlers exposed on window.__sf at boot for testing.)
import { unlockAudio } from './engine/audio.js';

let view: View;

function loop(ts: number): void {
  // advance hero step animation
  const a = Game.anim;
  if (a.heroFrom) { a.t += 0.14; if (a.t >= 1) { a.t = 1; a.heroFrom = null; } }
  if (view) drawOverworld(view);
  requestAnimationFrame(loop);
}

function tileDirFromTap(col: number, row: number): 'up' | 'down' | 'left' | 'right' | null {
  const run = Game.run; if (!run) return null;
  const dc = col - run.hero.col, dr = row - run.hero.row;
  if (Math.abs(dc) + Math.abs(dr) !== 1) return null;
  if (dc === 1) return 'right'; if (dc === -1) return 'left';
  if (dr === 1) return 'down'; if (dr === -1) return 'up';
  return null;
}

function wireInput(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (!Game.run) return;
    const rect = canvas.getBoundingClientRect();
    const { col, row } = screenToTile(view, e.clientX - rect.left, e.clientY - rect.top);
    const dir = tileDirFromTap(col, row);
    if (dir) handlers.move(dir);
  });

  window.addEventListener('keydown', (e) => {
    unlockAudio();
    const map: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    };
    if (map[e.key]) { e.preventDefault(); handlers.move(map[e.key]); }
  }, { passive: false });
}

function boot(): void {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  view = setupCanvas(canvas);
  wireInput(canvas);
  renderUI();
  requestAnimationFrame(loop);
  (window as any).__sf = { Game, handlers, renderUI }; // test/debug hook

  const splash = document.getElementById('splash');
  if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 500); }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
}

boot();
