import { describe, expect, it } from 'vitest';
import { MOVEMENT, PLAYER } from '../src/config';
import { PlayerMovement } from '../src/player/movement/PlayerMovement';
import { Tile } from '../src/world/tiles';
import { DT, FLOOR, TS, flatWorld, input, playerOnFloor, run } from './helpers';

const M = MOVEMENT;

describe('running', () => {
  it('reaches run speed and stops', () => {
    const w = flatWorld();
    const p = playerOnFloor(w);
    run(p, w, 30, { x: 1 });
    expect(p.body.vx).toBe(M.runSpeed);
    run(p, w, 30);
    expect(p.body.vx).toBe(0);
  });

  it('slides much further on ice', () => {
    const stone = flatWorld();
    const ice = flatWorld(Tile.Ice);
    const a = playerOnFloor(stone);
    const b = playerOnFloor(ice);
    a.body.vx = b.body.vx = M.runSpeed;
    const ax = a.body.x;
    const bx = b.body.x;
    run(a, stone, 60);
    run(b, ice, 60);
    expect(b.body.x - bx).toBeGreaterThan((a.body.x - ax) * 5);
  });
});

describe('jumping', () => {
  it('jumps from the ground', () => {
    const w = flatWorld();
    const p = playerOnFloor(w);
    run(p, w, 1, { jumpPressed: true, jumpHeld: true });
    expect(p.body.vy).toBeLessThan(0);
    expect(p.events.some((e) => e.type === 'jump')).toBe(true);
  });

  it('allows coyote-time jumps shortly after walking off a ledge', () => {
    const w = flatWorld();
    w.fill(12, FLOOR, 68, 4, Tile.Air); // ledge ends at tile 12
    const p = playerOnFloor(w, 11);
    p.body.vx = M.runSpeed;
    let framesAirborne = 0;
    while (framesAirborne < 3) {
      run(p, w, 1, { x: 1 });
      if (!p.grounded) framesAirborne++;
    }
    run(p, w, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    expect(p.body.vy).toBeLessThan(-M.jumpSpeed * 0.9);
  });

  it('does not allow jumping long after leaving a ledge', () => {
    const w = flatWorld();
    w.fill(12, FLOOR, 68, 4, Tile.Air);
    const p = playerOnFloor(w, 11);
    p.body.vx = M.runSpeed;
    run(p, w, 14, { x: 1 }); // ~10 frames airborne, well past coyote time
    expect(p.grounded).toBe(false);
    run(p, w, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    expect(p.body.vy).toBeGreaterThan(0);
  });

  it('buffers a jump pressed just before landing', () => {
    const w = flatWorld();
    const p = new PlayerMovement(10 * TS, FLOOR * TS - PLAYER.height - 6);
    p.body.vy = 200;
    run(p, w, 1, { jumpPressed: true, jumpHeld: true }); // pressed in the air
    run(p, w, 4, { jumpHeld: true });
    expect(p.body.vy).toBeLessThan(0);
  });

  it('variable height: releasing early gives a lower jump', () => {
    const w = flatWorld();
    const peak = (holdFrames: number) => {
      const p = playerOnFloor(w);
      const startY = p.body.y;
      let minY = startY;
      for (let i = 0; i < 90; i++) {
        run(p, w, 1, {
          jumpPressed: i === 0,
          jumpHeld: i <= holdFrames,
          jumpReleased: i === holdFrames + 1,
        });
        minY = Math.min(minY, p.body.y);
      }
      return startY - minY;
    };
    expect(peak(2)).toBeLessThan(peak(40) * 0.6);
  });
});

describe('dash', () => {
  it('consumes a pip, grants i-frames and moves fast', () => {
    const w = flatWorld();
    const p = playerOnFloor(w);
    run(p, w, 1, { x: 1, dashPressed: true });
    expect(p.state).toBe('dash');
    expect(Math.floor(p.dashPips)).toBe(M.dash.pips - 1);
    expect(p.invincible).toBe(true);
    expect(p.body.vx).toBe(M.dash.speed);
  });

  it('cannot dash with no pips, and pips regenerate', () => {
    const w = flatWorld();
    const p = playerOnFloor(w, 5);
    for (let i = 0; i < M.dash.pips; i++) {
      run(p, w, 1, { x: 1, dashPressed: true });
      run(p, w, M.dash.frames + 1);
    }
    expect(p.dashPips).toBeLessThan(1);
    run(p, w, 1, { x: 1, dashPressed: true });
    expect(p.state).not.toBe('dash');
    run(p, w, M.dash.regenFramesPerPip + 5);
    expect(p.dashPips).toBeGreaterThanOrEqual(1);
  });

  it('carries momentum after the dash ends', () => {
    const w = flatWorld();
    const p = playerOnFloor(w, 5);
    run(p, w, 1, { x: 1, dashPressed: true });
    run(p, w, M.dash.frames + 1, { x: 1 });
    expect(p.state).toBe('normal');
    expect(p.body.vx).toBeGreaterThan(M.runSpeed);
  });

  it('dash → slide inherits dash speed', () => {
    const w = flatWorld();
    const p = playerOnFloor(w, 5);
    run(p, w, 1, { x: 1, dashPressed: true });
    run(p, w, 2, { x: 1, downHeld: true });
    expect(p.state).toBe('slide');
    expect(p.body.vx).toBeGreaterThan(M.slide.speed);
    expect(p.body.h).toBe(PLAYER.slideHeight);
  });
});

describe('slide', () => {
  it('shrinks the hitbox and keeps speed while held', () => {
    const w = flatWorld();
    const p = playerOnFloor(w, 5);
    run(p, w, 60, { x: 1, downHeld: true });
    expect(p.state).toBe('slide');
    expect(Math.abs(p.body.vx)).toBeGreaterThanOrEqual(M.slide.speed);
    expect(p.body.bottom).toBe(FLOOR * TS);
  });

  it('fits through a 1-tile gap and stays sliding until there is headroom', () => {
    const w = flatWorld();
    w.fill(15, 0, 6, FLOOR - 1, Tile.Stone); // tunnel: only row FLOOR-1 open for tiles 15..20
    const p = playerOnFloor(w, 8);
    run(p, w, 25, { x: 1, downHeld: true });
    expect(p.body.x).toBeGreaterThan(15 * TS); // inside the tunnel
    run(p, w, 30, { x: 1 }); // release down mid-tunnel: must keep sliding
    expect(p.body.x).toBeGreaterThan(21 * TS);
    run(p, w, 5, { x: 1 });
    expect(p.state).toBe('normal');
    expect(p.body.h).toBe(PLAYER.height);
  });

  it('slide-jump launches further than a normal running jump', () => {
    const w = flatWorld();
    const distance = (slide: boolean) => {
      const p = playerOnFloor(w, 5);
      run(p, w, 30, { x: 1, downHeld: slide });
      const x0 = p.body.x;
      run(p, w, 1, { x: 1, jumpPressed: true, jumpHeld: true });
      let f = 0;
      do {
        run(p, w, 1, { x: 1, jumpHeld: true });
        f++;
      } while (!p.grounded && f < 200);
      return p.body.x - x0;
    };
    expect(distance(true)).toBeGreaterThan(distance(false) * 1.2);
  });
});

describe('ground slam', () => {
  it('drops fast and bounces higher than a normal jump', () => {
    const w = flatWorld();
    const p = new PlayerMovement(10 * TS, 2 * TS);
    run(p, w, 1, { downPressed: true, downHeld: true });
    expect(p.state).toBe('slam');
    expect(p.body.vy).toBe(M.slam.speed);
    let f = 0;
    while (!p.grounded && f++ < 120) run(p, w, 1);
    expect(p.events.some((e) => e.type === 'slamLand')).toBe(true);
    run(p, w, 1, { jumpPressed: true, jumpHeld: true });
    expect(p.events.some((e) => e.type === 'slamBounce')).toBe(true);
    expect(-p.body.vy).toBeGreaterThan(M.jumpSpeed * 1.5);
  });

  it('does not bounce if jump comes too late', () => {
    const w = flatWorld();
    const p = new PlayerMovement(10 * TS, 10 * TS);
    run(p, w, 1, { downPressed: true, downHeld: true });
    let f = 0;
    while (!p.grounded && f++ < 120) run(p, w, 1);
    run(p, w, M.slam.bounceWindowFrames + 5);
    run(p, w, 1, { jumpPressed: true, jumpHeld: true });
    expect(-p.body.vy).toBe(M.jumpSpeed);
  });

  it('can be cancelled by a dash', () => {
    const w = flatWorld();
    const p = new PlayerMovement(10 * TS, 2 * TS);
    run(p, w, 1, { downPressed: true, downHeld: true });
    run(p, w, 1, { x: 1, dashPressed: true });
    expect(p.state).toBe('dash');
    expect(p.body.vy).toBe(0);
  });
});

describe('walls', () => {
  function wallWorld() {
    const w = flatWorld();
    w.fill(20, 0, 2, FLOOR, Tile.Stone);
    return w;
  }

  it('wall slides at a capped speed when pressing into a wall', () => {
    const w = wallWorld();
    const p = new PlayerMovement(20 * TS - PLAYER.width, 5 * TS);
    p.body.vy = 300;
    run(p, w, 20, { x: 1 });
    expect(p.state).toBe('wallslide');
    expect(p.body.vy).toBeLessThanOrEqual(M.wall.slideMaxFall);
  });

  it('wall jumps up and away', () => {
    const w = wallWorld();
    const p = new PlayerMovement(20 * TS - PLAYER.width, 5 * TS);
    p.body.vy = 100;
    run(p, w, 5, { x: 1 });
    run(p, w, 1, { x: 1, jumpPressed: true, jumpHeld: true });
    expect(p.body.vx).toBeLessThan(0);
    expect(p.body.vy).toBeLessThan(0);
    expect(p.events.some((e) => e.type === 'wallJump')).toBe(true);
  });

  it('can climb a two-wall shaft with repeated wall jumps', () => {
    const w = flatWorld();
    w.fill(20, 0, 2, FLOOR - 3, Tile.Stone);
    w.fill(26, 0, 2, FLOOR, Tile.Stone);
    const p = playerOnFloor(w, 23);
    const startY = p.body.y;
    let dir: -1 | 1 = 1;
    for (let i = 0; i < 12; i++) {
      run(p, w, 1, { x: dir, jumpPressed: true, jumpHeld: true });
      let f = 0;
      while (p.body.wallDir !== -dir && f++ < 60) run(p, w, 1, { x: -dir as -1 | 1, jumpHeld: true });
      dir = -dir as -1 | 1;
    }
    expect(startY - p.body.y).toBeGreaterThan(6 * TS);
  });
});

describe('determinism', () => {
  it('same inputs produce identical results', () => {
    const w = flatWorld();
    const sim = () => {
      const p = playerOnFloor(w, 5);
      const script = [
        input({ x: 1 }),
        input({ x: 1, dashPressed: true }),
        input({ x: 1, downHeld: true }),
        input({ x: 1, downHeld: true, jumpPressed: true, jumpHeld: true }),
        input({ x: 1, jumpHeld: true }),
      ];
      for (let i = 0; i < 120; i++) p.step(script[Math.min(i >> 3, script.length - 1)], w, DT);
      return [p.body.x, p.body.y, p.body.vx, p.body.vy];
    };
    expect(sim()).toEqual(sim());
  });
});
