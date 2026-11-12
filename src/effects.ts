/**
 * Visual juice: fruit halves splitting apart, juice-splatter particles, and
 * floating score popups. All purely cosmetic — driven by dt, self-culling.
 */
import type { Fruit } from "./fruit.ts";

const GRAVITY = 1400;

interface Half {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  radius: number;
  color: string;
  inner: string;
  side: -1 | 1; // which half (flips the clip)
  life: number;
  ttl: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  ttl: number;
}

interface Popup {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  ttl: number;
}

export class Effects {
  private halves: Half[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];

  reset(): void {
    this.halves = [];
    this.particles = [];
    this.popups = [];
  }

  /** Spawn the split halves + juice spray + score popup for a sliced fruit. */
  splitFruit(f: Fruit): void {
    // Two halves fly apart perpendicular to a random cut angle.
    const push = 220;
    for (const side of [-1, 1] as const) {
      this.halves.push({
        x: f.x,
        y: f.y,
        vx: f.vx * 0.4 + side * push,
        vy: f.vy * 0.4 - 120,
        rot: f.rot,
        vrot: side * (2 + Math.random() * 3),
        radius: f.type.radius,
        color: f.type.color,
        inner: f.type.inner,
        side,
        life: 0,
        ttl: 1.3,
      });
    }

    // Juice splatter.
    const n = 14;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 320;
      this.particles.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 60,
        r: 3 + Math.random() * 5,
        color: f.type.inner,
        life: 0,
        ttl: 0.5 + Math.random() * 0.4,
      });
    }
  }

  /** Bomb explosion flash (red particles) when a bomb is hit. */
  explode(x: number, y: number): void {
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 160 + Math.random() * 420;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: 3 + Math.random() * 6,
        color: Math.random() < 0.5 ? "#ff4444" : "#ffd43b",
        life: 0,
        ttl: 0.5 + Math.random() * 0.5,
      });
    }
  }

  /** Floating "+N" / "COMBO" text. */
  popup(x: number, y: number, text: string, color = "#ffe066"): void {
    this.popups.push({ x, y, vy: -90, text, color, life: 0, ttl: 0.9 });
  }

  update(dt: number): void {
    for (const h of this.halves) {
      h.vy += GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.vrot * dt;
      h.life += dt;
    }
    this.halves = this.halves.filter((h) => h.life < h.ttl);

    for (const p of this.particles) {
      p.vy += GRAVITY * 0.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.ttl);

    for (const p of this.popups) {
      p.y += p.vy * dt;
      p.life += dt;
    }
    this.popups = this.popups.filter((p) => p.life < p.ttl);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Juice particles.
    for (const p of this.particles) {
      const alpha = 1 - p.life / p.ttl;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fruit halves — a half-disk (clipped circle) with flesh showing.
    for (const h of this.halves) {
      const alpha = 1 - Math.max(0, (h.life - h.ttl * 0.7) / (h.ttl * 0.3));
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot);

      // Clip to one half (left or right of center) so it reads as a cut.
      ctx.beginPath();
      if (h.side === 1) ctx.rect(0, -h.radius, h.radius, h.radius * 2);
      else ctx.rect(-h.radius, -h.radius, h.radius, h.radius * 2);
      ctx.clip();

      ctx.beginPath();
      ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
      ctx.fillStyle = h.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, h.radius * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = h.inner;
      ctx.fill();
      // Cut face highlight.
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(h.side === 1 ? 0 : -2, -h.radius, 2, h.radius * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Score popups.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.popups) {
      const alpha = 1 - p.life / p.ttl;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = "bold 34px system-ui";
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "rgba(5,7,13,0.8)";
      ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  get busy(): boolean {
    return this.halves.length > 0 || this.particles.length > 0 || this.popups.length > 0;
  }
}
