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
      hint: "Green mechanisms obey Nichols; blue obey Nibihah. Open each other's doors to advance.",
      spawns: [spawn(2, 14), spawn(3, 14)],
      objects: [
        // Only Circuit can flip the blue switch -> opens the GREEN door for Bloom.
        O("switch", 5, 15, { channel: "gdoor", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        O("door", 8, 14, { channel: "gdoor", color: "blue", w: T, h: 2 * T }),
        // Only Bloom can flip the green switch -> opens the BLUE door for Circuit.
        O("switch", 11, 15, { channel: "bdoor", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        O("door", 15, 14, { channel: "bdoor", color: "green", w: T, h: 2 * T }),
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
        O("switch", 16, 15, { channel: "beam1off", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        // Beam 2 (vertical chokepoint) — only BLOOM's green switch disables it,
        // and the switch sits PAST beam 1, so Circuit must clear beam 1 first.
        O("laser", 26, 1, { dir: "down", w: T, h: T, channel: "beam2off", invert: true }),
        O("switch", 23, 15, { channel: "beam2off", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        // Safe demonstrative reflecting beam near the ceiling (mirror bends it).
        O("laser", 7, 2, { dir: "right", w: T, h: T }),
        O("mirror", 30, 2, { orient: "/", w: T, h: T }),
        // Teleporter: warp up to a hidden bonus gem ledge (self-contained).
        O("teleporter", 5, 15, { id: 900, pair: 901, color: "blue", w: T, h: T }),
        O("teleporter", 12, 7, { id: 901, pair: 900, color: "blue", w: T, h: T }),
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
        O("door", 10, 14, { channel: "power", color: "green", w: T, h: 2 * T }),
        // A Lyra-only narrow passage guarding a bonus gem in a pocket.
        O("narrow", 14, 15, { w: T, h: T }),
        O("gem", 14, 16, {}),
        // High ledge with the green switch — reach it via a head-stack + double jump.
        O("switch", 21, 8, { channel: "exitgate", colorLock: "blue", w: 22, h: 28, y: 9 * T - 28 }),
        O("door", 27, 14, { channel: "exitgate", color: "blue", w: T, h: 2 * T }),
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
        O("switch", 6, 15, { channel: "beamA", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
        O("laser", 18, 1, { dir: "down", channel: "beamA", invert: true, w: T, h: T }),
        // Guardian beam B — only Lyra's green switch (up on the ledge) disables it.
        O("switch", 14, 9, { channel: "beamB", colorLock: "blue", w: 22, h: 28, y: 10 * T - 28 }),
        O("laser", 22, 1, { dir: "down", channel: "beamB", invert: true, w: T, h: T }),
        // Teleporter warps Lyra up to the ledge for beam B's switch.
        O("teleporter", 5, 15, { id: 920, pair: 921, color: "blue", w: T, h: T }),
        O("teleporter", 12, 9, { id: 921, pair: 920, color: "blue", w: T, h: T }),
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
    hint: "Green levers obey Nichols, blue obey Nibihah — the last gate needs BOTH left on. Time the crushers.",
    tier: "medium",
    build: (g) => {
      box(g, 22, FLOOR, 24, ROWS - 1, 0);     // spike pit before the final gate
      box(g, 17, 14, 19, 14, 1);
      box(g, 31, 13, 32, 13, 2);              // step
      box(g, 34, 10, 38, 10, 2);              // portal shelf
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("switch", 6, 15, { channel: "A", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      gate(11, { channel: "A", color: "green" }),
      O("crusher", 14, 2, { travel: 10 * T, axis: "y", period: 2.8, phase: 0 }),
      O("switch", 16, 15, { channel: "B", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      gate(21, { channel: "B", color: "blue" }),
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
      H6.wall(17, 8, 3, { channel: "top", color: "green" }),
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
      H10.wall(19, 5, 3, { channel: "g2", color: "green" }),
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
    id: 11, name: "Fallen Steps", teaches: "Swinging & elevators", tier: "medium",
    hint: "Glowing rings answer to Nibihah — press SPECIAL beneath one to swing. Nichols rides the lift.",
    build: (g) => {
      box(g, 6, 13, 9, 13, 2); box(g, 13, 10, 16, 10, 2);
      box(g, 22, 7, 30, 7, 2);                 // upper gallery
      box(g, 33, FLOOR, 34, ROWS - 1, 0);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("crumble", 10, 12, { w: 2 * T, h: 14 }),
      O("platform", 19, 14, { w: 3 * T, h: 14, x2: 19 * T, y2: 8 * T, speed: 58 }),
      // Nibihah's route: a chain of swing rings up to the gallery
      O("anchor", 12, 6, { w: 18, h: 18 }),
      O("anchor", 18, 4, { w: 18, h: 18 }),
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
      O("switch", 6, 15, { channel: "b1", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
      O("laser", 17, 1, { dir: "down", channel: "b1", invert: true, w: T, h: T }),
      gate(20, { channel: "b1", color: "green" }),
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
      O("switch", 8, 10, { channel: "shop", colorLock: "blue", w: 22, h: 28, y: 11 * T - 28 }),
      gate(12, { channel: "shop", color: "blue" }),
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
      O("crate", 4, 15, {}), O("crate", 6, 15, {}),
      // the third stone answers only to Nichols' MIND — grab it with SPECIAL
      O("telecube", 8, 15, { kind: "free" }),
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
      O("switch", 9, 15, { channel: "l1", colorLock: "green", w: 22, h: 28, y: FLOOR_TOP - 28 }),
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
      gate(11, { channel: "power", color: "green" }),
      O("grapple", 24, 15, { channel: "hook", w: 22, h: 28, y: FLOOR_TOP - 28, range: 220 }),
      gate(28, { channel: "hook", color: "green" }),
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
      O("switch", 21, 15, { channel: "l", colorLock: "blue", w: 22, h: 28, y: FLOOR_TOP - 28 }),
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
      // swing rings shortcut the climb while the ruins fall
      O("anchor", 8, 24, { w: 18, h: 18 }), O("anchor", 16, 12, { w: 18, h: 18 }),
      O("portal", 22, 4, { w: 2 * T, h: 2 * T }),
    ],
  });

  /* =====================================================================
   * CHAPTER 3 — ENCHANTED FOREST (levels 26–40)
   * Patterns, wind, synchronized movement, melting footing — nature tests
   * whether the heroes can truly move as one.
   * ===================================================================== */
  const CH3 = [];
  const push3 = (def) => CH3.push(Object.assign({ chapter: 3, theme: "jungle", biome: "Enchanted Forest" }, def));
  const F38 = dims(26, 30), F40 = dims(30, 34);

  push3({
    id: 26, name: "Whispering Runes", teaches: "Rune sequences", tier: "medium",
    hint: "The forest speaks in numbered runes. Step on them IN ORDER — a wrong step silences the song.",
    build: (g) => { box(g, 28, 12, 34, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("runeseq", 12, 15, { channel: "song", pads: [
        { x: 8 * T, y: FLOOR_TOP - 4 }, { x: 14 * T, y: FLOOR_TOP - 4 }, { x: 11 * T, y: FLOOR_TOP - 4 },
      ] }),
      gate(20, { channel: "song" }),
      O("gem", 10, 14, {}), O("gem", 24, 14, {}), O("gem", 33, 11, {}),
      O("portal", 30, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 27, name: "Echoed Song", teaches: "Split rune verses", tier: "medium",
    hint: "Two verses, one song: green runes obey Nichols, blue obey Nibihah. Sing both to open the way.",
    build: (g) => { box(g, 30, 11, 36, 11, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("runeseq", 8, 15, { channel: "vA", pads: [
        { x: 6 * T, y: FLOOR_TOP - 4, who: "green" }, { x: 10 * T, y: FLOOR_TOP - 4, who: "green" },
      ] }),
      O("runeseq", 15, 15, { channel: "vB", pads: [
        { x: 14 * T, y: FLOOR_TOP - 4, who: "blue" }, { x: 18 * T, y: FLOOR_TOP - 4, who: "blue" },
      ] }),
      gate(23, { channels: ["vA", "vB"] }),
      O("blade", 25, 15, { x2: 28 * T, y2: 15 * T, speed: 80 }),
      O("gem", 12, 14, {}), O("gem", 26, 14, {}), O("gem", 35, 10, {}),
      O("portal", 32, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 28, name: "The Divided Verse", teaches: "Mixed sequences", tier: "hard",
    hint: "One song, five runes, two singers — call the order aloud or the verse resets.",
    build: (g) => { box(g, 12, 13, 15, 13, 2); box(g, 30, 10, 36, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("runeseq", 10, 15, { channel: "verse", pads: [
        { x: 6 * T, y: FLOOR_TOP - 4, who: "green" }, { x: 13 * T, y: 13 * T - 4, who: "blue" },
        { x: 9 * T, y: FLOOR_TOP - 4, who: "blue" }, { x: 17 * T, y: FLOOR_TOP - 4, who: "green" },
        { x: 21 * T, y: FLOOR_TOP - 4 },
      ] }),
      gate(25, { channel: "verse" }),
      O("gem", 14, 12, {}), O("gem", 27, 14, {}), O("gem", 35, 9, {}),
      O("portal", 32, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 29, name: "The First Gale", teaches: "Wind & bracing", tier: "medium",
    hint: "When the gale howls, CROUCH to brace — or be swept into the thorns. Move between gusts.",
    build: (g) => { box(g, 26, 12, 32, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("wind", 8, 4, { w: 14 * T, h: 12 * T, dir: 1, push: 300, period: 4, blow: 1.6 }),
      spikes(23, 2, 15), // thorn patch at the gust's end
      O("gem", 12, 14, {}), O("gem", 28, 11, {}), O("gem", 34, 14, {}),
      O("portal", 28, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 30, name: "Gale Crossing", teaches: "Swinging the storm", tier: "hard",
    hint: "The canyon wind never fully rests. Nibihah swings the gaps; Nichols crosses when the gale sleeps.",
    build: (g) => {
      box(g, 10, FLOOR, 15, ROWS - 1, 0); box(g, 20, FLOOR, 25, ROWS - 1, 0);
      box(g, 16, 14, 19, 14, 1); box(g, 30, 12, 36, 12, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 6), spikes(20, 6),
      O("anchor", 12, 8, { w: 18, h: 18 }), O("anchor", 22, 8, { w: 18, h: 18 }),
      O("wind", 9, 4, { w: 18 * T, h: 11 * T, dir: -1, push: 240, period: 5, blow: 2 }),
      O("gem", 17, 13, {}), O("gem", 27, 14, {}), O("gem", 35, 11, {}),
      O("portal", 32, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 31, name: "Shelter Stone", teaches: "Telekinetic shielding", tier: "hard",
    hint: "The old stone breaks the wind wherever it rests. Nichols carries it with his mind; Nibihah runs in its calm.",
    build: (g) => { box(g, 28, 12, 34, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("telecube", 5, 15, { kind: "free" }),
      O("wind", 10, 3, { w: 12 * T, h: 13 * T, dir: 1, push: 340, period: 3.4, blow: 2.2 }),
      O("button", 18, 15, { channel: "g", needsCrate: true, w: T, h: 10, y: FLOOR_TOP - 10 }),
      gate(24, { channel: "g" }),
      O("gem", 13, 14, {}), O("gem", 26, 14, {}), O("gem", 33, 11, {}),
      O("portal", 30, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 32, name: "In Step", teaches: "Tandem plates", tier: "medium",
    hint: "Twin plates, far apart, pressed in the same breath — the lift only rises while you stand together.",
    build: (g) => { box(g, 24, 8, 31, 8, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("tandem", 6, 15, { channel: "step", bx: 16 * T, by: FLOOR_TOP, w: T, h: 10, y: FLOOR_TOP - 10 }),
      O("platform", 20, 14, { w: 3 * T, h: 14, x2: 20 * T, y2: 9 * T, speed: 62, channel: "step" }),
      O("gem", 11, 14, {}), O("gem", 26, 7, {}), O("gem", 30, 7, {}),
      O("portal", 27, 6, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 33, name: "Bound by Light", teaches: "The tether", tier: "hard",
    hint: "In the deep grove an aether thread binds you. Drift too far apart and it SNAPS. Move as one.",
    build: (g) => { box(g, 14, 12, 17, 12, 2); box(g, 22, 13, 25, 13, 2); box(g, 30, 11, 36, 11, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("tether", 8, 2, { w: 24 * T, h: 14 * T, maxDist: 200 }),
      O("blade", 12, 15, { x2: 20 * T, y2: 15 * T, speed: 90 }),
      O("gem", 15, 11, {}), O("gem", 23, 12, {}), O("gem", 35, 10, {}),
      O("portal", 32, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 34, name: "The Split Path", teaches: "Delayed doors", tier: "hard",
    hint: "The clockwork lever gives you seconds, and the tandem plates give you one chance. Plan it out loud.",
    build: (g) => { box(g, 20, 13, 23, 13, 2); box(g, 31, 10, 37, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("timeswitch", 6, 15, { channel: "t", duration: 5.5, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      gate(12, { channel: "t" }),
      O("tandem", 15, 15, { channel: "s", bx: 21 * T, by: 13 * T, w: T, h: 10, y: FLOOR_TOP - 10 }),
      gate(27, { channel: "s" }),
      O("gem", 14, 14, {}), O("gem", 22, 12, {}), O("gem", 36, 9, {}),
      O("portal", 33, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 35, name: "Windwall Gorge", teaches: "Everything the wind taught", tier: "hard",
    hint: "Gusts, thorns and one patient stone. Shield the crossing, brace the gale, swing the last gap — together.",
    build: (g) => {
      box(g, 12, FLOOR, 16, ROWS - 1, 0); box(g, 24, FLOOR, 27, ROWS - 1, 0);
      box(g, 17, 14, 20, 14, 1); box(g, 31, 9, 37, 9, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(12, 5), spikes(24, 4),
      O("telecube", 5, 15, { kind: "free" }),
      O("wind", 8, 3, { w: 13 * T, h: 13 * T, dir: 1, push: 300, period: 4, blow: 1.8 }),
      O("wind", 22, 3, { w: 8 * T, h: 13 * T, dir: -1, push: 300, period: 4, blow: 1.8, phase: 2 }),
      O("anchor", 25, 7, { w: 18, h: 18 }),
      O("tandem", 29, 8, { channel: "end", bx: 35 * T, by: 9 * T, w: T, h: 10, y: 9 * T - 10 }),
      O("gem", 18, 13, {}), O("gem", 22, 14, {}), O("gem", 36, 8, {}),
      O("portal", 33, 7, { w: 2 * T, h: 2 * T, channels: ["end"] }),
    ],
  });

  push3({
    id: 36, name: "Meltwater", teaches: "Melting footing", tier: "hard",
    hint: "Spring ice over poison water. It melts the moment you stand on it — cross light, cross fast.",
    build: (g) => { box(g, 8, FLOOR, 30, ROWS - 1, 0); box(g, 32, 12, 37, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("hazard", 8, 16, { kind: "poison", w: 23 * T, h: 2 * T }),
      O("crumble", 9, 14, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("crumble", 13, 13, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("crumble", 17, 14, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("crumble", 21, 13, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("crumble", 25, 14, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("anchor", 19, 7, { w: 18, h: 18 }),
      O("gem", 14, 12, {}), O("gem", 22, 12, {}), O("gem", 36, 11, {}),
      O("portal", 34, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 37, name: "The Old Canopy", teaches: "Falling bridges", tier: "hard",
    hint: "The branches take one crossing each. The first hero over must find the switch that saves the second.",
    build: (g) => {
      box(g, 10, FLOOR, 22, ROWS - 1, 0);
      box(g, 23, 13, 26, 13, 2); box(g, 30, 10, 37, 10, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 12),
      O("crumble", 11, 14, { w: 2 * T, h: 14, respawn: 90 }),   // one crossing, then gone
      O("crumble", 15, 13, { w: 2 * T, h: 14, respawn: 90 }),
      O("crumble", 19, 14, { w: 2 * T, h: 14, respawn: 90 }),
      // the survivor's lever raises a lift for the partner left behind
      O("switch", 24, 12, { channel: "ferry", w: 22, h: 28, y: 13 * T - 28 }),
      O("platform", 10, 14, { w: 3 * T, h: 14, x2: 19 * T, y2: 14 * T, speed: 85, channel: "ferry" }),
      O("gem", 16, 12, {}), O("gem", 25, 12, {}), O("gem", 36, 9, {}),
      O("portal", 32, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push3({
    id: 38, name: "Roots and Sky", teaches: "The vertical forest", tier: "hard",
    cols: 26, rows: 30,
    hint: "A great tree, climbed together: rings for her, lifts for him, and a song at the crown.",
    build: (g) => {
      box(g, 3, 25, 8, 25, 2); box(g, 12, 22, 17, 22, 2); box(g, 4, 18, 9, 18, 2);
      box(g, 13, 14, 19, 14, 2); box(g, 5, 10, 12, 10, 2); box(g, 15, 7, 23, 7, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("platform", 20, 26, { w: 2 * T, h: 14, x2: 20 * T, y2: 15 * T, speed: 60 }),
      O("anchor", 11, 19, { w: 18, h: 18 }), O("anchor", 13, 11, { w: 18, h: 18 }),
      O("crumble", 10, 21, { w: 2 * T, h: 14 }),
      O("runeseq", 17, 6, { channel: "crown", pads: [
        { x: 16 * T, y: 7 * T - 4, who: "green" }, { x: 21 * T, y: 7 * T - 4, who: "blue" },
      ] }),
      O("gem", 6, 24, {}), O("gem", 15, 13, {}), O("gem", 8, 9, {}),
      O("portal", 19, 5, { w: 2 * T, h: 2 * T, channels: ["crown"] }),
    ],
  });

  push3({
    id: 39, name: "The Green Cathedral", teaches: "Integration", tier: "extreme",
    cols: 28, rows: 30,
    hint: "Wind in the vaults, thin ice, twin plates high above. Everything the forest taught — at once.",
    build: (g) => {
      box(g, 3, 25, 9, 25, 2); box(g, 14, 22, 20, 22, 2); box(g, 5, 18, 11, 18, 2);
      box(g, 16, 15, 22, 15, 2); box(g, 4, 11, 10, 11, 2); box(g, 14, 8, 24, 8, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("wind", 3, 9, { w: 22 * T, h: 12 * T, dir: 1, push: 250, period: 4.4, blow: 1.7 }),
      O("crumble", 11, 24, { w: 2 * T, h: 14, delay: 0.9 }),
      O("crumble", 12, 17, { w: 2 * T, h: 14, delay: 0.9 }),
      O("anchor", 13, 12, { w: 18, h: 18 }),
      O("blade", 15, 21, { x2: 19 * T, y2: 21 * T, speed: 95 }),
      O("tandem", 15, 8, { channel: "vault", bx: 22 * T, by: 8 * T, w: T, h: 10, y: 8 * T - 10 }),
      O("gem", 7, 24, {}), O("gem", 18, 14, {}), O("gem", 7, 10, {}),
      O("portal", 18, 6, { w: 2 * T, h: 2 * T, channels: ["vault"] }),
    ],
  });

  push3({
    id: 40, name: "The Guardian's Test", teaches: "Move as one", tier: "extreme",
    cols: 30, rows: 34,
    hint: "The Forest Guardian watches. Bound by the thread, sing the verse, hold the stone, stand together.",
    build: (g) => {
      box(g, 3, 29, 9, 29, 2); box(g, 13, 26, 19, 26, 2); box(g, 22, 23, 27, 23, 2);
      box(g, 12, 20, 18, 20, 2); box(g, 4, 17, 10, 17, 2); box(g, 14, 13, 20, 13, 2);
      box(g, 6, 10, 12, 10, 2); box(g, 16, 6, 26, 6, 2);
    },
    spawns: [spawn(3, 30), spawn(4, 30)],
    objects: [
      O("tether", 3, 8, { w: 26 * T, h: 24 * T, maxDist: 230 }),
      O("wind", 4, 8, { w: 20 * T, h: 10 * T, dir: -1, push: 260, period: 4.6, blow: 1.6 }),
      O("anchor", 11, 22, { w: 18, h: 18 }), O("anchor", 12, 8, { w: 18, h: 18 }),
      O("crumble", 20, 25, { w: 2 * T, h: 14, delay: 0.9 }),
      O("blade", 13, 19, { x2: 17 * T, y2: 19 * T, speed: 100 }),
      O("telecube", 5, 29, { kind: "free" }),
      O("button", 17, 13, { channel: "stone", needsCrate: true, w: 2 * T, h: 10, y: 13 * T - 10 }),
      O("runeseq", 18, 5, { channel: "song", pads: [
        { x: 17 * T, y: 6 * T - 4, who: "green" }, { x: 23 * T, y: 6 * T - 4, who: "blue" }, { x: 20 * T, y: 6 * T - 4 },
      ] }),
      O("gem", 6, 28, {}), O("gem", 24, 22, {}), O("gem", 8, 16, {}), O("gem", 25, 5, {}),
      O("portal", 20, 4, { w: 2 * T, h: 2 * T, channels: ["stone", "song"] }),
    ],
  });

  /* =====================================================================
   * CHAPTER 4 — THE GREAT TEMPLE (levels 41–50)
   * Trials of wisdom: counterweights, a rationed energy pool, and power
   * cells ferried through the heroes' own weaknesses.
   * ===================================================================== */
  const CH4 = [];
  const push4 = (def) => CH4.push(Object.assign({ chapter: 4, theme: "temple", biome: "The Great Temple" }, def));
  const T50 = dims(30, 30);

  push4({
    id: 41, name: "The First Scale", teaches: "Counterweights", tier: "medium",
    hint: "The temple weighs its guests. Nichols is heavier — when he stands on one pan, the other rises.",
    build: (g) => { box(g, 20, 10, 24, 10, 2); box(g, 30, 12, 36, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("seesaw", 14, 13, { span: 3 }),
      O("switch", 22, 9, { channel: "g", w: 22, h: 28, y: 10 * T - 28 }),
      gate(27, { channel: "g" }),
      O("gem", 8, 14, {}), O("gem", 21, 9, {}), O("gem", 35, 11, {}),
      O("portal", 32, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 42, name: "Twin Scales", teaches: "Balance held together", tier: "hard",
    hint: "Two scales, two plates high on the rims. Rise together and stand together — or nothing opens.",
    build: (g) => { box(g, 32, 11, 37, 11, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("seesaw", 9, 13, { span: 3 }),
      O("seesaw", 22, 13, { span: 3 }),
      O("tandem", 5, 11, { channel: "even", bx: 26 * T, by: 11 * T, w: T, h: 10, y: 11 * T - 10 }),
      gate(29, { channel: "even" }),
      O("gem", 15, 14, {}), O("gem", 27, 10, {}), O("gem", 36, 10, {}),
      O("portal", 34, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 43, name: "The Patient Scale", teaches: "Balance under time", tier: "hard",
    hint: "Throw the clockwork lever, then make the scale lift her to the ledge — before the sand runs out.",
    build: (g) => { box(g, 22, 9, 26, 9, 2); box(g, 31, 12, 37, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("timeswitch", 5, 15, { channel: "t", duration: 8, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      O("seesaw", 16, 12, { span: 3 }),
      O("switch", 24, 8, { channel: "s", w: 22, h: 28, y: 9 * T - 28 }),
      gate(29, { channels: ["t", "s"] }),
      O("blade", 10, 15, { x2: 14 * T, y2: 15 * T, speed: 85 }),
      O("gem", 12, 14, {}), O("gem", 25, 8, {}), O("gem", 36, 11, {}),
      O("portal", 33, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 44, name: "The Dry Well", teaches: "Rationed aether", tier: "hard", energyMax: 45,
    hint: "The temple drinks your aether — the pool here is SHALLOW. Decide together who spends it.",
    build: (g) => {
      box(g, 10, FLOOR, 15, ROWS - 1, 0);
      box(g, 20, 12, 23, 12, 2); box(g, 30, 10, 36, 10, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 6),
      O("anchor", 12, 8, { w: 18, h: 18 }),
      O("telecube", 6, 15, { kind: "free" }),
      O("button", 21, 11, { channel: "g", needsCrate: true, w: T, h: 10, y: 12 * T - 10 }),
      gate(27, { channel: "g" }),
      O("gem", 13, 13, {}), O("gem", 22, 10, {}), O("gem", 35, 9, {}),
      O("portal", 32, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 45, name: "The Miser's Hall", teaches: "Every drop counts", tier: "extreme", energyMax: 35,
    hint: "Barely a mouthful of aether. Swing greedily and the cube dies mid-air. Plan every spend.",
    build: (g) => {
      box(g, 8, FLOOR, 13, ROWS - 1, 0); box(g, 18, FLOOR, 23, ROWS - 1, 0);
      box(g, 14, 14, 17, 14, 1); box(g, 27, 11, 30, 11, 2); box(g, 33, 9, 38, 9, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(8, 6), spikes(18, 6),
      O("anchor", 10, 8, { w: 18, h: 18 }), O("anchor", 20, 8, { w: 18, h: 18 }),
      O("telecube", 4, 15, { kind: "free" }),
      O("button", 28, 10, { channel: "g", needsCrate: true, w: T, h: 10, y: 11 * T - 10 }),
      gate(32, { channel: "g" }),
      O("gem", 15, 13, {}), O("gem", 24, 14, {}), O("gem", 37, 8, {}),
      O("portal", 35, 7, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 46, name: "First Light Cell", teaches: "Battery ferrying", tier: "medium",
    hint: "Power cells hum in the dark. ACTION lifts one — each of you can carry one. Feed both cradles.",
    build: (g) => { box(g, 28, 12, 34, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("battery", 5, 15, {}), O("battery", 8, 15, {}),
      O("dock", 18, 14, { channel: "pa", w: 28, h: 30, y: FLOOR_TOP - 30 }),
      O("dock", 22, 14, { channel: "pb", w: 28, h: 30, y: FLOOR_TOP - 30 }),
      gate(25, { channels: ["pa", "pb"] }),
      O("gem", 12, 14, {}), O("gem", 26, 14, {}), O("gem", 33, 11, {}),
      O("portal", 30, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 47, name: "The Long Carry", teaches: "Ferrying under fire", tier: "hard",
    hint: "A cell in your arms means no lever in your hands. Cover your partner past the blades.",
    build: (g) => {
      box(g, 12, FLOOR, 16, ROWS - 1, 0);
      box(g, 17, 14, 20, 14, 1); box(g, 30, 10, 36, 10, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("battery", 5, 15, {}),
      spikes(12, 5),
      O("platform", 12, 14, { w: 3 * T, h: 14, x2: 16 * T, y2: 14 * T, speed: 75 }),
      O("blade", 21, 15, { x2: 27 * T, y2: 15 * T, speed: 105 }),
      O("dock", 27, 14, { channel: "p", w: 28, h: 30, y: FLOOR_TOP - 30 }),
      gate(29, { channel: "p" }),
      O("gem", 9, 14, {}), O("gem", 18, 13, {}), O("gem", 35, 9, {}),
      O("portal", 32, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 48, name: "The Dark Ferry", teaches: "Weakness as the route", tier: "hard",
    hint: "Two corridors: one crackles, one chokes. Only Nichols survives the lightning road — only Nibihah the poison. Each carries a cell through their own door.",
    build: (g) => {
      box(g, 14, 9, 29, 9, 2);                 // upper corridor (poison route)
      box(g, 13, 10, 13, 13, 2);               // divider — open at floor level
      box(g, 26, 10, 26, 13, 2);               // divider — open at floor level
      box(g, 31, 12, 37, 12, 2);               // portal shelf
      box(g, 34, 14, 35, 14, 1);               // step up to it
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("battery", 4, 15, {}), O("battery", 7, 15, {}),
      // lower road: electricity (his), upper road: poison (hers)
      O("hazard", 15, 14, { kind: "electric", w: 10 * T, h: 2 * T }),
      O("hazard", 15, 7, { kind: "poison", w: 10 * T, h: 2 * T }),
      O("platform", 9, 14, { w: 2 * T, h: 14, x2: 9 * T, y2: 7 * T, speed: 60 }),
      O("dock", 28, 14, { channel: "pa", w: 28, h: 30, y: FLOOR_TOP - 30 }),
      O("dock", 28, 8, { channel: "pb", w: 28, h: 30, y: 9 * T - 30 }),
      gate(30, { channels: ["pa", "pb"] }),
      O("gem", 19, 13, {}), O("gem", 19, 6, {}), O("gem", 36, 11, {}),
      O("portal", 33, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 49, name: "The Weighed Verdict", teaches: "Scales, cells and song", tier: "extreme",
    hint: "The temple asks everything at once: a cell for the cradle, a verse for the walls, a scale for the sky.",
    build: (g) => { box(g, 15, 10, 19, 10, 2); box(g, 26, 12, 29, 12, 2); box(g, 32, 8, 38, 8, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("battery", 4, 15, {}),
      O("dock", 10, 14, { channel: "cell", w: 28, h: 30, y: FLOOR_TOP - 30 }),
      O("seesaw", 15, 13, { span: 3 }),
      O("runeseq", 16, 9, { channel: "song", pads: [
        { x: 16 * T, y: 10 * T - 4, who: "blue" }, { x: 27 * T, y: 12 * T - 4, who: "green" },
      ] }),
      gate(31, { channels: ["cell", "song"] }),
      O("blade", 21, 15, { x2: 25 * T, y2: 15 * T, speed: 95 }),
      O("gem", 17, 9, {}), O("gem", 28, 11, {}), O("gem", 37, 7, {}),
      O("portal", 34, 6, { w: 2 * T, h: 2 * T }),
    ],
  });

  push4({
    id: 50, name: "The Balance Temple", teaches: "The trial of wisdom", tier: "extreme",
    cols: 30, rows: 30, energyMax: 60,
    hint: "Three scales in a rising hall. Balance them in turn, ferry the last cell, and rise together.",
    build: (g) => {
      box(g, 3, 25, 8, 25, 2); box(g, 20, 25, 26, 25, 2);
      box(g, 12, 20, 17, 20, 2); box(g, 3, 15, 9, 15, 2);
      box(g, 19, 12, 25, 12, 2); box(g, 8, 8, 16, 8, 2); box(g, 18, 6, 26, 6, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("seesaw", 12, 27, { span: 3 }),
      O("seesaw", 12, 17, { span: 3 }),
      O("battery", 22, 24, {}),
      O("dock", 22, 11, { channel: "cell", w: 28, h: 30, y: 12 * T - 30 }),
      O("anchor", 10, 12, { w: 18, h: 18 }),
      O("crumble", 17, 15, { w: 2 * T, h: 14, delay: 0.9 }),
      O("blade", 13, 19, { x2: 16 * T, y2: 19 * T, speed: 90 }),
      O("tandem", 9, 8, { channel: "rise", bx: 24 * T, by: 6 * T, w: T, h: 10, y: 8 * T - 10 }),
      O("gem", 6, 24, {}), O("gem", 14, 19, {}), O("gem", 24, 11, {}), O("gem", 25, 5, {}),
      O("portal", 21, 4, { w: 2 * T, h: 2 * T, channels: ["cell", "rise"] }),
    ],
  });

  /* =====================================================================
   * CHAPTER 5 — TEMPLE IN THE SKY (levels 51–60)
   * The Watchers wake: sweeping eyes, patrolling husks, and scaffolds of
   * cloud and light above the world.
   * ===================================================================== */
  const CH5 = [];
  const push5 = (def) => CH5.push(Object.assign({ chapter: 5, theme: "city", biome: "Temple in the Sky" }, def));
  const S60 = dims(30, 34);

  push5({
    id: 51, name: "The Watchers", teaches: "The sweeping eye", tier: "medium",
    hint: "When the eye burns violet it is LOOKING — and its gaze wakes the lasers. Move in the dark beats.",
    build: (g) => { box(g, 28, 12, 34, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("watcher", 24, 13, { channel: "seen", dir: -1, range: 260, period: 4.4, gaze: 1.8 }),
      O("laser", 12, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("laser", 18, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("gem", 10, 14, {}), O("gem", 21, 14, {}), O("gem", 33, 11, {}),
      O("portal", 30, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 52, name: "Blind Spots", teaches: "Breaking the gaze", tier: "hard",
    hint: "This eye never blinks. Nichols floats the stone into its sightline — a shadow for Nibihah to walk in.",
    build: (g) => { box(g, 30, 11, 36, 11, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("watcher", 26, 13, { channel: "seen", dir: -1, range: 300, period: 3, gaze: 2.6 }),
      O("laser", 10, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("laser", 16, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("laser", 22, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("telecube", 5, 15, { kind: "free" }),
      O("gem", 13, 14, {}), O("gem", 24, 14, {}), O("gem", 35, 10, {}),
      O("portal", 32, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 53, name: "The Shepherd", teaches: "Luring the husk", tier: "hard",
    hint: "The husk kills what it touches — but its weight is honest. Bait it onto the great plate and KEEP it there.",
    build: (g) => { box(g, 28, 12, 34, 12, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("sentinel", 14, 15, { x1: 20 * T, y: FLOOR_TOP - 30 }),
      O("button", 22, 15, { channel: "g", needsCrate: true, w: 2 * T, h: 10, y: FLOOR_TOP - 10 }),
      gate(26, { channel: "g" }),
      O("gem", 8, 14, {}), O("gem", 24, 14, {}), O("gem", 33, 11, {}),
      O("portal", 30, 10, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 54, name: "Two Shepherds", teaches: "A husk for each plate", tier: "hard",
    hint: "Two husks, two plates, one gate. Split up, bait them apart — and dodge what you invite.",
    build: (g) => { box(g, 17, 14, 19, 14, 1); box(g, 30, 10, 36, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("sentinel", 9, 15, { x1: 13 * T, y: FLOOR_TOP - 30 }),
      O("sentinel", 21, 15, { x1: 25 * T, y: FLOOR_TOP - 30 }),
      O("button", 14, 15, { channel: "a", needsCrate: true, w: 2 * T, h: 10, y: FLOOR_TOP - 10 }),
      O("button", 24, 15, { channel: "b", needsCrate: true, w: 2 * T, h: 10, y: FLOOR_TOP - 10 }),
      gate(28, { channels: ["a", "b"] }),
      O("gem", 6, 14, {}), O("gem", 18, 13, {}), O("gem", 35, 9, {}),
      O("portal", 32, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 55, name: "Patrol Roads", teaches: "Distraction", tier: "hard",
    hint: "The bridge belongs to the husk. One hero draws it away; the other runs the road behind its back.",
    build: (g) => {
      box(g, 10, FLOOR, 26, ROWS - 1, 0);
      box(g, 10, 13, 26, 13, 7);               // the one-way patrol bridge
      box(g, 28, 11, 34, 11, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 17),
      O("sentinel", 13, 12, { x1: 23 * T, y: 13 * T - 30, sight: 120 }),
      O("anchor", 18, 6, { w: 18, h: 18 }),
      O("gem", 15, 11, {}), O("gem", 21, 11, {}), O("gem", 33, 10, {}),
      O("portal", 30, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 56, name: "The Gauntlet Eye", teaches: "Eyes, husks and wind", tier: "extreme",
    hint: "A watcher above, a husk below, and the sky's own breath against you. Everything is a timer here.",
    build: (g) => { box(g, 16, 13, 19, 13, 2); box(g, 30, 10, 37, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("watcher", 27, 4, { channel: "seen", dir: -1, range: 300, period: 4, gaze: 1.7 }),
      O("laser", 13, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("laser", 21, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("sentinel", 22, 15, { x1: 27 * T, y: FLOOR_TOP - 30 }),
      O("wind", 8, 4, { w: 16 * T, h: 11 * T, dir: 1, push: 260, period: 4.6, blow: 1.5 }),
      O("gem", 11, 14, {}), O("gem", 18, 12, {}), O("gem", 36, 9, {}),
      O("portal", 33, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 57, name: "Sky Scaffolds", teaches: "The vertical patrol", tier: "extreme",
    cols: 26, rows: 30,
    hint: "Scaffolds of light and falling stone — with a husk walking the middle floor. Climb around its beat.",
    build: (g) => {
      box(g, 3, 25, 8, 25, 2); box(g, 12, 22, 18, 22, 2); box(g, 4, 18, 10, 18, 2);
      box(g, 12, 15, 20, 15, 2);               // the patrol floor
      box(g, 5, 11, 11, 11, 2); box(g, 14, 8, 22, 8, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("blink", 9, 24, { w: 2 * T, h: 14, period: 2.2, duty: 0.6 }),
      O("crumble", 10, 20, { w: 2 * T, h: 14, delay: 0.9 }),
      O("sentinel", 13, 14, { x1: 18 * T, y: 15 * T - 30, sight: 110 }),
      O("anchor", 12, 10, { w: 18, h: 18 }),
      O("rock", 8, 3, {}), O("rock", 17, 3, {}),
      O("gem", 5, 24, {}), O("gem", 16, 21, {}), O("gem", 8, 10, {}),
      O("portal", 17, 6, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 58, name: "The Rigging", teaches: "Swinging the heights", tier: "extreme",
    cols: 26, rows: 32, energyMax: 55,
    hint: "Ropes of aether over open sky. The pool is thin and the rings are far — swing sparingly, land truly.",
    build: (g) => {
      box(g, 3, 27, 8, 27, 2); box(g, 16, 23, 21, 23, 2); box(g, 4, 19, 9, 19, 2);
      box(g, 15, 15, 20, 15, 2); box(g, 5, 11, 10, 11, 2); box(g, 14, 7, 22, 7, 2);
    },
    spawns: [spawn(3, 28), spawn(4, 28)],
    objects: [
      O("anchor", 12, 20, { w: 18, h: 18 }), O("anchor", 12, 12, { w: 18, h: 18 }),
      O("anchor", 12, 5, { w: 18, h: 18 }),
      O("platform", 21, 28, { w: 2 * T, h: 14, x2: 21 * T, y2: 16 * T, speed: 62 }),
      O("rotor", 8, 15, { radius: 2 * T, rate: 0.8, w: 2 * T, h: 14 }),
      O("watcher", 20, 10, { channel: "seen", dir: -1, range: 240, period: 4.2, gaze: 1.6 }),
      O("laser", 8, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("gem", 6, 26, {}), O("gem", 18, 22, {}), O("gem", 7, 10, {}),
      O("portal", 17, 5, { w: 2 * T, h: 2 * T }),
    ],
  });

  push5({
    id: 59, name: "Cloud Steps", teaches: "Powering the sky", tier: "extreme",
    hint: "The last cradle hangs among vanishing clouds. Ferry the cell across footing that forgets you.",
    build: (g) => {
      box(g, 10, FLOOR, 28, ROWS - 1, 0);
      box(g, 29, 12, 37, 12, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 19),
      O("battery", 5, 15, {}),
      O("blink", 11, 14, { w: 2 * T, h: 14, period: 2.4, duty: 0.6 }),
      O("blink", 15, 13, { w: 2 * T, h: 14, period: 2.4, duty: 0.6, phase: 0.8 }),
      O("blink", 19, 14, { w: 2 * T, h: 14, period: 2.4, duty: 0.6, phase: 1.6 }),
      O("blink", 23, 13, { w: 2 * T, h: 14, period: 2.4, duty: 0.6, phase: 0.4 }),
      O("tandem", 7, 15, { channel: "step", bx: 31 * T, by: 12 * T, w: T, h: 10, y: FLOOR_TOP - 10 }),
      O("dock", 33, 11, { channel: "power", w: 28, h: 30, y: 12 * T - 30 }),
      O("gem", 16, 12, {}), O("gem", 24, 12, {}), O("gem", 36, 11, {}),
      O("portal", 34, 9, { w: 2 * T, h: 2 * T, channels: ["power", "step"] }),
    ],
  });

  push5({
    id: 60, name: "Temple in the Sky", teaches: "All the sky demands", tier: "extreme",
    cols: 30, rows: 34, energyMax: 70,
    hint: "The final shard waits at the summit, behind every trial the sky has taught you. Go as one.",
    build: (g) => {
      box(g, 3, 29, 9, 29, 2); box(g, 14, 26, 20, 26, 2); box(g, 22, 22, 27, 22, 2);
      box(g, 12, 19, 18, 19, 2); box(g, 4, 16, 10, 16, 2); box(g, 14, 12, 22, 12, 2);
      box(g, 6, 9, 12, 9, 2); box(g, 16, 5, 26, 5, 2);
    },
    spawns: [spawn(3, 30), spawn(4, 30)],
    objects: [
      O("sentinel", 15, 25, { x1: 19 * T, y: 26 * T - 30, sight: 110 }),
      O("seesaw", 12, 30, { span: 3 }),
      O("battery", 24, 21, {}),
      O("dock", 18, 11, { channel: "cell", w: 28, h: 30, y: 12 * T - 30 }),
      O("anchor", 11, 22, { w: 18, h: 18 }), O("anchor", 13, 7, { w: 18, h: 18 }),
      O("watcher", 25, 15, { channel: "seen", dir: -1, range: 280, period: 4.4, gaze: 1.8 }),
      O("laser", 8, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("crumble", 20, 18, { w: 2 * T, h: 14, delay: 0.9 }),
      O("wind", 4, 7, { w: 20 * T, h: 9 * T, dir: -1, push: 250, period: 4.8, blow: 1.6 }),
      O("tandem", 17, 5, { channel: "summit", bx: 24 * T, by: 5 * T, w: T, h: 10, y: 5 * T - 10 }),
      O("gem", 6, 28, {}), O("gem", 24, 21, {}), O("gem", 8, 15, {}), O("gem", 25, 4, {}),
      O("portal", 20, 3, { w: 2 * T, h: 2 * T, channels: ["cell", "summit"] }),
    ],
  });

  /* =====================================================================
   * CHAPTER 6 — THE HEAVENS (levels 61–70)
   * The final journey: every mechanic the world has taught, woven together
   * above the clouds — and at the summit, the Celestial itself.
   * ===================================================================== */
  const CH6 = [];
  const push6 = (def) => CH6.push(Object.assign({ chapter: 6, theme: "heart", biome: "The Heavens" }, def));

  push6({
    id: 61, name: "The First Star Road", teaches: "Ascent begins", tier: "hard",
    cols: 26, rows: 30,
    hint: "The road to the Heavens is climbed, not walked. Rings, lifts and thin starlight footing.",
    build: (g) => {
      box(g, 3, 25, 8, 25, 2); box(g, 13, 22, 18, 22, 2); box(g, 4, 18, 9, 18, 2);
      box(g, 14, 14, 20, 14, 2); box(g, 5, 10, 11, 10, 2); box(g, 15, 6, 23, 6, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("blink", 10, 24, { w: 2 * T, h: 14, period: 2.3, duty: 0.6 }),
      O("anchor", 12, 18, { w: 18, h: 18 }),
      O("platform", 21, 26, { w: 2 * T, h: 14, x2: 21 * T, y2: 15 * T, speed: 62 }),
      O("crumble", 12, 12, { w: 2 * T, h: 14, delay: 0.9 }),
      O("rock", 9, 3, {}), O("rock", 18, 3, {}),
      O("gem", 5, 24, {}), O("gem", 16, 13, {}), O("gem", 8, 9, {}),
      O("portal", 18, 4, { w: 2 * T, h: 2 * T }),
    ],
  });

  push6({
    id: 62, name: "The Silent Choir", teaches: "Song under starfall", tier: "extreme",
    hint: "Five runes between two singers while the sky drops stones. Call the verse and keep moving.",
    build: (g) => { box(g, 13, 13, 16, 13, 2); box(g, 30, 10, 37, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("runeseq", 10, 15, { channel: "choir", pads: [
        { x: 5 * T, y: FLOOR_TOP - 4, who: "green" }, { x: 14 * T, y: 13 * T - 4, who: "blue" },
        { x: 9 * T, y: FLOOR_TOP - 4, who: "blue" }, { x: 18 * T, y: FLOOR_TOP - 4, who: "green" },
        { x: 22 * T, y: FLOOR_TOP - 4 },
      ] }),
      gate(26, { channel: "choir" }),
      O("rock", 7, 3, {}), O("rock", 13, 3, {}), O("rock", 20, 3, {}),
      O("gem", 15, 12, {}), O("gem", 24, 14, {}), O("gem", 36, 9, {}),
      O("portal", 33, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push6({
    id: 63, name: "The Twin Currents", teaches: "Wind between worlds", tier: "extreme",
    hint: "Two gales cross the star road. Shield one, brace the other, and swing where the air is torn.",
    build: (g) => {
      box(g, 11, FLOOR, 15, ROWS - 1, 0); box(g, 22, FLOOR, 26, ROWS - 1, 0);
      box(g, 16, 14, 21, 14, 1); box(g, 30, 11, 37, 11, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(11, 5), spikes(22, 5),
      O("wind", 6, 3, { w: 12 * T, h: 13 * T, dir: 1, push: 300, period: 4, blow: 1.8 }),
      O("wind", 20, 3, { w: 9 * T, h: 13 * T, dir: -1, push: 300, period: 4, blow: 1.8, phase: 2 }),
      O("telecube", 4, 15, { kind: "free" }),
      O("anchor", 13, 8, { w: 18, h: 18 }), O("anchor", 24, 8, { w: 18, h: 18 }),
      O("gem", 18, 13, {}), O("gem", 28, 14, {}), O("gem", 36, 10, {}),
      O("portal", 32, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push6({
    id: 64, name: "The Watchers' Court", teaches: "Every eye at once", tier: "extreme",
    hint: "Two eyes, crossing gazes, and a husk walking the court between them. Shadows are your only road.",
    build: (g) => { box(g, 16, 13, 19, 13, 2); box(g, 30, 10, 37, 10, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("watcher", 27, 13, { channel: "e1", dir: -1, range: 280, period: 4.2, gaze: 1.7 }),
      O("watcher", 8, 5, { channel: "e2", dir: 1, range: 280, period: 4.2, gaze: 1.7, phase: 2.1 }),
      O("laser", 12, 1, { dir: "down", channel: "e1", w: T, h: T }),
      O("laser", 22, 1, { dir: "down", channel: "e2", w: T, h: T }),
      O("sentinel", 20, 15, { x1: 25 * T, y: FLOOR_TOP - 30 }),
      O("telecube", 4, 15, { kind: "free" }),
      O("gem", 10, 14, {}), O("gem", 18, 12, {}), O("gem", 36, 9, {}),
      O("portal", 33, 8, { w: 2 * T, h: 2 * T }),
    ],
  });

  push6({
    id: 65, name: "The Broken Orrery", teaches: "Machinery of the sky", tier: "extreme",
    cols: 28, rows: 30,
    hint: "The heavens' own clockwork, half-ruined. Ride its arms, mend its heart, and climb through its teeth.",
    build: (g) => {
      box(g, 3, 25, 8, 25, 2); box(g, 20, 21, 25, 21, 2);
      box(g, 4, 15, 9, 15, 2); box(g, 17, 11, 24, 11, 2); box(g, 6, 7, 13, 7, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("rotor", 13, 23, { radius: 3 * T, rate: 0.8, w: 2 * T, h: 14 }),
      O("rotor", 13, 13, { radius: 3 * T, rate: -0.8, w: 2 * T, h: 14, phase: 1.6 }),
      O("repair", 22, 20, { channel: "heart", y: 21 * T - 30 }),
      O("crusher", 10, 9, { travel: 4 * T, axis: "y", period: 2.5 }),
      O("blade", 18, 10, { x2: 23 * T, y2: 10 * T, speed: 100 }),
      O("gem", 6, 24, {}), O("gem", 22, 20, {}), O("gem", 8, 6, {}),
      O("portal", 9, 5, { w: 2 * T, h: 2 * T, channels: ["heart"] }),
    ],
  });

  push6({
    id: 66, name: "The Last Ferry", teaches: "One cell, every hazard", tier: "extreme",
    hint: "A single cell must cross gales, blades and thinning ice. Hand it off — no hero can carry it the whole way.",
    build: (g) => {
      box(g, 10, FLOOR, 24, ROWS - 1, 0);
      box(g, 30, 11, 37, 11, 2);
    },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      spikes(10, 15),
      O("battery", 5, 15, {}),
      O("crumble", 11, 14, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("crumble", 15, 13, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("crumble", 19, 14, { w: 2 * T, h: 14, delay: 0.85, respawn: 4 }),
      O("wind", 9, 3, { w: 17 * T, h: 11 * T, dir: -1, push: 260, period: 4.4, blow: 1.6 }),
      O("blade", 25, 15, { x2: 29 * T, y2: 15 * T, speed: 105 }),
      O("dock", 33, 10, { channel: "power", w: 28, h: 30, y: 11 * T - 30 }),
      O("gem", 13, 12, {}), O("gem", 21, 12, {}), O("gem", 36, 10, {}),
      O("portal", 34, 8, { w: 2 * T, h: 2 * T, channels: ["power"] }),
    ],
  });

  push6({
    id: 67, name: "Thread the Needle", teaches: "Bound, timed, together", tier: "extreme",
    hint: "The aether thread binds you through a corridor of clockwork gates. Same pace, same breath, or the thread snaps.",
    build: (g) => { box(g, 30, 11, 37, 11, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("tether", 4, 2, { w: 24 * T, h: 14 * T, maxDist: 180 }),
      O("timeswitch", 6, 15, { channel: "t1", duration: 6, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      gate(11, { channel: "t1" }),
      O("timeswitch", 14, 15, { channel: "t2", duration: 6, w: 24, h: 30, y: FLOOR_TOP - 30 }),
      gate(19, { channel: "t2" }),
      O("crusher", 22, 2, { travel: 10 * T, axis: "y", period: 2.4 }),
      gate(25, { channels: ["t1", "t2"] }),
      O("gem", 9, 14, {}), O("gem", 17, 14, {}), O("gem", 36, 10, {}),
      O("portal", 32, 9, { w: 2 * T, h: 2 * T }),
    ],
  });

  push6({
    id: 68, name: "The Scales of Heaven", teaches: "Weight and wings", tier: "extreme",
    cols: 28, rows: 30,
    hint: "Celestial scales in a tower of wind. Balance, boost and swing — the summit takes all three.",
    build: (g) => {
      box(g, 3, 25, 8, 25, 2); box(g, 18, 25, 24, 25, 2);
      box(g, 12, 21, 16, 21, 2);                // mid landing — bridges the long climb
      box(g, 5, 17, 10, 17, 2); box(g, 17, 13, 23, 13, 2);
      box(g, 6, 9, 12, 9, 2); box(g, 16, 6, 24, 6, 2);
    },
    spawns: [spawn(3, 26), spawn(4, 26)],
    objects: [
      O("seesaw", 12, 27, { span: 3 }),
      O("wind", 4, 8, { w: 20 * T, h: 12 * T, dir: 1, push: 250, period: 4.6, blow: 1.6 }),
      O("anchor", 14, 9, { w: 18, h: 18 }),
      O("crumble", 13, 15, { w: 2 * T, h: 14, delay: 0.9 }),
      O("tandem", 17, 6, { channel: "high", bx: 23 * T, by: 6 * T, w: T, h: 10, y: 6 * T - 10 }),
      O("gem", 6, 24, {}), O("gem", 19, 12, {}), O("gem", 9, 8, {}),
      O("portal", 19, 4, { w: 2 * T, h: 2 * T, channels: ["high"] }),
    ],
  });

  push6({
    id: 69, name: "The Gate of Dawn", teaches: "Perfect coordination", tier: "extreme",
    hint: "The Celestial's antechamber asks for everything: a lure, a shadow, a song, a shared step.",
    build: (g) => { box(g, 12, 13, 15, 13, 2); box(g, 22, 12, 25, 12, 2); box(g, 31, 9, 38, 9, 2); },
    spawns: [spawn(2, 14), spawn(3, 14)],
    objects: [
      O("sentinel", 8, 15, { x1: 13 * T, y: FLOOR_TOP - 30 }),
      O("button", 10, 15, { channel: "lure", needsCrate: true, w: 2 * T, h: 10, y: FLOOR_TOP - 10 }),
      O("watcher", 28, 5, { channel: "seen", dir: -1, range: 300, period: 3.6, gaze: 1.8 }),
      O("laser", 17, 1, { dir: "down", channel: "seen", w: T, h: T }),
      O("telecube", 4, 15, { kind: "free" }),
      O("runeseq", 20, 12, { channel: "dawn", pads: [
        { x: 13 * T, y: 13 * T - 4, who: "blue" }, { x: 23 * T, y: 12 * T - 4, who: "green" },
      ] }),
      gate(27, { channels: ["lure", "dawn"] }),
      O("gem", 14, 12, {}), O("gem", 24, 11, {}), O("gem", 37, 8, {}),
      O("portal", 34, 7, { w: 2 * T, h: 2 * T }),
    ],
  });

  push6({
    id: 70, name: "The Heart Engine", teaches: "The final trial", tier: "extreme",
    cols: 30, rows: 24, energyMax: 80,
    hint: "The Celestial wakes. Break its three seals — the song, the cell, the shared step — while the sky falls. Then stand in the light together.",
    build: (g) => {
      box(g, 4, 19, 9, 19, 2);                  // west ledge (rune verse)
      box(g, 20, 19, 26, 19, 2);                // east ledge (the cradle)
      box(g, 12, 15, 17, 15, 2);                // centre dais (tandem seal)
      box(g, 3, 11, 7, 11, 2); box(g, 22, 11, 27, 11, 2),
      box(g, 13, 8, 16, 8, 2);                  // the portal rises here
    },
    // spawn beneath the east ledge — sheltered from the opening starfall
    spawns: [spawn(23, 20), spawn(24, 20)],
    objects: [
      O("boss", 11, 2, { w: 8 * T, h: 3 * T, phases: ["ph1", "ph2", "ph3"], channel: "boss" }),
      // Seal 1: the song — a split verse on the west ledge
      O("runeseq", 5, 18, { channel: "ph1", pads: [
        { x: 4 * T, y: 19 * T - 4, who: "green" }, { x: 7 * T, y: 19 * T - 4, who: "blue" },
      ] }),
      // Seal 2: the cell — ferried to the east cradle
      O("battery", 14, 21, {}),
      O("dock", 23, 18, { channel: "ph2", w: 28, h: 30, y: 19 * T - 30 }),
      // Seal 3: the shared step — tandem plates on the centre dais
      O("tandem", 12, 15, { channel: "ph3", bx: 16 * T, by: 15 * T, w: T, h: 10, y: 15 * T - 10 }),
      O("anchor", 10, 12, { w: 18, h: 18 }), O("anchor", 19, 12, { w: 18, h: 18 }),
      O("gem", 5, 10, {}), O("gem", 25, 10, {}), O("gem", 14, 20, {}),
      // the way out opens only when the Celestial yields
      O("portal", 13, 6, { w: 2 * T, h: 2 * T, channels: ["boss"] }),
    ],
  });

  // Chapter-1 levels come first in the campaign; the older prototypes are kept
  // as a bonus "vault" so no work is lost.
  const ALL = CH1.concat(CH2, CH3, CH4, CH5, CH6, LEVELS);

  /* ---- Chapter metadata (6 chapters / 70 slots) ------------------------ */
  GG.CHAPTERS = [
    { id: 1, name: "Underground Caves", theme: "cave",    from: 1,  to: 10, built: true,
      blurb: "Learning cooperation in the mines and crystal caverns." },
    { id: 2, name: "Wrecked Ruins",     theme: "ruins",   from: 11, to: 25, built: true,
      blurb: "Mirrors, lasers, gears and the truth about the Heart Engine." },
    { id: 3, name: "Enchanted Forest",  theme: "jungle",  from: 26, to: 40, built: true,
      blurb: "Runes, gales and the aether thread — nature tests the heroes." },
    { id: 4, name: "The Great Temple",  theme: "temple",  from: 41, to: 50, built: true,
      blurb: "Counterweights, rationed aether and the battery ferries." },
    { id: 5, name: "Temple in the Sky", theme: "city",    from: 51, to: 60, built: true,
      blurb: "Sweeping eyes, patrolling husks and scaffolds of cloud." },
    { id: 6, name: "The Heavens",       theme: "heart",   from: 61, to: 70, built: true,
      blurb: "Every mechanic combined — and the Celestial itself." },
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

  /* ---- In-world tutorials + vermin nests (injected, data-driven) --------
   * Every level that introduces a mechanic gets a floating parchment sign
   * teaching it, and corruption-rats nest in scattered levels beyond 20. */
  (function () {
    const sign = (tx, ty, title, lines, keys) =>
      ({ type: "tutor", x: tx * T, y: ty * T, title, lines, keys: keys || [] });
    const TUT = {
      1: [sign(6, 14, "WELCOME, HEROES", [
        "Move and jump — and mind the spikes.",
        "BOTH of you must stand in the portal to finish.",
      ], [["WASD", "Nichols"], ["◄▲▼►", "Nibihah"]])],
      2: [sign(6, 14, "TIMED GATES", [
        "The plate opens the gate for a few seconds.",
        "Press it, then BOTH sprint through together.",
      ])],
      4: [sign(13, 18, "WALL JUMP", [
        "Fall while pressing INTO a wall to slide down it.",
        "Press JUMP to kick off. Bounce wall-to-wall to climb",
        "the sealed chimney — the key waits at the top.",
      ], [["W / ▲", "jump off the wall"]])],
      6: [sign(7, 27, "CLIMB TOGETHER", [
        "Stand on your partner's head to reach higher —",
        "the carrier jumps lower under the weight.",
      ])],
      7: [sign(8, 13, "CARRY & THROW", [
        "Nichols: HOLD S beside a crate to lift it and charge.",
        "RELEASE to throw. Hold W while releasing to aim UP.",
      ], [["S", "grab / charge / drop"]])],
      9: [sign(7, 24, "AIR DASH", [
        "Nibihah: press SPECIAL in mid-air to dash forward.",
        "It refills when you land. Dash late to stretch a jump.",
      ], [["R-Shift", "Nibihah's dash"]])],
      11: [sign(13, 13, "SWINGING", [
        "Nibihah: stand BELOW a glowing ring and press R-SHIFT",
        "to hook on. Pump ◄ ► at the bottom of the arc for speed.",
        "▲ reels in · ▼ lets out · JUMP releases you into flight.",
      ], [["R-Shift", "hook / unhook"], ["▲/▼", "reel the rope"]])],
      15: [sign(9, 14, "TELEKINESIS", [
        "Nichols: press Q near the glowing stone to grip it",
        "with your MIND. Steer it with WASD — but you are",
        "rooted while holding. Q again lets go; it floats.",
      ], [["Q", "grip / release"]])],
      22: [sign(15, 14, "VERMIN — TO ARMS!", [
        "Corruption-rats hunt you while healthy and flee",
        "when wounded. FOUR hits fell one — for good.",
      ], [["E", "Nichols' bolt gun"], [". ", "Nibihah's bow"]])],
      26: [sign(11, 14, "RUNE SONGS", [
        "Step the numbered runes IN ORDER. A wrong step",
        "resets the verse. Some runes obey only one hero.",
      ])],
      29: [sign(6, 14, "THE GALE", [
        "When the wind howls, CROUCH on the ground to brace.",
        "Move between gusts — or be swept into the thorns.",
      ], [["S / ▼", "brace"]])],
      32: [sign(9, 14, "TANDEM PLATES", [
        "Twin plates linked by one breath: both must be",
        "pressed within half a second, and HELD together.",
      ])],
      33: [sign(10, 14, "THE TETHER", [
        "In here an aether thread binds you. Drift too far",
        "apart and it SNAPS — move at each other's pace.",
      ])],
      41: [sign(8, 14, "COUNTERWEIGHTS", [
        "The scales weigh you. Nichols is heavier — his pan",
        "sinks, and the other rises. Ride it like a lift.",
      ])],
      46: [sign(10, 14, "POWER CELLS", [
        "Press ACTION beside a cell to lift it — one each.",
        "Set it in a cradle to power the locks forever.",
      ], [["S / ▼", "lift / set down"]])],
      51: [sign(8, 14, "THE WATCHERS", [
        "When the eye burns violet it SEES — and its gaze",
        "wakes the lasers. Move in the dark beats.",
      ])],
      53: [sign(6, 14, "LURING", [
        "The husk's weight is honest: bait it over the great",
        "plate and hold its attention there. Don't get caught.",
      ])],
      70: [sign(23, 18, "THE CELESTIAL", [
        "Shoot it — 40 bolts bring it down. Break its three",
        "seals to stun it. At half strength it starts BLINKING",
        "across the arena. Stone shelters you from starfire.",
      ], [["E", "bolt gun"], [". ", "bow"]])],
    };
    // rat nests: scattered through the world beyond level 20 (never respawn
    // once cleared — unless both heroes fall)
    const RATS = { 22: [17], 24: [19, 26], 27: [20], 31: [16], 34: [24], 36: [33], 47: [22], 56: [24], 62: [20, 26], 64: [20] };
    for (const l of GG.LEVELS) {
      if (TUT[l.id]) l.objects = l.objects.concat(TUT[l.id]);
      if (RATS[l.id]) l.objects = l.objects.concat(RATS[l.id].map((c, i) => ({
        type: "rat", x: c * T, y: ((l.rows || 18) - 2) * T - 14, seed: i + c,
      })));
    }
  })();

  // The campaign is the ordered list of story levels that are actually built.
  GG.CAMPAIGN = GG.LEVELS.filter(l => l.chapter && l.chapter > 0).map(l => l.id);
  GG.VAULT = GG.LEVELS.filter(l => l.chapter === 0).map(l => l.id);
  GG.LEVEL_COUNT = GG.CAMPAIGN.length;
  GG.TOTAL_PLANNED = 70;
})(window);
