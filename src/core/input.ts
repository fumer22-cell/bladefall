/**
 * Keyboard → action mapping with edge detection sampled once per simulation step.
 *
 * Presses/releases are accumulated between steps (so a tap shorter than one frame is
 * never lost) and consumed by `snapshot()`. Uses KeyboardEvent.code, so bindings are
 * physical-key based and work on any keyboard layout.
 */

export type Action = 'left' | 'right' | 'down' | 'jump' | 'dash' | 'debug' | 'reset';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  // Ctrl is deliberately NOT bound: Ctrl+W (jump) would close the browser tab.
  down: ['KeyS', 'KeyC', 'ArrowDown'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  dash: ['ShiftLeft', 'ShiftRight'],
  debug: ['F3', 'Backquote'],
  reset: ['KeyR'],
};

export interface InputSnapshot {
  held(a: Action): boolean;
  pressed(a: Action): boolean;
  released(a: Action): boolean;
}

export class Input {
  private readonly codeToActions = new Map<string, Action[]>();
  private readonly heldCodes = new Set<string>();
  private readonly pressedSet = new Set<Action>();
  private readonly releasedSet = new Set<Action>();
  private detach: (() => void) | null = null;

  constructor(private readonly bindings: Record<Action, string[]> = DEFAULT_BINDINGS) {
    for (const action of Object.keys(bindings) as Action[]) {
      for (const code of bindings[action]) {
        const list = this.codeToActions.get(code) ?? [];
        list.push(action);
        this.codeToActions.set(code, list);
      }
    }
  }

  attach(target: Window = window): void {
    const down = (e: KeyboardEvent) => {
      if (!this.codeToActions.has(e.code)) return;
      e.preventDefault();
      if (!e.repeat) this.keyDown(e.code);
    };
    const up = (e: KeyboardEvent) => {
      if (!this.codeToActions.has(e.code)) return;
      e.preventDefault();
      this.keyUp(e.code);
    };
    const blur = () => this.releaseAll();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', blur);
    this.detach = () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', blur);
    };
  }

  destroy(): void {
    this.detach?.();
    this.detach = null;
  }

  isHeld(action: Action): boolean {
    return this.bindings[action].some((c) => this.heldCodes.has(c));
  }

  keyDown(code: string): void {
    const actions = this.codeToActions.get(code);
    if (!actions || this.heldCodes.has(code)) return;
    const wasHeld = actions.map((a) => this.isHeld(a));
    this.heldCodes.add(code);
    actions.forEach((a, i) => {
      if (!wasHeld[i]) this.pressedSet.add(a);
    });
  }

  keyUp(code: string): void {
    const actions = this.codeToActions.get(code);
    if (!actions || !this.heldCodes.has(code)) return;
    this.heldCodes.delete(code);
    for (const a of actions) if (!this.isHeld(a)) this.releasedSet.add(a);
  }

  releaseAll(): void {
    for (const code of [...this.heldCodes]) this.keyUp(code);
  }

  /** Consume edges accumulated since the last snapshot. Call once per simulation step. */
  snapshot(): InputSnapshot {
    const held = new Set((Object.keys(this.bindings) as Action[]).filter((a) => this.isHeld(a)));
    const pressed = new Set(this.pressedSet);
    const released = new Set(this.releasedSet);
    this.pressedSet.clear();
    this.releasedSet.clear();
    return {
      held: (a) => held.has(a),
      pressed: (a) => pressed.has(a),
      released: (a) => released.has(a),
    };
  }
}
