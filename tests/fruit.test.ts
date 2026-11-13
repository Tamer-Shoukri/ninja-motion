import { describe, it, expect } from "vitest";
import { FruitManager, screenScale, type SpawnRules } from "../src/fruit.ts";
import { OneEuro } from "../src/filter.ts";

/** Deterministic RNG (mulberry32) so spawn tests are repeatable. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1280;
const H = 720;
const rules = (over: Partial<SpawnRules> = {}): SpawnRules => ({ interval: 1, waveMax: 4, bombChance: 0, specials: false, ...over });

describe("FruitManager", () => {
  it("launched fruit rise into view and stay on screen horizontally", () => {
    const fm = new FruitManager(seeded(1));
    fm.update(0, W, H, null);
    for (let i = 0; i < 40; i++) fm.launchFrom(0.15 + (i / 40) * 0.7, 0.6);
    let minY = Infinity;
    for (let step = 0; step < 120; step++) {
      fm.update(1 / 60, W, H, null);
      for (const f of fm.fruits) {
        minY = Math.min(minY, f.y);
        expect(f.x).toBeGreaterThan(-f.r);
        expect(f.x).toBeLessThan(W + f.r);
      }
    }
    expect(minY).toBeLessThan(H * 0.6);
    expect(minY).toBeGreaterThan(0);
  });

  it("spawns waves of several fruit as difficulty allows", () => {
    const fm = new FruitManager(seeded(7));
    let max = 0;
    for (let i = 0; i < 600; i++) {
      fm.update(1 / 60, W, H, rules());
      max = Math.max(max, fm.fruits.length);
    }
    expect(fm.waves).toBeGreaterThan(5);
    expect(max).toBeGreaterThanOrEqual(3);
  });

  it("reports only ordinary un-sliced fruit as misses", () => {
    const fm = new FruitManager(seeded(3));
    fm.update(0, W, H, null);
    const a = fm.launchFrom(0.5, 0.5, "fruit");
    const b = fm.launchFrom(0.5, 0.5, "bomb");
    const c = fm.launchFrom(0.5, 0.5, "freeze");
    const d = fm.launchFrom(0.5, 0.5, "fruit");
    d.sliced = true;
    const missed = [];
    for (let i = 0; i < 400; i++) missed.push(...fm.update(1 / 60, W, H, null));
    expect(missed).toEqual([a]);
    void b;
    void c;
  });

  it("never spawns specials when not allowed, sometimes does when allowed", () => {
    const count = (specials: boolean) => {
      const fm = new FruitManager(seeded(11));
      let n = 0;
      for (let i = 0; i < 6000; i++) {
        fm.update(1 / 60, W, H, rules({ specials }));
        n += fm.fruits.filter((f) => f.kind === "freeze" || f.kind === "frenzy").length;
        fm.fruits = fm.fruits.filter((f) => f.kind === "fruit" || f.kind === "bomb");
      }
      return n;
    };
    expect(count(false)).toBe(0);
    expect(count(true)).toBeGreaterThan(0);
  });

  it("frenzy pours fruit in from the sides", () => {
    const fm = new FruitManager(seeded(5));
    fm.update(0, W, H, null);
    fm.startFrenzy(1);
    const xs: number[] = [];
    for (let i = 0; i < 30; i++) {
      fm.update(1 / 60, W, H, null);
      for (const f of fm.fruits) if (f.age === 1 / 60) xs.push(f.x);
    }
    expect(fm.fruits.length).toBeGreaterThan(3);
    expect(xs.some((x) => x < W * 0.1 || x > W * 0.9)).toBe(true);
  });

  it("scales fruit with the screen, within sane bounds", () => {
    expect(screenScale(1280, 720)).toBe(1); // the reference size
    expect(screenScale(390, 844)).toBeGreaterThanOrEqual(0.55);
    expect(screenScale(3840, 2160)).toBeLessThanOrEqual(1.35);
  });
});

describe("OneEuro filter", () => {
  it("removes jitter when the hand is still", () => {
    const f = new OneEuro();
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(100 + (i % 2 ? 4 : -4), i / 30);
    expect(Math.abs(out - 100)).toBeLessThan(2);
  });

  it("follows a fast swipe with little lag", () => {
    const f = new OneEuro();
    let out = 0;
    for (let i = 0; i <= 10; i++) out = f.filter(i * 100, i / 30); // 3000 px/s
    expect(1000 - out).toBeLessThan(120);
  });
});
