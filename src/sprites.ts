/**
 * Pre-rendered sprites. Every sprite is drawn once into an offscreen canvas at
 * device resolution and blitted each frame.
 *
 * Fruit use the system's HD emoji (recognizable, zero licensing risk, nothing
 * to download); raspberry and the bomb are hand-drawn because no suitable
 * emoji exists. Specials are tinted, glowing bananas.
 */
import { FRUIT_TYPES, BOMB_TYPE, FREEZE_TYPE, FRENZY_TYPE, type FruitType } from "./fruit.ts";

/** Sprites are a bit larger than the hit radius so glows/shadows aren't clipped. */
export const SPRITE_PAD = 1.18;

const cache = new Map<string, HTMLCanvasElement>();
const EMOJI_FONT = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui`;

export function getSprite(name: string): HTMLCanvasElement | undefined {
  return cache.get(name);
}

/** Build all sprites for a device pixel ratio and screen scale. */
export function buildSprites(dpr: number, scale: number): void {
  cache.clear();
  for (const t of [...FRUIT_TYPES, BOMB_TYPE, FREEZE_TYPE, FRENZY_TYPE]) {
    const r = t.radius * scale * dpr; // device px
    const size = Math.ceil(r * 2 * SPRITE_PAD);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    const cx = size / 2;
    if (t.name === "bomb") drawBomb(g, cx, r);
    else if (t.name === "raspberry") drawRaspberry(g, cx, r, dpr);
    else if (t.name === "freeze" || t.name === "frenzy") drawSpecial(g, t, cx, r, dpr);
    else drawEmoji(g, t.emoji, cx, r, dpr);
    cache.set(t.name, c);
  }
}

function drawEmoji(g: CanvasRenderingContext2D, emoji: string, cx: number, r: number, dpr: number): void {
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${Math.floor(r * 1.9)}px ${EMOJI_FONT}`;
  g.shadowColor = "rgba(0,0,0,0.4)";
  g.shadowBlur = 9 * dpr;
  g.shadowOffsetY = 4 * dpr;
  g.fillText(emoji, cx, cx + r * 0.06);
}

function drawSpecial(g: CanvasRenderingContext2D, t: FruitType, cx: number, r: number, dpr: number): void {
  const glow = t.name === "freeze" ? "rgba(90,220,255,1)" : "rgba(255,190,40,1)";
  const tint = t.name === "freeze" ? "rgba(110,215,255,0.55)" : "rgba(255,200,40,0.35)";
  // Draw the banana into a scratch canvas so the tint only touches the glyph.
  const s = document.createElement("canvas");
  s.width = s.height = g.canvas.width;
  const sg = s.getContext("2d")!;
  sg.textAlign = "center";
  sg.textBaseline = "middle";
  sg.font = `${Math.floor(r * 1.75)}px ${EMOJI_FONT}`;
  sg.fillText(t.emoji, cx, cx + r * 0.06);
  sg.globalCompositeOperation = "source-atop";
  sg.fillStyle = tint;
  sg.fillRect(0, 0, s.width, s.height);
  g.shadowColor = glow;
  g.shadowBlur = 22 * dpr;
  g.drawImage(s, 0, 0);
  g.shadowBlur = 8 * dpr;
  g.drawImage(s, 0, 0);
}

function drawBomb(g: CanvasRenderingContext2D, cx: number, r: number): void {
  const R = r * 0.82;
  const cy = cx + r * 0.08;
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = r * 0.18;
  g.shadowOffsetY = r * 0.06;
  const body = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.08, cx, cy, R);
  body.addColorStop(0, "#5a6072");
  body.addColorStop(0.35, "#262a38");
  body.addColorStop(1, "#08090e");
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.shadowColor = "transparent";
  // specular
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.ellipse(cx - R * 0.38, cy - R * 0.42, R * 0.2, R * 0.12, -0.7, 0, Math.PI * 2);
  g.fill();
  // warning band
  g.strokeStyle = "rgba(255,70,70,0.85)";
  g.lineWidth = R * 0.09;
  g.beginPath();
  g.arc(cx, cy, R * 0.72, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  // metal cap
  const capW = R * 0.5;
  const capH = R * 0.28;
  const cap = g.createLinearGradient(cx - capW / 2, 0, cx + capW / 2, 0);
  cap.addColorStop(0, "#6b7280");
  cap.addColorStop(0.5, "#d1d5db");
  cap.addColorStop(1, "#4b5563");
  g.fillStyle = cap;
  g.beginPath();
  g.roundRect(cx - capW / 2, cy - R - capH * 0.55, capW, capH, capH * 0.3);
  g.fill();
  // fuse (spark is animated at runtime at the fuse tip)
  g.strokeStyle = "#c9a26b";
  g.lineWidth = R * 0.08;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx, cy - R - capH * 0.5);
  g.quadraticCurveTo(cx + R * 0.15, cy - R * 1.25, cx + R * 0.42, cy - R * 1.18);
  g.stroke();
}

/** Fuse tip position relative to the bomb center, as a fraction of hit radius. */
export const FUSE_TIP = { x: 0.42 * 0.82, y: -(1.18 * 0.82 - 0.08) };

function drawRaspberry(g: CanvasRenderingContext2D, cx: number, r: number, dpr: number): void {
  const cy = cx + r * 0.08;
  const R = r * 0.82;
  const bead = R * 0.26;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 7 * dpr;
  g.shadowOffsetY = 3 * dpr;
  const rings = [
    { rr: 0, n: 1 },
    { rr: R * 0.42, n: 6 },
    { rr: R * 0.78, n: 9 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + (ring.rr ? 0.3 : 0);
      const bx = cx + Math.cos(a) * ring.rr;
      const by = cy + Math.sin(a) * ring.rr;
      const grad = g.createRadialGradient(bx - bead * 0.3, by - bead * 0.3, bead * 0.2, bx, by, bead);
      grad.addColorStop(0, "#f06595");
      grad.addColorStop(1, "#a61e4d");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(bx, by, bead, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = "transparent";
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.beginPath();
      g.arc(bx - bead * 0.3, by - bead * 0.35, bead * 0.28, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = "rgba(0,0,0,0.35)";
    }
  }
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

/**
 * Wooden dojo backdrop for mouse/touch mode (the camera feed replaces it in
 * camera mode). Vertical planks with grain, seams and a warm vignette.
 */
export function buildWoodBackground(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const plankW = Math.max(110, w / 9);
  for (let x = 0; x < w; x += plankW) {
    const base = [38, 26, 18];
    const v = (rnd() - 0.5) * 14;
    const grad = g.createLinearGradient(x, 0, x + plankW, 0);
    grad.addColorStop(0, `rgb(${base[0] + v + 10},${base[1] + v + 6},${base[2] + v + 3})`);
    grad.addColorStop(0.5, `rgb(${base[0] + v + 22},${base[1] + v + 14},${base[2] + v + 8})`);
    grad.addColorStop(1, `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`);
    g.fillStyle = grad;
    g.fillRect(x, 0, plankW, h);
    // grain
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.lineWidth = 1;
    for (let k = 0; k < 9; k++) {
      const gx = x + rnd() * plankW;
      g.beginPath();
      g.moveTo(gx, 0);
      for (let y = 0; y <= h; y += 40) g.lineTo(gx + Math.sin(y / (60 + k * 9) + k) * 6, y);
      g.stroke();
    }
    // knot
    if (rnd() < 0.6) {
      const kx = x + plankW * (0.3 + rnd() * 0.4);
      const ky = rnd() * h;
      g.strokeStyle = "rgba(0,0,0,0.22)";
      for (let k = 1; k < 5; k++) {
        g.beginPath();
        g.ellipse(kx, ky, 5 * k, 11 * k, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // seam
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(x, 0, 3, h);
    g.fillStyle = "rgba(255,220,180,0.06)";
    g.fillRect(x + 3, 0, 2, h);
  }
  const vig = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.6)");
  g.fillStyle = vig;
  g.fillRect(0, 0, w, h);
  return c;
}
