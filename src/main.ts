/**
 * Ninja Motion — entry point.
 *
 * Milestone 0: webcam → mirrored canvas + render loop + HUD.
 * (Hand tracking, fruit, and slicing arrive in M1–M3, wired into the same loop.)
 */
import { startWebcam } from "./webcam.ts";
import { HandTracker, FINGERTIPS, type Hand } from "./hands.ts";

const tracker = new HandTracker();

const video = document.getElementById("cam") as HTMLVideoElement;
const canvas = document.getElementById("game") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLDivElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

const ctx = canvas.getContext("2d")!;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

/** Keep the canvas pixel buffer matched to its displayed size (handles resize + DPR). */
function resizeCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);

let running = false;
let lastTime = performance.now();
let fps = 0;

/** Map a normalized landmark (raw video space) to mirrored canvas pixels. */
function toCanvas(nx: number, ny: number, w: number, h: number): [number, number] {
  return [(1 - nx) * w, ny * h]; // mirror X to match the mirrored video
}

/** Draw fingertip dots + a light palm skeleton for each detected hand. */
function drawHands(hands: Hand[], w: number, h: number): void {
  for (const hand of hands) {
    if (hand.length < 21) continue;

    // Palm skeleton: wrist (0) out to each fingertip, subtle.
    ctx.strokeStyle = "rgba(142, 230, 200, 0.35)";
    ctx.lineWidth = 2;
    const [wx, wy] = toCanvas(hand[0].x, hand[0].y, w, h);
    for (const tip of FINGERTIPS) {
      const [tx, ty] = toCanvas(hand[tip].x, hand[tip].y, w, h);
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // Fingertip dots — bright, so tracking is obvious.
    for (const tip of FINGERTIPS) {
      const [tx, ty] = toCanvas(hand[tip].x, hand[tip].y, w, h);
      ctx.beginPath();
      ctx.arc(tx, ty, 10, 0, Math.PI * 2);
      ctx.fillStyle = "#8ee6c8";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(5,7,13,0.8)";
      ctx.stroke();
    }
  }
}

/** The single render/update loop. Everything game-side hangs off this. */
function loop(now: number): void {
  if (!running) return;

  const dt = (now - lastTime) / 1000; // seconds
  lastTime = now;
  fps = fps * 0.9 + (1 / Math.max(dt, 1e-6)) * 0.1; // smoothed

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  // Clear — the mirrored <video> shows through underneath.
  ctx.clearRect(0, 0, w, h);

  // Run hand detection against the live video frame.
  tracker.detect(video, now);

  // Draw the tracked hands. MediaPipe returns coords in RAW (unmirrored) video
  // space; the video is displayed mirrored, so we mirror X here (1 - x) to make
  // the dots land on the user's actual fingers.
  drawHands(tracker.hands, w, h);

  setStatus(`running · ${fps.toFixed(0)} fps · hands:${tracker.hands.length}`);

  requestAnimationFrame(loop);
}

async function start(): Promise<void> {
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

    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
    setStatus("running");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`error: ${msg}`);
    startBtn.disabled = false;
    startBtn.textContent = "Retry";
    console.error(err);
  }
}

startBtn.addEventListener("click", () => void start());
setStatus("ready — click to start");
