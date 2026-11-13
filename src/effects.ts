/**
 * Visual juice. Purely cosmetic, dt-driven, self-culling.
 *
 *  - Halves: the real fruit sprite clipped along the actual swipe angle, so a
 *    diagonal swipe gives diagonal halves that fly apart perpendicular to it.
 *  - Juice: droplets sprayed along the swipe, plus splats that stain the
 *    background and fade.
 *  - Slash flashes, score pop-ups, centered banners, bomb shockwaves.
 *  - Screen shake (trauma model) and full-screen flashes.
 */
import type { Fruit } from "./fruit.ts";
import { getSprite, SPRITE_PAD } from "./sprites.ts";

interface Half {
  sprite: HTMLCanvasElement | undefined;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  cut: number; // cut angle in the half's local frame
  side: 1 | -1;
  r: number;
  inner: string;
  life: number;
  ttl: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  ttl: number;
}

interface Splat {
  x: number;
  y: number;
  color: string;
  blobs: { dx: number; dy: number; r: number }[];
  life: number;
  ttl: number;
}

interface Slash {
  x: number;
  y: number;
  angle: number;
  len: number;
  life: number;
  ttl: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  ttl: number;
}

interface Banner {
  text: string;
  sub: string;
  color: string;
  life: number;
  ttl: number;
}

interface Ring {
  x: number;
  y: number;
  color: string;
  maxR: number;
  life: number;
  ttl: number;
}

const easeOutBack = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export class Effects {
  private halves: Half[] = [];
  private drops: Drop[] = [];
  private splats: Splat[] = [];
  private slashes: Slash[] = [];
  private popups: Popup[] = [];
  private banners: Banner[] = [];
  private rings: Ring[] = [];
  private trauma = 0;
  private flashA = 0;
  private flashColor = "255,255,255";
  private t = 0;
  scale = 1; // screen scale, set by the game

  reset(): void {
    this.halves = [];
    this.drops = [];
    this.splats = [];
    this.slashes = [];
    this.popups = [];
    this.banners = [];
    this.rings = [];
    this.trauma = 0;
    this.flashA = 0;
  }

  /** Split a fruit along the swipe angle into two tumbling halves + juice. */
  splitFruit(f: Fruit, angle: number): void {
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const push = 190 * this.scale;
    for (const side of [1, -1] as const) {
      this.halves.push({
        sprite: getSprite(f.type.name),
        x: f.x,
        y: f.y,
        vx: f.vx * 0.45 + side * nx * push + Math.cos(angle) * 60 * this.scale,
        vy: Math.min(f.vy * 0.45, 0) + side * ny * push - 80 * this.scale,
        rot: f.rot,
        vrot: side * (2.2 + Math.random() * 2.5),
        cut: angle - f.rot,
        side,
        r: f.r,
        inner: f.type.inner,
        life: 0,
        ttl: 1.6,
      });
    }
    // Juice: a spray along the swipe plus a radial puff.
    const n = 22;
    for (let i = 0; i < n; i++) {
      const along = i < n * 0.55;
      const a = along ? angle + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
      const sp = (along ? 260 + Math.random() * 420 : 90 + Math.random() * 260) * this.scale;
      this.drops.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60 * this.scale,
        r: (2.5 + Math.random() * 5) * this.scale,
        color: f.type.inner,
        life: 0,
        ttl: 0.45 + Math.random() * 0.45,
      });
    }
    this.addSplat(f.x, f.y, f.type.inner, f.r);
    this.slashes.push({ x: f.x, y: f.y, angle, len: f.r * 2.8, life: 0, ttl: 0.16 });
  }

  private addSplat(x: number, y: number, color: string, r: number): void {
    const blobs = [{ dx: 0, dy: 0, r: r * 0.55 }];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = r * (0.4 + Math.random() * 0.9);
      blobs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: r * (0.08 + Math.random() * 0.2) });
    }
    this.splats.push({ x, y, color, blobs, life: 0, ttl: 3.2 });
    if (this.splats.length > 26) this.splats.shift();
  }

  explode(x: number, y: number): void {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (160 + Math.random() * 640) * this.scale;
      this.drops.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: (3 + Math.random() * 7) * this.scale,
        color: ["#ff4d2e", "#ffb02e", "#ffe066", "#2b2f3a"][i % 4],
        life: 0,
        ttl: 0.5 + Math.random() * 0.6,
      });
    }
    this.rings.push({ x, y, color: "255,170,80", maxR: 260 * this.scale, life: 0, ttl: 0.45 });
    this.rings.push({ x, y, color: "255,255,255", maxR: 140 * this.scale, life: 0, ttl: 0.25 });
    this.shake(0.9);
    this.flash("255,90,60", 0.55);
  }

  /** A soft colored ring burst (specials, menu picks). */
  ring(x: number, y: number, color: string, maxR: number): void {
    this.rings.push({ x, y, color, maxR, life: 0, ttl: 0.5 });
  }

  popup(x: number, y: number, text: string, color = "#ffe066", size = 34): void {
    this.popups.push({ x, y, text, color, size: size * Math.max(0.75, this.scale), life: 0, ttl: 0.95 });
  }

  banner(text: string, sub = "", color = "#ffe066", ttl = 1.3): void {
    this.banners = [{ text, sub, color, life: 0, ttl }];
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  flash(rgb: string, alpha: number): void {
    this.flashColor = rgb;
    this.flashA = Math.max(this.flashA, alpha);
  }

  /** Camera offset for this frame (apply before drawing the world). */
  shakeOffset(): [number, number] {
    const s = this.trauma * this.trauma * 22 * this.scale;
    return [Math.sin(this.t * 97) * s, Math.cos(this.t * 83) * s];
  }

  update(dt: number, realDt: number): void {
    this.t += realDt;
    this.trauma = Math.max(0, this.trauma - realDt * 1.8);
    this.flashA = Math.max(0, this.flashA - realDt * 2.6);
    const g = 1400 * this.scale;

    for (const h of this.halves) {
      h.vy += g * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.vrot * dt;
      h.life += dt;
    }
    this.halves = this.halves.filter((h) => h.life < h.ttl);

    for (const d of this.drops) {
      d.vx *= 1 - 1.4 * dt; // air drag
      d.vy += g * 0.6 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life += dt;
    }
    this.drops = this.drops.filter((d) => d.life < d.ttl);

    for (const s of this.splats) s.life += realDt;
    this.splats = this.splats.filter((s) => s.life < s.ttl);
    for (const s of this.slashes) s.life += realDt;
    this.slashes = this.slashes.filter((s) => s.life < s.ttl);
    for (const p of this.popups) p.life += realDt;
    this.popups = this.popups.filter((p) => p.life < p.ttl);
    for (const b of this.banners) b.life += realDt;
    this.banners = this.banners.filter((b) => b.life < b.ttl);
    for (const r of this.rings) r.life += realDt;
    this.rings = this.rings.filter((r) => r.life < r.ttl);
  }

  /** Stains go under everything else. */
  drawUnder(ctx: CanvasRenderingContext2D): void {
    for (const s of this.splats) {
      const fade = s.life < 0.08 ? s.life / 0.08 : 1 - Math.max(0, (s.life - s.ttl * 0.5) / (s.ttl * 0.5));
      ctx.globalAlpha = Math.max(0, fade) * 0.55;
      ctx.fillStyle = s.color;
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(s.x + b.dx, s.y + b.dy, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawWorld(ctx: CanvasRenderingContext2D): void {
    // Fruit halves.
    for (const h of this.halves) {
      const fade = 1 - Math.max(0, (h.life - h.ttl * 0.75) / (h.ttl * 0.25));
      const d = h.r * 2 * SPRITE_PAD;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot + h.cut);
      ctx.beginPath();
      ctx.rect(-d, h.side > 0 ? 0 : -d, d * 2, d);
      ctx.clip();
      ctx.rotate(-h.cut);
      if (h.sprite) ctx.drawImage(h.sprite, -d / 2, -d / 2, d, d);
      ctx.rotate(h.cut);
      // the juicy cut face along the clip edge
      ctx.strokeStyle = h.inner;
      ctx.lineWidth = Math.max(3, h.r * 0.16);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-h.r * 0.72, 0);
      ctx.lineTo(h.r * 0.72, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Juice droplets.
    for (const d of this.drops) {
      ctx.globalAlpha = Math.max(0, 1 - d.life / d.ttl);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 - (d.life / d.ttl) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shockwave rings.
    for (const r of this.rings) {
      const k = r.life / r.ttl;
      ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.85})`;
      ctx.lineWidth = (1 - k) * 14 * this.scale + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxR * Math.sqrt(k), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Slash flashes: a bright line across the fruit that thins out.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.slashes) {
      const k = s.life / s.ttl;
      const dx = Math.cos(s.angle) * s.len * 0.5;
      const dy = Math.sin(s.angle) * s.len * 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
      ctx.lineWidth = (1 - k) * 10 * this.scale + 1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x - dx, s.y - dy);
      ctx.lineTo(s.x + dx, s.y + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Text and screen-space effects, drawn last and unaffected by shake. */
  drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.popups) {
      const k = p.life / p.ttl;
      const pop = k < 0.25 ? easeOutBack(k / 0.25) : 1;
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.font = `800 ${p.size * pop}px system-ui, -apple-system, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(5,7,13,0.85)";
      const y = p.y - k * 48 * this.scale;
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, y);
    }
    ctx.globalAlpha = 1;

    for (const b of this.banners) {
      const k = b.life / b.ttl;
      const pop = k < 0.2 ? easeOutBack(k / 0.2) : 1;
      ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const size = Math.min(w * 0.09, 78) * pop;
      ctx.font = `900 ${size}px system-ui, -apple-system, sans-serif`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(5,7,13,0.85)";
      ctx.strokeText(b.text, w / 2, h * 0.3);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, w / 2, h * 0.3);
      if (b.sub) {
        ctx.font = `700 ${size * 0.38}px system-ui, -apple-system, sans-serif`;
        ctx.lineWidth = 5;
        ctx.strokeText(b.sub, w / 2, h * 0.3 + size * 0.75);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(b.sub, w / 2, h * 0.3 + size * 0.75);
      }
    }
    ctx.globalAlpha = 1;

    if (this.flashA > 0.01) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flashA})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
