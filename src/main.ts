/**
 * Ninja Motion — entry point. Fruit Ninja you play with your body.
 *
 * Per frame:
 *   input (hand tracking or pointer) → blades → slice detection →
 *   fruit physics → rules (score, combos, lives/timer, power-ups) → effects → draw.
 *
 * Flow: start overlay → slice a fruit to pick a mode → play → results → slice
 * to retry or go back. Mouse/touch works everywhere so the game is playable
 * without a webcam.
 */
import { startWebcam } from "./webcam.ts";
import { HandTracker, INDEX_TIP } from "./hands.ts";
import { FruitManager, FRUIT_TYPES, screenScale, type Fruit } from "./fruit.ts";
import { Slicer } from "./slicer.ts";
import { Effects } from "./effects.ts";
import { Game, FRENZY_SECONDS, ARCADE_SECONDS, CLASSIC_LIVES, BOMB_PENALTY, type Mode } from "./game.ts";
import { Sound } from "./sound.ts";
import { OneEuro2D } from "./filter.ts";
import { buildSprites, buildWoodBackground } from "./sprites.ts";
import { drawFruit, drawBlade, drawHandCursor, drawHud, drawMenuTarget, text } from "./render.ts";

const video = document.getElementById("cam") as HTMLVideoElement;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const camBtn = document.getElementById("camBtn") as HTMLButtonElement;
const mouseBtn = document.getElementById("mouseBtn") as HTMLButtonElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const ctx = canvas.getContext("2d")!;

const tracker = new HandTracker();
const fruits = new FruitManager();
const slicer = new Slicer();
const fx = new Effects();
const game = new Game();
const sound = new Sound();

type Input = "camera" | "pointer";
let input: Input = "pointer";
let W = 0;
let H = 0;
let scale = 1;
let wood: HTMLCanvasElement | null = null;
let last = performance.now();
let fps = 60;
let hitStop = 0;
let scorePop = 1;
let shownScore = 0;
let pending: { at: number; run: () => void } | null = null;
let overTargetsAt = 0;
let timerTickAt = 0;
let entered = false; // overlay dismissed
const handFilters = new Map<string, OneEuro2D>();
const handCursors = new Map<string, { x: number; y: number }>();

interface Target {
  fruit: Fruit;
  label: string;
  sub: string;
  action: () => void;
  baseY: number;
}
let targets: Target[] = [];

// ---------- Layout ----------

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = screenScale(W, H);
  fx.scale = scale;
  buildSprites(dpr, 1.35); // build at max scale; fruit draw at their own size
  wood = buildWoodBackground(W, H, dpr);
  if (!entered) return;
  if (game.state === "menu") showMenu();
  else if (game.state === "over") showOverTargets();
}
window.addEventListener("resize", resize);

/**
 * Map a normalized landmark in the raw video to canvas pixels, matching how the
 * video is displayed: mirrored, and `object-fit: cover` (scaled to fill, then
 * center-cropped). Without the crop math, dots drift off the hand whenever the
 * window isn't the camera's aspect ratio.
 */
function videoToCanvas(nx: number, ny: number): [number, number] {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const k = Math.max(W / vw, H / vh);
  const dw = vw * k;
  const dh = vh * k;
  return [(1 - nx) * dw - (dw - W) / 2, ny * dh - (dh - H) / 2];
}

// ---------- Menus (sliceable fruit buttons) ----------

function makeTarget(typeName: string, fx01: number, label: string, sub: string, action: () => void, y01 = 0.56, size = 80): Target {
  const type = FRUIT_TYPES.find((t) => t.name === typeName)!;
  // Uniform size so rings and labels line up regardless of the fruit drawn.
  const r = size * Math.min(scale, H / 760);
  const y = H * y01;
  const fruit: Fruit = { id: Math.random() * 1e6, kind: "fruit", type, x: W * fx01, y, r, vx: 0, vy: -200, rot: -0.2, vrot: 0, sliced: false, age: 0 };
  return { fruit, label, sub, action, baseY: y };
}

function showMenu(): void {
  game.state = "menu";
  targets = [
    makeTarget("watermelon", 0.33, "CLASSIC", `3 lives · bombs cost a life · best ${game.best.classic}`, () => begin("classic")),
    makeTarget("orange", 0.67, "ARCADE", `${ARCADE_SECONDS} seconds · power-ups · best ${game.best.arcade}`, () => begin("arcade")),
  ];
}

function showOverTargets(): void {
  targets = [
    makeTarget("watermelon", 0.38, "RETRY", "", () => begin(game.mode), 0.63, 62),
    makeTarget("apple", 0.62, "MENU", "", () => showMenu(), 0.63, 62),
  ];
}

function begin(mode: Mode): void {
  fruits.reset();
  slicer.clear();
  game.start(mode);
  shownScore = 0;
  targets = [];
  fx.banner("GO!", mode === "arcade" ? `${ARCADE_SECONDS} seconds — slice everything` : "Don't slice the bombs", "#8ee6c8", 1.1);
  sound.go();
}

function endRun(): void {
  game.end();
  if (game.newBest) {
    sound.best();
    fx.banner("NEW BEST!", `${game.score} points`, "#ffe066", 1.8);
  } else {
    sound.over();
  }
  targets = [];
  overTargetsAt = performance.now() + 900; // brief pause so a mid-swipe can't skip results
}

// ---------- Input ----------

function pointerSample(e: PointerEvent): void {
  const rect = canvas.getBoundingClientRect();
  const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
  for (const ev of events.length ? events : [e]) {
    slicer.addSample(`ptr-${e.pointerId}`, ev.clientX - rect.left, ev.clientY - rect.top, ev.timeStamp);
  }
}
canvas.addEventListener("pointerdown", (e) => {
  sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  pointerSample(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons || e.pointerType === "touch") pointerSample(e);
});
for (const type of ["pointerup", "pointercancel"] as const) {
  canvas.addEventListener(type, (e) => slicer.endBlade(`ptr-${e.pointerId}`));
}

window.addEventListener("keydown", (e) => {
  sound.unlock();
  if (e.code === "KeyM") sound.toggleMute();
  if (e.code === "KeyD") statusEl.classList.toggle("show");
  if (overlay.classList.contains("hidden")) {
    if (game.state === "menu" && e.code === "Digit1") begin("classic");
    if (game.state === "menu" && e.code === "Digit2") begin("arcade");
    if (game.state === "over" && e.code === "Space") begin(game.mode);
    if (game.state === "over" && e.code === "Escape") showMenu();
  }
});

function readHands(now: number): void {
  if (input !== "camera" || !tracker.detect(video, now)) return;
  const active = new Set<string>();
  for (const hand of tracker.hands) {
    const id = `hand-${hand.id}`;
    active.add(id);
    const tip = hand.landmarks[INDEX_TIP];
    const [rx, ry] = videoToCanvas(tip.x, tip.y);
    let f = handFilters.get(id);
    if (!f) handFilters.set(id, (f = new OneEuro2D()));
    const [x, y] = f.filter(rx, ry, now / 1000);
    slicer.addSample(id, x, y, now);
    handCursors.set(id, { x, y });
  }
  slicer.retain(active, "hand-");
  for (const id of [...handFilters.keys()]) {
    if (!active.has(id)) {
      handFilters.delete(id);
      handCursors.delete(id);
    }
  }
}

// ---------- Rules ----------

function handleHits(now: number): void {
  const pool = game.state === "playing" ? fruits.fruits : targets.map((t) => t.fruit);
  const { hits, strokes } = slicer.detect(pool, now);

  for (const hit of hits) {
    const f = hit.target;
    if (game.state !== "playing") {
      const t = targets.find((x) => x.fruit === f);
      if (!t || pending) continue;
      fx.splitFruit(f, hit.angle);
      fx.ring(f.x, f.y, "142,230,200", f.r * 2.2);
      sound.slice(1);
      sound.pick();
      targets = targets.filter((x) => x !== t);
      pending = { at: now + 420, run: t.action };
      continue;
    }

    fruits.remove(f);
    if (f.kind === "bomb") {
      fx.explode(f.x, f.y);
      sound.bomb();
      hitStop = 0.16;
      const over = game.hitBomb();
      if (game.mode === "arcade") fx.popup(f.x, f.y - f.r, `−${BOMB_PENALTY}`, "#ff6b6b", 40);
      else if (!over) fx.banner("BOOM!", `${game.lives} ${game.lives === 1 ? "life" : "lives"} left`, "#ff6b6b", 1.1);
      if (over) endRun();
      continue;
    }

    fx.splitFruit(f, hit.angle);
    const pts = game.sliceFruit();
    sound.slice(game.chain);
    fx.popup(f.x, f.y - f.r * 0.6, `+${pts}`, game.chain >= 3 ? "#8ee6c8" : "#ffe066");

    if (f.kind === "freeze") {
      game.freeze();
      fx.banner("FREEZE!", "slow motion · clock paused", "#9ee9ff", 1.4);
      fx.flash("150,230,255", 0.4);
      sound.freeze();
    } else if (f.kind === "frenzy") {
      fruits.startFrenzy(FRENZY_SECONDS);
      fx.banner("FRENZY!", "slice them all", "#ffc94d", 1.4);
      fx.flash("255,210,90", 0.3);
      sound.frenzy();
    }
  }

  if (game.state === "playing") {
    for (const s of strokes) {
      const bonus = game.strokeCombo(s.count);
      if (bonus > 0) {
        fx.banner(`${s.count} FRUIT COMBO`, `+${bonus}`, "#ff9cf2", 1.2);
        fx.shake(0.25);
        sound.combo(s.count);
      }
    }
  }
}

// ---------- Frame ----------

function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  fps = fps * 0.92 + (1 / Math.max(realDt, 1e-4)) * 0.08;

  readHands(now);

  if (pending && now >= pending.at) {
    const run = pending.run;
    pending = null;
    run();
  }

  if (game.state === "playing") {
    game.tick(realDt);
    if (game.state !== "playing") endRun(); // arcade clock ran out
  }
  if (game.state === "over" && targets.length === 0 && !pending && now > overTargetsAt) showOverTargets();

  // Hit-stop freezes the world for a beat after a bomb.
  hitStop = Math.max(0, hitStop - realDt);
  const worldDt = hitStop > 0 ? 0 : realDt * (game.state === "playing" ? game.timeScale : 1);

  if (game.state === "playing") {
    const missed = fruits.update(worldDt, W, H, fruits.frenzyActive ? null : game.spawnRules());
    for (const m of missed) {
      game.missFruit();
      fx.popup(Math.min(Math.max(m.x, 40), W - 40), H - 40 * scale, "✕", "#ff6b6b", 30);
    }
    if (game.mode === "arcade" && game.timeLeft <= 5 && game.freezeLeft <= 0 && now > timerTickAt) {
      sound.tick();
      timerTickAt = now + 1000;
    }
  } else {
    // menu targets bob gently in place
    for (const t of targets) {
      t.fruit.y = t.baseY + Math.sin(now / 520 + t.fruit.x) * 8 * scale;
      t.fruit.rot = Math.sin(now / 900 + t.fruit.x) * 0.25;
    }
    fruits.update(worldDt, W, H, null); // let leftovers fall away after a run
  }

  handleHits(now);
  fx.update(worldDt, realDt);
  if (game.score !== shownScore) {
    shownScore = game.score;
    scorePop = 0;
  }
  scorePop = Math.min(1, scorePop + realDt * 4);

  draw(now);
  statusEl.textContent = `${fps.toFixed(0)} fps · ${input} · hands ${tracker.hands.length} · ${game.state}`;
  requestAnimationFrame(frame);
}

function draw(now: number): void {
  const t = now / 1000;
  // Background: the camera feed shows through (dimmed for contrast), or wood.
  if (input === "camera") {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(6,9,18,0.38)";
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  } else if (wood) {
    ctx.drawImage(wood, 0, 0, W, H);
  }
  if (game.state === "playing" && game.freezeLeft > 0) {
    ctx.fillStyle = `rgba(120,210,255,${0.1 + 0.05 * Math.sin(t * 4)})`;
    ctx.fillRect(0, 0, W, H);
  }

  const [sx, sy] = fx.shakeOffset();
  ctx.save();
  ctx.translate(sx, sy);
  fx.drawUnder(ctx);
  for (const f of fruits.fruits) drawFruit(ctx, f, t);
  for (const tg of targets) drawMenuTarget(ctx, tg.fruit, tg.label, tg.sub, t, scale);
  fx.drawWorld(ctx);
  ctx.restore();

  for (const b of slicer.getBlades(now)) drawBlade(ctx, b, slicer.opts.trailTtl, scale);
  if (input === "camera") for (const c of handCursors.values()) drawHandCursor(ctx, c.x, c.y, t, scale);

  if (game.state === "playing" || game.state === "over") {
    drawHud(
      ctx,
      W,
      {
        mode: game.mode,
        score: game.score,
        scorePop,
        best: game.best[game.mode],
        chain: game.chain,
        lives: game.lives,
        maxLives: CLASSIC_LIVES,
        timeLeft: game.timeLeft,
        totalTime: ARCADE_SECONDS,
        freezeLeft: game.freezeLeft,
      },
      scale,
      t,
    );
  }
  if (game.state === "menu" && entered) drawTitle(t);
  if (game.state === "over") drawResults();

  fx.drawOverlay(ctx, W, H);
}

function drawTitle(t: number): void {
  const k = Math.max(0.7, scale);
  text(ctx, "NINJA MOTION", W / 2, H * 0.17 + Math.sin(t * 1.6) * 3, Math.min(W * 0.1, 86 * k), "#ffffff", "center", 900);
  text(ctx, "Slice a fruit to choose a mode", W / 2, H * 0.17 + 56 * k, 19 * k, "#8ee6c8", "center", 700);
  const how = input === "camera" ? "Swing your hand through it — fast swipes cut" : "Click and drag (or swipe on touch) through it";
  text(ctx, how, W / 2, H - 46 * k, 15 * k, "rgba(234,240,255,0.7)", "center", 600);
  text(ctx, "M: sound   ·   1 / 2: pick mode", W / 2, H - 22 * k, 12 * k, "rgba(234,240,255,0.45)", "center", 600);
}

function drawResults(): void {
  const k = Math.max(0.7, scale);
  const pw = Math.min(W * 0.86, 560 * k);
  const ph = 230 * k;
  const x = W / 2 - pw / 2;
  const y = H * 0.14;
  ctx.fillStyle = "rgba(8,11,22,0.78)";
  ctx.strokeStyle = "rgba(142,230,200,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, 18 * k);
  ctx.fill();
  ctx.stroke();
  const title = game.mode === "arcade" ? "TIME'S UP!" : "GAME OVER";
  text(ctx, title, W / 2, y + 40 * k, 34 * k, "#ffffff", "center", 900);
  text(ctx, `${game.score}`, W / 2, y + 96 * k, 58 * k, "#ffe066", "center", 900);
  const stats: [string, string][] = [
    ["Fruit sliced", `${game.sliced}`],
    ["Best chain", `${game.bestChain}`],
    ["Biggest combo", `${game.biggestStroke}`],
    ["Best", `${game.best[game.mode]}`],
  ];
  const colW = pw / stats.length;
  stats.forEach(([label, value], i) => {
    const cx = x + colW * (i + 0.5);
    text(ctx, value, cx, y + 158 * k, 24 * k, "#eaf0ff", "center", 800);
    text(ctx, label.toUpperCase(), cx, y + 186 * k, 11 * k, "rgba(234,240,255,0.6)", "center", 700);
  });
  if (targets.length) text(ctx, "Slice to choose   ·   SPACE retry · ESC menu", W / 2, H - 24 * k, 13 * k, "rgba(234,240,255,0.55)", "center", 600);
}

// ---------- Boot ----------

function enter(mode: Input): void {
  input = mode;
  entered = true;
  video.classList.toggle("off", mode !== "camera");
  overlay.classList.add("hidden");
  resize();
  showMenu();
}

async function bootCamera(): Promise<void> {
  sound.unlock();
  errorEl.textContent = "";
  camBtn.disabled = mouseBtn.disabled = true;
  try {
    camBtn.textContent = "Starting camera…";
    await startWebcam(video);
    camBtn.textContent = "Loading hand tracking…";
    await tracker.init();
    enter("camera");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const denied = /denied|NotAllowed|Permission/i.test(msg);
    errorEl.textContent = denied
      ? "Camera permission was blocked. You can still play with the mouse — or allow the camera and retry."
      : `Couldn't start the camera (${msg}). Try the mouse option.`;
    camBtn.textContent = "Retry camera";
    console.error(err);
  } finally {
    camBtn.disabled = mouseBtn.disabled = false;
  }
}

camBtn.addEventListener("click", () => void bootCamera());
mouseBtn.addEventListener("click", () => {
  sound.unlock();
  enter("pointer");
});

resize();
requestAnimationFrame(frame);

// Read-only handle for automated verification (mirrors Math Tug-of-War's `window.game`).
(window as unknown as { ninja: unknown }).ninja = { game, fruits, slicer, get input() { return input; } };
