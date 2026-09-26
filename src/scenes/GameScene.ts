import Phaser from 'phaser';
import { CAMERA, FEEL, MOVEMENT } from '../config';
import { Input, type InputSnapshot } from '../core/input';
import { FixedStepLoop } from '../core/loop';
import { dampFactor } from '../core/math';
import { PlayerMovement, type MoveEvent, type MoveInput } from '../player/movement/PlayerMovement';
import { PlayerView } from '../player/PlayerView';
import { DebugOverlay } from '../ui/DebugOverlay';
import { Hud } from '../ui/Hud';
import { renderWorldStatic } from '../world/TileRenderer';
import { buildTestRoom, type Room } from '../world/testRoom';

export class GameScene extends Phaser.Scene {
  private loop!: FixedStepLoop;
  private input_!: Input;
  private room!: Room;
  private player!: PlayerMovement;
  private view!: PlayerView;
  private hud!: Hud;
  private debug!: DebugOverlay;
  private lookahead = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.loop = new FixedStepLoop();
    this.input_ = new Input();
    this.input_.attach(window);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input_.destroy());

    this.room = buildTestRoom();
    const world = this.room.world;
    this.createBackdrop(world.pixelWidth, world.pixelHeight);
    renderWorldStatic(this, world);
    for (const s of this.room.signs) {
      this.add
        .text(s.tx * world.tileSize, s.ty * world.tileSize, s.text, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#cfc8e8',
          lineSpacing: 2,
        })
        .setResolution(4)
        .setAlpha(0.85)
        .setDepth(1);
    }

    this.player = new PlayerMovement(this.room.spawnX, this.room.spawnY);
    this.view = new PlayerView(this, this.player);
    this.hud = new Hud(this);
    this.debug = new DebugOverlay(this);

    this.add
      .text(this.scale.width - 8, 8, 'BLADEFALL · Phase 1: Movement', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#6d6887',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setResolution(4)
      .setDepth(100);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, world.pixelWidth, world.pixelHeight);
    cam.centerOn(this.player.body.centerX, this.player.body.centerY);

    // Dev-only handle for console tinkering and automated smoke tests.
    if (import.meta.env.DEV) (window as unknown as { bladefall: unknown }).bladefall = { scene: this, player: this.player };
  }

  private createBackdrop(w: number, h: number): void {
    // Simple parallax layers of placeholder "mountains".
    const far = this.add.graphics().setScrollFactor(0.2, 0.3).setDepth(-20);
    const near = this.add.graphics().setScrollFactor(0.45, 0.6).setDepth(-10);
    far.fillStyle(0x221f33, 1);
    near.fillStyle(0x2b2740, 1);
    for (let x = -200; x < w * 0.5; x += 90) {
      const peak = 120 + ((x * 7919) % 90);
      far.fillTriangle(x, h * 0.55, x + 70, h * 0.55 - peak, x + 140, h * 0.55);
    }
    for (let x = -200; x < w * 0.7; x += 60) {
      const peak = 60 + ((x * 104729) % 70);
      near.fillTriangle(x, h * 0.8, x + 50, h * 0.8 - peak, x + 100, h * 0.8);
    }
    far.fillRect(-200, h * 0.55, w, h);
    near.fillRect(-200, h * 0.8, w, h);
  }

  update(_time: number, delta: number): void {
    const alpha = this.loop.advance(delta, (dt) => this.simStep(dt));
    this.view.render(alpha, this.loop.frame);
    this.updateCamera(delta);
    this.hud.render(this.player);
    this.debug.render(this.player, this.loop.frame);
  }

  private simStep(dt: number): void {
    const s = this.input_.snapshot();
    if (s.pressed('debug')) this.debug.toggle();
    if (s.pressed('reset')) {
      this.player.reset(this.room.spawnX, this.room.spawnY);
      this.view.snapPrev();
      return;
    }
    this.view.capturePrev();
    this.player.step(toMoveInput(s), this.room.world, dt);
    this.handleFeel(this.player.events);
    this.view.handleEvents(this.player.events, this.loop.frame);
  }

  private handleFeel(events: MoveEvent[]): void {
    const cam = this.cameras.main;
    for (const e of events) {
      if (e.type === 'slamLand') {
        cam.shake(FEEL.slamShakeMs, FEEL.slamShakeIntensity * (e.power / MOVEMENT.slam.bounceMax));
      } else if (e.type === 'land' && e.power >= FEEL.landShakeMinFallSpeed) {
        cam.shake(FEEL.landShakeMs, FEEL.landShakeIntensity);
      }
    }
  }

  private updateCamera(deltaMs: number): void {
    const cam = this.cameras.main;
    const b = this.player.body;
    const la = Math.sign(b.vx) * Math.min(1, Math.abs(b.vx) / MOVEMENT.runSpeed) * CAMERA.lookaheadPx;
    this.lookahead += (la - this.lookahead) * dampFactor(CAMERA.lookaheadLerp, deltaMs);
    const tx = this.view.renderX + this.lookahead - cam.width / 2;
    const ty = this.view.renderY - b.h / 2 - CAMERA.verticalBiasPx - cam.height / 2;
    const k = dampFactor(CAMERA.followLerp, deltaMs);
    cam.scrollX += (tx - cam.scrollX) * k;
    cam.scrollY += (ty - cam.scrollY) * k;
  }
}

function toMoveInput(s: InputSnapshot): MoveInput {
  const x = (s.held('right') ? 1 : 0) - (s.held('left') ? 1 : 0);
  return {
    x: x as -1 | 0 | 1,
    jumpPressed: s.pressed('jump'),
    jumpHeld: s.held('jump'),
    jumpReleased: s.released('jump'),
    downPressed: s.pressed('down'),
    downHeld: s.held('down'),
    dashPressed: s.pressed('dash'),
  };
}
