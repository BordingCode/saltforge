// Seeded deterministic RNG (mulberry32). Same seed => same sequence. The ONLY source of
// randomness in world-gen / rival / battleship logic — never Math.random() in the sim, so runs
// are reproducible and the headless harness can brute-force-verify them. (Ported from Warbound.)

export class RNG {
  seed: number;
  state: number;
  constructor(seed = 0x9e3779b9) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  next(): number { // float in [0,1)
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); } // inclusive
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  chance(p: number): boolean { return this.next() < p; }
  save(): { seed: number; state: number } { return { seed: this.seed, state: this.state }; }
  load(s: { seed: number; state: number }): this { this.seed = s.seed >>> 0; this.state = s.state >>> 0; return this; }
}

// Stable uint32 from a string seed (shareable run codes).
export function seedFromString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Combine two integers into a new stable seed (per-subsystem seeds = hash(runSeed, salt)).
export function hashSeed(a: number, b: number): number {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
