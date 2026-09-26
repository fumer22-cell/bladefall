import Phaser from 'phaser';
import { tileDef } from './tiles';
import type { World } from './World';

/** Cheap deterministic per-tile hash for placeholder texture variation. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function shade(color: number, f: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * f)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
}

/**
 * Bakes the whole (small) Phase 1 world into one static texture.
 * Phase 3 replaces this with per-chunk RenderTextures rebuilt on edit.
 */
export function renderWorldStatic(scene: Phaser.Scene, world: World, key = 'world'): Phaser.GameObjects.Image {
  const ts = world.tileSize;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let ty = 0; ty < world.height; ty++) {
    for (let tx = 0; tx < world.width; tx++) {
      const def = tileDef(world.tileAt(tx, ty));
      if (!def.solid) continue;
      const px = tx * ts;
      const py = ty * ts;
      g.fillStyle(shade(def.color, 0.92 + hash(tx, ty) * 0.16));
      g.fillRect(px, py, ts, ts);
      // Speckles for texture.
      g.fillStyle(shade(def.color, 0.8));
      g.fillRect(px + Math.floor(hash(ty, tx) * 12) + 2, py + Math.floor(hash(tx + 7, ty) * 12) + 2, 2, 2);

      const airAbove = !world.isSolid(tx, ty - 1);
      const airBelow = !world.isSolid(tx, ty + 1);
      const airLeft = !world.isSolid(tx - 1, ty);
      const airRight = !world.isSolid(tx + 1, ty);
      g.fillStyle(shade(def.color, 0.55));
      if (airBelow) g.fillRect(px, py + ts - 2, ts, 2);
      if (airLeft) g.fillRect(px, py, 1, ts);
      if (airRight) g.fillRect(px + ts - 1, py, 1, ts);
      if (airAbove) {
        g.fillStyle(def.topColor ?? shade(def.color, 1.3));
        g.fillRect(px, py, ts, def.topColor ? 4 : 2);
      }
    }
  }
  g.generateTexture(key, world.pixelWidth, world.pixelHeight);
  g.destroy();
  return scene.add.image(0, 0, key).setOrigin(0, 0);
}
