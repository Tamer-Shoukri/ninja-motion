/**
 * Drawing for world objects and HUD. Stateless helpers over a 2D context in
 * CSS-pixel space (the canvas transform already applies device pixel ratio).
 */
import type { Fruit } from "./fruit.ts";
import type { BladePoint } from "./slicer.ts";
import { getSprite, SPRITE_PAD, FUSE_TIP } from "./sprites.ts";

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function drawFruit(ctx: CanvasRenderingContext2D, f: Fruit, t: number): void {
  const d = f.r * 2 * SPRITE_PAD;

  if (f.kind === "bomb") {
    // pulsing danger glow behind the bomb
    const pulse = 0.5 + 0.5 * Math.sin(t * 10 + f.id);
    const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.4, f.x, f.y, f.r * 1.7);
    g.addColorStop(0, `rgba(255,60,40,${0.25 + pulse * 0.25})`);
    g.addColorStop(1, "rgba(255,60,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 1.7, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.kind === "freeze" || f.kind === "frenzy") {
    // orbiting sparkles mark power-ups
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = f.kind === "freeze" ? "rgba(140,230,255,0.9)" : "rgba(255,210,90,0.9)";
    for (let i = 0; i < 6; i++) {
      const a = t * 3 + (i * Math.PI) / 3;
      const rr = f.r * (1.15 + 0.08 * Math.sin(t * 6 + i));
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 2.5 + (i % 2) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(f.x, f.y);
  // Bombs don't spin (keeps the fuse readable); fruit tumble.
  if (f.kind !== "bomb") ctx.rotate(f.rot);
  else ctx.rotate(Math.sin(t * 3 + f.id) * 0.15);
  const spr = getSprite(f.type.name);
  if (spr) ctx.drawImage(spr, -d / 2, -d / 2, d, d);
  if (f.kind === "bomb") {
    // crackling fuse spark
    const sx = FUSE_TIP.x * f.r;
    const sy = FUSE_TIP.y * f.r;
    const flick = 0.6 + Math.random() * 0.4;
    ctx.globalCompositeOperation = "lighter";
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, f.r * 0.45 * flick);
    sg.addColorStop(0, "rgba(255,255,220,1)");
    sg.addColorStop(0.3, "rgba(255,190,60,0.9)");
    sg.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, f.r * 0.45 * flick, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Blade trail as a tapered, glowing ribbon. Points are smoothed with midpoint
 * quadratic curves so a 30fps hand trail still reads as one fluid stroke.
 */
export function drawBlade(ctx: CanvasRenderingContext2D, pts: BladePoint[], ttl: number, scale: number, color = "142,230,200"): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  for (const [widthK, rgb, alphaK] of [
    [2.6, color, 0.22],
    [1.4, color, 0.5],
    [0.55, "255,255,255", 1],
  ] as const) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const life = 1 - b.age / ttl;
      if (life <= 0) continue;
      const fast = Math.min(1, b.speed / 1600);
      const w = (2 + 13 * fast) * life * widthK * scale;
      ctx.strokeStyle = `rgba(${rgb},${alphaK * life})`;
      ctx.lineWidth = Math.max(0.6, w);
      ctx.beginPath();
      const p0 = i > 1 ? pts[i - 2] : a;
      ctx.moveTo((p0.x + a.x) / 2, (p0.y + a.y) / 2);
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (i === pts.length - 1) ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  const tip = pts[pts.length - 1];
  if (tip.age < 60) {
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 16 * scale);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 16 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Small cursor for a tracked hand that isn't moving fast enough to cut. */
export function drawHandCursor(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, scale: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(142,230,200,0.85)";
  ctx.lineWidth = 2.5 * scale;
  ctx.beginPath();
  ctx.arc(x, y, (11 + Math.sin(t * 6) * 1.5) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, 3.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  color = "#eaf0ff",
  align: CanvasTextAlign = "left",
  weight = 800,
): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(5,7,13,0.8)";
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

export interface HudState {
  mode: "classic" | "arcade";
  score: number;
  scorePop: number; // 0..1 animation phase for the score bump
  best: number;
  chain: number;
  lives: number;
  maxLives: number;
  timeLeft: number;
  totalTime: number;
  freezeLeft: number;
}

export function drawHud(ctx: CanvasRenderingContext2D, w: number, s: HudState, scale: number, t: number): void {
  const k = Math.max(0.75, scale);
  const pad = 20 * k;
  // score with a bump when it changes
  const bump = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, s.scorePop));
  text(ctx, `${s.score}`, pad, pad + 26 * k, 46 * k * bump, "#ffe066");
  text(ctx, `BEST ${s.best}`, pad + 2, pad + 64 * k, 15 * k, "rgba(234,240,255,0.75)", "left", 700);
  if (s.chain >= 3) text(ctx, `CHAIN ×${s.chain}`, pad + 2, pad + 88 * k, 18 * k, "#8ee6c8");

  if (s.mode === "classic") {
    // lives as three blades-crossed hearts (lost ones dim)
    for (let i = 0; i < s.maxLives; i++) {
      const alive = i < s.lives;
      const x = w - pad - i * 40 * k;
      ctx.globalAlpha = alive ? 1 : 0.25;
      ctx.font = `${28 * k}px system-ui`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(alive ? "❤️" : "🖤", x, pad + 22 * k);
    }
    ctx.globalAlpha = 1;
  } else {
    // countdown ring + digits
    const cx = w - pad - 34 * k;
    const cy = pad + 34 * k;
    const R = 28 * k;
    const frac = s.timeLeft / s.totalTime;
    const urgent = s.timeLeft <= 10 && s.freezeLeft <= 0;
    const frozen = s.freezeLeft > 0;
    ctx.lineWidth = 6 * k;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = frozen ? "#7fe3ff" : urgent ? `rgba(255,90,90,${0.7 + 0.3 * Math.sin(t * 12)})` : "#8ee6c8";
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    text(ctx, `${Math.ceil(s.timeLeft)}`, cx, cy + 1, 22 * k * (urgent ? 1 + 0.08 * Math.sin(t * 12) : 1), frozen ? "#bff1ff" : "#ffffff", "center");
    if (frozen) text(ctx, `❄ ${s.freezeLeft.toFixed(1)}s`, cx, cy + R + 18 * k, 14 * k, "#bff1ff", "center", 700);
  }
}

/** Label + ring under a sliceable menu fruit. */
export function drawMenuTarget(ctx: CanvasRenderingContext2D, f: Fruit, label: string, sub: string, t: number, scale: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(t * 3 + f.x);
  ctx.save();
  ctx.strokeStyle = `rgba(142,230,200,${0.35 + pulse * 0.4})`;
  ctx.lineWidth = 3 * scale;
  ctx.setLineDash([10 * scale, 8 * scale]);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * 1.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  drawFruit(ctx, f, t);
  text(ctx, label, f.x, f.y + f.r * 1.45 + 30 * scale, 26 * scale, "#ffffff", "center", 900);
  if (sub) text(ctx, sub, f.x, f.y + f.r * 1.45 + 58 * scale, 14 * scale, "rgba(234,240,255,0.7)", "center", 600);
}
