import Phaser from 'phaser';
import type { PlayerMovement } from '../player/movement/PlayerMovement';

/** F3 overlay: movement state, velocity, contacts, fps, and the true hitbox. */
export class DebugOverlay {
  visible = false;
  private readonly text: Phaser.GameObjects.Text;
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(8, 24, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#e0ffe0',
        backgroundColor: '#000000aa',
        padding: { x: 3, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(200)
      .setResolution(4)
      .setVisible(false);
    this.gfx = scene.add.graphics().setDepth(199).setVisible(false);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.text.setVisible(this.visible);
    this.gfx.setVisible(this.visible);
  }

  render(move: PlayerMovement, simFrame: number): void {
    if (!this.visible) return;
    const b = move.body;
    const contacts = [b.onGround && 'ground', b.onWallL && 'wallL', b.onWallR && 'wallR', b.onCeiling && 'ceil']
      .filter(Boolean)
      .join(' ');
    this.text.setText(
      [
        `fps   ${this.scene.game.loop.actualFps.toFixed(0)}   sim frame ${simFrame}`,
        `state ${move.state} (${move.stateFrames}f)`,
        `pos   ${b.x.toFixed(1)}, ${b.y.toFixed(1)}   tile ${Math.floor(b.centerX / 16)}, ${Math.floor(b.bottom / 16)}`,
        `vel   ${b.vx.toFixed(0)}, ${b.vy.toFixed(0)}`,
        `pips  ${move.dashPips.toFixed(2)}   iframes ${move.iFrames}`,
        `touch ${contacts || '-'}`,
      ].join('\n'),
    );
    const g = this.gfx;
    g.clear();
    g.lineStyle(1, 0x00ff66, 1);
    g.strokeRect(b.x, b.y, b.w, b.h);
    g.lineStyle(1, 0xffff00, 1);
    g.lineBetween(b.centerX, b.centerY, b.centerX + b.vx * 0.1, b.centerY + b.vy * 0.1);
  }
}
