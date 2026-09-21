/* =========================================================================
 * guardians.js — the big moments, and the people you meet
 * -------------------------------------------------------------------------
 *   • GUARDIANS: every shrine is guarded by a boss that fights the way its
 *     region plays (a crystal golem that slams the cave floor, a serpent
 *     that sweeps the ruins with water, a storm bird that dives from the
 *     sky…). Each one telegraphs its attacks, then tires out — that is the
 *     moment to strike (double damage).
 *   • ESCAPES: claiming a power wakes the region. Water, fire, thorns, an
 *     avalanche… chase the heroes back out of the shrine. Both must make it.
 *   • Rubble that crashes down during an escape.
 *   • UPGRADES hidden around the world: Heart Crystals (+1 heart for both)
 *     and Energy Cells (+20 shared energy).
 *   • NPCs with something to say, the travelling MERCHANT, and glimpses of a
 *     hooded THIEF who always seems to be one room ahead.
 *   • Outfits (hats and trinkets) the merchant sells.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C, O = GG.obj;
  const T = C.TILE;
  const EXT = GG.OBJ_EXT = GG.OBJ_EXT || {};
  const Creature = O.Creature, GObj = O.GObj;
  if (!Creature) return;                     // (classic-only builds without the open world)

  /* ---- Level helper: add an object mid-play (minions, rubble) ---------- */
  GG.Level.prototype.addObject = function (cfg) {
    if (cfg.id != null && this.byId(cfg.id)) return this.byId(cfg.id);
    (this._dyn = this._dyn || []).push(Object.assign({}, cfg));
    const before = this.objects.length;
    this._spawn(cfg);
    const o = this.objects[before];
    if (!o) return null;
    if (typeof o.kills === "function" && !(o instanceof O.Hazard)) this.movingHazards.push(o);
    if (o.hittable) this.hittables.push(o);
    if (typeof o.affectPlayers === "function") this.envObjs.push(o);
    return o;
  };

  /* =====================================================================
   * GUARDIANS
   * =================================================================== */
  const GUARDIANS = [
    { key: "golem",   name: "Crystal Golem",    title: "Guardian of the Whispering Caves", hp: 22, w: 56, h: 64, move: "ground", attacks: ["slam", "rain", "charge"],                 col: "#6ec3ff", dark: "#24365c", shot: "#9fe0ff" },
    { key: "serpent", name: "Tide Serpent",     title: "Guardian of the Sunken Ruins",     hp: 28, w: 50, h: 60, move: "float",  attacks: ["volley", "sweepLow", "rain"],             col: "#5fd0c0", dark: "#1d4a4a", shot: "#9ff0ff" },
    { key: "queen",   name: "Thorn Queen",      title: "Guardian of the Verdant Wilds",    hp: 32, w: 56, h: 60, move: "float",  attacks: ["volley", "summon", "rain"],               col: "#7cd46a", dark: "#2a4a22", shot: "#caff7a" },
    { key: "titan",   name: "Furnace Titan",    title: "Guardian of the Ironworks",        hp: 36, w: 60, h: 66, move: "ground", attacks: ["charge", "slam", "sweepHigh"],            col: "#ff9a4d", dark: "#4a2a24", shot: "#ffcf7a" },
    { key: "yeti",    name: "Frost Yeti",       title: "Guardian of Frostpeak",            hp: 40, w: 58, h: 64, move: "ground", attacks: ["slam", "rain", "charge"],                 col: "#dff4ff", dark: "#5a7aa8", shot: "#dff4ff" },
    { key: "idol",    name: "Sun Idol",         title: "Guardian of the Great Temple",     hp: 44, w: 56, h: 56, move: "float",  attacks: ["sweepLow", "volley", "sweepHigh", "rain"], col: "#f2c14e", dark: "#6a4a1e", shot: "#ffe79a" },
    { key: "roc",     name: "Storm Roc",        title: "Guardian of the Sky Isles",        hp: 48, w: 64, h: 40, move: "fly",    attacks: ["swoop", "volley", "rain"],                col: "#a9aeff", dark: "#3a3e70", shot: "#e0e4ff" },
    { key: "heart",   name: "The Hollow Heart", title: "Warden of the Heart of Aether",    hp: 60, w: 64, h: 64, move: "float",  attacks: ["volley", "sweepLow", "summon", "slam", "rain", "sweepHigh"], col: "#c79bff", dark: "#3a1a5c", shot: "#e0c8ff" },
  ];
  GG.GUARDIANS = GUARDIANS;

  class Guardian extends Creature {
    constructor(cfg) {
      const G = GUARDIANS[cfg.region || 0] || GUARDIANS[0];
      super(cfg, { w: G.w, h: G.h, hp: G.hp });
      this.G = G; this.guardian = true; this.stunImmune = true;
      this.flying = G.move !== "ground";
      this.st = "sleep"; this.stT = 0; this.atkI = 0; this.phase2 = false;
      this.marks = []; this.beam = null; this.dir = -1; this.air = false;
      this.hoverY = cfg.hoverY || (6 * T);
      this.blood = G.col;
    }
    get vulnerable() { return this.st === "tired"; }
    hitRect() { return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 6 }; }
    // touching it hurts, except while it's dazed (that's your opening)
    kills() { return this.alive && this.awake === true && this.st !== "intro" && this.st !== "tired"; }

    takeHit(level, dmg, fromDir) {
      if (!this.alive || this.st === "sleep" || this.st === "intro") return;
      let d = (dmg || 1) * (this.vulnerable ? 2 : 1) * (level.guardianDmg || 1);
      this.hp -= d; this._flash = 0.15;
      GG.bus.emit("hit:stop", { s: this.hp <= 0 ? 0.25 : 0.03 });
      level.fx.burst({ x: this.cx, y: this.cy, count: this.vulnerable ? 12 : 6, color: [this.G.col, "#fff"], speed: 120, life: 0.3, glow: true });
      if (this.vulnerable && Math.random() < 0.35) level.floatText(this.cx, this.y - 8, "WEAK POINT!", "#ffe79a");
      if (!this.phase2 && this.hp < this.maxHp * 0.5) {
        this.phase2 = true;
        level.floatText(this.cx, this.y - 20, "ENRAGED", "#ff8a8a");
        GG.bus.emit("boss:phase", {});
        level.cam.shake(0.35);
      }
      if (this.hp <= 0) this.die(level);
    }
    die(level) {
      this.alive = false; this.beam = null; this.marks = [];
      level.hostiles = level.hostiles.filter(h => !h.boss);
      for (const o of level.objects) if (o.minionOf === this.id && o.alive) o.die(level);
      GG.bus.emit("boss:defeated", { region: this.region, name: this.G.name });
      GG.bus.emit("gems:bonus", { n: 10 });
      level.floatText(this.cx, this.y - 10, this.G.name + " falls!  +10 ◆", "#ffe79a");
      level.cam.shake(0.9);
      for (let i = 0; i < 4; i++) level.fx.burst({ x: this.cx + U.rand(-20, 20), y: this.cy + U.rand(-20, 20), count: 30, color: [this.G.col, "#fff", this.G.shot], speed: 260, life: 1.1, gravity: 200, glow: true });
      if (GG.input && GG.input.rumble) { GG.input.rumble(0, 1, 1, 500); GG.input.rumble(1, 1, 1, 500); }
    }
    reset() {
      super.reset(); this.st = "sleep"; this.marks = []; this.beam = null; this.phase2 = false; this.atkI = 0;
    }

    _target(level) {
      let best = null, bd = 1e9;
      for (const p of level.players) { if (p.dead) continue; const d = Math.abs(p.cx - this.cx); if (d < bd) { bd = d; best = p; } }
      return best;
    }
    _shoot(level, x, y, vx, vy, extra) {
      level.hostiles.push(Object.assign({ x, y, vx, vy, r: 6, life: 3, color: this.G.shot, kind: "orb", boss: true, dmg: 1 }, extra || {}));
    }
    _pick() {
      const a = this.G.attacks;
      const k = a[this.atkI % a.length]; this.atkI++;
      return k;
    }
    _float(level, dt, tx, ty, k) {
      this.x = U.damp(this.x, tx - this.w / 2, k || 2, dt);
      this.y = U.damp(this.y, ty, k || 2, dt);
    }

    update(dt, level) {
      if (!this.alive) return;
      this.t += dt; this.stT += dt; this._flash = Math.max(0, this._flash - dt);
      const G = this.G, fast = this.phase2 ? 1.3 : 1;
      const floorY = this.floorY, ax0 = this.ax0, ax1 = this.ax1;
      if (this.awake !== true) {
        if (this.st !== "sleep") this.reset();
        if (!this.flying) this.walk(level, dt);
        return;
      }
      if (this.st === "sleep") { this.setMode("intro"); GG.bus.emit("boss:start", { name: G.name, title: G.title }); level.cam.shake(0.5); }
      const tgt = this._target(level);
      if (tgt) this.dir = Math.sign(tgt.cx - this.cx) || this.dir;
      // marks (rain warnings) tick down and drop
      for (const m of this.marks) {
        m.t -= dt;
        if (m.t <= 0 && !m.done) { m.done = true; this._shoot(level, m.x, 2 * T + 8, 0, 40, { kind: "rock", r: 10, grav: 900, life: 3 }); }
      }
      this.marks = this.marks.filter(m => !m.done);
      // the beam (sweeps): warn, then burn
      if (this.beam) {
        this.beam.t -= dt;
        if (this.beam.t <= 0 && !this.beam.live) { this.beam.live = true; this.beam.t = 0.6; GG.bus.emit("boss:beam", {}); level.cam.shake(0.2); }
        else if (this.beam.t <= 0 && this.beam.live) this.beam = null;
        if (this.beam && this.beam.live) {
          const r = { x: ax0, y: this.beam.y - 6, w: ax1 - ax0, h: 12 };
          for (const p of level.players) if (!p.dead && U.aabb(p, r)) p.hurt(level, 1, this.cx);
        }
      }
      const hoverX = tgt ? U.clamp(tgt.cx, ax0 + 80, ax1 - 80) : (ax0 + ax1) / 2;
      switch (this.st) {
        case "intro":
          if (this.flying) this._float(level, dt, (ax0 + ax1) / 2, this.hoverY, 2);
          if (this.stT > 1.4) this.setMode("think");
          break;
        case "think":
          if (this.flying) this._float(level, dt, hoverX, this.hoverY + Math.sin(this.t * 2) * 12, 1.4);
          else this.vx = U.damp(this.vx, this.dir * 60 * fast, 4, dt);
          if (this.stT > (this.phase2 ? 0.6 : 1.0)) this.setMode(this._pick());
          break;
        case "tired":
          if (this.flying) this._float(level, dt, this.cx, floorY - this.h - 2, 4);      // sinks down, within reach
          else this.vx = U.damp(this.vx, 0, 8, dt);
          if (this.stT > (this._tiredFor || 1.4)) { this._tiredFor = 0; this.setMode("think"); }
          break;

        // ---- SLAM: leap and crash, sending shockwaves along the floor ----
        case "slam":
          if (this.flying) {
            if (!this.air) { this._float(level, dt, this.cx, floorY - this.h, 6); if (this.y > floorY - this.h - 6) { this.air = true; this._wave(level, fast); } }
            if (this.stT > 1.3) { this.air = false; this.setMode("tired"); }
            break;
          }
          if (this.stT < 0.45) { this.vx = 0; }
          else if (!this.air) { this.vy = -620; this.vx = U.clamp((tgt ? tgt.cx - this.cx : 0) * 1.1, -260, 260); this.air = true; this.onGround = false; }
          else if (this.onGround && this.stT > 0.6) { this.air = false; this.vx = 0; this._wave(level, fast); this.setMode("tired"); }
          break;

        // ---- RAIN: marked columns, then rocks / icicles / seeds fall ------
        case "rain": {
          if (this.stT < dt * 1.5) {
            const n = this.phase2 ? 6 : 4;
            const xs = [];
            for (const p of level.players) if (!p.dead) xs.push(p.cx);
            while (xs.length < n) xs.push(U.rand(ax0 + 40, ax1 - 40));
            this.marks = xs.slice(0, n).map((x, i) => ({ x: U.clamp(x + U.rand(-20, 20), ax0 + 20, ax1 - 20), t: 0.9 + i * 0.12 }));
            GG.bus.emit("boss:rain", {});
          }
          if (this.flying) this._float(level, dt, (ax0 + ax1) / 2, this.hoverY - 20, 2);
          else this.vx = U.damp(this.vx, 0, 6, dt);
          if (this.stT > 1.9) this.setMode("tired");
          break;
        }

        // ---- VOLLEY: fans of shots aimed at the nearest hero -------------
        case "volley": {
          if (this.flying) this._float(level, dt, hoverX, this.hoverY, 1.5);
          const shots = [0.5, 1.1].concat(this.phase2 ? [1.7] : []);
          for (const at of shots) if (this.stT - dt < at && this.stT >= at && tgt) {
            const n = this.phase2 ? 5 : 3, base = Math.atan2(tgt.cy - this.cy, tgt.cx - this.cx);
            for (let i = 0; i < n; i++) {
              const a = base + (i - (n - 1) / 2) * 0.22, sp = 230 * fast;
              this._shoot(level, this.cx, this.cy, Math.cos(a) * sp, Math.sin(a) * sp);
            }
            GG.bus.emit("creature:spit", {});
          }
          if (this.stT > shots[shots.length - 1] + 0.5) this.setMode("tired");
          break;
        }

        // ---- SWEEPS: a beam across the arena — jump the low one, stay down for the high one
        case "sweepLow": case "sweepHigh":
          if (this.stT < dt * 1.5) this.beam = { y: this.st === "sweepLow" ? floorY - 14 : floorY - 58, t: 0.95 / fast, live: false };
          if (this.flying) this._float(level, dt, this.cx, this.hoverY, 2);
          else this.vx = 0;
          if (!this.beam && this.stT > 0.5) this.setMode("tired");
          break;

        // ---- CHARGE: dig in, then barrel across — jump over or roll through
        case "charge":
          if (this.stT < 0.6) { this.vx = 0; this._chDir = this.dir; }
          else {
            this.vx = this._chDir * 380 * fast;
            if (Math.random() < 0.4) level.fx.burst({ x: this.cx - this._chDir * 20, y: this.y + this.h, count: 2, color: G.col, speed: 60, life: 0.3 });
            const hitWall = this.wallAhead(level, this._chDir) || (this._chDir < 0 ? this.x < ax0 + 4 : this.x + this.w > ax1 - 4);
            if (hitWall) {
              this.vx = -this._chDir * 80; level.cam.shake(0.4); GG.bus.emit("boss:crash", {});
              level.fx.burst({ x: this.cx + this._chDir * this.w / 2, y: this.cy, count: 20, color: ["#fff", G.col], speed: 180, life: 0.5 });
              this._tiredFor = 2.0; this.setMode("tired");
            } else if (this.stT > 3) this.setMode("tired");
          }
          break;

        // ---- SUMMON: call two of the region's creatures ------------------
        case "summon":
          if (this.flying) this._float(level, dt, (ax0 + ax1) / 2, this.hoverY - 20, 2);
          if (this.stT - dt < 0.6 && this.stT >= 0.6) {
            const alive = level.objects.filter(o => o.minionOf === this.id && o.alive).length;
            const kinds = (GG.WORLDGEN.REGIONS[this.region].creatures || []).filter(k => k !== "bat" && k !== "moth");
            for (let i = 0; i < 2 && alive + i < 3; i++) {
              const kind = kinds.length ? kinds[(this.atkI + i) % kinds.length] : "beetle";
              const h = { beetle: 20, toad: 22, rat: 14, spitter: 26 }[kind] || 20;
              const x = i === 0 ? ax0 + 30 : ax1 - 60;
              const m = level.addObject({ type: kind, id: this.id * 10 + 100 + (this._minN = (this._minN || 0) + 1), x, y: floorY - h - 2, tough: 0.8, seed: 7 + i, dir: i ? -1 : 1 });
              if (m) { m.minionOf = this.id; m.awake = true; level.fx.burst({ x: m.cx, y: m.cy, count: 16, color: [G.col, "#fff"], speed: 120, life: 0.5, glow: true }); }
            }
            GG.bus.emit("boss:summon", {});
          }
          if (this.stT > 1.4) this.setMode("tired");
          break;

        // ---- SWOOP: the storm bird dives at you --------------------------
        case "swoop":
          if (this.stT < 0.5) { this._float(level, dt, hoverX, this.hoverY - 30, 3); if (tgt) this._sw = { x: tgt.cx - this.w / 2, y: floorY - this.h - 4 }; }
          else if (this.stT < 1.3 && this._sw) {
            const dx = this._sw.x - this.x, dy = this._sw.y - this.y, d = Math.hypot(dx, dy) || 1;
            const sp = 520 * fast * dt;
            if (d > sp) { this.x += dx / d * sp; this.y += dy / d * sp; } else { this.x = this._sw.x; this.y = this._sw.y; }
          } else { this._sw = null; this._tiredFor = 1.1; this.setMode("tired"); }
          break;
      }
      if (!this.flying) {
        this.walk(level, dt);
        this.x = U.clamp(this.x, ax0, ax1 - this.w);
      } else {
        this.x = U.clamp(this.x, ax0, ax1 - this.w);
        this.y = U.clamp(this.y, 2 * T, floorY - this.h);
      }
    }
    _wave(level, fast) {
      const y = this.floorY - 12;
      for (const d of [-1, 1]) this._shoot(level, this.cx + d * this.w * 0.4, y, d * 280 * fast, 0, { kind: "wave", r: 11, life: 2.6 });
      level.cam.shake(0.45); GG.bus.emit("boss:slam", {});
      if (GG.input && GG.input.rumble) { GG.input.rumble(0, 0.6, 0.6, 180); GG.input.rumble(1, 0.6, 0.6, 180); }
      level.fx.burst({ x: this.cx, y: this.floorY, count: 24, color: [this.G.col, "#fff"], speed: 200, life: 0.5, angle: -Math.PI / 2, spread: 2.4, gravity: 400 });
    }

    render(ctx, level) {
      if (!this.alive) return;
      const G = this.G, t = this.t;
      // rain warnings: flashing columns from the ceiling
      for (const m of this.marks) {
        ctx.fillStyle = `rgba(255,90,106,${0.12 + Math.abs(Math.sin(t * 14)) * 0.18})`;
        ctx.fillRect(m.x - 10, 2 * T, 20, this.floorY - 2 * T);
      }
      // sweeping beam
      if (this.beam) {
        ctx.save();
        if (!this.beam.live) {
          ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(t * 24)); ctx.strokeStyle = "#ff8a8a"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.moveTo(this.ax0, this.beam.y); ctx.lineTo(this.ax1, this.beam.y); ctx.stroke();
        } else {
          ctx.strokeStyle = G.shot; ctx.shadowBlur = 18; ctx.shadowColor = "#ff5a6a"; ctx.lineWidth = 10 + Math.sin(t * 50) * 2;
          ctx.beginPath(); ctx.moveTo(this.ax0, this.beam.y); ctx.lineTo(this.ax1, this.beam.y); ctx.stroke();
          ctx.strokeStyle = "#ff5a6a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(this.ax0, this.beam.y); ctx.lineTo(this.ax1, this.beam.y); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      this.flashAlpha(ctx);
      const cx = this.cx, by = this.y + this.h, W = this.w, H = this.h;
      const sleeping = this.st === "sleep";
      const tired = this.st === "tired";
      const wind = (this.st === "charge" || this.st === "slam" || this.st === "swoop") && this.stT < 0.6 ? Math.sin(t * 70) * 2 : 0;
      ctx.translate(cx + wind, by); ctx.scale(this.dir, 1);
      if (sleeping) ctx.globalAlpha *= 0.85;
      const body = (col) => { ctx.fillStyle = col; };
      const eye = (x, y, r) => {
        ctx.fillStyle = sleeping ? "#222" : tired ? "#ffe79a" : "#ff4d5e";
        ctx.shadowBlur = sleeping ? 0 : 12; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      };
      switch (G.key) {
        case "golem": {
          body(G.dark); ctx.fillRect(-W / 2 + 6, -H + 14, W - 12, H - 24);
          body(G.col); for (const [x, h] of [[-20, 22], [-6, 30], [8, 24], [18, 16]]) { ctx.beginPath(); ctx.moveTo(x - 6, -H + 16); ctx.lineTo(x, -H + 16 - h); ctx.lineTo(x + 6, -H + 16); ctx.fill(); }
          body("#1a2440"); ctx.fillRect(-W / 2, -H + 26, 10, 26); ctx.fillRect(W / 2 - 10, -H + 26, 10, 26);
          ctx.fillRect(-16, -12, 12, 12); ctx.fillRect(4, -12, 12, 12);
          eye(10, -H + 30, 3.5);
          break;
        }
        case "serpent": {
          const sw = Math.sin(t * 3) * 6;
          body(G.dark);
          ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-20 + sw, -H * 0.5, -4, -H + 14); ctx.lineTo(14, -H + 18); ctx.quadraticCurveTo(0 + sw, -H * 0.5, 12, 0); ctx.fill();
          body(G.col); ctx.beginPath(); ctx.ellipse(6, -H + 14, 18, 11, 0.2, 0, Math.PI * 2); ctx.fill();
          body("#dff"); for (let i = 0; i < 4; i++) ctx.fillRect(-6 + sw * 0.3, -H * 0.3 - i * 9, 10, 2);
          eye(14, -H + 11, 3);
          break;
        }
        case "queen": {
          body("#3a5a2a"); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.3; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 22, -H / 2 + Math.sin(a) * 18, 16, 7, a, 0, Math.PI * 2); ctx.fill(); }
          body("#ff7ac8"); ctx.beginPath(); ctx.arc(0, -H / 2, 17, 0, Math.PI * 2); ctx.fill();
          body(G.col); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, -H / 2 + Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * 30, -H / 2 + Math.sin(a) * 30); ctx.lineTo(Math.cos(a + 0.12) * 12, -H / 2 + Math.sin(a + 0.12) * 12); ctx.fill(); }
          eye(-5, -H / 2 - 2, 3); eye(6, -H / 2 - 2, 3);
          break;
        }
        case "titan": {
          body(G.dark); ctx.fillRect(-W / 2 + 4, -H + 8, W - 8, H - 18);
          const glow = 0.6 + Math.sin(t * 6) * 0.3;
          ctx.fillStyle = `rgba(255,${120 + glow * 60},60,${glow})`; ctx.fillRect(-12, -H + 26, 24, 18);
          body("#2a1a18"); ctx.fillRect(-W / 2 - 4, -H + 20, 10, 30); ctx.fillRect(W / 2 - 6, -H + 20, 10, 30);
          ctx.fillRect(-18, -12, 14, 12); ctx.fillRect(4, -12, 14, 12);
          body("#6a5a70"); ctx.fillRect(-8, -H, 7, 12); ctx.fillRect(3, -H - 4, 7, 16);
          eye(14, -H + 16, 3.5);
          break;
        }
        case "yeti": {
          body(G.col); ctx.beginPath(); ctx.ellipse(0, -H / 2 - 2, W / 2, H / 2, 0, 0, Math.PI * 2); ctx.fill();
          body("#9fb8d8"); ctx.beginPath(); ctx.ellipse(10, -H + 18, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
          body(G.col); ctx.fillRect(-W / 2 - 6, -H + 26, 12, 28); ctx.fillRect(W / 2 - 6, -H + 26, 12, 28);
          body("#fff"); ctx.fillRect(14, -H + 22, 3, 5); ctx.fillRect(19, -H + 22, 3, 5);
          eye(14, -H + 15, 3);
          break;
        }
        case "idol": {
          ctx.rotate(Math.sin(t * 0.8) * 0.05);
          body(G.dark); ctx.beginPath(); ctx.moveTo(0, -H); ctx.lineTo(W / 2, -H / 2); ctx.lineTo(0, 0); ctx.lineTo(-W / 2, -H / 2); ctx.fill();
          body(G.col); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + t; ctx.fillRect(Math.cos(a) * (W / 2 + 8) - 3, -H / 2 + Math.sin(a) * (W / 2 + 8) - 3, 6, 6); }
          body("#ffe9b0"); ctx.beginPath(); ctx.arc(0, -H / 2, 12, 0, Math.PI * 2); ctx.fill();
          eye(0, -H / 2, 5);
          break;
        }
        case "roc": {
          const flap = Math.sin(t * (this.st === "swoop" ? 20 : 8)) * 14;
          body(G.dark);
          ctx.beginPath(); ctx.moveTo(-8, -H / 2); ctx.lineTo(-W / 2 - 14, -H / 2 - flap); ctx.lineTo(-W / 2 + 6, -H / 2 + 8); ctx.fill();
          ctx.beginPath(); ctx.moveTo(8, -H / 2); ctx.lineTo(W / 2 + 14, -H / 2 - flap); ctx.lineTo(W / 2 - 6, -H / 2 + 8); ctx.fill();
          body(G.col); ctx.beginPath(); ctx.ellipse(0, -H / 2, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
          body("#ffcf4d"); ctx.beginPath(); ctx.moveTo(16, -H / 2 - 2); ctx.lineTo(28, -H / 2 + 2); ctx.lineTo(16, -H / 2 + 5); ctx.fill();
          eye(10, -H / 2 - 4, 2.5);
          break;
        }
        case "heart": {
          const beat = GG.heartbeat ? GG.heartbeat(t) : 0;
          const s = 1 + beat * 0.08;
          ctx.translate(0, -H / 2); ctx.scale(s, s);
          body(G.dark); ctx.beginPath(); ctx.arc(0, 0, W / 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = G.col; ctx.lineWidth = 2;
          for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.quadraticCurveTo(Math.cos(a + 0.5) * 24, Math.sin(a + 0.5) * 24, Math.cos(a) * W / 2, Math.sin(a) * W / 2); ctx.stroke(); }
          body(G.col); ctx.globalAlpha *= 0.5 + beat * 0.5; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
          eye(0, 0, 5);
          break;
        }
      }
      if (tired) {                                       // dazed: stars + a glowing weak point
        ctx.setTransform(ctx.getTransform());
        ctx.fillStyle = "#ffe79a";
        for (let i = 0; i < 4; i++) { const a = t * 5 + i * 1.6; ctx.fillRect(Math.cos(a) * 20 - 1.5, -H - 8 + Math.sin(a) * 4, 3, 3); }
      }
      if (sleeping) {
        ctx.scale(this.dir, 1); ctx.fillStyle = "#cfd8ff"; ctx.font = "bold 10px sans-serif";
        ctx.globalAlpha = 0.6 + Math.sin(t * 2) * 0.3; ctx.fillText("z", 14, -H - 6 - (t * 8) % 10); ctx.fillText("Z", 22, -H - 14 - (t * 8) % 10);
      }
      ctx.restore();
    }
    getState() {
      const s = super.getState();
      s.m = this.marks.map(m => [Math.round(m.x), Math.round(m.t * 100)]);
      s.b = this.beam ? [Math.round(this.beam.y), this.beam.live ? 1 : 0] : 0;
      s.p = this.phase2 ? 1 : 0;
      return s;
    }
    setState(s) {
      if (!s) return;
      super.setState(s);
      if (s.m) this.marks = s.m.map(a => ({ x: a[0], t: a[1] / 100 }));
      this.beam = s.b ? { y: s.b[0], live: !!s.b[1], t: 1 } : null;
      this.phase2 = !!s.p;
    }
  }

  /* =====================================================================
   * ESCAPE — the region chases you out of the shrine
   * =================================================================== */
  const ESC_STYLE = [
    { name: "The caves collapse!",       col: "#6ec3ff", edge: "#dff4ff", kind: "crystal" },
    { name: "The ruins flood!",          col: "#2f8fb0", edge: "#bfe8ff", kind: "water" },
    { name: "The thorns awaken!",        col: "#2f5a22", edge: "#9ad45a", kind: "thorns" },
    { name: "The furnace bursts!",       col: "#d2461e", edge: "#ffcf7a", kind: "fire" },
    { name: "Avalanche!",                col: "#dfefff", edge: "#ffffff", kind: "snow" },
    { name: "The sun flares!",           col: "#f2c14e", edge: "#fff4c8", kind: "light" },
    { name: "The storm breaks!",         col: "#3a3e70", edge: "#e0e4ff", kind: "storm" },
    { name: "The void rises!",           col: "#2a1040", edge: "#c79bff", kind: "void" },
  ];
  class EscapeRun extends GObj {
    constructor(cfg) { super(Object.assign({ w: 1, h: 1 }, cfg)); this.state = 0; this.front = 0; this.t = 0; this.fails = 0; this.wait = 0; this.S = ESC_STYLE[cfg.region || 0]; }
    get dir() { return this.doorSide === "L" ? -1 : 1; }     // the way OUT
    _startX(level) { return this.dir < 0 ? level.tilemap.w + 40 : -40; }
    update(dt, level) {
      this.t += dt;
      if (this.state === 0 && level.getChannel(this.channel)) { this.state = 1; this.wait = 2.4; this.front = this._startX(level); this._began = false; }
      if (this.state !== 1) return;
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0 && !this._began) {
          this._began = true;
          GG.bus.emit("escape:start", {});
          level.floatText(level.tilemap.w / 2, 7 * T, this.S.name + "  RUN!", "#ff8a8a");
          // rubble crashes down between the shrine and the doorway
          for (const f of [0.34, 0.66]) {
            const col = this.dir < 0 ? Math.round(14 - 9 * f) : Math.round(17 + 9 * f);
            level.addObject({ type: "rubble", x: col * T, y: 2 * T, floorY: this.floorY, col: this.S.col, id: this.id * 10 + Math.round(f * 100) });
          }
        }
        return;
      }
      // the wall of water / fire / thorns advances
      const sp = (175 + Math.min(70, this.t * 6)) * (level.hazardScale || 1) * Math.pow(0.85, this.fails);
      this.front += this.dir * sp * dt;            // the wall moves toward the doorway
      level.cam.shake(0.03);
      // debris ahead of the heroes
      this._deb = (this._deb || 0) - dt;
      if (this._deb <= 0) {
        this._deb = 0.55;
        const lead = level.players.filter(p => !p.dead).map(p => p.cx);
        if (lead.length) {
          const x = U.clamp(lead[(Math.random() * lead.length) | 0] + this.dir * U.rand(40, 140), 3 * T, level.tilemap.w - 3 * T);
          (this._marks = this._marks || []).push({ x, t: 0.6 });
        }
      }
      for (const m of this._marks || []) {
        m.t -= dt;
        if (m.t <= 0 && !m.done) { m.done = true; level.hostiles.push({ x: m.x, y: 2 * T + 8, vx: 0, vy: 40, grav: 900, r: 8, life: 3, color: this.S.edge, kind: "rock", dmg: 1 }); }
      }
      if (this._marks) this._marks = this._marks.filter(m => !m.done);
      // caught by the wall = a fall; the whole escape starts over (a little slower)
      for (const p of level.players) {
        if (p.dead) continue;
        const caught = this.dir < 0 ? p.x + p.w > this.front : p.x < this.front;
        if (caught) { p.kill(level, "escape"); this._fail(level); return; }
      }
      if (level.players.some(p => p.dead)) this._fail(level);
    }
    _fail(level) {
      this.fails++; this.wait = 1.6; this._began = true; this.t = 0;
      this.front = this._startX(level); this._marks = [];
      level.hostiles = level.hostiles.filter(h => h.kind !== "rock");
      GG.bus.emit("escape:retry", {});
      level.players.forEach((p, i) => {
        p.spawn = { x: this.startX + i * 30, y: this.floorY - p.h - 1 };
        if (!p.dead) { p.x = p.spawn.x; p.y = p.spawn.y; p.vx = p.vy = 0; }
      });
      level.floatText(level.tilemap.w / 2, 7 * T, "Again! Stay together!", "#ffe79a");
    }
    /** Saved: leaving through the doorway ends it (you made it). */
    saveState() { return this.state === 1 ? 2 : this.state; }
    /** Live (online): the wall's position so the partner sees it coming. */
    getState() { return [this.state, Math.round(this.front), this.wait > 0 ? 1 : 0, this._began ? 1 : 0, Math.round(this.t * 10)]; }
    setState(s) {
      if (Array.isArray(s)) { this.state = s[0]; this.front = s[1]; this.wait = s[2] ? 0.1 : 0; this._began = !!s[3]; this.t = s[4] / 10; }
      else this.state = s === 1 ? 2 : (s || 0);
    }
    render(ctx, level) {
      if (this.state !== 1 || this.wait > 0 && !this._began) return;
      if (this.wait > 0) return;
      const S = this.S, H = level.tilemap.h, t = this.t;
      const fx = this.front, far = this.dir < 0 ? level.tilemap.w + 60 : -60;
      const x0 = Math.min(fx, far), x1 = Math.max(fx, far);
      ctx.save();
      const g = ctx.createLinearGradient(fx, 0, fx - this.dir * 160, 0);
      g.addColorStop(0, S.col); g.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, H);
      // the leading edge
      ctx.fillStyle = S.edge; ctx.shadowBlur = 20; ctx.shadowColor = S.edge;
      ctx.beginPath(); ctx.moveTo(fx, 0);
      for (let y = 0; y <= H; y += 16) {
        const wob = S.kind === "water" || S.kind === "snow" ? Math.sin(y * 0.05 + t * 8) * 14 : S.kind === "fire" ? Math.sin(y * 0.2 + t * 20) * 10 : ((y / 16) % 2) * 16;
        ctx.lineTo(fx + this.dir * (wob + 6), y);
      }
      ctx.lineTo(fx - this.dir * 10, H); ctx.lineTo(fx - this.dir * 10, 0); ctx.fill();
      ctx.restore();
      for (const m of this._marks || []) { ctx.fillStyle = `rgba(255,90,106,${0.15 + Math.abs(Math.sin(t * 16)) * 0.2})`; ctx.fillRect(m.x - 9, 2 * T, 18, this.floorY - 2 * T); }
    }
  }

  /* ---- Rubble: crashes down during an escape, then it's in the way ---- */
  class Rubble extends GObj {
    constructor(cfg) { super(Object.assign({ w: T, h: T * 2 }, cfg)); this.dynSolid = true; this.vy = 0; this.landed = false; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      if (this.landed) return;
      this.vy += 1400 * dt; this.y += this.vy * dt;
      for (const p of level.players) if (!p.dead && U.aabb(p, this)) p.hurt(level, 1, this.cx);
      if (this.y + this.h >= this.floorY) {
        this.y = this.floorY - this.h; this.landed = true;
        level.cam.shake(0.35); GG.bus.emit("boss:crash", {});
        level.fx.burst({ x: this.cx, y: this.floorY, count: 16, color: ["#8a7a66", this.col || "#fff"], speed: 150, life: 0.5, angle: -Math.PI / 2, spread: 2 });
        // shove anyone standing where it landed out of the way
        for (const p of level.players) if (!p.dead && U.aabb(p, this)) p.x = p.cx < this.cx ? this.x - p.w - 1 : this.x + this.w + 1;
      }
    }
    solidRect() { return this.landed ? this : null; }
    render(ctx) {
      ctx.fillStyle = "#3a3440"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = this.col || "#6a6290"; ctx.globalAlpha = 0.5; ctx.fillRect(this.x + 3, this.y + 3, this.w - 6, 4); ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(this.x + 6, this.y + 20, 10, 8); ctx.fillRect(this.x + 14, this.y + 40, 12, 10);
    }
    getState() { return null; }
  }

  /* =====================================================================
   * UPGRADES — Heart Crystals and Energy Cells
   * =================================================================== */
  class Upgrade extends GObj {
    constructor(cfg) { super(Object.assign({ w: 22, h: 22, kind: "heart" }, cfg)); this.t = 0; this.taken = !!cfg.taken; }
    update(dt, level) {
      this.t += dt;
      if (this.taken) return;
      for (const p of level.players) {
        if (p.dead || !U.aabb(p, { x: this.x - 4, y: this.y - 4, w: this.w + 8, h: this.h + 8 })) continue;
        this.taken = true;
        level.floatText(this.cx, this.y - 10, this.kind === "heart" ? "HEART CRYSTAL  +1 ♥" : "ENERGY CELL  +20 ⚡", this.kind === "heart" ? "#ff9aa4" : "#7fd4ff");
        level.fx.burst({ x: this.cx, y: this.cy, count: 40, color: [this.kind === "heart" ? "#ff6b8a" : "#4fc3ff", "#fff"], speed: 200, life: 0.9, glow: true });
        GG.bus.emit("upgrade:found", { uid: this.uid, kind: this.kind });
        break;
      }
    }
    render(ctx) {
      if (this.taken) return;
      const x = this.cx, y = this.cy + Math.sin(this.t * 2.4) * 4, t = this.t;
      ctx.save();
      const heart = this.kind === "heart";
      const col = heart ? "#ff6b8a" : "#4fc3ff";
      const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
      g.addColorStop(0, heart ? "rgba(255,107,138,0.5)" : "rgba(79,195,255,0.5)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.translate(x, y); ctx.fillStyle = col; ctx.shadowBlur = 16; ctx.shadowColor = col;
      if (heart) {
        const s = 1 + Math.sin(t * 5) * 0.06; ctx.scale(s, s);
        ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-14, -2, -8, -14, 0, -6); ctx.bezierCurveTo(8, -14, 14, -2, 0, 8); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(-5, -6, 3, 3);
      } else {
        ctx.rotate(t);
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); } ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(3, -1); ctx.lineTo(0, 0); ctx.lineTo(2, 6); ctx.lineTo(-3, 1); ctx.lineTo(0, 0); ctx.fill();
      }
      ctx.restore();
    }
    getState() { return this.taken ? 1 : 0; }
    setState(s) { this.taken = !!s; }
  }

  /* =====================================================================
   * NPCs — walk up and press ACTION (S / ▼) to talk
   * =================================================================== */
  const NPCS = [
    { name: "Ose the Lamplighter", look: "lamp",   col: "#6ec3ff", lines: [
      "Two lights, and the dark leans back. Stay close in the dark rooms.",
      "The golem below the shrine slams the floor. Jump the shockwave, then hit it while it's dizzy.",
      "Someone in a hood ran past me an hour ago. Carrying a shard. Didn't even say sorry." ] },
    { name: "Maru the Hermit",     look: "hermit", col: "#5fd0c0", lines: [
      "The tide breathes in and out. Swim with it, not against it.",
      "One of you stuns a beast, the other finishes it. The old builders called that a promise.",
      "Hidden rooms hold heart crystals. Dead ends are rarely dead." ] },
    { name: "Kiko the Forager",    look: "forager", col: "#7cd46a", lines: [
      "Pink mushrooms bounce. Blue mushrooms... don't eat the blue ones.",
      "The Thorn Queen calls her children to fight. Strike the little ones first.",
      "The merchant waits by every shrine once its guardian sleeps. Bring gems!" ] },
    { name: "Dace, the Lost Engineer", look: "engineer", col: "#ff9a4d", lines: [
      "I came down to fix one valve. That was three years ago.",
      "Steam vents lift you on a timer. Count to three, then jump in.",
      "The Titan charges in straight lines. Roll through it and it'll smash into the wall." ] },
    { name: "Yara the Guide",      look: "guide",  col: "#bfe8ff", lines: [
      "Ice doesn't forgive. Start stopping early.",
      "When the wind blows, crouch. Even the mountain respects a low stance.",
      "The hooded one climbed past me without a rope. Whoever that is, they've done this before." ] },
    { name: "Keeper Sefu",         look: "keeper", col: "#f2c14e", lines: [
      "Light is kind here. Turn the mirrors and let it do the work.",
      "The Sun Idol burns low, then high. Jump the low beam. Stay down for the high one.",
      "The murals show a thief... but the face was scratched out long before you arrived." ] },
    { name: "Captain Wren",        look: "captain", col: "#a9aeff", lines: [
      "My ship fell apart. The isles didn't. Ride the updrafts, they always go up.",
      "The Storm Roc dives where you stand. Move right after it shrieks.",
      "Fast travel between shrines, friends. The pause menu knows the way." ] },
    { name: "The Echo",            look: "echo",   col: "#c79bff", lines: [
      "We were two, once. Like you.",
      "The Heart is not broken. It is waiting for both halves of the compass.",
      "The thief? No. A keeper. Carrying the shards so the dark could not. You'll understand soon." ] },
  ];
  GG.NPCS = NPCS;

  class NPC extends GObj {
    constructor(cfg) {
      super(Object.assign({ w: 22, h: 30 }, cfg));
      this.t = 0; this.line = -1; this.show = 0; this.near = false;
      const N = cfg.merchant ? null : NPCS[cfg.region || 0];
      this.N = N; this.name = cfg.merchant ? "Pell the Merchant" : N.name; this.lines = cfg.lines || (N ? N.lines : []);
      this._prev = [false, false];
    }
    update(dt, level) {
      this.t += dt; this.show = Math.max(0, this.show - dt);
      let who = null;
      this.near = false;
      level.players.forEach((p, i) => {
        if (p.dead) return;
        const close = Math.abs(p.cx - this.cx) < 46 && Math.abs(p.cy - this.cy) < 40;
        if (close) this.near = true;
        const press = p.input && p.input.action && !this._prev[i];
        this._prev[i] = !!(p.input && p.input.action);
        if (close && press) who = p;
      });
      if (who) this.interact(level, who);
    }
    interact(level, p) {
      this.line = (this.line + 1) % this.lines.length; this.show = 5.5;
      GG.bus.emit("npc:talk", { name: this.name });
    }
    render(ctx) {
      const x = this.cx, by = this.y + this.h, t = this.t;
      const col = this.merchant ? "#e8c65c" : this.N.col;
      ctx.save();
      // body: a hooded robe with a little bob
      const bob = Math.sin(t * 2) * 1;
      ctx.fillStyle = this.merchant ? "#5a3a24" : "#3a3450";
      ctx.beginPath(); ctx.moveTo(x - 11, by); ctx.lineTo(x - 7, by - 22 + bob); ctx.lineTo(x + 7, by - 22 + bob); ctx.lineTo(x + 11, by); ctx.fill();
      ctx.fillStyle = "#b4784c"; ctx.beginPath(); ctx.arc(x, by - 25 + bob, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(x - 7, by - 16 + bob, 14, 3);
      const look = this.merchant ? "merchant" : this.N.look;
      ctx.fillStyle = col;
      if (look === "lamp") { ctx.fillRect(x + 9, by - 22, 2, 16); ctx.shadowBlur = 12; ctx.shadowColor = col; ctx.beginPath(); ctx.arc(x + 10, by - 24, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
      else if (look === "hermit") { ctx.fillStyle = "#ddd"; ctx.fillRect(x - 4, by - 21 + bob, 8, 6); }
      else if (look === "forager") { ctx.fillStyle = "#b0357e"; ctx.beginPath(); ctx.ellipse(x, by - 31 + bob, 9, 4, 0, Math.PI, 0); ctx.fill(); }
      else if (look === "engineer") { ctx.fillStyle = "#c9a06a"; ctx.fillRect(x - 6, by - 30 + bob, 12, 3); ctx.fillStyle = "#9fe0ff"; ctx.fillRect(x - 5, by - 28 + bob, 4, 2); ctx.fillRect(x + 1, by - 28 + bob, 4, 2); }
      else if (look === "guide") { ctx.fillStyle = "#dff4ff"; ctx.beginPath(); ctx.moveTo(x - 7, by - 27 + bob); ctx.lineTo(x, by - 36 + bob); ctx.lineTo(x + 7, by - 27 + bob); ctx.fill(); }
      else if (look === "keeper") { ctx.fillStyle = "#f2c14e"; ctx.fillRect(x - 7, by - 32 + bob, 14, 2); ctx.fillRect(x - 1, by - 36 + bob, 2, 4); }
      else if (look === "captain") { ctx.fillStyle = "#2a2a3a"; ctx.fillRect(x - 8, by - 31 + bob, 16, 3); ctx.fillRect(x - 5, by - 35 + bob, 10, 4); }
      else if (look === "echo") { ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2; ctx.shadowBlur = 16; ctx.shadowColor = col; ctx.beginPath(); ctx.arc(x, by - 25 + bob, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      else if (look === "merchant") {                       // a big pack of wares
        ctx.fillStyle = "#8a6236"; ctx.fillRect(x - 17, by - 26 + bob, 10, 16);
        ctx.fillStyle = "#e8c65c"; ctx.beginPath(); ctx.arc(x - 12, by - 28 + bob, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4a2a18"; ctx.beginPath(); ctx.ellipse(x, by - 31 + bob, 10, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - 5, by - 36 + bob, 10, 5);
      }
      ctx.restore();
      // prompt / speech bubble
      ctx.save(); ctx.textAlign = "center";
      if (this.show > 0 && this.line >= 0) {
        const text = this.lines[this.line];
        ctx.font = "10px Georgia, serif";
        const words = text.split(" "), rows = []; let cur = "";
        for (const w of words) { if (ctx.measureText(cur + " " + w).width > 190) { rows.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
        rows.push(cur);
        const bw = 204, bh = 18 + rows.length * 12, bx = x - bw / 2, bY = by - 48 - bh;
        ctx.globalAlpha = Math.min(1, this.show * 2);
        ctx.fillStyle = "rgba(12,10,24,0.88)"; ctx.fillRect(bx, bY, bw, bh);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, bY + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = col; ctx.font = "700 9px 'Cinzel', Georgia, serif"; ctx.fillText(this.name, x, bY + 11);
        ctx.fillStyle = "#f6ecd2"; ctx.font = "10px Georgia, serif";
        rows.forEach((r, i) => ctx.fillText(r, x, bY + 24 + i * 12));
      } else if (this.near) {
        ctx.fillStyle = "#ffe79a"; ctx.font = "700 9px 'Cinzel', Georgia, serif";
        ctx.fillText(this.merchant ? "✦ Trade (S / ▼)" : "✦ Talk (S / ▼)", x, by - 44);
      } else {
        ctx.fillStyle = "rgba(246,236,210,0.6)"; ctx.font = "8px Georgia, serif"; ctx.fillText(this.name, x, by - 40);
      }
      ctx.restore();
    }
    getState() { return [this.line, Math.round(this.show * 10)]; }
    setState(s) { if (Array.isArray(s)) { this.line = s[0]; this.show = s[1] / 10; } }
    saveState() { return null; }
  }

  class Merchant extends NPC {
    constructor(cfg) { super(Object.assign({ merchant: true, lines: ["Gems for goods, friends. Let's see what you've found."] }, cfg)); this.merchant = true; }
    update(dt, level) {
      // only trades once the shrine's guardian has fallen (it's not safe before)
      this.hidden = this.guardCh != null && !level.getChannel(this.guardCh);
      if (this.hidden) { this.near = false; return; }
      super.update(dt, level);
    }
    interact(level, p) {
      this.show = 0;
      GG.bus.emit("shop:open", { region: this.region });
    }
    render(ctx, level) { if (!this.hidden) super.render(ctx, level); }
  }

  /* ---- The hooded thief: always one step ahead -------------------------- */
  class Thief extends GObj {
    constructor(cfg) { super(Object.assign({ w: 20, h: 28 }, cfg)); this.t = 0; this.st = cfg.seen ? 3 : 0; this.vx = 0; this.a = 1; }
    update(dt, level) {
      this.t += dt;
      if (this.st === 0) {
        const near = level.players.some(p => !p.dead && Math.abs(p.cx - this.cx) < 240 && Math.abs(p.cy - this.cy) < 140);
        if (near) { this.st = 1; this.t = 0; this.dir = Math.sign(this.cx - level.players[0].cx) || 1; GG.bus.emit("thief:seen", { uid: this.uid }); }
      } else if (this.st === 1) {
        if (this.t > 0.6) { this.st = 2; this.t = 0; level.floatText(this.cx, this.y - 14, "?!", "#c79bff"); }
      } else if (this.st === 2) {
        this.vx = this.dir * 360; this.x += this.vx * dt; this.a = Math.max(0, 1 - this.t / 0.9);
        if (Math.random() < 0.5) level.fx.burst({ x: this.cx, y: this.y + this.h, count: 1, color: "#c79bff", speed: 40, life: 0.4 });
        if (this.a <= 0) this.st = 3;
      }
    }
    render(ctx) {
      if (this.st === 3) return;
      const x = this.cx, by = this.y + this.h, t = this.t;
      ctx.save(); ctx.globalAlpha = this.a;
      ctx.translate(x, by); ctx.scale(this.dir || 1, 1);
      const run = this.st === 2 ? Math.sin(this.t * 30) * 4 : 0;
      ctx.fillStyle = "#1a1424";
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-6 + run, -22); ctx.lineTo(0, -30); ctx.lineTo(8, -22); ctx.lineTo(10 - run, 0); ctx.fill();
      ctx.fillStyle = "#c79bff"; ctx.shadowBlur = 10; ctx.shadowColor = "#c79bff";
      ctx.fillRect(2, -24, 3, 2);                          // one glinting eye under the hood
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(-4, -18); ctx.lineTo(0, -14); ctx.lineTo(-4, -10); ctx.fill();   // a stolen shard
      ctx.restore();
      if (this.st === 1) { ctx.save(); ctx.textAlign = "center"; ctx.fillStyle = "#c79bff"; ctx.font = "700 9px 'Cinzel', Georgia, serif"; ctx.fillText("The hooded thief!", x, by - 38); ctx.restore(); }
    }
    getState() { return this.st >= 1 ? 3 : 0; }
    setState(s) { this.st = s || 0; }
  }

  /* =====================================================================
   * OUTFITS — hats and trinkets from the merchant (cosmetic only)
   * `draw(ctx, Hs, t, pal)` runs in the hero's local space (feet at 0,0,
   * facing +x); Hs is the drawn sprite height.
   * =================================================================== */
  const OUTFITS = {
    explorer: { name: "Explorer's Hat", price: 12, draw(c, Hs) {
      c.fillStyle = "#6b4526"; c.beginPath(); c.ellipse(0, -Hs + 3, 11, 2.5, 0, 0, Math.PI * 2); c.fill();
      c.fillRect(-6, -Hs - 4, 12, 7); c.fillStyle = "#c9a06a"; c.fillRect(-6, -Hs + 0.5, 12, 1.5); } },
    crown: { name: "Little Crown", price: 25, draw(c, Hs, t) {
      c.fillStyle = "#f2c14e"; c.shadowBlur = 6; c.shadowColor = "#f2c14e";
      c.beginPath(); c.moveTo(-7, -Hs + 3); c.lineTo(-7, -Hs - 4); c.lineTo(-3.5, -Hs - 1); c.lineTo(0, -Hs - 6); c.lineTo(3.5, -Hs - 1); c.lineTo(7, -Hs - 4); c.lineTo(7, -Hs + 3); c.fill();
      c.shadowBlur = 0; c.fillStyle = "#ff6b8a"; c.fillRect(-1, -Hs - 1, 2, 2); } },
    wreath: { name: "Flower Wreath", price: 10, draw(c, Hs) {
      const cols = ["#ff7ac8", "#ffe79a", "#9ad45a", "#7fd4ff"];
      for (let i = 0; i < 6; i++) { c.fillStyle = cols[i % 4]; c.beginPath(); c.arc(-8 + i * 3.2, -Hs + 1 - Math.sin(i / 5 * Math.PI) * 3, 2.2, 0, Math.PI * 2); c.fill(); } } },
    hood: { name: "Frost Hood", price: 15, draw(c, Hs) {
      c.fillStyle = "#dff4ff"; c.beginPath(); c.moveTo(-9, -Hs + 6); c.quadraticCurveTo(-8, -Hs - 7, 2, -Hs - 6); c.quadraticCurveTo(9, -Hs - 3, 8, -Hs + 6); c.fill();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(-4, -Hs - 6, 2.5, 0, Math.PI * 2); c.fill(); } },
    goggles: { name: "Ember Goggles", price: 15, draw(c, Hs) {
      c.fillStyle = "#6b4526"; c.fillRect(-8, -Hs + 1, 16, 2);
      c.fillStyle = "#c9a06a"; c.beginPath(); c.arc(-2, -Hs + 1, 3, 0, Math.PI * 2); c.arc(5, -Hs + 1, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ff9a4d"; c.beginPath(); c.arc(-2, -Hs + 1, 1.8, 0, Math.PI * 2); c.arc(5, -Hs + 1, 1.8, 0, Math.PI * 2); c.fill(); } },
    halo: { name: "Star Halo", price: 30, draw(c, Hs, t) {
      c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = "#ffe79a"; c.lineWidth = 1.5; c.shadowBlur = 8; c.shadowColor = "#ffe79a";
      c.beginPath(); c.ellipse(0, -Hs - 6, 9, 2.5, 0, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 3; i++) { const a = t * 2 + i * 2.1; c.fillStyle = "#fff"; c.fillRect(Math.cos(a) * 9 - 1, -Hs - 6 + Math.sin(a) * 2.5 - 1, 2, 2); }
      c.restore(); } },
  };
  GG.OUTFITS = OUTFITS;

  /* ---- merchant perks (bought with gems) -------------------------------- */
  GG.PERKS = {
    magnet: { name: "Gem Magnet",     price: 20, desc: "Gems fly to you from further away." },
    skin:   { name: "Thick Skin",     price: 30, desc: "+1 heart for both heroes." },
    recover:{ name: "Quick Recovery", price: 20, desc: "Shared energy refills 60% faster." },
    hitter: { name: "Heavy Hitter",   price: 25, desc: "Strikes deal 50% more damage." },
  };

  Object.assign(EXT, { guardian: Guardian, escape: EscapeRun, rubble: Rubble, upgrade: Upgrade, npc: NPC, merchant: Merchant, thief: Thief });
  Object.assign(O, { Guardian, EscapeRun, Rubble, Upgrade, NPC, Merchant, Thief });
})(window);
