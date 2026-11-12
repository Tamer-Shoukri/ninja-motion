# 🥷 Ninja Motion

**Fruit Ninja you play with your body.** No controller, no mouse — your webcam tracks your hands in real time, and you slice flying fruit by swinging your actual arms through the air.

![status](https://img.shields.io/badge/status-playable-brightgreen) ![tech](https://img.shields.io/badge/TypeScript-Vite-blue) ![cv](https://img.shields.io/badge/MediaPipe-HandLandmarker-orange)

## What it does

A browser game that uses **computer vision** to turn your hand into the blade:

- **Real-time hand tracking** — Google **MediaPipe HandLandmarker** detects 21 landmarks per hand from the webcam feed (runs fully client-side via WebAssembly, ~30–60fps).
- **Motion-gated slicing** — a fruit is only cut when your fingertip sweeps *through* it *fast enough*. Slow hovering does nothing; it feels like a real blade, not a tap target.
- **Juice** — fruit splits into tumbling halves, juice-splatter particles, a glowing blade trail, combo chaining, and synthesized sound effects.
- **9 fruits** — watermelon, strawberry, blueberry, raspberry (hand-drawn — no emoji exists), coconut, apple, orange, banana, grapes — plus bombs you must avoid.
- **Full game loop** — score, combos, lives, difficulty ramp, game-over, and swipe-to-restart.

## How it works

```
webcam → MediaPipe hands → fingertip trails → speed-gated slice detection
       → fruit physics (launch/arc/gravity) → effects + score → HUD
```

Everything renders on a single `<canvas>` layered over the mirrored video. Hand
landmarks (raw, unmirrored) and the fruit world share one coordinate space, so a
slice lands exactly where you see your hand.

## Tech

- **TypeScript** + **Vite** (zero-framework, just the platform)
- **@mediapipe/tasks-vision** `HandLandmarker` (GPU delegate)
- Canvas 2D rendering, WebAudio synthesized SFX, `localStorage` high score

## Run locally

```bash
pnpm install
pnpm dev
```

Open the printed URL (use **localhost** or HTTPS — the webcam needs a secure
context), click **Enable Camera & Play**, stand back, and swing.

## Project layout

| File | Role |
|------|------|
| `src/hands.ts` | MediaPipe hand tracking wrapper |
| `src/slicer.ts` | fingertip trails + speed-gated slice detection |
| `src/fruit.ts` | fruit physics, spawning, HD sprites |
| `src/effects.ts` | split halves, particles, score popups |
| `src/game.ts` | score / combo / lives / state machine |
| `src/main.ts` | render loop wiring it all together |

---

Built by **Tamer Shoukri** · part of my developer portfolio.
