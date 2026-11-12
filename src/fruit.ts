/**
 * Fruit physics + spawning + sprites.
 *
 * Fruits launch from just below the bottom edge with an upward velocity and a
 * sideways drift, then arc under gravity. Everything is in CANVAS PIXEL space
 * so slice detection (also in canvas space) lines up.
 *
 * Sprites: each fruit is rendered once from a high-DPI emoji into an offscreen
 * canvas, then blitted each frame. Recognizable, consistent, zero network, zero
 * licensing risk. `color`/`inner` remain for the split-halves flesh effect.
 */

export interface FruitType {
  name: string;
  emoji: string;
  color: string; // rind (for split halves)
  inner: string; // flesh (for split halves + juice)
  radius: number;
}

// Bigger, juicier roster. radius is the collision/draw radius in px.
export const FRUIT_TYPES: FruitType[] = [
  { name: "watermelon", emoji: "🍉", color: "#2f9e44", inner: "#ff6b6b", radius: 78 },
  { name: "strawberry", emoji: "🍓", color: "#e03131", inner: "#ffa8a8", radius: 60 },
  { name: "blueberry",  emoji: "🫐", color: "#364fc7", inner: "#91a7ff", radius: 54 },
  { name: "raspberry",  emoji: "",   color: "#c2255c", inner: "#f783ac", radius: 56 }, // custom-drawn (no emoji exists)
  { name: "coconut",    emoji: "🥥", color: "#8c5a2b", inner: "#fff9db", radius: 70 },
  { name: "apple",      emoji: "🍎", color: "#e03131", inner: "#ffe3e3", radius: 64 },
  { name: "orange",     emoji: "🍊", color: "#e8871e", inner: "#ffd43b", radius: 64 },
  { name: "banana",     emoji: "🍌", color: "#f0c419", inner: "#fff3bf", radius: 66 },
  { name: "grapes",     emoji: "🍇", color: "#6741d9", inner: "#b197fc", radius: 62 },
];

/**
 * Pre-render each fruit emoji into a crisp offscreen canvas sprite.
 * Called once after we know the device pixel ratio. Sprites are square,
 * sized to 2*radius*dpr, with the emoji centered.
 */
const spriteCache = new Map<string, HTMLCanvasElement>();

/** Hand-drawn raspberry: a cluster of magenta drupelets with a little leaf. */
function drawRaspberry(g: CanvasRenderingContext2D, size: number, dpr: number): void {
  const cx = size / 2;
  const cy = size / 2 + 3 * dpr;
  const R = size * 0.42; // overall berry radius
  const bead = R * 0.26;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.3)";
  g.shadowBlur = 6 * dpr;
  g.shadowOffsetY = 3 * dpr;
  // Drupelets arranged in rings.
  const rings = [
    { r: 0, n: 1 },
    { r: R * 0.42, n: 6 },
    { r: R * 0.78, n: 9 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + (ring.r ? 0.3 : 0);
      const bx = cx + Math.cos(a) * ring.r;
      const by = cy + Math.sin(a) * ring.r + R * 0.1;
      const grad = g.createRadialGradient(bx - bead * 0.3, by - bead * 0.3, bead * 0.2, bx, by, bead);
      grad.addColorStop(0, "#f06595");
      grad.addColorStop(1, "#a61e4d");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(bx, by, bead, 0, Math.PI * 2);
      g.fill();
      // Tiny highlight.
      g.shadowColor = "transparent";
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.arc(bx - bead * 0.3, by - bead * 0.35, bead * 0.28, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = "rgba(0,0,0,0.3)";
    }
  }
  // Little green leaf/stem on top.
  g.shadowColor = "transparent";
  g.fillStyle = "#2f9e44";
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.5;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * R * 0.1, cy - R * 0.95, bead * 0.7, bead * 0.3, a, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function buildSprites(dpr: number): void {
  spriteCache.clear();
  for (const t of FRUIT_TYPES) {
    const size = Math.ceil(t.radius * 2 * dpr);
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d")!;
    if (t.emoji) {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `${Math.floor(t.radius * 1.9 * dpr)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui`;
      g.shadowColor = "rgba(0,0,0,0.35)";
      g.shadowBlur = 8 * dpr;
      g.shadowOffsetY = 3 * dpr;
      g.fillText(t.emoji, size / 2, size / 2 + t.radius * 0.06 * dpr);
    } else {
      drawRaspberry(g, size, dpr);
    }
    spriteCache.set(t.name, c);
  }
}

export function getSprite(name: string): HTMLCanvasElement | undefined {
  return spriteCache.get(name);
}

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

const GRAVITY = 1400; // px/s^2

export class FruitManager {
  fruits: Fruit[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private spawnInterval = 1.1;

  reset(): void {
    this.fruits = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.1;
  }

  spawn(w: number, h: number): void {
    const isBomb = Math.random() < 0.12;
    const type = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];

    const x = w * (0.15 + Math.random() * 0.7);
    const y = h + 80;

    const peak = h * (0.55 + Math.random() * 0.25);
    const vy = -Math.sqrt(2 * GRAVITY * peak);

    const toward = (w / 2 - x) / w;
    const vx = toward * 260 + (Math.random() - 0.5) * 180;

    this.fruits.push({
      id: this.nextId++,
      type,
      x,
      y,
      vx,
      vy,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 3,
      sliced: false,
      isBomb,
    });
  }

  /**
   * Advance physics, auto-spawn, cull off-screen fruit.
   * Returns non-bomb fruit that fell off un-sliced (misses → combo break).
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
      if (f.y < h + 160) return true;
      if (!f.sliced && !f.isBomb) missed.push(f);
      return false;
    });
    return missed;
  }
}
