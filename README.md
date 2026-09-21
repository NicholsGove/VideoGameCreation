# Echoes of Aether — a co-op open-world adventure

An original two-player cooperative 2D adventure. The world was powered by the
**Heart Engine** until it shattered into **Aether Shards**. Two explorers —
**Nichols** and **Nibihah** — each hold half of the Aether Compass and must
explore one huge connected world together to restore it. Neither hero is
stronger than the other; their strength is cooperation.

All characters, levels, art and audio are original and built from scratch —
**no external assets** (graphics are drawn on a canvas, audio is synthesised at
runtime with the Web Audio API).

## How to run

**Double-click `index.html`** — it runs in any modern browser at native
**1920×1080**, no build step, no server, no install. Local 2-player works fully
offline. (Online co-op loads a small networking library from a CDN.)

## The Journey — one open world

The main game is no longer a list of levels. It is **one connected 2D world**
(Ori-style) of **107 rooms / 218 screens across 8 regions**, built to take
roughly **four hours** for two players to explore completely.

- **Explore together.** Rooms join through doorways. A doorway only carries the
  party on when **both heroes stand in it** — alone it shows *"Waiting for your
  partner…"*. Nobody gets left behind.
- **Discovery %.** Every screen lights up on the map the first time a hero sets
  foot in it. Press **M** (or **Tab**) for the full map, with the percentage,
  the powers you own and the regions you've found; a minimap sits in the corner.
  **Reach 100% and the ending plays** — the Heart wakes, then the final screen.
- **Discover powers.** Each region ends in a **Shrine**. Both heroes stand at it
  to claim a power. Gates elsewhere in the world show the glyph of the power
  they need, so you return later to open them (and every region hides bonus
  vaults sealed by powers you only get further on).

| Region | Biome | Shrine grants | Who |
|---|---|---|---|
| Whispering Caves | cave | ➶ **Aether Arms** — bolt gun & bow | both |
| Sunken Ruins | ruins | ⇅ **Wall Grip** — wall slide & wall jump | both |
| Verdant Wilds | forest | ⇈ **Sky Step** — double jump | Nibihah |
| The Ironworks | factory | ✊ **Strong Arms** — lift, carry & throw crates | Nichols |
| Frostpeak | ice | ➟ **Wind Dash** — air dash | Nibihah |
| The Great Temple | temple | ⚓ **Grapple Hook** — yank distant green levers | Nichols |
| Sky Isles | sky | ◎ **Swing Ring** — swing from glowing rings | Nibihah |
| Heart of Aether | heart | ✺ **Mind Grip** — move cubes with the mind | Nichols |

**Always solve it together.** Rooms are built from co-op puzzles: climb on each
other's heads to reach a lever that lowers steps for your partner, hold a plate
while the other crosses, pull your own coloured lever standing in your own
element, walk split paths (lightning below for Nichols, poison above for
Nibihah), step tandem plates and rune songs together, ferry power cells, push
heavy crates onto cargo plates, boost each other up to high keys…

**Things that try to kill you.** Thornback **beetles** charge when they see you
(and stagger when they hit a wall); prism **toads** swell and spit a horizontal
**laser beam**; **bats** swoop from the ceiling; **spore-caps** lob glowing
spores; **gaze-moths** fire aimed laser bolts; corruption **rats** hunt in
packs. Plus **timed lasers** that flicker a warning before firing, laser sweeps
across climbing shafts, blades, crushers, crumbling stones and moving platforms.
Some chambers **seal shut** until every beast inside is down. Creatures give you
a moment's grace when you walk in; you respawn at the doorway you entered by.

**Saving** is automatic (every doorway and every few seconds). Gates you open,
barriers you break and arenas you clear stay that way. **Continue Journey** on
the title screen resumes; the pause menu has *World Map*, *Back to the Doorway*
(if you get stuck) and *Reset This Room*.

### How the world looks, moves and sounds

**Each region has its own look and light.** Stonework is drawn per region (cave
strata, sunken brickwork, root-threaded earth, riveted steel, glassy ice with snow
caps, temple blocks with gold trim, pale marble, glowing heart veins), with
rounded outer corners and a soft bevel. Every room has 3 to 4 depth layers: the
sky, far and near parallax, and a **foreground layer** that slides past in front of
the camera (rock teeth, columns, leaves, chains, snow drifts, banners, clouds,
shards). A giant **landmark** sits far behind each region (the Great Geode, the
broken tower, the World Tree, the Great Furnace, the summit, the ziggurat, the
floating citadel, the Heart), so you always know which way the region's heart is.

| Region | Light | Terrain twist |
|---|---|---|
| Whispering Caves | cold blue, glowing crystals; some rooms are **pitch dark**, and the heroes' lights merge and grow when they stay close | |
| Sunken Ruins | rippling water light | **tidal pools** that rise and fall; swim with JUMP |
| Verdant Wilds | sun shafts through the canopy | **bounce mushrooms** and swaying vines |
| The Ironworks | furnace glow and embers | **steam vents** that lift you on a timer, conveyor belts |
| Frostpeak | blizzard fog | **slippery ice** and mountain gusts |
| The Great Temple | gold torchlight | **sunbeam puzzles**: turn mirrors (ACTION) to steer light into sun crystals |
| Sky Isles | bright open daylight | **updrafts** and more crumbling ground |
| Heart of Aether | a purple heartbeat pulse | **heartbeat stones** that blink in time with the Heart |

**The world reacts.** Grass bends as you run through it, vines and roots sway when
you brush them, water splashes, and dust puffs up on landing. Colours always mean
the same thing: red and magenta hurt, gold is interactive, green is Nichols, blue
is Nibihah. Near a region border, the neighbour's plants creep in.

**Movement.** Nichols is heavy (slower to speed up, falls fast, lands with a
camera-shaking thud); Nibihah is light and quick to turn. Wall kicks, swings and
tosses keep their **momentum**. Both heroes **grab ledges** they only just reach.
Co-op moves: **toss** (Nichols presses ACTION with Nibihah on his head to throw her
up), **catch** (hold ACTION to catch a falling partner on your head), and a
**high five** at every shrine.

**Sound.** A **combat layer** (pulse and low ostinato) fades into the music when
beasts are near. Footsteps sound different on every surface, and each power and
move has its own sound.

### Guardians, escapes and rewards

**Hearts.** In the Journey each hero has hearts (3 to start). Creatures, their
shots and guardians cost a heart; spikes, lasers and pits are still a fall. A hit
dazes a creature for a moment: if your **partner** lands the next hit it's a
**co-op combo** (triple damage, +2 gems). Later regions field glowing **elite**
creatures that drop extra gems. Fallen heroes come back in a column of light.

**Guardians.** Every shrine is guarded, and each guardian fights the way its
region plays: the Crystal Golem (slams, falling crystals, charges), the Tide
Serpent (sweeping beams), the Thorn Queen (spores and summoned beasts), the
Furnace Titan, the Frost Yeti, the Sun Idol (jump the low beam, stay down for the
high one), the Storm Roc (dives) and the Hollow Heart. Each one warns before it
attacks, then gets **dazed**, and that's the moment to strike for double damage.
Shots bend a little toward guardians and flyers so you can hit them in the air.

**Escapes.** Claiming a power wakes the region: rising water, a collapsing
crystal wall, fire, an avalanche and so on chase the heroes back out of the
shrine while rubble crashes down. Both have to make it; if either falls, the run
restarts a little slower.

**Rewards.** Dead ends and hidden vaults hold **Heart Crystals** (+1 heart for
both) and **Energy Cells** (+20 shared energy). Gems are money now: Pell the
Merchant waits in the first room and at every shrine once its guardian falls,
selling region **maps**, perks (Gem Magnet, Thick Skin, Quick Recovery, Heavy
Hitter) and **outfits** (hats and trinkets you can put on either hero). The full
map lists the gems and upgrades still hidden in each region.

**Getting around.** From a shrine you've made safe (or the first room), the
pause menu offers **Fast Travel** to any other safe shrine. On the map, move the
cursor with WASD or the arrows and press `P` or `Enter` to drop a **pin**.

**Story.** Each region has someone to talk to (walk up, press `S` / `↓`), a short
scene plays the first time you enter a region, and a hooded thief keeps showing
up one room ahead of you until the very end.

**Settings and replay.** Colourblind mode (a safe palette, stripes on everything
that hurts, N and B letters on hero-only switches), Assist mode (+2 hearts, slower
traps), reduced flashing, reduced shake, controller rumble, and a speedrun timer
with per-power splits. There are **3 save slots**, and finishing the Journey
unlocks **New Game+** (tougher beasts, faster traps, keep your outfits).

The world is generated **deterministically** from a fixed seed
(`src/world/worldgen.js`), so every player explores the same map, and the test
suite proves every room is solvable (see *Tests*).

## The heroes

**Nichols** — the Inventor & Engineer (**green** & silver). Brown skin, explorer
jacket, a mechanical gauntlet and a small backpack. Operates **green** mechanisms.
- **Carry & throw**: pick up crates, hold to charge, release to throw in any
  direction — throws arc, bounce off walls, and can be caught by his partner.
- **Grapple**: yank distant levers with the grappling tool.
- **Build**: assemble temporary bridges at anchor points (they decay).
- Pushes heavy objects · repairs machines · activates green mechanisms · immune to electricity.
- Weakness: poison gas.

**Nibihah** — the Explorer & Acrobat (**blue** & gold). Brown skin, a long braid,
a hooded travel cape and a satchel. Operates **blue** mechanisms.
- **Mid-air dash**, **crawl** through low gaps, and a faster wall-climb grip.
- **Detection**: reveals invisible platforms, hidden switches and ancient
  symbols — secret rooms she opens become shortcuts for both heroes.
- Double jump · fits through narrow passages · activates blue mechanisms · immune to poison.
- Weakness: electrical hazards.

> Note: a hero's colour drives which coloured mechanisms they can operate, not
> what they survive. Nichols is green but still the electricity-proof one;
> Nibihah is blue but still the one who can walk through poison.

**Co-op:** stand on each other's heads and ride along — but a hero carrying a
partner jumps noticeably lower, so stacking is powerful without being free.

Both heroes are drawn as original procedural pixel art with a full animation set:
idle, walk, run, jump, fall, land, push, climb, celebrate and defeated.

## Title screen, intro and story

**Opening.** The game waits on a single ember ("Press any key", because browsers
only allow sound after your first key or click). Then: a spark in the dark and
two heartbeats, the camera tilts down out of the stars onto the valley, "Aether
Studios presents" appears across the sky, light gathers into the emblem, and the
logo lands on a choir and timpani hit as the main theme begins. Any key skips it.

**Title.** A night vista in the Ori style: aurora and nebulae, the Heart of Aether
beating far away with rays of light, the eight region landmarks on the horizon,
floating islands with waterfalls, a misty lake that catches the Heart's glow, and
Nichols and Nibihah on a cliff under a glowing spirit tree, framed by swaying
leaves and drifting lights, all with slow parallax. The emblem is the two compass
halves (green for Nichols, blue for Nibihah) inside a turning gold ring.

**Music.** `src/core/score.js` is a small synthesised orchestra (piano, strings,
choir, bells, bass, timpani, whooshes and risers, through a generated hall
reverb). The title theme is in D minor at 70 bpm: eight bars of harp and strings,
then the melody with choir. Story scenes get their own mood (mystery, sorrow,
wonder, tension, hope, joy, triumph) and each panel has its own sound as it
appears. Gameplay music takes over when play starts.

**Story panels.** `src/ui/paintings.js` repaints every story scene (prologue,
the classic chapter endings, and the Journey ending) with layered skies,
mountains fading into haze, light rays, glowing crystals, drifting motes and
petals, and the heroes drawn large. Each panel slowly pans and zooms, panels
cross-fade, and the lines are typed out as film subtitles in the bottom bar with
the speaker's name above. The first key finishes the line, the next turns the
page, `Esc` skips.

**Secrets:** click the emblem five times, or enter the Konami code
(`↑↑↓↓←→←→↑↓`). Leave the title idle and it plays a slideshow of the story
paintings.

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

**Tutorial tips.** Each mechanic is taught by an in-world tip card: a gold-rimmed
glass card with the rule in a short paragraph (key words picked out in gold) and
key caps tinted per hero (green for Nichols, blue for Nibihah). From afar a tip
is just a small floating **?** rune, so it never clutters the view; it unfolds
when a hero walks up and folds away when they leave. Press **H** in game to hide
or show every tip, or pick *Smart*, *Always open* or *Hidden* under
Settings > Gameplay > Tutorial tips.

## Controllers

Gamepads are **auto-detected** (standard layout). Pad 1 → Nichols, Pad 2 →
Nibihah; left stick / d-pad to move, **A** to jump, **X/B** to act, **Start** to
pause, **LB** to strike, **LT** to roll. The menu is fully navigable by keyboard
(arrows + Enter) or pad. Controllers rumble on hits, falls and guardian slams
(switch it off in Settings).

## Controls

| | Player 1 · Nichols | Player 2 · Nibihah |
|---|---|---|
| Move / Jump | `W` `A` `S` `D` (or Pad 1) | `↑` `←` `↓` `→` (or Pad 2) |
| Flip switch / repair / carry / throw / cells | `S` | `↓` |
| Special (grapple / telekinesis · swing / dash) | `Q` | `Right Shift` |
| **Attack** (bolt gun · bow) | `E` | `.` |
| **Strike** (close range, from the start) | `X` | `,` |
| **Dodge roll** (on the ground, costs a little energy) | `Left Shift` | `Right Ctrl` |
| Talk to people · trade with the merchant · toss your partner | `S` | `↓` |
| Ping a spot | `F` | `/` |
| Hide / show tutorial tips | `H` | `H` |
| Crawl (Nibihah) · brace · drop through one-way | hold `S` | hold `↓` |
| World map (either player) | `M` / `Tab` | `M` / `Tab` |

Online, each machine only reads its own hero's column of this table.
In the Journey, Special and Attack only work once the matching power is found.

**Tutorials** — every level that introduces a mechanic now carries a floating
parchment sign teaching it in-world, with key glyphs (how to swing, telekinesis,
wall jumps, weapons, the boss, and more). All keys are rebindable, including
Special and Attack.

**Combat** — corruption-**rats** nest in scattered levels beyond 20: 4 hits to
fell (health bar shown), they wander their nest, hunt you while healthy, and
bolt when one hit from death. Once cleared they stay dead — unless both heroes
fall, which lets the nest recover. Nichols fires a **bolt gun**, Nibihah a
**bow** with arcing arrows.

**The boss is now interactive**: the Celestial takes **40 hits** across **two
waves** — at half health it starts teleporting across the arena on a 10-second
cooldown. The three puzzle seals still matter: each one stuns it and tears off
bonus damage. Weapons and puzzles win together.

**Pets** — at the end of Chapter 2 the heroes are adopted by a small white
**cat that trails rainbows** and a round little **frog that walks in falling
stars**. They trot at their heroes' heels through every level from Chapter 3 on.

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
| 3 | Enchanted Forest | 26–40 | ✅ built |
| 4 | The Great Temple | 41–50 | ✅ built |
| 5 | Temple in the Sky | 51–60 | ✅ built |
| 6 | The Heavens | 61–70 | ✅ built |

**The campaign is complete: all 70 levels are built and machine-verified
solvable.** Level 70 is the finale — the **Celestial**, a puzzle boss beaten by
breaking three seals (a split rune verse, a ferried power cell, a tandem step)
while dodging starfire and telegraphed floor beams; stone ledges shelter you.
No combat: coordination is the weapon. Victory plays the full ending — the
world healing, the guardians returning, *"years later"*, Nichols' proposal
beneath the restored Heart Tree, the wedding, the kingdom at peace, a rising
camera into the stars, the title card, and a post-credits teaser of a distant
land.

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

- **The Journey (open world)** — local co-op on one keyboard (or two pads).
- **Online Co-op** — one player **Hosts** (5-letter lobby code), the other
  **Joins**. Hosting continues the host's saved journey (or the classic levels).
  **Player 1 (host) controls Nichols with WASD + Q/E/F only; Player 2 (client)
  controls Nibihah with the arrow keys + Right-Shift / . / slash only** — each
  machine ignores the other hero's keys, so neither player can drive the other's
  hero. The host runs the authoritative simulation; the client sends inputs
  (press counters, so a dropped packet never eats a jump) and mirrors the map,
  powers and room state.
- **Classic Levels** — the original 70-level campaign + Prototype Vault.

## Project structure

```
index.html            Loads scripts in dependency order (no build step)
src/world/worldgen.js The open world: regions, rooms, doorways, chunks, gates (deterministic)
src/world/world.js    Journey runtime: travel, powers, discovery %, room memory, saving
src/world/creatures.js Creatures, doorways, shrines, light bridges, thorn barriers, arenas,
                      water, updrafts, bounce mushrooms, sun crystals
src/world/decor.js    Flora, foreground layer, landmarks, region light, shared dark-room light
src/world/guardians.js Guardians, escapes, rubble, upgrades, NPCs, the merchant, the thief, outfits
src/core/score.js     The synthesised soundtrack: title theme, story moods, cinematic cues
src/ui/paintings.js   The painted story panels (and the brushes the title screen uses)
src/ui/title.js       Opening sequence, title vista, idle slideshow
src/ui/worldmap.js    Full map + minimap
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

```
node tests/world.js    # open world: every room solvable from every doorway,
                       # power gates sealed without their power and open with it,
                       # no soft-locks, 100% reachable, idle-safety, render smoke
node tests/powers.js   # real-physics bots perform every power trial
                       # (throw, mind-grip, chimney climb, grapple, dash, swing, boost)
                       # plus toss, catch, sunbeams, heartbeat stones, water,
                       # mushrooms, steam vents and updrafts; bots beat the
                       # guardians and outrun an escape; strike, combo, roll
node tests/online.js   # P1 = WASD only / P2 = arrows only, dropped-packet presses,
                       # host/client world sync, guardian fights and escapes online
node tests/journey.js  # hearts & energy upgrades, the merchant, save slots,
                       # New Game+, fast travel, map secrets, assist & colourblind
node tests/verify.js   # the classic 70-level campaign
```

The classic harness:

It stubs the DOM, loads the real game files and checks character identity,
colour-lock ownership, spawn safety, the portal rule, and **staged solvability
for every campaign level** — opening gates in puzzle order to prove each lever
or key is reachable *before* the gate it controls. Current status: **179/179**.


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
