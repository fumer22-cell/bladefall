import { PLAYER, WORLD } from '../src/config';
import { NO_INPUT, PlayerMovement, type MoveInput } from '../src/player/movement/PlayerMovement';
import { Tile } from '../src/world/tiles';
import { World } from '../src/world/World';

export const TS = WORLD.tileSize;
export const DT = 1 / 60;
export const FLOOR = 20;

/** 80×24 room: solid floor from row FLOOR down, open above. */
export function flatWorld(floorTile: number = Tile.Stone): World {
  const w = new World(80, 24);
  w.fill(0, FLOOR, 80, 4, floorTile);
  return w;
}

export function playerOnFloor(world: World, tx = 10): PlayerMovement {
  const p = new PlayerMovement(tx * TS, FLOOR * TS - PLAYER.height);
  // One idle step to populate contact flags.
  p.step(NO_INPUT, world, DT);
  return p;
}

export function input(over: Partial<MoveInput> = {}): MoveInput {
  return { ...NO_INPUT, ...over };
}

/** Step `frames` times with the same input; `pressed` flags only on the first frame. */
export function run(p: PlayerMovement, world: World, frames: number, i: Partial<MoveInput> = {}): void {
  for (let f = 0; f < frames; f++) {
    const first = f === 0;
    p.step(
      input({
        ...i,
        jumpPressed: first && !!i.jumpPressed,
        downPressed: first && !!i.downPressed,
        dashPressed: first && !!i.dashPressed,
        jumpReleased: first && !!i.jumpReleased,
      }),
      world,
      DT,
    );
  }
}
