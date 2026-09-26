import { TILE_PHYSICS } from '../config';

export const Tile = {
  Air: 0,
  Dirt: 1,
  Grass: 2,
  Stone: 3,
  Ice: 4,
  Bedrock: 5,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export interface TileDef {
  id: number;
  name: string;
  solid: boolean;
  /** Braking multiplier (1 = normal, ice ≈ 0). */
  friction: number;
  /** Acceleration multiplier (1 = normal). */
  traction: number;
  /** Placeholder art: base fill color. */
  color: number;
  /** Placeholder art: top-edge highlight when exposed to air. */
  topColor?: number;
}

const surface = TILE_PHYSICS.default;

export const TILE_DEFS: TileDef[] = [];
function def(d: TileDef): void {
  TILE_DEFS[d.id] = d;
}

def({ id: Tile.Air, name: 'air', solid: false, ...surface, color: 0x000000 });
def({ id: Tile.Dirt, name: 'dirt', solid: true, ...surface, color: 0x6b4a32 });
def({ id: Tile.Grass, name: 'grass', solid: true, ...surface, color: 0x6b4a32, topColor: 0x5fae4a });
def({ id: Tile.Stone, name: 'stone', solid: true, ...surface, color: 0x585566 });
def({ id: Tile.Ice, name: 'ice', solid: true, ...TILE_PHYSICS.ice, color: 0x9fd8ee, topColor: 0xe4f7ff });
def({ id: Tile.Bedrock, name: 'bedrock', solid: true, ...surface, color: 0x2a2733 });

export function tileDef(id: number): TileDef {
  return TILE_DEFS[id] ?? TILE_DEFS[Tile.Air];
}
