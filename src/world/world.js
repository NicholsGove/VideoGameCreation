/* =========================================================================
 * world.js — open-world runtime: rooms, travel, powers, discovery, saving
 * -------------------------------------------------------------------------
 * GG.world keeps the journey's state:
 *   • which room the party is in and which doorway they came through
 *   • the powers the heroes have found (each shrine grants one)
 *   • every map cell they have set foot in -> the DISCOVERY PERCENTAGE
 *   • the state of every room they have touched (levers pulled, gates
 *     opened, barriers broken, arenas cleared) so the world stays changed
 *
 * The game controller asks it to build a Level for a room; the Level calls
 * back through `onPassage` when both heroes step into a doorway and through
 * `onPower` when a shrine is claimed. Progress autosaves on every room change
 * and every few seconds of play.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, C = GG.C;
  const KEY = "echoes_world_save_v1";
  const T = C.TILE, U = GG.util, O = GG.obj;

  const blank = () => ({
    v: 1, seed: GG.WORLDGEN.SEED, room: 0, door: -1, powers: [], disc: {}, rooms: {},
    timeMs: 0, deaths: 0, gems: 0, slain: 0, done: false, started: Date.now(), newPowers: [],
    // rewards & replay
    upgrades: {},            // uid -> "heart" | "energy"
    spent: 0,                // gems spent at the merchant
    perks: {},               // perk id -> 1
    outfits: { owned: {}, wear: [null, null] },
    reveal: {},              // region index -> 1 (bought map)
    pins: [],                // "x,y" map cells the players marked
    bosses: {},              // region -> 1 once its guardian falls
    thief: {},               // sightings
    seenRegions: {},         // region intro scenes already played
    splits: {},              // power -> journey time when claimed (speedrun)
    combos: 0, ng: 0,
  });
  const MAX_SLOTS = 3;
  const keyFor = (slot) => slot > 1 ? KEY + "_s" + slot : KEY;

  class WorldRun {
    constructor() {
      this.gen = null;
      this.state = null;
      this._saveT = 0;
      this.slot = 1;
      this.lvl = null;
      this._wire();
    }

    /** Rewards and story beats arrive as events from inside the rooms. */
    _wire() {
      const b = GG.bus;
      const live = () => this.state && !this.remote;
      b.on("upgrade:found", (e) => {
        if (!live()) return;
        this.state.upgrades[e.uid] = e.kind;
        if (this.lvl) { this.applyPowers(this.lvl); for (const p of this.lvl.players) if (!p.dead) p.hp = p.maxHp; if (e.kind === "energy") this.lvl.energy = this.lvl.energyMax; }
        this.persist();
      });
      b.on("gems:bonus", (e) => { if (live()) this.state.gems += (e && e.n) || 0; });
      b.on("combo:finisher", (e) => {
        if (!live()) return;
        this.state.gems += 2; this.state.combos = (this.state.combos || 0) + 1;
        if (this.lvl && e) this.lvl.floatText(e.x, e.y - 24, "+2 ◆", "#ffcf4d");
      });
      b.on("boss:defeated", (e) => { if (live()) { this.state.bosses[e.region] = 1; this.persist(); } });
      b.on("thief:seen", (e) => { if (live()) this.state.thief[e.uid] = 1; });
      b.on("power:gained", (e) => { if (live() && e && e.power && this.state.splits[e.power] == null) this.state.splits[e.power] = this.state.timeMs; });
    }

    // ---- save slots --------------------------------------------------------
    get maxSlots() { return MAX_SLOTS; }
    useSlot(n) { this.slot = U.clamp(n | 0 || 1, 1, MAX_SLOTS); }
    _read(slot) {
      try { const raw = localStorage.getItem(keyFor(slot || this.slot)); if (!raw) return null; const s = JSON.parse(raw); return s && s.v === 1 ? s : null; } catch (_) { return null; }
    }
    /** What each slot holds, for the journey menu. */
    slotInfo(slot) {
      const s = this._read(slot); if (!s) return null;
      const w = this._world();
      return { pct: this._pctOf(s, w), powers: (s.powers || []).length, timeMs: s.timeMs || 0, done: !!s.done, ng: s.ng || 0,
               region: GG.WORLDGEN.REGIONS[w.rooms[s.room] ? w.rooms[s.room].region : 0].name };
    }

    _world() { return this.gen || (this.gen = GG.WORLDGEN.generate()); }

    // ---- persistence ----------------------------------------------------
    hasSave(slot) {
      const s = this._read(slot); return !!(s && !s.done);
    }
    savedSummary(slot) {
      try {
        const s = this._read(slot);
        const w = this._world();
        return { pct: this._pctOf(s, w), powers: s.powers.length, timeMs: s.timeMs, region: GG.WORLDGEN.REGIONS[w.rooms[s.room].region].name };
      } catch (_) { return null; }
    }
    load() {
      const s = this._read(this.slot);
      if (s) { this.state = Object.assign(blank(), s); this.state.outfits = Object.assign({ owned: {}, wear: [null, null] }, s.outfits || {}); return true; }
      return false;
    }
    persist() {
      if (!this.state || this.remote) return;
      try { localStorage.setItem(keyFor(this.slot), JSON.stringify(this.state)); } catch (_) {}
    }
    wipe(slot) { try { localStorage.removeItem(keyFor(slot || this.slot)); } catch (_) {} }

    // ---- lifecycle ------------------------------------------------------
    /** Begin a journey. fresh=true starts over; otherwise resumes the save. */
    begin(fresh, opts) {
      this._world();
      this.remote = false;
      opts = opts || {};
      if (fresh || !this.load()) {
        const prev = opts.ng ? this._read(this.slot) : null;
        this.state = blank();
        if (opts.ng) {
          // NEW GAME+: a harder world, and your wardrobe comes with you
          this.state.ng = ((prev && prev.ng) || 0) + 1;
          if (prev && prev.outfits) this.state.outfits = { owned: Object.assign({}, prev.outfits.owned), wear: (prev.outfits.wear || [null, null]).slice() };
        }
        this.persist();
      }
      return this.state;
    }
    /** Online client: mirror the host's journey (never writes a save). */
    mirror(info) {
      this._world();
      this.remote = true;
      if (!this.state) this.state = blank();
      if (info.powers) this.state.powers = info.powers.slice();
      if (info.disc) { this.state.disc = {}; for (const k of info.disc) this.state.disc[k] = 1; }
      if (info.room != null) this.state.room = info.room;
      if (info.timeMs != null) this.state.timeMs = info.timeMs;
      for (const k of ["upgrades", "perks", "outfits", "reveal", "bosses", "pins", "gems", "spent", "ng", "seenRegions"]) if (info[k] != null) this.state[k] = info[k];
    }
    syncInfo() {
      const s = this.state;
      return { world: true, room: s.room, door: s.door, powers: s.powers.slice(), disc: Object.keys(s.disc), timeMs: s.timeMs,
               upgrades: s.upgrades, perks: s.perks, outfits: s.outfits, reveal: s.reveal, bosses: s.bosses, pins: s.pins, gems: s.gems, spent: s.spent, ng: s.ng, seenRegions: s.seenRegions };
    }

    // ---- rewards -------------------------------------------------------------
    get wallet() { return Math.max(0, (this.state.gems || 0) - (this.state.spent || 0)); }
    count(kind) { return Object.values(this.state.upgrades || {}).filter(k => k === kind).length; }
    /** Spend gems at the merchant. Returns false if you can't afford it. */
    buy(price) { if (this.wallet < price) return false; this.state.spent += price; this.persist(); return true; }
    /** Per region: gems gathered / total, upgrades found / total. */
    secrets() {
      const w = this._world(), s = this.state;
      const out = GG.WORLDGEN.REGIONS.map(() => ({ gems: 0, gemsT: 0, up: 0, upT: 0 }));
      for (const r of w.rooms) {
        const d = w.def(r.id), saved = s.rooms[r.id];
        for (const o of d.objects) if (o.type === "gem") { out[r.region].gemsT++; if (saved && saved.objs && saved.objs[o.id]) out[r.region].gems++; }
      }
      for (const u of w.extras.list) { out[u.region].upT++; if (s.upgrades[u.uid]) out[u.region].up++; }
      return out;
    }
    /** Shrines you can fast-travel to (visited, guardian beaten) + the start. */
    travelSpots() {
      const w = this._world(), s = this.state, out = [];
      for (const r of w.rooms) {
        const seen = w.cells.some(c => c.room === r.id && s.disc[c.key]);
        if (!seen) continue;
        if (r.kind === "start") out.push({ room: r.id, door: -1, name: "The Waking Hollow" });
        else if (r.kind === "shrine" && (s.bosses[r.region] || this.hasPower(r.power))) out.push({ room: r.id, door: 0, name: "Shrine of " + GG.WORLDGEN.POWERS[r.power].name });
      }
      return out;
    }
    canFastTravelFrom(roomId) {
      const r = this._world().rooms[roomId];
      return !!r && (r.kind === "start" || (r.kind === "shrine" && !!(this.state.bosses[r.region] || this.hasPower(r.power))));
    }

    get world() { return this._world(); }
    get room() { return this._world().rooms[this.state.room]; }
    get region() { return GG.WORLDGEN.REGIONS[this.room.region]; }
    hasPower(p) { return !!this.state && this.state.powers.includes(p); }

    _pctOf(s, w) {
      let n = 0; for (const c of w.cells) if (s.disc[c.key]) n++;
      return Math.floor((n / w.totalCells) * 1000) / 10;
    }
    get discovered() { let n = 0; const w = this._world(); for (const c of w.cells) if (this.state.disc[c.key]) n++; return n; }
    get percent() { return this._pctOf(this.state, this._world()); }
    get complete() { return this.discovered >= this._world().totalCells; }

    // ---- building rooms ----------------------------------------------------
    /**
     * Build the Level for a room. `door` is the doorway index the party
     * arrives through (-1 = the room's default spawn).
     */
    /** Fill in any fields an older (or hand-built) journey state is missing. */
    _norm() {
      const s = this.state; if (!s) return;
      const b = blank();
      for (const k in b) if (s[k] === undefined) s[k] = b[k];
    }

    makeLevel(roomId, door, cam, fx, charAssign) {
      this._norm();
      const w = this._world();
      this.state.room = roomId; this.state.door = door;
      const def = w.def(roomId);
      const room = w.rooms[roomId];
      // deep-ish copy of the object list so live objects never mutate the def
      const data = Object.assign({}, def, { objects: def.objects.map(o => Object.assign({}, o)) });
      // shrine already claimed? then its guardian is long gone and the escape is over
      const st = this.state;
      const claimed = data.objects.some(o => o.type === "shrine" && this.hasPower(o.power));
      for (const o of data.objects) {
        if (o.type === "shrine" && this.hasPower(o.power)) o.taken = true;
        if (claimed && o.type === "arena" && o.boss) o.cleared = true;
        if (o.type === "upgrade" && st.upgrades[o.uid]) o.taken = true;
        if (o.type === "thief" && st.thief[o.uid]) o.seen = true;
      }
      // NEW GAME+: wilder beasts
      if (st.ng) {
        let k = 0;
        for (const o of data.objects) if (["beetle", "toad", "bat", "spitter", "moth", "rat", "guardian"].includes(o.type)) {
          o.tough = (o.tough || 1) * (1 + 0.5 * st.ng);
          if (o.type !== "guardian" && (k++ % 3 === 0)) o.elite = true;
        }
      }
      // arrival spots (feet positions -> top-left spawns)
      const arr = (door >= 0 && def.arrivals[door]) || def.startSpawn || def.arrivals[0] || null;
      const heights = charAssign.map(ci => (GG.Player.CHARACTERS[ci] || {}).height || 28);
      if (arr) data.spawns = arr.map((a, k) => ({ x: a.x, y: a.y - heights[k] - 1 }));
      else data.spawns = [{ x: 3 * T, y: 15 * T - heights[0] }, { x: 4 * T, y: 15 * T - heights[1] }];
      const lvl = new GG.Level(data, cam, fx, charAssign);
      lvl.world = this; lvl.roomId = roomId; lvl.powers = this.state.powers;
      this.lvl = lvl;
      if (claimed) for (const o of lvl.objects) { if (o.guardian) o.alive = false; if (O.EscapeRun && o instanceof O.EscapeRun) o.state = 2; }
      if (def.style) lvl.tilemap.setStyle(def.style, def.theme);
      if (lvl.buildDecor) lvl.buildDecor();
      // restore what the heroes changed here before
      const saved = this.state.rooms[roomId];
      if (saved) this._restore(lvl, saved);
      // a doorway you arrive through is disarmed until you step out of it
      for (const o of lvl.objects) if (o instanceof GG.obj.Passage) o.armed = false;
      this.applyPowers(lvl);
      lvl.beginTiming();
      lvl.timeMs = this.state.timeMs;
      // record the entry cell immediately
      this.discover(lvl);
      return lvl;
    }

    _restore(lvl, s) {
      lvl.channels = Object.assign({}, s.ch || {});
      lvl.keys = Object.assign({}, s.keys || {});
      if (s.objs) for (const o of lvl.objects) if (s.objs[o.id] !== undefined && o.setState) o.setState(s.objs[o.id]);
      if (s.broken) lvl.tilemap._broken = new Set(s.broken);
      // an arena that was cleared stays cleared — its beasts stay down
      for (const o of lvl.objects) if (o instanceof GG.obj.ArenaSeal && o.state === 2) {
        for (const id of o.members) { const m = lvl.byId(id); if (m) { m.alive = false; m.deadRat = true; } }
      }
    }

    /** Remember a room's changed state (not its roaming wildlife, which returns). */
    captureRoom(lvl) {
      if (!lvl || lvl.roomId == null || this.remote) return;
      const objs = {};
      const arenaIds = new Set();
      for (const o of lvl.objects) if (o instanceof GG.obj.ArenaSeal) for (const id of o.members) arenaIds.add(id);
      for (const o of lvl.objects) {
        if ((o instanceof GG.obj.Creature || o instanceof GG.obj.Rat) && !arenaIds.has(o.id)) continue;   // wildlife respawns
        if (o instanceof GG.obj.Passage) continue;
        // (objects can keep a separate, smaller SAVE state from their live network state)
        const st = o.saveState ? o.saveState() : o.getState ? o.getState() : null;
        if (st !== null && st !== undefined) objs[o.id] = st;
      }
      // a battle in progress resets if you leave
      for (const o of lvl.objects) if (o instanceof GG.obj.ArenaSeal && o.state === 1) {
        objs[o.id] = 0;
        for (const id of o.members) { delete objs[id]; }
      }
      this.state.rooms[lvl.roomId] = { ch: Object.assign({}, lvl.channels), keys: Object.assign({}, lvl.keys), objs, broken: Array.from(lvl.tilemap._broken) };
    }

    /** Give each hero exactly the abilities the journey has unlocked. */
    applyPowers(lvl) {
      this._norm();
      const has = (p) => this.hasPower(p);
      for (const pl of lvl.players) {
        const base = pl.baseChar || pl.character;
        pl.baseChar = base;
        const c = Object.assign({}, base);
        c.canShoot = has("arms");
        c.canWallJump = has("wallgrip");
        if (base.id === "nibihah") {
          c.maxJumps = has("skystep") ? 2 : 1;
          c.canDash = has("winddash");
          c.canSwing = has("swing");
        } else {
          c.canCarry = has("strongarms");
          c.canGrapple = has("grapple");
          c.canTele = has("tele");
          c.canBuild = false;
        }
        pl.character = c;
        if (pl.jumpsLeft > c.maxJumps) pl.jumpsLeft = c.maxJumps;
        // hearts: 3, +1 per Heart Crystal, +1 Thick Skin, +2 in Assist mode
        const st = this.state, gp = (GG.save && GG.save.settings.gameplay) || {};
        const maxHp = 3 + this.count("heart") + (st.perks.skin ? 1 : 0) + (gp.assist ? 2 : 0);
        const gain = maxHp - (pl.maxHp || 3);
        pl.maxHp = maxHp; pl.hp = U.clamp((pl.hp == null ? maxHp : pl.hp) + Math.max(0, gain), 1, maxHp);
        const idx = lvl.players.indexOf(pl);
        pl.outfit = (st.outfits && st.outfits.wear && st.outfits.wear[idx]) || null;
      }
      const st = this.state, gp = (GG.save && GG.save.settings.gameplay) || {};
      lvl.energyMax = 100 + 20 * this.count("energy");
      if (lvl.energy > lvl.energyMax || lvl.energy == null) lvl.energy = lvl.energyMax;
      lvl.energyRegen = st.perks.recover ? 1.6 : 1;
      lvl.meleeMul = st.perks.hitter ? 1.5 : 1;
      lvl.magnet = st.perks.magnet ? 130 : 0;
      lvl.hazardScale = (gp.assist ? 0.72 : 1) * (st.ng ? 1 + 0.12 * Math.min(3, st.ng) : 1);
      lvl.powers = this.state.powers;
    }

    grantPower(power, lvl) {
      if (!power || this.hasPower(power)) return false;
      this.state.powers.push(power);
      if (lvl) { this.applyPowers(lvl); this.captureRoom(lvl); }
      this.persist();
      return true;
    }

    /** Mark the map cells the heroes stand in. Returns true if anything new. */
    discover(lvl) {
      const room = this._world().rooms[lvl.roomId];
      let fresh = false;
      for (const p of lvl.players) {
        if (p.dead) continue;
        const i = Math.max(0, Math.min(room.w - 1, Math.floor(p.cx / (GG.WORLDGEN.CW * T))));
        const j = Math.max(0, Math.min(room.h - 1, Math.floor(p.cy / (GG.WORLDGEN.CH * T))));
        const k = (room.x + i) + "," + (room.y + j);
        if (!this.state.disc[k]) { this.state.disc[k] = 1; fresh = true; }
      }
      return fresh;
    }

    /** Per-frame bookkeeping while exploring. */
    tick(lvl, dt) {
      if (!this.state || this.remote) return false;
      this.state.timeMs = lvl.timeMs;
      const fresh = this.discover(lvl);
      this._saveT += dt;
      if (fresh || this._saveT > 8) { this._saveT = 0; this.captureRoom(lvl); this.persist(); }
      return fresh;
    }

    /** Where does this doorway lead? -> {room, door} */
    destination(roomId, doorIdx) {
      const w = this._world();
      const d = w.rooms[roomId].doors[doorIdx];
      const dest = w.rooms[d.to];
      return { room: d.to, door: dest.doors.indexOf(d.pair) };
    }

    /** Lock state of a doorway for the map (gates you haven't opened yet). */
    doorOpenOnMap(roomId, doorIdx) {
      const d = this._world().rooms[roomId].doors[doorIdx];
      return !d.lock || this.hasPower(d.lock);
    }
  }

  GG.world = new WorldRun();
})(window);
