import { describe, expect, it } from 'vitest';
import { Input } from '../src/core/input';

describe('Input', () => {
  it('reports press and release edges once per snapshot', () => {
    const inp = new Input();
    inp.keyDown('Space');
    let s = inp.snapshot();
    expect(s.pressed('jump')).toBe(true);
    expect(s.held('jump')).toBe(true);
    s = inp.snapshot();
    expect(s.pressed('jump')).toBe(false);
    expect(s.held('jump')).toBe(true);
    inp.keyUp('Space');
    s = inp.snapshot();
    expect(s.released('jump')).toBe(true);
    expect(s.held('jump')).toBe(false);
  });

  it('never loses a tap shorter than one step', () => {
    const inp = new Input();
    inp.keyDown('ShiftLeft');
    inp.keyUp('ShiftLeft');
    const s = inp.snapshot();
    expect(s.pressed('dash')).toBe(true);
    expect(s.released('dash')).toBe(true);
    expect(s.held('dash')).toBe(false);
  });

  it('treats multiple keys bound to one action as one', () => {
    const inp = new Input();
    inp.keyDown('KeyW');
    inp.snapshot();
    inp.keyDown('Space');
    expect(inp.snapshot().pressed('jump')).toBe(false);
    inp.keyUp('KeyW');
    expect(inp.snapshot().released('jump')).toBe(false);
    inp.keyUp('Space');
    expect(inp.snapshot().released('jump')).toBe(true);
  });
});
