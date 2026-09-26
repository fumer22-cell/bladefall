/**
 * BLADEFALL tunables — every number that affects game feel lives here.
 *
 * Units:
 *   px        — world pixels (1 tile = WORLD.tileSize px)
 *   px/s      — speeds
 *   px/s²     — accelerations
 *   Frames    — simulation steps at SIM.fps (60 Hz → 1 frame ≈ 16.7 ms)
 *   Ms        — milliseconds of real time
 */

export const SIM = {
  fps: 60,
  /** Max sim steps per rendered frame before we drop backlog (avoids spiral of death). */
  maxCatchUpSteps: 5,
  /** Clamp huge frame deltas (tab switched away, breakpoint) to this. */
  maxFrameDeltaMs: 250,
};

export const DISPLAY = {
  width: 640,
  height: 360,
  backgroundColor: '#14121c',
};

export const WORLD = {
  tileSize: 16,
};

/** Surface physics per tile material. friction = braking, traction = accelerating. 1 = normal. */
export const TILE_PHYSICS = {
  default: { friction: 1, traction: 1 },
  ice: { friction: 0.06, traction: 0.3 },
};

export const PLAYER = {
  width: 10,
  height: 22,
  /** Hitbox height while sliding (fits through 1-tile gaps). */
  slideHeight: 11,
};

export const MOVEMENT = {
  // --- Running ---
  runSpeed: 260,
  groundAccel: 2600,
  groundDecel: 3000,
  /** Accel multiplier when pressing opposite to current velocity (snappy turns). */
  turnMultiplier: 1.6,
  airAccel: 2000,
  /** Braking in air with no input (only below runSpeed; overspeed uses overspeedAirDecel). */
  airDecel: 900,
  /** How fast momentum above runSpeed bleeds off while holding forward on the ground. */
  overspeedGroundDecel: 700,
  /** How fast momentum above runSpeed bleeds off in the air. Low = long flights. */
  overspeedAirDecel: 140,

  // --- Gravity ---
  gravity: 1500,
  /** Gravity multiplier while falling (snappier arcs). */
  fallGravityMult: 1.15,
  maxFallSpeed: 720,
  /** Near the apex of a held jump, gravity is reduced for a little hang time. */
  apexThreshold: 60,
  apexGravityMult: 0.55,

  // --- Jumping ---
  jumpSpeed: 480,
  /** Upward velocity is multiplied by this when jump is released early. */
  jumpCutMultiplier: 0.45,
  coyoteFrames: 6,
  jumpBufferFrames: 6,

  // --- Dash ---
  dash: {
    pips: 3,
    speed: 640,
    frames: 10,
    /** Invincible for this many frames from dash start. */
    iFrames: 9,
    /** Frames to regenerate one pip (at 100% regen rate). */
    regenFramesPerPip: 50,
    /** Horizontal speed when a dash ends naturally (momentum carry). */
    exitSpeed: 400,
    /** Horizontal speed kept when jumping out of a dash on the ground. */
    jumpKeepSpeed: 520,
  },

  // --- Slide ---
  slide: {
    /** Slide never drops below this speed while held. */
    speed: 330,
    /** Decay of speed above `speed` while sliding (keeps momentum from dashes/slams). */
    friction: 260,
    /** Slide-jump horizontal speed = max(current * mult, minSpeed). */
    jumpSpeedMult: 1.2,
    jumpMinSpeed: 460,
    /** Slide-jump vertical speed: lower than a normal jump → long, flat launch. */
    jumpUpSpeed: 390,
    jumpMaxSpeed: 780,
  },

  // --- Ground slam ---
  slam: {
    speed: 1100,
    /** Frames after landing during which jump triggers a bounce. */
    bounceWindowFrames: 12,
    bounceBase: 470,
    /** Extra bounce speed per tile fallen during the slam. */
    bouncePerTile: 28,
    bounceMax: 1150,
  },

  // --- Walls ---
  wall: {
    slideMaxFall: 110,
    jumpX: 330,
    jumpY: 470,
    /** Frames after a wall jump during which horizontal input is ignored. */
    inputLockFrames: 8,
    /** Wall-jump grace after leaving a wall (like coyote time). */
    coyoteFrames: 5,
  },
};

export const CAMERA = {
  /** 0..1 fraction of distance closed per 60 Hz frame. */
  followLerp: 0.16,
  lookaheadPx: 56,
  lookaheadLerp: 0.06,
  /** Positive = camera sits above the player (see more sky). */
  verticalBiasPx: 24,
};

export const FEEL = {
  dashAfterimageEveryFrames: 2,
  afterimageFadeMs: 200,
  landShakeMinFallSpeed: 600,
  landShakeMs: 80,
  landShakeIntensity: 0.004,
  slamShakeMs: 160,
  /** Scaled by bounce power / bounceMax. */
  slamShakeIntensity: 0.012,
};
