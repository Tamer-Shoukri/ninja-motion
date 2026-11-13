/**
 * Fruit physics + wave spawning. Pure logic (no DOM) so it is unit-tested.
 *
 * Fruit launch from below the bottom edge and arc under gravity. Spawning is
 * wave-based: a wave is a small pattern (a scatter, a quick salvo from one
 * side, a symmetric pair) rather than one fruit at a time, which is what makes
 * Fruit Ninja feel like rhythm instead of whack-a-mole. Everything is in
 * canvas pixels, scaled to the screen so phones and big monitors play the same.
 */

export interface FruitType {
  name: string;
  emoji: string; // "" = custom-drawn sprite
  color: string; // rind (juice tint fallback)
  inner: string; // flesh: cut face + juice
  radius: number; // at the 720px reference height
}

export const FRUIT_TYPES: FruitType[] = [
  { name: "watermelon", emoji: "🍉", color: "#2f9e44", inner: "#ff5f6d", radius: 78 },
  { name: "strawberry", emoji: "🍓", color: "#e03131", inner: "#ff8fa3", radius: 60 },
  { name: "blueberry", emoji: "🫐", color: "#364fc7", inner: "#91a7ff", radius: 54 },
  { name: "raspberry", emoji: "", color: "#c2255c", inner: "#f783ac", radius: 56 },
  { name: "coconut", emoji: "🥥", color: "#8c5a2b", inner: "#fffbea", radius: 70 },
  { name: "apple", emoji: "🍎", color: "#e03131", inner: "#fff1d6", radius: 64 },
  { name: "orange", emoji: "🍊", color: "#e8871e", inner: "#ffc145", radius: 64 },
  { name: "banana", emoji: "🍌", color: "#f0c419", inner: "#fff3bf", radius: 66 },
  { name: "grapes", emoji: "🍇", color: "#6741d9", inner: "#c7b5ff", radius: 62 },
];

export const BOMB_TYPE: FruitType = { name: "bomb", emoji: "", color: "#1a1d26", inner: "#ff6b3d", radius: 58 };
export const FREEZE_TYPE: FruitType = { name: "freeze", emoji: "🍌", color: "#4dd4ff", inner: "#d6f5ff", radius: 66 };
export const FRENZY_TYPE: FruitType = { name: "frenzy", emoji: "🍌", color: "#ffb400", inner: "#fff0b3", radius: 66 };

export type FruitKind = "fruit" | "bomb" | "freeze" | "frenzy";

export interface Fruit {
  id: number;
  kind: FruitKind;
  type: FruitType;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  sliced: boolean;
  age: number;
}

export type Rng = () => number;

export const GRAVITY_REF = 1400; // px/s² at the 720px reference height

/** Screen scale relative to a 720px-tall reference, clamped for sanity. */
export function screenScale(w: number, h: number): number {
  return Math.max(0.55, Math.min(1.35, Math.min(h / 720, w / 900)));
}

export interface SpawnRules {
  interval: number; // seconds between waves
  waveMax: number; // largest wave size allowed right now
  bombChance: number; // per launched object
  specials: boolean; // freeze / frenzy bananas may appear
}

interface PendingLaunch {
  delay: number;
  launch: () => void;
}

export class FruitManager {
  fruits: Fruit[] = [];
  private nextId = 1;
  private waveTimer = 0.4;
  private queue: PendingLaunch[] = [];
  private frenzyLeft = 0;
  private frenzyTimer = 0;
  private w = 1280;
  private h = 720;
  /** Count of waves launched — exposed for tests/diagnostics. */
  waves = 0;

  constructor(private rng: Rng = Math.random) {}

  reset(): void {
    this.fruits = [];
    this.queue = [];
    this.waveTimer = 0.4;
    this.frenzyLeft = 0;
    this.waves = 0;
  }

  private get s(): number {
    return screenScale(this.w, this.h);
  }

  private make(kind: FruitKind, type: FruitType, x: number, y: number, vx: number, vy: number): Fruit {
    const f: Fruit = {
      id: this.nextId++,
      kind,
      type,
      x,
      y,
      r: type.radius * this.s,
      vx,
      vy,
      rot: this.rng() * Math.PI * 2,
      vrot: (this.rng() - 0.5) * 4,
      sliced: false,
      age: 0,
    };
    this.fruits.push(f);
    return f;
  }

  private pickFruit(): FruitType {
    return FRUIT_TYPES[Math.floor(this.rng() * FRUIT_TYPES.length)];
  }

  /** Launch one object from the bottom at horizontal fraction `fx`, peaking at fraction `peak` of height. */
  launchFrom(fx: number, peak: number, kind: FruitKind = "fruit", type?: FruitType): Fruit {
    const g = GRAVITY_REF * this.s;
    const x = this.w * fx;
    const y = this.h + 70 * this.s;
    const vy = -Math.sqrt(2 * g * (this.h * peak + 70 * this.s));
    // Drift toward the middle so fruit stays on screen through its arc.
    const vx = ((0.5 - fx) * 1.1 + (this.rng() - 0.5) * 0.35) * this.w * 0.55;
    const t = type ?? (kind === "bomb" ? BOMB_TYPE : kind === "freeze" ? FREEZE_TYPE : kind === "frenzy" ? FRENZY_TYPE : this.pickFruit());
    return this.make(kind, t, x, y, vx, vy);
  }

  /** Queue a wave following the given rules. */
  spawnWave(rules: SpawnRules): void {
    this.waves++;
    const size = 1 + Math.floor(this.rng() * rules.waveMax);
    const pattern = this.rng();
    const kindFor = (): FruitKind => (this.rng() < rules.bombChance ? "bomb" : "fruit");

    if (size >= 3 && pattern < 0.3) {
      // salvo: quick succession from one side, fanning across
      const fromLeft = this.rng() < 0.5;
      for (let i = 0; i < size; i++) {
        const fx = fromLeft ? 0.18 + i * 0.1 : 0.82 - i * 0.1;
        this.queue.push({ delay: i * 0.16, launch: () => this.launchFrom(fx, 0.55 + this.rng() * 0.2, kindFor()) });
      }
    } else if (size >= 2 && pattern < 0.5) {
      // mirrored pair(s): satisfying double slices
      for (let i = 0; i < Math.min(size, 4); i += 2) {
        const off = 0.12 + this.rng() * 0.18;
        const peak = 0.6 + this.rng() * 0.15;
        this.queue.push({ delay: i * 0.12, launch: () => this.launchFrom(0.5 - off, peak, kindFor()) });
        this.queue.push({ delay: i * 0.12, launch: () => this.launchFrom(0.5 + off, peak, kindFor()) });
      }
    } else {
      // scatter: simultaneous-ish random throws
      for (let i = 0; i < size; i++) {
        this.queue.push({ delay: this.rng() * 0.25, launch: () => this.launchFrom(0.15 + this.rng() * 0.7, 0.5 + this.rng() * 0.3, kindFor()) });
      }
    }

    if (rules.specials && this.rng() < 0.11) {
      const kind: FruitKind = this.rng() < 0.5 ? "freeze" : "frenzy";
      this.queue.push({ delay: 0.3, launch: () => this.launchFrom(0.3 + this.rng() * 0.4, 0.7, kind) });
    }
  }

  /** Frenzy: fruit pour in from both sides for `seconds`. */
  startFrenzy(seconds: number): void {
    this.frenzyLeft = seconds;
    this.frenzyTimer = 0;
  }

  get frenzyActive(): boolean {
    return this.frenzyLeft > 0;
  }

  private frenzyLaunch(): void {
    const fromLeft = this.rng() < 0.5;
    const s = this.s;
    const x = fromLeft ? -60 * s : this.w + 60 * s;
    const y = this.h * (0.55 + this.rng() * 0.25);
    const vx = (fromLeft ? 1 : -1) * (520 + this.rng() * 260) * s;
    const vy = -(520 + this.rng() * 300) * s;
    this.make("fruit", this.pickFruit(), x, y, vx, vy);
  }

  /**
   * Advance physics and spawning by `dt` seconds (already time-scaled).
   * Returns ordinary fruit that fell off-screen un-sliced (misses).
   * Bombs and specials falling away are never penalized.
   */
  update(dt: number, w: number, h: number, rules: SpawnRules | null): Fruit[] {
    this.w = w;
    this.h = h;
    const g = GRAVITY_REF * this.s;

    if (rules) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0 && this.queue.length === 0 && !this.frenzyActive) {
        this.spawnWave(rules);
        this.waveTimer = rules.interval;
      }
    }
    for (const q of this.queue) q.delay -= dt;
    const ready = this.queue.filter((q) => q.delay <= 0);
    this.queue = this.queue.filter((q) => q.delay > 0);
    for (const q of ready) q.launch();

    if (this.frenzyLeft > 0) {
      this.frenzyLeft -= dt;
      this.frenzyTimer -= dt;
      if (this.frenzyTimer <= 0) {
        this.frenzyLaunch();
        this.frenzyTimer = 0.11;
      }
    }

    for (const f of this.fruits) {
      f.vy += g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vrot * dt;
      f.age += dt;
    }

    const missed: Fruit[] = [];
    this.fruits = this.fruits.filter((f) => {
      const gone = f.y > h + f.r + 80 * this.s || (f.age > 1 && (f.x < -f.r * 3 || f.x > w + f.r * 3));
      if (!gone) return true;
      if (!f.sliced && f.kind === "fruit") missed.push(f);
      return false;
    });
    return missed;
  }

  remove(f: Fruit): void {
    this.fruits = this.fruits.filter((x) => x !== f);
  }
}
