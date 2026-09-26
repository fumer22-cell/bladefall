/**
 * Custom AABB-vs-tile kinematic physics.
 *
 * Bodies are axis-aligned boxes positioned by their top-left corner. Movement is swept in
 * sub-steps no larger than half a tile, resolving X then Y, so even very fast bodies
 * (dashes, slams) cannot tunnel through a single tile.
 */

export interface TileQuery {
  readonly tileSize: number;
  isSolid(tx: number, ty: number): boolean;
  tileAt(tx: number, ty: number): number;
}

export class Body {
  vx = 0;
  vy = 0;
  onGround = false;
  onCeiling = false;
  onWallL = false;
  onWallR = false;
  /** Tile id under the body's feet (0 if airborne). */
  groundTile = 0;

  constructor(
    public x: number,
    public y: number,
    public w: number,
    public h: number,
  ) {}

  get centerX(): number {
    return this.x + this.w / 2;
  }
  get centerY(): number {
    return this.y + this.h / 2;
  }
  get bottom(): number {
    return this.y + this.h;
  }
  /** -1 touching a wall on the left, 1 on the right, 0 none. */
  get wallDir(): -1 | 0 | 1 {
    return this.onWallR ? 1 : this.onWallL ? -1 : 0;
  }
}

export interface MoveResult {
  hitX: boolean;
  hitY: boolean;
  /** Collided with the floor while moving down this step. */
  landed: boolean;
  /** Horizontal speed the body had at the moment it hit a wall (0 if no hit). */
  impactVx: number;
  /** Vertical speed the body had at the moment it hit floor/ceiling (0 if no hit). */
  impactVy: number;
}

const EPS = 1e-4;
const PROBE = 0.01;

/** True if any solid tile overlaps the rectangle. */
export function rectHitsSolid(world: TileQuery, x: number, y: number, w: number, h: number): boolean {
  const ts = world.tileSize;
  const x0 = Math.floor(x / ts);
  const x1 = Math.floor((x + w - EPS) / ts);
  const y0 = Math.floor(y / ts);
  const y1 = Math.floor((y + h - EPS) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (world.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

function columnSolid(world: TileQuery, tx: number, y: number, h: number): boolean {
  const ts = world.tileSize;
  const y0 = Math.floor(y / ts);
  const y1 = Math.floor((y + h - EPS) / ts);
  for (let ty = y0; ty <= y1; ty++) if (world.isSolid(tx, ty)) return true;
  return false;
}

function rowSolid(world: TileQuery, ty: number, x: number, w: number): boolean {
  const ts = world.tileSize;
  const x0 = Math.floor(x / ts);
  const x1 = Math.floor((x + w - EPS) / ts);
  for (let tx = x0; tx <= x1; tx++) if (world.isSolid(tx, ty)) return true;
  return false;
}

export function moveAndCollide(body: Body, world: TileQuery, dt: number): MoveResult {
  const ts = world.tileSize;
  const res: MoveResult = { hitX: false, hitY: false, landed: false, impactVx: 0, impactVy: 0 };
  const dx = body.vx * dt;
  const dy = body.vy * dt;
  const maxStep = ts * 0.45;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0 && !res.hitX) {
      body.x += sx;
      if (sx > 0) {
        const tx = Math.floor((body.x + body.w - EPS) / ts);
        if (columnSolid(world, tx, body.y, body.h)) {
          body.x = tx * ts - body.w;
          res.hitX = true;
        }
      } else {
        const tx = Math.floor(body.x / ts);
        if (columnSolid(world, tx, body.y, body.h)) {
          body.x = (tx + 1) * ts;
          res.hitX = true;
        }
      }
      if (res.hitX) {
        res.impactVx = body.vx;
        body.vx = 0;
      }
    }
    if (sy !== 0 && !res.hitY) {
      body.y += sy;
      if (sy > 0) {
        const ty = Math.floor((body.y + body.h - EPS) / ts);
        if (rowSolid(world, ty, body.x, body.w)) {
          body.y = ty * ts - body.h;
          res.hitY = true;
          res.landed = true;
        }
      } else {
        const ty = Math.floor(body.y / ts);
        if (rowSolid(world, ty, body.x, body.w)) {
          body.y = (ty + 1) * ts;
          res.hitY = true;
        }
      }
      if (res.hitY) {
        res.impactVy = body.vy;
        body.vy = 0;
      }
    }
  }

  updateContacts(body, world);
  return res;
}

/** Refresh onGround / onWall / onCeiling flags with 1-pixel-ish probes. */
export function updateContacts(body: Body, world: TileQuery): void {
  const ts = world.tileSize;
  const footRow = Math.floor((body.y + body.h + PROBE) / ts);
  body.onGround = rowSolid(world, footRow, body.x, body.w);
  body.onCeiling = rowSolid(world, Math.floor((body.y - PROBE) / ts), body.x, body.w);
  body.onWallL = columnSolid(world, Math.floor((body.x - PROBE) / ts), body.y, body.h);
  body.onWallR = columnSolid(world, Math.floor((body.x + body.w + PROBE) / ts), body.y, body.h);

  body.groundTile = 0;
  if (body.onGround) {
    // Prefer the tile under the center of the feet, fall back to any supporting tile.
    const center = world.tileAt(Math.floor(body.centerX / ts), footRow);
    if (center !== 0) {
      body.groundTile = center;
    } else {
      const x0 = Math.floor(body.x / ts);
      const x1 = Math.floor((body.x + body.w - EPS) / ts);
      for (let tx = x0; tx <= x1 && body.groundTile === 0; tx++) body.groundTile = world.tileAt(tx, footRow);
    }
  }
}
