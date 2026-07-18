/* =========================================================================
 * utils.js — global namespace + math/helper utilities
 * -------------------------------------------------------------------------
 * The whole game lives under a single global object `GG` (Game Globals) so
 * that we can use plain <script> tags (no build step / ES-module CORS issues)
 * while still keeping the code organised into focused files.
 * ========================================================================= */
(function (global) {
  "use strict";

  const GG = global.GG || (global.GG = {});

  /** Clamp v into [min, max]. */
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  /** Linear interpolation. t in [0,1]. */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Frame-rate independent smoothing factor (exponential approach). */
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function choice(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /** Axis-aligned bounding-box overlap test. */
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /** Does point (px,py) sit inside rect r? */
  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  /** Format milliseconds as m:ss.mmm for the timer UI. */
  function formatTime(ms) {
    if (ms == null || !isFinite(ms)) return "--:--";
    const totalSec = ms / 1000;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  /** Tiny deterministic-ish id for lobby codes etc. */
  function makeCode(len = 5) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
    let out = "";
    for (let i = 0; i < len; i++) out += chars[(Math.random() * chars.length) | 0];
    return out;
  }

  /** Shallow-merge defaults into target for any missing keys (recursive). */
  function deepDefaults(target, defaults) {
    target = target || {};
    for (const k in defaults) {
      if (defaults[k] && typeof defaults[k] === "object" && !Array.isArray(defaults[k])) {
        target[k] = deepDefaults(target[k], defaults[k]);
      } else if (target[k] === undefined) {
        target[k] = defaults[k];
      }
    }
    return target;
  }

  GG.util = {
    clamp, lerp, damp, rand, randInt, choice,
    aabb, pointInRect, formatTime, makeCode, deepDefaults,
  };

  // Shared constants used across the codebase.
  //
  // Rendering: the game SIMULATES in a 960x540 "design space" (camera + physics
  // all use these units) but RENDERS to a native 1920x1080 canvas by scaling the
  // context by an integer factor (RENDER_SCALE = 2). An integer scale keeps the
  // pixel art crisp (pixel-perfect), and CSS then fits the 16:9 canvas to the
  // window at any resolution. This gives true 1080p output without retuning any
  // physics or rebuilding any level geometry.
  GG.C = {
    TILE: 32,            // tile size in world/design pixels
    VIEW_W: 960,         // design-space viewport (camera units)
    VIEW_H: 540,
    RENDER_SCALE: 2,     // 960*2 = 1920, 540*2 = 1080
    CANVAS_W: 1920,      // native canvas backing resolution
    CANVAS_H: 1080,
    GRAVITY: 2100,       // px/s^2
    FIXED_DT: 1 / 120,   // physics fixed timestep (seconds)
    MAX_FRAME: 0.25,     // clamp huge frame gaps (tab switching)
  };
})(window);
