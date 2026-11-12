/**
 * Tiny WebAudio SFX — no asset files, just synthesized blips so the repo stays
 * light and there's nothing to load. Created lazily on first user gesture.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        this.enabled = false;
        return null;
      }
    }
    return this.ctx;
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain = 0.15): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  slice(combo: number): void {
    // Pitch rises with combo for a satisfying streak feel.
    this.blip(500 + Math.min(combo, 8) * 60, 0.12, "triangle", 0.18);
  }
  bomb(): void {
    this.blip(90, 0.35, "sawtooth", 0.3);
  }
  miss(): void {
    this.blip(200, 0.2, "sine", 0.12);
  }
  over(): void {
    this.blip(160, 0.6, "sawtooth", 0.22);
  }
}
