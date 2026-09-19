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
  const T = C.TILE;

  const blank = () => ({
    v: 1, seed: GG.WORLDGEN.SEED, room: 0, door: -1, powers: [], disc: {}, rooms: {},
    timeMs: 0, deaths: 0, gems: 0, slain: 0, done: false, started: Date.now(), newPowers: [],
  });

  class WorldRun {
    constructor() {
      this.gen = null;
      this.state = null;
      this._saveT = 0;
    }

    _world() { return this.gen || (this.gen = GG.WORLDGEN.generate()); }

    // ---- persistence ----------------------------------------------------
    hasSave() {
      try { const raw = localStorage.getItem(KEY); if (!raw) return false; const s = JSON.parse(raw); return !!(s && s.v === 1 && !s.done); } catch (_) { return false; }
    }
    savedSummary() {
      try {
        const s = JSON.parse(localStorage.getItem(KEY));
        const w = this._world();
        return { pct: this._pctOf(s, w), powers: s.powers.length, timeMs: s.timeMs, region: GG.WORLDGEN.REGIONS[w.rooms[s.room].region].name };
      } catch (_) { return null; }
    }
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) { this.state = Object.assign(blank(), s); return true; } }
      } catch (_) {}
      return false;
    }
    persist() {
      if (!this.state || this.remote) return;
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (_) {}
    }
    wipe() { try { localStorage.removeItem(KEY); } catch (_) {} }

    // ---- lifecycle ------------------------------------------------------
    /** Begin a journey. fresh=true starts over; otherwise resumes the save. */
    begin(fresh) {
      this._world();
      this.remote = false;
      if (fresh || !this.load()) { this.state = blank(); this.persist(); }
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
    }
    syncInfo() {
      return { world: true, room: this.state.room, door: this.state.door, powers: this.state.powers.slice(), disc: Object.keys(this.state.disc), timeMs: this.state.timeMs };
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
    makeLevel(roomId, door, cam, fx, charAssign) {
      const w = this._world();
      this.state.room = roomId; this.state.door = door;
      const def = w.def(roomId);
      const room = w.rooms[roomId];
      // deep-ish copy of the object list so live objects never mutate the def
      const data = Object.assign({}, def, { objects: def.objects.map(o => Object.assign({}, o)) });
      // shrine already claimed?
      for (const o of data.objects) if (o.type === "shrine" && this.hasPower(o.power)) o.taken = true;
      // arrival spots (feet positions -> top-left spawns)
      const arr = (door >= 0 && def.arrivals[door]) || def.startSpawn || def.arrivals[0] || null;
      const heights = charAssign.map(ci => (GG.Player.CHARACTERS[ci] || {}).height || 28);
      if (arr) data.spawns = arr.map((a, k) => ({ x: a.x, y: a.y - heights[k] - 1 }));
      else data.spawns = [{ x: 3 * T, y: 15 * T - heights[0] }, { x: 4 * T, y: 15 * T - heights[1] }];
      const lvl = new GG.Level(data, cam, fx, charAssign);
      lvl.world = this; lvl.roomId = roomId; lvl.powers = this.state.powers;
      if (def.style) lvl.tilemap.setStyle(def.style);
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
        const st = o.getState ? o.getState() : null;
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
      }
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
