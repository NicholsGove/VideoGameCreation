/* =========================================================================
 * creatures.js — open-world wildlife, room plumbing and power shrines
 * -------------------------------------------------------------------------
 * The open world adds things that try to kill you (beetles that charge,
 * toads that spit laser beams, bats that swoop, spore plants that lob, moths
 * that fire aimed bolts), plus the pieces a connected world needs:
 *
 *   Passage     — a doorway to the neighbouring room. BOTH heroes must stand
 *                 in it together to travel; alone, it waits for the partner.
 *   Span        — a light bridge / step that appears while a signal is live.
 *   Barrier     — a thorn wall you shoot down (it stays down).
 *   PowerShrine — grants a new power when both heroes reach it together.
 *   GateSign    — a small plaque naming the power a gate needs.
 *   ArenaSeal   — seals a chamber until every creature in it is slain.
 *
 * Every class registers itself in GG.OBJ_EXT so Level._spawn can build it
 * from plain level data, exactly like the core objects.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C, O = GG.obj;
  const T = C.TILE;
  const GObj = O.GObj;                            // the shared base class
  const EXT = GG.OBJ_EXT = GG.OBJ_EXT || {};

  /* ---------------------------------------------------------------------
   * Creature base: health, flashing on hit, knockback, death burst, reset.
   * Creatures kill on touch (Level treats any object with kills() as a
   * moving hazard) and can be shot (Level routes projectiles to hittables).
   * ------------------------------------------------------------------- */
  class Creature extends GObj {
    constructor(cfg, defaults) {
      super(Object.assign({}, defaults, cfg));
      this.x0 = this.x; this.y0 = this.y;
      this.hp = this.hp * (cfg.tough || 1);
      // ELITES: tougher, glowing, and they drop extra gems
      if (cfg.elite) { this.elite = true; this.hp *= 2.2; }
      this.maxHp = this.hp;
      this.bites = true;                     // contact hurts (hearts) rather than kills outright
      this.stunT = 0; this.stunBy = null;
      this.alive = true; this.hittable = true;
      this.t = (cfg.seed || 0) * 1.37; this._flash = 0;
      this.dir = cfg.dir || -1; this.vx = 0; this.vy = 0;
      this.st = "idle"; this.stT = 0;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    kills() { return this.alive && this.awake !== false; }
    takeHit(level, dmg, fromDir, by, melee) {
      if (!this.alive) return;
      let d = dmg || 1;
      // CO-OP COMBO: one hero dazes a creature, the OTHER lands the finisher
      if (by != null && this.stunT > 0 && this.stunBy != null && this.stunBy !== by) {
        d *= 3; this.stunT = 0; this.stunBy = null;
        level.floatText(this.cx, this.y - 12, "COMBO!", "#ffe79a");
        GG.bus.emit("combo:finisher", { x: this.cx, y: this.y });
        if (level.onCombo) level.onCombo(this);
        level.fx.burst({ x: this.cx, y: this.cy, count: 24, color: ["#ffe79a", "#fff", "#ff9aa4"], speed: 220, life: 0.5, glow: true });
      } else if (by != null && !this.stunImmune) {
        this.stunT = melee ? 1.0 : 0.7; this.stunBy = by;
      }
      this.hp -= d; this._flash = 0.18;
      if (!this.flying) this.vx = (fromDir || 0) * 120;
      GG.bus.emit("hit:stop", { s: this.hp <= 0 ? 0.08 : 0.04 });
      level.fx.burst({ x: this.cx, y: this.cy, count: 8, color: [this.blood || "#ffb36b", "#fff"], speed: 110, life: 0.3 });
      if (this.hp <= 0) this.die(level);
      else if (this.onHurt) this.onHurt(level, fromDir);
    }
    die(level) {
      this.alive = false; this.stunT = 0;
      GG.bus.emit("creature:slain", { kind: this.constructor.name, elite: !!this.elite });
      if (this.elite) {
        level.floatText(this.cx, this.y - 6, "+3 ◆", "#ffcf4d");
        GG.bus.emit("gems:bonus", { n: 3 });
      }
      level.cam.shake(0.12);
      level.fx.burst({ x: this.cx, y: this.cy, count: 20, color: [this.blood || "#ffb36b", "#fff", "#3a2b44"], speed: 170, life: 0.55, gravity: 420, glow: true });
    }
    reset() {
      this.alive = true; this.hp = this.maxHp; this.x = this.x0; this.y = this.y0; this.stunT = 0;
      this.vx = 0; this.vy = 0; this.st = "idle"; this.stT = 0;
    }
    /** Nearest living hero within `range` (and |dy| < yTol). */
    nearest(level, range, yTol) {
      let best = null, bd = range;
      for (const p of level.players) {
        if (p.dead) continue;
        const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
        if (d < bd && Math.abs(p.cy - this.cy) < (yTol || 1e9)) { bd = d; best = p; }
      }
      return best;
    }
    /** Is there clear air (no solid tile) between this and a point? */
    los(level, x, y) {
      const n = Math.ceil(Math.hypot(x - this.cx, y - this.cy) / 12);
      for (let i = 1; i < n; i++) {
        const px = this.cx + (x - this.cx) * i / n, py = this.cy + (y - this.cy) * i / n;
        if (level.tilemap.isSolid(Math.floor(px / T), Math.floor(py / T))) return false;
      }
      return true;
    }
    walk(level, dt) {
      this.vy = Math.min(this.vy + C.GRAVITY * dt, 800);
      GG.Physics.move(this, this.vx * dt, this.vy * dt, level.solidsFor(this, false));
      if (this.y > level.tilemap.h + 60) this.alive = false;
    }
    /** Would a step forward walk off a ledge? */
    ledgeAhead(level, dir) {
      const fx = dir > 0 ? this.x + this.w + 2 : this.x - 2;
      return !level.tilemap.isSolid(Math.floor(fx / T), Math.floor((this.y + this.h + 4) / T)) &&
             level.tilemap.at(Math.floor(fx / T), Math.floor((this.y + this.h + 4) / T)) !== GG.TILE.ONEWAY;
    }
    wallAhead(level, dir) {
      const fx = dir > 0 ? this.x + this.w + 2 : this.x - 2;
      return level.tilemap.isSolid(Math.floor(fx / T), Math.floor((this.y + this.h - 4) / T));
    }
    setMode(st) { this.st = st; this.stT = 0; }
    hpBar(ctx) {
      if (this.hp >= this.maxHp) return;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(this.cx - 13, this.y - 10, 26, 4);
      ctx.fillStyle = this.hp / this.maxHp < 0.34 ? "#f2c14e" : "#ff6b6b";
      ctx.fillRect(this.cx - 12, this.y - 9, 24 * Math.max(0, this.hp / this.maxHp), 2);
    }
    flashAlpha(ctx) { if (this._flash > 0) ctx.globalAlpha = 0.55 + Math.sin(this._flash * 70) * 0.45; }
    getState() {
      return { x: Math.round(this.x), y: Math.round(this.y), h: Math.round(this.hp * 10) / 10, a: this.alive ? 1 : 0, s: this.st, d: this.dir, k: Math.round(this.stT * 100), z: Math.round((this.stunT || 0) * 10) };
    }
    setState(s) {
      if (!s) return;
      this.x = s.x; this.y = s.y; this.hp = s.h; this.alive = !!s.a; this.st = s.s; this.dir = s.d; this.stT = (s.k || 0) / 100; this.stunT = (s.z || 0) / 10;
    }
  }

  /* ---------------------------------------------------------------------
   * Thornback Beetle — patrols, spots you, digs in… and CHARGES. Slams into
   * walls and staggers, which is your moment to strike.
   * ------------------------------------------------------------------- */
  class Beetle extends Creature {
    constructor(cfg) { super(cfg, { w: 30, h: 20, hp: 4, range: 150 }); this.blood = "#ffae57"; }
    update(dt, level) {
      if (!this.alive) return;
      this.t += dt; this.stT += dt; this._flash = Math.max(0, this._flash - dt);
      if (this.awake === false) { this.vx = 0; this.walk(level, dt); return; }
      const tgt = level.age > 1.2 ? this.nearest(level, 300, 40) : null;
      switch (this.st) {
        case "idle": case "patrol": {
          this.st = "patrol";
          if (this.wallAhead(level, this.dir) || this.ledgeAhead(level, this.dir) || Math.abs(this.x + this.dir * 4 - this.x0) > this.range) this.dir = -this.dir;
          this.vx = U.damp(this.vx, this.dir * 38, 6, dt);
          if (tgt && this.stT > 0.6 && this.los(level, tgt.cx, tgt.cy)) { this.dir = Math.sign(tgt.cx - this.cx) || this.dir; this.setMode("windup"); }
          break;
        }
        case "windup":
          this.vx = 0;
          if (this.stT > 0.6) { this.setMode("charge"); GG.bus.emit("creature:charge", {}); }
          break;
        case "charge":
          this.vx = this.dir * 310;
          if (Math.random() < 0.5) level.fx.burst({ x: this.cx - this.dir * 12, y: this.y + this.h, count: 1, color: "#cfb894", speed: 40, life: 0.3 });
          if (this.wallAhead(level, this.dir)) { this.setMode("stun"); level.cam.shake(0.15); level.fx.burst({ x: this.cx + this.dir * 16, y: this.cy, count: 12, color: ["#fff", "#cfb894"], speed: 140, life: 0.35 }); }
          else if (this.ledgeAhead(level, this.dir) || this.stT > 1.4) this.setMode("stun");
          break;
        case "stun":
          this.vx = U.damp(this.vx, 0, 10, dt);
          if (this.stT > 1.1) this.setMode("patrol");
          break;
      }
      this.walk(level, dt);
    }
    render(ctx) {
      if (!this.alive) return;
      ctx.save(); this.flashAlpha(ctx);
      const x = this.cx, by = this.y + this.h;
      const shake = this.st === "windup" ? Math.sin(this.t * 80) * 1.5 : 0;
      ctx.translate(x + shake, by); ctx.scale(this.dir, 1);
      // legs
      ctx.strokeStyle = "#2a1f18"; ctx.lineWidth = 2;
      const step = this.st === "charge" ? this.t * 40 : this.t * 12;
      for (let i = 0; i < 3; i++) {
        const lx = -9 + i * 8, sw = Math.sin(step + i * 2) * 3;
        ctx.beginPath(); ctx.moveTo(lx, -6); ctx.lineTo(lx + sw, 0); ctx.stroke();
      }
      // shell
      const g = ctx.createLinearGradient(0, -20, 0, -4);
      g.addColorStop(0, "#5b4a8a"); g.addColorStop(1, "#2c2248");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(-2, -10, 14, 9, 0, Math.PI, 0); ctx.lineTo(12, -5); ctx.lineTo(-16, -5); ctx.fill();
      ctx.strokeStyle = "#8f7fd0"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2, -19); ctx.lineTo(-2, -6); ctx.stroke();
      // thorn ridge
      ctx.fillStyle = "#b9a8ff";
      for (let i = 0; i < 4; i++) { const sx = -12 + i * 6; ctx.beginPath(); ctx.moveTo(sx, -15 + Math.abs(i - 1.5)); ctx.lineTo(sx + 2, -21 + Math.abs(i - 1.5) * 1.5); ctx.lineTo(sx + 4, -15 + Math.abs(i - 1.5)); ctx.fill(); }
      // head + horn
      ctx.fillStyle = "#3a2e5c"; ctx.beginPath(); ctx.ellipse(12, -8, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e9dcc0"; ctx.beginPath(); ctx.moveTo(15, -10); ctx.quadraticCurveTo(24, -14, 22, -22); ctx.quadraticCurveTo(21, -13, 14, -6); ctx.fill();
      // eye: calm amber, furious red
      const angry = this.st === "windup" || this.st === "charge";
      ctx.fillStyle = angry ? "#ff4d5e" : "#ffcf4d"; ctx.shadowBlur = angry ? 10 : 4; ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(14, -9, 1.8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      if (this.st === "stun") {                                 // dizzy stars
        ctx.fillStyle = "#ffe79a";
        for (let i = 0; i < 3; i++) { const a = this.t * 6 + i * 2.1; ctx.fillRect(2 + Math.cos(a) * 9, -26 + Math.sin(a) * 3, 2, 2); }
      }
      if (this.st === "windup") { ctx.globalAlpha = 0.6; ctx.fillStyle = "#fff"; ctx.fillRect(-18, -12 - (this.stT * 20) % 8, 2, 2); ctx.fillRect(-20, -8 - (this.stT * 26) % 8, 2, 2); }
      ctx.restore();
      this.hpBar(ctx);
    }
  }

  /* ---------------------------------------------------------------------
   * Prism Toad — squats on a ledge, swells its crystal throat, and spits a
   * horizontal LASER BEAM. A flickering sight-line warns you first.
   * ------------------------------------------------------------------- */
  class Toad extends Creature {
    constructor(cfg) { super(cfg, { w: 28, h: 22, hp: 3, cool: 1.8, charge: 1.0, fire: 0.5, range: 340 }); this.blood = "#7df0c8"; this.beam = null; }
    _beamEnd(level) {
      const y = this.y + 9;
      let x = this.dir > 0 ? this.x + this.w : this.x;
      for (let i = 0; i < 160; i++) {
        const nx = x + this.dir * 6;
        if (level.tilemap.isSolid(Math.floor(nx / T), Math.floor(y / T))) break;
        x = nx; if (x < 0 || x > level.tilemap.w) break;
      }
      return { x0: this.dir > 0 ? this.x + this.w : this.x, x1: x, y };
    }
    update(dt, level) {
      if (!this.alive) return;
      this.t += dt; this.stT += dt; this._flash = Math.max(0, this._flash - dt);
      this.beam = null;
      if (this.awake !== false) {
        const tgt = level.age > 1.2 ? this.nearest(level, this.range, 110) : null;
        switch (this.st) {
          case "idle":
            if (tgt && this.stT > this.cool) { this.dir = Math.sign(tgt.cx - this.cx) || this.dir; this.setMode("charge"); }
            else if (!tgt && this.stT > 2.5 && this.onGround && Math.random() < dt * 0.6) {   // restless hop
              const d = Math.abs(this.x - this.x0) > 60 ? Math.sign(this.x0 - this.x) : (Math.random() < 0.5 ? -1 : 1);
              if (!this.ledgeAhead(level, d)) { this.vy = -330; this.vx = d * 70; this.dir = d; }
            }
            break;
          case "charge":
            this.beam = Object.assign(this._beamEnd(level), { live: false });
            if (this.stT > this.charge) { this.setMode("fire"); GG.bus.emit("laser:shot", {}); GG.audio && GG.audio.sfx && GG.audio.sfx("laser"); }
            break;
          case "fire": {
            const b = this.beam = Object.assign(this._beamEnd(level), { live: true });
            const rect = { x: Math.min(b.x0, b.x1), y: b.y - 4, w: Math.abs(b.x1 - b.x0), h: 8 };
            for (const p of level.players) if (!p.dead && U.aabb(p, rect)) p.hurt(level, 1, this.cx);
            if (this.stT > this.fire) this.setMode("idle");
            break;
          }
        }
      }
      if (this.onGround) this.vx = U.damp(this.vx, 0, 6, dt);
      this.walk(level, dt);
    }
    onHurt() { if (this.st === "charge") this.setMode("idle"); }   // a hit interrupts the spit
    render(ctx, level) {
      if (!this.alive) return;
      // online clients never run update(): rebuild the beam from the synced state
      if (!this.beam && level && (this.st === "charge" || this.st === "fire")) this.beam = Object.assign(this._beamEnd(level), { live: this.st === "fire" });
      const b = this.beam;
      if (b) {
        ctx.save();
        if (!b.live) {
          ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(this.t * 30));
          ctx.strokeStyle = "#ff8ae0"; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(b.x0, b.y); ctx.lineTo(b.x1, b.y); ctx.stroke();
        } else {
          ctx.strokeStyle = "#ff5ad0"; ctx.shadowBlur = 16; ctx.shadowColor = "#ff8ae0";
          ctx.lineWidth = 6 + Math.sin(this.t * 60) * 1.5; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(b.x0, b.y); ctx.lineTo(b.x1, b.y); ctx.stroke();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(b.x0, b.y); ctx.lineTo(b.x1, b.y); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save(); this.flashAlpha(ctx);
      ctx.translate(this.cx, this.y + this.h); ctx.scale(this.dir, 1);
      const breathe = Math.sin(this.t * 3) * 1;
      const swell = this.st === "charge" ? Math.min(1, this.stT / this.charge) : 0;
      // hind legs
      ctx.fillStyle = "#1f6b57"; ctx.beginPath(); ctx.ellipse(-8, -4, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      // body
      const g = ctx.createLinearGradient(0, -22, 0, 0);
      g.addColorStop(0, "#3fbf94"); g.addColorStop(1, "#1d7a60");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -9 - breathe * 0.3, 13, 9 + breathe * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      // crystal back spikes
      ctx.fillStyle = "#b7fff0";
      for (let i = 0; i < 3; i++) { const sx = -8 + i * 5; ctx.beginPath(); ctx.moveTo(sx, -15); ctx.lineTo(sx + 2, -22 - i); ctx.lineTo(sx + 4, -15); ctx.fill(); }
      // glowing throat sac
      ctx.fillStyle = `rgba(255,${120 - swell * 60},${220},${0.35 + swell * 0.6})`;
      ctx.shadowBlur = 6 + swell * 14; ctx.shadowColor = "#ff8ae0";
      ctx.beginPath(); ctx.ellipse(8, -6, 5 + swell * 4, 4 + swell * 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      // eyes
      ctx.fillStyle = "#e9fff8"; ctx.beginPath(); ctx.arc(6, -16, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#12241e"; ctx.beginPath(); ctx.arc(7, -16, 1.6, 0, Math.PI * 2); ctx.fill();
      // front leg
      ctx.fillStyle = "#1f6b57"; ctx.fillRect(7, -4, 4, 4);
      ctx.restore();
      this.hpBar(ctx);
    }
    getState() { const s = super.getState(); s.b = this.beam ? (this.beam.live ? 2 : 1) : 0; return s; }
    setState(s) { super.setState(s); this.beam = null; }
  }

  /* ---------------------------------------------------------------------
   * Duskwing — a bat that roosts upside-down, then swoops at whoever comes
   * close before flapping home to its perch.
   * ------------------------------------------------------------------- */
  class Bat extends Creature {
    constructor(cfg) { super(cfg, { w: 24, h: 16, hp: 2, sense: 210 }); this.flying = true; this.blood = "#c89cff"; this.tx = 0; this.ty = 0; }
    update(dt, level) {
      if (!this.alive) return;
      this.t += dt; this.stT += dt; this._flash = Math.max(0, this._flash - dt);
      if (this.awake === false) return;
      const tgt = level.age > 1.2 ? this.nearest(level, this.sense, 1e9) : null;
      let ax = 0, ay = 0;
      switch (this.st) {
        case "idle":
          this.x = U.damp(this.x, this.x0, 4, dt); this.y = U.damp(this.y, this.y0, 4, dt);
          this.vx = this.vy = 0;
          if (tgt && this.stT > 0.8 && this.los(level, tgt.cx, tgt.cy)) { this.setMode("swoop"); this.tx = tgt.cx; this.ty = tgt.cy; GG.bus.emit("creature:screech", {}); }
          break;
        case "swoop": {
          if (tgt) { this.tx = U.damp(this.tx, tgt.cx, 2.2, dt); this.ty = U.damp(this.ty, tgt.cy, 2.2, dt); }
          const dx = this.tx - this.cx, dy = this.ty - this.cy, d = Math.hypot(dx, dy) || 1;
          ax = dx / d * 520; ay = dy / d * 520 + Math.sin(this.t * 9) * 260;
          this.vx = U.clamp(this.vx + ax * dt, -170, 170); this.vy = U.clamp(this.vy + ay * dt, -170, 170);
          if (this.stT > 2.4) this.setMode("home");
          break;
        }
        case "home": {
          const dx = this.x0 - this.x, dy = this.y0 - this.y, d = Math.hypot(dx, dy);
          this.vx = U.damp(this.vx, dx / (d || 1) * 120, 4, dt); this.vy = U.damp(this.vy, dy / (d || 1) * 120, 4, dt);
          if (d < 8 || this.stT > 4) { this.setMode("idle"); }
          break;
        }
      }
      if (this.st !== "idle") {
        GG.Physics.move(this, this.vx * dt, this.vy * dt, level.tilemap.solidsIn(this.x - 8, this.y - 8, this.w + 16, this.h + 16));
      }
    }
    render(ctx) {
      if (!this.alive) return;
      ctx.save(); this.flashAlpha(ctx);
      ctx.translate(this.cx, this.cy);
      const roost = this.st === "idle";
      if (roost) ctx.scale(1, -1);                              // hangs upside down
      const flap = roost ? 0.15 : Math.sin(this.t * 22);
      ctx.fillStyle = "#2a1f3d";
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 10, -8 - flap * 8, s * 15, -2 - flap * 10);
        ctx.lineTo(s * 12, 2); ctx.lineTo(s * 8, 0); ctx.lineTo(s * 5, 4); ctx.fill();
      }
      ctx.fillStyle = "#4a3868"; ctx.beginPath(); ctx.ellipse(0, 1, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-3, -9); ctx.lineTo(-1, -5); ctx.moveTo(4, -4); ctx.lineTo(3, -9); ctx.lineTo(1, -5); ctx.fill();
      ctx.fillStyle = roost ? "#8b6fb8" : "#ff5a7a"; ctx.shadowBlur = roost ? 0 : 8; ctx.shadowColor = "#ff5a7a";
      ctx.fillRect(-3, -2, 2, 2); ctx.fillRect(1, -2, 2, 2);
      ctx.restore();
      this.hpBar(ctx);
    }
  }

  /* ---------------------------------------------------------------------
   * Sporecap — a rooted fungus that swells and LOBS glowing spores at you.
   * ------------------------------------------------------------------- */
  class Spitter extends Creature {
    constructor(cfg) { super(cfg, { w: 26, h: 26, hp: 3, period: 2.6, range: 390 }); this.blood = "#caff7a"; this.t = (cfg.seed || 0) % this.period; }
    update(dt, level) {
      if (!this.alive) return;
      this.t += dt; this.stT += dt; this._flash = Math.max(0, this._flash - dt);
      if (this.awake === false) return;
      const tgt = level.age > 1.2 ? this.nearest(level, this.range, 1e9) : null;
      this.swell = 0;
      if (!tgt) { this.stT = Math.min(this.stT, this.period - 0.5); return; }
      this.dir = Math.sign(tgt.cx - this.cx) || this.dir;
      if (this.stT > this.period - 0.45) this.swell = (this.stT - (this.period - 0.45)) / 0.45;
      if (this.stT >= this.period) {
        this.stT = 0;
        const Tf = 0.95, g = 620;
        const sx = this.cx, sy = this.y + 4;
        const vx = U.clamp((tgt.cx - sx) / Tf, -420, 420);
        const vy = ((tgt.cy - sy) - 0.5 * g * Tf * Tf) / Tf;
        level.hostiles.push({ x: sx, y: sy, vx, vy: Math.max(-620, vy), grav: g, r: 5, life: 3.2, color: "#caff7a", kind: "spore" });
        GG.bus.emit("creature:spit", {});
        level.fx.burst({ x: sx, y: sy, count: 6, color: "#caff7a", speed: 60, life: 0.3, glow: true });
      }
    }
    render(ctx) {
      if (!this.alive) return;
      ctx.save(); this.flashAlpha(ctx);
      ctx.translate(this.cx, this.y + this.h);
      const s = 1 + (this.swell || 0) * 0.18, wob = Math.sin(this.t * 2.2) * 0.04;
      // stalk
      ctx.fillStyle = "#d9cfae"; ctx.fillRect(-4, -14, 8, 14);
      ctx.fillStyle = "#b8ad8a"; ctx.fillRect(-4, -14, 3, 14);
      // cap
      ctx.save(); ctx.translate(0, -14); ctx.scale(s + wob, s - wob);
      const g = ctx.createLinearGradient(0, -12, 0, 0);
      g.addColorStop(0, "#8a3fb0"); g.addColorStop(1, "#4d1f6e");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 13, 11, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#caff7a"; ctx.shadowBlur = 8; ctx.shadowColor = "#caff7a";
      for (const [x, y, r] of [[-6, -5, 2.2], [3, -8, 2], [7, -3, 1.6], [-1, -3, 1.4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      ctx.restore();
      this.hpBar(ctx);
    }
  }

  /* ---------------------------------------------------------------------
   * Gazemoth — hovers on dusty wings, fixes you with its single eye, and
   * fires aimed laser bolts.
   * ------------------------------------------------------------------- */
  class Moth extends Creature {
    constructor(cfg) { super(cfg, { w: 26, h: 22, hp: 3, period: 2.3, range: 380, speed: 300 }); this.flying = true; this.blood = "#ffd27a"; this.t = (cfg.seed || 0) * 0.7; this.aim = 0; }
    update(dt, level) {
      if (!this.alive) return;
      this.t += dt; this.stT += dt; this._flash = Math.max(0, this._flash - dt);
      // lazy figure-eight hover around home
      this.x = this.x0 + Math.sin(this.t * 0.9) * 26;
      this.y = this.y0 + Math.sin(this.t * 1.8) * 12;
      if (this.awake === false) return;
      const tgt = level.age > 1.2 ? this.nearest(level, this.range, 1e9) : null;
      this.aim = 0;
      if (!tgt || !this.los(level, tgt.cx, tgt.cy)) { this.stT = Math.min(this.stT, this.period - 0.7); return; }
      this.dir = Math.sign(tgt.cx - this.cx) || this.dir;
      if (this.stT > this.period - 0.6) this.aim = (this.stT - (this.period - 0.6)) / 0.6;
      if (this.stT >= this.period) {
        this.stT = 0;
        const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy, d = Math.hypot(dx, dy) || 1;
        level.hostiles.push({ x: this.cx, y: this.cy, vx: dx / d * this.speed, vy: dy / d * this.speed, r: 4, life: 2.5, color: "#ff6ad5", kind: "bolt" });
        GG.bus.emit("laser:shot", {});
      }
    }
    render(ctx) {
      if (!this.alive) return;
      ctx.save(); this.flashAlpha(ctx);
      ctx.translate(this.cx, this.cy);
      const flap = Math.sin(this.t * 16);
      for (const s of [-1, 1]) {
        ctx.save(); ctx.scale(s, 1); ctx.rotate(-0.2 + flap * 0.35);
        ctx.fillStyle = "#b99a6a"; ctx.beginPath(); ctx.ellipse(10, -4, 10, 7, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#8a6e44"; ctx.beginPath(); ctx.ellipse(8, 5, 6, 4, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4b2f6e"; ctx.beginPath(); ctx.arc(11, -4, 3, 0, Math.PI * 2); ctx.fill();   // eye-spot
        ctx.restore();
      }
      ctx.fillStyle = "#6e5436"; ctx.beginPath(); ctx.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2); ctx.fill();
      // the one great eye
      const a = this.aim;
      ctx.fillStyle = "#fff4e0"; ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = a > 0 ? "#ff3fb8" : "#3a1f55"; ctx.shadowBlur = a * 16; ctx.shadowColor = "#ff6ad5";
      ctx.beginPath(); ctx.arc(this.dir * 1.2, -4, 2 + a, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // antennae
      ctx.strokeStyle = "#6e5436"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-1, -8); ctx.quadraticCurveTo(-5, -14, -8, -13); ctx.moveTo(1, -8); ctx.quadraticCurveTo(5, -14, 8, -13); ctx.stroke();
      ctx.restore();
      this.hpBar(ctx);
    }
    getState() { const s = super.getState(); s.t = Math.round(this.t * 100); return s; }
    setState(s) { super.setState(s); if (s && s.t != null) this.t = s.t / 100; }
  }

  /* ---------------------------------------------------------------------
   * Span — a light bridge / step that exists while its signal is live.
   * `any` = list of channels (OR). `oneWay` spans can be jumped up through.
   * ------------------------------------------------------------------- */
  class Span extends GObj {
    constructor(cfg) { super(Object.assign({ w: T * 3, h: 12, oneWay: false, invert: false }, cfg)); this.vis = 0; this.dynSolid = true; this.t = 0; }
    on(level) {
      let v = this.any ? this.any.some(c => level.getChannel(c)) : level.getChannel(this.channel);
      return this.invert ? !v : v;
    }
    update(dt, level) {
      this.t += dt;
      const was = this.vis > 0.5;
      this.vis = U.clamp(this.vis + (this.on(level) ? dt * 3 : -dt * 3), 0, 1);
      if (!was && this.vis > 0.5) { GG.bus.emit("bridge:built", {}); level.fx.burst({ x: this.cx, y: this.cy, count: 10, color: ["#ffe79a", "#7fd4ff"], speed: 60, life: 0.4, glow: true }); }
    }
    solidRect() {
      if (this.vis <= 0.5) return null;
      return this.oneWay ? { x: this.x, y: this.y, w: this.w, h: 10, oneWay: true } : this;
    }
    render(ctx) {
      const v = this.vis;
      if (v <= 0.01) {                                         // a faint ghost outline hints it can appear
        ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = "#ffe79a"; ctx.setLineDash([4, 4]);
        ctx.strokeRect(this.x + 1, this.y + 1, this.w - 2, this.h - 2); ctx.restore();
        return;
      }
      ctx.save();
      const w = this.w * Math.min(1, v * 1.4);
      ctx.globalAlpha = Math.min(1, v * 1.5);
      ctx.fillStyle = "#6b4526"; ctx.fillRect(this.x, this.y + 2, w, this.h - 4);
      ctx.fillStyle = "#8f6236";
      for (let i = 0; i < w - 2; i += 10) ctx.fillRect(this.x + i + 1, this.y + 2, 8, this.h - 6);
      ctx.fillStyle = "#ffe79a"; ctx.shadowBlur = 8; ctx.shadowColor = "#ffe79a";
      ctx.fillRect(this.x, this.y, w, 2);
      ctx.restore();
    }
    getState() { return Math.round(this.vis * 100); }
    setState(s) { this.vis = (s || 0) / 100; }
  }

  /* ---------------------------------------------------------------------
   * Barrier — a knot of crystal thorns sealing a way on. Shoot it apart;
   * once broken it stays broken.
   * ------------------------------------------------------------------- */
  class Barrier extends GObj {
    constructor(cfg) { super(Object.assign({ w: T, h: T * 4, hp: 6 }, cfg)); this.maxHp = this.hp; this.alive = true; this.hittable = true; this.meleeProof = true; this.dynSolid = true; this.t = 0; this._flash = 0; }
    takeHit(level, dmg) {
      if (!this.alive) return;
      this.hp -= dmg || 1; this._flash = 0.15;
      level.fx.burst({ x: this.cx, y: this.cy + U.rand(-this.h / 3, this.h / 3), count: 8, color: ["#c07bff", "#7a2b8a"], speed: 120, life: 0.35 });
      if (this.hp <= 0) {
        this.alive = false;
        GG.bus.emit("door:opened", {});
        level.cam.shake(0.3);
        level.fx.burst({ x: this.cx, y: this.cy, count: 40, color: ["#c07bff", "#e9c8ff", "#3a1f4a"], speed: 220, life: 0.8, gravity: 300, glow: true });
      }
    }
    update(dt, level) { this.t += dt; this._flash = Math.max(0, this._flash - dt); if (this.channel) level.setChannel(this.channel, !this.alive); }
    solidRect() { return this.alive ? this : null; }
    render(ctx) {
      if (!this.alive) return;
      ctx.save();
      if (this._flash > 0) ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#1c1026"; ctx.fillRect(this.x + 4, this.y, this.w - 8, this.h);
      ctx.strokeStyle = "#5a2d74"; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let y = 0; y <= this.h; y += 8) {
          const x = this.cx + Math.sin(y * 0.18 + i * 2.1 + this.t * 0.6) * (this.w * 0.35);
          if (y === 0) ctx.moveTo(x, this.y + y); else ctx.lineTo(x, this.y + y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "#b98adf";
      for (let y = 6; y < this.h; y += 14) { const x = this.cx + Math.sin(y * 0.3) * 9; ctx.beginPath(); ctx.moveTo(x, this.y + y); ctx.lineTo(x + 6, this.y + y - 3); ctx.lineTo(x + 1, this.y + y + 3); ctx.fill(); }
      // crystal heart shows how much is left
      const f = this.hp / this.maxHp;
      ctx.fillStyle = `rgba(233,160,255,${0.4 + 0.6 * f})`; ctx.shadowBlur = 12; ctx.shadowColor = "#e9a0ff";
      ctx.beginPath(); ctx.moveTo(this.cx, this.cy - 9); ctx.lineTo(this.cx + 6, this.cy); ctx.lineTo(this.cx, this.cy + 9); ctx.lineTo(this.cx - 6, this.cy); ctx.fill();
      ctx.restore();
    }
    getState() { return this.alive ? Math.max(1, Math.round(this.hp)) : 0; }
    setState(s) { this.alive = s > 0; if (s > 0) this.hp = s; }
  }

  /* ---------------------------------------------------------------------
   * PowerShrine — an ancient pedestal. When BOTH heroes stand at it the
   * power flows into them (the world grants it to whoever it belongs to).
   * ------------------------------------------------------------------- */
  class PowerShrine extends GObj {
    constructor(cfg) { super(Object.assign({ w: T * 2, h: T * 2, taken: false, glyph: "✦", tint: "#ffe79a" }, cfg)); this.t = 0; this.near = 0; }
    update(dt, level) {
      this.t += dt;
      if (this.taken) return;
      // a guarded shrine wakes only once its guardian has fallen
      this.locked = this.guardCh != null && !level.getChannel(this.guardCh);
      if (this.locked) { this.near = 0; return; }
      let n = 0;
      for (const p of level.players) if (!p.dead && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 90) n++;
      this.near = n;
      if (n >= 2) {
        this.taken = true;
        if (this.escCh) level.setChannel(this.escCh, true);          // …and the region wants you OUT
        level.cam.shake(0.45);
        level.fx.burst({ x: this.cx, y: this.cy - 20, count: 70, color: [this.tint, "#fff", "#7fd4ff"], speed: 260, life: 1.1, glow: true });
        // HIGH FIVE: both heroes cheer together, a spark between their hands
        for (const p of level.players) { if (p.feel) p.feel("laughing", 2.5); p.celebrating = true; p.victoryPose = "celebrate"; p._cheerT = 1.6; }
        const [a, b] = level.players;
        level.fx.burst({ x: (a.cx + b.cx) / 2, y: Math.min(a.y, b.y) - 6, count: 26, color: ["#fff", "#ffe79a", a.character.body, b.character.body], speed: 180, life: 0.6, glow: true });
        GG.bus.emit("player:highfive", {});
        GG.bus.emit("power:gained", { power: this.power });
        if (level.onPower) level.onPower(this.power);
      }
    }
    render(ctx) {
      const x = this.cx, by = this.y + this.h;
      if (this.locked) {                                  // sealed: just a dark pedestal
        ctx.fillStyle = "#2a2538"; ctx.fillRect(x - 26, by - 10, 52, 10);
        ctx.fillStyle = "#34304a"; ctx.fillRect(x - 18, by - 26, 36, 16);
        return;
      }
      ctx.save();
      // light column
      if (!this.taken) {
        const g = ctx.createLinearGradient(0, by - 220, 0, by);
        g.addColorStop(0, "rgba(255,231,154,0)"); g.addColorStop(1, "rgba(255,231,154,0.28)");
        ctx.fillStyle = g; ctx.fillRect(x - 22, by - 220, 44, 220);
      }
      // pedestal
      ctx.fillStyle = "#3a3450"; ctx.fillRect(x - 26, by - 10, 52, 10);
      ctx.fillStyle = "#4c4566"; ctx.fillRect(x - 18, by - 26, 36, 16);
      ctx.fillStyle = "#6a6290"; ctx.fillRect(x - 18, by - 26, 36, 3);
      // runes on the pedestal
      ctx.fillStyle = this.taken ? "#6a6290" : this.tint;
      for (let i = 0; i < 4; i++) ctx.fillRect(x - 14 + i * 8, by - 19, 4, 4);
      // the floating relic
      if (!this.taken) {
        const fy = by - 52 + Math.sin(this.t * 2) * 5;
        ctx.translate(x, fy); ctx.rotate(this.t * 0.8);
        ctx.fillStyle = this.tint; ctx.shadowBlur = 24; ctx.shadowColor = this.tint;
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 0); ctx.lineTo(0, 14); ctx.lineTo(-10, 0); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0); ctx.fill();
        ctx.rotate(-this.t * 0.8); ctx.shadowBlur = 0;
        ctx.strokeStyle = this.tint; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(0, 0, 20 + Math.sin(this.t * 3) * 3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (!this.taken) {
        ctx.save(); ctx.textAlign = "center";
        ctx.font = "700 11px 'Cinzel', Georgia, serif"; ctx.fillStyle = "#ffe79a";
        ctx.fillText(this.label || "Shrine of Power", x, by - 90);
        ctx.font = "9px Georgia, serif"; ctx.fillStyle = "#e8dcc0";
        ctx.fillText(this.near === 1 ? "Both of you must stand here…" : "Stand here together", x, by - 78);
        ctx.restore();
      }
    }
    getState() { return this.taken ? 1 : 0; }
    setState(s) { this.taken = !!s; }
  }

  /* ---------------------------------------------------------------------
   * Passage — a doorway into the neighbouring room. A shimmering veil keeps
   * anyone from wandering out; BOTH heroes standing in the doorway together
   * carries the party through. Freshly-arrived heroes must step out once
   * before it will fire again (so you don't bounce straight back).
   * ------------------------------------------------------------------- */
  class Passage extends GObj {
    constructor(cfg) { super(Object.assign({ w: T * 2, h: T * 4, side: "L" }, cfg)); this.dynSolid = true; this.t = 0; this.n = 0; this.armed = true; this.pv = null; }
    getState() { return this.n | (this.armed ? 4 : 0); }
    setState(s) { this.n = (s || 0) & 3; this.armed = !!((s || 0) & 4); }
    solidRect() { return { x: this.vx, y: this.vy, w: this.vw, h: this.vh }; }
    update(dt, level) {
      this.t += dt;
      let n = 0;
      for (const p of level.players) if (!p.dead && U.aabb(p, this)) n++;
      this.n = n;
      if (!this.armed && n === 0) this.armed = true;
      if (this.armed && n >= 2 && level.onPassage && !this.used) { this.used = true; level.onPassage(this); }
    }
    render(ctx) {
      ctx.save();
      const v = { x: this.vx, y: this.vy, w: this.vw, h: this.vh };
      // shimmering veil at the room's edge
      const vert = this.side === "L" || this.side === "R";
      const gx = vert ? (this.side === "L" ? v.x + v.w : v.x) : 0;
      ctx.globalAlpha = 0.5 + Math.sin(this.t * 3) * 0.15;
      const g = vert
        ? ctx.createLinearGradient(gx + (this.side === "L" ? 26 : -26), 0, gx, 0)
        : ctx.createLinearGradient(0, this.side === "U" ? v.y + v.h + 26 : v.y - 26, 0, this.side === "U" ? v.y + v.h : v.y);
      g.addColorStop(0, "rgba(160,220,255,0)"); g.addColorStop(1, "rgba(190,235,255,0.55)");
      ctx.fillStyle = g;
      if (vert) ctx.fillRect(this.side === "L" ? gx : gx - 26, v.y, 26, v.h);
      else ctx.fillRect(v.x, this.side === "U" ? v.y + v.h : v.y - 26, v.w, 26);
      // drifting motes
      ctx.fillStyle = "#e6f6ff";
      for (let i = 0; i < 6; i++) {
        const k = (this.t * 0.4 + i / 6) % 1;
        const px = vert ? gx + (this.side === "L" ? 1 : -1) * (4 + (i * 7) % 18) : v.x + ((i * 37 + this.t * 20) % v.w);
        const py = vert ? v.y + v.h * (1 - k) : (this.side === "U" ? v.y + v.h + 4 + (i * 5) % 18 : v.y - 4 - (i * 5) % 18);
        ctx.globalAlpha = 0.6 * Math.sin(k * Math.PI);
        ctx.fillRect(px, py, 2, 2);
      }
      ctx.globalAlpha = 1;
      if (this.n === 1 && this.armed) {
        ctx.textAlign = "center"; ctx.font = "700 10px 'Cinzel', Georgia, serif";
        ctx.fillStyle = "rgba(5,4,10,0.65)"; ctx.fillRect(this.cx - 62, this.y - 20, 124, 15);
        ctx.fillStyle = "#e6f6ff"; ctx.fillText("Waiting for your partner…", this.cx, this.y - 9);
      }
      if (this.label && this.n > 0 && this.armed) {
        ctx.textAlign = "center"; ctx.font = "9px Georgia, serif"; ctx.fillStyle = "#bfe8ff";
        ctx.fillText("→ " + this.label, this.cx, this.y - (this.n === 1 ? 24 : 8));
      }
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
   * GateSign — a little plaque naming the power a gate needs.
   * ------------------------------------------------------------------- */
  class GateSign extends GObj {
    constructor(cfg) { super(Object.assign({ w: 20, h: 26, text: "", glyph: "✦", tint: "#ffe79a" }, cfg)); this.t = 0; }
    update(dt, level) { this.t += dt; this.met = this.power && level.powers ? level.powers.includes(this.power) : false; }
    render(ctx) {
      const x = this.cx, by = this.y + this.h;
      ctx.save();
      ctx.fillStyle = "#4a3a28"; ctx.fillRect(x - 2, by - 16, 4, 16);
      ctx.fillStyle = "#2b2340"; ctx.fillRect(x - 13, by - 34, 26, 20);
      ctx.strokeStyle = this.met ? "#6ef0a0" : this.tint; ctx.lineWidth = 1.5; ctx.strokeRect(x - 13, by - 34, 26, 20);
      ctx.fillStyle = this.met ? "#6ef0a0" : this.tint; ctx.shadowBlur = 8; ctx.shadowColor = ctx.fillStyle;
      ctx.font = "12px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText(this.glyph, x, by - 20);
      ctx.shadowBlur = 0;
      ctx.font = "8px Georgia, serif"; ctx.fillStyle = "#e8dcc0";
      ctx.fillText(this.text, x, by - 38);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
   * ArenaSeal — step inside and the gates slam shut until every creature
   * listed in `members` is dead. A wiped party resets the fight.
   * ------------------------------------------------------------------- */
  class ArenaSeal extends GObj {
    constructor(cfg) { super(Object.assign({ members: [] }, cfg)); this.state = cfg.cleared ? 2 : 0; this.t = 0; }
    _mem(level) { return this._m || (this._m = this.members.map(id => level.byId(id)).filter(Boolean)); }
    update(dt, level) {
      this.t += dt;
      const mem = this._mem(level);
      const living = (m) => m.alive !== undefined ? m.alive : !m.deadRat;   // rats keep their own flag
      const alive = mem.filter(living).length;
      if (this.state === 0) {
        if (alive === 0) this.state = 2;
        else if (level.players.some(p => !p.dead && U.aabb(p, this) && p.x > this.x + 40 && p.x + p.w < this.x + this.w - 40)) {
          this.state = 1; GG.bus.emit("arena:start", {}); level.cam.shake(0.3);
        }
      } else if (this.state === 1 && alive === 0) {
        this.state = 2; GG.bus.emit("arena:clear", { boss: !!this.boss });
        level.fx.burst({ x: this.cx, y: this.cy, count: 40, color: ["#ffe79a", "#fff"], speed: 200, life: 0.9, glow: true });
      }
      for (const m of mem) m.awake = this.state === 1;
      level.setChannel(this.channel, this.state === 1);
      if (this.doneChannel) level.setChannel(this.doneChannel, this.state === 2);
      // a guardian fight: fallen heroes revive INSIDE the sealed arena
      if (this.boss) {
        if (this.state === 1 && !this._spawnsMoved) {
          this._spawnsMoved = level.players.map(p => p.spawn);
          level.players.forEach((p, i) => {
            p.spawn = { x: this.inX + i * 30, y: this.inY - p.h - 1 };
            // a hero left standing outside is swept in with their partner
            if (!p.dead && !(p.x > this.x && p.x + p.w < this.x + this.w)) {
              level.fx.burst({ x: p.cx, y: p.cy, count: 12, color: ["#fff", p.character.body], speed: 120, life: 0.4, glow: true });
              p.x = p.spawn.x; p.y = p.spawn.y; p.vx = p.vy = 0;
            }
          });
        } else if (this.state !== 1 && this._spawnsMoved) {
          level.players.forEach((p, i) => { p.spawn = this._spawnsMoved[i]; });
          this._spawnsMoved = null;
        }
      }
    }
    onPartyWipe(level) {
      if (this.state !== 1) return;
      this.state = 0;
      for (const m of this._mem(level)) m.reset();
    }
    render(ctx) {
      if (this.state === 1) {
        ctx.save(); ctx.textAlign = "center";
        ctx.globalAlpha = 0.75 + Math.sin(this.t * 6) * 0.25;
        ctx.font = "700 12px 'Cinzel', Georgia, serif"; ctx.fillStyle = "#ff8a8a";
        if (!this.boss) ctx.fillText("✦ Defeat the beasts! ✦", this.cx, this.y + 40);
        ctx.restore();
      }
    }
    getState() { return this.state; }
    setState(s) { this.state = s || 0; }
  }

  /* ---------------------------------------------------------------------
   * Lore stone — a carved tablet; walk up to it to read a line of story.
   * ------------------------------------------------------------------- */
  class LoreStone extends GObj {
    constructor(cfg) { super(Object.assign({ w: 22, h: 30, lines: [] }, cfg)); this.t = 0; this.read = 0; }
    update(dt, level) {
      this.t += dt;
      const near = level.players.some(p => !p.dead && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 80);
      this.read = U.clamp(this.read + (near ? dt * 3 : -dt * 2), 0, 1);
    }
    render(ctx) {
      const x = this.cx, by = this.y + this.h;
      ctx.save();
      ctx.fillStyle = "#3d3a52"; ctx.beginPath(); ctx.moveTo(x - 11, by); ctx.lineTo(x - 10, by - 24); ctx.quadraticCurveTo(x, by - 32, x + 10, by - 24); ctx.lineTo(x + 11, by); ctx.fill();
      ctx.fillStyle = "#9fd8ff"; ctx.globalAlpha = 0.5 + Math.sin(this.t * 2) * 0.3; ctx.shadowBlur = 8; ctx.shadowColor = "#9fd8ff";
      ctx.fillRect(x - 5, by - 20, 10, 2); ctx.fillRect(x - 4, by - 15, 8, 2); ctx.fillRect(x - 5, by - 10, 10, 2);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      if (this.read > 0.02) {
        ctx.globalAlpha = this.read;
        ctx.font = "italic 10px Georgia, serif"; ctx.textAlign = "center";
        const w = Math.max(...this.lines.map(l => l.length)) * 5 + 20;
        ctx.fillStyle = "rgba(10,8,20,0.8)"; ctx.fillRect(x - w / 2, by - 50 - this.lines.length * 13, w, this.lines.length * 13 + 8);
        ctx.fillStyle = "#e8dcc0";
        this.lines.forEach((l, i) => ctx.fillText(l, x, by - 40 - (this.lines.length - 1 - i) * 13));
      }
      ctx.restore();
    }
  }


  /* ---------------------------------------------------------------------
   * Water — a pool you swim in (JUMP = a stroke upward). Tidal pools rise
   * and fall on a slow clock shared with the level timer, so a high tide can
   * float you up to ledges that are out of reach at low tide.
   * ------------------------------------------------------------------- */
  class Water extends GObj {
    constructor(cfg) { super(Object.assign({ tide: 0, period: 10, phase: 0 }, cfg)); this.bottom = this.y + this.h; this.t = 0; this._in = new Set(); }
    level(lvl) {
      if (!this.tide) return this.y;
      const k = (Math.sin(((lvl.timeMs || 0) / 1000 + this.phase) / this.period * Math.PI * 2) + 1) / 2;
      return this.y - this.tide * k;                         // surface y
    }
    affectPlayers(lvl, dt) {
      this.t += dt;
      const top = this.level(lvl);
      const zone = { x: this.x, y: top, w: this.w, h: this.bottom - top };
      for (const p of lvl.players) {
        if (p.dead) continue;
        const inNow = p.y + p.h * 0.55 > top && U.aabb(p, zone);
        if (inNow) p.swimming = true;
        const was = this._in.has(p);
        if (inNow !== was) {
          if (inNow) this._in.add(p); else this._in.delete(p);
          if (Math.abs(p.vy) > 120 || inNow) {
            GG.bus.emit("water:splash", {});
            lvl.fx.burst({ x: p.cx, y: top, count: 14, color: ["#bfe8ff", "#ffffff", "#7fd4ff"], speed: 150, life: 0.5, angle: -Math.PI / 2, spread: 1.2, gravity: 500 });
          }
        }
      }
    }
    render(ctx, lvl) {
      const top = this.level(lvl), h = this.bottom - top, t = (lvl.timeMs || 0) / 1000;
      ctx.save();
      const g = ctx.createLinearGradient(0, top, 0, this.bottom);
      g.addColorStop(0, "rgba(90,190,230,0.45)"); g.addColorStop(1, "rgba(20,60,110,0.65)");
      ctx.fillStyle = g; ctx.fillRect(this.x, top, this.w, h);
      // caustic ripples
      ctx.strokeStyle = "rgba(220,250,255,0.18)"; ctx.lineWidth = 1;
      for (let y = top + 10; y < this.bottom; y += 14) {
        ctx.beginPath();
        for (let x = this.x; x <= this.x + this.w; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.05 + t * 2 + y) * 2);
        ctx.stroke();
      }
      // the surface
      ctx.strokeStyle = "rgba(230,250,255,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = this.x; x <= this.x + this.w; x += 6) ctx.lineTo(x, top + Math.sin(x * 0.07 + t * 3) * 1.6);
      ctx.stroke();
      ctx.restore();
    }
    getState() { return null; }
  }

  /* ---------------------------------------------------------------------
   * Updraft — a column of rising air (sky isles) or a steam vent that
   * breathes on a timer (the ironworks). Ride it up.
   * ------------------------------------------------------------------- */
  class Updraft extends GObj {
    constructor(cfg) { super(Object.assign({ lift: 2600, maxUp: 330, period: 0, on: 0, phase: 0, steam: false }, cfg)); this.t = 0; }
    active(lvl) {
      if (!this.period) return true;
      return ((((lvl.timeMs || 0) / 1000 + this.phase) % this.period) + this.period) % this.period < this.on;
    }
    affectPlayers(lvl, dt) {
      this.t += dt;
      if (!this.active(lvl)) return;
      for (const p of lvl.players) {
        if (p.dead || p.swing || !U.aabb(p, this)) continue;
        // stronger near the bottom of the column, fading toward its top
        const k = U.clamp((p.y + p.h - this.y) / this.h, 0.15, 1);
        // cancels gravity and then some near the vent, fading out toward the top
        p.vy = Math.max(-this.maxUp, p.vy - (GG.C.GRAVITY * 1.05 + this.lift * (k - 0.3)) * dt); p._noCut = true;
        if (p.onGround) { p.onGround = false; p.y -= 2; }
      }
    }
    render(ctx, lvl) {
      const on = this.active(lvl), t = (lvl.timeMs || 0) / 1000;
      ctx.save();
      if (this.steam) {                                      // the vent grate
        ctx.fillStyle = "#3a3240"; ctx.fillRect(this.x, this.y + this.h - 8, this.w, 8);
        ctx.fillStyle = on ? "#ff9a4d" : "#6a5a70";
        for (let x = this.x + 3; x < this.x + this.w - 2; x += 7) ctx.fillRect(x, this.y + this.h - 6, 3, 4);
      }
      ctx.globalAlpha = on ? 0.5 : 0.1;
      const c = this.steam ? "235,235,245" : "220,245,255";
      for (let i = 0; i < 9; i++) {
        const k = ((t * (this.steam ? 0.9 : 0.6) + i / 9) % 1);
        const y = this.y + this.h * (1 - k);
        const x = this.x + this.w * (0.2 + 0.6 * ((i * 37) % 10) / 10) + Math.sin(t * 3 + i) * 4;
        ctx.fillStyle = `rgba(${c},${0.5 * Math.sin(k * Math.PI)})`;
        ctx.beginPath(); ctx.arc(x, y, this.steam ? 6 + k * 8 : 2 + k * 2, 0, Math.PI * 2); ctx.fill();
      }
      if (!this.steam) {                                     // streaks of wind
        ctx.strokeStyle = `rgba(${c},0.35)`; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const x = this.x + (i + 0.5) * this.w / 4, y = this.y + ((t * 160 + i * 70) % this.h);
          ctx.beginPath(); ctx.moveTo(x, y + 18); ctx.lineTo(x, y); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
   * Bouncer — a springy forest mushroom. Land on it and it flings you up.
   * ------------------------------------------------------------------- */
  class Bouncer extends GObj {
    constructor(cfg) { super(Object.assign({ w: T * 2, h: 18, power: 880 }, cfg)); this.dynSolid = true; this.squish = 0; this.t = 0; }
    solidRect() { return { x: this.x, y: this.y + 4, w: this.w, h: this.h - 4, oneWay: true, _bouncer: this }; }
    affectPlayers(lvl, dt) {
      this.t += dt; this.squish = Math.max(0, this.squish - dt * 3);
      for (const p of lvl.players) {
        if (p.dead || !p.groundRef || p.groundRef._bouncer !== this) continue;
        p.vy = -this.power; p.onGround = false; p.groundRef = null; p.y -= 3; p._noCut = true;
        p.jumpsLeft = Math.max(p.jumpsLeft, p.character.maxJumps - 1);
        p.squash = 1.35; this.squish = 1;
        GG.bus.emit("player:bounce", {});
        lvl.fx.burst({ x: this.cx, y: this.y, count: 10, color: ["#ff8ad0", "#fff", "#caff7a"], speed: 120, life: 0.4, glow: true });
      }
    }
    render(ctx) {
      const s = 1 - this.squish * 0.35, cx = this.cx, by = this.y + this.h;
      ctx.save();
      ctx.fillStyle = "#e8dcc0"; ctx.fillRect(cx - 5, by - 10, 10, 10);
      ctx.translate(cx, by - 8); ctx.scale(1 + this.squish * 0.2, s);
      const g = ctx.createLinearGradient(0, -16, 0, 0);
      g.addColorStop(0, "#ff7ac8"); g.addColorStop(1, "#b0357e");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, 13, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#fff4fb";
      for (const [x, y, r] of [[-14, -6, 3], [-3, -10, 2.5], [10, -5, 3], [4, -3, 1.8]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------------
   * LightReceiver — a sun crystal. Steer a golden sunbeam into it (turn
   * the mirrors with ACTION) and it wakes, latching its channel.
   * ------------------------------------------------------------------- */
  class LightReceiver extends GObj {
    constructor(cfg) { super(Object.assign({ w: T, h: T }, cfg)); this.isReceiver = true; this.lit = false; this.charge = 0; this.done = false; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      if (!this.done) {
        this.charge = U.clamp(this.charge + (this.lit ? dt * 2 : -dt), 0, 1);
        if (this.charge >= 1) {
          this.done = true;
          GG.bus.emit("lock:opened", {});
          level.fx.burst({ x: this.cx, y: this.cy, count: 30, color: ["#ffe79a", "#fff"], speed: 180, life: 0.7, glow: true });
        }
      }
      level.setChannel(this.channel, this.done);
    }
    render(ctx) {
      const k = this.done ? 1 : this.charge;
      ctx.save(); ctx.translate(this.cx, this.cy);
      ctx.fillStyle = "#3a3450"; ctx.fillRect(-12, 8, 24, 8);
      ctx.fillStyle = `rgba(255,${200 + 55 * k},${120 + 100 * k},${0.35 + 0.65 * k})`;
      ctx.shadowBlur = 8 + 20 * k; ctx.shadowColor = "#ffe79a";
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 0); ctx.lineTo(0, 10); ctx.lineTo(-9, 0); ctx.fill();
      ctx.restore();
    }
    getState() { return this.done ? 100 : Math.round(this.charge * 99); }
    setState(s) { this.done = s >= 100; this.charge = (s || 0) / 100; }
  }

  Object.assign(EXT, {
    beetle: Beetle, toad: Toad, bat: Bat, spitter: Spitter, moth: Moth,
    span: Span, barrier: Barrier, shrine: PowerShrine, passage: Passage,
    gatesign: GateSign, arena: ArenaSeal, lore: LoreStone,
    water: Water, updraft: Updraft, bouncer: Bouncer, receiver: LightReceiver,
  });
  Object.assign(O, { Creature, Beetle, Toad, Bat, Spitter, Moth, Span, Barrier, PowerShrine, Passage, GateSign, ArenaSeal, LoreStone, Water, Updraft, Bouncer, LightReceiver });
})(window);
