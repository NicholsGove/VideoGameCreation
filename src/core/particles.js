/* =========================================================================
 * particles.js — pooled particle system
 * -------------------------------------------------------------------------
 * Uses an object pool (no per-frame allocation) for GC-friendly bursts:
 * dust on landing, sparks from electricity, bubbles from poison, gem sparkle,
 * death explosion, teleport swirl, etc.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util;

  class Particle {
    constructor() { this.active = false; this.reset(); }
    reset() {
      this.x = this.y = 0; this.vx = this.vy = 0;
      this.life = 0; this.maxLife = 1;
      this.size = 2; this.color = "#fff";
      this.gravity = 0; this.drag = 1; this.glow = false;
    }
  }

  class Particles {
    constructor(max = 600) {
      this.pool = new Array(max).fill(null).map(() => new Particle());
      this.enabled = true;
    }

    _get() {
      for (const p of this.pool) if (!p.active) return p;
      return null; // pool exhausted; drop the request (bounded memory)
    }

    /** Spawn a burst. opts: {x,y,count,color,speed,life,size,gravity,glow,spread} */
    burst(opts) {
      if (!this.enabled) return;
      const n = opts.count || 8;
      for (let i = 0; i < n; i++) {
        const p = this._get(); if (!p) break;
        const ang = opts.angle != null
          ? opts.angle + U.rand(-(opts.spread || Math.PI), (opts.spread || Math.PI))
          : U.rand(0, Math.PI * 2);
        const spd = U.rand((opts.speed || 60) * 0.4, opts.speed || 60);
        p.active = true;
        p.x = opts.x + U.rand(-2, 2);
        p.y = opts.y + U.rand(-2, 2);
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd - (opts.lift || 0);
        p.maxLife = p.life = U.rand((opts.life || 0.5) * 0.6, opts.life || 0.5);
        p.size = U.rand((opts.size || 3) * 0.6, opts.size || 3);
        p.color = Array.isArray(opts.color) ? U.choice(opts.color) : (opts.color || "#fff");
        p.gravity = opts.gravity ?? 0;
        p.drag = opts.drag ?? 0.9;
        p.glow = !!opts.glow;
      }
    }

    update(dt) {
      for (const p of this.pool) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.vy += p.gravity * dt;
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy *= Math.pow(p.drag, dt * 60);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    render(ctx) {
      ctx.save();
      for (const p of this.pool) {
        if (!p.active) continue;
        const a = U.clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = a;
        if (p.glow) { ctx.shadowBlur = 8; ctx.shadowColor = p.color; }
        else ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        const s = p.size * a;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    clear() { for (const p of this.pool) p.active = false; }
  }

  GG.Particles = Particles;
})(window);
