import { MOVEMENT, PLAYER } from '../../config';
import { approach } from '../../core/math';
import { Body, moveAndCollide, rectHitsSolid, type MoveResult, type TileQuery } from '../../core/physics';
import { tileDef } from '../../world/tiles';

/**
 * Player movement state machine (engine-agnostic, unit-tested).
 *
 * Rule: momentum lives in body.vx/vy and is never zeroed by a state change —
 * transitions only add to it or clamp it, so dash → slide → jump chains carry speed.
 */

export type MoveState = 'normal' | 'dash' | 'slide' | 'slam' | 'wallslide';

export interface MoveInput {
  /** -1 left, 0 none, 1 right. */
  x: -1 | 0 | 1;
  jumpPressed: boolean;
  jumpHeld: boolean;
  jumpReleased: boolean;
  downPressed: boolean;
  downHeld: boolean;
  dashPressed: boolean;
}

export const NO_INPUT: MoveInput = {
  x: 0,
  jumpPressed: false,
  jumpHeld: false,
  jumpReleased: false,
  downPressed: false,
  downHeld: false,
  dashPressed: false,
};

export type MoveEventType =
  | 'jump'
  | 'wallJump'
  | 'slideJump'
  | 'dashJump'
  | 'slamBounce'
  | 'dash'
  | 'slideStart'
  | 'slamStart'
  | 'land'
  | 'slamLand';

export interface MoveEvent {
  type: MoveEventType;
  x: number;
  y: number;
  /** Event-specific magnitude: landing speed, bounce power, etc. */
  power: number;
  dir: number;
}

const M = MOVEMENT;

export class PlayerMovement {
  readonly body: Body;
  state: MoveState = 'normal';
  facing: -1 | 1 = 1;
  /** Fractional pips; floor() = usable dashes. */
  dashPips: number = M.dash.pips;
  /** Multiplier on pip regen (hunger will lower this in Phase 6). */
  dashRegenMult = 1;
  /** Invincibility frames remaining. */
  iFrames = 0;
  /** Events emitted during the last step, for visuals/audio/combat to react to. */
  events: MoveEvent[] = [];
  /** Frames spent in the current state. */
  stateFrames = 0;

  private coyote = 0;
  private jumpBuffer = 0;
  private wallCoyote = 0;
  private lastWallDir: -1 | 1 = 1;
  private wallJumpLock = 0;
  private jumpCutAvailable = false;
  private dashDir: -1 | 1 = 1;
  private slideDir: -1 | 1 = 1;
  private slamStartY = 0;
  private slamBounceTimer = 0;
  private slamBouncePower = 0;
  private wasGrounded = false;
  private lastResult: MoveResult | null = null;

  constructor(x: number, y: number) {
    this.body = new Body(x, y, PLAYER.width, PLAYER.height);
  }

  get invincible(): boolean {
    return this.iFrames > 0;
  }

  get grounded(): boolean {
    return this.body.onGround;
  }

  get isSliding(): boolean {
    return this.state === 'slide';
  }

  /** Teleport and reset all transient movement state. */
  reset(x: number, y: number): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.vx = b.vy = 0;
    b.h = PLAYER.height;
    this.state = 'normal';
    this.dashPips = M.dash.pips;
    this.iFrames = this.coyote = this.jumpBuffer = this.wallCoyote = 0;
    this.wallJumpLock = this.slamBounceTimer = this.stateFrames = 0;
    this.jumpCutAvailable = false;
    this.events = [];
  }

  step(input: MoveInput, world: TileQuery, dt: number): void {
    this.events = [];
    const b = this.body;
    this.tickTimers(input);

    // Variable jump height: releasing jump early cuts upward speed once.
    if (input.jumpReleased && this.jumpCutAvailable && b.vy < 0) {
      b.vy *= M.jumpCutMultiplier;
      this.jumpCutAvailable = false;
    }

    // Dash can interrupt any state.
    if (input.dashPressed && this.state !== 'dash' && this.dashPips >= 1) {
      this.startDash(input, world);
    }

    switch (this.state) {
      case 'normal':
        this.updateNormal(input, dt);
        break;
      case 'wallslide':
        this.updateWallSlide(input, dt);
        break;
      case 'dash':
        this.updateDash(input);
        break;
      case 'slide':
        this.updateSlide(input, world, dt);
        break;
      case 'slam':
        this.updateSlam();
        break;
    }

    const prevState = this.state;
    this.lastResult = moveAndCollide(b, world, dt);
    this.afterMove(world);
    if (this.state === prevState) this.stateFrames++;
  }

  // ---------------------------------------------------------------- timers

  private tickTimers(input: MoveInput): void {
    const b = this.body;
    this.jumpBuffer = input.jumpPressed ? M.jumpBufferFrames : Math.max(0, this.jumpBuffer - 1);
    this.coyote = b.onGround ? M.coyoteFrames : Math.max(0, this.coyote - 1);
    if (!b.onGround && b.wallDir !== 0) {
      this.wallCoyote = M.wall.coyoteFrames;
      this.lastWallDir = b.wallDir;
    } else {
      this.wallCoyote = Math.max(0, this.wallCoyote - 1);
    }
    if (b.onGround) this.wallCoyote = 0;

    this.iFrames = Math.max(0, this.iFrames - 1);
    this.wallJumpLock = Math.max(0, this.wallJumpLock - 1);
    this.slamBounceTimer = Math.max(0, this.slamBounceTimer - 1);

    if (this.state !== 'dash' && this.dashPips < M.dash.pips) {
      this.dashPips = Math.min(M.dash.pips, this.dashPips + this.dashRegenMult / M.dash.regenFramesPerPip);
    }
    if (input.x !== 0 && (this.state === 'normal' || this.state === 'slam')) this.facing = input.x;
  }

  // ---------------------------------------------------------------- states

  private updateNormal(input: MoveInput, dt: number): void {
    const b = this.body;
    const grounded = b.onGround;

    if (this.jumpBuffer > 0) {
      if (this.slamBounceTimer > 0 && grounded) return this.slamBounce(input.x, dt);
      if (grounded || this.coyote > 0) return this.jump(input.x, dt);
      if (this.wallCoyote > 0) return this.wallJump(this.lastWallDir);
    }

    if (grounded && input.downHeld) return this.startSlide(input);
    if (!grounded && input.downPressed) return this.startSlam();

    this.applyHorizontal(input.x, dt);
    this.applyGravity(input.jumpHeld, dt);

    const wall = b.wallDir;
    if (!grounded && b.vy > 0 && wall !== 0 && input.x === wall) {
      this.setState('wallslide');
    }
  }

  private updateWallSlide(input: MoveInput, dt: number): void {
    const b = this.body;
    const wall = b.wallDir;
    if (b.onGround || wall === 0 || input.x !== wall) {
      this.setState('normal');
      return this.updateNormal(input, dt);
    }
    this.facing = wall === 1 ? -1 : 1;
    if (this.jumpBuffer > 0) return this.wallJump(wall);
    if (input.downPressed) return this.startSlam();

    // Keep pressing into the wall so contact probes stay true.
    b.vx = wall * 30;
    b.vy = b.vy < 0 ? b.vy + M.gravity * dt : Math.min(b.vy + M.gravity * dt, M.wall.slideMaxFall);
  }

  private updateDash(input: MoveInput): void {
    const b = this.body;
    const grounded = b.onGround;

    if (this.jumpBuffer > 0) {
      if (grounded || this.coyote > 0) {
        // Dash-jump: keep most of the dash speed.
        b.vx = this.dashDir * M.dash.jumpKeepSpeed;
        this.doJumpImpulse(M.jumpSpeed, true);
        this.emit('dashJump', b.vx);
        this.setState('normal');
        return;
      }
      if (this.wallCoyote > 0 || b.wallDir !== 0) {
        const dir = b.wallDir !== 0 ? b.wallDir : this.lastWallDir;
        b.vx = 0;
        this.wallJumpImpulse(dir);
        this.setState('normal');
        return;
      }
    }
    if (grounded && input.downHeld) {
      // Dash → slide: the slide inherits full dash speed.
      this.shrinkToSlide();
      this.slideDir = this.dashDir;
      this.emit('slideStart', b.vx, this.dashDir);
      this.setState('slide');
      return;
    }
    if (!grounded && input.downPressed) return this.startSlam();

    if (this.stateFrames >= M.dash.frames) {
      b.vx = this.dashDir * M.dash.exitSpeed;
      this.setState('normal');
      return;
    }
    b.vx = this.dashDir * M.dash.speed;
    b.vy = 0;
  }

  private updateSlide(input: MoveInput, world: TileQuery, dt: number): void {
    const b = this.body;
    const grounded = b.onGround;
    const canStand = this.canStand(world);

    if (this.jumpBuffer > 0 && canStand) {
      if (this.slamBounceTimer > 0 && grounded) {
        this.stand();
        return this.slamBounce(input.x, dt);
      }
      if (grounded || this.coyote > 0) return this.slideJump();
    }

    if (canStand && (!input.downHeld || (!grounded && this.coyote === 0))) {
      this.stand();
      this.setState('normal');
      return this.updateNormal(input, dt);
    }

    // Stopped dead against a wall: allow reversing direction.
    if (Math.abs(b.vx) < 1 && input.x !== 0) this.slideDir = input.x;

    const target = this.slideDir * M.slide.speed;
    if (Math.abs(b.vx) > M.slide.speed && Math.sign(b.vx) === this.slideDir) {
      const friction = grounded ? tileDef(b.groundTile).friction : 0.3;
      b.vx = approach(b.vx, target, M.slide.friction * friction * dt);
    } else if (this.lastResult?.hitX && Math.abs(b.vx) < 1) {
      b.vx = 0; // pinned against a wall; don't keep grinding into it
    } else {
      b.vx = target;
    }
    this.applyGravity(false, dt);
  }

  private updateSlam(): void {
    const b = this.body;
    // Slam is a committed straight drop; dash (handled globally) is the only cancel.
    b.vx = 0;
    b.vy = M.slam.speed;
  }

  // ---------------------------------------------------------------- transitions

  private setState(s: MoveState): void {
    if (this.state !== s) {
      this.state = s;
      this.stateFrames = 0;
    }
  }

  private emit(type: MoveEventType, power = 0, dir: number = this.facing): void {
    const b = this.body;
    this.events.push({ type, x: b.centerX, y: b.bottom, power, dir });
  }

  private doJumpImpulse(speed: number, cuttable: boolean): void {
    const b = this.body;
    b.vy = -speed;
    b.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.wallCoyote = 0;
    this.jumpCutAvailable = cuttable;
  }

  private jump(inputX: -1 | 0 | 1, dt: number): void {
    this.doJumpImpulse(M.jumpSpeed, true);
    this.emit('jump');
    this.applyHorizontal(inputX, dt);
    this.setState('normal');
  }

  private wallJumpImpulse(wallDir: -1 | 1): void {
    const b = this.body;
    const away: -1 | 1 = wallDir === 1 ? -1 : 1;
    b.vx = away * Math.max(M.wall.jumpX, Math.abs(b.vx));
    this.doJumpImpulse(M.wall.jumpY, true);
    this.wallJumpLock = M.wall.inputLockFrames;
    this.facing = away;
    this.emit('wallJump', 0, away);
  }

  private wallJump(wallDir: -1 | 1): void {
    this.body.vx = 0;
    this.wallJumpImpulse(wallDir);
    this.setState('normal');
  }

  private slamBounce(inputX: -1 | 0 | 1, dt: number): void {
    this.doJumpImpulse(this.slamBouncePower, false);
    this.slamBounceTimer = 0;
    this.emit('slamBounce', this.slamBouncePower);
    this.applyHorizontal(inputX, dt);
    this.setState('normal');
  }

  private startDash(input: MoveInput, world: TileQuery): void {
    const b = this.body;
    if (this.state === 'slide') {
      if (!this.canStand(world)) return;
      this.stand();
    }
    this.dashPips -= 1;
    this.dashDir = input.x !== 0 ? input.x : this.facing;
    this.facing = this.dashDir;
    this.iFrames = M.dash.iFrames;
    this.jumpCutAvailable = false;
    this.slamBounceTimer = 0;
    b.vx = this.dashDir * M.dash.speed;
    b.vy = 0;
    this.emit('dash', 0, this.dashDir);
    this.state = 'dash';
    this.stateFrames = 0;
  }

  private startSlide(input: MoveInput): void {
    const b = this.body;
    this.shrinkToSlide();
    const dir: -1 | 1 = Math.abs(b.vx) > 1 ? (Math.sign(b.vx) as -1 | 1) : input.x !== 0 ? input.x : this.facing;
    this.slideDir = dir;
    this.facing = dir;
    b.vx = dir * Math.max(Math.abs(b.vx), M.slide.speed);
    this.emit('slideStart', b.vx, dir);
    this.setState('slide');
  }

  private slideJump(): void {
    const b = this.body;
    this.stand();
    const speed = Math.min(
      M.slide.jumpMaxSpeed,
      Math.max(Math.abs(b.vx) * M.slide.jumpSpeedMult, M.slide.jumpMinSpeed),
    );
    b.vx = this.slideDir * speed;
    // Not cuttable: the slide-jump always has the same long, flat arc.
    this.doJumpImpulse(M.slide.jumpUpSpeed, false);
    this.emit('slideJump', speed, this.slideDir);
    this.setState('normal');
  }

  private startSlam(): void {
    const b = this.body;
    b.vx = 0;
    b.vy = M.slam.speed;
    this.slamStartY = b.y;
    this.jumpCutAvailable = false;
    this.emit('slamStart');
    this.setState('slam');
  }

  // ---------------------------------------------------------------- post-physics

  private afterMove(world: TileQuery): void {
    const b = this.body;
    const res = this.lastResult!;
    const landedNow = b.onGround && !this.wasGrounded;

    if (this.state === 'slam' && b.onGround) {
      const tilesFallen = Math.max(0, (b.y - this.slamStartY) / world.tileSize);
      this.slamBouncePower = Math.min(M.slam.bounceMax, M.slam.bounceBase + tilesFallen * M.slam.bouncePerTile);
      this.slamBounceTimer = M.slam.bounceWindowFrames;
      this.emit('slamLand', this.slamBouncePower);
      this.setState('normal');
    } else if (landedNow) {
      this.emit('land', Math.max(res.impactVy, 0));
    }

    if (this.state === 'dash' && res.hitX) {
      this.setState('normal');
    }
    this.wasGrounded = b.onGround;
  }

  // ---------------------------------------------------------------- helpers

  private applyHorizontal(inputX: -1 | 0 | 1, dt: number): void {
    const b = this.body;
    const grounded = b.onGround;
    const surf = grounded ? tileDef(b.groundTile) : null;
    const friction = surf ? surf.friction : 1;
    const traction = surf ? surf.traction : 1;
    const max = M.runSpeed;
    const speed = Math.abs(b.vx);
    const movingDir = Math.sign(b.vx);

    // Briefly after a wall jump, ignore steering so the kick-off isn't instantly undone.
    if (this.wallJumpLock > 0) return;

    if (speed > max && (inputX === movingDir || (inputX === 0 && !grounded))) {
      // Overspeed from dashes/slides/slams: bleed off slowly — momentum is king.
      const decel = grounded ? M.overspeedGroundDecel * friction : M.overspeedAirDecel;
      b.vx = approach(b.vx, movingDir * max, decel * dt);
    } else if (inputX !== 0) {
      const turning = movingDir !== 0 && movingDir !== inputX;
      const accel = (grounded ? M.groundAccel * traction : M.airAccel) * (turning ? M.turnMultiplier : 1);
      b.vx = approach(b.vx, inputX * max, accel * dt);
    } else {
      const decel = grounded ? M.groundDecel * friction : M.airDecel;
      b.vx = approach(b.vx, 0, decel * dt);
    }
  }

  private applyGravity(jumpHeld: boolean, dt: number): void {
    const b = this.body;
    let g = M.gravity;
    if (b.vy > 0) g *= M.fallGravityMult;
    if (jumpHeld && Math.abs(b.vy) < M.apexThreshold) g *= M.apexGravityMult;
    b.vy = Math.min(b.vy + g * dt, M.maxFallSpeed);
  }

  /** Shrinks the hitbox, keeping the feet in place. Always possible (it only gets smaller). */
  private shrinkToSlide(): void {
    const b = this.body;
    if (b.h === PLAYER.slideHeight) return;
    b.y += PLAYER.height - PLAYER.slideHeight;
    b.h = PLAYER.slideHeight;
  }

  private canStand(world: TileQuery): boolean {
    const b = this.body;
    if (b.h === PLAYER.height) return true;
    const dy = PLAYER.height - b.h;
    return !rectHitsSolid(world, b.x, b.y - dy, b.w, PLAYER.height);
  }

  private stand(): void {
    const b = this.body;
    if (b.h === PLAYER.height) return;
    b.y -= PLAYER.height - b.h;
    b.h = PLAYER.height;
  }
}
