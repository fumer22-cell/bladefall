import { describe, expect, it } from 'vitest';
import { Body, moveAndCollide, rectHitsSolid } from '../src/core/physics';
import { DT, FLOOR, TS, flatWorld } from './helpers';
import { Tile } from '../src/world/tiles';

describe('tile physics', () => {
  it('lands flush on the floor and reports ground contact', () => {
    const w = flatWorld();
    const b = new Body(100, FLOOR * TS - 40, 10, 22);
    b.vy = 300;
    let landed = false;
    for (let i = 0; i < 30; i++) {
      b.vy += 1500 * DT;
      if (moveAndCollide(b, w, DT).landed) landed = true;
    }
    expect(landed).toBe(true);
    expect(b.bottom).toBe(FLOOR * TS);
    expect(b.onGround).toBe(true);
    expect(b.vy).toBe(0);
  });

  it('never tunnels through a 1-tile wall at extreme speed', () => {
    const w = flatWorld();
    w.fill(30, FLOOR - 3, 1, 3, Tile.Stone);
    const b = new Body(30 * TS - 70, FLOOR * TS - 22, 10, 22);
    b.vx = 5000; // 83 px in one step: 4+ tiles
    const res = moveAndCollide(b, w, DT);
    expect(res.hitX).toBe(true);
    expect(b.x + b.w).toBe(30 * TS);
    expect(b.onWallR).toBe(true);
    expect(res.impactVx).toBe(5000);
  });

  it('never tunnels through a 1-tile floor at extreme fall speed', () => {
    const w = flatWorld();
    w.fill(0, 10, 80, 1, Tile.Stone);
    const b = new Body(100, 10 * TS - 30, 10, 22);
    b.vy = 4000;
    moveAndCollide(b, w, DT);
    expect(b.bottom).toBe(10 * TS);
  });

  it('bumps its head on ceilings', () => {
    const w = flatWorld();
    w.fill(0, FLOOR - 3, 80, 1, Tile.Stone);
    const b = new Body(100, FLOOR * TS - 22, 10, 22);
    b.vy = -1200;
    const res = moveAndCollide(b, w, DT);
    expect(res.hitY).toBe(true);
    expect(b.y).toBe((FLOOR - 2) * TS);
    expect(b.onCeiling).toBe(true);
  });

  it('reports ground tile type for friction', () => {
    const w = flatWorld(Tile.Ice);
    const b = new Body(100, FLOOR * TS - 22, 10, 22);
    moveAndCollide(b, w, DT);
    expect(b.groundTile).toBe(Tile.Ice);
  });

  it('rectHitsSolid treats flush edges as non-overlapping', () => {
    const w = flatWorld();
    expect(rectHitsSolid(w, 0, FLOOR * TS - 22, 10, 22)).toBe(false);
    expect(rectHitsSolid(w, 0, FLOOR * TS - 21, 10, 22)).toBe(true);
  });

  it('treats out-of-bounds as solid', () => {
    const w = flatWorld();
    const b = new Body(5, 50, 10, 22);
    b.vx = -600;
    moveAndCollide(b, w, DT);
    expect(b.x).toBe(0);
  });
});
