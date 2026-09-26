# BLADEFALL — Architecture & Build Plan

A 2D side-view sandbox survival game: Terraria-style world, ULTRAKILL-style movement,
Sekiro/Chivalry-style parry combat. This document describes the architecture and the
phase breakdown. **Nothing gets built until this plan is approved.**

---

## 1. Tech Stack & Core Decisions

| Area | Choice | Why |
|---|---|---|
| Language | TypeScript (`strict: true`) | Safety across a large codebase |
| Engine | Phaser 3 (rendering, input, audio, cameras, particles, scenes) | Mature, fast WebGL, good browser support |
| Build | Vite | Instant dev server + HMR |
| Tests | Vitest (pure-logic unit tests only) | Collision, posture math, worldgen determinism, save round-trips |
| Physics | **Custom** AABB-vs-tile kinematic physics, *not* Phaser Arcade | We need exact control over coyote time, slides, wall-slides, slam bounces, momentum carry, and hitstop freezing. Arcade fights all of those. |
| Timestep | Fixed 60 Hz simulation with an accumulator (max 5 catch-up steps), rendering at display rate | Deterministic feel regardless of monitor refresh |
| Art | Colored rectangles / generated textures, 16×16 px tiles | Swappable later via a single texture registry |
| Resolution | Internal 640×360, `pixelArt: true`, integer-scaled to fit window | Crisp pixels, consistent view distance |
| Randomness | Seeded PRNG (mulberry32) + seeded simplex noise | Same seed ⇒ same world; enables compact saves |
| Save | `localStorage`, versioned JSON, compressed | See §5 |
| Tunables | **Everything numeric lives in `src/config.ts`** | Single place to tune feel |

### The fixed-step loop
```
update(time, delta):
  acc += min(delta, 250ms)
  while acc >= STEP (16.667ms) and steps < 5:
      if hitstop > 0: hitstop -= STEP   // world frozen, particles/camera still run
      else: sim.step(STEP)              // input → movement → combat → AI → physics → events
      acc -= STEP
  render(alpha = acc / STEP)            // interpolate sprite positions
```
Input is sampled into a per-step snapshot (`pressed`, `held`, `released`, buffered timestamps)
so jump buffering and parry timing are frame-exact.

---

## 2. Folder Structure

```
bladefall/
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts
├─ PLAN.md
└─ src/
   ├─ main.ts                 # Phaser game bootstrap
   ├─ config.ts               # ALL tunable numbers (movement, combat, survival, world, AI)
   ├─ core/                   # Engine-agnostic plumbing
   │  ├─ loop.ts              # Fixed-timestep accumulator + hitstop
   │  ├─ input.ts             # Key/mouse → action map, buffering, rebinding
   │  ├─ events.ts            # Typed event bus (onHit, onParry, onKill, onBlockBroken…)
   │  ├─ rng.ts / noise.ts    # Seeded PRNG + simplex noise
   │  ├─ physics.ts           # AABB body, tile sweep collision, ground/wall probes
   │  ├─ fsm.ts               # Tiny generic state machine (used by player, enemies, bosses)
   │  └─ math.ts
   ├─ scenes/                 # Boot, Preload, MainMenu, Game, UI overlay, Pause
   ├─ world/
   │  ├─ tiles.ts             # Tile registry (id → hardness, solid, friction, light, drops…)
   │  ├─ World.ts             # Uint16 tile + wall layers, chunk bookkeeping, get/set API
   │  ├─ ChunkRenderer.ts     # Per-chunk RenderTextures, rebuilt only when dirty
   │  ├─ gen/                 # Worldgen passes: terrain, caves, biomes, ores, structures
   │  ├─ lighting.ts          # Tile flood-fill light map → darkness overlay
   │  └─ liquids.ts           # (later) water / poison / lava cellular sim
   ├─ player/
   │  ├─ Player.ts            # Entity: body, stats, inventory hook
   │  ├─ movement/            # Movement FSM: ground, air, dash, slide, slam, wallslide
   │  └─ PlayerController.ts  # Input → intents
   ├─ combat/
   │  ├─ hitbox.ts            # Hitbox/hurtbox shapes, per-attack hit registry
   │  ├─ attacks.ts           # AttackData: windup/active/recovery frames, damage, posture, flags
   │  ├─ weapons.ts           # Weapon defs: combo strings, parry window mult, riposte mult
   │  ├─ Guard.ts             # Block/parry resolution (perfect vs late), feint logic
   │  ├─ Posture.ts           # Posture meter + regen + break → stagger → deathblow
   │  ├─ damage.ts            # Single resolveHit() pipeline
   │  ├─ projectiles.ts       # Projectiles + parry-reflect
   │  ├─ blood.ts             # Blood orbs → healing
   │  ├─ style.ts             # Style meter D→S
   │  └─ feel.ts              # Hitstop, screenshake, knockback, sparks (one call site)
   ├─ enemies/                # Enemy base + one file per enemy type, spawner
   ├─ bosses/                 # Boss base (phases, arena, music trigger) + one folder per boss
   ├─ npcs/                   # NPC base, housing validator, one file per NPC
   ├─ items/                  # Item registry, inventory, crafting recipes, stations, loot tables
   ├─ survival/               # Hunger, temperature, day/night, death + memory drop, spawn point
   ├─ save/                   # Serialization, compression, migrations
   └─ ui/                     # HUD (health, posture, stamina pips, hunger, style), inventory, crafting, dialogue
```

Rule: `world/`, `combat/`, `survival/`, `items/` contain **pure logic that doesn't import Phaser**
wherever possible, so they're unit-testable and swapping art/engine details never touches rules.

---

## 3. Key Systems Design

### 3.1 Physics & Movement
- Each body is an AABB with `pos`, `vel`, `onGround`, `onWallLeft/Right`, `groundFriction`.
- Collision resolves X then Y against solid tiles (sweep in sub-steps if speed > 1 tile/step, so
  fast dashes/slams never tunnel).
- Movement is an FSM: `Grounded`, `Airborne`, `Dashing`, `Sliding`, `Slamming`, `WallSliding`.
  Momentum is stored in `vel` and **not reset** on state change — transitions only add/clamp.
- Mechanics (all numbers in `config.ts`):
  - Coyote time (~6 frames), jump buffer (~6 frames), variable jump height (release to cut).
  - Dash: 3 pips, fast regen (slowed by hunger), i-frames for the first N frames, preserves exit speed.
  - Slide: triggered by down while grounded at speed; low friction; hitbox shrinks; slide-jump
    converts horizontal speed into a long, flat launch.
  - Ground slam: down in air → fast fall; landing within a short window + jump = bounce scaled by fall height.
  - Wall slide (capped fall speed) + wall jump (fixed outward/up impulse, brief input lock away from wall).
  - Tile friction per material (ice ≈ very low friction → keeps momentum).

### 3.2 Combat pipeline
Every attack is **data**, not code:
```ts
AttackData {
  windup, active, recovery          // frames
  damage, postureDamage, knockback
  hitbox                            // offset + size per active frame
  telegraph: 'parryable' | 'unblockable' | 'none'   // yellow vs red flash
  feintable, cancelWindow, chainTo  // combo strings
}
```
Single `resolveHit(attacker, defender, attack)`:
1. i-frames? → miss.
2. Defender guarding?
   - Guard pressed within `parryWindow` (≈150ms × weapon mult) **and** attack is parryable →
     **Perfect parry**: 0 dmg, attacker takes posture dmg, hitstop, spark, +1 dash pip,
     opens `riposteWindow` for the defender.
   - Guard held (late) → damage × `blockReduction`, defender takes posture dmg.
   - Unblockable → full hit.
3. Otherwise → damage, posture dmg, knockback, blood orbs (if in melee range), hitstop, shake.
4. Posture full → **Stagger**: target stunned, deathblow prompt; attacking a staggered target = finisher.

Parry spam is prevented by a **guard cooldown**: tapping guard and missing the window locks
parry for a short time (held guard still works). This is what punishes turtling —
blocking drains *your* posture, and posture only regenerates quickly while attacking/moving.

Feints: pressing guard during a heavy windup cancels it (costs a little stamina). Enemy AI
that "reads" a heavy windup commits to its parry, which the feint exploits.

Projectile parry: a perfect parry reflects the projectile along the aim direction, flips its
team, and doubles its damage.

### 3.3 World
- Tile size 16 px. Default world **2400 × 1000 tiles** (≈38k × 16k px). Tunable.
- Chunked in 32×32 tiles. Only chunks near the camera are rendered (RenderTexture per chunk,
  rebuilt when a tile in it changes). Offscreen chunks are unloaded from the GPU but tile data
  stays in memory (≈5 MB of `Uint16Array`s total — fine).
- Two layers: foreground tiles (solid) and background walls (needed for housing + "indoors").
- Worldgen = ordered passes: heightmap → dirt/stone strata → caves (noise worms + cellular) →
  biome assignment → ores by depth band → surface decoration → structures (Sky Ruins, arenas).
- Lighting: per-tile light levels via BFS flood fill from light sources + sunlight column,
  recomputed incrementally around edits; rendered as a low-res dark overlay, upscaled + blurred.
  Darkness also dims enemy telegraph flashes (gameplay reason to carry torches).

### 3.4 Entities & AI
- Enemies share a base: body + posture + health + FSM + perception (sight/hearing ranges).
- AI states: `Idle → Patrol → Aggro → (Approach | Strafe | Attack | Guard | Retreat) → Stagger → Dead`.
- Per-enemy behavior is a small file choosing attacks from a weighted table with cooldowns,
  plus traits (`feints`, `parries`, `shielded`, `ranged`). Bosses extend this with phases,
  arena bounds, music cue, and scripted transitions.
- Spawner: per-biome tables, weighted by time of day, depth, and "Awakened" world flag.

### 3.5 Items, Crafting, Progression
- Registry of item defs (id, category, stack size, stats). Weapons reference `weapons.ts` defs.
- Inventory: 40 slots + 10-slot hotbar + armor/accessory slots.
- Recipes list: inputs, output, required station (Workbench → Forge → Anvil → Bloodforge → Void Altar),
  station must be within range.
- Ore tier gate = pickaxe power. Each boss drop raises the tier and grants a Technique Scroll
  (unlocks a move flag on the player).

### 3.6 Survival
- Hunger 0–100 drains over time; below thresholds scales stamina/dash regen down.
- Food applies a slow heal-over-time buff. No passive regen otherwise.
- Temperature: biome ambient + armor insulation + nearby heat sources → comfort band; outside it
  applies debuffs (slower movement/posture regen, then damage).
- Day/night: 20-min full cycle (tunable), drives sky tint, sunlight, spawn tables.
- Death: drops coins + a "Memory" entity at death spot (stores a portion of XP/currency/style
  bonus). Dying again before retrieving it destroys it. Beds set spawn point.

### 3.7 Save / Load
`localStorage` caps around 5 MB, so we never store the raw world:
- Save = `{ version, seed, worldSize, modifiedChunks, player, inventory, npcs, flags, time }`.
- On load we **regenerate from the seed**, then apply only chunks the player changed.
- Modified chunks are RLE-encoded + base64. Typical saves stay well under 1 MB.
- `version` + migration functions so old saves keep loading as the game changes.
- Multiple save slots; autosave on a timer and on sleeping in a bed.

### 3.8 Default Controls (rebindable)
| Action | Key |
|---|---|
| Move | A / D |
| Jump / wall jump | Space (or W) |
| Dash | Shift |
| Slide (grounded) / Slam (airborne) | S or C (not Ctrl — Ctrl+W would close the tab) |
| Light attack / use held tool | Left mouse (tap) |
| Heavy attack | Left mouse (hold), release to swing |
| Block / Parry | Right mouse (tap = parry, hold = block) |
| Feint | Right mouse during a heavy windup |
| Secondary ranged | E |
| Deathblow | Attack on a staggered enemy |
| Hotbar | 1–0 / mouse wheel |
| Inventory / Crafting | Tab / I |
| Interact (NPC, door, bed) | F |

Attacks aim toward the mouse (horizontal, with up/down variants; down-air is a pogo slash).

---

## 4. Phase Breakdown

### Status
- [x] Phase 1 — Movement + tile collision
- [ ] Phase 2 — Melee combat vs. dummy
- [ ] Phase 3 — Worldgen + mining/placing
- [ ] Phase 4 — Inventory, crafting, save/load
- [ ] Phase 5 — Enemies (Husk, Crow)
- [ ] Phase 6 — Survival
- [ ] Phase 7 — Boss 1
- [ ] Phase 8 — NPCs + housing
- [ ] Phase 9a–f — Remaining biomes/enemies/bosses
- [ ] Phase 10 — Polish

Each phase ends playable, with a short "what to test" list. I stop after each phase for your review.

### Phase 1 — Movement + tile collision (test room)
- Vite + Phaser + TS project scaffold, `config.ts`, fixed-step loop, input system.
- Hand-built test room: floors, walls, pits, a tall shaft for wall-jumps, an ice strip, ledges.
- Custom tile physics; full movement FSM: run, jump (coyote + buffer + variable height),
  dash (3 pips, i-frames), slide + slide-jump, ground slam + bounce, wall slide + wall jump.
- Debug overlay (F3): velocity, state name, pips, hitboxes. Camera follow with lookahead.
- **Test:** chain dash → slide → jump; wall-climb the shaft; slam-bounce onto a high ledge; ice keeps momentum.

### Phase 2 — Melee combat vs. a training dummy
- Sword with light combo (3 hits) + heavy (chargeable), attack data tables, hitboxes.
- Guard system: perfect parry, late block, guard cooldown, feints.
- Posture for player + dummy, stagger, deathblow, riposte crits.
- Training dummy with configurable attack pattern (parryable yellow / unblockable red telegraphs)
  and a projectile turret for reflect testing.
- Game feel: hitstop, screenshake, knockback, sparks, damage numbers. Blood orbs + healing.
- HUD: health, posture bar, dash pips.
- **Test:** parry the dummy until its posture breaks → deathblow; reflect a projectile; confirm turtling drains your posture.

### Phase 3 — Procedural world + mining + placing
- Chunked world storage & rendering, seeded worldgen (surface, caves, ore bands, Verdant Surface + Hollow Caves).
- Mining with a pickaxe (hardness/tier), block placement, background walls, item drops (as simple pickups).
- Lighting + darkness underground (torches placeable).
- **Test:** generate several seeds, dig down to caves, build a small house, place torches.

### Phase 4 — Inventory, crafting, items, save/load
- Inventory/hotbar UI, item registry, stacks, drag & drop.
- Crafting UI + stations (Workbench, Forge, Anvil), copper/iron tools & weapons, more weapon types
  (greatsword, daggers, spear, gauntlets) + throwing knives.
- Save/load with slots, autosave, main menu (new world / load world).
- **Test:** mine copper → craft pickaxe & sword → save → reload page → everything intact.

### Phase 5 — Enemies + AI (Husk, Carrion Crow)
- Enemy base, perception, FSM, spawner (biome/time/depth aware).
- Husk (slow telegraphed swings), Carrion Crow (flying, spits parryable projectiles).
- Loot drops, coins.
- **Test:** fight groups on the surface; learn parry on Husks; reflect crow spit back at them.

### Phase 6 — Survival
- Hunger + food, day/night cycle, night spawn scaling, temperature scaffolding.
- Beds / spawn points, death → coin + Memory drop, second-death loss.
- **Test:** survive a night; die, retrieve Memory; die twice and lose it.

### Phase 7 — Boss 1: The Threshold Warden
- Boss framework (phases, arena lock, boss health + posture bar, music trigger hook, scroll drop).
- Warden: 2 phases, clear telegraphs, parry/posture-focused. Summon item + arena.
- First Technique Scroll (e.g., Air Parry). Unlocks Iron tier.
- **Test:** full fight from summon to scroll drop; verify you can win purely through posture.

### Phase 8 — NPCs + housing
- Housing validator (enclosed room, walls, light, door, chair) + NPC move-in logic.
- Guide, Merchant, Blacksmith (upgrades), Gravekeeper. Sword Saint unlock (50 perfect parries).
  Alchemist, Cartographer, Wandering Duelist.
- Dialogue + shop UI.
- **Test:** build valid/invalid houses; NPCs move in; buy/sell; upgrade a weapon.

### Phase 9 — Remaining content (split into sub-phases, each playable)
- **9a** Blood Marsh: poison water, Leechers, Bog Knights, Boss 2 Mother Burrow (caves), Bloodforge, Bloodsteel.
- **9b** Frostpeak: temperature fully online, ice, Frost Wolves, Icebound Sentinels, Boss 3 Twin Duelists, Frostsilver.
- **9c** Boss 4 Frost Matriarch → **Awakened mode** (Void corruption spread, variants).
- **9d** Cinder Depths: lava, Ember Hounds, Furnace Priests, Boss 5 Cinder Colossus (climbable body), Cinderite.
- **9e** Sky Ruins: floating islands, Gargoyles, Wind Duelists, Boss 6 Hanged Choir, Voidglass, Void Altar.
- **9f** The Void: unstable gravity, Mirror Shades, Hollow Kings, Boss 7 Ashen Sovereign (3 phases), Sovereign Steel.
- Remaining weapons: crossbow, flintlock; all Technique Scrolls.

### Phase 10 — Polish
- Style meter D→S (variety, parries, no-hit streaks) feeding loot quality.
- Particle pass, sound/music hook system (event → sound id; placeholder beeps via WebAudio),
  menus, settings (volume, keybinds, screenshake toggle), pause, map.

---

## 5. Conventions
- `config.ts` is grouped by system: `MOVEMENT`, `COMBAT`, `WEAPONS`, `POSTURE`, `SURVIVAL`, `WORLD`, `AI`, `FEEL`.
  Times are in **frames at 60 Hz** or **ms**, with the unit in the name (`parryWindowMs`, `coyoteFrames`).
- Systems talk through the typed event bus (e.g. the style meter listens to `onParry`/`onHit`
  rather than being called from combat code).
- `npm run dev` for play, `npm run build` for a static bundle, `npm test` for unit tests.
- Each phase = one or more commits on the working branch; `PLAN.md` gets a "status" checklist updated per phase.

---

## 6. Open Questions (defaults assumed unless you say otherwise)
1. **Controls** — OK with parry on right mouse and heavy on held left mouse (§3.8)?
2. **World size** — default 2400×1000 tiles; want bigger (Terraria "medium" ≈ 6400×1800)?
3. **Deploy** — want a GitHub Pages workflow so each phase is playable from a URL?
4. **Resolution** — 640×360 internal pixel-art look OK, or prefer a higher-res, smoother look?
