export function setupCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const view = { canvas, ctx, w: 0, h: 0, dpr: 1, tile: 40, camX: 0, camY: 0 };
    const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        view.w = w;
        view.h = h;
        view.dpr = dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    return view;
}
// Centre camera on a world tile (col,row), clamped so we don't show beyond the map edges much.
export function centerOn(view, col, row, worldW, worldH) {
    // pick a tile size that shows a comfortable number of tiles on the smaller screen axis
    const visibleTiles = Math.min(11, Math.max(7, Math.floor(Math.min(view.w, view.h) / 46)));
    view.tile = Math.floor(Math.min(view.w, view.h) / visibleTiles);
    const cx = (col + 0.5) * view.tile;
    const cy = (row + 0.5) * view.tile;
    // Always keep the hero centred (biased slightly upward so it sits clear of the bottom controls).
    // Beyond the map edge we just show the water backdrop — natural for a coastal frontier — which
    // avoids clamping a corner base down behind the D-pad.
    view.camX = cx - view.w / 2;
    view.camY = cy - view.h * 0.42;
    void worldW;
    void worldH;
}
export const worldToScreenX = (view, col) => col * view.tile - view.camX;
export const worldToScreenY = (view, row) => row * view.tile - view.camY;
export function screenToTile(view, sx, sy) {
    return { col: Math.floor((sx + view.camX) / view.tile), row: Math.floor((sy + view.camY) / view.tile) };
}
