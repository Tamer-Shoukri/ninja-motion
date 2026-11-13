/**
 * Slice detection.
 *
 * Each input source — a tracked hand, or a mouse/touch pointer — owns a
 * "blade": a short trail of recent positions in canvas space. A fruit is cut
 * when a NEW trail segment passes within the fruit's radius AND the blade is
 * moving fast enough. Speed-gating is what makes it feel like a blade instead
 * of "touch to pop".
 *
 * Every hit records the cut angle (so halves split along the swipe), and
 * fruit cut within one continuous fast stroke are counted for combo bonuses.
 */

export interface Sliceable {
  x: number;
  y: number;
  r: number;
  sliced: boolean;
}

export interface TrailPoint {
  x: number;
  y: number;
  t: number; // ms
}

export interface BladePoint {
  x: number;
  y: number;
  speed: number; // px/s arriving at this point
  age: number; // ms since sampled
}

export interface SliceHit<T extends Sliceable = Sliceable> {
  target: T;
  angle: number; // radians, direction of the cutting segment
  bladeId: string;
}

export interface StrokeEnd {
  bladeId: string;
  count: number; // targets cut during the stroke
  x: number;
  y: number;
}

export interface SlicerOptions {
  minSpeed: number; // px/s — slower passes never cut
  hitPadding: number; // px of forgiveness around each target
  trailTtl: number; // ms a point stays in the visible trail
  strokeGap: number; // ms of slow motion that ends a stroke
  maxJump: number; // px — a bigger jump between samples is a tracking glitch, not a swipe
}

export const DEFAULT_SLICER: SlicerOptions = {
  minSpeed: 520,
  hitPadding: 18,
  trailTtl: 200,
  strokeGap: 160,
  maxJump: 520,
};

interface Blade {
  pts: TrailPoint[];
  ended: boolean; // source released; trail fades out, then the blade is dropped
  checkedUpTo: number; // ms — segments ending at or before this were already tested
  strokeCount: number;
  lastFastT: number;
  lastHitX: number;
  lastHitY: number;
}

/** Distance from point P to segment AB. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export class Slicer {
  readonly opts: SlicerOptions;
  private blades = new Map<string, Blade>();
  private pendingStrokes: StrokeEnd[] = [];

  constructor(opts: Partial<SlicerOptions> = {}) {
    this.opts = { ...DEFAULT_SLICER, ...opts };
  }

  /** Add a new position sample for a blade. Call once per genuinely new sample. */
  addSample(id: string, x: number, y: number, t: number): void {
    let b = this.blades.get(id);
    if (!b) {
      b = { pts: [], ended: false, checkedUpTo: t, strokeCount: 0, lastFastT: 0, lastHitX: x, lastHitY: y };
      this.blades.set(id, b);
    }
    if (b.ended) {
      // Same source started again (new press / hand reappeared): fresh trail.
      b.ended = false;
      b.pts.length = 0;
      b.checkedUpTo = t;
    }
    const last = b.pts[b.pts.length - 1];
    if (last) {
      if (t <= last.t) return; // duplicate / out-of-order sample
      // A huge jump between consecutive samples is a tracking glitch (e.g. two
      // hands swapping identity), never a real swipe — restart the trail
      // instead of creating a phantom cut across the screen.
      if (Math.hypot(x - last.x, y - last.y) > this.opts.maxJump) {
        this.flushStroke(id, b);
        b.pts.length = 0;
        b.checkedUpTo = t;
      }
    }
    b.pts.push({ x, y, t });
    while (b.pts.length > 2 && t - b.pts[0].t > this.opts.trailTtl * 2) b.pts.shift();
  }

  /** The source stopped (pointer released, hand lost). Its trail fades out. */
  endBlade(id: string): void {
    const b = this.blades.get(id);
    if (!b || b.ended) return;
    this.flushStroke(id, b);
    b.ended = true;
  }

  /** End every blade whose id is not in `active`. */
  retain(active: Set<string>, prefix = ""): void {
    for (const id of [...this.blades.keys()]) {
      if (id.startsWith(prefix) && !active.has(id)) this.endBlade(id);
    }
  }

  clear(): void {
    this.blades.clear();
    this.pendingStrokes = [];
  }

  /**
   * Test new fast segments of every blade against targets. Marks hit targets
   * `sliced`, returns the hits plus any strokes that just finished.
   */
  detect<T extends Sliceable>(targets: T[], now: number): { hits: SliceHit<T>[]; strokes: StrokeEnd[] } {
    const hits: SliceHit<T>[] = [];
    for (const [id, b] of this.blades) {
      for (let i = 1; i < b.pts.length; i++) {
        const a = b.pts[i - 1];
        const p = b.pts[i];
        if (p.t <= b.checkedUpTo) continue;
        const dt = (p.t - a.t) / 1000;
        const speed = Math.hypot(p.x - a.x, p.y - a.y) / dt;
        if (speed < this.opts.minSpeed) continue;
        b.lastFastT = p.t;
        const angle = Math.atan2(p.y - a.y, p.x - a.x);
        for (const target of targets) {
          if (target.sliced) continue;
          if (distToSegment(target.x, target.y, a.x, a.y, p.x, p.y) <= target.r + this.opts.hitPadding) {
            target.sliced = true;
            hits.push({ target, angle, bladeId: id });
            b.strokeCount++;
            b.lastHitX = target.x;
            b.lastHitY = target.y;
          }
        }
      }
      if (b.pts.length) b.checkedUpTo = b.pts[b.pts.length - 1].t;
      if (b.strokeCount > 0 && now - b.lastFastT > this.opts.strokeGap) this.flushStroke(id, b);
      const newest = b.pts[b.pts.length - 1];
      if (b.ended && (!newest || now - newest.t > this.opts.trailTtl)) this.blades.delete(id);
    }
    const strokes = this.pendingStrokes;
    this.pendingStrokes = [];
    return { hits, strokes };
  }

  private flushStroke(id: string, b: Blade): void {
    if (b.strokeCount > 0) this.pendingStrokes.push({ bladeId: id, count: b.strokeCount, x: b.lastHitX, y: b.lastHitY });
    b.strokeCount = 0;
  }

  /** Visible blade trails (recent points only), for rendering. */
  getBlades(now: number): BladePoint[][] {
    const out: BladePoint[][] = [];
    for (const b of this.blades.values()) {
      const pts: BladePoint[] = [];
      for (let i = 0; i < b.pts.length; i++) {
        const p = b.pts[i];
        const age = now - p.t;
        if (age > this.opts.trailTtl) continue;
        let speed = 0;
        if (i > 0) {
          const a = b.pts[i - 1];
          speed = Math.hypot(p.x - a.x, p.y - a.y) / Math.max((p.t - a.t) / 1000, 1e-3);
        }
        pts.push({ x: p.x, y: p.y, speed, age });
      }
      if (pts.length >= 2) out.push(pts);
    }
    return out;
  }

  /** Current fastest blade speed (px/s) — used for swipe-anywhere shortcuts. */
  peakSpeed(now: number): number {
    let best = 0;
    for (const pts of this.getBlades(now)) for (const p of pts) if (p.age < 80) best = Math.max(best, p.speed);
    return best;
  }
}
