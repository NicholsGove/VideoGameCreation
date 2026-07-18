/* =========================================================================
 * levels.js — level definitions (pure data) + a tiny procedural builder
 * -------------------------------------------------------------------------
 * Levels are just data: a tile grid + a list of objects with tile coordinates.
 * Because everything is data-driven, adding a level is as simple as pushing a
 * new entry to GG.LEVELS — no engine changes required. This is the primary
 * extension point for future content / a level editor / community levels.
 *
 * Each level introduces something new while the shared win rule (BOTH players
 * on their matching exits at once) guarantees cooperation.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, C = GG.C;
  const T = 32;                    // tile size (px)
  const COLS = 40, ROWS = 18;
  const FLOOR = 16;               // top row index of the floor
  const FLOOR_TOP = FLOOR * T;    // 512

  // Tile grid helpers -----------------------------------------------------
  function makeGrid() {
    const g = [];
    for (let r = 0; r < ROWS; r++) g.push(new Array(COLS).fill(0));
    return g;
  }
  // Bounds must come from the grid itself — levels can be any size now, and
  // clamping to the default 40x18 would silently discard tower geometry.
  function box(g, c0, r0, c1, r1, v) {
    const rows = g.length, cols = g[0].length;
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++)
      for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) g[r][c] = v;
  }
  function frame(g) {
    box(g, 0, 0, COLS - 1, 0, 2);            // ceiling
    box(g, 0, 0, 0, ROWS - 1, 2);            // left wall
    box(g, COLS - 1, 0, COLS - 1, ROWS - 1, 2); // right wall
    box(g, 0, FLOOR, COLS - 1, ROWS - 1, 1); // floor
  }

  // Object helper: tile coords -> pixel object. `e` overrides may set x/y/w/h.
  function O(type, tx, ty, e) {
    return Object.assign({ type, x: tx * T, y: ty * T }, e || {});
  }
  const spawn = (tx, ty) => ({ x: tx * T, y: ty * T });

  const LEVELS = [];

  /* ===================================================================== *
   * LEVEL 1 — First Steps (movement + elemental immunity)
   * ===================================================================== */
  (function () {
    const g = makeGrid(); frame(g);
    // a couple of small ledges to jump onto
    box(g, 18, 13, 21, 13, 2);      // mid platform (for a gem)
    box(g, 27, 14, 29, 14, 1);      // step up near the end
    LEVELS.push({
      id: 101, chapter: 0, name: "First Steps", theme: "temple", biome: "Temple",
      hint: "Kiro shrugs off electricity; Lyra shrugs off poison. Cross your own hazard, jump the other.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Circuit is immune to electric; Bloom to poison.
        O("hazard", 9, 14, { kind: "poison", w: 3 * T, h: 2 * T }),
        O("hazard", 23, 14, { kind: "electric", w: 3 * T, h: 2 * T }),
        O("gem", 6, 14, {}),
        O("gem", 19, 12, {}),
        O("gem", 31, 14, {}),
        O("exit", 34, 15, { player: 0 }),
        O("exit", 36, 15, { player: 1 }),
      ],
    });
  })();

  /* ===================================================================== *
   * LEVEL 2 — Switch & Signal (color switches + doors + a timed door)
   * ===================================================================== */
  (function () {
    const g = makeGrid(); frame(g);
    box(g, 24, 12, 27, 12, 2);      // ledge over the timed-door side room
    LEVELS.push({
      id: 102, chapter: 0, name: "Switch & Signal", theme: "ruins", biome: "Sunken Ruins",
      hint: "Blue mechanisms obey Kiro; green obey Lyra. Open each other's doors to advance.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Only Circuit can flip the blue switch -> opens the GREEN door for Bloom.
        O("switch", 5, 15, { channel: "gdoor", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        O("door", 8, 14, { channel: "gdoor", color: "green", w: T, h: 2 * T }),
        // Only Bloom can flip the green switch -> opens the BLUE door for Circuit.
        O("switch", 11, 15, { channel: "bdoor", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        O("door", 15, 14, { channel: "bdoor", color: "blue", w: T, h: 2 * T }),
        // hazards to reinforce immunity
        O("hazard", 18, 14, { kind: "electric", w: 2 * T, h: 2 * T }),
        O("hazard", 20, 14, { kind: "poison", w: 2 * T, h: 2 * T }),
        // Optional timed-door side room with a bonus gem.
        O("button", 24, 15, { channel: "timed", w: T, h: 10, y: FLOOR_TOP - 10 }),
        O("door", 28, 14, { channel: "timed", color: "gold", w: T, h: 2 * T, timedMs: 2600 }),
        O("gem", 30, 14, {}),
        O("gem", 13, 14, {}),
        O("exit", 34, 15, { player: 0 }),
        O("exit", 36, 15, { player: 1 }),
      ],
    });
  })();

  /* ===================================================================== *
   * LEVEL 3 — Heavy Lifting (crates + weighted buttons + keys/locks)
   * ===================================================================== */
  (function () {
    const g = makeGrid(); frame(g);
    box(g, 20, 13, 24, 13, 2);      // upper ledge holding a key
    box(g, 12, 15, 12, 15, 0);      // (keep floor solid; nothing removed)
    LEVELS.push({
      id: 103, chapter: 0, name: "Heavy Lifting", theme: "factory", biome: "Factory",
      hint: "Kiro shoves HEAVY crates. Park one on a button to hold a door — Lyra can also ride his head.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Heavy crate (only Circuit can push) must sit on the button to hold the door.
        O("crate", 6, 15, { heavy: true }),
        O("button", 9, 15, { channel: "holddoor", w: T, h: 10, y: FLOOR_TOP - 10 }),
        O("door", 13, 14, { channel: "holddoor", color: "gold", w: T, h: 2 * T }),
        // A light crate to climb onto the ledge for the key.
        O("crate", 18, 15, { heavy: false }),
        O("key", 22, 12, { color: "gold" }),
        // Locked door before the exits — needs the key.
        O("lock", 30, 14, { color: "gold", w: T, h: 2 * T }),
        O("gem", 10, 14, {}),
        O("gem", 22, 11, {}),
        O("gem", 33, 14, {}),
        O("exit", 35, 15, { player: 0 }),
        O("exit", 37, 15, { player: 1 }),
      ],
    });
  })();

  /* ===================================================================== *
   * LEVEL 4 — Moving Parts (moving platforms + ice + conveyors + spikes)
   * ===================================================================== */
  (function () {
    const g = makeGrid(); frame(g);
    // Carve a big spike pit in the middle; cross via moving platform.
    box(g, 10, FLOOR, 20, ROWS - 1, 0);         // remove floor -> pit
    // Icy approach
    box(g, 4, FLOOR, 9, FLOOR, 3);              // ice floor stretch
    // Conveyor belts near the end push you toward the exit
    box(g, 26, FLOOR, 30, FLOOR, 5);            // conveyor-right
    box(g, 31, 13, 34, 13, 4);                  // conveyor-left ledge (tricky gem)
    LEVELS.push({
      id: 104, chapter: 0, name: "Moving Parts", theme: "ice", biome: "Icy Peaks",
      hint: "Ride the platform together. Ice is slippery; belts carry you along.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // spikes at the bottom of the pit
        O("hazard", 10, ROWS - 1, { kind: "spike", w: 11 * T, h: T }),
        // moving platform ferries both across the pit; gated by a switch so
        // one player calls it while the other waits — light cooperation.
        O("platform", 10, 14, { w: 3 * T, h: 14, x2: 18 * T, y2: 14 * T, speed: 70, channel: "lift" }),
        O("switch", 5, 15, { channel: "lift", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        // a second, always-on vertical platform for a gem
        O("platform", 22, 15, { w: 2 * T, h: 14, x2: 22 * T, y2: 10 * T, speed: 55 }),
        O("gem", 22, 8, {}),
        O("gem", 32, 12, {}),
        O("gem", 6, 14, {}),
        O("exit", 35, 15, { player: 0 }),
        O("exit", 37, 15, { player: 1 }),
      ],
    });
  })();

  /* ===================================================================== *
   * LEVEL 5 — The Long Circuit (FINALE: lasers, mirrors, teleporters, dark,
   *            crates blocking beams, color switches — everything combined)
   * ===================================================================== */
  (function () {
    const g = makeGrid(); frame(g);
    box(g, 11, 8, 13, 8, 2);        // high ledge (teleporter bonus + gem)
    LEVELS.push({
      id: 105, chapter: 0, name: "Overgrowth", theme: "jungle", biome: "Jungle", dark: true,
      hint: "Stay close for light. Kiro kills the blue beam; Lyra kills the green — then cross the gates.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Beam 1 (vertical chokepoint) — ON by default; only CIRCUIT's blue
        // switch disables it, clearing the way for Bloom to advance.
        O("laser", 20, 1, { dir: "down", w: T, h: T, channel: "beam1off", invert: true }),
        O("switch", 16, 15, { channel: "beam1off", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        // Beam 2 (vertical chokepoint) — only BLOOM's green switch disables it,
        // and the switch sits PAST beam 1, so Circuit must clear beam 1 first.
        O("laser", 26, 1, { dir: "down", w: T, h: T, channel: "beam2off", invert: true }),
        O("switch", 23, 15, { channel: "beam2off", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        // Safe demonstrative reflecting beam near the ceiling (mirror bends it).
        O("laser", 7, 2, { dir: "right", w: T, h: T }),
        O("mirror", 30, 2, { orient: "/", w: T, h: T }),
        // Teleporter: warp up to a hidden bonus gem ledge (self-contained).
        O("teleporter", 5, 15, { id: 900, pair: 901, color: "green", w: T, h: T }),
        O("teleporter", 12, 7, { id: 901, pair: 900, color: "green", w: T, h: T }),
        // Elemental gates before the exits — single tiles you hop over.
        O("hazard", 31, 14, { kind: "poison", w: T, h: 2 * T }),
        O("hazard", 33, 14, { kind: "electric", w: T, h: 2 * T }),
        O("gem", 12, 6, {}),
        O("gem", 28, 14, {}),
        O("gem", 20, 14, {}),
        O("exit", 35, 15, { player: 0 }),
        O("exit", 37, 15, { player: 1 }),
      ],
    });
  })();

  /* ===================================================================== *
   * LEVEL 6 — Floating City (SHOWCASE: head-stacking, double jump, one-way
   *            platforms, narrow passage, machine repair)
   * ===================================================================== */
  (function () {
    LEVELS.push({
      id: 106, chapter: 0, name: "Floating City", theme: "city", biome: "Floating City",
      hint: "Lyra rides Kiro's head, then double-jumps to the green switch. Kiro repairs the gate.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Kiro repairs a machine to power the first gate open (Lyra can't).
        O("repair", 6, 15, { channel: "power", y: FLOOR_TOP - 30 }),
        O("door", 10, 14, { channel: "power", color: "blue", w: T, h: 2 * T }),
        // A Lyra-only narrow passage guarding a bonus gem in a pocket.
        O("narrow", 14, 15, { w: T, h: T }),
        O("gem", 14, 16, {}),
        // High ledge with the green switch — reach it via a head-stack + double jump.
        O("switch", 21, 8, { channel: "exitgate", colorLock: "green", w: 22, h: 28, y: 9 * T - 28 }),
        O("door", 27, 14, { channel: "exitgate", color: "green", w: T, h: 2 * T }),
        O("gem", 21, 7, {}),
        O("gem", 35, 9, {}),
        O("exit", 37, 15, { player: 0 }),
        O("exit", 38, 15, { player: 1 }),
      ],
    });
  })();

  /* ===================================================================== *
   * LEVEL 7 — The Heart Engine (FINALE: the Guardian puzzle-boss — restore the
   *            Heart Engine through cooperation, not combat)
   * ===================================================================== */
  (function () {
    LEVELS.push({
      id: 107, chapter: 0, name: "The Heart Engine", theme: "heart", biome: "Heart Engine", dark: true,
      hint: "The Guardian's beams: Kiro kills one, Lyra the other. Then Kiro restores the Heart.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Guardian beam A — only Kiro's blue switch disables it.
        O("switch", 6, 15, { channel: "beamA", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        O("laser", 18, 1, { dir: "down", channel: "beamA", invert: true, w: T, h: T }),
        // Guardian beam B — only Lyra's green switch (up on the ledge) disables it.
        O("switch", 14, 9, { channel: "beamB", colorLock: "green", w: 22, h: 28, y: 10 * T - 28 }),
        O("laser", 22, 1, { dir: "down", channel: "beamB", invert: true, w: T, h: T }),
        // Teleporter warps Lyra up to the ledge for beam B's switch.
        O("teleporter", 5, 15, { id: 920, pair: 921, color: "green", w: T, h: T }),
        O("teleporter", 12, 9, { id: 921, pair: 920, color: "green", w: T, h: T }),
        // Restore the Heart Engine (Kiro) to open the final gate.
        O("repair", 26, 15, { channel: "heart", y: FLOOR_TOP - 30 }),
        O("door", 30, 14, { channel: "heart", color: "gold", w: T, h: 2 * T }),
        // elemental hazards guarding the approach
        O("hazard", 24, 14, { kind: "electric", w: T, h: 2 * T }),
        O("hazard", 25, 14, { kind: "poison", w: T, h: 2 * T }),
        O("gem", 18, 14, {}), O("gem", 22, 14, {}), O("gem", 14, 8, {}),
        O("exit", 34, 15, { player: 0 }),
        O("exit", 36, 15, { player: 1 }),
      ],
    });
  })();

  /* =====================================================================
   * CHAPTER 1 — UNDERGROUND CAVES (levels 1–10)
   * Theme: learning cooperation. Each level introduces exactly ONE new idea,
   * then the finale combines them. All are verified solvable by the test suite.
   * ===================================================================== */
  const CH1 = [];
  const push1 = (def) => CH1.push(Object.assign({ chapter: 1, theme: "cave", biome: "Underground Caves" }, def));

  /* Levels may now be any size — tall shafts and towers as well as wide rooms.
   * `dims(cols, rows)` returns helpers bound to that level's geometry so a
   * barrier always spans the real playable height, whatever the level shape. */
  function dims(cols, rows) {
    const FL = rows - 2;                      // top row of the floor
    return {
      cols, rows, FLOOR: FL, FLOOR_TOP: FL * T,
      // full-height barrier: ceiling row 1 down to the floor
      gate: (tx, e) => O("door", tx, 1, Object.assign({ w: T, h: (FL - 1) * T, color: "gold" }, e)),
      lockGate: (tx, e) => O("lock", tx, 1, Object.assign({ w: T, h: (FL - 1) * T, color: "gold" }, e)),
      // a barrier that only seals part of a shaft (for vertical rooms)
      wall: (tx, ty, ht, e) => O("door", tx, ty, Object.assign({ w: T, h: ht * T, color: "gold" }, e)),
      spikes: (tx, wt, ty) => O("hazard", tx, ty != null ? ty : rows - 1, { kind: "spike", w: wt * T, h: T }),
    };
  }
  const D = dims(COLS, ROWS);                 // default wide-room helpers
  const gate = D.gate, lockGate = D.lockGate, spikes = D.spikes;
  // helpers for the taller, vertical levels
  const H4 = dims(30, 26);                    // L4 — the locked shaft
  const H6 = dims(26, 34);                    // L6 — Twin Ascension tower
  const H9 = dims(28, 30);                    // L9 — the collapsing climb
  const H10 = dims(30, 38);                   // L10 — the finale tower

  push1({
    id: 1, name: "First Light", teaches: "Movement & the Portal", tier: "easy",
    hint: "Climb to the portal and step inside TOGETHER — it only opens with both of you in it.",
    build: (g) => {
      box(g, 10, FLOOR, 12, ROWS - 1, 0);     // spike pit (3-wide jump)
      box(g, 16, 14, 19, 14, 1);              // ledge, 2 up
      box(g, 23, 12, 26, 12, 2);              // ledge, 2 up again
      box(g, 30, 10, 35, 10, 2);              // portal shelf, high up
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 3),
      O("gem", 17, 13, {}), O("gem", 24, 11, {}), O("gem", 34, 9, {}),
      O("portal", 31, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 2, name: "Pressure", teaches: "Buttons",
    hint: "Timed gates! Hit the plate, then BOTH sprint through. The brown ledges crumble underfoot.",
    tier: "easy",
    build: (g) => {
      box(g, 16, FLOOR, 18, ROWS - 1, 0);     // spike pit between the two gates
      box(g, 22, 14, 25, 14, 2);              // ledge holding the second plate
      box(g, 30, 13, 31, 13, 2);              // step up to the portal shelf
      box(g, 33, 11, 37, 11, 2);              // portal shelf
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("button", 8, 15, { channel: "g1", w: T, h: 10, y: FLOOR_TOP - 10 }),
      gate(13, { channel: "g1", timedMs: 3600 }),
      spikes(16, 3),
      O("crumble", 19, 13, { w: 2 * T, h: 14 }),
      O("button", 23, 13, { channel: "g2", w: T, h: 10, y: 14 * T - 10 }),
      gate(28, { channel: "g2", timedMs: 3600 }),
      O("gem", 10, 14, {}), O("gem", 24, 13, {}), O("gem", 36, 10, {}),
      O("portal", 34, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 3, name: "Dead Weight", teaches: "Crates",
    hint: "This gate needs BOTH plates weighed down at once. Watch the blade on the far side.",
    tier: "medium",
    build: (g) => {
      box(g, 24, 14, 27, 14, 1);              // ledge past the gate
      box(g, 30, FLOOR, 31, ROWS - 1, 0);     // pit near the end
      box(g, 33, 12, 37, 12, 2);              // portal shelf
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crate", 5, 15, { heavy: false }),
      O("crate", 8, 15, { heavy: false }),
      O("button", 12, 15, { channel: "a", w: T, h: 10, y: FLOOR_TOP - 10 }),
      O("button", 15, 15, { channel: "b", w: T, h: 10, y: FLOOR_TOP - 10 }),
      gate(20, { channels: ["a", "b"] }),      // AND: needs both plates
      O("blade", 22, 13, { x2: 28 * T, y2: 13 * T, speed: 95 }),
      spikes(30, 2),
      O("gem", 10, 14, {}), O("gem", 25, 13, {}), O("gem", 36, 11, {}),
      O("portal", 34, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 4, name: "The Locked Shaft", teaches: "Wall jumps & keys", tier: "medium",
    cols: 30, rows: 26,
    hint: "The key hangs at the top of a sealed chimney. No ledges — bounce between the walls to climb.",
    build: (g) => {
      // A wall-jump chimney: 3 tiles wide, capped, open at the bottom so the
      // floor corridor still runs underneath it. Climbing it is the ONLY way
      // to the key — there is nothing to stand on inside.
      box(g, 6, 8, 10, 8, 2);                 // roof
      box(g, 6, 9, 6, 21, 2);                 // left wall (stops above the floor)
      box(g, 10, 9, 10, 21, 2);               // right wall
      // the climb to the portal, after the lock
      box(g, 17, 21, 20, 21, 2);
      box(g, 22, 18, 25, 18, 2);
      box(g, 17, 15, 20, 15, 2);
      box(g, 22, 12, 25, 12, 2);
      box(g, 19, 9, 26, 9, 2);                // portal shelf
    },
    spawns: [spawn(2, 21), spawn(3, 21)],
    objects: [
      O("key", 8, 10, { color: "gold" }),      // top of the chimney
      O("gem", 8, 16, {}),
      H4.lockGate(16, { color: "gold" }),
      O("gem", 23, 17, {}), O("gem", 24, 11, {}), O("gem", 25, 8, {}),
      O("portal", 22, 7, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 5, name: "Blue and Green", teaches: "Colour switches",
    hint: "Blue levers obey Nichols, green obey Nibihah — the last gate needs BOTH left on. Time the crushers.",
    tier: "medium",
    build: (g) => {
      box(g, 22, FLOOR, 24, ROWS - 1, 0);     // spike pit before the final gate
      box(g, 17, 14, 19, 14, 1);
      box(g, 31, 13, 32, 13, 2);              // step
      box(g, 34, 10, 38, 10, 2);              // portal shelf
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("switch", 6, 15, { channel: "A", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      gate(11, { channel: "A", color: "blue" }),
      O("crusher", 14, 2, { travel: 10 * T, axis: "y", period: 2.8, phase: 0 }),
      O("switch", 16, 15, { channel: "B", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      gate(21, { channel: "B", color: "green" }),
      spikes(22, 3),
      O("crusher", 26, 2, { travel: 10 * T, axis: "y", period: 2.8, phase: 1.4 }),
      gate(29, { channels: ["A", "B"] }),       // both levers must stay on
      O("gem", 13, 14, {}), O("gem", 18, 13, {}), O("gem", 37, 9, {}),
      O("portal", 35, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 6, name: "Twin Ascension", teaches: "Vertical co-op climbing", tier: "hard",
    cols: 26, rows: 34,
    hint: "A tower with the portal at the summit. Zig-zag upward — vanishing blocks need timing.",
    build: (g) => {
      // zig-zag ledges, each a 3-tile climb so BOTH heroes can follow
      box(g, 3, 29, 8, 29, 2);
      box(g, 11, 26, 16, 26, 2);
      box(g, 17, 23, 22, 23, 2);
      box(g, 10, 20, 15, 20, 2);
      box(g, 3, 17, 8, 17, 2);
      box(g, 10, 14, 15, 14, 2);
      box(g, 17, 11, 22, 11, 2);
      box(g, 8, 8, 16, 8, 2);                 // summit shelf
      // a pedestal for the boost-only lever perch
      box(g, 19, 30, 20, 31, 2);
      box(g, 20, 25, 21, 25, 2);
    },
    spawns: [spawn(3, 30), spawn(4, 30)],
    objects: [
      // vanishing steps punctuate the climb
      O("blink", 9, 23, { w: 2 * T, h: 14, period: 2.4, duty: 0.6, phase: 0 }),
      O("blink", 16, 17, { w: 2 * T, h: 14, period: 2.4, duty: 0.6, phase: 1.2 }),
      O("crumble", 16, 20, { w: 2 * T, h: 14 }),
      // a blade patrols the middle of the tower
      O("blade", 11, 22, { x2: 20 * T, y2: 22 * T, speed: 100 }),
      // the summit is sealed until the boost-only lever is thrown
      O("switch", 20, 24, { channel: "top", w: 22, h: 28, y: 25 * T - 28 }),
      H6.wall(17, 8, 3, { channel: "top", color: "blue" }),
      O("gem", 5, 28, {}), O("gem", 19, 22, {}), O("gem", 12, 13, {}), O("gem", 14, 7, {}),
      O("portal", 11, 6, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 7, name: "Toss and Catch", teaches: "Carrying & throwing",
    hint: "That plate only answers to cargo, and the shelf is too high to climb. Charge with ACTION, aim up, THROW. Mind the rocks.",
    tier: "hard",
    build: (g) => {
      box(g, 19, 12, 25, 12, 2);              // high shelf: too tall for Nichols to climb
      box(g, 13, FLOOR, 14, ROWS - 1, 0);     // pit to cross first
      box(g, 31, 13, 32, 13, 2);
      box(g, 34, 10, 38, 10, 2);              // portal shelf
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crate", 7, 15, { heavy: false }),
      spikes(13, 2),
      O("rock", 10, 4, {}), O("rock", 17, 4, {}), O("rock", 27, 4, {}),
      // heavy plate: a hero's weight is not enough — the crate must land on it
      O("button", 21, 11, { channel: "g", needsCrate: true, w: 3 * T, h: 10, y: 12 * T - 10 }),
      gate(29, { channel: "g" }),
      O("gem", 10, 14, {}), O("gem", 24, 11, {}), O("gem", 37, 9, {}),
      O("portal", 35, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 8, name: "Hidden Ways", teaches: "Secrets & narrow paths",
    hint: "Nibihah must lead — stay close or the invisible steps fade. Two symbols open the way up.",
    tier: "hard",
    build: (g) => {
      box(g, 9, FLOOR, 10, ROWS - 1, 0);      // hidden pocket below the crack
      box(g, 26, 10, 30, 10, 2);              // high shelf, only via unseen steps
      box(g, 34, 8, 38, 8, 2);                // portal shelf, higher still
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("narrow", 9, 15, { w: T, h: T }),      // only Nibihah fits
      O("secret", 10, 16, { channel: "s1", w: 24, h: 24 }),
      // invisible staircase — she reveals it, he follows while she stays near
      O("hidden", 18, 13, { w: 2 * T, h: 12 }),
      O("hidden", 22, 11, { w: 2 * T, h: 12 }),
      O("secret", 27, 9, { channel: "s2", w: 24, h: 24, y: 10 * T - 24 }),
      O("hidden", 31, 9, { w: 2 * T, h: 12 }),
      O("blade", 14, 14, { x2: 20 * T, y2: 14 * T, speed: 85 }),
      O("gem", 29, 9, {}), O("gem", 23, 10, {}), O("gem", 37, 7, {}),
      O("portal", 35, 6, { w: 2 * T, h: 2 * T, channels: ["s1", "s2"] }),
    ],
  });

  push1({
    id: 9, name: "The Collapsing Climb", teaches: "Crumbling ascent & lifts", tier: "hard",
    cols: 28, rows: 30,
    hint: "Nothing here holds for long. Keep moving upward — and don't outrun your partner.",
    build: (g) => {
      box(g, 4, 25, 9, 25, 2);
      box(g, 12, 22, 16, 22, 2);
      box(g, 19, 19, 24, 19, 2);
      box(g, 4, 13, 9, 13, 2);                 // reached by the lift
      box(g, 12, 10, 17, 10, 2);
      box(g, 18, 7, 25, 7, 2);                 // portal shelf
      box(g, 10, 27, 13, 27, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      // crumbling steps up the lower tower
      O("crumble", 10, 24, { w: 2 * T, h: 14 }),
      O("crumble", 17, 21, { w: 2 * T, h: 14 }),
      O("crumble", 20, 16, { w: 2 * T, h: 14 }),
      // a lift bridges the long gap in the middle
      O("platform", 14, 18, { w: 3 * T, h: 14, x2: 6 * T, y2: 14 * T, speed: 70 }),
      O("blink", 10, 13, { w: 2 * T, h: 14, period: 2.2, duty: 0.6, phase: 0.6 }),
      O("blade", 12, 12, { x2: 20 * T, y2: 12 * T, speed: 105 }),
      O("rock", 14, 3, {}), O("rock", 21, 3, {}),
      O("gem", 7, 24, {}), O("gem", 22, 18, {}), O("gem", 14, 9, {}), O("gem", 24, 6, {}),
      O("portal", 21, 5, { w: 2 * T, h: 2 * T }),
    ],
  });

  push1({
    id: 10, name: "The Long Climb", teaches: "Everything so far", tier: "extreme",
    cols: 30, rows: 38,
    hint: "A tower of every trick you know. Climb it together — the portal waits at the very top.",
    build: (g) => {
      // --- ground floor: cargo plates open the way up ---
      box(g, 12, 33, 15, 33, 2);
      // --- lower tower: zig-zag ledges (3-tile steps) ---
      box(g, 19, 31, 25, 31, 2);
      box(g, 12, 28, 18, 28, 2);
      box(g, 4, 25, 10, 25, 2);
      // --- middle: boost perch + crumbling run ---
      box(g, 6, 22, 7, 23, 2);                 // 2-tall pedestal
      box(g, 9, 17, 14, 17, 2);                // boost-only perch
      box(g, 17, 20, 23, 20, 2);
      // --- upper tower ---
      box(g, 20, 14, 26, 14, 2);
      box(g, 13, 11, 19, 11, 2);
      box(g, 4, 8, 11, 8, 2);
      box(g, 14, 5, 24, 5, 2);                 // summit shelf
    },
    spawns: [spawn(3, 34), spawn(4, 34)],
    objects: [
      // 1) two crates on two plates open the tower door
      O("crate", 6, 35, { heavy: false }),
      O("crate", 8, 35, { heavy: false }),
      O("button", 16, 35, { channel: "g1", w: T, h: 10, y: 36 * T - 10 }),
      O("button", 18, 35, { channel: "g1b", w: T, h: 10, y: 36 * T - 10 }),
      H10.wall(20, 32, 4, { channels: ["g1", "g1b"] }),
      // 2) timing: vanishing and crumbling steps
      O("crumble", 16, 25, { w: 2 * T, h: 14 }),
      O("blink", 11, 22, { w: 2 * T, h: 14, period: 2.2, duty: 0.6, phase: 0 }),
      O("blink", 15, 14, { w: 2 * T, h: 14, period: 2.2, duty: 0.6, phase: 1.1 }),
      // 3) the boost-only lever unseals the summit
      O("switch", 11, 16, { channel: "g2", w: 22, h: 28, y: 17 * T - 28 }),
      H10.wall(19, 5, 3, { channel: "g2", color: "blue" }),
      // 4) Nibihah's hidden symbol powers the portal itself
      O("secret", 8, 7, { channel: "g3", w: 24, h: 24, y: 8 * T - 24 }),
      // hazards throughout
      O("blade", 13, 30, { x2: 24 * T, y2: 30 * T, speed: 105 }),
      O("blade", 15, 13, { x2: 25 * T, y2: 13 * T, speed: 115 }),
      O("crusher", 22, 21, { travel: 5 * T, axis: "y", period: 2.6 }),
      O("rock", 10, 12, {}), O("rock", 22, 9, {}),
      O("gem", 22, 30, {}), O("gem", 12, 16, {}), O("gem", 24, 13, {}), O("gem", 6, 7, {}),
      O("portal", 18, 3, { w: 2 * T, h: 2 * T, channels: ["g3"] }),
    ],
  });

  /* =====================================================================
   * CHAPTER 2 — WRECKED RUINS (levels 11–25)
   * Theme: discovering the past. Mirrors, lasers, gears, time switches,
   * elevators and weighted mechanisms, over collapsing vertical ruins.
   * ===================================================================== */
  const CH2 = [];
  const push2 = (def) => CH2.push(Object.assign({ chapter: 2, theme: "ruins", biome: "Wrecked Ruins" }, def));
  const V17 = dims(28, 30), V19 = dims(26, 32), V21 = dims(28, 30),
        V23 = dims(30, 30), V25 = dims(30, 36);

  push2({
    id: 11, name: "Fallen Steps", teaches: "Elevators", tier: "medium",
    hint: "The old temple has fallen in. Ride the lift — and don't trust the brittle stone.",
    build: (g) => {
      box(g, 6, 13, 9, 13, 2); box(g, 13, 10, 16, 10, 2);
      box(g, 22, 7, 30, 7, 2);                 // upper gallery
      box(g, 33, FLOOR, 34, ROWS - 1, 0);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crumble", 10, 12, { w: 2 * T, h: 14 }),
      O("platform", 19, 14, { w: 3 * T, h: 14, x2: 19 * T, y2: 8 * T, speed: 58 }),
      spikes(33, 2),
      O("gem", 7, 12, {}), O("gem", 14, 9, {}), O("gem", 29, 6, {}),
      O("portal", 25, 5, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 12, name: "The Mural", teaches: "Lasers & mirrors", tier: "medium",
    hint: "A mural of the Heart Engine — and the beams that guard it. Kill the light, then climb.",
    build: (g) => {
      box(g, 10, 13, 13, 13, 2);
      box(g, 24, 12, 28, 12, 2); box(g, 31, 9, 37, 9, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("switch", 6, 15, { channel: "b1", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      O("laser", 17, 1, { dir: "down", channel: "b1", invert: true, w: T, h: T }),
      gate(20, { channel: "b1", color: "blue" }),
      // a reflected beam high overhead — the ruins still remember their light
      O("laser", 8, 2, { dir: "right", w: T, h: T }),
      O("mirror", 33, 2, { orient: "/", w: T, h: T }),
      O("gem", 12, 12, {}), O("gem", 26, 11, {}), O("gem", 36, 8, {}),
      O("portal", 33, 7, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 13, name: "The Broken Bridge", teaches: "Building & separation", tier: "medium",
    hint: "The span is gone. Nibihah opens the workshop; Nichols rebuilds the crossing.",
    build: (g) => {
      box(g, 14, FLOOR, 18, ROWS - 1, 0);      // the collapsed span
      box(g, 6, 11, 10, 11, 2);                // high ledge — Nibihah only
      box(g, 28, 12, 33, 12, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("switch", 8, 10, { channel: "shop", colorLock: "green", w: 22, h: 28, y: 11 * T - 28 }),
      gate(12, { channel: "shop", color: "green" }),
      O("bridge", 13, 14, { span: 5, lifetime: 12 }),   // Nichols rebuilds it
      spikes(14, 5),
      O("gem", 9, 10, {}), O("gem", 21, 14, {}), O("gem", 32, 11, {}),
      O("portal", 30, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 14, name: "Time Locked", teaches: "Time switches", tier: "medium",
    hint: "Clockwork levers only hold for a few seconds. Throw one — then BOTH of you run.",
    build: (g) => { box(g, 20, 13, 24, 13, 2); box(g, 30, 10, 36, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("timeswitch", 6, 15, { channel: "t1", duration: 6, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      gate(13, { channel: "t1" }),
      O("timeswitch", 18, 15, { channel: "t2", duration: 7, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      gate(27, { channel: "t2" }),
      O("gem", 15, 14, {}), O("gem", 22, 12, {}), O("gem", 35, 9, {}),
      O("portal", 32, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 15, name: "The Weighing Hall", teaches: "Weighted mechanisms", tier: "medium",
    hint: "Three scales, three stones. Only cargo counts — your own weight means nothing here.",
    build: (g) => { box(g, 26, 13, 30, 13, 2); box(g, 33, 10, 38, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crate", 4, 15, {}), O("crate", 6, 15, {}), O("crate", 8, 15, {}),
      O("button", 12, 15, { channel: "a", needsCrate: true, w: T, h: 10, y: FLOOR_TOP - 10 }),
      O("button", 15, 15, { channel: "b", needsCrate: true, w: T, h: 10, y: FLOOR_TOP - 10 }),
      O("button", 18, 15, { channel: "c", needsCrate: true, w: T, h: 10, y: FLOOR_TOP - 10 }),
      gate(23, { channels: ["a", "b", "c"] }),
      O("gem", 10, 14, {}), O("gem", 28, 12, {}), O("gem", 37, 9, {}),
      O("portal", 34, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 16, name: "Gear Works", teaches: "Rotating platforms", tier: "medium",
    hint: "The old machine still turns. Ride the arms across — mind the drop.",
    build: (g) => {
      box(g, 10, FLOOR, 26, ROWS - 1, 0);      // machine pit
      box(g, 30, 12, 37, 12, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 17),
      O("rotor", 13, 12, { radius: 3 * T, rate: 0.75, w: 2 * T, h: 14, phase: 3.14 }),
      O("rotor", 22, 12, { radius: 3 * T, rate: -0.75, w: 2 * T, h: 14, phase: 0 }),
      O("gem", 13, 8, {}), O("gem", 22, 8, {}), O("gem", 36, 11, {}),
      O("portal", 32, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 17, name: "The Forgotten Library", teaches: "Vertical secrets", tier: "hard",
    cols: 28, rows: 30,
    hint: "Shelves reaching into the dark. Nibihah's eyes find the steps others cannot see.",
    build: (g) => {
      box(g, 3, 25, 9, 25, 2); box(g, 12, 22, 18, 22, 2); box(g, 19, 19, 25, 19, 2);
      box(g, 10, 16, 16, 16, 2); box(g, 3, 13, 9, 13, 2); box(g, 14, 10, 22, 10, 2);
      box(g, 6, 7, 14, 7, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("hidden", 10, 25, { w: 2 * T, h: 12 }),
      O("hidden", 19, 16, { w: 2 * T, h: 12 }),
      O("hidden", 10, 10, { w: 2 * T, h: 12 }),
      O("secret", 21, 18, { channel: "s1", w: 24, h: 24, y: 19 * T - 24 }),
      O("blade", 5, 24, { x2: 8 * T, y2: 24 * T, speed: 80 }),
      O("gem", 6, 24, {}), O("gem", 16, 15, {}), O("gem", 20, 9, {}),
      O("portal", 9, 5, { w: 2 * T, h: 2 * T, channels: ["s1"] }),
    ],
  });

  push2({
    id: 18, name: "The Laser Gallery", teaches: "Blocking beams", tier: "hard",
    hint: "Two beams bar the gallery. One dies by lever — the other needs a stone in its path.",
    build: (g) => { box(g, 22, 13, 26, 13, 2); box(g, 31, 10, 37, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crate", 6, 15, {}),
      O("switch", 9, 15, { channel: "l1", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      O("laser", 14, 1, { dir: "down", channel: "l1", invert: true, w: T, h: T }),
      // this beam has no lever — park a crate under it to break the light
      O("laser", 19, 1, { dir: "down", w: T, h: T }),
      O("button", 19, 15, { channel: "g", needsCrate: true, w: T, h: 10, y: FLOOR_TOP - 10 }),
      gate(29, { channel: "g" }),
      O("gem", 12, 14, {}), O("gem", 24, 12, {}), O("gem", 36, 9, {}),
      O("portal", 33, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 19, name: "The Long Elevator", teaches: "Lifts under fire", tier: "hard",
    cols: 26, rows: 32,
    hint: "One lift, a long shaft, and machinery that has forgotten you are fragile.",
    build: (g) => {
      box(g, 3, 27, 8, 27, 2); box(g, 16, 24, 22, 24, 2);
      box(g, 3, 18, 9, 18, 2); box(g, 15, 14, 22, 14, 2); box(g, 5, 9, 13, 9, 2);
    },
    spawns: [spawn(3, 28), spawn(4, 28)],
    objects: [
      O("platform", 11, 27, { w: 3 * T, h: 14, x2: 11 * T, y2: 19 * T, speed: 62 }),
      O("platform", 12, 18, { w: 3 * T, h: 14, x2: 12 * T, y2: 10 * T, speed: 55 }),
      O("crusher", 18, 20, { travel: 3 * T, axis: "y", period: 2.4 }),
      O("blade", 5, 17, { x2: 9 * T, y2: 17 * T, speed: 95 }),
      O("crumble", 20, 21, { w: 2 * T, h: 14 }),
      O("gem", 6, 26, {}), O("gem", 19, 23, {}), O("gem", 11, 8, {}),
      O("portal", 8, 7, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 20, name: "The Hall of Statues", teaches: "Shoulder boost", tier: "hard",
    hint: "The watcher's alcove is out of reach for either of you alone. One of you must lift the other.",
    build: (g) => {
      // A sealed alcove whose ONLY standable surfaces are the floor, one
      // pedestal and one perch — and the perch is offset from the pedestal so
      // you jump up *beside* it, not into its underside. The gap is tuned so a
      // solo double jump falls short but a shoulder boost just clears it.
      box(g, 18, 5, 18, 13, 2);                // left wall (doorway open below)
      box(g, 30, 5, 30, 15, 2);                // right wall
      box(g, 21, 14, 22, 15, 2);               // 2-tall pedestal
      box(g, 25, 8, 27, 8, 2);                 // perch — boost only
      box(g, 33, 12, 38, 12, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("switch", 26, 7, { channel: "watch", boost: true, w: 22, h: 28, y: 8 * T - 28 }),
      gate(32, { channel: "watch" }),
      O("gem", 27, 7, {}), O("gem", 12, 14, {}), O("gem", 37, 11, {}),
      O("portal", 34, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 21, name: "The Collapsing Archive", teaches: "Nothing holds", tier: "hard",
    cols: 28, rows: 30,
    hint: "Keep climbing. The moment you stop, the floor stops with you.",
    build: (g) => {
      box(g, 3, 26, 8, 26, 2); box(g, 21, 20, 25, 20, 2);
      box(g, 4, 14, 9, 14, 2); box(g, 18, 8, 25, 8, 2);
    },
    spawns: [spawn(3, 27), spawn(4, 27)],
    objects: [
      O("crumble", 10, 25, { w: 2 * T, h: 14 }), O("crumble", 14, 23, { w: 2 * T, h: 14 }),
      O("crumble", 18, 22, { w: 2 * T, h: 14 }),
      O("blink", 17, 17, { w: 2 * T, h: 14, period: 2.2, duty: 0.6 }),
      O("blink", 13, 17, { w: 2 * T, h: 14, period: 2.2, duty: 0.6, phase: 1.1 }),
      O("crumble", 12, 11, { w: 2 * T, h: 14 }), O("crumble", 15, 11, { w: 2 * T, h: 14 }),
      O("rock", 8, 4, {}), O("rock", 20, 4, {}),
      O("gem", 6, 25, {}), O("gem", 23, 19, {}), O("gem", 23, 7, {}),
      O("portal", 21, 6, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 22, name: "The Laboratory", teaches: "Repair & grapple", tier: "hard",
    hint: "Dead machines everywhere. Nichols can wake them — some levers only answer to his hook.",
    build: (g) => { box(g, 16, 12, 20, 12, 2); box(g, 31, 11, 37, 11, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("repair", 6, 15, { channel: "power", y: FLOOR_TOP - 30 }),
      gate(11, { channel: "power", color: "blue" }),
      O("grapple", 24, 15, { channel: "hook", w: 22, h: 28, y: FLOOR_TOP - 28, range: 220 }),
      gate(28, { channel: "hook", color: "blue" }),
      O("crusher", 14, 2, { travel: 9 * T, axis: "y", period: 2.6 }),
      O("gem", 18, 11, {}), O("gem", 21, 14, {}), O("gem", 36, 10, {}),
      O("portal", 33, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 23, name: "Twin Towers", teaches: "Wall-jump shafts", tier: "hard",
    cols: 30, rows: 30,
    hint: "Two chimneys, two keys. Bounce between the walls — there is nothing else to stand on.",
    build: (g) => {
      // left chimney
      box(g, 4, 10, 8, 10, 2); box(g, 4, 11, 4, 25, 2); box(g, 8, 11, 8, 25, 2);
      // right chimney
      box(g, 16, 10, 20, 10, 2); box(g, 16, 11, 16, 25, 2); box(g, 20, 11, 20, 25, 2);
      // the climb to the portal, past the locks
      box(g, 23, 24, 27, 24, 2); box(g, 22, 21, 26, 21, 2); box(g, 23, 18, 28, 18, 2);
      box(g, 21, 15, 27, 15, 2); box(g, 22, 12, 28, 12, 2);
    },
    spawns: [spawn(2, 25), spawn(3, 25)],
    objects: [
      O("key", 6, 11, { color: "gold" }),
      O("key", 18, 11, { color: "gold" }),
      V23.lockGate(12, { color: "gold" }),
      V23.lockGate(22, { color: "gold" }),
      O("gem", 6, 20, {}), O("gem", 18, 20, {}), O("gem", 26, 11, {}),
      O("portal", 24, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push2({
    id: 24, name: "The Vault", teaches: "Everything the ruins taught", tier: "hard",
    hint: "The shard is close. Beams, scales, clockwork and stone — all of it at once.",
    build: (g) => { box(g, 12, 13, 15, 13, 2); box(g, 24, 12, 28, 12, 2); box(g, 32, 9, 38, 9, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crate", 5, 15, {}), O("crate", 7, 15, {}),
      O("button", 10, 15, { channel: "a", needsCrate: true, w: T, h: 10, y: FLOOR_TOP - 10 }),
      O("timeswitch", 17, 15, { channel: "t", duration: 8, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      gate(20, { channels: ["a", "t"] }),
      O("laser", 23, 1, { dir: "down", channel: "l", invert: true, w: T, h: T }),
      O("switch", 21, 15, { channel: "l", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      O("blade", 25, 15, { x2: 30 * T, y2: 15 * T, speed: 100 }),
      O("secret", 26, 11, { channel: "s", w: 24, h: 24, y: 12 * T - 24 }),
      O("gem", 14, 12, {}), O("gem", 27, 11, {}), O("gem", 37, 8, {}),
      O("portal", 34, 7, { w: 2 * T, h: 2 * T, channels: ["s"] }),
    ],
  });

  push2({
    id: 25, name: "The Theft", teaches: "The ruins fall", tier: "extreme",
    cols: 30, rows: 36,
    hint: "Grab the shard and climb. Do not look back — the ruins are coming down behind you.",
    build: (g) => {
      box(g, 3, 31, 9, 31, 2); box(g, 14, 28, 20, 28, 2); box(g, 21, 25, 27, 25, 2);
      box(g, 12, 22, 18, 22, 2); box(g, 3, 19, 9, 19, 2); box(g, 13, 16, 19, 16, 2);
      box(g, 20, 13, 26, 13, 2); box(g, 8, 10, 16, 10, 2); box(g, 18, 6, 27, 6, 2);
    },
    spawns: [spawn(3, 32), spawn(4, 32)],
    objects: [
      O("crumble", 11, 30, { w: 2 * T, h: 14 }),
      O("blink", 11, 26, { w: 2 * T, h: 14, period: 2.2, duty: 0.6 }),
      O("crumble", 19, 20, { w: 2 * T, h: 14 }),
      O("blink", 10, 17, { w: 2 * T, h: 14, period: 2, duty: 0.6, phase: 1 }),
      O("rotor", 22, 19, { radius: 3 * T, rate: 0.8, w: 2 * T, h: 14 }),
      O("timeswitch", 15, 15, { channel: "esc", duration: 9, w: 24, h: 30, y: 16 * T - 30 }),
      V25.wall(17, 6, 4, { channel: "esc" }),
      O("blade", 14, 27, { x2: 20 * T, y2: 27 * T, speed: 110 }),
      O("crusher", 24, 14, { travel: 4 * T, axis: "y", period: 2.4 }),
      O("rock", 12, 12, {}), O("rock", 22, 8, {}),
      O("gem", 6, 30, {}), O("gem", 24, 24, {}), O("gem", 15, 15, {}), O("gem", 25, 5, {}),
      O("portal", 22, 4, { w: 2 * T, h: 2 * T }),
    ],
  });

  // Chapter-1 levels come first in the campaign; the older prototypes are kept
  // as a bonus "vault" so no work is lost.
  const ALL = CH1.concat(CH2, LEVELS);

  /* ---- Chapter metadata (6 chapters / 70 slots) ------------------------ */
  GG.CHAPTERS = [
    { id: 1, name: "Underground Caves", theme: "cave",    from: 1,  to: 10, built: true,
      blurb: "Learning cooperation in the mines and crystal caverns." },
    { id: 2, name: "Wrecked Ruins",     theme: "ruins",   from: 11, to: 25, built: true,
      blurb: "Mirrors, lasers, gears and the truth about the Heart Engine." },
    { id: 3, name: "Enchanted Forest",  theme: "jungle",  from: 26, to: 40, built: false,
      blurb: "Vines, currents and wind — nature tests the heroes." },
    { id: 4, name: "The Great Temple",  theme: "temple",  from: 41, to: 50, built: false,
      blurb: "Trials of wisdom: gravity, rotating rooms and logic." },
    { id: 5, name: "Temple in the Sky", theme: "city",    from: 51, to: 60, built: false,
      blurb: "Wind, low gravity and light bridges among floating islands." },
    { id: 6, name: "The Heavens",       theme: "heart",   from: 61, to: 70, built: false,
      blurb: "Every mechanic combined — and the Guardian's final trial." },
  ];

  // Compile: build each level's tile grid from its own `build` function,
  // at that level's own dimensions (levels may be tall towers).
  GG.LEVELS = ALL.map((lvl) => {
    const cols = lvl.cols || COLS, rows = lvl.rows || ROWS;
    const g = [];
    for (let r = 0; r < rows; r++) g.push(new Array(cols).fill(0));
    // frame: ceiling, side walls, floor
    for (let c = 0; c < cols; c++) g[0][c] = 2;
    for (let r = 0; r < rows; r++) { g[r][0] = 2; g[r][cols - 1] = 2; }
    for (let r = rows - 2; r < rows; r++) for (let c = 0; c < cols; c++) g[r][c] = 1;
    if (typeof lvl.build === "function") lvl.build(g, dims(cols, rows));
    else LEGACY_BUILD(g, lvl.id);
    return Object.assign({}, lvl, { tiles: g });
  });

  // Tile layouts for the retained prototype levels (ids 101-107).
  function LEGACY_BUILD(g, id) {
    switch (id) {
      case 101: box(g, 18, 13, 21, 13, 2); box(g, 27, 14, 29, 14, 1); break;
      case 102: box(g, 24, 12, 27, 12, 2); break;
      case 103: box(g, 20, 13, 24, 13, 2); break;
      case 104:
        box(g, 10, FLOOR, 20, ROWS - 1, 0);
        box(g, 4, FLOOR, 9, FLOOR, 3);
        box(g, 26, FLOOR, 30, FLOOR, 5);
        box(g, 31, 13, 34, 13, 4);
        break;
      case 105: box(g, 11, 8, 13, 8, 2); break;
      case 106:
        box(g, 19, 9, 24, 9, 2);
        box(g, 14, FLOOR, 14, ROWS - 1, 0);
        box(g, 30, 12, 32, 12, 7);
        box(g, 34, 10, 36, 10, 7);
        break;
      case 107: box(g, 12, 10, 16, 10, 2); break;
    }
  }

  // The campaign is the ordered list of story levels that are actually built.
  GG.CAMPAIGN = GG.LEVELS.filter(l => l.chapter && l.chapter > 0).map(l => l.id);
  GG.VAULT = GG.LEVELS.filter(l => l.chapter === 0).map(l => l.id);
  GG.LEVEL_COUNT = GG.CAMPAIGN.length;
  GG.TOTAL_PLANNED = 70;
})(window);
