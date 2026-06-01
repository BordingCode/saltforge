// Procedural Web Audio — gentle, warm, never harsh (Mathias's standing audio note). Soft
// envelopes, low-pass on noise, a pentatonic-ish palette. Unlocked on first user gesture.
let ctx = null;
let master = null;
let muted = false;
function ensure() {
    if (ctx)
        return ctx;
    try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
    }
    catch {
        ctx = null;
    }
    return ctx;
}
export function unlockAudio() { const c = ensure(); if (c && c.state === 'suspended')
    c.resume(); }
export function setMuted(m) { muted = m; if (master)
    master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }
function tone(freq, dur, type = 'sine', gain = 0.3, when = 0) {
    const c = ensure();
    if (!c || !master || muted)
        return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
}
function noise(dur, cutoff, gain = 0.25, when = 0) {
    const c = ensure();
    if (!c || !master || muted)
        return;
    const t = c.currentTime + when;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(lp);
    lp.connect(g);
    g.connect(master);
    src.start(t);
}
const PENT = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99]; // G A C D E G
export const sfx = {
    step() { noise(0.08, 900, 0.10); },
    harvest() { tone(523.25, 0.12, 'triangle', 0.22); noise(0.1, 1400, 0.12, 0.02); },
    loot() { tone(659.25, 0.1, 'triangle', 0.25); tone(987.77, 0.16, 'sine', 0.2, 0.08); },
    build() { tone(330, 0.14, 'sine', 0.28); tone(495, 0.2, 'sine', 0.22, 0.06); noise(0.12, 600, 0.14, 0.0); },
    craft() { tone(440, 0.1, 'sine', 0.26); tone(660, 0.14, 'triangle', 0.22, 0.07); },
    hit() { const v = 1 + (Math.random() - 0.5) * 0.08; noise(0.09, 1800, 0.22); tone(200 * v, 0.1, 'square', 0.14); tone(90 * v, 0.14, 'sine', 0.18); },
    hurt() { noise(0.14, 600, 0.22); tone(140, 0.2, 'sawtooth', 0.2); tone(70, 0.28, 'sine', 0.22, 0.0); },
    flee() { tone(294, 0.12, 'sine', 0.2); tone(247, 0.18, 'sine', 0.16, 0.06); },
    salvoFire() { tone(120, 0.18, 'sine', 0.26); noise(0.22, 700, 0.2, 0.02); tone(60, 0.26, 'sine', 0.2, 0.0); },
    splash() { noise(0.3, 1000, 0.16); tone(220, 0.12, 'sine', 0.08); },
    salvoHit() { const v = 1 + (Math.random() - 0.5) * 0.1; noise(0.16, 2600, 0.3); tone(170 * v, 0.22, 'square', 0.2); tone(72, 0.34, 'sine', 0.26, 0.02); },
    explode() { noise(0.5, 1600, 0.34); noise(0.5, 320, 0.3, 0.02); tone(55, 0.5, 'sine', 0.32, 0.0); tone(82, 0.34, 'triangle', 0.2, 0.03); },
    scan() { tone(659.25, 0.08, 'sine', 0.18); tone(880, 0.12, 'sine', 0.16, 0.06); tone(1175, 0.14, 'sine', 0.12, 0.12); },
    menace() { tone(110, 0.5, 'sine', 0.18); tone(146.83, 0.5, 'sine', 0.14, 0.05); },
    win() { PENT.slice(0, 5).forEach((f, i) => tone(f, 0.4, 'triangle', 0.26, i * 0.12)); },
    lose() { [330, 294, 247, 196].forEach((f, i) => tone(f, 0.5, 'sine', 0.22, i * 0.14)); },
};
