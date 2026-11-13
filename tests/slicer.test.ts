import { describe, it, expect } from "vitest";
import { Slicer, distToSegment } from "../src/slicer.ts";

const target = (x: number, y: number, r = 40) => ({ x, y, r, sliced: false });

describe("distToSegment", () => {
  it("measures to the nearest point on the segment, clamped at the ends", () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5);
  });
});

describe("Slicer", () => {
  it("does not cut on a slow pass (speed gate)", () => {
    const s = new Slicer();
    const f = target(500, 300);
    s.addSample("a", 470, 300, 1000);
    s.addSample("a", 530, 300, 1300); // 60px in 300ms = 200 px/s
    expect(s.detect([f], 1300).hits).toHaveLength(0);
    expect(f.sliced).toBe(false);
  });

  it("cuts a fast swipe through a target and reports the swipe angle", () => {
    const s = new Slicer();
    const f = target(500, 300);
    s.addSample("a", 380, 420, 1000);
    s.addSample("a", 620, 180, 1033); // up-right diagonal, very fast
    const { hits } = s.detect([f], 1033);
    expect(hits).toHaveLength(1);
    expect(f.sliced).toBe(true);
    expect(hits[0].angle).toBeCloseTo(-Math.PI / 4, 5);
  });

  it("ignores a fast swipe that misses", () => {
    const s = new Slicer();
    const f = target(500, 300);
    s.addSample("a", 300, 100, 1000);
    s.addSample("a", 700, 100, 1030);
    expect(s.detect([f], 1030).hits).toHaveLength(0);
  });

  it("never cuts the same target twice", () => {
    const s = new Slicer();
    const f = target(500, 300);
    s.addSample("a", 300, 300, 1000);
    s.addSample("a", 700, 300, 1030);
    s.addSample("a", 300, 300, 1060);
    expect(s.detect([f], 1060).hits).toHaveLength(1);
  });

  it("only tests new segments each frame", () => {
    const s = new Slicer();
    const f1 = target(500, 300);
    s.addSample("a", 300, 300, 1000);
    s.addSample("a", 700, 300, 1030);
    expect(s.detect([f1], 1030).hits).toHaveLength(1);
    // A fruit that later drifts onto the old segment must not be cut by it.
    const f2 = target(450, 300);
    expect(s.detect([f2], 1040).hits).toHaveLength(0);
  });

  it("counts fruit cut in one continuous stroke and reports it after a pause", () => {
    const s = new Slicer();
    const fruits = [target(300, 300), target(500, 300), target(700, 300)];
    s.addSample("a", 200, 300, 1000);
    s.addSample("a", 400, 300, 1030);
    s.addSample("a", 600, 300, 1060);
    s.addSample("a", 800, 300, 1090);
    const r1 = s.detect(fruits, 1090);
    expect(r1.hits).toHaveLength(3);
    expect(r1.strokes).toHaveLength(0); // stroke still in progress
    const r2 = s.detect(fruits, 1090 + 400);
    expect(r2.strokes).toEqual([expect.objectContaining({ bladeId: "a", count: 3 })]);
  });

  it("flushes the stroke when the blade ends (pointer up / hand lost)", () => {
    const s = new Slicer();
    s.addSample("p", 200, 300, 1000);
    s.addSample("p", 400, 300, 1030);
    s.detect([target(300, 300)], 1030);
    s.endBlade("p");
    expect(s.detect([], 1031).strokes[0].count).toBe(1);
  });

  it("treats a teleporting sample as a tracking glitch, not a cut", () => {
    // Two hands swapping identity makes one 'hand' jump across the screen in a
    // single frame. That must never slice whatever lies in between.
    const s = new Slicer({ maxJump: 400 });
    const f = target(640, 360);
    s.addSample("hand-Left", 100, 360, 1000);
    s.addSample("hand-Left", 1180, 360, 1033);
    expect(s.detect([f], 1033).hits).toHaveLength(0);
    expect(f.sliced).toBe(false);
  });

  it("keeps blades independent", () => {
    const s = new Slicer();
    const f = target(500, 300);
    s.addSample("left", 300, 300, 1000);
    s.addSample("right", 700, 300, 1030); // different blades: no segment between them
    expect(s.detect([f], 1030).hits).toHaveLength(0);
  });

  it("drops duplicate samples with the same timestamp", () => {
    const s = new Slicer();
    s.addSample("a", 300, 300, 1000);
    s.addSample("a", 900, 300, 1000);
    expect(s.getBlades(1000)).toHaveLength(0); // only one real point
  });
});

describe("Slicer blade lifecycle", () => {
  it("keeps a released blade's trail visible until it fades, then drops it", () => {
    const s = new Slicer({ trailTtl: 200 });
    s.addSample("p", 100, 100, 1000);
    s.addSample("p", 300, 100, 1030);
    s.endBlade("p");
    expect(s.getBlades(1050)).toHaveLength(1); // still fading
    s.detect([], 1300);
    expect(s.getBlades(1300)).toHaveLength(0);
  });

  it("starts a fresh trail when a released source presses again", () => {
    const s = new Slicer();
    const f = { x: 500, y: 100, r: 30, sliced: false };
    s.addSample("p", 100, 100, 1000);
    s.addSample("p", 200, 100, 1030);
    s.endBlade("p");
    // New press far away: must not connect to the old trail and cut between them.
    s.addSample("p", 900, 100, 1060);
    expect(s.detect([f], 1060).hits).toHaveLength(0);
  });
});
