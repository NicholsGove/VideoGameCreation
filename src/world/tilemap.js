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

    /**
     * Styled rendering (open world): each biome gets its own ground palette,
     * surfaces get grass/snow/gold trim where exposed, and the whole static
     * layer is baked once into an offscreen canvas and blitted per frame.
     */
    setStyle(style, theme) { this.style = style; this.styleTheme = theme || null; this._cache = null; }

    _bake() {
      const t = this.tile, st = this.style;
      const cv = document.createElement("canvas");
      cv.width = this.w; cv.height = this.h;
      const cx = cv.getContext("2d");
      if (!cx) return null;
      const hash = (c, r) => (((c * 73856093) ^ (r * 19349663)) >>> 0) % 997;
      const open = (c, r) => { const id = this.at(c, r); return id === 0 || id === 7; };
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const id = this.at(c, r);
        if (id === 0 || id === 4 || id === 5) continue;
        const x = c * t, y = r * t, h = hash(c, r);
        if (id === 1 || id === 2) {
          const deep = !open(c, r - 1) && !open(c, r + 1) && !open(c - 1, r) && !open(c + 1, r);
          cx.fillStyle = id === 1 ? st.ground : st.rock;
          if (deep) cx.fillStyle = st.deep || cx.fillStyle;
          cx.fillRect(x, y, t, t);
          // the region's own stonework
          this._pattern(cx, this.styleTheme, x, y, t, c, r, h, deep);
          // texture flecks
          cx.fillStyle = st.fleck;
          cx.fillRect(x + (h % 22) + 3, y + ((h >> 3) % 20) + 5, 3, 2);
          if (h % 3 === 0) cx.fillRect(x + ((h >> 2) % 20) + 6, y + ((h >> 5) % 18) + 8, 2, 2);
          if (!deep && id === 2) { cx.fillStyle = st.rockLit; cx.fillRect(x + 2, y + 2, t - 4, 2); }
          // exposed faces
          if (open(c - 1, r)) { cx.fillStyle = st.edge; cx.fillRect(x, y, 3, t); }
          if (open(c + 1, r)) { cx.fillStyle = st.edge; cx.fillRect(x + t - 3, y, 3, t); }
          if (open(c, r + 1)) { cx.fillStyle = st.edge; cx.fillRect(x, y + t - 3, t, 3);
            if (st.drip && h % 5 === 0) { cx.fillStyle = st.drip; cx.fillRect(x + (h % 24) + 4, y + t, 3, 4 + (h % 5)); } }
          // a soft bevel: lit just inside exposed left faces, shaded under the lip
          if (open(c - 1, r)) { cx.fillStyle = "rgba(255,255,255,0.07)"; cx.fillRect(x + 3, y, 2, t); }
          if (open(c, r + 1)) { cx.fillStyle = "rgba(0,0,0,0.18)"; cx.fillRect(x, y + t - 6, t, 3); }
          if (open(c, r - 1)) {
            cx.fillStyle = st.top; cx.fillRect(x, y, t, 6);
            cx.fillStyle = st.grass; cx.fillRect(x, y, t, 3);
            if (st.tuft && h % 4 === 0) { cx.fillStyle = st.tuft; cx.fillRect(x + (h % 26) + 2, y - 3, 2, 3); cx.fillRect(x + (h % 26) + 5, y - 5, 2, 5); }
            this._cap(cx, this.styleTheme, x, y, t, h);
          }
          // round off exposed outer corners so the terrain reads organic
          const R = 7;
          cx.save(); cx.globalCompositeOperation = "destination-out";
          const cut = (ax, ay, sx, sy) => { cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(ax + sx * R, ay); cx.quadraticCurveTo(ax, ay, ax, ay + sy * R); cx.closePath(); cx.fill(); };
          if (open(c, r - 1) && open(c - 1, r) && open(c - 1, r - 1)) cut(x, y, 1, 1);
          if (open(c, r - 1) && open(c + 1, r) && open(c + 1, r - 1)) cut(x + t, y, -1, 1);
          if (open(c, r + 1) && open(c - 1, r) && open(c - 1, r + 1)) cut(x, y + t, 1, -1);
          if (open(c, r + 1) && open(c + 1, r) && open(c + 1, r + 1)) cut(x + t, y + t, -1, -1);
          cx.restore();
        } else {
          this._drawTile(cx, id, x, y, t, c, r);
        }
      }
      return cv;
    }

    /** Per-region stone patterns, baked once (world-aligned so they tile). */
    _pattern(cx, theme, x, y, t, c, r, h, deep) {
      cx.save();
      cx.beginPath(); cx.rect(x, y, t, t); cx.clip();
      switch (theme) {
        case "cave": {                        // layered strata with a crystal glint
          cx.fillStyle = "rgba(0,0,0,0.16)";
          const o = (r * 11) % 7;
          cx.fillRect(x, y + 8 + o, t, 2); cx.fillRect(x, y + 20 + (o >> 1), t, 1);
          if (h % 17 === 0) { cx.fillStyle = "rgba(110,240,208,0.45)"; cx.beginPath(); cx.moveTo(x + 12, y + 20); cx.lineTo(x + 15, y + 12); cx.lineTo(x + 18, y + 20); cx.fill(); }
          break;
        }
        case "ruins": {                       // sunken brickwork, mossy mortar
          cx.fillStyle = "rgba(0,0,0,0.22)";
          for (let k = 0; k < 2; k++) {
            const by = y + k * 16; cx.fillRect(x, by + 15, t, 1);
            const off = ((r * 2 + k) % 2) * 16; cx.fillRect(x + off, by, 1, 16);
          }
          if (h % 7 === 0) { cx.fillStyle = "rgba(106,168,138,0.35)"; cx.fillRect(x + (h % 20), y + 15, 10, 2); }
          break;
        }
        case "forest": {                      // packed earth threaded with roots
          cx.strokeStyle = "rgba(120,80,40,0.35)"; cx.lineWidth = 2;
          if (h % 3 !== 0) { cx.beginPath(); cx.moveTo(x, y + 10 + (h % 12)); cx.quadraticCurveTo(x + 16, y + (h % 20), x + t, y + 14 + (h % 10)); cx.stroke(); }
          cx.fillStyle = "rgba(0,0,0,0.18)";
          cx.beginPath(); cx.arc(x + (h % 24) + 4, y + ((h >> 4) % 20) + 6, 2.5, 0, 6.28); cx.fill();
          break;
        }
        case "factory": {                     // riveted steel plates
          cx.fillStyle = "rgba(255,255,255,0.06)"; cx.fillRect(x + 1, y + 1, t - 2, 1); cx.fillRect(x + 1, y + 1, 1, t - 2);
          cx.fillStyle = "rgba(0,0,0,0.3)"; cx.fillRect(x, y + t - 1, t, 1); cx.fillRect(x + t - 1, y, 1, t);
          cx.fillStyle = "rgba(255,200,150,0.28)";
          for (const [a, b] of [[4, 4], [t - 6, 4], [4, t - 6], [t - 6, t - 6]]) cx.fillRect(x + a, y + b, 2, 2);
          if (h % 11 === 0) { cx.fillStyle = "rgba(255,154,77,0.18)"; cx.fillRect(x + 6, y + 14, t - 12, 3); }
          break;
        }
        case "ice": {                         // glassy sheen streaks
          cx.strokeStyle = "rgba(255,255,255,0.14)"; cx.lineWidth = 2;
          cx.beginPath(); cx.moveTo(x + (h % 16), y + t); cx.lineTo(x + (h % 16) + 14, y); cx.stroke();
          if (h % 2) { cx.lineWidth = 1; cx.beginPath(); cx.moveTo(x + (h % 16) + 8, y + t); cx.lineTo(x + (h % 16) + 20, y); cx.stroke(); }
          break;
        }
        case "temple": {                      // big dressed blocks with carved glyphs
          cx.fillStyle = "rgba(0,0,0,0.2)"; cx.fillRect(x, y + t - 2, t, 2); cx.fillRect(x + ((r % 2) ? 0 : t / 2), y, 2, t);
          cx.fillStyle = "rgba(255,230,160,0.08)"; cx.fillRect(x, y, t, 2);
          if (h % 13 === 0 && !deep) { cx.strokeStyle = "rgba(255,207,77,0.35)"; cx.lineWidth = 1.5; cx.strokeRect(x + 10, y + 10, 12, 12); cx.beginPath(); cx.moveTo(x + 16, y + 10); cx.lineTo(x + 16, y + 22); cx.stroke(); }
          break;
        }
        case "city": {                        // pale marble with soft veins
          cx.strokeStyle = "rgba(255,255,255,0.12)"; cx.lineWidth = 1;
          cx.beginPath(); cx.moveTo(x, y + (h % 30)); cx.bezierCurveTo(x + 10, y + (h % 12), x + 20, y + 26, x + t, y + ((h >> 3) % 30)); cx.stroke();
          cx.fillStyle = "rgba(0,0,0,0.12)"; cx.fillRect(x, y + t - 1, t, 1); cx.fillRect(x + t - 1, y, 1, t);
          break;
        }
        case "heart": {                       // living rock with glowing veins
          cx.strokeStyle = "rgba(199,155,255,0.30)"; cx.lineWidth = 1.5;
          if (h % 2 === 0) { cx.beginPath(); cx.moveTo(x, y + (h % 28) + 2); cx.quadraticCurveTo(x + 16, y + ((h >> 2) % 32), x + t, y + ((h >> 5) % 28) + 2); cx.stroke(); }
          break;
        }
      }
      cx.restore();
    }

    /** What sits on an exposed top: snow caps, gold trim, moss… */
    _cap(cx, theme, x, y, t, h) {
      if (theme === "ice") {
        cx.fillStyle = "#f4fbff";
        cx.beginPath(); cx.moveTo(x, y + 4);
        for (let k = 0; k <= 4; k++) cx.quadraticCurveTo(x + k * 8 - 4, y - 3 - ((h >> k) % 3), x + k * 8, y + 3);
        cx.lineTo(x + t, y + 5); cx.lineTo(x, y + 5); cx.fill();
      } else if (theme === "temple") {
        cx.fillStyle = "#ffcf4d"; cx.fillRect(x, y + 5, t, 1);
        cx.fillStyle = "rgba(255,207,77,0.5)"; cx.fillRect(x, y + 7, t, 1);
      } else if (theme === "ruins" && h % 3 === 0) {
        cx.fillStyle = "rgba(90,160,120,0.8)"; cx.fillRect(x + (h % 12), y + 3, 12, 3 + (h % 3));
      } else if (theme === "factory") {
        cx.fillStyle = "rgba(0,0,0,0.35)";
        for (let k = 0; k < 4; k++) cx.fillRect(x + k * 8 + 2, y + 1, 4, 1);    // tread plate
      } else if (theme === "heart" && h % 4 === 0) {
        cx.fillStyle = "rgba(224,200,255,0.8)"; cx.beginPath(); cx.arc(x + (h % 24) + 4, y + 1, 2, 0, 6.28); cx.fill();
      }
    }

    render(ctx, cam) {
      const t = this.tile;
      if (this.style) {
        if (!this._cache || this._cacheBroken !== this._broken.size) {
          this._cache = this._bake(); this._cacheBroken = this._broken.size;
        }
        if (this._cache) {
          const vx = Math.max(0, Math.floor(cam.x)), vy = Math.max(0, Math.floor(cam.y));
          const vw = Math.min(this.w - vx, Math.ceil(cam.viewW / cam.zoom) + 2);
          const vh = Math.min(this.h - vy, Math.ceil(cam.viewH / cam.zoom) + 2);
          if (vw > 0 && vh > 0) ctx.drawImage(this._cache, vx, vy, vw, vh, vx, vy, vw, vh);
          // animated conveyors on top
          const c0 = Math.max(0, Math.floor(cam.x / t)), c1 = Math.min(this.cols - 1, Math.floor((cam.x + cam.viewW / cam.zoom) / t) + 1);
          const r0 = Math.max(0, Math.floor(cam.y / t)), r1 = Math.min(this.rows - 1, Math.floor((cam.y + cam.viewH / cam.zoom) / t) + 1);
          if (this._hasConveyor !== false) {
            let any = false;
            for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
              const id = this.at(c, r);
              if (id === 4 || id === 5) { any = true; this._drawTile(ctx, id, c * t, r * t, t, c, r); }
            }
            if (!any && r0 === 0 && c0 === 0) this._hasConveyor = undefined;
          }
          return;
        }
      }
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
