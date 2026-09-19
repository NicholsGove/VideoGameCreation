/* =========================================================================
 * worldgen.js — the open world of Echoes of Aether
 * -------------------------------------------------------------------------
 * One big, connected 2D world instead of separate levels. It is generated
 * DETERMINISTICALLY from a fixed seed, so every player explores the same map
 * and it can be verified offline (tests/world.js proves every room solvable).
 *
 * STRUCTURE
 *   The world is a grid of CELLS (one cell ≈ one screen: 32×18 tiles).
 *   Rooms are rectangles of cells (1×1 up to 3×2). Rooms join through
 *   doorways on shared edges. The map's DISCOVERY % is the share of cells
 *   the heroes have set foot in — reach 100% and the story ends.
 *
 *   Eight regions, each with its own biome, creatures and a POWER SHRINE in
 *   its deepest room. A region's entrance is sealed by a gate that needs the
 *   previous region's power (Ori-style gating). Every region also hides a few
 *   bonus rooms behind gates that need a LATER power — so you come back.
 *
 * CELLS
 *   Each cell is filled by a "chunk": a staircase shaft (if it links upward),
 *   a gate (if it guards a sealed doorway), or a MODULE — a co-op puzzle,
 *   a hazard run, a creature fight or a power trial. Every module is
 *   symmetric so it can be solved from whichever side the heroes arrive.
 *
 * Doorway geometry (local cell coords, floor top = row 16, ceiling = row 0):
 *   side doors  — rows 12..15 open in the wall;  both heroes step in to pass
 *   up/down     — a 4-wide opening at cols 14..17 with a one-way ledge at row 1
 *                 below it (up) or a 2-deep pit in the floor (down)
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, T = 32;
  const CW = 32, CH = 18;                 // cell size in tiles
  const E = 0, G = 1, S = 2, OW = 7;      // tile ids used here (ground / stone / one-way)

  /* ---- seeded RNG (mulberry32) -------------------------------------- */
  function rng(seed) {
    let a = seed >>> 0;
    const f = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  }

  /* ---- powers -------------------------------------------------------- */
  const POWERS = {
    arms:       { name: "Aether Arms",   glyph: "➶", tint: "#ff9a6a", who: "Both heroes",
                  lines: ["Nichols' bolt gun and Nibihah's bow awaken.", "Shoot creatures and thorn barriers."], keys: [["E", "Nichols fires"], [".", "Nibihah fires"]] },
    wallgrip:   { name: "Wall Grip",     glyph: "⇅", tint: "#7fd4ff", who: "Both heroes",
                  lines: ["Slide down walls and JUMP to kick off them.", "Chain kicks between close walls to climb."], keys: [["W / ▲", "kick off a wall"]] },
    skystep:    { name: "Sky Step",      glyph: "⇈", tint: "#a9d4ff", who: "Nibihah",
                  lines: ["Nibihah can jump AGAIN in mid-air.", "Reach high ledges — then help Nichols up."], keys: [["▲ ▲", "double jump"]] },
    strongarms: { name: "Strong Arms",   glyph: "✊", tint: "#9bf0b8", who: "Nichols",
                  lines: ["Nichols lifts crates: HOLD S beside one, release to throw.", "Hold W as you release to throw it UP onto ledges."], keys: [["S", "lift / charge / throw"]] },
    winddash:   { name: "Wind Dash",     glyph: "➟", tint: "#bfe8ff", who: "Nibihah",
                  lines: ["Nibihah dashes through the air with R-SHIFT.", "Double jump, THEN dash to cross the widest gaps."], keys: [["R-Shift", "air dash"]] },
    grapple:    { name: "Grapple Hook",  glyph: "⚓", tint: "#6ef0a0", who: "Nichols",
                  lines: ["Nichols yanks distant GREEN levers with Q.", "Stand level with the lever and face it."], keys: [["Q", "grapple"]] },
    swing:      { name: "Swing Ring",    glyph: "◎", tint: "#7fb0e6", who: "Nibihah",
                  lines: ["Nibihah hooks glowing rings with R-SHIFT from below.", "Pump ◄ ► to swing, JUMP to let go and fly."], keys: [["R-Shift", "hook the ring"]] },
    tele:       { name: "Mind Grip",     glyph: "✺", tint: "#c79bff", who: "Nichols",
                  lines: ["Nichols moves glowing cubes with his mind: Q to grip.", "Steer with WASD — he can't move while he holds it."], keys: [["Q", "grip / release"]] },
  };
  const POWER_ORDER = ["arms", "wallgrip", "skystep", "strongarms", "winddash", "grapple", "swing", "tele"];

  /* ---- regions ------------------------------------------------------- */
  const REGIONS = [
    { key: "caves",   name: "Whispering Caves", theme: "cave",    color: "#6ec3ff", rooms: 12, power: "arms",
      creatures: [] ,
      lore: ["The Heart Engine's echo still hums in these caves.", "Two halves of one compass. Two halves of one path."] },
    { key: "ruins",   name: "Sunken Ruins",     theme: "ruins",   color: "#5fd0c0", rooms: 12, power: "wallgrip",
      creatures: ["beetle", "toad", "rat"],
      lore: ["The builders climbed their towers wall to wall.", "Their grip outlived their city."] },
    { key: "wilds",   name: "Verdant Wilds",    theme: "forest",  color: "#7cd46a", rooms: 13, power: "skystep",
      creatures: ["spitter", "bat", "beetle"],
      lore: ["The canopy remembers a girl who ran on air.", "Step on the sky — it holds those who trust it."] },
    { key: "iron",    name: "The Ironworks",    theme: "factory", color: "#ff9a4d", rooms: 13, power: "strongarms",
      creatures: ["moth", "beetle", "toad"],
      lore: ["Every gear here was lifted by hand.", "Strong arms built the engine. Strong arms will mend it."] },
    { key: "frost",   name: "Frostpeak",        theme: "ice",     color: "#bfe8ff", rooms: 13, power: "winddash",
      creatures: ["bat", "toad", "beetle", "moth"],
      lore: ["The mountain wind never stops moving.", "Borrow its speed. Give it back at the summit."] },
    { key: "temple",  name: "The Great Temple", theme: "temple",  color: "#f2c14e", rooms: 13, power: "grapple",
      creatures: ["moth", "spitter", "toad", "rat"],
      lore: ["Priests pulled the high levers with golden hooks.", "What you cannot reach, you can still call."] },
    { key: "sky",     name: "Sky Isles",        theme: "city",    color: "#a9aeff", rooms: 13, power: "swing",
      creatures: ["bat", "moth", "spitter", "beetle"],
      lore: ["Between the islands hang the old rings.", "Fall is only a swing that forgot to rise."] },
    { key: "heart",   name: "Heart of Aether",  theme: "heart",   color: "#c79bff", rooms: 13, power: "tele",
      creatures: ["beetle", "toad", "bat", "spitter", "moth", "rat"],
      lore: ["Here the Heart first beat.", "Hold the world gently. Move it with your mind."] },
  ];

  /* ---- tablets found at the end of dead-end runs -------------------- */
  const LORE = [
    ["The compass has two halves.", "It was never meant to be carried alone."],
    ["When the Heart cracked, the shards fell like rain", "into every corner of the world."],
    ["A crate, a lever, a friend's shoulders —", "every wall here was built to be climbed together."],
    ["The beasts were not always wild.", "The dark in the shards made them so."],
    ["Who hooded the thief?", "The murals scratch out the face."],
    ["Lightning for the builder.", "Poison for the runner. Neither for both."],
    ["Map every cave. Walk every ruin.", "The Heart wakes only when it is whole."],
    ["The shrines remember the first heroes.", "Stand before them together, and they will remember you."],
    ["Not every door opens today.", "Some wait for a gift you have not found yet."],
    ["Rest here. The world is wide,", "and the Heart is patient."],
  ];

  /* ---- tile styles per biome (used by the styled tilemap renderer) --- */
  const STYLES = {
    cave:    { ground: "#2c2a40", rock: "#262c44", deep: "#1a1d2e", fleck: "rgba(160,190,255,0.10)", rockLit: "#343c5c", edge: "#1b2033", top: "#3b3a58", grass: "#5fb3a0", tuft: "#4f9a88", drip: "rgba(110,240,208,0.35)" },
    ruins:   { ground: "#2d3d42", rock: "#2a383e", deep: "#1b2629", fleck: "rgba(170,230,230,0.10)", rockLit: "#3b4f55", edge: "#1a2528", top: "#3e5358", grass: "#6aa88a", tuft: "#5a9a7a", drip: "rgba(127,212,255,0.30)" },
    forest:  { ground: "#3b2f24", rock: "#33402f", deep: "#231c16", fleck: "rgba(255,230,170,0.08)", rockLit: "#46573f", edge: "#261e17", top: "#4d3d2e", grass: "#5fa83c", tuft: "#7cc44a", drip: null },
    factory: { ground: "#3a3240", rock: "#403848", deep: "#241f29", fleck: "rgba(255,170,110,0.12)", rockLit: "#58506a", edge: "#211c26", top: "#6a5a70", grass: "#ff9a4d", tuft: null, drip: "rgba(255,154,77,0.25)" },
    ice:     { ground: "#4a6488", rock: "#56709a", deep: "#2f4260", fleck: "rgba(230,245,255,0.18)", rockLit: "#7c9cc6", edge: "#34496a", top: "#cfe8ff", grass: "#f4fbff", tuft: "#ffffff", drip: "rgba(200,235,255,0.55)" },
    temple:  { ground: "#5a4632", rock: "#6a5238", deep: "#3a2c1e", fleck: "rgba(255,220,150,0.12)", rockLit: "#8a6c48", edge: "#3a2c1e", top: "#a07c4c", grass: "#e2b659", tuft: null, drip: null },
    city:    { ground: "#6a6f96", rock: "#7a80a8", deep: "#474b6c", fleck: "rgba(255,255,255,0.12)", rockLit: "#a0a6cc", edge: "#4a4e70", top: "#8a90ba", grass: "#8fd08a", tuft: "#a8e0a0", drip: null },
    heart:   { ground: "#2a1a44", rock: "#33214f", deep: "#1a1030", fleck: "rgba(199,155,255,0.18)", rockLit: "#4a3270", edge: "#1a1030", top: "#4a3270", grass: "#c79bff", tuft: "#e0c8ff", drip: "rgba(199,155,255,0.35)" },
  };

  /* =====================================================================
   * LAYOUT — place rooms on the cell grid and join them with doorways
   * =================================================================== */
  const SHAPES = [
    [1, 1, 26], [2, 1, 28], [3, 1, 10], [1, 2, 11], [2, 2, 12], [3, 2, 4], [1, 3, 3], [4, 1, 3],
  ];

  function layout(seed) {
    const R = rng(seed);
    const GW = 44, GH = 34;
    const grid = new Map();                          // "x,y" -> room id
    const key = (x, y) => x + "," + y;
    const rooms = [];
    const free = (x, y, w, h) => {
      if (x < 1 || y < 1 || x + w > GW - 1 || y + h > GH - 1) return false;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (grid.has(key(x + i, y + j))) return false;
      return true;
    };
    const place = (region, x, y, w, h, kind) => {
      const room = { id: rooms.length, region, x, y, w, h, kind: kind || "normal", doors: [], noVert: new Set(), vlinks: new Set() };
      // stacked cells inside a room connect through ONE shaft per storey
      for (let j = 0; j < h - 1; j++) room.vlinks.add(Math.floor(R() * w) + "," + j);
      rooms.push(room);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid.set(key(x + i, y + j), room.id);
      return room;
    };
    const sideUsed = (room, lx, ly, side) => room.doors.some(d => d.lx === lx && d.ly === ly && d.side === side);
    const OPP = { L: "R", R: "L", U: "D", D: "U" };

    /** All legal doorway spots between two adjacent rooms. */
    function doorSpots(a, b) {
      const out = [];
      if (a.x + a.w === b.x || b.x + b.w === a.x) {          // side by side
        const aLeft = a.x + a.w === b.x;
        for (let y = Math.max(a.y, b.y); y < Math.min(a.y + a.h, b.y + b.h); y++) {
          out.push({ ax: aLeft ? a.w - 1 : 0, ay: y - a.y, as: aLeft ? "R" : "L",
                     bx: aLeft ? 0 : b.w - 1, by: y - b.y, bs: aLeft ? "L" : "R" });
        }
      }
      if (a.y + a.h === b.y || b.y + b.h === a.y) {          // stacked
        const aTop = a.y + a.h === b.y;
        for (let x = Math.max(a.x, b.x); x < Math.min(a.x + a.w, b.x + b.w); x++) {
          out.push({ ax: x - a.x, ay: aTop ? a.h - 1 : 0, as: aTop ? "D" : "U",
                     bx: x - b.x, by: aTop ? 0 : b.h - 1, bs: aTop ? "U" : "D" });
        }
      }
      return out;
    }
    const cellKey = (room, lx, ly) => room.id + ":" + lx + "," + ly;
    const gateCells = new Set();
    function connect(a, b, lock, opts) {
      opts = opts || {};
      let spots = doorSpots(a, b).filter(s =>
        !sideUsed(a, s.ax, s.ay, s.as) && !sideUsed(b, s.bx, s.by, s.bs));
      if (lock || opts.horizontalOnly) spots = spots.filter(s => s.as === "L" || s.as === "R");
      // vertical doors may not land in a cell that hosts a gate
      spots = spots.filter(s => {
        if (s.as === "U" || s.as === "D") return !a.noVert.has(s.ax + "," + s.ay) && !b.noVert.has(s.bx + "," + s.by);
        return true;
      });
      if (lock) {
        // the gate structure lives in A's cell: that cell must be single-storey,
        // free of vertical traffic, and host no other gate
        spots = spots.filter(s => a.h === 1 && !a.doors.some(d => d.lx === s.ax && d.ly === s.ay && (d.side === "U" || d.side === "D")) &&
          !gateCells.has(cellKey(a, s.ax, s.ay)) && !a.doors.some(d => d.lx === s.ax && d.ly === s.ay && d.lock));
      }
      if (!spots.length) return false;
      // mostly side doors — vertical doors mean climbing shafts, use them sparingly
      const horiz = spots.filter(s => s.as === "L" || s.as === "R");
      const s = (horiz.length && R.chance(0.75)) ? R.pick(horiz) : R.pick(spots);
      const da = { lx: s.ax, ly: s.ay, side: s.as, to: b.id, lock: lock || null, host: !!lock };
      const db = { lx: s.bx, ly: s.by, side: s.bs, to: a.id, lock: lock || null, host: false };
      da.pair = db; db.pair = da;
      a.doors.push(da); b.doors.push(db);
      if (lock) { gateCells.add(cellKey(a, s.ax, s.ay)); a.noVert.add(s.ax + "," + s.ay); }
      return true;
    }
    const pickShape = (bias) => {
      let tot = 0; for (const s of SHAPES) tot += s[2] * (bias && s[1] === 1 ? 1.4 : 1);
      let r = R() * tot;
      for (const s of SHAPES) { r -= s[2] * (bias && s[1] === 1 ? 1.4 : 1); if (r <= 0) return s; }
      return SHAPES[0];
    };
    /** Try to place a new room next to `host` and connect them. */
    function growFrom(host, region, kind, shape, lock) {
      const [w, h] = shape;
      const hc = [], vc = [];
      // positions such that the new rect is adjacent to host (sharing >=1 cell of edge)
      for (let dy = -(h - 1); dy <= host.h - 1; dy++) {
        hc.push([host.x - w, host.y + dy]); hc.push([host.x + host.w, host.y + dy]);
      }
      if (!lock) for (let dx = -(w - 1); dx <= host.w - 1; dx++) {
        vc.push([host.x + dx, host.y - h]); vc.push([host.x + dx, host.y + host.h]);
      }
      const shuf = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      shuf(hc); shuf(vc);
      // the world mostly spreads sideways; climbing links are the seasoning
      const cands = R.chance(0.8) ? hc.concat(vc) : vc.concat(hc);
      for (const [x, y] of cands) {
        if (!free(x, y, w, h)) continue;
        const room = place(region, x, y, w, h, kind);
        if (connect(host, room, lock)) return room;
        // undo
        rooms.pop();
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) grid.delete(key(x + i, y + j));
      }
      return null;
    }

    // --- regions -------------------------------------------------------
    const regionRooms = REGIONS.map(() => []);
    for (let k = 0; k < REGIONS.length; k++) {
      const reg = REGIONS[k];
      let first;
      if (k === 0) {
        first = place(0, 18, 14, 2, 1, "start");
      } else {
        // enter from a room of the previous region, through a gate needing its power
        const lock = POWER_ORDER[k - 1];
        // prefer the previous region; fall back to any earlier one if it is boxed in
        const tiers = [regionRooms[k - 1], [].concat(...regionRooms.slice(0, k))];
        for (const pool of tiers) {
          const hosts = pool.filter(r => r.h === 1 && r.kind === "normal");
          for (let tries = 0; tries < 300 && !first && hosts.length; tries++) {
            first = growFrom(R.pick(hosts), k, "normal", R.chance(0.5) ? [1, 1] : pickShape(true), lock);
          }
          if (first) break;
        }
        if (!first) throw new Error("worldgen: could not attach region " + k);
      }
      regionRooms[k].push(first);
      // grow the region
      let guard = 0;
      while (regionRooms[k].length < reg.rooms - 1 && guard++ < 3000) {
        const pool = regionRooms[k];
        // bias growth toward recent rooms so regions stretch out
        const host = pool[Math.max(0, pool.length - 1 - Math.floor(Math.pow(R(), 2) * pool.length))];
        const r = growFrom(host, k, "normal", pickShape(false), null);
        if (r) regionRooms[k].push(r);
      }
      // the shrine: a 1x1 chamber attached to the room furthest from the entry
      const dist = bfs(first, regionRooms[k]);
      const order = regionRooms[k].slice().sort((a, b) => (dist.get(b.id) || 0) - (dist.get(a.id) || 0));
      let shrine = null;
      for (const host of order) { shrine = growFrom(host, k, "shrine", [1, 1], null); if (shrine) break; }
      if (!shrine) throw new Error("worldgen: no shrine spot in region " + k);
      shrine.power = reg.power;
      regionRooms[k].push(shrine);
    }
    function bfs(start, pool) {
      const ids = new Set(pool.map(r => r.id)), dist = new Map([[start.id, 0]]), q = [start];
      while (q.length) {
        const r = q.shift();
        for (const d of r.doors) if (ids.has(d.to) && !dist.has(d.to)) { dist.set(d.to, dist.get(r.id) + 1); q.push(rooms[d.to]); }
      }
      return dist;
    }
    // --- loops inside each region (more than one way around) -----------
    for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
      const A = rooms[a], B = rooms[b];
      if (A.region !== B.region || A.kind !== "normal" || B.kind !== "normal") continue;
      if (A.doors.some(d => d.to === B.id)) continue;
      if (!doorSpots(A, B).length) continue;
      if (R.chance(0.3)) connect(A, B, null, { horizontalOnly: true });
    }
    // --- bonus rooms: sealed by a power you only get later -------------
    for (let k = 0; k < REGIONS.length - 1; k++) {
      const later = POWER_ORDER.slice(k + 1);
      let made = 0;
      for (let tries = 0; tries < 300 && made < 2; tries++) {
        const host = R.pick(regionRooms[k].filter(r => r.kind === "normal" && r.h === 1));
        if (!host) break;
        const lock = R.pick(later);
        const shape = R.pick([[1, 1], [1, 1], [2, 1]]);
        const r = growFrom(host, k, "bonus", shape, lock);
        if (r) { r.bonusPower = lock; regionRooms[k].push(r); made++; }
      }
    }
    return { rooms, grid, GW, GH, regionRooms };
  }

  /* =====================================================================
   * PLAN — decide what fills every cell (deterministic, precomputed so
   * tutorials land on the FIRST occurrence of each mechanic)
   * =================================================================== */
  const MOD_POOL = [
    // name, minRegion, weight, needsPower
    ["plain", 0, 3], ["spikes", 0, 3], ["lasers", 0, 3], ["blades", 0, 2], ["crumble", 0, 2], ["mplat", 0, 2],
    ["boostwall", 0, 3], ["twolever", 0, 2], ["holddoor", 0, 2], ["heavycrate", 0, 2], ["tandem", 0, 2],
    ["runes", 0, 2], ["key", 0, 2], ["timed", 0, 2], ["elements", 0, 2], ["battery", 1, 2],
    ["arena", 1, 3], ["creatures", 1, 4],
    ["dblwall", 3, 3, "skystep"], ["throwplate", 4, 3, "strongarms"], ["dashgap", 5, 3, "winddash"],
    ["grapplegap", 6, 3, "grapple"], ["swinggap", 7, 3, "swing"], ["telelift", 8, 3, "tele"],
  ];
  const TUTORIALS = {
    boostwall: ["CLIMB TOGETHER", ["Too tall for one? Stand at the wall and let your", "partner jump onto your HEAD, then up. Pull the", "lever on top to raise steps for the one below."]],
    twolever: ["TWO LEVERS", ["GREEN levers answer to Nichols, BLUE to Nibihah.", "The gate needs both. Each stands in their own", "element — lightning for him, poison for her."]],
    holddoor: ["HOLD THE DOOR", ["A plate only holds the gate while someone stands", "on it. Cross, then hold the far plate for your partner."]],
    heavycrate: ["HEAVY LIFTING", ["These plates want CARGO, not heroes.", "Only Nichols can shove the heavy crates."]],
    tandem: ["IN STEP", ["Twin plates: BOTH must be pressed at once."]],
    runes: ["RUNE SONG", ["Step the runes IN ORDER. Coloured runes answer", "only to their hero. A wrong step resets the song."]],
    key: ["THE HIGH KEY", ["The key sits too high for one hero alone.", "Boost your partner up — then unlock the gate."]],
    timed: ["RACE THE CLOCK", ["The hourglass lever opens the gate for a few", "seconds. Pull it — then BOTH sprint through."]],
    elements: ["SPLIT PATHS", ["Lightning below: only Nichols survives it.", "Poison above: only Nibihah. Take your own road."]],
    battery: ["POWER CELLS", ["Either hero lifts a cell with ACTION (S / ▼).", "Carry it to the cradle to power the gate."]],
    arena: ["AMBUSH", ["The chamber seals until every beast is down.", "Shoot with E (Nichols) and . (Nibihah)."]],
    lasers: ["TIMED LASERS", ["Beams flicker a warning, then fire.", "Cross while they are dark."]],
    creatures: ["WILD THINGS", ["Beetles CHARGE, toads spit LASERS, bats swoop.", "Watch for the tell — then strike back."]],
  };

  function plan(world, seed) {
    const R = rng(seed ^ 0x51ab);
    const { rooms } = world;
    // BFS order from the start room (tutorials go to the first occurrence)
    const order = [], seen = new Set([0]), q = [rooms[0]];
    while (q.length) { const r = q.shift(); order.push(r); for (const d of r.doors) if (!seen.has(d.to) && !d.lock) { seen.add(d.to); q.push(rooms[d.to]); } }
    for (const r of rooms) if (!seen.has(r.id)) order.push(r);
    // locked doors are opened in power order — rooms beyond them come later
    order.sort((a, b) => regionRank(a) - regionRank(b));
    function regionRank(r) { return r.kind === "bonus" ? (POWER_ORDER.indexOf(r.bonusPower) + 1) * 100 + r.region + 0.5 : r.region * 100; }
    const taught = new Set();
    for (const room of order) {
      room.cells = [];
      // available powers inside this room
      const tier = room.kind === "bonus" ? POWER_ORDER.indexOf(room.bonusPower) + 1 : room.region;
      room.tier = tier;
      const used = new Set();
      for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
        const f = cellFlags(room, i, j);
        const cell = { i, j, f, content: "plain", creatures: 0 };
        const vert = f.U || f.D;
        const gate = ["L", "R"].find(s => f[s] && f[s].lock && f[s].host);
        if (room.kind === "start" && i === 0) cell.content = "start";
        else if (room.kind === "shrine") cell.content = "shrine";
        else if (gate) { cell.content = "gate"; cell.gateSide = gate; cell.gatePower = f[gate].lock; }
        else if (f.U) cell.content = "shaft";
        else if (f.D) cell.content = "simple";
        else {
          const conns = (f.L ? 1 : 0) + (f.R ? 1 : 0);
          if (conns <= 1) {
            // a dead end is a challenge run with a reward at the far wall
            cell.content = "treasure";
            cell.run = R.pick(tier >= 1 ? ["spikes", "lasers", "blades", "crumble", "mplat", "creatures", "creatures"] : ["spikes", "lasers", "blades", "crumble", "mplat"]);
            if (cell.run === "creatures") cell.creatures = R.int(2, 3);
          }
          else if (room.kind === "bonus" && !used.has("power")) {
            // a bonus room shows off the power that opened it
            const pm = { skystep: "dblwall", strongarms: "throwplate", winddash: "dashgap", grapple: "grapplegap", swing: "swinggap", tele: "telelift" }[room.bonusPower];
            cell.content = pm || "creatures"; used.add("power");
          } else {
            const pool = MOD_POOL.filter(m => tier >= m[1] && !used.has(m[0]) && !(room.region === 0 && room.kind !== "bonus" && (m[0] === "creatures" || m[0] === "arena")));
            let tot = 0; for (const m of pool) tot += m[2] * (m[3] ? 2.2 : 1);
            let r = R() * tot, pick = pool[0];
            for (const m of pool) { r -= m[2] * (m[3] ? 2.2 : 1); if (r <= 0) { pick = m; break; } }
            cell.content = pick[0]; used.add(pick[0]);
          }
        }
        // creatures roam most cells beyond the first region
        const wild = tier >= 1 && room.kind !== "start" && room.kind !== "shrine";
        if (wild && !["arena", "creatures", "gate", "elements", "twolever", "tandem", "runes"].includes(cell.content)) cell.creatures = R.chance(0.55) ? R.int(1, 2) : 0;
        if (cell.content === "creatures") cell.creatures = R.int(2, 3);
        if (TUTORIALS[cell.content] && !taught.has(cell.content)) { taught.add(cell.content); cell.tutor = cell.content; }
        cell.seed = R.int(1, 1e9);
        room.cells.push(cell);
      }
      room.gems = R.int(1, 3);
    }
    return world;
  }

  /** Flags for one cell: each side -> null | door | {link:true}. */
  function cellFlags(room, i, j) {
    const f = { L: null, R: null, U: null, D: null };
    for (const d of room.doors) if (d.lx === i && d.ly === j) f[d.side] = d;
    if (i > 0) f.L = { link: true };
    if (i < room.w - 1) f.R = { link: true };
    if (j > 0 && room.vlinks.has(i + "," + (j - 1))) f.U = { link: true };
    if (j < room.h - 1 && room.vlinks.has(i + "," + j)) f.D = { link: true };
    return f;
  }

  /* =====================================================================
   * BUILD — turn one room into a playable level definition
   * =================================================================== */
  function buildRoom(world, id) {
    const room = world.rooms[id];
    const reg = REGIONS[room.region];
    const W = room.w * CW, H = room.h * CH;
    const g = []; for (let r = 0; r < H; r++) g.push(new Array(W).fill(E));
    const objs = [];
    let nid = 0;
    const put = (o) => { o.id = (id + 1) * 10000 + (nid++); objs.push(o); return o; };
    const fillG = (c0, r0, c1, r1, v) => {
      for (let r = Math.max(0, Math.min(r0, r1)); r <= Math.min(H - 1, Math.max(r0, r1)); r++)
        for (let c = Math.max(0, Math.min(c0, c1)); c <= Math.min(W - 1, Math.max(c0, c1)); c++) g[r][c] = v;
    };

    // --- shell: every cell has a floor (rows 16-17) and a ceiling (row 0)
    for (let j = 0; j < room.h; j++) {
      fillG(0, j * CH, W - 1, j * CH, S);
      fillG(0, j * CH + 16, W - 1, j * CH + 17, G);
    }
    fillG(0, 0, 0, H - 1, S); fillG(W - 1, 0, W - 1, H - 1, S);

    // --- internal vertical links between stacked cells
    for (let j = 0; j < room.h - 1; j++) for (let i = 0; i < room.w; i++) {
      if (!room.vlinks.has(i + "," + j)) continue;
      const ox = i * CW, top = j * CH, bot = (j + 1) * CH;
      fillG(ox + 14, top + 16, ox + 17, top + 16, E);
      fillG(ox + 14, top + 17, ox + 17, top + 17, OW);
      fillG(ox + 14, bot, ox + 17, bot, E);
      fillG(ox + 13, bot + 1, ox + 18, bot + 1, OW);
    }

    // --- doorways
    const arrivals = [];
    const theme = reg.theme;
    for (let di = 0; di < room.doors.length; di++) {
      const d = room.doors[di];
      const ox = d.lx * CW, oy = d.ly * CH;
      const dest = world.rooms[d.to];
      const label = REGIONS[dest.region].name + (dest.kind === "shrine" ? " · Shrine" : "");
      let pas, arr;
      if (d.side === "L" || d.side === "R") {
        const c = d.side === "L" ? 0 : W - 1;
        fillG(c, oy + 12, c, oy + 15, E);
        const zx = d.side === "L" ? 0 : (W - 2) * T;
        pas = { type: "passage", side: d.side, x: zx, y: (oy + 12) * T, w: 2 * T, h: 4 * T,
                vx: d.side === "L" ? -T : W * T, vy: (oy + 12) * T, vw: T, vh: 4 * T };
        // arrive just inside the doorway — gated doorways keep their gate at 3 tiles in
        const ax = d.side === "L" ? 1 * T + 4 : (W - 2) * T + 6;
        arr = [{ x: ax, y: (oy + 16) * T }, { x: ax + (d.side === "L" ? 30 : -30), y: (oy + 16) * T }];
      } else if (d.side === "U") {
        fillG(ox + 14, 0, ox + 17, 0, E);
        fillG(ox + 13, 1, ox + 18, 1, OW);
        pas = { type: "passage", side: "U", x: (ox + 13) * T, y: 0, w: 6 * T, h: 1 * T + 4,
                vx: (ox + 14) * T, vy: -T, vw: 4 * T, vh: T };
        arr = [{ x: (ox + 13) * T + 8, y: 1 * T }, { x: (ox + 17) * T, y: 1 * T }];
      } else {
        fillG(ox + 14, H - 2, ox + 17, H - 1, E);
        pas = { type: "passage", side: "D", x: (ox + 14) * T, y: (H - 2) * T + 8, w: 4 * T, h: 2 * T,
                vx: (ox + 14) * T, vy: H * T, vw: 4 * T, vh: T };
        arr = [{ x: (ox + 14) * T + 6, y: H * T }, { x: (ox + 16) * T + 6, y: H * T }];
      }
      pas.door = di; pas.label = label;
      put(pas);
      arrivals[di] = arr;          // feet positions (y = standing surface)
    }

    // --- cells
    const blocked = new Set();                       // "c,r" of tiles with hazards/structures (creature spawns avoid)
    for (const cell of room.cells) {
      const cx = {
        room, reg, g, W, H, put, fillG, blocked, theme, arrivals,
        ox: cell.i * CW, oy: cell.j * CH, cell, R: rng(cell.seed),
        ch: (n) => `k${cell.i}_${cell.j}_${n}`,
      };
      CHUNK[cell.content] ? CHUNK[cell.content](cx) : CHUNK.plain(cx);
      if (cell.tutor && TUTORIALS[cell.tutor]) {
        const [title, lines] = TUTORIALS[cell.tutor];
        const col = cell.content === "boostwall" || cell.content === "key" ? 8 : 16;
        put({ type: "tutor", x: (cx.ox + col) * T, y: (cx.oy + 8) * T, title, lines });
      }
      if (cell.creatures) spawnCreatures(cx, cell.creatures);
    }
    // --- gems: a few sparkles in the air above floors
    const Rg = rng(id * 977 + 13);
    for (let n = 0; n < room.gems; n++) {
      const cell = Rg.pick(room.cells);
      const c = cell.i * CW + Rg.int(6, 25), r = cell.j * CH + Rg.int(9, 13);
      if (g[r][c] === E && g[r + 1] && g[r + 1][c] === E) put({ type: "gem", x: c * T + 7, y: r * T + 7 });
    }

    // a fresh journey begins in the middle of the first cell
    const startSpawn = room.kind === "start" ? [{ x: 13 * T, y: 16 * T }, { x: 14 * T + 8, y: 16 * T }] : null;
    const def = {
      id: 1000 + id, roomId: id, startSpawn, name: roomName(room), theme, biome: reg.name,
      region: room.region, cols: W, rows: H, tiles: g, objects: objs, arrivals,
      spawns: arrivals[0] ? arrivals[0].map((a, k) => ({ x: a.x, y: a.y - (k === 0 ? 30 : 24) })) : [{ x: 3 * T, y: 15 * T - 30 }, { x: 4 * T, y: 15 * T - 24 }],
      chapter: 3, style: STYLES[theme] || STYLES.cave, dark: false,
      hint: reg.name,
    };
    return def;
  }

  function roomName(room) {
    const reg = REGIONS[room.region];
    if (room.kind === "start") return "The Waking Hollow";
    if (room.kind === "shrine") return "Shrine of " + POWERS[room.power].name;
    if (room.kind === "bonus") return "Hidden Vault";
    return reg.name;
  }

  /* ---- creature spawner -------------------------------------------- */
  function spawnCreatures(cx, n) {
    const { g, ox, oy, R, reg, room, put, blocked } = cx;
    const farN = (c, r, n) => cx.arrivals.every(a => !a || a.every(p => Math.abs(p.x / T - c) > n || Math.abs(p.y / T - r) > 6));
    const kinds = reg.creatures.length ? reg.creatures : ["beetle", "toad"];
    const tough = 1 + room.tier * 0.12;
    for (let k = 0; k < n; k++) {
      const kind = R.pick(kinds);
      for (let tries = 0; tries < 30; tries++) {
        const c = ox + R.int(7, 24);
        if (kind === "bat") {
          const r = oy + 1;
          if (!farN(c, r + 4, 10)) continue;
          if (g[r - 1][c] !== E && g[r][c] === E && g[r + 1][c] === E) { put({ type: "bat", x: c * T + 4, y: r * T + 2, tough, seed: R.int(1, 99) }); break; }
          continue;
        }
        if (kind === "moth") {
          const r = oy + R.int(6, 9);
          if (!farN(c, r, 13)) continue;
          if (g[r][c] === E && g[r][c + 1] === E && g[r + 1][c] === E) { put({ type: "moth", x: c * T, y: r * T, tough, seed: R.int(1, 99) }); break; }
          continue;
        }
        // ground creatures: find the surface below a free column
        let r = oy + 8;
        while (r < oy + 16 && !(g[r + 1][c] !== E && g[r][c] === E)) r++;
        if (r >= oy + 16 || g[r][c] !== E || g[r][c + 1] !== E || g[r + 1][c + 1] === E) continue;
        if (blocked.has(c + "," + r) || blocked.has((c + 1) + "," + r)) continue;
        if (!farN(c, r, kind === "toad" || kind === "spitter" ? 13 : 12)) continue;
        const h = { beetle: 20, toad: 22, rat: 14, spitter: 26 }[kind] || 20;
        put({ type: kind, x: c * T + 2, y: (r + 1) * T - h, tough, seed: R.int(1, 99), dir: R.chance(0.5) ? 1 : -1 });
        blocked.add(c + "," + r);
        break;
      }
    }
  }

  /* =====================================================================
   * CHUNKS — one per cell
   * =================================================================== */
  const floorY = (cx, h) => (cx.oy + 16) * T - h;                // top y for an object of height h on the floor
  const at = (cx, c, r) => ({ x: (cx.ox + c) * T, y: (cx.oy + r) * T });
  const block = (cx, c0, r0, c1, r1, v) => cx.fillG(cx.ox + c0, cx.oy + r0, cx.ox + c1, cx.oy + r1, v == null ? S : v);
  const spikes = (cx, c0, c1) => {
    // a forgiving hitbox: the teeth start a few pixels in from the tile edge
    cx.put({ type: "hazard", kind: "spike", x: (cx.ox + c0) * T + 5, y: floorY(cx, 18), w: (c1 - c0 + 1) * T - 10, h: 18 });
    for (let c = c0; c <= c1; c++) cx.blocked.add((cx.ox + c) + "," + (cx.oy + 15));
  };
  const hazardStrip = (cx, kind, c0, c1, r0, r1) => {
    cx.put({ type: "hazard", kind, x: (cx.ox + c0) * T, y: (cx.oy + r0) * T, w: (c1 - c0 + 1) * T, h: (r1 - r0 + 1) * T });
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) cx.blocked.add((cx.ox + c) + "," + (cx.oy + r));
  };
  const gate = (cx, c, extra) => cx.put(Object.assign({ type: "door", x: (cx.ox + c) * T, y: (cx.oy + 1) * T, w: T, h: 15 * T, color: "gold" }, extra));
  const lever = (cx, c, rowTop, extra) => cx.put(Object.assign({ type: "switch", x: (cx.ox + c) * T + 5, y: (cx.oy + rowTop) * T - 28 }, extra));
  const markBlocked = (cx, c0, c1, r0, r1) => { for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) cx.blocked.add((cx.ox + c) + "," + (cx.oy + r)); };
  const decorateCeiling = (cx, maxRow) => {
    const { R } = cx;
    for (let c = 2; c < CW - 2; c++) {
      if (c >= 12 && c <= 19) continue;               // keep the up-link clear
      if (R.chance(0.28)) block(cx, c, 1, c, 1, S);
      if (maxRow >= 2 && R.chance(0.08)) block(cx, c, 1, c, 2, S);
    }
  };

  const CHUNK = {
    /* ---- plain ground with mounds and a floating perch -------------- */
    plain(cx) {
      const { R } = cx;
      decorateCeiling(cx, 2);
      const humps = R.int(1, 2);
      for (let k = 0; k < humps; k++) {
        const w = R.int(3, 6), h = R.int(1, 2), c = k === 0 ? R.int(6, 11) : R.int(17, 22);
        block(cx, c, 16 - h, c + w - 1, 15, G);
        if (h === 2) block(cx, c - 1, 15, c - 1, 15, G);   // a step so it reads as terrain
      }
      if (R.chance(0.7)) {
        const c = R.int(9, 18);
        block(cx, c, 13, c + R.int(2, 4), 13, OW);
        if (R.chance(0.6)) block(cx, c + 3, 10, c + 5, 10, OW);
      }
    },
    simple(cx) {
      const { R, put } = cx;
      decorateCeiling(cx, 1);
      const v = R.int(0, 3);
      if (v === 0) { spikes(cx, 6, 9); spikes(cx, 22, 25); block(cx, 7, 12, 8, 12, OW); block(cx, 23, 12, 24, 12, OW); }
      else if (v === 1) {
        const period = R.pick([2.8, 3.2]);
        for (const c of [8, 23]) { block(cx, c, 1, c, 1, S); put({ type: "laser", x: (cx.ox + c) * T, y: (cx.oy + 2) * T, dir: "down", period, onTime: period * 0.45, phase: c === 8 ? 0 : period / 2 }); markBlocked(cx, c, c, 2, 15); }
      } else if (v === 2) {
        put({ type: "blade", x: (cx.ox + 5) * T, y: floorY(cx, 26), x2: (cx.ox + 11) * T, y2: floorY(cx, 26), speed: 70 });
        put({ type: "blade", x: (cx.ox + 20) * T, y: floorY(cx, 26), x2: (cx.ox + 26) * T, y2: floorY(cx, 26), speed: 70 });
        block(cx, 7, 12, 9, 12, OW); block(cx, 22, 12, 24, 12, OW);
      } else {
        block(cx, 6, 13, 9, 13, OW); block(cx, 22, 13, 25, 13, OW); block(cx, 10, 10, 12, 10, OW);
      }
    },
    /* ---- dead-end: a challenge run to a hoard at the closed wall ------- */
    treasure(cx) {
      const { R, put, cell } = cx;
      const closed = cell.f.L ? "R" : "L";            // the wall with no way on
      const run = cell.run || "spikes";
      if (run === "creatures") CHUNK.plain(cx); else CHUNK[run](cx);
      // the hoard: a little altar of gems and a story tablet
      const c = closed === "R" ? 28 : 3;
      block(cx, c - 1, 15, c + 1, 15, S);
      for (let k = -1; k <= 1; k++) put({ type: "gem", x: (cx.ox + c + k) * T + 7, y: (cx.oy + 12 - (k === 0 ? 1 : 0)) * T + 7 });
      const lore = LORE[(cell.seed >>> 3) % LORE.length];
      put({ type: "lore", x: (cx.ox + (closed === "R" ? c - 3 : c + 3)) * T, y: floorY(cx, 30), lines: lore });
      markBlocked(cx, c - 1, c + 1, 12, 15);
    },
    /* ---- start room -------------------------------------------------- */
    start(cx) {
      const { put } = cx;
      block(cx, 20, 14, 23, 15, G); block(cx, 19, 15, 19, 15, G);
      put({ type: "tutor", x: (cx.ox + 9) * T, y: (cx.oy + 9) * T, title: "ECHOES OF AETHER", lines: [
        "The world is one — explore it TOGETHER.",
        "Doorways need BOTH heroes standing in them.",
        "Press M for the map. Fill it to 100% to finish.",
      ], keys: [["WASD", "Nichols"], ["◄▲▼►", "Nibihah"]] });
      put({ type: "tutor", x: (cx.ox + 24) * T, y: (cx.oy + 8) * T, title: "CO-OP", lines: [
        "Stand on your partner's head to reach higher.",
        "S / ▼ pulls levers.  F and / drop a ping.",
      ] });
      put({ type: "lore", x: (cx.ox + 15) * T, y: floorY(cx, 30), lines: ["Two halves of one compass.", "Find the shrines. Wake the Heart."] });
    },
    /* ---- power shrine ------------------------------------------------ */
    shrine(cx) {
      const { put, room } = cx;
      const P = POWERS[room.power];
      block(cx, 11, 15, 20, 15, S);
      block(cx, 9, 3, 10, 10, S); block(cx, 21, 3, 22, 10, S);   // columns (walk beneath)
      block(cx, 9, 1, 22, 2, S);
      put({ type: "shrine", x: (cx.ox + 15) * T, y: (cx.oy + 13) * T, power: room.power, label: P.name, glyph: P.glyph, tint: P.tint });
      put({ type: "lore", x: (cx.ox + 5) * T, y: floorY(cx, 30), lines: cx.reg.lore });
      markBlocked(cx, 8, 23, 1, 15);
    },
    /* ---- climbing shaft (cell links upward) ------------------------- */
    shaft(cx) {
      const { R, put } = cx;
      const v = R.int(0, 9);
      block(cx, 12, 4, 19, 4, OW);                       // the ledge under the up-link
      if (v <= 2) {
        // a stone lift rides from the floor to the top ledge and back
        put({ type: "platform", x: (cx.ox + 20) * T, y: (cx.oy + 14) * T, w: 3 * T, h: 14, x2: (cx.ox + 20) * T, y2: (cx.oy + 4) * T, speed: R.int(55, 75) });
        block(cx, 6, 13, 9, 13, OW); block(cx, 6, 10, 9, 10, OW);   // a slow way up too, for the patient
        block(cx, 9, 7, 12, 7, OW);
      } else {
        // Build the climb from the TOP down: every ledge overlaps the one above
        // by at least two tiles, so you can always jump straight up through it.
        let a = 12, b = 19;
        const crumbly = cx.room.tier >= 2 && v >= 8;
        for (const row of [7, 10, 13]) {
          const w = R.int(4, 6);
          const lo = Math.max(3, a - w + 3), hi = Math.min(28 - w, b - 2);
          const s0 = R.int(Math.min(lo, hi), Math.max(lo, hi));
          if (crumbly && row === 10) {
            put({ type: "crumble", x: (cx.ox + s0) * T, y: (cx.oy + row) * T, w: w * T, h: 14, respawn: 2.2 });
          } else block(cx, s0, row, s0 + w - 1, row, OW);
          a = s0; b = s0 + w - 1;
        }
        if (v >= 6) {
          // a timed beam sweeps across the middle of the climb
          const side = R.chance(0.5);
          const c = side ? 1 : 30;
          put({ type: "laser", x: (cx.ox + c) * T, y: (cx.oy + 8) * T + 10, h: 12, dir: side ? "right" : "left", period: 3.2, onTime: 1.1, phase: R() * 3 });
        }
      }
      if (cx.room.tier >= 1 && R.chance(0.5)) {
        const bc = R.pick([5, 26]);
        const far = cx.arrivals.every(a => !a || a.every(p => Math.abs(p.x / T - (cx.ox + bc)) > 10 || Math.abs(p.y / T - (cx.oy + 5)) > 8));
        if (far && cx.g[cx.oy + 1][cx.ox + bc] === E) put({ type: "bat", x: (cx.ox + bc) * T, y: (cx.oy + 1) * T + 2, tough: 1 + cx.room.tier * 0.12, seed: R.int(1, 99) });
      }
    },
    /* ---- spike strip (with a stepping stone if wide) ---------------- */
    spikes(cx) {
      const { R } = cx;
      decorateCeiling(cx, 2);
      const wide = R.chance(0.5);
      if (wide) {
        const c0 = R.int(8, 12), c1 = c0 + 7;
        spikes(cx, c0, c1);
        block(cx, c0 + 3, 14, c0 + 4, 14, OW);
      } else {
        const a = R.int(7, 10); spikes(cx, a, a + 3);
        const b = R.int(17, 21); spikes(cx, b, b + 2);
      }
    },
    /* ---- timed lasers ------------------------------------------------ */
    lasers(cx) {
      const { R, put } = cx;
      const n = R.int(2, 3), start = R.int(8, 11), gap = R.int(5, 6);
      const period = R.pick([3.0, 3.4, 3.8]);
      for (let k = 0; k < n; k++) {
        const c = start + k * gap;
        block(cx, c, 1, c, 1, S);
        put({ type: "laser", x: (cx.ox + c) * T, y: (cx.oy + 2) * T, dir: "down", period, onTime: period * 0.42, phase: k * period / n });
        markBlocked(cx, c, c, 2, 15);
      }
      if (R.chance(0.5)) {                         // a horizontal sweeper at jump height
        const c = start + n * gap - 2;
        block(cx, 4, 13, 4, 13, S);
        put({ type: "laser", x: (cx.ox + 4) * T, y: (cx.oy + 12) * T + 18, h: 12, dir: "right", period: period + 0.6, onTime: 0.9, phase: 0.3 });
      }
    },
    /* ---- blades & crusher ------------------------------------------- */
    blades(cx) {
      const { R, put } = cx;
      decorateCeiling(cx, 1);
      const a = R.int(7, 9), b = R.int(22, 24);
      put({ type: "blade", x: (cx.ox + a) * T, y: floorY(cx, 26), x2: (cx.ox + b) * T, y2: floorY(cx, 26), speed: R.int(70, 95) });
      const c = R.int(13, 17);
      put({ type: "crusher", x: (cx.ox + c) * T, y: (cx.oy + 2) * T, w: 2 * T, h: T, travel: 13 * T, period: R.pick([2.6, 3, 3.4]), phase: R() * 2 });
      block(cx, c, 1, c + 1, 1, S);
      block(cx, 11, 12, 12, 12, OW); block(cx, 19, 12, 20, 12, OW);   // high perches to wait on
    },
    /* ---- crumbling stones over spikes -------------------------------- */
    crumble(cx) {
      const { R, put } = cx;
      decorateCeiling(cx, 2);
      spikes(cx, 7, 24);
      for (let c = 8; c <= 21; c += R.int(3, 4)) put({ type: "crumble", x: (cx.ox + c) * T, y: (cx.oy + 14) * T, w: 2 * T, h: 14, respawn: 2.5 });
      block(cx, 23, 14, 23, 14, OW);
      put({ type: "crumble", x: (cx.ox + 22) * T, y: (cx.oy + 14) * T, w: 2 * T, h: 14, respawn: 2.5 });
    },
    /* ---- moving platform over spikes -------------------------------- */
    mplat(cx) {
      const { R, put } = cx;
      decorateCeiling(cx, 2);
      spikes(cx, 7, 24);
      put({ type: "platform", x: (cx.ox + 7) * T, y: (cx.oy + 14) * T, w: 3 * T, h: 14, x2: (cx.ox + 22) * T, y2: (cx.oy + 14) * T, speed: R.int(65, 85) });
    },
    /* ---- boost wall: one lifts the other, who lowers steps ------------ */
    boostwall(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      block(cx, 14, 12, 17, 15, S);
      lever(cx, 15, 12, { channel: ch("w"), latch: true });
      put({ type: "span", x: (cx.ox + 11) * T, y: (cx.oy + 14) * T, w: 3 * T, h: 12, oneWay: true, channel: ch("w") });
      put({ type: "span", x: (cx.ox + 18) * T, y: (cx.oy + 14) * T, w: 3 * T, h: 12, oneWay: true, channel: ch("w") });
      markBlocked(cx, 11, 20, 11, 15);
    },
    /* ---- two coloured levers, each on its hero's element ------------- */
    twolever(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("gL"), ch("gR")], [ch("bL"), ch("bR")]], color: "gold" });
      lever(cx, 7, 16, { channel: ch("gL"), colorLock: "green" });
      lever(cx, 11, 16, { channel: ch("bL"), colorLock: "blue" });
      lever(cx, 24, 16, { channel: ch("gR"), colorLock: "green" });
      lever(cx, 20, 16, { channel: ch("bR"), colorLock: "blue" });
      hazardStrip(cx, "electric", 7, 7, 15, 15); hazardStrip(cx, "electric", 24, 24, 15, 15);
      hazardStrip(cx, "poison", 11, 11, 15, 15); hazardStrip(cx, "poison", 20, 20, 15, 15);
    },
    /* ---- hold the door ------------------------------------------------ */
    holddoor(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("pL"), ch("pR")]], color: "gold", timedMs: 350 });
      put({ type: "button", x: (cx.ox + 10) * T, y: floorY(cx, 10), channel: ch("pL") });
      put({ type: "button", x: (cx.ox + 20) * T, y: floorY(cx, 10), channel: ch("pR") });
      markBlocked(cx, 10, 10, 15, 15); markBlocked(cx, 20, 20, 15, 15);
    },
    /* ---- heavy crates onto cargo plates (Nichols pushes) ------------- */
    heavycrate(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("pL"), ch("pR")]], color: "green" });
      put({ type: "button", x: (cx.ox + 11) * T, y: floorY(cx, 10), channel: ch("pL"), needsCrate: true });
      put({ type: "button", x: (cx.ox + 20) * T, y: floorY(cx, 10), channel: ch("pR"), needsCrate: true });
      put({ type: "crate", x: (cx.ox + 7) * T, y: floorY(cx, T), heavy: true });
      put({ type: "crate", x: (cx.ox + 24) * T, y: floorY(cx, T), heavy: true });
      markBlocked(cx, 6, 25, 15, 15);
    },
    /* ---- tandem plates ------------------------------------------------ */
    tandem(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("tL"), ch("tR")]], latch: true });
      put({ type: "tandem", x: (cx.ox + 6) * T, y: floorY(cx, 10), bx: (cx.ox + 12) * T, by: floorY(cx, 10), channel: ch("tL") });
      put({ type: "tandem", x: (cx.ox + 19) * T, y: floorY(cx, 10), bx: (cx.ox + 25) * T, by: floorY(cx, 10), channel: ch("tR") });
      block(cx, 9, 13, 9, 13, S); block(cx, 22, 13, 22, 13, S);   // little pillars between the pads
    },
    /* ---- rune song --------------------------------------------------- */
    runes(cx) {
      const { put, ch, R } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("rL"), ch("rR")]] });
      const whoSets = [["green", null, "blue"], ["blue", "green", null], [null, "blue", "green"], ["green", "blue", "green"], ["blue", "green", "blue"]];
      const mk = (cols, ch_) => {
        const who = R.pick(whoSets);
        const order = cols.slice(); for (let i = order.length - 1; i > 0; i--) { const j = R.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
        put({ type: "runeseq", x: (cx.ox + cols[0]) * T, y: floorY(cx, 12), channel: ch_,
              pads: order.map((c, k) => ({ x: (cx.ox + c) * T, y: floorY(cx, 12), who: who[k] || undefined })) });
      };
      mk([5, 8, 11], ch("rL")); mk([20, 23, 26], ch("rR"));
    },
    /* ---- the high key --------------------------------------------------- */
    key(cx) {
      const { put } = cx;
      decorateCeiling(cx, 2);
      // perches hang 4 tiles up — one hero boosts the other
      block(cx, 6, 12, 8, 12, S); block(cx, 23, 12, 25, 12, S);
      put({ type: "key", x: (cx.ox + 7) * T + 6, y: (cx.oy + 10) * T + 8, color: "gold" });
      put({ type: "key", x: (cx.ox + 24) * T + 6, y: (cx.oy + 10) * T + 8, color: "gold" });
      put({ type: "lock", x: (cx.ox + 15) * T, y: (cx.oy + 1) * T, w: T, h: 15 * T, color: "gold" });
      markBlocked(cx, 6, 8, 11, 12); markBlocked(cx, 23, 25, 11, 12);
    },
    /* ---- race the hourglass ----------------------------------------- */
    timed(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("tL"), ch("tR")]], color: "blue" });
      put({ type: "timeswitch", x: (cx.ox + 6) * T, y: floorY(cx, 30), channel: ch("tL"), duration: 5 });
      put({ type: "timeswitch", x: (cx.ox + 25) * T, y: floorY(cx, 30), channel: ch("tR"), duration: 5 });
      spikes(cx, 10, 11); spikes(cx, 20, 21);
    },
    /* ---- split paths: lightning tunnel below, poison walk above ------- */
    elements(cx) {
      const { put } = cx;
      block(cx, 8, 10, 23, 12, S);                       // lower tunnel roof / upper floor
      block(cx, 12, 5, 19, 7, S);                        // upper tunnel roof
      hazardStrip(cx, "electric", 13, 18, 14, 15);
      hazardStrip(cx, "poison", 13, 18, 8, 9);
      block(cx, 4, 13, 6, 13, OW); block(cx, 25, 13, 27, 13, OW);
    },
    /* ---- ferry the power cells ---------------------------------------- */
    battery(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("dL"), ch("dR")]], color: "gold" });
      block(cx, 4, 13, 6, 13, S); block(cx, 25, 13, 27, 13, S);
      put({ type: "battery", x: (cx.ox + 5) * T + 6, y: (cx.oy + 13) * T - 26 });
      put({ type: "battery", x: (cx.ox + 26) * T + 6, y: (cx.oy + 13) * T - 26 });
      put({ type: "dock", x: (cx.ox + 12) * T, y: floorY(cx, 30), channel: ch("dL") });
      put({ type: "dock", x: (cx.ox + 19) * T, y: floorY(cx, 30), channel: ch("dR") });
      markBlocked(cx, 4, 6, 12, 13); markBlocked(cx, 12, 12, 15, 15); markBlocked(cx, 19, 19, 15, 15);
    },
    /* ---- ambush arena -------------------------------------------------- */
    arena(cx) {
      const { put, ch, R, reg, room } = cx;
      decorateCeiling(cx, 1);
      gate(cx, 4, { channel: ch("lock"), invert: true, color: "red" });
      gate(cx, 27, { channel: ch("lock"), invert: true, color: "red" });
      block(cx, 11, 12, 13, 12, OW); block(cx, 18, 12, 20, 12, OW);
      const kinds = reg.creatures.length ? reg.creatures : ["beetle"];
      const tough = 1 + room.tier * 0.12;
      const ids = [];
      const n = R.int(3, 4);
      for (let k = 0; k < n; k++) {
        const kind = R.pick(kinds);
        const c = 9 + k * 4 + R.int(0, 1);
        let o;
        if (kind === "bat") o = put({ type: "bat", x: (cx.ox + c) * T + 4, y: (cx.oy + 1) * T + 2, tough, seed: k + 3 });
        else if (kind === "moth") o = put({ type: "moth", x: (cx.ox + c) * T, y: (cx.oy + 7) * T, tough, seed: k + 3 });
        else { const h = { beetle: 20, toad: 22, rat: 14, spitter: 26 }[kind] || 20; o = put({ type: kind, x: (cx.ox + c) * T + 2, y: floorY(cx, h), tough, seed: k + 3 }); }
        ids.push(o.id);
      }
      put({ type: "arena", x: (cx.ox + 5) * T, y: (cx.oy + 1) * T, w: 22 * T, h: 15 * T, members: ids, channel: ch("lock") });
    },
    /* ---- open ground with wildlife (creatures added by the planner) --- */
    creatures(cx) { CHUNK.plain(cx); },
    /* ---- power modules ------------------------------------------------ */
    dblwall(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      block(cx, 14, 10, 17, 15, S);
      lever(cx, 15, 10, { channel: ch("w"), latch: true, colorLock: "blue" });
      put({ type: "span", x: (cx.ox + 11) * T, y: (cx.oy + 13) * T, w: 3 * T, h: 12, oneWay: true, channel: ch("w") });
      put({ type: "span", x: (cx.ox + 18) * T, y: (cx.oy + 13) * T, w: 3 * T, h: 12, oneWay: true, channel: ch("w") });
      markBlocked(cx, 11, 20, 9, 15);
    },
    throwplate(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("pL"), ch("pR")]], color: "green" });
      // cargo plates on hanging shelves, 4 tiles up: only a thrown crate gets there
      block(cx, 9, 12, 11, 12, S); block(cx, 20, 12, 22, 12, S);
      put({ type: "button", x: (cx.ox + 10) * T, y: (cx.oy + 12) * T - 10, channel: ch("pL"), needsCrate: true });
      put({ type: "button", x: (cx.ox + 21) * T, y: (cx.oy + 12) * T - 10, channel: ch("pR"), needsCrate: true });
      block(cx, 12, 14, 13, 14, OW); block(cx, 18, 14, 19, 14, OW);   // steps: carry it up, or throw it
      put({ type: "crate", x: (cx.ox + 5) * T, y: floorY(cx, 28), w: 28, h: 28 });
      put({ type: "crate", x: (cx.ox + 26) * T, y: floorY(cx, 28), w: 28, h: 28 });
      markBlocked(cx, 5, 26, 10, 11); markBlocked(cx, 5, 5, 15, 15); markBlocked(cx, 26, 26, 15, 15);
    },
    dashgap(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 1);
      spikes(cx, 7, 14); spikes(cx, 17, 24);
      lever(cx, 15, 16, { channel: ch("l"), latch: true });
      put({ type: "span", x: (cx.ox + 7) * T, y: (cx.oy + 14) * T, w: 8 * T, h: 12, channel: ch("l") });
      put({ type: "span", x: (cx.ox + 17) * T, y: (cx.oy + 14) * T, w: 8 * T, h: 12, channel: ch("l") });
    },
    grapplegap(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 1);
      block(cx, 15, 10, 16, 15, S);                              // the tall pillar
      block(cx, 5, 10, 9, 15, G); block(cx, 22, 10, 26, 15, G);  // viewing ledges
      block(cx, 10, 13, 10, 13, OW); block(cx, 21, 13, 21, 13, OW);
      block(cx, 4, 13, 4, 13, OW); block(cx, 27, 13, 27, 13, OW);
      put({ type: "grapple", x: (cx.ox + 15) * T + 5, y: (cx.oy + 10) * T - 28, channel: ch("g"), latch: true, range: 260 });
      put({ type: "span", x: (cx.ox + 10) * T, y: (cx.oy + 10) * T, w: 5 * T, h: 12, oneWay: true, channel: ch("g") });
      put({ type: "span", x: (cx.ox + 17) * T, y: (cx.oy + 10) * T, w: 5 * T, h: 12, oneWay: true, channel: ch("g") });
      markBlocked(cx, 5, 26, 9, 15);
    },
    swinggap(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 1);
      spikes(cx, 6, 14); spikes(cx, 17, 25);
      lever(cx, 15, 16, { channel: ch("l"), latch: true });
      put({ type: "anchor", x: (cx.ox + 10) * T + 7, y: (cx.oy + 9) * T });
      put({ type: "anchor", x: (cx.ox + 21) * T + 7, y: (cx.oy + 9) * T });
      put({ type: "span", x: (cx.ox + 6) * T, y: (cx.oy + 14) * T, w: 9 * T, h: 12, channel: ch("l") });
      put({ type: "span", x: (cx.ox + 17) * T, y: (cx.oy + 14) * T, w: 9 * T, h: 12, channel: ch("l") });
    },
    telelift(cx) {
      const { put, ch } = cx;
      decorateCeiling(cx, 2);
      gate(cx, 15, { need: [[ch("pL"), ch("pR")]], color: "green" });
      block(cx, 8, 11, 10, 11, S); block(cx, 21, 11, 23, 11, S);
      put({ type: "button", x: (cx.ox + 9) * T, y: (cx.oy + 11) * T - 10, channel: ch("pL"), needsCrate: true, teleOnly: true });
      put({ type: "button", x: (cx.ox + 22) * T, y: (cx.oy + 11) * T - 10, channel: ch("pR"), needsCrate: true, teleOnly: true });
      put({ type: "telecube", x: (cx.ox + 5) * T, y: floorY(cx, T), kind: "free" });
      put({ type: "telecube", x: (cx.ox + 26) * T, y: floorY(cx, T), kind: "free" });
      markBlocked(cx, 5, 26, 10, 11); markBlocked(cx, 5, 5, 15, 15); markBlocked(cx, 26, 26, 15, 15);
    },
    /* ---- gates: seal a doorway until the heroes own a power ---------- */
    gate(cx) {
      const { put, ch, cell } = cx;
      const side = cell.gateSide, power = cell.gatePower, P = POWERS[power];
      // d = distance in tiles from the gated wall; col() mirrors for the right side
      const col = (d, w) => side === "L" ? d : CW - 1 - d - ((w || 1) - 1);
      const run = (d0, d1) => side === "L" ? [d0, d1] : [CW - 1 - d1, CW - 1 - d0];
      const blk = (d0, r0, d1, r1, v) => { const [a, b] = run(d0, d1); block(cx, a, r0, b, r1, v); markBlocked(cx, a, b, r0, r1); };
      const gch = ch("gate");
      put({ type: "gatesign", x: (cx.ox + col(side === "L" ? 15 : 15)) * T + 6, y: floorY(cx, 26), text: "Needs " + P.name, glyph: P.glyph, tint: P.tint, power });
      if (power === "arms") {
        put({ type: "barrier", x: (cx.ox + col(3)) * T, y: (cx.oy + 1) * T, w: T, h: 15 * T, hp: 6 });
        return;
      }
      gate(cx, col(3), { channel: gch, color: "gold" });
      if (power === "wallgrip") {
        // a hollow stone column hanging from the ceiling: jump up into it and
        // kick wall to wall to the lever perched on its inner wall
        blk(6, 6, 6, 12);                     // inner wall (lever on top)
        blk(10, 1, 10, 12);                   // outer wall
        lever(cx, col(6), 6, { channel: gch, latch: true });
      } else if (power === "skystep") {
        blk(4, 10, 8, 10);                    // a shelf 6 tiles up — Sky Step reaches it
        lever(cx, col(6), 10, { channel: gch, latch: true });
      } else if (power === "strongarms") {
        blk(4, 13, 7, 13);                    // hanging shelf: only a crate LIFTED up there presses it
        put({ type: "button", x: (cx.ox + col(7)) * T, y: (cx.oy + 13) * T - 10, channel: gch, needsCrate: true, w: T });
        put({ type: "crate", x: (cx.ox + col(12)) * T, y: floorY(cx, 28), w: 28, h: 28 });
      } else if (power === "winddash") {
        const [a, b] = run(5, 12);
        spikes(cx, a, b);
        lever(cx, col(4), 16, { channel: gch, latch: true });
        put({ type: "span", x: (cx.ox + a) * T, y: (cx.oy + 14) * T, w: 8 * T, h: 12, channel: gch });
      } else if (power === "grapple") {
        blk(4, 11, 5, 11);                    // the lever's shelf (out of reach)
        blk(11, 11, 13, 11, G);               // Nichols' ledge, level with it
        blk(14, 13, 15, 13, OW);              // a step up to his ledge
        put({ type: "grapple", x: (cx.ox + col(5)) * T + 5, y: (cx.oy + 11) * T - 28, channel: gch, latch: true, range: 260 });
      } else if (power === "swing") {
        const [a, b] = run(6, 15);
        spikes(cx, a, b);
        lever(cx, col(4), 16, { channel: gch, latch: true });
        put({ type: "anchor", x: (cx.ox + col(11)) * T + 7, y: (cx.oy + 9) * T });
        put({ type: "span", x: (cx.ox + a) * T, y: (cx.oy + 14) * T, w: 10 * T, h: 12, channel: gch });
      } else if (power === "tele") {
        blk(4, 11, 7, 11);
        put({ type: "button", x: (cx.ox + col(6)) * T, y: (cx.oy + 11) * T - 10, channel: gch, needsCrate: true, teleOnly: true });
        put({ type: "telecube", x: (cx.ox + col(11)) * T, y: floorY(cx, T), kind: "free" });
      }
    },
  };

  /* =====================================================================
   * PUBLIC API
   * =================================================================== */
  const SEED = 20260919;
  let cached = null;
  function generate(seed) {
    seed = seed || SEED;
    if (cached && cached.seed === seed) return cached;
    // a layout attempt can box a region in; deterministic retries fix that
    let world = null;
    for (let k = 0; k < 40 && !world; k++) { try { world = layout(seed + k * 7919); world.attempt = k; } catch (e) { world = null; } }
    if (!world) throw new Error("worldgen failed");
    plan(world, seed);
    world.seed = seed;
    // every cell of every room, for the discovery map
    world.cells = [];
    for (const r of world.rooms) for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) world.cells.push({ room: r.id, x: r.x + i, y: r.y + j, key: (r.x + i) + "," + (r.y + j) });
    world.totalCells = world.cells.length;
    world._defs = new Map();
    world.def = (id) => { if (!world._defs.has(id)) world._defs.set(id, buildRoom(world, id)); return world._defs.get(id); };
    cached = world;
    return world;
  }

  /** A lone 1x1 room holding one chunk, with doorways left and right —
   *  used by the physics tests to prove each power trial can be done. */
  function testRoom(content, o) {
    o = o || {};
    const dummy = { id: 1, region: 0, kind: "normal", x: 0, y: 0, w: 1, h: 1, doors: [] };
    const room = { id: 0, region: o.region || 0, kind: "normal", x: 0, y: 0, w: 1, h: 1, doors: [], vlinks: new Set(), noVert: new Set(), tier: o.tier || 0, gems: 0 };
    room.doors.push({ lx: 0, ly: 0, side: "L", to: 1, lock: o.gateSide === "L" ? o.gatePower : null, host: o.gateSide === "L" });
    room.doors.push({ lx: 0, ly: 0, side: "R", to: 1, lock: o.gateSide === "R" ? o.gatePower : null, host: o.gateSide === "R" });
    const f = cellFlags(room, 0, 0);
    room.cells = [{ i: 0, j: 0, f, content, creatures: 0, seed: o.seed || 1234, gateSide: o.gateSide, gatePower: o.gatePower, run: o.run }];
    return buildRoom({ rooms: [room, dummy] }, 0);
  }

  GG.WORLDGEN = { generate, buildRoom, testRoom, POWERS, POWER_ORDER, REGIONS, STYLES, CW, CH, SEED, rng };
})(window);
