import { WORLD } from '../config';
import type { TileQuery } from '../core/physics';
import { Tile, tileDef, type TileDef } from './tiles';

/**
 * Tile storage. Phase 1 holds a single small room; Phase 3 adds chunking & worldgen
 * on top of this same get/set API.
 */
export class World implements TileQuery {
  readonly tileSize = WORLD.tileSize;
  readonly tiles: Uint16Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.tiles = new Uint16Array(width * height);
  }

  get pixelWidth(): number {
    return this.width * this.tileSize;
  }
  get pixelHeight(): number {
    return this.height * this.tileSize;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /** Out-of-bounds reads return bedrock so nothing ever escapes the world. */
  tileAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return Tile.Bedrock;
    return this.tiles[ty * this.width + tx];
  }

  setTile(tx: number, ty: number, id: number): void {
    if (this.inBounds(tx, ty)) this.tiles[ty * this.width + tx] = id;
  }

  isSolid(tx: number, ty: number): boolean {
    return tileDef(this.tileAt(tx, ty)).solid;
  }

  defAt(tx: number, ty: number): TileDef {
    return tileDef(this.tileAt(tx, ty));
  }

  fill(tx: number, ty: number, w: number, h: number, id: number): void {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.setTile(x, y, id);
  }
}
