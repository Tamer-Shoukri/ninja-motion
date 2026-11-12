/**
 * Slice detection.
 *
 * We keep a short trail of recent fingertip positions (in canvas space) per
 * tracked hand. A fruit is sliced when a trail SEGMENT from the last frame to
 * this frame passes close to the fruit's center AND the fingertip is moving
 * fast enough (a real swipe, not a slow hover). Speed-gating is what makes it
 * feel like Fruit Ninja instead of "touch to pop".
 */
import type { Fruit } from "./fruit.ts";

export interface TrailPoint {
  x: number;
  y: number;
  t: number; // ms timestamp
}

export interface BladePoint {
  x: number;
  y: number;
  speed: number; // px/s at this point, for blade-glow intensity
}

/** Distance from point P to segment AB (all in px). Standard projection clamp. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export class Slicer {
  // One trail per hand index; each trail is a short ring of recent points.
  private trails: Map<number, TrailPoint[]> = new Map();
  private readonly maxTrail = 10;
  private readonly trailTtl = 180; // ms — points older than this are dropped

  // Tuning knobs (feel). SPEED is the key one.
  private readonly minSpeed = 650; // px/s — below this a pass does NOT slice
  private readonly hitPadding = 14; // px added to fruit radius for forgiveness

  /** Record a fingertip position for a hand this frame. */
  addPoint(handIndex: number, x: number, y: number, t: number): void {
    let trail = this.trails.get(handIndex);
    if (!trail) {
      trail = [];
      this.trails.set(handIndex, trail);
    }
    trail.push({ x, y, t });
    while (trail.length > this.maxTrail) trail.shift();
    // Drop stale points.
    while (trail.length > 1 && t - trail[0].t > this.trailTtl) trail.shift();
  }

  /** Forget hands that are no longer tracked so old trails don't linger. */
  retainHands(activeIndices: Set<number>): void {
    for (const key of [...this.trails.keys()]) {
      if (!activeIndices.has(key)) this.trails.delete(key);
    }
  }

  /** Current blade polylines (for rendering the glowing swipe trail). */
  getBlades(now: number): BladePoint[][] {
    const blades: BladePoint[][] = [];
    for (const trail of this.trails.values()) {
      const pts: BladePoint[] = [];
      for (let i = 0; i < trail.length; i++) {
        if (now - trail[i].t > this.trailTtl) continue;
        let speed = 0;
        if (i > 0) {
          const a = trail[i - 1];
          const b = trail[i];
          const dt = (b.t - a.t) / 1000;
          if (dt > 0) speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
        }
        pts.push({ x: trail[i].x, y: trail[i].y, speed });
      }
      if (pts.length >= 2) blades.push(pts);
    }
    return blades;
  }

  /**
   * Test every un-sliced fruit against the latest motion segment of each hand.
   * Returns the fruits that should be sliced this frame (caller handles effects
   * and scoring). A fruit is marked sliced here to prevent double-hits.
   */
  detectSlices(fruits: Fruit[]): Fruit[] {
    const hit: Fruit[] = [];

    for (const trail of this.trails.values()) {
      if (trail.length < 2) continue;
      const b = trail[trail.length - 1];
      const a = trail[trail.length - 2];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) continue;
      const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      if (speed < this.minSpeed) continue; // too slow → not a slice

      for (const f of fruits) {
        if (f.sliced) continue;
        const d = distToSegment(f.x, f.y, a.x, a.y, b.x, b.y);
        if (d <= f.type.radius + this.hitPadding) {
          f.sliced = true;
          hit.push(f);
        }
      }
    }

    return hit;
  }
}
