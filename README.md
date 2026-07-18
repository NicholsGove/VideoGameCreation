# Echoes of Aether — a co-op puzzle platformer

An original two-player cooperative puzzle-platformer. The world was powered by
the **Heart Engine** until it shattered into **Aether Shards**. Two explorers —
**Kiro** and **Lyra** — each hold half of the Aether Compass and must work
together to restore it. Neither hero is stronger than the other; their strength
is cooperation.

All characters, levels, art and audio are original and built from scratch —
**no external assets** (graphics are drawn on a canvas, audio is synthesised at
runtime with the Web Audio API).

## How to run

**Double-click `index.html`** — it runs in any modern browser at native
**1920×1080**, no build step, no server, no install. Local 2-player works fully
offline. (Online co-op loads a small networking library from a CDN.)

## The heroes

**Nichols** — the Inventor & Engineer (blue & silver). Brown skin, explorer
jacket, a mechanical gauntlet and a small backpack.
- **Carry & throw**: pick up crates, hold to charge, release to throw in any
  direction — throws arc, bounce off walls, and can be caught by his partner.
- **Grapple**: yank distant levers with the grappling tool.
- **Build**: assemble temporary bridges at anchor points (they decay).
- Pushes heavy objects · repairs machines · activates blue mechanisms · immune to electricity.
- Weakness: poison gas.

**Nibihah** — the Explorer & Acrobat (green & gold). Brown skin, a long braid,
a hooded travel cape and a satchel.
- **Mid-air dash**, **crawl** through low gaps, and a faster wall-climb grip.
- **Detection**: reveals invisible platforms, hidden switches and ancient
  symbols — secret rooms she opens become shortcuts for both heroes.
- Double jump · fits through narrow passages · activates green mechanisms · immune to poison.
- Weakness: electrical hazards.

**Co-op:** stand on each other's heads and ride along — but a hero carrying a
partner jumps noticeably lower, so stacking is powerful without being free.

Both heroes are drawn as original procedural pixel art with a full animation set:
idle, walk, run, jump, fall, land, push, climb, celebrate and defeated.

## Title screen

A cinematic opening plays on launch — fade-in, a studio card, then the glowing
game logo — before a **living animated scene**: a day/night sky, parallax temple
and rotating gears, drifting floating islands and clouds, fireflies, occasional
birds, and Nichols & Nibihah idling beside the menu (with little interactions
like a celebratory high-five). The logo floats, glows and pulses.

**Secrets:** click the logo repeatedly for a gag; enter the Konami code
(`↑↑↓↓←→←→↑↓`) for a retro-outfit easter egg; leave the title idle to trigger an
**attract-mode** demo reel that tours the biomes before returning.

## Interface

The UI is styled as part of the game world — carved-stone / crystal tablets with
gold rims, a warm fantasy palette, pixel-art heading font (with a fantasy body
font) and animated icon buttons (hover glow, bounce, click squash, sparkle on
select). Screens change with a fade-through-black transition and tactile sounds
(crystal-chime hover, magical select, whoosh back, buzz error, triumphant
confirm). Settings live in a tabbed console (🎮 Gameplay · 🔊 Audio · 🖥 Graphics ·
♿ Accessibility · ⌨ Controls) with segmented **crystal audio bars**, illustrated
**display-mode cards**, and a **visual keyboard** that highlights each hero's keys
and animates on press for rebinding. The in-game HUD shows each hero as a live
animated **portrait** in a crystal frame with an ability rune, status shards, and
a revive countdown; the pause menu is a floating tablet whose buttons slide in.
Fonts load from the web when online and fall back to a styled system stack offline.

## Controllers

Gamepads are **auto-detected** (standard layout). Pad 1 → Nichols, Pad 2 →
Nibihah; left stick / d-pad to move, **A** to jump, **X/B** to act, **Start** to
pause. The menu is fully navigable by keyboard (arrows + Enter) or pad.

## Controls

| | Player 1 · Kiro | Player 2 · Lyra |
|---|---|---|
| Move / Jump | `W` `A` `S` `D` (or Pad 1) | `↑` `←` `↓` `→` (or Pad 2) |
| Flip switch / repair / carry / throw | `S` | `↓` |
| Special (grapple / dash) | `Q` | `Right Shift` |
| Crawl (Nibihah) · drop through one-way | hold `S` | hold `↓` |

`Esc` pause · `R` restart. All keys rebindable in **Settings → Controls**.
Win rule: **both** heroes must stand on their matching exit pads at once.

## Platformer & cooperative physics

Tight, responsive movement: smooth acceleration/deceleration, variable jump
height, **coyote time**, **jump buffering**, air control, **wall-slide + wall
jump**, **one-way platforms** (drop through by holding down), moving platforms,
and pushable physics crates (light crates anyone can push; heavy crates only Kiro).

**Cooperative physics** are core to the puzzles: players collide naturally, can
**stand on each other's heads**, **jump off a partner** to reach higher ledges,
**push each other**, and **ride along** on a moving partner. Falling crates can
weigh down buttons.

## Rendering & camera

- Native **1920×1080**, pixel-perfect integer scaling to any 16:9 window.
- Display modes: **borderless fullscreen** (default), exclusive fullscreen, windowed.
- Smooth-follow camera that **zooms out** as players separate, **screen shake**
  for big moments, **cinematic fade transitions** with level title cards, and
  optional **split-screen** when players get too far apart.

## Atmosphere

Subtle **bloom**, dynamic lighting + darkness (stay close for light), soft
shadows, animated parallax backgrounds and per-biome **weather**: dust motes,
fog, snow, rain, falling leaves and factory embers.

## Story Mode campaign

The campaign is planned as **70 levels across 6 chapters**. The framework for all
six is in place (chapter metadata, campaign ordering, per-chapter select screen,
locked "in development" chapters), and **Chapter 1 is fully built and verified**:

| # | Chapter | Levels | Status |
|---|---------|--------|--------|
| 1 | Underground Caves | 1–10 | ✅ built |
| 2 | Wrecked Ruins | 11–25 | ✅ built |
| 3 | Enchanted Forest | 26–40 | scaffolded |
| 4 | The Great Temple | 41–50 | scaffolded |
| 5 | Temple in the Sky | 51–60 | scaffolded |
| 6 | The Heavens | 61–70 | scaffolded |

**Chapter 1 — Underground Caves** teaches exactly one idea per level, then
combines them: 1 Movement · 2 Buttons · 3 Crates · 4 Keys & locks · 5 Colour
switches · 6 Cooperative jumping · 7 Carrying & throwing · 8 Secrets & narrow
paths · 9 Moving platforms & dashing · 10 Everything so far.

Every level is multi-chamber, separated by **full-height gates** that run floor
to ceiling — they cannot be jumped or climbed around, so a lever or key is the
only way through. Puzzle logic supports **AND gates** (a door needing two
signals at once) and **cargo-only plates** that a hero's weight won't trigger,
so the crate genuinely has to be thrown.

**Vertical levels.** Levels are no longer a fixed size — several are tall
towers rather than corridors (Level 4 is 30×26, Level 6 is 26×34, Level 10 is
30×38). The climb *is* the level, and the goal sits at the summit.

**The Portal.** Levels now end at a single glowing **portal that both heroes
must stand inside together** — it charges only while both are in it and drains
if one steps out. Portals sit high on platforms, and some stay unpowered until
a hidden symbol is found.

**Wall-jump chambers.** Level 4's key hangs at the top of a sealed 3-tile-wide
chimney with nothing to stand on — the only way up is chaining wall jumps.

**Hazards & timing.** Crumbling platforms that fall when stood on, vanishing
platforms on a cycle, lethal crushing pistons, patrolling blades, and rocks that
drop when you walk beneath them.

**Victory poses** scale with the level's difficulty tier — a celebration on
normal levels, a doubled-over exhausted animation after an *extreme* one.

**Chapter 2 — Wrecked Ruins** (15 levels) adds mirrors and laser galleries,
**time switches** (clockwork levers that power a channel for a few seconds, so
you must throw one and *run*), **rotating gear platforms** you ride across
machine pits, elevator shafts, weighted cargo scales, collapsing archives and
twin wall-jump chimneys. Level 20 hides a genuinely **boost-only chamber** — a
sealed alcove whose perch a solo double jump cannot reach, verified by test.
It ends with the hooded figure stealing a shard as the ruins come down.

**Cinematics** — a fully scripted **Prologue** (the Heart Engine shatters; each
hero finds a compass half; they meet and the compass awakens) plays before level
1, and a **Chapter 1 finale** (escaping to daylight, the compass pointing to the
ruins, the hooded figure watching) plays after level 10. The cutscene engine is
data-driven — a new chapter cinematic is one entry in `SCENES`.

The seven earlier showcase levels are retained as a bonus **Prototype Vault** in
the level-select screen.

## Bonus: Prototype Vault levels

1. **Temple** — movement + elemental immunity.
2. **Sunken Ruins** — colour-locked switches, signal/timed doors.
3. **Factory** — heavy crates, weighted buttons, keys & locks, head-riding.
4. **Icy Peaks** — moving platforms, ice, conveyors, spike pit.
5. **Jungle** — darkness, lasers, mirrors, teleporters, colour switches.
6. **Floating City** *(showcase)* — head-stacking + double jump, one-way climbs,
   a Lyra-only narrow passage, and a Kiro machine repair.
7. **The Heart Engine** *(finale)* — the Guardian puzzle-boss: each hero disables
   one of the Guardian's beams, then Kiro restores the Heart. Communication over combat.

## Modes

- **Local multiplayer** — two players, one keyboard.
- **Online multiplayer** — one player **Hosts** (5-letter lobby code), the other
  **Joins**. The host runs the authoritative simulation and the client only sends
  inputs, which prevents position/puzzle cheating.

## Project structure

```
index.html            Loads scripts in dependency order (no build step)
styles.css            Retro UI theme
src/
  core/  utils, events (bus), statemachine, input (rebinding), storage (save),
         audio (procedural), camera, particles (pooled), weather, achievements
  world/ objects (all mechanics), tilemap (+ collision & one-way), levels (data),
         level (physics orchestration, lighting, bloom, net snapshots)
  entities/ player (Kiro/Lyra, abilities, platforming + co-op physics)
  net/   network (PeerJS host-authoritative online co-op)
  ui/    ui (menus, HUD, settings, story, lobby, completion)
  game.js  fixed-timestep loop, 1080p pipeline, split-screen, transitions
  main.js  bootstrap
```

## Architecture

Fixed-timestep simulation (deterministic, identical host/client online); an
event bus decoupling gameplay from audio/achievements/UI/networking; named
signal **channels** so switches *write* and doors/platforms *read* (fully
data-driven); state machines for game flow and animation; pooled particles;
serialisable levels for netcode.

### Extending
- **New level** → push one entry to `GG.LEVELS` in `levels.js` (pure data).
- **New mechanic** → add an object class in `objects.js`.
- **New character** → add to `CHARACTERS` in `player.js` (abilities are data:
  `immune`, `canPushHeavy`, `canRepair`, `maxJumps`, `narrow`, `height`).
- **New biome/weather** → add palettes in `level.js` + a config in `weather.js`.

## Tests

A headless Node harness stubs the DOM and exercises physics stability, all 7
levels' win conditions, elemental immunity, colour-locked switches, the crate
ability gate, laser tracing/reflection, network snapshots, **double jump vs
single jump, head-riding, mutual push, one-way platforms, the narrow gate,
repair, and the animation-state machine**, plus a render smoke test that draws
every character pose, the title scene in all phases, and the full level render
pipeline. Current status: **88 logic + 27 render checks pass**. The pass-5 suite additionally verifies **every Chapter 1 level is
solvable and spawn-safe**, and exercises each new ability (carry/charge/throw/
bounce, dash, crawl, head-stand jump penalty, hidden-platform + secret reveal,
bridge building, grapple) plus both cinematics: **131 logic + 24 render/UI checks**.

There is also a **reachability solver** — a tile-graph BFS that models the real
jump limits (Nichols clears a 3-tile ledge and a 3-tile gap; Nibihah 5 and 4
with her double jump, plus a partner-boost model). For every Chapter 1 level it
proves that both heroes can reach both exits, that every lever/plate/key/secret
is reachable, and — crucially — that with the gates **shut** the exits are
unreachable, i.e. no barrier can be jumped: **87 reachability checks**.

## Known gaps / next
**Chapters 2–6 (levels 11–70) are scaffolded but not yet designed** — that's the
main remaining work, best done a chapter at a time so each level stays
handcrafted and verified. Also outstanding: the final boss encounter and the
ending/wedding cinematic; enemies (patrol robots, cameras); sloped terrain (tile
collision is axis-aligned); in-level dialogue between the heroes. Online co-op is
functional P2P but not hardened against poor networks/NAT. Steam, mobile and a
level editor are architected-for but not built. Character art is stylized
procedural pixel art rather than hand-drawn sprite sheets.
