/**
 * Ninja Motion — entry point. Camera-driven Fruit Ninja.
 *
 * Pipeline per frame:
 *   webcam → MediaPipe hands → fingertip trails → slice detection →
 *   fruit physics → effects/score/lives → HUD. All on one canvas over the
 *   mirrored video.
 */
import { startWebcam } from "./webcam.ts";
import { HandTracker, INDEX_TIP, type Hand } from "./hands.ts";
import { FruitManager, buildSprites, getSprite, type Fruit } from "./fruit.ts";
import { Slicer } from "./slicer.ts";
import { Effects } from "./effects.ts";
import { Game } from "./game.ts";
import { Sound } from "./sound.ts";

const tracker = new HandTracker();
const fruitManager = new FruitManager();
const slicer = new Slicer();
const effects = new Effects();
const game = new Game();
const sound = new Sound();

const video = document.getElementById("cam") as HTMLVideoElement;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

const ctx = canvas.getContext("2d")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildSprites(dpr); // (re)render crisp fruit sprites at this DPR
}
window.addEventListener("resize", resizeCanvas);

let lastTime = performance.now();
let fps = 0;
let booted = false; // webcam + model ready

function toCanvas(nx: number, ny: number, w: number, h: number): [number, number] {
  return [(1 - nx) * w, ny * h]; // mirror X to match the mirrored video
}

/** Feed fingertip positions into the slicer and return active hand indices. */
function updateTrails(hands: Hand[], w: number, h: number, now: number): Set<number> {
  const active = new Set<number>();
  hands.forEach((hand, i) => {
    if (hand.length < 21) return;
    active.add(i);
    // Track the index fingertip primarily (feels like the blade tip).
    const [ix, iy] = toCanvas(hand[INDEX_TIP].x, hand[INDEX_TIP].y, w, h);
    slicer.addPoint(i, ix, iy, now);
  });
  slicer.retainHands(active);
  return active;
}

function drawBlades(now: number): void {
  const blades = slicer.getBlades(now);
  for (const pts of blades) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const speed = b.speed;
      const alpha = Math.min(0.15 + (i / pts.length) * 0.85, 1);
      const width = 3 + Math.min(speed / 120, 16);
      ctx.strokeStyle = `rgba(230, 250, 255, ${alpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // Inner bright core.
      ctx.strokeStyle = `rgba(142, 230, 200, ${alpha})`;
      ctx.lineWidth = Math.max(1, width * 0.4);
      ctx.stroke();
    }
    // Glowing tip.
    const tip = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
  }
}

function drawFruit(f: Fruit): void {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  if (f.isBomb) {
    ctx.beginPath();
    ctx.arc(0, 0, f.type.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1d26";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ff4444";
    ctx.stroke();
    ctx.font = `${f.type.radius}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("💣", 0, 2);
  } else {
    const spr = getSprite(f.type.name);
    const d = f.type.radius * 2;
    if (spr) {
      ctx.drawImage(spr, -f.type.radius, -f.type.radius, d, d);
    } else {
      // Fallback if a sprite is missing: simple two-tone disc.
      ctx.beginPath();
      ctx.arc(0, 0, f.type.radius, 0, Math.PI * 2);
      ctx.fillStyle = f.type.color;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHud(w: number): void {
  ctx.textBaseline = "top";
  // Score (left).
  ctx.textAlign = "left";
  ctx.font = "bold 30px system-ui";
  ctx.fillStyle = "#eaf0ff";
  ctx.strokeStyle = "rgba(5,7,13,0.7)";
  ctx.lineWidth = 4;
  ctx.strokeText(`Score ${game.score}`, 16, 40);
  ctx.fillText(`Score ${game.score}`, 16, 40);
  ctx.font = "16px system-ui";
  ctx.fillStyle = "#8ee6c8";
  ctx.fillText(`Best ${game.best}`, 16, 76);
  if (game.combo >= 3) {
    ctx.font = "bold 20px system-ui";
    ctx.fillStyle = "#ffe066";
    ctx.fillText(`Combo x${game.combo}`, 16, 100);
  }
  // Lives (right) as hearts.
  ctx.textAlign = "right";
  ctx.font = "26px system-ui";
  ctx.fillText("❤️".repeat(Math.max(0, game.lives)), w - 16, 42);
}

function drawGameOver(w: number, h: number): void {
  ctx.fillStyle = "rgba(5,7,13,0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#eaf0ff";
  ctx.font = "bold 56px system-ui";
  ctx.fillText("GAME OVER", w / 2, h / 2 - 70);
  ctx.font = "32px system-ui";
  ctx.fillStyle = "#8ee6c8";
  ctx.fillText(`Score ${game.score}   ·   Best ${game.best}`, w / 2, h / 2 - 10);
  ctx.font = "22px system-ui";
  ctx.fillStyle = "#eaf0ff";
  ctx.fillText("Swipe here or press SPACE to play again", w / 2, h / 2 + 50);
}

function loop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  fps = fps * 0.9 + (1 / Math.max(dt, 1e-6)) * 0.1;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // --- Perception (always, so blades show on menus too) ---
  tracker.detect(video, now);
  updateTrails(tracker.hands, w, h, now);

  if (game.state === "playing") {
    game.tick(dt);
    const missed = fruitManager.update(dt, w, h, game.spawnInterval());
    if (missed.length > 0) {
      sound.miss();
      game.breakCombo(); // missing fruit only breaks the streak — no life lost
    }

    // Slice detection against current fruit.
    const hits = slicer.detectSlices(fruitManager.fruits);
    for (const f of hits) {
      if (f.isBomb) {
        effects.explode(f.x, f.y);
        sound.bomb();
        // Remove the bomb from play immediately.
        fruitManager.fruits = fruitManager.fruits.filter((x) => x !== f);
        if (game.hitBomb()) { sound.over(); break; }
      } else {
        effects.splitFruit(f);
        const pts = game.sliceFruit();
        effects.popup(f.x, f.y - 10, game.combo >= 3 ? `+${pts} x${game.combo}` : `+${pts}`);
        sound.slice(game.combo);
        fruitManager.fruits = fruitManager.fruits.filter((x) => x !== f);
      }
    }
  }

  effects.update(dt);

  // --- Draw ---
  for (const f of fruitManager.fruits) drawFruit(f);
  effects.draw(ctx);
  drawBlades(now);

  if (game.state === "playing") {
    drawHud(w);
  } else if (game.state === "over") {
    drawHud(w);
    drawGameOver(w, h);
    // Swipe-to-restart: a fast blade anywhere restarts.
    const blades = slicer.getBlades(now);
    for (const pts of blades) {
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].speed > 900) { restart(); break; }
      }
    }
  }

  setStatus(`${fps.toFixed(0)}fps · hands:${tracker.hands.length} · ${game.state}`);
  requestAnimationFrame(loop);
}

function restart(): void {
  fruitManager.reset();
  effects.reset();
  game.start();
}

async function boot(): Promise<void> {
  try {
    setStatus("requesting camera…");
    startBtn.disabled = true;
    startBtn.textContent = "Starting…";
    await startWebcam(video);

    setStatus("loading hand model…");
    startBtn.textContent = "Loading model…";
    await tracker.init();

    resizeCanvas();
    overlay.classList.add("hidden");
    booted = true;
    game.start();
    lastTime = performance.now();
    requestAnimationFrame(loop);
    setStatus("playing");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`error: ${msg}`);
    startBtn.disabled = false;
    startBtn.textContent = "Retry";
    console.error(err);
  }
}

startBtn.addEventListener("click", () => void boot());
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && booted && game.state === "over") restart();
});
setStatus("ready — click to start");
