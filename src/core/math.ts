/** Move `value` toward `target` by at most `maxDelta`. */
export function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return target;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent version of a per-60Hz-frame lerp factor. */
export function dampFactor(perFrame: number, deltaMs: number): number {
  return 1 - Math.pow(1 - perFrame, deltaMs / (1000 / 60));
}
