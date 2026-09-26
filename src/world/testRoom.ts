import { PLAYER, WORLD } from '../config';
import { Tile } from './tiles';
import { World } from './World';

/**
 * Phase 1 hand-built test room. Each section exercises one movement tech.
 * (Replaced by procedural worldgen in Phase 3; kept as a debug/training room.)
 *
 *   A  spawn + small hops           x   1..28
 *   B  slide tunnel (1 tile high)   x  30..41
 *   C  ice run                      x  44..70
 *   D  wide pit (slide/dash-jump)   x  71..82
 *   E  stair tower → slam pad → tall pillar (slam-bounce)   x 88..121
 *   F  wall-jump shaft              x 126..133
 *   G  chaining playground          x 134..168
 */

export interface Sign {
  tx: number;
  ty: number;
  text: string;
}

export interface Room {
  world: World;
  spawnX: number;
  spawnY: number;
  signs: Sign[];
}

const W = 170;
const H = 48;
/** Top row of the main floor. */
const FLOOR = 42;

export function buildTestRoom(): Room {
  const w = new World(W, H);
  const S = Tile.Stone;

  // Shell: ceiling, side walls, thick floor with grass on top.
  w.fill(0, 0, W, 1, Tile.Bedrock);
  w.fill(0, 0, 1, H, Tile.Bedrock);
  w.fill(W - 1, 0, 1, H, Tile.Bedrock);
  w.fill(0, FLOOR + 1, W, H - FLOOR - 1, Tile.Dirt);
  w.fill(0, FLOOR, W, 1, Tile.Grass);
  w.fill(0, H - 1, W, 1, Tile.Bedrock);

  // A — spawn area with a couple of hops.
  w.fill(14, FLOOR - 2, 2, 2, S);
  w.fill(20, FLOOR - 5, 5, 1, S);

  // B — slide tunnel: only the single row directly above the floor is open.
  w.fill(30, 26, 12, FLOOR - 1 - 26, S);

  // C — ice run.
  w.fill(44, FLOOR, 27, 1, Tile.Ice);

  // D — pit, 12 tiles wide (a plain running jump reaches ~10), 5 deep (wall-jump out).
  w.fill(71, FLOOR, 12, 5, Tile.Air);
  w.fill(71, FLOOR + 5, 12, 1, Tile.Stone);

  // E — stair tower (5 steps of 3 tiles), slam pad, tall pillar.
  for (let i = 0; i < 5; i++) {
    const top = FLOOR - 3 * (i + 1);
    w.fill(88 + i * 4, top, 4, FLOOR - top, S);
  }
  // pad: x 108..115 is open floor
  w.fill(116, FLOOR - 18, 6, 18, S);

  // F — wall-jump shaft: interior x 128..131, entrance at the bottom-left.
  w.fill(126, 6, 2, FLOOR - 3 - 6, S);
  w.fill(132, 8, 2, FLOOR - 8, S);
  w.fill(134, 8, 12, 1, S); // reward ledge at the top

  // G — floating platforms for chaining moves.
  w.fill(150, FLOOR - 4, 4, 1, S);
  w.fill(156, FLOOR - 8, 4, 1, S);
  w.fill(162, FLOOR - 12, 4, 1, S);
  w.fill(150, FLOOR - 15, 6, 1, Tile.Ice);
  w.fill(158, 22, 1, 12, S); // lone wall for single-wall kicks

  const ts = WORLD.tileSize;
  return {
    world: w,
    spawnX: 4 * ts,
    spawnY: FLOOR * ts - PLAYER.height,
    signs: [
      { tx: 2, ty: FLOOR - 9, text: 'A/D move   SPACE jump   SHIFT dash\nS slide (ground) / slam (air)\nR reset   F3 debug' },
      { tx: 25, ty: FLOOR - 10, text: 'Hold S at speed >>\nslide under' },
      { tx: 45, ty: FLOOR - 6, text: 'ICE: momentum carries' },
      { tx: 70, ty: FLOOR - 9, text: '12-tile gap: slide-jump\nor dash-jump across' },
      { tx: 72, ty: FLOOR + 1, text: 'hold toward a wall + SPACE' },
      { tx: 94, ty: FLOOR - 22, text: 'From the top: S in mid-air to SLAM,\nthen SPACE right as you land = BOUNCE' },
      { tx: 114, ty: FLOOR - 21, text: 'v bounce up here v' },
      { tx: 122, ty: FLOOR - 7, text: '^ Wall-jump shaft ^' },
      { tx: 135, ty: 6, text: 'Top of the shaft!' },
      { tx: 148, ty: FLOOR - 20, text: 'Chain it: dash > slide > jump' },
    ],
  };
}
