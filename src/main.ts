import Phaser from 'phaser';
import { DISPLAY } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

// Right mouse will be block/parry; never open the browser context menu over the game.
window.addEventListener('contextmenu', (e) => e.preventDefault());

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DISPLAY.width,
  height: DISPLAY.height,
  backgroundColor: DISPLAY.backgroundColor,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Phaser's own keyboard plugin stays off; our Input class owns the keyboard.
  input: { keyboard: false },
  scene: [BootScene, GameScene],
});
