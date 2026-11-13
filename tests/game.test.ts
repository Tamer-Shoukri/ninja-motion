import { describe, it, expect } from "vitest";
import { Game, ARCADE_SECONDS, BOMB_PENALTY, FREEZE_SECONDS, FREEZE_TIME_SCALE, CLASSIC_LIVES } from "../src/game.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe("scoring", () => {
  it("awards 1 per fruit and chain bonus from the third quick slice", () => {
    const g = new Game(mem());
    g.start("classic");
    expect(g.sliceFruit()).toBe(1);
    expect(g.sliceFruit()).toBe(1);
    expect(g.sliceFruit()).toBe(4); // 1 + chain 3
    expect(g.score).toBe(6);
  });

  it("breaks the chain after the window or on a miss", () => {
    const g = new Game(mem());
    g.start("classic");
    g.sliceFruit();
    g.sliceFruit();
    g.tick(0.7);
    expect(g.chain).toBe(0);
    g.sliceFruit();
    g.missFruit();
    expect(g.chain).toBe(0);
  });

  it("gives a stroke combo bonus only for 3+ fruit in one swipe", () => {
    const g = new Game(mem());
    g.start("arcade");
    expect(g.strokeCombo(2)).toBe(0);
    expect(g.strokeCombo(4)).toBe(4);
    expect(g.score).toBe(4);
    expect(g.biggestStroke).toBe(4);
  });
});

describe("classic mode", () => {
  it("loses a life per bomb and ends at zero lives", () => {
    const g = new Game(mem());
    g.start("classic");
    for (let i = 0; i < CLASSIC_LIVES - 1; i++) expect(g.hitBomb()).toBe(false);
    expect(g.hitBomb()).toBe(true);
    expect(g.state).toBe("over");
  });

  it("does not end on missed fruit", () => {
    const g = new Game(mem());
    g.start("classic");
    for (let i = 0; i < 20; i++) g.missFruit();
    expect(g.state).toBe("playing");
    expect(g.lives).toBe(CLASSIC_LIVES);
  });

  it("has no timer", () => {
    const g = new Game(mem());
    g.start("classic");
    g.tick(ARCADE_SECONDS + 5);
    expect(g.state).toBe("playing");
  });
});

describe("arcade mode", () => {
  it("ends when the clock runs out", () => {
    const g = new Game(mem());
    g.start("arcade");
    g.tick(ARCADE_SECONDS - 0.01);
    expect(g.state).toBe("playing");
    g.tick(0.02);
    expect(g.state).toBe("over");
  });

  it("bombs cost points (never below zero) instead of ending the run", () => {
    const g = new Game(mem());
    g.start("arcade");
    for (let i = 0; i < 12; i++) g.sliceFruit();
    const before = g.score;
    expect(g.hitBomb()).toBe(false);
    expect(g.score).toBe(Math.max(0, before - BOMB_PENALTY));
    g.hitBomb();
    g.hitBomb();
    expect(g.score).toBeGreaterThanOrEqual(0);
    expect(g.state).toBe("playing");
  });

  it("freeze slows the world and pauses the clock", () => {
    const g = new Game(mem());
    g.start("arcade");
    g.freeze();
    expect(g.timeScale).toBe(FREEZE_TIME_SCALE);
    g.tick(FREEZE_SECONDS - 1);
    expect(g.timeLeft).toBe(ARCADE_SECONDS);
    g.tick(2);
    expect(g.timeScale).toBe(1);
    expect(g.timeLeft).toBeLessThan(ARCADE_SECONDS);
  });

  it("only arcade allows special fruit", () => {
    const g = new Game(mem());
    g.start("arcade");
    expect(g.spawnRules().specials).toBe(true);
    g.start("classic");
    expect(g.spawnRules().specials).toBe(false);
  });
});

describe("difficulty + best scores", () => {
  it("ramps up over time", () => {
    const g = new Game(mem());
    g.start("classic");
    const early = g.spawnRules();
    g.tick(120);
    const late = g.spawnRules();
    expect(late.interval).toBeLessThan(early.interval);
    expect(late.waveMax).toBeGreaterThan(early.waveMax);
    expect(late.bombChance).toBeGreaterThan(early.bombChance);
  });

  it("keeps a separate best per mode and migrates the old single best", () => {
    const store = mem();
    store.setItem("ninja-best", "17");
    const g = new Game(store);
    expect(g.best.classic).toBe(17);
    expect(g.best.arcade).toBe(0);
    g.start("arcade");
    for (let i = 0; i < 5; i++) g.sliceFruit();
    g.end();
    expect(g.newBest).toBe(true);
    expect(new Game(store).best.arcade).toBe(g.score);
  });
});
