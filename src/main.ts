/**
 * Ninja Motion — entry point.
 *
 * Milestone 0: webcam → mirrored canvas + render loop + HUD.
 * (Hand tracking, fruit, and slicing arrive in M1–M3, wired into the same loop.)
 */
import { startWebcam } from "./webcam.ts";

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

  // M0 sanity marker: a mirrored crosshair so we can confirm the canvas
  // is aligned with the video and the loop is alive. Removed once hands render.
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1); // mirror the drawing to match the mirrored video
  ctx.strokeStyle = "rgba(142, 230, 200, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
  ctx.moveTo(w / 2 - 60, h / 2);
  ctx.lineTo(w / 2 + 60, h / 2);
  ctx.moveTo(w / 2, h / 2 - 60);
  ctx.lineTo(w / 2, h / 2 + 60);
  ctx.stroke();
  ctx.restore();

  setStatus(`running · ${fps.toFixed(0)} fps · ${w}×${h}`);

  requestAnimationFrame(loop);
}

async function start(): Promise<void> {
  try {
    setStatus("requesting camera…");
    startBtn.disabled = true;
    startBtn.textContent = "Starting…";

    await startWebcam(video);

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
