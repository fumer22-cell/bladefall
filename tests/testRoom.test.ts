import { describe, expect, it } from 'vitest';
import { PLAYER } from '../src/config';
import { PlayerMovement } from '../src/player/movement/PlayerMovement';
import { buildTestRoom } from '../src/world/testRoom';
import { DT, TS, input, run } from './helpers';

/** The test room's challenges must be beatable with the current tuning (and not trivially). */
describe('test room is beatable', () => {
  const { world } = buildTestRoom();
  const FLOOR_Y = 42 * TS;

  function at(tx: number, surfaceRow: number): PlayerMovement {
    const p = new PlayerMovement(tx * TS, surfaceRow * TS - PLAYER.height);
    run(p, world, 1);
    return p;
  }

  function untilGrounded(p: PlayerMovement, i: Parameters<typeof input>[0] = {}, max = 300): void {
    let f = 0;
    do run(p, world, 1, i);
    while (!p.grounded && ++f < max);
  }

  it('slide tunnel: cannot walk through, can slide through', () => {
    const walker = at(26, 42);
    run(walker, world, 120, { x: 1 });
    expect(walker.body.x).toBeLessThan(30 * TS);

    const slider = at(26, 42);
    run(slider, world, 20, { x: 1 });
    run(slider, world, 90, { x: 1, downHeld: true });
    expect(slider.body.x).toBeGreaterThan(42 * TS);
  });

  function crossPit(opts: { slide: boolean; dash: boolean }): number {
    const p = at(58, 42);
    // Run up along the ice.
    while (p.body.x + p.body.w < 71 * TS - 90) run(p, world, 1, { x: 1, downHeld: opts.slide });
    if (opts.dash) run(p, world, 1, { x: 1, dashPressed: true, downHeld: opts.slide });
    while (p.body.x + p.body.w < 71 * TS - 2) run(p, world, 1, { x: 1, downHeld: opts.slide });
    run(p, world, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    untilGrounded(p, { x: 1, jumpHeld: true });
    return p.body.bottom;
  }

  it('pit: a plain running jump falls in', () => {
    expect(crossPit({ slide: false, dash: false })).toBeGreaterThan(FLOOR_Y);
  });

  it('pit: slide-jump clears it', () => {
    expect(crossPit({ slide: true, dash: false })).toBe(FLOOR_Y);
  });

  it('pit: dash-slide-jump clears it', () => {
    // Flies so far it can land on the first stair step beyond the pit.
    expect(crossPit({ slide: true, dash: true })).toBeLessThanOrEqual(FLOOR_Y);
  });

  it('pit: can wall-jump back out', () => {
    const p = at(72, 47);
    for (let i = 0; i < 6 && p.body.bottom > FLOOR_Y; i++) {
      // Push against the left pit wall, then kick off and steer back to it.
      untilGrounded(p, { x: -1 }, 20);
      run(p, world, 1, { x: -1, jumpPressed: true, jumpHeld: true });
      run(p, world, 25, { x: -1, jumpHeld: true });
      run(p, world, 1, { x: -1, jumpPressed: true, jumpHeld: true });
      run(p, world, 12, { x: 1, jumpHeld: true });
      run(p, world, 20, { x: -1, jumpHeld: true });
    }
    untilGrounded(p, { x: -1 });
    expect(p.body.bottom).toBe(FLOOR_Y);
  });

  it('pillar: slam-bounce from the tower reaches the top; a normal jump does not', () => {
    const PILLAR_TOP = 24 * TS;

    // Normal jump from the pad.
    const j = at(113, 42);
    run(j, world, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    untilGrounded(j, { x: 1, jumpHeld: true });
    expect(j.body.bottom).toBe(FLOOR_Y);

    // Top step → hop right over the pad → slam → bounce → steer onto pillar.
    const p = at(105, 27);
    run(p, world, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    while (p.body.vy < 0) run(p, world, 1, { x: 1, jumpHeld: true });
    run(p, world, 1, { downPressed: true });
    untilGrounded(p);
    expect(p.body.bottom).toBe(FLOOR_Y);
    run(p, world, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    for (let f = 0; f < 120 && !p.grounded; f++) {
      run(p, world, 1, { x: p.body.x < 118 * TS ? 1 : 0, jumpHeld: true }); // stop steering once above it
    }
    expect(p.body.bottom).toBe(PILLAR_TOP);
  });

  it('shaft: can climb to the top with wall jumps', () => {
    const p = at(129, 42);
    let dir: -1 | 1 = 1;
    for (let i = 0; i < 40 && p.body.y > 6 * TS; i++) {
      run(p, world, 1, { x: dir, jumpPressed: true, jumpHeld: true });
      let f = 0;
      while (p.body.wallDir !== -dir && f++ < 40) run(p, world, 1, { x: -dir as -1 | 1, jumpHeld: true });
      dir = -dir as -1 | 1;
    }
    expect(p.body.y).toBeLessThan(8 * TS);
  });

  it('everything above is deterministic frame-to-frame', () => {
    const a = at(10, 42);
    const b = at(10, 42);
    for (let i = 0; i < 200; i++) {
      const inp = input({ x: 1, dashPressed: i % 50 === 0, downHeld: i % 70 > 35, jumpPressed: i % 40 === 0, jumpHeld: true });
      a.step(inp, world, DT);
      b.step(inp, world, DT);
    }
    expect([a.body.x, a.body.y]).toEqual([b.body.x, b.body.y]);
  });
});
