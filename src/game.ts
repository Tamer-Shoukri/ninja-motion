/**
 * Game state: score, combo, lives, difficulty ramp, and the play/over state
 * machine. Pure logic — no rendering, no DOM — so it's easy to reason about.
 */

export type GameState = "ready" | "playing" | "over";

export class Game {
  state: GameState = "ready";
  score = 0;
  best = 0;
  lives = 3;
  combo = 0;
  private comboTimer = 0;
  private readonly comboWindow = 0.6; // s to chain slices into a combo
  private elapsed = 0;

  constructor() {
    const saved = Number(localStorage.getItem("ninja-best") || "0");
    if (Number.isFinite(saved)) this.best = saved;
  }

  start(): void {
    this.state = "playing";
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.comboTimer = 0;
    this.elapsed = 0;
  }

  /** Difficulty: spawn interval shrinks from 1.1s toward 0.45s over ~90s. */
  spawnInterval(): number {
    const t = Math.min(this.elapsed / 90, 1);
    return 1.1 - t * 0.65;
  }

  tick(dt: number): void {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  }

  /** A fruit was sliced. Returns the points awarded (incl. combo bonus). */
  sliceFruit(): number {
    this.combo += 1;
    this.comboTimer = this.comboWindow;
    const bonus = this.combo >= 3 ? this.combo : 0; // +combo once chaining
    const points = 1 + bonus;
    this.score += points;
    return points;
  }

  /** A bomb was hit — costs a life, breaks combo. Returns true if game over. */
  hitBomb(): boolean {
    this.lives -= 1;
    this.combo = 0;
    this.comboTimer = 0;
    if (this.lives <= 0) {
      this.end();
      return true;
    }
    return false;
  }

  /** Missed fruit (fell off-screen) — breaks the combo streak, no life lost. */
  breakCombo(): void {
    this.combo = 0;
    this.comboTimer = 0;
  }

  /** A fruit fell off-screen un-sliced — costs a life (not bombs). */
  missFruit(): boolean {
    this.lives -= 1;
    this.combo = 0;
    this.comboTimer = 0;
    if (this.lives <= 0) {
      this.end();
      return true;
    }
    return false;
  }

  private end(): void {
    this.state = "over";
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem("ninja-best", String(this.best));
    }
  }
}
