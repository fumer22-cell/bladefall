import Phaser from 'phaser';
import { FEEL, MOVEMENT, PLAYER } from '../config';
import { lerp } from '../core/math';
import type { MoveEvent, MoveState, PlayerMovement } from './movement/PlayerMovement';

const STATE_COLORS: Record<MoveState, number> = {
  normal: 0xe8e4f2,
  dash: 0x7fe6ff,
  slide: 0xffd27f,
  slam: 0xff7f7f,
  wallslide: 0xc6b2ff,
};

/**
 * Placeholder visuals for the player: a colored box with a visor showing facing,
 * afterimages while dashing, dust particles on movement events.
 * Renders at an interpolated position between the last two simulation steps.
 */
export class PlayerView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private prevFeetX = 0;
  private prevFeetY = 0;
  /** Interpolated feet position from the last render (for the camera). */
  renderX = 0;
  renderY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly move: PlayerMovement,
  ) {
    this.gfx = scene.add.graphics().setDepth(10);
    this.dust = scene.add
      .particles(0, 0, 'px', {
        speed: { min: 30, max: 120 },
        angle: { min: 200, max: 340 },
        lifespan: { min: 200, max: 400 },
        scale: { start: 1.5, end: 0 },
        gravityY: 300,
        tint: [0xd8d0c0, 0xa89f90],
        emitting: false,
      })
      .setDepth(11);
    this.snapPrev();
  }

  /** Call right before each simulation step. */
  capturePrev(): void {
    this.snapPrev();
  }

  /** Call after teleports so interpolation doesn't streak across the map. */
  snapPrev(): void {
    const b = this.move.body;
    this.prevFeetX = b.centerX;
    this.prevFeetY = b.bottom;
  }

  /** React to movement events emitted during the last simulation step. */
  handleEvents(events: MoveEvent[], frame: number): void {
    const b = this.move.body;
    for (const e of events) {
      switch (e.type) {
        case 'jump':
        case 'dashJump':
          this.dust.explode(6, e.x, e.y);
          break;
        case 'slideJump':
          this.dust.explode(10, e.x, e.y);
          break;
        case 'wallJump':
          this.dust.explode(8, e.x - e.dir * (PLAYER.width / 2), e.y - PLAYER.height / 2);
          break;
        case 'land':
          if (e.power > 250) this.dust.explode(Math.min(14, Math.floor(e.power / 60)), e.x, e.y);
          break;
        case 'slamLand':
          this.dust.explode(24, e.x, e.y);
          break;
        case 'slamBounce':
          this.dust.explode(16, e.x, e.y);
          break;
        case 'slideStart':
        case 'dash':
        case 'slamStart':
          break;
      }
    }
    // Continuous effects.
    if (this.move.state === 'dash' && frame % FEEL.dashAfterimageEveryFrames === 0) this.afterimage(0x7fe6ff);
    if (this.move.state === 'slam' && frame % 2 === 0) this.afterimage(0xff7f7f);
    if (this.move.state === 'slide' && b.onGround && frame % 3 === 0) {
      this.dust.explode(1, b.centerX - Math.sign(b.vx) * 4, b.bottom);
    }
    if (this.move.state === 'wallslide' && frame % 4 === 0) {
      this.dust.explode(1, b.centerX + b.wallDir * (PLAYER.width / 2), b.centerY);
    }
  }

  private afterimage(color: number): void {
    const b = this.move.body;
    const r = this.scene.add.rectangle(b.x, b.y, b.w, b.h, color, 0.55).setOrigin(0, 0).setDepth(9);
    this.scene.tweens.add({
      targets: r,
      alpha: 0,
      duration: FEEL.afterimageFadeMs,
      onComplete: () => r.destroy(),
    });
  }

  render(alpha: number, frame: number): void {
    const m = this.move;
    const b = m.body;
    const fx = lerp(this.prevFeetX, b.centerX, alpha);
    const fy = lerp(this.prevFeetY, b.bottom, alpha);
    this.renderX = fx;
    this.renderY = fy;

    const x = Math.round(fx - b.w / 2);
    const y = Math.round(fy - b.h);
    const g = this.gfx;
    g.clear();

    // I-frame flicker.
    const flicker = m.invincible && frame % 4 < 2;
    g.fillStyle(STATE_COLORS[m.state], flicker ? 0.45 : 1);
    g.fillRect(x, y, b.w, b.h);

    // Visor on the facing side.
    const visorY = y + (m.state === 'slide' ? 2 : 4);
    g.fillStyle(0x1b1830, flicker ? 0.45 : 1);
    g.fillRect(m.facing === 1 ? x + b.w - 4 : x, visorY, 4, 3);

    // Scarf trailing behind for a readable sense of speed.
    const speed = Math.min(1, Math.abs(b.vx) / MOVEMENT.dash.speed);
    const len = 3 + Math.round(speed * 9);
    g.fillStyle(0xc0304a, 1);
    const scarfX = m.facing === 1 ? x - len : x + b.w;
    g.fillRect(scarfX, visorY + 4, len, 2);
  }
}
