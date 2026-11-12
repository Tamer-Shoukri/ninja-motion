/**
 * Fruit physics + spawning.
 *
 * Fruits launch from just below the bottom edge with an upward velocity and a
 * sideways drift, then arc under gravity (classic Fruit Ninja toss). Everything
 * is in CANVAS PIXEL space so slice detection (also in canvas space) lines up.
 *
 * Coordinate note: the game world is NOT mirrored. The webcam video and the
 * hand landmarks are mirrored into this same space by the render layer, so a
 * fruit at x=100 is at the same visual spot as a mirrored fingertip at x=100.
 */

export interface FruitType {
  name: string;
  color: string;
  inner: string;
  radius: number;
}

export const FRUIT_TYPES: FruitType[] = [
  { name: "watermelon", color: "#2f9e44", inner: "#ff6b6b", radius: 46 },
  { name: "orange", color: "#e8871e", inner: "#ffd43b", radius: 38 },
  { name: "lime", color: "#74b816", inner: "#d8f5a2", radius: 34 },
  { name: "apple", color: "#e03131", inner: "#ffe3e3", radius: 38 },
  { name: "blueberry", color: "#3b5bdb", inner: "#91a7ff", radius: 30 },
];

export interface Fruit {
  id: number;
  type: FruitType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  sliced: boolean;
  isBomb: boolean;
}

const GRAVITY = 1400; // px/s^2 — tuned for a satisfying ~1.5s arc at 720p

export class FruitManager {
  fruits: Fruit[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private spawnInterval = 1.1; // seconds between spawns (driven by Game difficulty)

  reset(): void {
    this.fruits = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.1;
  }

  /** Launch one fruit (or bomb) from the bottom of a w×h play area. */
  spawn(w: number, h: number): void {
    const isBomb = Math.random() < 0.12;
    const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];

    const x = w * (0.15 + Math.random() * 0.7);
    const y = h + 60;

    const peak = h * (0.55 + Math.random() * 0.25);
    const vy = -Math.sqrt(2 * GRAVITY * peak);

    const toward = (w / 2 - x) / w; // -0.5..0.5
    const vx = toward * 260 + (Math.random() - 0.5) * 180;

    this.fruits.push({
      id: this.nextId++,
      type,
      x,
      y,
      vx,
      vy,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 4,
      sliced: false,
      isBomb,
    });
  }

  /**
   * Advance physics, auto-spawn, and cull fruit that fell off-screen.
   * Returns fruits that fell off-screen UN-sliced and were NOT bombs — the
   * caller treats each as a "miss" (costs a life). Bombs falling off are safe.
   */
  update(dt: number, w: number, h: number, spawnInterval: number): Fruit[] {
    this.spawnInterval = spawnInterval;
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawn(w, h);
    }

    for (const f of this.fruits) {
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vrot * dt;
    }

    const missed: Fruit[] = [];
    this.fruits = this.fruits.filter((f) => {
      if (f.y < h + 120) return true;
      // Fell off bottom.
      if (!f.sliced && !f.isBomb) missed.push(f);
      return false;
    });
    return missed;
  }
}
