import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';

describe('FixedStepLoop', () => {
  it('runs exactly one step per 1/60s regardless of frame delta', () => {
    const loop = new FixedStepLoop(60, 5, 250);
    let steps = 0;
    for (let i = 0; i < 144; i++) loop.advance(1000 / 144, () => steps++); // 1s at 144 Hz
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
  });

  it('caps catch-up steps and drops backlog', () => {
    const loop = new FixedStepLoop(60, 5, 250);
    let steps = 0;
    loop.advance(250, () => steps++);
    expect(steps).toBe(5);
    steps = 0;
    loop.advance(0, () => steps++);
    expect(steps).toBe(0);
  });

  it('hitstop freezes simulation steps', () => {
    const loop = new FixedStepLoop(60, 5, 250);
    let steps = 0;
    loop.hitstop(3);
    loop.advance(5 * (1000 / 60) + 0.01, () => steps++);
    expect(steps).toBe(2);
    expect(loop.hitstopFrames).toBe(0);
  });
});
