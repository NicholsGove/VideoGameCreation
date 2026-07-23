/* =========================================================================
 * camera.js — smooth-follow camera with zoom, bounds, and screen shake
 * -------------------------------------------------------------------------
 * Follows the midpoint of both players and auto-zooms so both stay in view
 * (a lightweight alternative to split-screen). Clamps to level bounds and
 * supports additive trauma-based screen shake.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;

  class Camera {
    constructor(viewW, viewH) {
      this.viewW = viewW; this.viewH = viewH;
      this.x = 0; this.y = 0;          // top-left of view in world space
      this.zoom = 1;
      this._targetZoom = 1;
      this.bounds = { x: 0, y: 0, w: viewW, h: viewH };
      this.trauma = 0;                 // 0..1, decays over time
      this._shakeX = 0; this._shakeY = 0;
      this.enabledShake = true;
    }

    setBounds(w, h) { this.bounds = { x: 0, y: 0, w, h }; }

    /** Add screen shake. amount in 0..1 (clamped). */
    shake(amount) {
      if (!this.enabledShake) return;
      this.trauma = U.clamp(this.trauma + amount, 0, 1);
    }

    /**
     * @param {Array<{x,y,w,h,dead?}>} targets players to keep in frame
     */
    update(dt, targets) {
      const alive = targets.filter(t => t && !t.dead);
      const pts = alive.length ? alive : targets;
      if (pts.length) {
        // Centre on the group midpoint.
        let cx = 0, cy = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const t of pts) {
          const px = t.x + t.w / 2, py = t.y + t.h / 2;
          cx += px; cy += py;
          minX = Math.min(minX, px); maxX = Math.max(maxX, px);
          minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
        cx /= pts.length; cy /= pts.length;

        // Auto-zoom out if players separate widely (keeps both visible).
        const spanX = (maxX - minX) + 260;
        const spanY = (maxY - minY) + 200;
        const zx = this.viewW / spanX, zy = this.viewH / spanY;
        this._targetZoom = U.clamp(Math.min(zx, zy), 0.62, 1.15);
        this.zoom = U.damp(this.zoom, this._targetZoom, 4, dt);

        // Look-ahead: lead the group's motion so players see where they're
        // going — further when running, and downward while falling (Ori-style).
        let lvx = 0, lvy = 0;
        for (const t of pts) { lvx += t.vx || 0; lvy += t.vy || 0; }
        lvx /= pts.length; lvy /= pts.length;
        this._lookX = U.damp(this._lookX || 0, U.clamp(lvx * 0.24, -72, 72), 3, dt);
        this._lookY = U.damp(this._lookY || 0, U.clamp(lvy > 0 ? lvy * 0.14 : lvy * 0.06, -26, 64), 3, dt);

        const vw = this.viewW / this.zoom, vh = this.viewH / this.zoom;
        let tx = cx + this._lookX - vw / 2, ty = cy + this._lookY - vh / 2;
        // Clamp to level bounds.
        tx = U.clamp(tx, this.bounds.x, Math.max(this.bounds.x, this.bounds.w - vw));
        ty = U.clamp(ty, this.bounds.y, Math.max(this.bounds.y, this.bounds.h - vh));
        this.x = U.damp(this.x, tx, 9, dt);
        this.y = U.damp(this.y, ty, 9, dt);
      }

      // Resolve shake (quadratic falloff feels punchier).
      if (this.trauma > 0) {
        const s = this.trauma * this.trauma;
        this._shakeX = U.rand(-1, 1) * 16 * s;
        this._shakeY = U.rand(-1, 1) * 16 * s;
        this.trauma = Math.max(0, this.trauma - dt * 1.6);
      } else { this._shakeX = this._shakeY = 0; }
    }

    /** Apply the camera transform to a 2D context. Call ctx.save() first. */
    apply(ctx) {
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-(this.x + this._shakeX), -(this.y + this._shakeY));
    }

    /** Convert a screen point to world space (for future mouse interactions). */
    screenToWorld(sx, sy) {
      return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
    }
  }

  GG.Camera = Camera;
})(window);
