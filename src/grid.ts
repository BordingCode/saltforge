// Grid helpers: coordinates, neighbours, Chebyshev/Manhattan distance, BFS (fog reveal,
// danger bands, return-pathing). Pure functions over (col,row) — no game state here.

export interface Cell { col: number; row: number; }

export const key = (c: number, r: number): string => `${c},${r}`;
export const cellKey = (cell: Cell): string => key(cell.col, cell.row);

export function inBounds(c: number, r: number, w: number, h: number): boolean {
  return c >= 0 && r >= 0 && c < w && r < h;
}

// 4-neighbour (orthogonal) — movement is orthogonal, tap an adjacent tile.
export function neighbours4(c: number, r: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  if (r > 0) out.push({ col: c, row: r - 1 });
  if (r < h - 1) out.push({ col: c, row: r + 1 });
  if (c > 0) out.push({ col: c - 1, row: r });
  if (c < w - 1) out.push({ col: c + 1, row: r });
  return out;
}

// 8-neighbour (for fog reveal radius / blast area).
export function neighbours8(c: number, r: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dc === 0 && dr === 0) continue;
    const nc = c + dc, nr = r + dr;
    if (inBounds(nc, nr, w, h)) out.push({ col: nc, row: nr });
  }
  return out;
}

export const chebyshev = (a: Cell, b: Cell): number => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
export const manhattan = (a: Cell, b: Cell): number => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
export const euclid = (a: Cell, b: Cell): number => Math.hypot(a.col - b.col, a.row - b.row);

// Cells within Chebyshev radius r of (c,row) — fog reveal / lantern radius.
export function within(c: number, row: number, radius: number, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
    const nc = c + dc, nr = row + dr;
    if (inBounds(nc, nr, w, h) && Math.max(Math.abs(dc), Math.abs(dr)) <= radius) out.push({ col: nc, row: nr });
  }
  return out;
}

// BFS shortest path length over passable cells (return-to-base distance). Returns -1 if unreachable.
export function bfsDistance(start: Cell, goal: Cell, passable: (c: number, r: number) => boolean, w: number, h: number): number {
  if (start.col === goal.col && start.row === goal.row) return 0;
  const seen = new Set<string>([cellKey(start)]);
  let frontier: Cell[] = [start];
  let dist = 0;
  while (frontier.length) {
    dist++;
    const nxt: Cell[] = [];
    for (const cell of frontier) {
      for (const n of neighbours4(cell.col, cell.row, w, h)) {
        const k = cellKey(n);
        if (seen.has(k) || !passable(n.col, n.row)) continue;
        if (n.col === goal.col && n.row === goal.row) return dist;
        seen.add(k);
        nxt.push(n);
      }
    }
    frontier = nxt;
  }
  return -1;
}
