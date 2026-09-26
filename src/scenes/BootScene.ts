import Phaser from 'phaser';

/** Generates placeholder textures, then starts the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('px', 2, 2);
    g.destroy();
    this.scene.start('Game');
  }
}
