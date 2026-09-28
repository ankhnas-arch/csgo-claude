/** Fixed-step accumulator with bounded catch-up so timers never drift under frame hitches. */
export const FIXED_DT = 1 / 64;
export const MAX_STEPS_PER_FRAME = 8;
export class FixedClock {
  accumulator = 0;
  simTime = 0;
  step(frameDt: number, tick: (dt: number) => void): number {
    this.accumulator += Math.min(frameDt, 0.25);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      tick(FIXED_DT); this.simTime += FIXED_DT; this.accumulator -= FIXED_DT; steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // drop excess, don't spiral
    return this.accumulator / FIXED_DT; // interpolation alpha
  }
}
