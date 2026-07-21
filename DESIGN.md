# Echoes of Aether — Advanced Co-op Mechanics Design Doc

This documents the systems shipped in the "advanced difficulty" pass: what was
built, the exact parameters, and how to playtest it. Everything here is
implemented and verified by `node tests/verify.js` (276 checks).

---

## 1. Mechanics specification

### Telekinesis (Nichols)
| | |
|---|---|
| Grab / release | **SPECIAL** (`Q` / pad Y) within 220px of a tele-cube |
| Steer | his movement keys while holding (WASD) |
| Move speed | free/track 145 px/s · heavy 70 px/s |
| Heavy lift cap | cannot rise more than 44px above grab height |
| Track cubes | locked to one axis (`axis: "x" | "y"`) |
| Free cubes | weightless — **float where released** (usable as platforms/shields) |
| Energy | drains the shared pool at **14/s**; empty pool drops the cube |
| The co-op twist | **the holder is rooted** — snapped in place, jump suppressed; being knocked airborne breaks the grip. Nibihah must cover him. |

Interactions: tele-cubes count as cargo for `needsCrate` plates, block lasers
and **shelter wind zones** where parked; they cannot be picked up by hand or
thrown (the mind, not the hands).

### Swinging (Nibihah)
| | |
|---|---|
| Attach | **SPECIAL** (`RShift` / pad Y) within 150px, below a glowing ring |
| Pump | Left/Right near the bottom of the arc (+2.2 rad/s² steer) |
| Reel | Up shortens / Down lengthens the line (75 px/s, 50–235px) |
| Release | Jump or SPECIAL — launches with current tangential velocity |
| Physics | pendulum: `α = −(g/L)·sin(a)`, damping 0.12/s, fixed-step deterministic |
| Crash | hitting stone mid-swing stuns the swing dead (fall straight down) |
| Energy | **8/s** from the shared pool |
| Momentum carry-in | her velocity converts to angular velocity on attach; her double jump refreshes on release |

### Shared energy pool
One 100-point pool for both abilities. Regenerates **12/s only while neither
ability is active** — so Nichols holding a shield indefinitely starves
Nibihah's swings, and vice versa. Shown as a bar under the objective; turns
red below 25%.

### Synchronized systems
- **Tandem plates** — twin pads; channel live only while both are pressed
  within a 0.4s grace (countdown ring shows the waiting pad).
- **Rune sequences** — numbered pads pressed in order; pads can be
  colour-locked to one hero; a wrong step resets; completion latches.
- **Tether zones** — inside the zone the heroes are bound by a visible
  thread; beyond `maxDist` it snaps and **both** fall. Thread reddens with strain.
- **Wind zones** — periodic gusts (period/blow/push per zone) shove anyone
  inside; **crouching on the ground braces**; a parked cube shelters the zone.
- **Time switches / timed gates** — from Chapter 2, reused for delayed-door races.

### Ping system
`F` (Player 1) and `/` (Player 2) drop a glowing diamond marker in the hero's
colour with a chime — silent communication for "here / look / wait".

### Grading
S/A/B/C on the completion screen, best saved per level. One point each for:
time under par (par by tier: easy 120s · medium 210 · hard 320 · extreme 460),
zero deaths, all gems. 3 points = S.

---

## 2. Where each mechanic is taught (difficulty curve)

| Levels | New idea | Tier |
|---|---|---|
| 11–13 | Swing rings appear as *optional* routes | medium |
| 15 | Telekinesis intro (the third weighing stone) | medium |
| 25 | Swing shortcuts under collapse pressure | extreme |
| 26–28 | Rune sequences: solo → split verses → 5-rune mixed | medium→hard |
| 29–31 | Wind: brace → swing through → tele-shield | medium→hard |
| 32–34 | Sync: tandem plates → tether zone → delayed doors | medium→hard |
| 35–37 | Hazards: Windwall Gorge → melting ice → falling bridges | hard |
| 38–40 | Integration towers → **The Guardian's Test** | hard→extreme |

Level length grows with the chapter (40×18 rooms → 30×34 towers); failure
cost grows via one-crossing bridges and latched sequences rather than longer
respawns — deaths stay cheap, *progress* becomes the stake.

### Ten Chapter-3 level designs (implemented)
1. **26 Whispering Runes** — 3 runes in order → gate → high portal. *Fails:* wrong order resets. *Co-op:* portal needs both.
2. **27 Echoed Song** — two colour-locked verses AND-gate the way; a blade patrols the exit run. *Co-op:* each hero must sing their own verse.
3. **28 The Divided Verse** — 5 runes alternating between heroes; only talking through the order works.
4. **29 The First Gale** — periodic gust corridor into thorns; move in lulls, crouch in gusts.
5. **30 Gale Crossing** — twin spike pits; she swings over, he crosses ledges in the lull; wind fights both.
6. **31 Shelter Stone** — he mind-carries the stone as a moving windbreak for her, then parks it on a cargo plate. *Twist:* while holding he can't move.
7. **32 In Step** — tandem plates drive the lift; step off and it sinks back.
8. **33 Bound by Light** — tethered corridor with a patrolling blade; the thread visibly strains before snapping.
9. **34 The Split Path** — clockwork lever (5.5s) then tandem plates; two timers, one plan.
10. **35 Windwall Gorge** — the spec's set piece: opposing gusts, tele-shield, a swing over the second pit, tandem finish powering the portal.
(36–40 continue: melting ice, one-crossing bridges + rescue lever, and the two integration towers ending in the Guardian's Test.)

---

## 3. Playtesting guidance

Per-mechanic checks:
- **Telekinesis** — grab range feels fair (220px)? Rooting readable (he snaps
  back if you try to walk)? Cube steering speed OK at 145? Heavy cap noticed?
- **Swing** — can a new player cross L11's gallery within ~3 tries? Does
  pumping feel causal (push at the bottom of the arc)? Crash-stun fair?
- **Energy** — does the pool create *prioritisation* (arguments about who
  spends it) without feeling starved? Regen 12/s is the tuning knob.
- **Tandem/tether/runes** — is the failure always attributable ("you stepped
  early", "you drifted")? That's the fail-states-teach principle.

Expected first-clear times: teaching levels 2–4 min; hard levels 5–8 min;
the two extreme towers 8–15 min. S-grades should require a deliberate replay.

Known friction points (watch for): swing attach requires being *below* the
ring (by design — telegraph it); wind + swing combined can feel unfair if the
gust phase is invisible (the zone renders its arrows only while blowing);
rooted Nichols next to a blade is a death sentence — levels avoid placing
blades inside tele-work areas.

---

## 4. HUD
- **Energy bar** — center-top under the objective; green→blue gradient, red
  under 25%.
- **Tele tether** — a thin glowing line from Nichols' head to the cube; the
  cube brightens while held; track cubes show their rail as a dashed line.
- **Swing** — rope drawn from ring to hero; rings pulse to advertise
  themselves; release sparkles at the launch point.
- **Tandem** — countdown ring over the pressed pad while it waits.
- **Tether** — the thread itself is the meter: gold and slack → red, taut and
  dashed just before it snaps.

---

## 5. Honest deferrals
Not in this pass (called out rather than half-shipped): enemies/patrols,
seesaw counterweights, battery ferrying, mirror-movement rooms, replay system,
challenge mode, daily levels, level editor, voice cues, light-flash memory
(the rune order is always visible — a deliberate simplification), and
Chapter 4–6 level content. The systems above were built to carry those
chapters when they come.
