import { SIM } from '../config';

/**
 * Fixed-timestep accumulator. The simulation always advances in exact 1/fps steps
 * regardless of display refresh rate; rendering interpolates with the returned alpha.
 *
 * Hitstop freezes simulation steps (the world) while rendering, camera and particles
 * keep running, and input keeps buffering until the next real step.
 */
export class FixedStepLoop {
  readonly stepMs: number;
  readonly stepSec: number;
  /** Total simulation steps taken (not counting hitstop-frozen steps). */
  frame = 0;
  /** Remaining frozen frames. */
  hitstopFrames = 0;
  private acc = 0;

  constructor(
    fps = SIM.fps,
    private readonly maxSteps = SIM.maxCatchUpSteps,
    private readonly maxDeltaMs = SIM.maxFrameDeltaMs,
  ) {
    this.stepMs = 1000 / fps;
    this.stepSec = 1 / fps;
  }

  /** Request a freeze of `frames` steps. Overlapping requests take the longest. */
  hitstop(frames: number): void {
    this.hitstopFrames = Math.max(this.hitstopFrames, frames);
  }

  /** Advance by a real-time delta; calls `step` 0..maxSteps times. Returns interpolation alpha. */
  advance(deltaMs: number, step: (dt: number) => void): number {
    this.acc += Math.min(Math.max(deltaMs, 0), this.maxDeltaMs);
    let steps = 0;
    while (this.acc >= this.stepMs && steps < this.maxSteps) {
      if (this.hitstopFrames > 0) {
        this.hitstopFrames--;
      } else {
        step(this.stepSec);
        this.frame++;
      }
      this.acc -= this.stepMs;
      steps++;
    }
    // Couldn't keep up: drop the backlog rather than spiral.
    if (this.acc >= this.stepMs) this.acc %= this.stepMs;
    return this.acc / this.stepMs;
  }
}
