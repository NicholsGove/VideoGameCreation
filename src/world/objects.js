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
        // two-stage sparkle: a fast white pop then slow drifting gold motes
        level.fx.burst({ x: this.cx, y: this.cy, count: 10, color: "#fff", speed: 190, life: 0.25, size: 2, glow: true });
        level.fx.burst({ x: this.cx, y: this.cy, count: 16, color: [COLORS.gold.main, "#fff8dc"], speed: 70, life: 0.7, size: 3, lift: 40, glow: true });
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
      // Figma "Locked Gate": stone door with dark/lit edges, seams and a
      // glowing keyhole in the door's key colour.
      const c = COLORS[this.color] || COLORS.gold;
      if (this.open) ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#3a3f52"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#262a3a"; ctx.fillRect(this.x, this.y, 4, this.h);
      ctx.fillStyle = "#4c5268"; ctx.fillRect(this.x + this.w - 4, this.y, 4, this.h);
      ctx.fillStyle = "#262a3a";
      for (let i = 24; i < this.h; i += 24) ctx.fillRect(this.x + 2, this.y + i, this.w - 4, 2);
      // glowing lock plate + keyhole
      ctx.fillStyle = c.main; ctx.shadowBlur = 8; ctx.shadowColor = c.glow;
      ctx.fillRect(this.cx - 5, this.cy - 8, 10, 10);
      ctx.fillRect(this.cx - 2, this.cy + 2, 4, 8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#0b0e18"; ctx.beginPath(); ctx.arc(this.cx, this.cy - 3, 2, 0, Math.PI * 2); ctx.fill();
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
      // a sentinel's weight counts too — lure it into position
      for (const e of (level.enemies || [])) if (U.aabb(e, sensor)) on = true;
      this.pressed = on;
      level.setChannel(this.channel, on || level.channelForcedBy(this.channel, this));
      if (on && !wasPressed) GG.bus.emit("button:pressed", { channel: this.channel });
    }
    render(ctx) {
      // Figma "Button": stone base plate + glowing dome that sinks when pressed
      const c = COLORS[this.color] || COLORS.gold;
      ctx.fillStyle = "#3a3f52"; ctx.fillRect(this.x - 2, this.y + 4, this.w + 4, 6);
      const yy = this.y + (this.pressed ? 4 : 0);
      ctx.fillStyle = this.pressed ? c.dim : c.main;
      if (!this.pressed) { ctx.shadowBlur = 10; ctx.shadowColor = c.glow; }
      ctx.beginPath();
      ctx.moveTo(this.x + 4, yy + 5);
      ctx.quadraticCurveTo(this.cx, yy - 4, this.x + this.w - 4, yy + 5);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
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
      // Figma "Lever": stone base, steel stick, glowing coloured knob
      const c = COLORS[this.colorLock || this.color] || COLORS.gold;
      ctx.fillStyle = "#3a3f52"; ctx.fillRect(this.x + 3, this.y + 22, this.w - 6, 6);
      ctx.save(); ctx.translate(this.cx, this.y + 24);
      ctx.rotate(this.on ? -0.5 : 0.5);
      ctx.fillStyle = "#8b95a8";                                   // steel stick
      ctx.fillRect(-2, -18, 4, 18);
      ctx.fillStyle = c.main; ctx.shadowBlur = this.on ? 10 : 5; ctx.shadowColor = c.glow;
      ctx.beginPath(); ctx.arc(0, -18, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
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
      // Figma "Crate": horizontal planks + steel corner caps
      ctx.fillStyle = "#8a5a32"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.fillStyle = "#a06c3e"; ctx.fillRect(this.x, this.y, this.w, this.h * 0.12);
      ctx.fillStyle = "#6d4526"; ctx.fillRect(this.x, this.y + this.h * 0.44, this.w, this.h * 0.12);
      ctx.fillStyle = "#5c3a20"; ctx.fillRect(this.x, this.y + this.h * 0.88, this.w, this.h * 0.12);
      ctx.fillStyle = "#8b95a8";
      const c2 = Math.max(4, this.w * 0.17);
      ctx.fillRect(this.x, this.y, c2, c2);
      ctx.fillRect(this.x + this.w - c2, this.y, c2, c2);
      ctx.fillRect(this.x, this.y + this.h - c2, c2, c2);
      ctx.fillRect(this.x + this.w - c2, this.y + this.h - c2, c2, c2);
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
      // Figma "Moving Platform": stone slab with a humming aether edge
      ctx.fillStyle = "#3a3f52"; ctx.fillRect(this.x, this.y, this.w, this.h - 4);
      ctx.fillStyle = "#4c5268"; ctx.fillRect(this.x, this.y, this.w, 3);
      ctx.fillStyle = "#35b7ff"; ctx.shadowBlur = 8; ctx.shadowColor = "#7fd4ff";
      ctx.fillRect(this.x, this.y + this.h - 4, this.w, 4);
      ctx.shadowBlur = 0;
    }
    getState() { return { t: Math.round(this.t * 1000) / 1000, dir: this.dir }; }
    setState(s) {
      if (!s) return;
      this.t = s.t; this.dir = s.dir;
      // Recompute the position — on remote clients update() never runs, so
      // without this the platform SITS STILL while the host rides it away.
      const e = this._ease(this.t), px = this.x, py = this.y;
      this.x = U.lerp(this.x0, this.x1, e);
      this.y = U.lerp(this.y0, this.y1, e);
      this.dx = this.x - px; this.dy = this.y - py;
    }
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
      } else { // spikes — Figma: bright steel teeth with a glint edge
        const n = Math.max(1, Math.floor(this.w / 10));
        const sw = this.w / n;
        for (let i = 0; i < n; i++) {
          const sx = this.x + i * sw;
          ctx.fillStyle = "#aab4c8";
          ctx.beginPath(); ctx.moveTo(sx, this.y + this.h);
          ctx.lineTo(sx + sw / 2, this.y); ctx.lineTo(sx + sw, this.y + this.h); ctx.fill();
          ctx.fillStyle = "#e6ecf5";                     // glint on the leading face
          ctx.beginPath(); ctx.moveTo(sx + sw * 0.34, this.y + this.h * 0.5);
          ctx.lineTo(sx + sw / 2, this.y + 2); ctx.lineTo(sx + sw * 0.5, this.y + this.h * 0.55); ctx.fill();
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
      // player 0 = Nichols (green), player 1 = Nibihah (blue)
      const c = this.player === 0 ? COLORS.green : COLORS.blue;
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

  // ------------------------------------------------------------------ Tutorial sign
  class Tutor extends GObj {
    // A floating parchment that teaches a mechanic in-world: title, lines of
    // text, and key glyphs. Pure guidance — no collision, no state.
    constructor(cfg) { super(Object.assign({ w: 10, h: 10, title: "", lines: [], keys: [] }, cfg)); this.t = 0; }
    update(dt) { this.t += dt; }
    render(ctx) {
      const lines = this.lines || [];
      const wMax = Math.max(150, ...lines.map(l => l.length * 5.6), (this.title || "").length * 7.5);
      const w = wMax + 24, h = 30 + lines.length * 14 + (this.keys.length ? 26 : 0);
      const x = this.x - w / 2, y = this.y - h + Math.sin(this.t * 1.6) * 3;
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(25,19,48,0.92)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "#d89a2e"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#f2c14e"; ctx.font = "700 12px 'Cinzel', Georgia, serif"; ctx.textAlign = "center";
      ctx.fillText(this.title, this.x, y + 16);
      ctx.fillStyle = "#f6ecd2"; ctx.font = "10px 'Segoe UI', sans-serif";
      lines.forEach((l, i) => ctx.fillText(l, this.x, y + 32 + i * 13));
      // key glyphs: [["E","Nichols"],["·","Nibihah"]]
      if (this.keys.length) {
        const ky = y + h - 16;
        let kx = this.x - (this.keys.length - 1) * 42;
        for (const [key, who] of this.keys) {
          ctx.fillStyle = "#241d38"; ctx.fillRect(kx - 30, ky - 10, 26, 16);
          ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 1; ctx.strokeRect(kx - 30, ky - 10, 26, 16);
          ctx.fillStyle = "#f2c14e"; ctx.font = "700 10px 'Segoe UI', monospace";
          ctx.fillText(key, kx - 17, ky + 2);
          ctx.fillStyle = "#cdb488"; ctx.font = "9px 'Segoe UI', sans-serif"; ctx.textAlign = "left";
          ctx.fillText(who, kx, ky + 2); ctx.textAlign = "center";
          kx += 84;
        }
      }
      // pointer
      ctx.fillStyle = "#d89a2e";
      ctx.beginPath(); ctx.moveTo(this.x - 6, y + h); ctx.lineTo(this.x, y + h + 9); ctx.lineTo(this.x + 6, y + h); ctx.fill();
      ctx.restore(); ctx.textAlign = "left"; ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ Rat (attackable vermin)
  class Rat extends GObj {
    // Corruption-rats: 4 hits to put down. They wander their nest, CHASE any
    // hero they smell while healthy, and bolt when one hit from death. A dead
    // rat stays dead — unless both heroes fall, which lets the nest recover.
    constructor(cfg) {
      super(Object.assign({ w: 24, h: 14, hp: 4 }, cfg));
      this.x0 = this.x; this.y0 = this.y;
      this.maxHp = this.hp; this.deadRat = false;
      this.vx = 0; this.vy = 0; this.dir = 1;
      this.t = (cfg.seed || 0) * 1.7; this._flash = 0;
    }
    reset() { this.deadRat = false; this.hp = this.maxHp; this.x = this.x0; this.y = this.y0; this.vx = 0; this.vy = 0; }
    takeHit(level, fromDir) {
      if (this.deadRat) return;
      this.hp--; this._flash = 0.18;
      this.vx = fromDir * 170; this.dir = -fromDir;
      GG.bus.emit("hit:stop", { s: this.hp <= 0 ? 0.09 : 0.05 });   // meaty freeze-frame
      level.cam.shake(this.hp <= 0 ? 0.12 : 0.05);
      level.fx.burst({ x: this.cx, y: this.cy, count: 10, color: ["#c07bff", "#7a2b33"], speed: 110, life: 0.32 });
      if (this.hp <= 0) {
        this.deadRat = true;
        GG.bus.emit("crate:push", {});
        level.fx.burst({ x: this.cx, y: this.cy, count: 16, color: ["#c07bff", "#4a4358", "#fff"], speed: 150, life: 0.5, gravity: 400, glow: true });
      }
    }
    update(dt, level) {
      if (this.deadRat) return;
      this.t += dt; this._flash = Math.max(0, this._flash - dt);
      // pick a mind-state
      let target = null, best = 210;
      for (const p of level.players) {
        if (p.dead) continue;
        const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
        if (d < best && Math.abs(p.cy - this.cy) < 90) { best = d; target = p; }
      }
      let want = 0;
      if (target && this.hp <= 1) want = -Math.sign(target.cx - this.cx) * 130;         // bolt!
      else if (target) want = Math.sign(target.cx - this.cx) * 92;                       // hunt
      else {                                                                             // wander the nest
        const drift = Math.sin(this.t * 0.9) > 0 ? 1 : -1;
        want = drift * 42;
        if (Math.abs(this.x - this.x0) > 110) want = Math.sign(this.x0 - this.x) * 42;   // stay near home
      }
      this.vx = U.damp(this.vx, want, 8, dt);
      if (Math.abs(this.vx) > 4) this.dir = Math.sign(this.vx);
      this.vy = Math.min(this.vy + C.GRAVITY * dt, 700);
      GG.Physics.move(this, this.vx * dt, this.vy * dt, level.tilemap.solidsIn(this.x - 8, this.y - 8, this.w + 16, this.h + 16));
      if (this.y > level.tilemap.h + 60) { this.deadRat = true; return; }
      // teeth
      for (const p of level.players) if (!p.dead && U.aabb(p, this)) p.kill(level, "rat");
    }
    render(ctx) {
      if (this.deadRat) return;
      const fleeing = this.hp <= 1;
      ctx.save();
      if (this._flash > 0) { ctx.globalAlpha = 0.6 + Math.sin(this._flash * 60) * 0.4; }
      // Figma rat sprite: scruffy body, glowing red eye, pink tail
      GG.drawSprite(ctx, GG.SPRITES.rat, this.cx, this.y + this.h, this.h + 2, this.dir, {
        t: this.t,
        legOff: Math.abs(this.vx) > 10 ? Math.sin(this.t * 22) * 2 : 0,
        blink: 0,
      });
      // health bar
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(this.cx - 12, this.y - 9, 24, 4);
      ctx.fillStyle = fleeing ? "#f2c14e" : "#ff6b6b";
      ctx.fillRect(this.cx - 11, this.y - 8, 22 * (this.hp / this.maxHp), 2);
      ctx.restore();
    }
    getState() { return { x: Math.round(this.x), y: Math.round(this.y), hp: this.hp, d: this.deadRat ? 1 : 0 }; }
    setState(s) { if (!s) return; this.x = s.x; this.y = s.y; this.hp = s.hp; this.deadRat = !!s.d; }
  }

  // ------------------------------------------------------------------ The Celestial (final boss)
  class Boss extends GObj {
    // The being imprisoned in the Heart Engine. NOT a combat fight: each of
    // its `phases` channels is a puzzle objective somewhere in the arena.
    // While it wakes it attacks — falling starfire and a sweeping ground beam
    // — and every completed phase makes it angrier. Latch all phases and it
    // yields, powering its own `channel` (wire the exit portal to it).
    constructor(cfg) {
      // Enormous on purpose: ~5x a hero's height, so it fills the arena.
      super(Object.assign({ w: 150, h: 150, phases: ["ph1", "ph2", "ph3"], channel: "boss", maxHp: 40 }, cfg));
      this.done = new Array(this.phases.length).fill(false);
      this.defeated = false;
      this.hp = this.maxHp;
      this.wave = 1;               // wave 2 begins at half health
      this._tpCd = 0; this._tpIdx = 0;
      this._stun = 0; this._flash = 0;
      this.t = 0; this._shots = []; this._beam = null; this._cd = 2.5;
    }
    get phase() { return this.done.filter(Boolean).length; }
    /** Weapons fire lands here. Puzzles help too — see the seal bonus below. */
    takeHit(level, dmg, fromDir) {
      if (this.defeated) return;
      this.hp = Math.max(0, this.hp - dmg);
      this._flash = 0.15;
      GG.bus.emit("hit:stop", { s: 0.05 });
      level.fx.burst({ x: this.cx + (fromDir || 0) * 30, y: this.cy, count: 8, color: ["#fff", "#c07bff"], speed: 130, life: 0.35, glow: true });
    }
    update(dt, level) {
      this.t += dt;
      this._flash = Math.max(0, this._flash - dt);
      this._stun = Math.max(0, this._stun - dt);
      // seal objectives still matter: each latched seal STUNS the Celestial
      // and tears 4 points from it — puzzles and weapons win this together.
      for (let i = 0; i < this.phases.length; i++) {
        if (!this.done[i] && level.getChannel(this.phases[i])) {
          this.done[i] = true;
          this._stun = 3; this.hp = Math.max(1, this.hp - 4);
          level.cam.shake(0.6);
          GG.bus.emit("achievement:unlocked", { name: "Seal " + (i + 1) + " broken", desc: "The Celestial reels — strike now!" });
          level.fx.burst({ x: this.cx, y: this.cy, count: 30, color: [COLORS.gold.main, "#fff", "#c07bff"], speed: 240, life: 0.8, glow: true });
        }
      }
      // wave 2: at half health it starts blinking across the arena (10s cooldown)
      if (!this.defeated && this.wave === 1 && this.hp <= this.maxHp / 2) {
        this.wave = 2; this._tpCd = 2;
        level.cam.shake(0.8);
        level.fx.burst({ x: this.cx, y: this.cy, count: 40, color: ["#ff6b6b", "#c07bff"], speed: 280, life: 0.9, glow: true });
      }
      if (!this.defeated && this.wave === 2) {
        this._tpCd -= dt;
        if (this._tpCd <= 0) {
          const spots = [[6, 5], [22, 5], [13, 3], [4, 12], [24, 12], [14, 8]];   // scattered roosts
          const [tc, tr] = spots[this._tpIdx++ % spots.length];
          level.fx.burst({ x: this.cx, y: this.cy, count: 20, color: "#c07bff", speed: 200, life: 0.5, glow: true });
          this.x = Math.min(tc * C.TILE, level.tilemap.w - this.w - C.TILE);
          this.y = tr * C.TILE;
          level.fx.burst({ x: this.cx, y: this.cy, count: 20, color: "#c07bff", speed: 200, life: 0.5, glow: true });
          GG.bus.emit("teleport:used", {});
          this._tpCd = 10;                                   // ten-second cooldown
        }
      }
      if (!this.defeated && this.hp <= 0) {
        this.defeated = true;
        level.cam.shake(1);
        GG.bus.emit("level:almost", {});
        level.fx.burst({ x: this.cx, y: this.cy, count: 60, color: ["#fff", COLORS.gold.main, COLORS.blue.main, COLORS.green.main], speed: 320, life: 1.2, glow: true });
      }
      level.setChannel(this.channel, this.defeated);
      if (this.defeated) { this._shots = []; this._beam = null; return; }
      if (this._stun > 0) return;                            // reeling from a broken seal

      // ---- attacks (deterministic: timer-driven, columns from a fixed set)
      const rate = (this.wave === 2 ? 1.6 : 2.6) - this.phase * 0.3;   // angrier each wave/seal
      this._cd -= dt;
      if (this._cd <= 0) {
        this._cd = rate;
        const cols = [4, 9, 14, 19, 24, 7, 17, 12, 22, 26];
        const c = cols[Math.floor(this.t / rate) % cols.length];
        this._shots.push({ x: c * C.TILE + 4, y: this.y + this.h, vy: 60, w: 22, h: 22 });
        if (this.phase >= 1 && this._beam == null && (Math.floor(this.t / rate) % 4) === 3) {
          // telegraphed floor beam: 1.2s warning, then 0.9s lethal
          this._beam = { t: 0, y: level.tilemap.h - 3.4 * C.TILE, h: 1.4 * C.TILE };
        }
      }
      for (const s of this._shots) {
        s.vy = Math.min(s.vy + C.GRAVITY * 0.35 * dt, 420);
        s.y += s.vy * dt;
        // stone shelters: starfire bursts on the first solid tile it meets
        if (level.tilemap.isSolid(Math.floor((s.x + s.w / 2) / C.TILE), Math.floor((s.y + s.h) / C.TILE))) {
          s.dead = true;
          level.fx.burst({ x: s.x + s.w / 2, y: s.y + s.h, count: 8, color: "#c07bff", speed: 110, life: 0.4, glow: true });
          continue;
        }
        for (const p of level.players) if (!p.dead && U.aabb(p, s)) p.kill(level, "starfire");
      }
      this._shots = this._shots.filter(s => !s.dead && s.y < level.tilemap.h + 40);
      if (this._beam) {
        this._beam.t += dt;
        if (this._beam.t > 1.2 && this._beam.t < 2.1) {
          const rect = { x: 0, y: this._beam.y, w: level.tilemap.w, h: this._beam.h };
          for (const p of level.players) if (!p.dead && U.aabb(p, rect)) p.kill(level, "beam");
        }
        if (this._beam.t > 2.1) this._beam = null;
      }
    }
    render(ctx, level) {
      const t = this.t, ph = this.phase;
      const rage = this.hp <= this.maxHp * 0.25 && !this.defeated;   // final, furious phase
      const reel = this._stun > 0;
      // Palette shifts as it wakes: violet -> ember red -> calm green in death.
      const lit = this.defeated ? "#9bf0b8" : rage ? "#ff7a5c" : ph >= 2 ? "#ff9ad4" : "#c07bff";
      const hue = this.defeated ? "180,255,200" : rage ? "255,122,92" : ph >= 2 ? "255,154,212" : "192,123,255";

      // THE CELESTIAL GUARDIAN — an armoured colossus, ~5 heroes tall.
      // Local origin sits at its chest; +y is down, S scales the whole body.
      const S = this.h / 150;
      const breathe = Math.sin(t * 1.1) * 5 * S;
      const slump = this.defeated ? 26 * S : reel ? 10 * S : 0;      // collapses when beaten
      ctx.save();
      ctx.translate(this.cx, this.cy + breathe + slump);
      if (reel) ctx.rotate(Math.sin(t * 22) * 0.05);                 // shudders when a seal breaks
      if (this.defeated) ctx.rotate(0.18);
      ctx.scale(S, S);

      // ---- aura ------------------------------------------------------
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 130);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(0.35, `rgba(${hue},0.36)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 130, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // ---- body: the Celestial Guardian sprite from the player's Figma
      // file, drawn exactly as designed (halo, wings, cracked stone body,
      // five glowing eyes, orbiting rune glyphs). Wave/rage state still
      // reads through the aura tint, shudder, slump and the seal rings.
      const spr = GG.SPRITES && GG.SPRITES.guardian;
      if (spr) {
        if (this.defeated) ctx.globalAlpha = 0.85;
        GG.drawSprite(ctx, spr, 0, 78, 156, 1, { t, blink: 0 });
        ctx.globalAlpha = 1;
      }

      // ---- orbiting runes; one ring shatters per broken seal ----------
      for (let i = 0; i < this.phases.length; i++) {
        if (this.done[i]) continue;
        const col = i === 0 ? COLORS.gold.main : i === 1 ? COLORS.blue.main : COLORS.green.main;
        const a0 = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1);
        const rad = 74 + i * 16;
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(0, 0, rad, a0, a0 + Math.PI * 1.4); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.shadowBlur = 10; ctx.shadowColor = col;
        for (let k = 0; k < 6; k++) {                                   // glyphs riding the ring
          const a = a0 + k * (Math.PI * 1.4 / 6);
          const gx = Math.cos(a) * rad, gy = Math.sin(a) * rad;
          ctx.save(); ctx.translate(gx, gy); ctx.rotate(a + Math.PI / 2);
          ctx.fillRect(-1.5, -4, 3, 8); ctx.fillRect(-4, -1.5, 8, 3);
          ctx.restore();
        }
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      // starfire shots
      for (const s of this._shots) {
        ctx.fillStyle = "#c07bff"; ctx.shadowBlur = 12; ctx.shadowColor = "#c07bff";
        ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + s.h / 2, 10, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      // the floor beam: amber warning, then white-hot
      if (this._beam && level) {
        const b = this._beam, warn = b.t <= 1.2;
        ctx.globalAlpha = warn ? 0.25 + Math.sin(t * 16) * 0.15 : 0.75;
        ctx.fillStyle = warn ? COLORS.gold.main : "#fff";
        ctx.fillRect(0, b.y, level.tilemap.w, b.h);
        ctx.globalAlpha = 1;
      }
      // health bar + wave + seal pips
      const bw = 220, bx = this.cx - bw / 2, by = this.y - 26;
      ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
      const hf = this.hp / this.maxHp;
      ctx.fillStyle = this.defeated ? "#9bf0b8" : hf > 0.5 ? "#c07bff" : "#ff6b6b";
      ctx.shadowBlur = 8; ctx.shadowColor = ctx.fillStyle;
      ctx.fillRect(bx, by, bw * hf, 8); ctx.shadowBlur = 0;
      if (this._flash > 0) { ctx.globalAlpha = this._flash * 5; ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, bw * hf, 8); ctx.globalAlpha = 1; }
      ctx.textAlign = "center"; ctx.font = "11px 'Cinzel', serif"; ctx.fillStyle = "#f6ecd2";
      ctx.fillText(this.defeated ? "THE CELESTIAL YIELDS" :
        `${this.hp}/${this.maxHp} · WAVE ${this.wave} · SEALS ${this.phase}/${this.phases.length}${this._stun > 0 ? " · REELING!" : ""}`,
        this.cx, by - 6);
      ctx.textAlign = "left";
    }
    getState() { return { hp: this.hp, w: this.wave, d: this.defeated ? 1 : 0, ph: this.done.reduce((a, d, i) => a | (d ? 1 << i : 0), 0), x: Math.round(this.x), y: Math.round(this.y) }; }
    setState(s) { if (typeof s !== "object" || !s) return; this.hp = s.hp; this.wave = s.w; this.defeated = !!s.d; this.done = this.phases.map((_, i) => !!(s.ph & (1 << i))); this.x = s.x; this.y = s.y; }
  }

  // ------------------------------------------------------------------ Seesaw (counterweights)
  class Seesaw extends GObj {
    // Two pans on a pivot. Weight (heroes; Nichols is heavier) tips it: the
    // loaded side sinks, the other rises — a living counterweight lift.
    constructor(cfg) {
      super(Object.assign({ w: C.TILE, h: 8, span: 3, maxTip: 64 }, cfg));
      const s = this.span * C.TILE;
      this.panL = { x: this.x - s - C.TILE, y: this.y, w: 2 * C.TILE, h: 10, _pan: this, _side: -1 };
      this.panR = { x: this.x + s, y: this.y, w: 2 * C.TILE, h: 10, _pan: this, _side: 1 };
      this.o = 0;                 // current tip offset (+ = right side down)
    }
    _weightOn(pan, level) {
      let w = 0;
      for (const p of level.players) {
        if (p.dead) continue;
        const onPan = p.groundRef && p.groundRef._pan === this && p.groundRef._side === pan._side;
        if (onPan) w += p.character.canPushHeavy ? 1.6 : 1.0;   // the engineer is heavier
      }
      return w;
    }
    update(dt, level) {
      const wl = this._weightOn(this.panL, level), wr = this._weightOn(this.panR, level);
      const target = U.clamp((wr - wl) * 40, -this.maxTip, this.maxTip);
      const step = U.clamp(target - this.o, -85 * dt, 85 * dt);
      this.o += step;
      const prevL = this.panL.y, prevR = this.panR.y;
      this.panL.y = this.y - this.o;      // right down -> left up
      this.panR.y = this.y + this.o;
      // carry riders with their pan — a sinking pan outruns gravity otherwise
      for (const p of level.players) {
        if (p.dead || !p.groundRef || p.groundRef._pan !== this) continue;
        const dy = (p.groundRef._side === -1 ? this.panL.y - prevL : this.panR.y - prevR);
        p.y += dy;
      }
    }
    render(ctx) {
      // pivot post + beam
      ctx.strokeStyle = "#6a6280"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(this.panL.x + this.panL.w / 2, this.panL.y + 5);
      ctx.lineTo(this.cx, this.y + 4); ctx.lineTo(this.panR.x + this.panR.w / 2, this.panR.y + 5); ctx.stroke();
      ctx.fillStyle = "#4a4358";
      ctx.beginPath(); ctx.moveTo(this.cx - 8, this.y + 26); ctx.lineTo(this.cx, this.y + 2); ctx.lineTo(this.cx + 8, this.y + 26); ctx.fill();
      for (const pan of [this.panL, this.panR]) {
        ctx.fillStyle = "#8a82a0"; ctx.fillRect(pan.x, pan.y, pan.w, pan.h);
        ctx.fillStyle = COLORS.gold.main; ctx.fillRect(pan.x + 4, pan.y, pan.w - 8, 3);
      }
    }
    getState() { return Math.round(this.o); }
    setState(s) { this.o = s || 0; this.panL.y = this.y - this.o; this.panR.y = this.y + this.o; }
  }

  // ------------------------------------------------------------------ Battery + Receptacle
  class Battery extends GObj {
    // A humming power cell EITHER hero can ferry (one each, held overhead).
    // ACTION picks it up / sets it down; it docks itself into a receptacle.
    constructor(cfg) { super(Object.assign({ w: 20, h: 26 }, cfg)); this.x0 = this.x; this.y0 = this.y; this.holder = null; this.docked = false; this.vy = 0; this._cool = 0; this.t = 0; }
    update(dt, level) {
      this.t += dt; this._cool = Math.max(0, this._cool - dt);
      if (this.docked) return;
      if (this.holder) {
        const p = this.holder;
        this.x = p.cx - this.w / 2; this.y = p.y - this.h - 2; this.vy = 0;
        if (p.dead) { this.holder = null; p.hasBattery = null; }
        else if (p.input && p.input.action && this._cool <= 0) {  // set it down
          this.holder = null; p.hasBattery = null; this._cool = 0.4;
          this.x = p.cx + p.facing * 20 - this.w / 2;
        }
      } else {
        // simple gravity onto the tiles
        this.vy = Math.min(this.vy + C.GRAVITY * 0.8 * dt, 700);
        GG.Physics.move(this, 0, this.vy * dt, level.tilemap.solidsIn(this.x - 4, this.y - 4, this.w + 8, this.h + 8));
        if (this.y > level.tilemap.h + 60) { this.x = this.x0; this.y = this.y0; this.vy = 0; }  // lost -> returns
        // pickup
        for (const p of level.players) {
          if (p.dead || p.hasBattery || this._cool > 0) continue;
          if (!p.input || !p.input.action) continue;
          if (Math.hypot(p.cx - this.cx, p.cy - this.cy) > 44) continue;
          this.holder = p; p.hasBattery = this; this._cool = 0.4;
          GG.bus.emit("key:collected", { color: "gold" });
          break;
        }
      }
    }
    render(ctx) {
      const c = COLORS.gold;
      ctx.fillStyle = "#2a2340"; ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = c.main; ctx.lineWidth = 2; ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
      ctx.fillStyle = c.main; ctx.shadowBlur = 8; ctx.shadowColor = c.glow;
      const f = 0.5 + Math.sin(this.t * 4) * 0.3;
      ctx.fillRect(this.x + 5, this.y + this.h - 8 - (this.h - 14) * f, this.w - 10, (this.h - 14) * f + 3);
      ctx.fillRect(this.x + this.w / 2 - 3, this.y - 3, 6, 4);   // terminal
      ctx.shadowBlur = 0;
    }
    getState() { return { x: Math.round(this.x), y: Math.round(this.y), d: this.docked ? 1 : 0 }; }
    setState(s) { if (!s) return; this.x = s.x; this.y = s.y; this.docked = !!s.d; }
  }

  class Receptacle extends GObj {
    // Docking cradle: a free battery placed against it locks in and latches
    // the channel — powered forever after.
    constructor(cfg) { super(Object.assign({ w: 28, h: 30 }, cfg)); this.powered = false; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      if (!this.powered) {
        for (const o of level.objects) {
          if (!(o instanceof Battery) || o.docked || o.holder) continue;
          if (U.aabb(o, this)) {
            o.docked = true; o.x = this.cx - o.w / 2; o.y = this.y + this.h - o.h - 2;
            this.powered = true;
            GG.bus.emit("lock:opened", { color: "gold" });
            level.fx.burst({ x: this.cx, y: this.cy, count: 20, color: [COLORS.gold.main, "#fff"], speed: 150, life: 0.6, glow: true });
          }
        }
      }
      level.setChannel(this.channel, this.powered);
    }
    render(ctx) {
      const c = this.powered ? COLORS.gold : COLORS.blue;
      ctx.fillStyle = "#2a2340"; ctx.fillRect(this.x - 3, this.y + this.h - 6, this.w + 6, 8);
      ctx.strokeStyle = c.main; ctx.lineWidth = 2;
      ctx.shadowBlur = this.powered ? 12 : 4; ctx.shadowColor = c.glow;
      ctx.strokeRect(this.x, this.y, this.w, this.h);
      ctx.beginPath(); ctx.moveTo(this.x + 4, this.y); ctx.lineTo(this.cx, this.y - 8); ctx.lineTo(this.x + this.w - 4, this.y); ctx.stroke();
      ctx.shadowBlur = 0;
      if (!this.powered) { ctx.globalAlpha = 0.5; ctx.fillStyle = c.main; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("⚡", this.cx, this.cy); ctx.textAlign = "left"; ctx.globalAlpha = 1; }
    }
    getState() { return this.powered ? 1 : 0; }
    setState(s) { this.powered = !!s; }
  }

  // ------------------------------------------------------------------ Sentinel (patrol enemy)
  class Sentinel extends GObj {
    // A corrupted guardian that walks its beat. It chases the nearest hero it
    // notices, kills on touch — and its WEIGHT presses plates, so it can be
    // lured into position like a puzzle piece.
    constructor(cfg) { super(Object.assign({ w: 26, h: 30, x1: null, speed: 55, sight: 140 }, cfg)); this.x0 = this.x; this.x1 = cfg.x1 != null ? cfg.x1 : this.x + 4 * C.TILE; this.dir = 1; this.alert = 0; this.t = 0; }
    update(dt, level) {
      this.t += dt;
      let target = null, best = 1e9;
      for (const p of level.players) {
        if (p.dead) continue;
        const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
        if (d < this.sight && Math.abs(p.cy - this.cy) < 70 && d < best) { best = d; target = p; }
      }
      if (target) this.alert = 1.4;
      else this.alert = Math.max(0, this.alert - dt);
      if (target) {
        const d = target.cx - this.cx;
        if (Math.abs(d) > 4) { this.dir = Math.sign(d); this.x += this.dir * 88 * dt; }
      } else if (this.alert <= 0) {
        this.x += this.dir * this.speed * dt;
        const lo = Math.min(this.x0, this.x1), hi = Math.max(this.x0, this.x1);
        if (this.x < lo) { this.x = lo; this.dir = 1; }
        if (this.x > hi) { this.x = hi; this.dir = -1; }
      }
      for (const p of level.players) if (!p.dead && U.aabb(p, this)) p.kill(level, "sentinel");
    }
    render(ctx) {
      const alerted = this.alert > 0;
      ctx.save();
      // Figma sentinel sprite: armored drone, burning visor, hover thruster
      const bob = Math.sin(this.t * 2.4) * 2;
      GG.drawSprite(ctx, GG.SPRITES.sentinel, this.cx, this.y + this.h + bob, this.h, this.dir, { t: this.t });
      // alert: the visor flares wide
      if (alerted) {
        ctx.fillStyle = COLORS.red.main; ctx.shadowBlur = 16; ctx.shadowColor = COLORS.red.main;
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 14) * 0.3;
        ctx.fillRect(this.x + 4, this.y + this.h * 0.36 + bob, this.w - 8, 4);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    getState() { return { x: Math.round(this.x), d: this.dir, a: Math.round(this.alert * 10) }; }
    setState(s) { if (!s) return; this.x = s.x; this.dir = s.d; this.alert = (s.a || 0) / 10; }
  }

  // ------------------------------------------------------------------ Watcher (sweeping eye)
  class Watcher extends GObj {
    // A fixed eye that sweeps its gaze. While it SEES a hero its channel goes
    // live (wire it to lasers or slamming gates). A parked cube blocks the view.
    constructor(cfg) { super(Object.assign({ w: 26, h: 26, range: 250, period: 4, gaze: 1.8, dir: 1 }, cfg)); this.t = cfg.phase || 0; this.spot = 0; }
    get gazing() { return (this.t % this.period) < this.gaze; }
    update(dt, level) {
      this.t += dt;
      this.spot = Math.max(0, this.spot - dt);
      if (this.gazing) {
        for (const p of level.players) {
          if (p.dead) continue;
          const dx = p.cx - this.cx;
          if (Math.sign(dx) !== this.dir || Math.abs(dx) > this.range) continue;
          if (Math.abs(p.cy - this.cy) > 60) continue;
          // line of sight: any crate/cube between the eye and the hero blocks it
          let blocked = false;
          for (const c of level.crates) {
            if (c.thrown) continue;
            const bx = c.cx;
            if (Math.sign(bx - this.cx) === this.dir && Math.abs(bx - this.cx) < Math.abs(dx) &&
                Math.abs(c.cy - this.cy) < 60) { blocked = true; break; }
          }
          if (!blocked) { this.spot = 1.1; GG.bus.emit("ui:error", {}); }
        }
      }
      level.setChannel(this.channel, this.spot > 0);
    }
    render(ctx) {
      const seen = this.spot > 0;
      // the sweeping gaze cone (gameplay info, drawn behind the eye)
      if (this.gazing || seen) {
        ctx.save(); ctx.globalAlpha = seen ? 0.3 : 0.14;
        ctx.fillStyle = seen ? COLORS.red.main : "#c07bff";
        ctx.beginPath(); ctx.moveTo(this.cx, this.cy);
        ctx.lineTo(this.cx + this.dir * this.range, this.cy - 46);
        ctx.lineTo(this.cx + this.dir * this.range, this.cy + 46); ctx.fill();
        ctx.restore();
      }
      // Figma watcher sprite: lidded violet eye; the pupil tracks its gaze
      ctx.save();
      if (!this.gazing && !seen) ctx.globalAlpha = 0.75;      // dormant = dimmer
      GG.drawSprite(ctx, GG.SPRITES.watcher, this.cx, this.y + this.h + Math.sin(this.t * 1.8) * 2, this.h, 1, {
        t: this.t, pupil: this.dir * (this.gazing || seen ? 4 : 0),
      });
      ctx.restore();
      if (seen) {                                             // caught you: red flare
        ctx.fillStyle = COLORS.red.main; ctx.shadowBlur = 14; ctx.shadowColor = COLORS.red.main;
        ctx.globalAlpha = 0.55 + Math.sin(this.t * 16) * 0.25;
        ctx.beginPath(); ctx.arc(this.cx + this.dir * 2, this.cy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------------ Telekinetic cube (Nichols)
  class TeleCube extends Crate {
    // Nichols grabs it with SPECIAL from up to `range` away and steers it with
    // his movement keys — but while holding it he is ROOTED in place. kinds:
    //   free  — weightless, floats where released, any direction
    //   track — moves only along `axis` ("x"|"y")
    //   heavy — sinks under gravity, moves slowly, cannot be lifted high
    constructor(cfg) {
      super(Object.assign({ kind: "free", range: 220 }, cfg));
      this.tele = true;
      this.heavy = true;                 // never physically pushable/carriable
      this.floats = this.kind !== "heavy";
      this._restY = this.y;
      this._grabY = this.y;
    }
    update(dt, level) {
      const holder = this.carried;
      if (holder && holder.character) {
        // energy drain; the pool failing lets the cube slip
        if (!level.spendEnergy(14 * dt) || holder.dead) { this.dropTele(); return; }
        // release on a fresh SPECIAL press
        if (holder.input && holder.input.specialPressed && this._grabCool <= 0) { this.dropTele(); return; }
        this._grabCool = Math.max(0, (this._grabCool || 0) - dt);
        const inp = holder.input || {};
        const spd = this.kind === "heavy" ? 70 : 145;
        let dx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * spd * dt;
        let dy = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * spd * dt;
        if (this.kind === "track") { if (this.axis === "y") dx = 0; else dy = 0; }
        this.x = U.clamp(this.x + dx, holder.cx - this.range, holder.cx + this.range - this.w);
        this.y = U.clamp(this.y + dy, holder.cy - 180, holder.cy + 180);
        if (this.kind === "heavy") this.y = Math.max(this.y, this._grabY - 44);  // can't lift high
        this.vx = 0; this.vy = 0;
        this._restY = this.y;
        if (Math.random() < dt * 6) level.fx.burst({ x: this.cx, y: this.cy, count: 1, color: COLORS.green.glow, speed: 26, life: 0.35, glow: true });
      } else {
        this._grabCool = Math.max(0, (this._grabCool || 0) - dt);
        if (this.floats && !this.thrown) { this.vy = 0; this.y = this._restY; }  // hovers where left
        // grab attempt: an engineer pressing SPECIAL within range
        // (the cooldown stops the very press that released it from re-grabbing)
        for (const p of level.players) {
          if (this._grabCool > 0) break;
          if (p.dead || !p.character.canBuild) continue;                          // Nichols' gift
          if (!p.input || !p.input.specialPressed) continue;
          if (Math.hypot(p.cx - this.cx, p.cy - this.cy) > this.range) continue;
          if (level.energy < 6) continue;
          this.carried = p; p.teleHold = this; this._grabCool = 0.3; this._grabY = this.y;
          GG.bus.emit("switch:toggled", {});
          level.fx.burst({ x: this.cx, y: this.cy, count: 10, color: COLORS.green.glow, speed: 80, life: 0.4, glow: true });
          break;
        }
      }
    }
    dropTele() {
      const p = this.carried;
      if (p) p.teleHold = null;
      this.carried = null; this._grabCool = 0.3;
      this._restY = this.y;
      if (this.kind === "heavy") { this.vy = 0; }  // gravity resumes via crate physics
    }
    render(ctx) {
      const held = this.carried && this.carried.character;
      const c = COLORS.green;
      ctx.save();
      ctx.shadowBlur = held ? 14 : 7; ctx.shadowColor = c.glow;
      ctx.fillStyle = this.kind === "heavy" ? "#4a5568" : "#2a4a3a";
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeStyle = c.main; ctx.lineWidth = 2;
      ctx.strokeRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6);
      ctx.fillStyle = c.glow; ctx.globalAlpha = held ? 0.9 : 0.5 + Math.sin(Date.now() / 300) * 0.2;
      ctx.fillRect(this.cx - 3, this.cy - 3, 6, 6);
      ctx.globalAlpha = 1;
      if (this.kind === "track") { ctx.setLineDash([3, 5]); ctx.strokeStyle = c.dim; ctx.beginPath();
        if (this.axis === "y") { ctx.moveTo(this.cx, this.y - 60); ctx.lineTo(this.cx, this.y + this.h + 60); }
        else { ctx.moveTo(this.x - 60, this.cy); ctx.lineTo(this.x + this.w + 60, this.cy); }
        ctx.stroke(); ctx.setLineDash([]); }
      // the mind-tether
      if (held) {
        ctx.strokeStyle = c.glow; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(this.carried.cx, this.carried.cy - 6); ctx.lineTo(this.cx, this.cy); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore(); ctx.shadowBlur = 0;
    }
  }

  // ------------------------------------------------------------------ Swing anchor (Nibihah)
  class SwingAnchor extends GObj {
    // A glowing ring Nibihah can hook with SPECIAL to swing pendulum-style.
    // The swing itself is simulated by Level._stepSwing.
    constructor(cfg) { super(Object.assign({ w: 18, h: 18, reach: 150 }, cfg)); this.t = 0; }
    update(dt, level) {
      this.t += dt;
      for (const p of level.players) {
        if (p.dead || !p.character.canDash || p.swing) continue;               // Nibihah's gift
        if (!p.input || !p.input.specialPressed) continue;
        const dx = p.cx - this.cx, dy = p.cy - this.cy;
        const d = Math.hypot(dx, dy);
        if (d > this.reach || dy < 6) continue;                                // must be below the ring
        if (level.energy < 4) continue;
        const L = U.clamp(d, 46, 230);
        const a = Math.atan2(dx, dy);                                          // angle from straight-down
        const av = (p.vx * Math.cos(a) - p.vy * Math.sin(a)) / L;              // carry momentum in
        p.swing = { ax: this.cx, ay: this.cy, L, a, av, cool: 0.25 };
        p.dashTime = 0;
        GG.bus.emit("player:jump", { index: p.index });
        level.fx.burst({ x: this.cx, y: this.cy, count: 8, color: COLORS.blue.glow, speed: 70, life: 0.3, glow: true });
      }
    }
    render(ctx) {
      const c = COLORS.blue;
      ctx.save(); ctx.translate(this.cx, this.cy);
      ctx.strokeStyle = c.main; ctx.lineWidth = 2.5;
      ctx.shadowBlur = 10; ctx.shadowColor = c.glow;
      ctx.beginPath(); ctx.arc(0, 0, 7 + Math.sin(this.t * 3) * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = c.glow; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); ctx.shadowBlur = 0;
    }
  }

  // ------------------------------------------------------------------ Tandem plates
  class TandemPlate extends GObj {
    // Two pads far apart; the channel is live only while BOTH are pressed
    // (0.4s grace so it doesn't need frame-perfect timing).
    constructor(cfg) {
      super(Object.assign({ w: C.TILE, h: 10, grace: 0.4 }, cfg));
      // second pad position
      this.bx = cfg.bx != null ? cfg.bx : this.x + 6 * C.TILE;
      this.by = cfg.by != null ? cfg.by : this.y;
      this._ta = 0; this._tb = 0;
    }
    update(dt, level) {
      this._ta = Math.max(0, this._ta - dt); this._tb = Math.max(0, this._tb - dt);
      const padA = { x: this.x, y: this.y - 6, w: this.w, h: 14 };
      const padB = { x: this.bx, y: this.by - 6, w: this.w, h: 14 };
      for (const p of level.players) {
        if (p.dead) continue;
        if (U.aabb(p, padA)) this._ta = this.grace;
        if (U.aabb(p, padB)) this._tb = this.grace;
      }
      const on = this._ta > 0 && this._tb > 0;
      if (on && !this._was) GG.bus.emit("button:pressed", { channel: this.channel });
      this._was = on;
      level.setChannel(this.channel, on);
    }
    _pad(ctx, x, y, lit, other) {
      const c = lit ? COLORS.gold : COLORS.blue;
      ctx.fillStyle = "#0e1526"; ctx.fillRect(x - 2, y + 2, this.w + 4, 8);
      ctx.fillStyle = lit ? c.main : c.dim; ctx.shadowBlur = lit ? 10 : 0; ctx.shadowColor = c.glow;
      ctx.fillRect(x, y + (lit ? 3 : 0), this.w, 7); ctx.shadowBlur = 0;
      // countdown ring while waiting for the partner
      if (lit && !other) {
        const f = this._ta > 0 && U.aabb ? Math.max(this._ta, this._tb) / this.grace : 0;
        ctx.strokeStyle = COLORS.gold.main; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x + this.w / 2, y - 12, 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
      }
    }
    render(ctx) {
      this._pad(ctx, this.x, this.y, this._ta > 0, this._tb > 0);
      this._pad(ctx, this.bx, this.by, this._tb > 0, this._ta > 0);
      // a faint link between the twin pads
      ctx.globalAlpha = 0.18; ctx.strokeStyle = COLORS.gold.main; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(this.x + this.w / 2, this.y); ctx.lineTo(this.bx + this.w / 2, this.by); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ Tether zone
  class TetherZone extends GObj {
    // Inside this region the heroes are bound by a fragile aether thread:
    // drift further apart than `maxDist` and the thread snaps — both fall.
    constructor(cfg) { super(Object.assign({ maxDist: 190 }, cfg)); this.strain = 0; }
    update(dt, level) {
      const [a, b] = level.players;
      const inside = (!a.dead && U.aabb(a, this)) || (!b.dead && U.aabb(b, this));
      if (!inside || a.dead || b.dead) { this.strain = 0; return; }
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      this.strain = U.clamp((d - this.maxDist * 0.6) / (this.maxDist * 0.4), 0, 1);
      if (d > this.maxDist) { a.kill(level, "tether"); b.kill(level, "tether"); this.strain = 0; }
    }
    render(ctx, level) {
      ctx.globalAlpha = 0.07; ctx.fillStyle = COLORS.gold.main;
      ctx.fillRect(this.x, this.y, this.w, this.h); ctx.globalAlpha = 1;
      const [a, b] = level.players;
      if (!a.dead && !b.dead && (U.aabb(a, this) || U.aabb(b, this))) {
        ctx.strokeStyle = this.strain > 0.7 ? COLORS.red.main : COLORS.gold.main;
        ctx.lineWidth = this.strain > 0.7 ? 1 : 2;
        ctx.globalAlpha = 0.65; ctx.setLineDash(this.strain > 0.7 ? [3, 4] : []);
        ctx.beginPath(); ctx.moveTo(a.cx, a.cy);
        const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2 + (1 - this.strain) * 24;
        ctx.quadraticCurveTo(mx, my, b.cx, b.cy); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    }
  }

  // ------------------------------------------------------------------ Wind zone
  class WindZone extends GObj {
    // Periodic gusts shove anyone inside. Brace by crouching on the ground —
    // or park a cube in the gust to shelter the whole zone.
    constructor(cfg) { super(Object.assign({ push: 260, dir: 1, period: 4, blow: 1.8, phase: 0 }, cfg)); this.t = cfg.phase || 0; }
    get active() { return (this.t % this.period) < this.blow; }
    update(dt, level) {
      this.t += dt;
      // a parked cube inside the zone breaks the wind for everyone
      this.shielded = level.crates.some(c => !c.thrown && U.aabb(c, this) && !(c.carried && c.carried.character));
      if (!this.active || this.shielded) return;
      for (const p of level.players) {
        if (p.dead || p.swing) continue;
        if (!U.aabb(p, this)) continue;
        if (p.onGround && p.input && p.input.down) continue;      // braced
        p.vx += this.push * this.dir * dt;
        // ground friction would eat the shove — gusts also drag you bodily
        if (p.onGround) p.x += this.push * this.dir * dt * 0.4;
      }
    }
    render(ctx) {
      const on = this.active && !this.shielded;
      ctx.globalAlpha = on ? 0.28 : 0.08;
      ctx.strokeStyle = "#cfe8ff"; ctx.lineWidth = 1.5;
      const off = (this.t * 140 * this.dir) % 46;
      for (let y = this.y + 8; y < this.y + this.h; y += 16) {
        for (let x = this.x - 46; x < this.x + this.w; x += 46) {
          const sx = x + off;
          if (sx < this.x || sx + 18 > this.x + this.w) continue;
          ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 18, y);
          ctx.lineTo(sx + 12, y - 3); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (this.shielded) { ctx.globalAlpha = 0.5; ctx.fillStyle = "#bff0c8"; ctx.font = "10px sans-serif"; ctx.fillText("sheltered", this.x + 6, this.y + 12); ctx.globalAlpha = 1; }
    }
  }

  // ------------------------------------------------------------------ Rune sequence
  class RuneSeq extends GObj {
    // Numbered runes that must be stepped on IN ORDER. `pads` = [{x,y,who?}]
    // (who: "green"|"blue" locks a pad to one hero). Wrong pad resets the
    // sequence. Completing it latches the channel permanently.
    constructor(cfg) {
      super(Object.assign({ w: 10, h: 10 }, cfg));
      this.pads = (cfg.pads || []).map(p => Object.assign({ w: C.TILE, h: 12 }, p));
      this.idx = 0; this.done = false; this._off = -1;
    }
    update(dt, level) {
      if (this.done) { level.setChannel(this.channel, true); return; }
      let touched = -1;
      for (let i = 0; i < this.pads.length; i++) {
        const pad = this.pads[i];
        const zone = { x: pad.x, y: pad.y - 8, w: pad.w, h: 20 };
        for (const p of level.players) {
          if (p.dead || !U.aabb(p, zone)) continue;
          if (pad.who && p.character.color !== pad.who) continue;
          touched = i;
        }
      }
      if (touched >= 0 && touched !== this._off) {
        if (touched === this.idx) {
          this.idx++;
          GG.bus.emit("button:pressed", {});
          const pad = this.pads[touched];
          level.fx.burst({ x: pad.x + pad.w / 2, y: pad.y, count: 8, color: COLORS.gold.main, speed: 70, life: 0.4, glow: true });
          if (this.idx >= this.pads.length) {
            this.done = true;
            GG.bus.emit("secret:found", {});
            level.fx.burst({ x: this.cx, y: this.cy, count: 22, color: [COLORS.gold.main, "#fff"], speed: 160, life: 0.7, glow: true });
          }
        } else if (touched > this.idx) {   // stepping ahead resets the dance
          this.idx = 0;
          GG.bus.emit("ui:error", {});
        }
      }
      this._off = touched;
      level.setChannel(this.channel, this.done);
    }
    render(ctx) {
      this.pads.forEach((pad, i) => {
        const lit = i < this.idx || this.done;
        const c = pad.who === "green" ? COLORS.green : pad.who === "blue" ? COLORS.blue : COLORS.gold;
        ctx.fillStyle = "#0e1526"; ctx.fillRect(pad.x - 2, pad.y + 4, pad.w + 4, 8);
        ctx.fillStyle = lit ? c.main : c.dim;
        ctx.shadowBlur = lit ? 10 : 0; ctx.shadowColor = c.glow;
        ctx.fillRect(pad.x, pad.y + (lit ? 4 : 1), pad.w, 8); ctx.shadowBlur = 0;
        ctx.fillStyle = lit ? "#1a1220" : c.main; ctx.font = "700 11px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(String(i + 1), pad.x + pad.w / 2, pad.y - 4); ctx.textAlign = "left";
      });
    }
    getState() { return (this.done ? 128 : 0) | this.idx; }
    setState(s) { this.done = !!(s & 128); this.idx = s & 127; }
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
    setState(s) {
      this.a = (s || 0) / 100;
      // as with MovingPlatform: clients must re-derive the arm position
      const px = this.x, py = this.y;
      this.x = this.hubX + Math.cos(this.a) * this.radius - this.w / 2;
      this.y = this.hubY + Math.sin(this.a) * this.radius - this.h / 2;
      this.dx = this.x - px; this.dy = this.y - py;
    }
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
      // Figma "Portal": a tall aether well wrapped in two glowing rings —
      // violet outside, blue inside — with the charge blooming in the core.
      const cx = this.cx, cy = this.cy, t = this.t;
      const rx = this.w * 0.42, ry = this.h * 0.55;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = 0.45 + this.charge * 0.4 + Math.sin(t * 3) * 0.07;
      const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, ry);
      g.addColorStop(0, `rgba(255,255,255,${glow})`);
      g.addColorStop(0.5, `rgba(192,123,255,${glow * 0.6})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.translate(cx, cy);
      const breathe = Math.sin(t * 2.2) * 2;
      ctx.strokeStyle = "#c07bff"; ctx.lineWidth = 3.5;             // outer violet ring
      ctx.shadowBlur = 14; ctx.shadowColor = "#c07bff";
      ctx.beginPath(); ctx.ellipse(0, 0, rx + breathe * 0.4, ry + breathe * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#7fd4ff"; ctx.lineWidth = 2;               // inner blue ring
      ctx.shadowBlur = 12; ctx.shadowColor = "#7fd4ff";
      ctx.beginPath(); ctx.ellipse(0, 0, rx - 5 - breathe * 0.3, ry - 6 - breathe * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      // charge meter as an inner bloom
      if (this.charge > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + this.charge * 0.5})`;
        ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.5 * this.charge, ry * 0.5 * this.charge, 0, 0, Math.PI * 2); ctx.fill();
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
      // Figma "Crumble Platform": weathered stone laced with dark cracks
      const sh = this.state === "shake" ? Math.sin(this.t * 60) * 2 : 0;
      ctx.fillStyle = this.state === "shake" ? "#5c5548" : "#4a4438";
      ctx.fillRect(this.x + sh, this.y, this.w, this.h);
      ctx.fillStyle = "#5c554a"; ctx.fillRect(this.x + sh, this.y, this.w, 3);
      ctx.fillStyle = "#2a2620";
      const cr = [[0.23, 0.2, 2, 0.6], [0.27, 0.6, 0.14, 2], [0.6, 0.15, 2, 0.45], [0.55, 0.5, 2, 0.4], [0.78, 0.28, 0.11, 2]];
      for (const [fx2, fy2, cw, chh] of cr) {
        ctx.fillRect(this.x + sh + this.w * fx2, this.y + this.h * fy2,
          cw > 1 ? 2.5 : this.w * cw, chh > 1 ? 2.5 : this.h * chh);
      }
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
    // Nichols' tool, so it answers to his colour (green).
    constructor(cfg) { super(Object.assign({ colorLock: "green", range: 200 }, cfg)); }
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

  GG.obj = { GObj, Gem, Key, LockedDoor, Button, Switch, Door, Crate, MovingPlatform, Hazard, Mirror, Laser, Teleporter, Exit, NarrowGate, RepairNode, BridgeAnchor, GrappleLever, HiddenPlatform, SecretSwitch, Portal, Crumble, Blinker, Crusher, Blade, Rock, TimedSwitch, Rotor, TeleCube, SwingAnchor, TandemPlate, TetherZone, WindZone, RuneSeq, Seesaw, Battery, Receptacle, Sentinel, Watcher, Boss, Tutor, Rat, COLORS };
})(window);
