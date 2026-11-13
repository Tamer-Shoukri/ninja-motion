/**
 * One Euro filter (Casiez et al., CHI 2012) for fingertip positions.
 *
 * Hand landmarks jitter by a few pixels even when the hand is still, but a
 * plain low-pass filter would make fast swipes lag behind the real hand. The
 * One Euro filter adapts its cutoff to speed: heavy smoothing at rest, almost
 * none during a fast slice — exactly the trade-off a blade needs.
 */

function alpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    private minCutoff = 1.2, // Hz — smoothing at rest
    private beta = 0.008, // how fast cutoff rises with speed (per px/s)
    private dCutoff = 1, // Hz — smoothing of the speed estimate
  ) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  filter(value: number, tSec: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = tSec;
      return value;
    }
    const dt = Math.max(tSec - this.t, 1e-3);
    this.t = tSec;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

/** Two independent One Euro filters for an (x, y) point. */
export class OneEuro2D {
  private fx: OneEuro;
  private fy: OneEuro;

  constructor(minCutoff?: number, beta?: number) {
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }

  filter(x: number, y: number, tSec: number): [number, number] {
    return [this.fx.filter(x, tSec), this.fy.filter(y, tSec)];
  }
}
