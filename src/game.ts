/**
 * Game rules: modes, scoring, combos, lives/timer, power-ups and difficulty.
 * Pure logic — no rendering, no DOM — so it is unit-tested.
 *
 *  - Classic: 3 lives. Slicing a bomb costs a life. Missed fruit only break your
 *    streak (webcam tracking can drop out, so misses shouldn't end a run).
 *  - Arcade: 60 seconds. Bombs cost 10 points instead of a life. Special
 *    bananas appear — freeze (slow motion, clock paused) and frenzy (fruit pour
 *    in from the sides).
 */
import type { SpawnRules } from "./fruit.ts";

export type Mode = "classic" | "arcade";
export type GameState = "menu" | "playing" | "over";

export const ARCADE_SECONDS = 60;
export const CLASSIC_LIVES = 3;
export const BOMB_PENALTY = 10;
export const CHAIN_WINDOW = 0.6; // s between slices to keep a chain going
export const FREEZE_SECONDS = 5;
export const FRENZY_SECONDS = 4;
export const FREEZE_TIME_SCALE = 0.35;

export type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

export class Game {
  state: GameState = "menu";
  mode: Mode = "classic";
  score = 0;
  best: Record<Mode, number> = { classic: 0, arcade: 0 };
  lives = CLASSIC_LIVES;
  timeLeft = ARCADE_SECONDS;
  chain = 0;
  bestChain = 0;
  sliced = 0;
  bombsHit = 0;
  biggestStroke = 0;
  freezeLeft = 0;
  elapsed = 0;
  newBest = false;
  private chainTimer = 0;
  private store: Storage;

  constructor(store?: Storage) {
    this.store = store ?? (typeof localStorage !== "undefined" ? localStorage : memoryStorage());
    const legacy = Number(this.store.getItem("ninja-best") || 0);
    for (const m of ["classic", "arcade"] as Mode[]) {
      const v = Number(this.store.getItem(`ninja-best-${m}`) || (m === "classic" ? legacy : 0));
      this.best[m] = Number.isFinite(v) ? v : 0;
    }
  }

  start(mode: Mode): void {
    this.mode = mode;
    this.state = "playing";
    this.score = 0;
    this.lives = CLASSIC_LIVES;
    this.timeLeft = ARCADE_SECONDS;
    this.chain = 0;
    this.bestChain = 0;
    this.sliced = 0;
    this.bombsHit = 0;
    this.biggestStroke = 0;
    this.freezeLeft = 0;
    this.elapsed = 0;
    this.newBest = false;
    this.chainTimer = 0;
  }

  /** World time multiplier (slow motion while frozen). */
  get timeScale(): number {
    return this.freezeLeft > 0 ? FREEZE_TIME_SCALE : 1;
  }

  /** Advance by real seconds. */
  tick(dt: number): void {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.chainTimer > 0) {
      this.chainTimer -= dt;
      if (this.chainTimer <= 0) this.chain = 0;
    }
    // The clock is paused while frozen; time left over after a freeze ends
    // within this step still counts.
    let clockDt = dt;
    if (this.freezeLeft > 0) {
      clockDt = Math.max(0, dt - this.freezeLeft);
      this.freezeLeft = Math.max(0, this.freezeLeft - dt);
    }
    if (this.mode === "arcade" && clockDt > 0) {
      this.timeLeft = Math.max(0, this.timeLeft - clockDt);
      if (this.timeLeft <= 0) this.end();
    }
  }

  /** Difficulty ramps over ~90s of play: faster, bigger waves, more bombs. */
  spawnRules(): SpawnRules {
    const t = Math.min(this.elapsed / 90, 1);
    return {
      interval: 1.5 - t * 0.75,
      waveMax: 2 + Math.round(t * 3),
      bombChance: this.mode === "arcade" ? 0.1 + t * 0.06 : 0.08 + t * 0.08,
      specials: this.mode === "arcade",
    };
  }

  /** A fruit was cut. Returns points: 1, plus the chain length once chaining 3+. */
  sliceFruit(): number {
    this.sliced++;
    this.chain++;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.chainTimer = CHAIN_WINDOW;
    const points = 1 + (this.chain >= 3 ? this.chain : 0);
    this.score += points;
    return points;
  }

  /** A single swipe cut `count` fruit. 3+ in one swipe is a combo worth `count` bonus points. */
  strokeCombo(count: number): number {
    this.biggestStroke = Math.max(this.biggestStroke, count);
    if (count < 3) return 0;
    this.score += count;
    return count;
  }

  /** Returns true if the bomb ended the game. */
  hitBomb(): boolean {
    this.bombsHit++;
    this.chain = 0;
    this.chainTimer = 0;
    if (this.mode === "arcade") {
      this.score = Math.max(0, this.score - BOMB_PENALTY);
      return false;
    }
    this.lives--;
    if (this.lives <= 0) {
      this.end();
      return true;
    }
    return false;
  }

  missFruit(): void {
    this.chain = 0;
    this.chainTimer = 0;
  }

  freeze(): void {
    this.freezeLeft = FREEZE_SECONDS;
  }

  end(): void {
    if (this.state !== "playing") return;
    this.state = "over";
    if (this.score > this.best[this.mode]) {
      this.best[this.mode] = this.score;
      this.newBest = true;
      this.store.setItem(`ninja-best-${this.mode}`, String(this.score));
    }
  }
}
