/* =========================================================================
 * tilemap.js — static tile geometry + shared AABB collision helper
 * -------------------------------------------------------------------------
 * Tiles carry surface behaviour (normal / ice / conveyor / breakable). The
 * Physics helper performs axis-separated swept-AABB resolution against an
 * arbitrary list of solid rects (tiles + crates + closed doors + platforms),
 * which is what both players and crates use.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;

  // Tile ids and their meaning.
  const TILE = {
    EMPTY: 0,
    DIRT: 1,
    STONE: 2,
    ICE: 3,          // solid, very low friction on top
    CONVEYOR_L: 4,   // solid, top surface pushes left
    CONVEYOR_R: 5,   // solid, top surface pushes right
    BREAK: 6,        // solid, breaks shortly after weight is applied
    ONEWAY: 7,       // one-way platform: land on top, jump/drop through
  };
  const SOLID = new Set([1, 2, 3, 4, 5, 6]);   // full solids (ONEWAY handled separately)

  class Tilemap {
    /** @param {number[][]} grid row-major tile ids @param {number} tile size */
    constructor(grid, tile = C.TILE) {
      this.grid = grid;
      this.tile = tile;
      this.rows = grid.length;
      this.cols = grid[0].length;
      this.w = this.cols * tile;
      this.h = this.rows * tile;
      // breakable tile timers keyed "r,c"
      this._breakTimers = {};
      this._broken = new Set();
    }

    at(col, row) {
      if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return TILE.EMPTY;
      if (this._broken.has(row * this.cols + col)) return TILE.EMPTY;
      return this.grid[row][col];
    }
    isSolid(col, row) { return SOLID.has(this.at(col, row)); }

    /** Return solid tile rects overlapping the given AABB region (+1 margin). */
    solidsIn(x, y, w, h) {
      const t = this.tile;
      const c0 = Math.floor(x / t) - 1, c1 = Math.floor((x + w) / t) + 1;
      const r0 = Math.floor(y / t) - 1, r1 = Math.floor((y + h) / t) + 1;
      const out = [];
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = this.at(c, r);
          if (SOLID.has(id)) {
            out.push({ x: c * t, y: r * t, w: t, h: t, tile: id, col: c, row: r });
          } else if (id === TILE.ONEWAY) {
            // thin one-way ledge at the top of the tile
            out.push({ x: c * t, y: r * t, w: t, h: 10, tile: id, col: c, row: r, oneWay: true });
          }
        }
      }
      return out;
    }

    /** Tile id at a world point (used for surface friction/conveyors). */
    tileAtWorld(px, py) { return this.at(Math.floor(px / this.tile), Math.floor(py / this.tile)); }

    /** Advance breakable-tile logic. loadedRects = solids currently weighted. */
    updateBreakables(dt, weights) {
      // weights: array of AABBs (players/crates). A breakable tile directly
      // beneath a weight starts a countdown, then collapses.
      for (const key in this._breakTimers) this._breakTimers[key].seen = false;
      for (const w of weights) {
        const t = this.tile;
        const c = Math.floor((w.x + w.w / 2) / t);
        const r = Math.floor((w.y + w.h + 1) / t); // tile just below feet
        if (this.at(c, r) === TILE.BREAK) {
          const key = r + "," + c;
          this._breakTimers[key] = this._breakTimers[key] || { t: 0 };
          this._breakTimers[key].t += dt; this._breakTimers[key].seen = true;
          if (this._breakTimers[key].t > 0.5) {
            this._broken.add(r * this.cols + c);
            GG.bus.emit("tile:broke", { c, r });
            delete this._breakTimers[key];
          }
        }
      }
    }

    resetBreakables() { this._broken.clear(); this._breakTimers = {}; }

    render(ctx, cam) {
      const t = this.tile;
      const c0 = Math.max(0, Math.floor(cam.x / t));
      const c1 = Math.min(this.cols - 1, Math.floor((cam.x + cam.viewW / cam.zoom) / t) + 1);
      const r0 = Math.max(0, Math.floor(cam.y / t));
      const r1 = Math.min(this.rows - 1, Math.floor((cam.y + cam.viewH / cam.zoom) / t) + 1);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = this.at(c, r);
          if (id === TILE.EMPTY) continue;
          const x = c * t, y = r * t;
          this._drawTile(ctx, id, x, y, t, c, r);
        }
      }
    }

    _drawTile(ctx, id, x, y, t) {
      switch (id) {
        case TILE.DIRT:
          ctx.fillStyle = "#3b2f24"; ctx.fillRect(x, y, t, t);
          ctx.fillStyle = "#4d3d2e"; ctx.fillRect(x, y, t, 6);
          ctx.fillStyle = "#5a8a3c"; ctx.fillRect(x, y, t, 3); break;
        case TILE.STONE:
          ctx.fillStyle = "#2a3350"; ctx.fillRect(x, y, t, t);
          ctx.fillStyle = "#374266"; ctx.fillRect(x + 2, y + 2, t - 4, t - 4); break;
        case TILE.ICE:
          ctx.fillStyle = "#9fd8ff"; ctx.fillRect(x, y, t, t);
          ctx.fillStyle = "#c9ecff"; ctx.fillRect(x, y, t, 5);
          ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(x + 6, y + 4); ctx.lineTo(x + 14, y + t - 6); ctx.stroke(); break;
        case TILE.CONVEYOR_L:
        case TILE.CONVEYOR_R: {
          ctx.fillStyle = "#20283f"; ctx.fillRect(x, y, t, t);
          ctx.fillStyle = "#ffcf4d";
          const dir = id === TILE.CONVEYOR_R ? 1 : -1;
          const off = ((Date.now() / 60) * dir) % t;
          for (let i = -t; i < t; i += 10) { const ax = x + ((i + off + t) % t); ctx.fillRect(ax, y + 2, 5, 4); }
          break;
        }
        case TILE.BREAK:
          ctx.fillStyle = "#5a4633"; ctx.fillRect(x, y, t, t);
          ctx.strokeStyle = "#2c2216"; ctx.lineWidth = 1;
          ctx.strokeRect(x + 3, y + 3, t - 6, t - 6);
          ctx.beginPath(); ctx.moveTo(x + t / 2, y); ctx.lineTo(x + t / 2, y + t); ctx.stroke(); break;
        case TILE.ONEWAY:
          ctx.fillStyle = "#6a7ba8"; ctx.fillRect(x, y, t, 8);
          ctx.fillStyle = "#95a6d0"; ctx.fillRect(x, y, t, 3);
          ctx.fillStyle = "rgba(120,140,190,0.25)"; ctx.fillRect(x + 4, y + 8, t - 8, 3); break;
        default:
          ctx.fillStyle = "#333"; ctx.fillRect(x, y, t, t);
      }
    }
  }

  /* ---- Physics: axis-separated swept AABB against a list of solids -------- */
  const Physics = {
    /**
     * Move `e` by (dx,dy) resolving against `solids` (array of {x,y,w,h,oneWay?}).
     * Mutates e.x/e.y and zeroes e.vx/e.vy on contact. Sets e.onGround and
     * e.groundRef when landing on top of something.
     */
    move(e, dx, dy, solids) {
      e.onGround = false; e.groundRef = null; e.hitWallDir = 0; e.hitCeil = false;

      // --- X axis ---
      e.x += dx;
      for (const s of solids) {
        if (s === e) continue;
        if (!U.aabb(e, s)) continue;
        if (s.oneWay) continue;              // one-way platforms never block X
        if (dx > 0) { e.x = s.x - e.w; e.hitWallDir = 1; }
        else if (dx < 0) { e.x = s.x + s.w; e.hitWallDir = -1; }
        e.vx = 0;
      }

      // --- Y axis ---
      const prevBottom = e.y + e.h - dy; // approximate previous foot position
      e.y += dy;
      for (const s of solids) {
        if (s === e) continue;
        if (!U.aabb(e, s)) continue;
        if (s.oneWay) {
          // Only collide when moving down and feet were above the platform top.
          if (dy <= 0) continue;
          if (prevBottom > s.y + 6) continue;
        }
        if (dy > 0) { e.y = s.y - e.h; e.onGround = true; e.groundRef = s; e.vy = 0; }
        else if (dy < 0) { e.y = s.y + s.h; e.vy = 0; e.hitCeil = true; }
      }
    },
  };

  GG.Tilemap = Tilemap;
  GG.TILE = TILE;
  GG.Physics = Physics;
})(window);
