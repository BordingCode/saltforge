// Screen-space juice (Vlambeer/Eiserloh toolkit): trauma screenshake, impact flash, particle
// bursts, floating numbers, haptics. Works over BOTH the canvas world and the DOM duel/combat
// screens because it operates in client (screen) coordinates on a top #fx layer + a shake on #app.
// Respects prefers-reduced-motion (KB safety rule). Reserve the big effects for big moments.
const reduceMotion = (() => { try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
catch {
    return false;
} })();
let trauma = 0; // [0,1]; shake = trauma^2 so small events barely move, big ones pop
let appEl = null;
let fxEl = null;
export function initJuice(app, fx) { appEl = app; fxEl = fx; }
export function addTrauma(amount) { if (!reduceMotion)
    trauma = Math.min(1, trauma + amount); }
// Called once per frame from the render loop.
export function tickShake() {
    if (!appEl)
        return;
    if (trauma <= 0.001) {
        if (appEl.style.transform)
            appEl.style.transform = '';
        trauma = 0;
        return;
    }
    const s = trauma * trauma;
    const mag = 16 * s;
    const dx = (Math.random() * 2 - 1) * mag;
    const dy = (Math.random() * 2 - 1) * mag;
    const rot = (Math.random() * 2 - 1) * s * 1.4;
    appEl.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
    trauma = Math.max(0, trauma - 0.045);
}
export function flash(color, dur = 320) {
    if (reduceMotion || !fxEl)
        return;
    const f = document.createElement('div');
    f.className = 'fx-flash';
    f.style.background = color;
    fxEl.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = '0'; });
    setTimeout(() => f.remove(), dur);
}
export function burst(x, y, opts = {}) {
    if (reduceMotion || !fxEl)
        return;
    const { count = 12, color = '#e8b84b', spread = 64, size = 7 } = opts;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'fx-particle';
        const a = Math.random() * Math.PI * 2;
        const d = spread * (0.35 + Math.random() * 0.9);
        const sz = size * (0.5 + Math.random());
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.width = p.style.height = `${sz}px`;
        p.style.background = color;
        fxEl.appendChild(p);
        requestAnimationFrame(() => {
            p.style.transform = `translate(${(Math.cos(a) * d).toFixed(1)}px,${(Math.sin(a) * d).toFixed(1)}px) scale(0.2)`;
            p.style.opacity = '0';
        });
        setTimeout(() => p.remove(), 560);
    }
}
export function popText(x, y, text, color = '#fff') {
    if (!fxEl)
        return;
    const e = document.createElement('div');
    e.className = 'fx-pop';
    e.textContent = text;
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    e.style.color = color;
    fxEl.appendChild(e);
    requestAnimationFrame(() => { e.style.transform = 'translate(-50%, -46px)'; e.style.opacity = '0'; });
    setTimeout(() => e.remove(), 720);
}
export function haptic(ms) {
    if (reduceMotion)
        return;
    try {
        navigator.vibrate?.(ms);
    }
    catch { /* unsupported */ }
}
// Centre of a DOM element (by selector) in client coords — for placing bursts on grid cells etc.
export function centerOf(sel) {
    const el = document.querySelector(sel);
    if (!el)
        return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
// Briefly pop-scale an element (squash/stretch confirm) by re-triggering a keyframe.
export function pop(sel) {
    if (reduceMotion)
        return;
    const el = document.querySelector(sel);
    if (!el)
        return;
    el.classList.remove('fx-hit');
    void el.offsetWidth; // reflow to restart the animation
    el.classList.add('fx-hit');
}
