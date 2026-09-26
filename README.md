# BLADEFALL

2D sandbox action game: Terraria-style world, ULTRAKILL-style movement, Sekiro-style parry combat.
Built with TypeScript + Phaser 3 + Vite. See [PLAN.md](PLAN.md) for architecture and roadmap.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (physics, movement, input, loop, test-room beatability)
npm run build      # typecheck + static bundle in dist/
```

## Controls (Phase 1)

| Action | Keys |
|---|---|
| Move | A / D (or arrows) |
| Jump / wall jump | Space (or W / Up) |
| Dash (3 pips, i-frames) | Shift |
| Slide (grounded) / Ground slam (airborne) | S (or C / Down) |
| Reset to spawn | R |
| Debug overlay | F3 (or `) |

All tunable numbers live in [`src/config.ts`](src/config.ts).
In dev builds, `window.bladefall` exposes the scene and player for console tinkering.
