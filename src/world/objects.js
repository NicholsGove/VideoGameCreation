/* =========================================================================
 * objects.js — interactive world objects (puzzle mechanics)
 * -------------------------------------------------------------------------
 * Every puzzle piece is a small class with a common interface:
 *   update(dt, level)   advance state
 *   render(ctx, level)  draw in world space
 *   solidRect()         optional -> {x,y,w,h} if it currently blocks movement
 *
 * Objects communicate through "channels" (named signals) held on the Level.
 * A button/switch WRITES a channel; a door/platform READS it. This keeps the
 * mechanics fully data-driven and decoupled, so new contraptions are trivial
 * to add and levels are pure data (see levels.js).
 *
 * Networking note: all mutable object state is serialised by Level.snapshot()
 * / applySnapshot() (see level.js) so the host stays authoritative online.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;

  const COLORS = {
    blue:  { main: "#35b7ff", dim: "#1d5f86", glow: "#7fd4ff" },
    green: { main: "#5ce08a", dim: "#2f704a", glow: "#9bf0b8" },
    gold:  { main: "#ffcf4d", dim: "#8a6f22", glow: "#ffe79a" },
    red:   { main: "#ff5a6a", dim: "#7a2b33", glow: "#ff9aa4" },
  };

  /** Base class: gives every object an id and a bounding box. */
  class GObj {
    constructor(cfg) {
      Object.assign(this, cfg);
      this.id = cfg.id != null ? cfg.id : GObj._nid++;
      this.w = cfg.w != null ? cfg.w : C.TILE;
      this.h = cfg.h != null ? cfg.h : C.TILE;
    }
    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    update() {}
    render() {}
    solidRect() { return null; }
    /** Per-object mutable state for network sync. Override as needed. */
    getState() { return null; }
    setState() {}
  }
  GObj._nid = 1;

  // ------------------------------------------------------------------ Gem
  class Gem extends GObj {
    constructor(cfg) { super(Object.assign({ w: 18, h: 18 }, cfg)); this.collected = false; this.t = 0; }
    update(dt) { this.t += dt; }
    render(ctx) {
      if (this.collected) return;
      const bob = Math.sin(this.t * 3) * 3;
      const x = this.x + this.w / 2, y = this.y + this.h / 2 + bob;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = 12; ctx.shadowColor = COLORS.gold.glow;
      ctx.fillStyle = COLORS.gold.main;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = "#fff8dc"; ctx.fillRect(-7, -7, 5, 5);
      ctx.restore();
    }
    tryCollect(player, level) {
      if (this.collected) return;
      if (U.aabb(player, this)) {
        this.collected = true;
        level.gemsCollected++;
        GG.bus.emit("gem:collected", { level });
        level.fx.burst({ x: this.cx, y: this.cy, count: 14, color: [COLORS.gold.main, "#fff"], speed: 130, life: 0.5, size: 3, glow: true });
      }
    }
    getState() { return this.collected ? 1 : 0; }
    setState(s) { this.collected = !!s; }
  }

  // ------------------------------------------------------------------ Key / LockedDoor
  class Key extends GObj {
    constructor(cfg) { super(Object.assign({ w: 20, h: 20, color: "gold" }, cfg)); this.collected = false; this.t = 0; }
    update(dt) { this.t += dt; }
    render(ctx) {
      if (this.collected) return;
      const c = COLORS[this.color] || COLORS.gold;
      const bob = Math.sin(this.t * 3.4) * 3;
      ctx.save(); ctx.translate(this.cx, this.cy + bob);
      ctx.shadowBlur = 10; ctx.shadowColor = c.glow; ctx.fillStyle = c.main;
      ctx.beginPath(); ctx.arc(-3, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(0, -2, 10, 4); ctx.fillRect(7, -2, 3, 7);
      ctx.restore();
    }
    tryCollect(player, level) {
      if (this.collected || !U.aabb(player, this)) return;
      this.collected = true;
      level.keys[this.color] = (level.keys[this.color] || 0) + 1;
      GG.bus.emit("key:collected", { color: this.color });
      const c = COLORS[this.color] || COLORS.gold;
      level.fx.burst({ x: this.cx, y: this.cy, count: 12, color: [c.main, "#fff"], speed: 120, life: 0.4, glow: true });
    }
    getState() { return this.collected ? 1 : 0; }
    setState(s) { this.collected = !!s; }
  }

  class LockedDoor extends GObj {
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE * 2, color: "gold" }, cfg)); this.open = false; }
    update(dt, level) {
      if (!this.open && (level.keys[this.color] || 0) > 0) {
        this.open = true;
        level.keys[this.color]--;
        GG.bus.emit("lock:opened", { color: this.color });
        level.fx.burst({ x: this.cx, y: this.cy, count: 18, color: (COLORS[this.color] || COLORS.gold).main, speed: 150, life: 0.5, glow: true });
      }
    }
    solidRect() { return this.open ? null : this; }
    render(ctx) {
      const c = COLORS[this.color] || COLORS.gold;
      if (this.open) {
        ctx.globalAlpha = 0.25;
      }
      ctx.fillStyle = c.dim; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = c.main;
      for (let i = 0; i < this.h; i += 10) ctx.fillRect(this.x + 3, this.y + i + 2, this.w - 6, 5);
      // keyhole
      ctx.fillStyle = "#0b0e18"; ctx.beginPath(); ctx.arc(this.cx, this.cy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    getState() { return this.open ? 1 : 0; }
    setState(s) { this.open = !!s; }
  }

  // ------------------------------------------------------------------ Button (momentary) & Switch (toggle)
  class Button extends GObj {
    // Active while a player or crate rests on it. Writes `channel`.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: 10, color: "gold" }, cfg)); this.pressed = false; }
    update(dt, level) {
      const wasPressed = this.pressed;
      const sensor = { x: this.x, y: this.y - 6, w: this.w, h: 12 };
      let on = false;
      // `needsCrate` plates are too heavy for a hero — only cargo triggers them.
      if (!this.needsCrate) for (const p of level.players) if (!p.dead && U.aabb(p, sensor)) on = true;
      for (const c of level.crates) if (!c.carried && U.aabb(c, sensor)) on = true;
      this.pressed = on;
      level.setChannel(this.channel, on || level.channelForcedBy(this.channel, this));
      if (on && !wasPressed) GG.bus.emit("button:pressed", { channel: this.channel });
    }
    render(ctx) {
      const c = COLORS[this.color] || COLORS.gold;
      ctx.fillStyle = "#0e1526"; ctx.fillRect(this.x - 2, this.y + (this.pressed ? 5 : 2), this.w + 4, 6);
      ctx.fillStyle = this.pressed ? c.dim : c.main;
      const yy = this.y + (this.pressed ? 5 : 0);
      ctx.fillRect(this.x, yy, this.w, 8);
      if (!this.pressed) { ctx.shadowBlur = 8; ctx.shadowColor = c.glow; ctx.fillRect(this.x + 3, yy, this.w - 6, 3); ctx.shadowBlur = 0; }
    }
    getState() { return this.pressed ? 1 : 0; }
    setState(s) { this.pressed = !!s; }
  }

  class Switch extends GObj {
    // Toggled by pressing "action" while overlapping. `colorLock` restricts
    // which character may use it (the core co-op mechanic).
    constructor(cfg) { super(Object.assign({ w: 22, h: 28, color: "gold", colorLock: null }, cfg)); this.on = !!cfg.startOn; this._cool = 0; }
    update(dt, level) {
      this._cool = Math.max(0, this._cool - dt);
      for (const p of level.players) {
        if (p.dead) continue;
        if (this.colorLock && p.character.color !== this.colorLock) continue;
        if (U.aabb(p, this) && p.input && p.input.action && this._cool === 0) {
          this.on = !this.on; this._cool = 0.35;
          GG.bus.emit("switch:toggled", { channel: this.channel, on: this.on });
          level.fx.burst({ x: this.cx, y: this.cy, count: 8, color: (COLORS[this.colorLock || this.color] || COLORS.gold).main, speed: 70, life: 0.3 });
        }
      }
      level.setChannel(this.channel, this.on);
    }
    render(ctx) {
      const c = COLORS[this.colorLock || this.color] || COLORS.gold;
      ctx.fillStyle = "#0e1526"; ctx.fillRect(this.x + 6, this.y + 12, 10, 16);
      ctx.save(); ctx.translate(this.cx, this.y + 14);
      ctx.rotate(this.on ? -0.5 : 0.5);
      ctx.fillStyle = c.main; ctx.shadowBlur = this.on ? 8 : 0; ctx.shadowColor = c.glow;
      ctx.fillRect(-2, -14, 4, 16);
      ctx.beginPath(); ctx.arc(0, -14, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (this.colorLock) { ctx.fillStyle = c.dim; ctx.fillRect(this.x + 2, this.y + 26, this.w - 4, 3); }
    }
    getState() { return this.on ? 1 : 0; }
    setState(s) { this.on = !!s; }
  }

  // ------------------------------------------------------------------ Door (signal-gated) & Timed door
  class Door extends GObj {
    // Solid unless its channel is active. `invert` flips the logic.
    // `timedMs` keeps it open briefly after the signal drops (timed doors).
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE * 2, color: "blue", invert: false, timedMs: 0 }, cfg)); this.open = false; this._openTimer = 0; }
    update(dt, level) {
      // `channels` (array) = AND logic: every listed signal must be active.
      let sig = this.channels
        ? this.channels.every(c => level.getChannel(c))
        : level.getChannel(this.channel);
      if (this.invert) sig = !sig;
      const was = this.open;
      if (sig) this._openTimer = this.timedMs / 1000;
      else this._openTimer = Math.max(0, this._openTimer - dt);
      this.open = sig || this._openTimer > 0;
      if (this.open && !was) GG.bus.emit("door:opened", { channel: this.channel });
    }
    solidRect() { return this.open ? null : this; }
    render(ctx) {
      const c = COLORS[this.color] || COLORS.blue;
      const openAmt = this.open ? 1 : 0;
      ctx.fillStyle = "#0c1120"; ctx.fillRect(this.x - 2, this.y - 2, this.w + 4, this.h + 4);
      // door slides up as it opens
      const slide = openAmt * (this.h - 6);
      ctx.save();
      ctx.beginPath(); ctx.rect(this.x, this.y, this.w, this.h); ctx.clip();
      ctx.fillStyle = c.dim; ctx.fillRect(this.x, this.y - slide, this.w, this.h);
      ctx.fillStyle = c.main; ctx.shadowBlur = 6; ctx.shadowColor = c.glow;
      for (let i = 0; i < this.h; i += 12) ctx.fillRect(this.x + 3, this.y - slide + i + 2, this.w - 6, 6);
      ctx.restore();
    }
    getState() { return (this.open ? 1 : 0) | (Math.round(this._openTimer * 100) << 1); }
    setState(s) { this.open = !!(s & 1); this._openTimer = (s >> 1) / 100; }
  }

  // ------------------------------------------------------------------ Crate (pushable, gravity)
  class Crate extends GObj {
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE }, cfg)); this.vx = 0; this.vy = 0; this.onGround = false; }
    // Crate physics handled by Level (needs the full solid set). See level.js.
    solidRect() { return this; }
    render(ctx) {
      ctx.fillStyle = "#8a5a2b"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#a06a34"; ctx.fillRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
      ctx.strokeStyle = "#5f3d1c"; ctx.lineWidth = 2;
      ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
      ctx.beginPath();
      ctx.moveTo(this.x + 2, this.y + 2); ctx.lineTo(this.x + this.w - 2, this.y + this.h - 2);
      ctx.moveTo(this.x + this.w - 2, this.y + 2); ctx.lineTo(this.x + 2, this.y + this.h - 2);
      ctx.stroke();
    }
    getState() { return { x: Math.round(this.x * 10) / 10, y: Math.round(this.y * 10) / 10, vx: this.vx, vy: this.vy }; }
    setState(s) { if (!s) return; this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy; }
  }

  // ------------------------------------------------------------------ Moving platform
  class MovingPlatform extends GObj {
    // Moves between (x,y) and (x2,y2). If `channel` is set, only moves while
    // the signal is active; otherwise it ping-pongs continuously.
    constructor(cfg) {
      super(Object.assign({ w: C.TILE * 2, h: 14, speed: 60 }, cfg));
      this.x0 = this.x; this.y0 = this.y;
      this.x1 = cfg.x2 != null ? cfg.x2 : this.x;
      this.y1 = cfg.y2 != null ? cfg.y2 : this.y;
      this.t = 0; this.dir = 1; this.dx = 0; this.dy = 0;
    }
    update(dt, level) {
      let move = true;
      if (this.channel != null) move = level.getChannel(this.channel);
      const dist = Math.hypot(this.x1 - this.x0, this.y1 - this.y0) || 1;
      const px = this.x, py = this.y;
      if (move) {
        this.t += (this.dir * this.speed * dt) / dist;
        if (this.t >= 1) { this.t = 1; this.dir = -1; }
        else if (this.t <= 0) { this.t = 0; this.dir = 1; }
      }
      const e = this._ease(this.t);
      this.x = U.lerp(this.x0, this.x1, e);
      this.y = U.lerp(this.y0, this.y1, e);
      this.dx = this.x - px; this.dy = this.y - py; // per-frame delta for carrying riders
    }
    _ease(t) { return t; } // linear; swap for smoothstep if desired
    solidRect() { return this; }
    render(ctx) {
      ctx.fillStyle = "#3a466a"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#556197"; ctx.fillRect(this.x, this.y, this.w, 4);
      ctx.fillStyle = "#ffcf4d";
      for (let i = 6; i < this.w - 6; i += 14) ctx.fillRect(this.x + i, this.y + 6, 8, 3);
    }
    getState() { return { t: Math.round(this.t * 1000) / 1000, dir: this.dir }; }
    setState(s) { if (!s) return; this.t = s.t; this.dir = s.dir; }
  }

  // ------------------------------------------------------------------ Hazards (electric / poison / spikes)
  class Hazard extends GObj {
    // kind: "electric" (kills non-electric-immune), "poison" (kills non-poison-immune),
    //       "spike"/"laserfield" (kills everyone). `channel` optionally gates it.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, kind: "spike" }, cfg)); this.t = 0; }
    active(level) { return this.channel == null ? true : (this.invert ? !level.getChannel(this.channel) : level.getChannel(this.channel)); }
    update(dt) { this.t += dt; }
    kills(player) {
      if (this.kind === "electric") return !player.character.immune.includes("electric");
      if (this.kind === "poison")   return !player.character.immune.includes("poison");
      return true; // spikes / generic
    }
    render(ctx, level) {
      const on = this.active(level);
      if (this.kind === "electric") {
        ctx.globalAlpha = on ? 1 : 0.15;
        ctx.strokeStyle = COLORS.blue.main; ctx.shadowBlur = on ? 10 : 0; ctx.shadowColor = COLORS.blue.glow; ctx.lineWidth = 2;
        for (let x = this.x + 4; x < this.x + this.w; x += 12) {
          ctx.beginPath();
          let yy = this.y;
          ctx.moveTo(x, yy);
          while (yy < this.y + this.h) { yy += 6; ctx.lineTo(x + Math.sin((yy + this.t * 30) * 0.6) * 4, yy); }
          ctx.stroke();
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else if (this.kind === "poison") {
        ctx.globalAlpha = on ? 1 : 0.15;
        ctx.fillStyle = "rgba(92,224,138,0.28)"; ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = COLORS.green.main;
        for (let i = 0; i < this.w; i += 10) {
          const by = this.y + this.h - ((this.t * 20 + i * 7) % this.h);
          ctx.globalAlpha = (on ? 0.7 : 0.1); ctx.beginPath(); ctx.arc(this.x + i + 5, by, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else { // spikes
        ctx.fillStyle = "#9aa4c2";
        const n = Math.max(1, Math.floor(this.w / 10));
        for (let i = 0; i < n; i++) {
          const sx = this.x + i * (this.w / n);
          ctx.beginPath(); ctx.moveTo(sx, this.y + this.h);
          ctx.lineTo(sx + this.w / n / 2, this.y); ctx.lineTo(sx + this.w / n, this.y + this.h); ctx.fill();
        }
      }
    }
    getState() { return null; }
  }

  // ------------------------------------------------------------------ Laser + Mirror
  class Mirror extends GObj {
    // orientation: "/" or "\" — reflects a laser beam 90°.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, orient: "/" }, cfg)); }
    solidRect() { return null; }
    render(ctx) {
      ctx.strokeStyle = "#cfe0ff"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.shadowBlur = 6; ctx.shadowColor = "#cfe0ff";
      ctx.beginPath();
      if (this.orient === "/") { ctx.moveTo(this.x + 4, this.y + this.h - 4); ctx.lineTo(this.x + this.w - 4, this.y + 4); }
      else { ctx.moveTo(this.x + 4, this.y + 4); ctx.lineTo(this.x + this.w - 4, this.y + this.h - 4); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }

  class Laser extends GObj {
    // Emits a beam in `dir` ("up/down/left/right"). Beam is traced by the Level
    // (needs mirrors + solids), then stored in this.segments for hit-testing.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, dir: "right" }, cfg)); this.segments = []; this.t = 0; }
    active(level) { return this.channel == null ? true : (this.invert ? !level.getChannel(this.channel) : level.getChannel(this.channel)); }
    update(dt) { this.t += dt; }
    render(ctx, level) {
      // emitter housing
      ctx.fillStyle = "#5a2b33"; ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, this.h - 8);
      ctx.fillStyle = COLORS.red.main; ctx.beginPath(); ctx.arc(this.cx, this.cy, 5, 0, Math.PI * 2); ctx.fill();
      if (!this.active(level)) return;
      // beam
      ctx.strokeStyle = COLORS.red.main; ctx.lineWidth = 3 + Math.sin(this.t * 20) * 0.6;
      ctx.shadowBlur = 12; ctx.shadowColor = COLORS.red.glow; ctx.lineCap = "round";
      ctx.beginPath();
      for (const s of this.segments) { ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
  }

  // ------------------------------------------------------------------ Teleporter (pairs)
  class Teleporter extends GObj {
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, pair: null, color: "blue" }, cfg)); this.t = 0; this._cool = 0; }
    update(dt, level) {
      this.t += dt; this._cool = Math.max(0, this._cool - dt);
      const partner = level.byId(this.pair);
      if (!partner) return;
      for (const p of level.players) {
        if (p.dead || p._teleCool > 0) continue;
        if (U.aabb(p, this) && this._cool === 0) {
          p.x = partner.cx - p.w / 2; p.y = partner.cy - p.h / 2;
          p._teleCool = 0.6; partner._cool = 0.6; this._cool = 0.6;
          GG.bus.emit("teleport:used", {});
          level.fx.burst({ x: this.cx, y: this.cy, count: 16, color: (COLORS[this.color]||COLORS.blue).main, speed: 140, life: 0.5, glow: true });
          level.fx.burst({ x: partner.cx, y: partner.cy, count: 16, color: (COLORS[this.color]||COLORS.blue).main, speed: 140, life: 0.5, glow: true });
        }
      }
    }
    render(ctx) {
      const c = COLORS[this.color] || COLORS.blue;
      ctx.save(); ctx.translate(this.cx, this.cy);
      for (let i = 0; i < 3; i++) {
        const r = 6 + i * 5 + Math.sin(this.t * 3 + i) * 2;
        ctx.globalAlpha = 0.5 - i * 0.12; ctx.strokeStyle = c.main; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  // ------------------------------------------------------------------ Exit pad (goal)
  class Exit extends GObj {
    // The level is won when BOTH players stand on their matching exits at once.
    // `player` = 0 or 1 restricts which character it accepts.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, player: 0 }, cfg)); this.t = 0; this.occupied = false; }
    update(dt, level) {
      this.t += dt;
      const p = level.players[this.player];
      this.occupied = p && !p.dead && U.aabb(p, this);
    }
    render(ctx) {
      const c = this.player === 0 ? COLORS.blue : COLORS.green;
      ctx.save(); ctx.translate(this.cx, this.y + this.h);
      const glow = this.occupied ? 1 : 0.5 + Math.sin(this.t * 4) * 0.2;
      ctx.globalAlpha = glow;
      const grd = ctx.createLinearGradient(0, 0, 0, -60);
      grd.addColorStop(0, c.main); grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd; ctx.fillRect(-this.w / 2, -60, this.w, 60);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.main; ctx.shadowBlur = 12; ctx.shadowColor = c.glow;
      ctx.fillRect(-this.w / 2, -6, this.w, 6);
      ctx.shadowBlur = 0; ctx.restore();
    }
  }

  // ------------------------------------------------------------------ Time switch
  class TimedSwitch extends GObj {
    // Ancient clockwork lever: powers its channel for `duration` seconds, then
    // winds down. Creates races — throw it, then move before the sand runs out.
    constructor(cfg) { super(Object.assign({ w: 24, h: 30, duration: 7, colorLock: null }, cfg)); this.left = 0; this._cool = 0; }
    update(dt, level) {
      this._cool = Math.max(0, this._cool - dt);
      this.left = Math.max(0, this.left - dt);
      for (const p of level.players) {
        if (p.dead) continue;
        if (this.colorLock && p.character.color !== this.colorLock) continue;
        if (U.aabb(p, this) && p.input && p.input.action && this._cool === 0) {
          this.left = this.duration; this._cool = 0.45;
          GG.bus.emit("switch:toggled", { channel: this.channel, on: true });
          level.fx.burst({ x: this.cx, y: this.cy, count: 12, color: [COLORS.gold.main, "#fff"], speed: 90, life: 0.4, glow: true });
        }
      }
      level.setChannel(this.channel, this.left > 0);
    }
    render(ctx) {
      const f = this.left / this.duration;
      const c = this.left > 0 ? COLORS.gold : COLORS.blue;
      // hourglass frame
      ctx.fillStyle = "#2a2340"; ctx.fillRect(this.x + 3, this.y, this.w - 6, this.h);
      ctx.strokeStyle = c.main; ctx.lineWidth = 2;
      ctx.shadowBlur = this.left > 0 ? 8 : 0; ctx.shadowColor = c.glow;
      ctx.beginPath();
      ctx.moveTo(this.x + 5, this.y + 3); ctx.lineTo(this.x + this.w - 5, this.y + 3);
      ctx.lineTo(this.cx, this.cy); ctx.lineTo(this.x + this.w - 5, this.y + this.h - 3);
      ctx.lineTo(this.x + 5, this.y + this.h - 3); ctx.lineTo(this.cx, this.cy);
      ctx.closePath(); ctx.stroke(); ctx.shadowBlur = 0;
      // sand level drains as the timer runs out
      if (this.left > 0) {
        ctx.fillStyle = c.main;
        ctx.fillRect(this.x + 6, this.y + this.h - 4 - (this.h - 8) * 0.45 * f, this.w - 12, (this.h - 8) * 0.45 * f);
        ctx.fillStyle = "#f6ecd2"; ctx.font = "9px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(this.left.toFixed(1), this.cx, this.y - 4); ctx.textAlign = "left";
      }
    }
    getState() { return Math.round(this.left * 100); }
    setState(s) { this.left = (s || 0) / 100; }
  }

  // ------------------------------------------------------------------ Rotating platform
  class Rotor extends MovingPlatform {
    // A stone arm that orbits a hub. Heroes ride it (Level carries riders via
    // the same dx/dy the moving platforms use).
    constructor(cfg) {
      super(Object.assign({ w: C.TILE * 2, h: 14 }, cfg));
      this.hubX = this.x; this.hubY = this.y;
      this.radius = cfg.radius != null ? cfg.radius : C.TILE * 3;
      this.rate = cfg.rate != null ? cfg.rate : 0.7;
      this.a = cfg.phase || 0;
      this.dx = 0; this.dy = 0;
    }
    update(dt, level) {
      let move = true;
      if (this.channel != null) move = level.getChannel(this.channel);
      const px = this.x, py = this.y;
      if (move) this.a += this.rate * dt;
      this.x = this.hubX + Math.cos(this.a) * this.radius - this.w / 2;
      this.y = this.hubY + Math.sin(this.a) * this.radius - this.h / 2;
      this.dx = this.x - px; this.dy = this.y - py;
    }
    render(ctx) {
      // hub + arm
      ctx.strokeStyle = "#4a4358"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(this.hubX, this.hubY); ctx.lineTo(this.cx, this.cy); ctx.stroke();
      ctx.fillStyle = "#3a3350"; ctx.beginPath(); ctx.arc(this.hubX, this.hubY, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6a6280"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#8a82a0"; ctx.fillRect(this.x, this.y, this.w, 4);
      ctx.fillStyle = COLORS.gold.main;
      for (let i = 6; i < this.w - 6; i += 14) ctx.fillRect(this.x + i, this.y + 6, 8, 3);
    }
    getState() { return Math.round(this.a * 100); }
    setState(s) { this.a = (s || 0) / 100; }
  }

  // ------------------------------------------------------------------ Portal (shared goal)
  class Portal extends GObj {
    // The level ends only when BOTH heroes stand inside the ring together.
    // Unlike the old paired pads this is a single place they must meet.
    constructor(cfg) { super(Object.assign({ w: C.TILE * 2, h: C.TILE * 2 }, cfg)); this.t = 0; this.charge = 0; this.occupants = 0; }
    update(dt, level) {
      this.t += dt;
      let n = 0;
      for (const p of level.players) if (!p.dead && U.aabb(p, this)) n++;
      this.occupants = n;
      // ramps up while both are inside, decays otherwise
      this.charge = U.clamp(this.charge + (n >= 2 ? dt * 1.6 : -dt * 2), 0, 1);
      if (n >= 2 && this.charge >= 1) this.ready = true;
      if (n >= 2 && Math.random() < 0.4) {
        level.fx.burst({ x: this.cx + U.rand(-this.w / 2, this.w / 2), y: this.y + this.h, count: 1,
          color: [COLORS.gold.main, COLORS.blue.main, COLORS.green.main], speed: 40, life: 0.6, lift: 60, glow: true });
      }
    }
    render(ctx) {
      const cx = this.cx, cy = this.cy, t = this.t;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = 0.35 + this.charge * 0.5 + Math.sin(t * 3) * 0.08;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, this.w * 0.9);
      g.addColorStop(0, `rgba(255,236,180,${glow})`);
      g.addColorStop(0.5, `rgba(110,240,160,${glow * 0.5})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, this.w * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // spinning ancient rings
      ctx.save(); ctx.translate(cx, cy);
      for (let i = 0; i < 3; i++) {
        const r = this.w * 0.28 + i * 7;
        ctx.strokeStyle = i % 2 ? COLORS.gold.main : COLORS.green.main;
        ctx.lineWidth = 2.5; ctx.shadowBlur = 12; ctx.shadowColor = ctx.strokeStyle;
        const a = t * (0.6 + i * 0.35) * (i % 2 ? 1 : -1);
        ctx.beginPath(); ctx.arc(0, 0, r, a, a + Math.PI * 1.4); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // charge meter as an inner disc
      if (this.charge > 0) {
        ctx.fillStyle = `rgba(255,236,180,${0.25 + this.charge * 0.5})`;
        ctx.beginPath(); ctx.arc(0, 0, this.w * 0.22 * this.charge, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // prompt when only one hero is inside
      if (this.occupants === 1) {
        ctx.fillStyle = "#f6ecd2"; ctx.font = "11px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText("BOTH heroes must enter", cx, this.y - 8); ctx.textAlign = "left";
      }
    }
    getState() { return Math.round(this.charge * 100); }
    setState(s) { this.charge = (s || 0) / 100; }
  }

  // ------------------------------------------------------------------ Crumbling platform
  class Crumble extends GObj {
    // Solid until someone stands on it; then it shakes, drops away, and
    // rebuilds itself a few seconds later.
    constructor(cfg) { super(Object.assign({ w: C.TILE * 2, h: 14, delay: 0.55, respawn: 3 }, cfg)); this.state = "solid"; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      if (this.state === "solid") {
        for (const p of level.players) {
          if (p.dead) continue;
          if (p.groundRef && p.groundRef._crumble === this) { this.state = "shake"; this.t = 0; break; }
        }
      } else if (this.state === "shake" && this.t > this.delay) {
        this.state = "gone"; this.t = 0;
        GG.bus.emit("tile:broke", {});
        level.fx.burst({ x: this.cx, y: this.cy, count: 14, color: ["#8a5a2b", "#5f3d1c"], speed: 110, life: 0.6, gravity: 500 });
      } else if (this.state === "gone" && this.t > this.respawn) { this.state = "solid"; this.t = 0; }
    }
    solidRect() { return this.state === "gone" ? null : { x: this.x, y: this.y, w: this.w, h: this.h, _crumble: this }; }
    render(ctx) {
      if (this.state === "gone") {
        ctx.globalAlpha = 0.18; ctx.strokeStyle = "#8a5a2b"; ctx.setLineDash([4, 4]);
        ctx.strokeRect(this.x, this.y, this.w, this.h); ctx.setLineDash([]); ctx.globalAlpha = 1; return;
      }
      const sh = this.state === "shake" ? Math.sin(this.t * 60) * 2 : 0;
      ctx.fillStyle = this.state === "shake" ? "#a06a34" : "#8a5a2b";
      ctx.fillRect(this.x + sh, this.y, this.w, this.h);
      ctx.fillStyle = "#5f3d1c";
      for (let i = 4; i < this.w - 4; i += 12) ctx.fillRect(this.x + i + sh, this.y + 4, 7, 3);
    }
    getState() { return this.state === "solid" ? 0 : this.state === "shake" ? 1 : 2; }
    setState(s) { this.state = s === 0 ? "solid" : s === 1 ? "shake" : "gone"; }
  }

  // ------------------------------------------------------------------ Vanishing platform
  class Blinker extends GObj {
    // Phases in and out on a fixed cycle — pure timing.
    constructor(cfg) { super(Object.assign({ w: C.TILE * 2, h: 14, period: 2.4, duty: 0.55, phase: 0 }, cfg)); this.t = cfg.phase || 0; }
    update(dt) { this.t += dt; }
    get on() { return ((this.t % this.period) / this.period) < this.duty; }
    solidRect() { return this.on ? this : null; }
    render(ctx) {
      const frac = (this.t % this.period) / this.period;
      const closing = this.on && frac > this.duty - 0.25;
      ctx.globalAlpha = this.on ? (closing ? 0.4 + Math.abs(Math.sin(this.t * 22)) * 0.6 : 1) : 0.15;
      ctx.fillStyle = COLORS.blue.dim; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = COLORS.blue.main; ctx.shadowBlur = this.on ? 8 : 0; ctx.shadowColor = COLORS.blue.glow;
      ctx.fillRect(this.x, this.y, this.w, 3);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ Crusher
  class Crusher extends GObj {
    // A slab that slams along an axis on a cycle. Solid, and lethal on contact
    // while it is driving forward.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, travel: 4 * C.TILE, axis: "y", period: 3, phase: 0 }, cfg)); this.x0 = this.x; this.y0 = this.y; this.t = cfg.phase || 0; this.slam = 0; }
    update(dt) {
      this.t += dt;
      const f = (this.t % this.period) / this.period;
      // quick slam out, slow retract
      const e = f < 0.25 ? (f / 0.25) : 1 - (f - 0.25) / 0.75;
      this.slam = f < 0.25 ? 1 : 0;
      if (this.axis === "y") this.y = this.y0 + this.travel * e;
      else this.x = this.x0 + this.travel * e;
    }
    // Deliberately NOT solid: if it were, the collision pass would shove heroes
    // out of the way before the damage check and it could never crush anyone.
    // It is a lethal piston you must time your way past.
    kills() { return true; }
    render(ctx) {
      ctx.fillStyle = "#4a4358"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#6a6280"; ctx.fillRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
      ctx.fillStyle = this.slam ? COLORS.red.main : "#8a8299";
      const n = Math.max(1, Math.floor(this.w / 10));
      for (let i = 0; i < n; i++) {
        const sx = this.x + i * (this.w / n);
        ctx.beginPath(); ctx.moveTo(sx, this.y + this.h); ctx.lineTo(sx + this.w / n / 2, this.y + this.h - 7); ctx.lineTo(sx + this.w / n, this.y + this.h); ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------------ Blade
  class Blade extends GObj {
    // A spinning blade that patrols between two points. Lethal, not solid.
    constructor(cfg) { super(Object.assign({ w: 26, h: 26, speed: 90 }, cfg)); this.x0 = this.x; this.y0 = this.y; this.x1 = cfg.x2 != null ? cfg.x2 : this.x; this.y1 = cfg.y2 != null ? cfg.y2 : this.y; this.t = 0; this.dir = 1; this.p = 0; }
    update(dt) {
      this.t += dt;
      const dist = Math.hypot(this.x1 - this.x0, this.y1 - this.y0) || 1;
      this.p += (this.dir * this.speed * dt) / dist;
      if (this.p >= 1) { this.p = 1; this.dir = -1; } else if (this.p <= 0) { this.p = 0; this.dir = 1; }
      this.x = U.lerp(this.x0, this.x1, this.p);
      this.y = U.lerp(this.y0, this.y1, this.p);
    }
    kills() { return true; }
    render(ctx) {
      ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(this.t * 12);
      ctx.fillStyle = "#c9d2e0"; ctx.shadowBlur = 8; ctx.shadowColor = "#fff";
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -13); ctx.lineTo(6, -13); ctx.fill(); }
      ctx.shadowBlur = 0; ctx.fillStyle = "#5a6178"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ Falling rock
  class Rock extends GObj {
    // Drops when a hero walks underneath, then resets. Lethal while falling.
    constructor(cfg) { super(Object.assign({ w: 24, h: 24, respawn: 2.6, trigger: 40 }, cfg)); this.y0 = this.y; this.vy = 0; this.state = "wait"; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      if (this.state === "wait") {
        for (const p of level.players) {
          if (p.dead) continue;
          if (Math.abs(p.cx - this.cx) < this.trigger && p.cy > this.cy) { this.state = "fall"; this.vy = 0; break; }
        }
      } else if (this.state === "fall") {
        this.vy += C.GRAVITY * 0.7 * dt; this.y += this.vy * dt;
        const tid = level.tilemap.tileAtWorld(this.cx, this.y + this.h + 2);
        if (tid !== GG.TILE.EMPTY || this.y > level.tilemap.h) {
          this.state = "gone"; this.t = 0;
          level.fx.burst({ x: this.cx, y: this.cy, count: 12, color: ["#6a6280", "#4a4358"], speed: 130, life: 0.5, gravity: 500 });
          level.cam.shake(0.2);
        }
      } else if (this.state === "gone" && this.t > this.respawn) { this.state = "wait"; this.y = this.y0; this.vy = 0; }
    }
    kills() { return this.state === "fall"; }
    render(ctx) {
      if (this.state === "gone") return;
      ctx.fillStyle = "#5a5468"; ctx.beginPath(); ctx.arc(this.cx, this.cy, this.w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7a7490"; ctx.beginPath(); ctx.arc(this.cx - 3, this.cy - 3, this.w / 3.4, 0, Math.PI * 2); ctx.fill();
      if (this.state === "wait") { ctx.globalAlpha = 0.35; ctx.strokeStyle = COLORS.red.main; ctx.beginPath(); ctx.moveTo(this.cx, this.y + this.h); ctx.lineTo(this.cx, this.y + this.h + 26); ctx.stroke(); ctx.globalAlpha = 1; }
    }
  }

  // ------------------------------------------------------------------ Narrow gate (Lyra-only)
  class NarrowGate extends GObj {
    // A low/narrow passage: solid to everyone EXCEPT characters that fit
    // (Lyra, `narrow: true`). The per-player solidity is decided in Level.solidsFor.
    constructor(cfg) { super(Object.assign({ w: C.TILE, h: C.TILE, color: "green" }, cfg)); }
    solidRect() { return this; }
    render(ctx) {
      const c = COLORS.green;
      // cracked rubble framing a tight gap
      ctx.fillStyle = "#2a2f45"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#1a1e2e"; ctx.fillRect(this.x + this.w / 2 - 5, this.y + 4, 10, this.h - 8);
      ctx.strokeStyle = c.main; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.strokeRect(this.x + this.w / 2 - 5, this.y + 4, 10, this.h - 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = c.main; ctx.font = "9px sans-serif"; ctx.fillText("↕", this.x + this.w / 2 - 3, this.cy + 3);
    }
  }

  // ------------------------------------------------------------------ Repair node (Kiro-only)
  class RepairNode extends GObj {
    // Only Kiro (`canRepair`) can fix this. Once repaired it LATCHES its channel
    // on permanently — e.g. restoring a collapsed bridge or powering a machine.
    constructor(cfg) { super(Object.assign({ w: 26, h: 30, color: "blue" }, cfg)); this.fixed = !!cfg.fixed; this.spin = 0; this._cool = 0; }
    update(dt, level) {
      this._cool = Math.max(0, this._cool - dt);
      if (this.fixed) { this.spin += dt * 4; }
      else {
        for (const p of level.players) {
          if (p.dead || !p.character.canRepair) continue;
          if (U.aabb(p, this) && p.input && p.input.action && this._cool === 0) {
            this.fixed = true; this._cool = 0.5;
            GG.bus.emit("switch:toggled", { channel: this.channel, on: true });
            GG.bus.emit("door:opened", { channel: this.channel });
            level.fx.burst({ x: this.cx, y: this.cy, count: 20, color: [COLORS.blue.main, COLORS.gold.main, "#fff"], speed: 150, life: 0.6, glow: true });
          }
        }
      }
      level.setChannel(this.channel, this.fixed);
    }
    render(ctx) {
      const c = COLORS.blue;
      ctx.save(); ctx.translate(this.cx, this.cy);
      ctx.strokeStyle = this.fixed ? c.main : "#5a2b33"; ctx.lineWidth = 3;
      ctx.shadowBlur = this.fixed ? 8 : 0; ctx.shadowColor = c.glow;
      ctx.rotate(this.spin);
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -11); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
      if (!this.fixed) { ctx.fillStyle = "#ff5a6a"; ctx.font = "9px sans-serif"; ctx.fillText("!", this.cx - 1, this.y - 3); }
    }
    getState() { return this.fixed ? 1 : 0; }
    setState(s) { this.fixed = !!s; }
  }

  // ------------------------------------------------------------------ Bridge anchor (Nichols builds)
  class BridgeAnchor extends GObj {
    // Nichols presses ACTION nearby to assemble a temporary bridge that spans
    // `span` tiles to the right. It decays after `lifetime` seconds.
    constructor(cfg) {
      super(Object.assign({ w: C.TILE, h: C.TILE, span: 3, lifetime: 8 }, cfg));
      this.built = 0;      // seconds of bridge life remaining
      this._cool = 0;
    }
    update(dt, level) {
      this._cool = Math.max(0, this._cool - dt);
      if (this.built > 0) this.built = Math.max(0, this.built - dt);
      for (const p of level.players) {
        if (p.dead || !p.character.canBuild) continue;
        if (U.aabb(p, this) && p.input && p.input.action && this._cool === 0 && this.built <= 0) {
          this.built = this.lifetime; this._cool = 0.5;
          GG.bus.emit("bridge:built", {});
          level.fx.burst({ x: this.cx, y: this.cy, count: 18, color: [COLORS.blue.main, COLORS.gold.main], speed: 130, life: 0.5, glow: true });
        }
      }
    }
    /** The bridge deck (solid only while built). */
    solidRect() {
      if (this.built <= 0) return null;
      return { x: this.x + this.w, y: this.y, w: this.span * C.TILE, h: 10, _bridge: this };
    }
    render(ctx) {
      // anchor post
      ctx.fillStyle = "#5a4324"; ctx.fillRect(this.x + 8, this.y, this.w - 16, this.h);
      ctx.fillStyle = COLORS.blue.dim; ctx.fillRect(this.x + 6, this.y - 2, this.w - 12, 5);
      if (this.built > 0) {
        const fade = Math.min(1, this.built / 1.5);   // blinks out as it expires
        ctx.globalAlpha = this.built < 1.5 ? 0.35 + Math.abs(Math.sin(this.built * 12)) * 0.65 : 1;
        const bx = this.x + this.w, bw = this.span * C.TILE;
        ctx.fillStyle = "#8a5a2b"; ctx.fillRect(bx, this.y, bw, 10);
        ctx.fillStyle = COLORS.blue.main; ctx.shadowBlur = 8; ctx.shadowColor = COLORS.blue.glow;
        for (let i = 0; i < bw; i += 12) ctx.fillRect(bx + i + 2, this.y + 1, 8, 3);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = 0.25; ctx.strokeStyle = COLORS.blue.main; ctx.setLineDash([4, 4]);
        ctx.strokeRect(this.x + this.w, this.y, this.span * C.TILE, 10);
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
    getState() { return Math.round(this.built * 100); }
    setState(s) { this.built = (s || 0) / 100; }
  }

  // ------------------------------------------------------------------ Grapple lever (Nichols pulls from afar)
  class GrappleLever extends Switch {
    // A lever Nichols can yank from a distance with the grappling tool.
    constructor(cfg) { super(Object.assign({ colorLock: "blue", range: 200 }, cfg)); }
    update(dt, level) {
      super.update(dt, level);
      // remote pull: Nichols presses GRAPPLE while roughly level with the lever
      for (const p of level.players) {
        if (p.dead || !p.character.canGrapple) continue;
        if (!p.input || !p.input.specialPressed) continue;
        const dx = this.cx - p.cx, dy = Math.abs(this.cy - p.cy);
        if (Math.abs(dx) < this.range && dy < 48 && Math.sign(dx) === p.facing && this._cool === 0) {
          this.on = !this.on; this._cool = 0.35;
          p.grappleFx = { x: this.cx, y: this.cy, t: 0.25 };
          GG.bus.emit("switch:toggled", { channel: this.channel, on: this.on });
          level.fx.burst({ x: this.cx, y: this.cy, count: 10, color: COLORS.blue.main, speed: 90, life: 0.35, glow: true });
        }
      }
      level.setChannel(this.channel, this.on);
    }
    render(ctx) {
      super.render(ctx);
      ctx.globalAlpha = 0.5; ctx.strokeStyle = COLORS.blue.main; ctx.lineWidth = 1;
      ctx.strokeRect(this.x - 3, this.y - 3, this.w + 6, this.h + 6); ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ Hidden things (Nibihah reveals)
  class HiddenPlatform extends GObj {
    // Invisible until Nibihah is close; solid only once revealed.
    constructor(cfg) { super(Object.assign({ w: C.TILE * 2, h: 12, revealRadius: 130 }, cfg)); this.reveal = 0; }
    update(dt, level) {
      let near = false;
      for (const p of level.players) {
        if (p.dead || !p.character.canDetect) continue;
        if (Math.hypot(p.cx - this.cx, p.cy - this.cy) < this.revealRadius) near = true;
      }
      this.reveal = U.clamp(this.reveal + (near ? dt * 4 : -dt * 2), 0, 1);
    }
    solidRect() { return this.reveal > 0.5 ? this : null; }
    render(ctx) {
      if (this.reveal <= 0.02) return;
      ctx.globalAlpha = this.reveal;
      ctx.fillStyle = COLORS.green.dim; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = COLORS.green.main; ctx.shadowBlur = 10; ctx.shadowColor = COLORS.green.glow;
      ctx.fillRect(this.x, this.y, this.w, 3);
      for (let i = 6; i < this.w - 6; i += 14) ctx.fillRect(this.x + i, this.y + 5, 6, 2);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    getState() { return Math.round(this.reveal * 100); }
    setState(s) { this.reveal = (s || 0) / 100; }
  }

  class SecretSwitch extends GObj {
    // An ancient symbol only Nibihah can uncover; once revealed either hero may
    // press it. Latches its channel permanently (opens shortcuts for both).
    constructor(cfg) { super(Object.assign({ w: 24, h: 24, revealRadius: 120 }, cfg)); this.reveal = 0; this.on = false; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      let near = false;
      for (const p of level.players) {
        if (p.dead || !p.character.canDetect) continue;
        if (Math.hypot(p.cx - this.cx, p.cy - this.cy) < this.revealRadius) near = true;
      }
      this.reveal = U.clamp(this.reveal + (near ? dt * 3 : -dt * 1.5), 0, 1);
      if (this.reveal > 0.6 && !this.on) {
        for (const p of level.players) {
          if (!p.dead && U.aabb(p, this) && p.input && p.input.action) {
            this.on = true;
            GG.bus.emit("secret:found", { channel: this.channel });
            level.secretsFound++;
            level.fx.burst({ x: this.cx, y: this.cy, count: 24, color: [COLORS.green.main, COLORS.gold.main, "#fff"], speed: 160, life: 0.7, glow: true });
          }
        }
      }
      level.setChannel(this.channel, this.on);
    }
    render(ctx) {
      if (this.reveal <= 0.02) return;
      ctx.globalAlpha = this.reveal * (this.on ? 1 : 0.75);
      const c = this.on ? COLORS.gold : COLORS.green;
      ctx.save(); ctx.translate(this.cx, this.cy);
      ctx.strokeStyle = c.main; ctx.lineWidth = 2;
      ctx.shadowBlur = 10; ctx.shadowColor = c.glow;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -13); ctx.stroke(); }
      if (this.on) { ctx.fillStyle = c.main; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0; ctx.restore(); ctx.globalAlpha = 1;
    }
    getState() { return (this.on ? 2 : 0) | (this.reveal > 0.5 ? 1 : 0); }
    setState(s) { this.on = !!(s & 2); this.reveal = (s & 1) ? 1 : 0; }
  }

  GG.obj = { GObj, Gem, Key, LockedDoor, Button, Switch, Door, Crate, MovingPlatform, Hazard, Mirror, Laser, Teleporter, Exit, NarrowGate, RepairNode, BridgeAnchor, GrappleLever, HiddenPlatform, SecretSwitch, Portal, Crumble, Blinker, Crusher, Blade, Rock, TimedSwitch, Rotor, COLORS };
})(window);
