import Phaser from 'phaser';
import { MOVEMENT } from '../config';
import type { PlayerMovement } from '../player/movement/PlayerMovement';

/** Screen-space HUD. Phase 1: dash pips only. */
export class Hud {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(100);
    scene.add
      .text(8, 8, 'DASH', { fontFamily: 'monospace', fontSize: '8px', color: '#9fe8ff' })
      .setScrollFactor(0)
      .setDepth(100)
      .setResolution(4);
  }

  render(move: PlayerMovement): void {
    const g = this.gfx;
    g.clear();
    const pips = MOVEMENT.dash.pips;
    for (let i = 0; i < pips; i++) {
      const x = 32 + i * 16;
      const y = 9;
      const fill = Math.max(0, Math.min(1, move.dashPips - i));
      g.fillStyle(0x0c0b12, 0.8);
      g.fillRect(x - 1, y - 1, 14, 8);
      if (fill >= 1) {
        g.fillStyle(0x7fe6ff, 1);
        g.fillRect(x, y, 12, 6);
      } else if (fill > 0) {
        g.fillStyle(0x2f6b80, 1);
        g.fillRect(x, y, Math.round(12 * fill), 6);
      }
    }
  }
}
