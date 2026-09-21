/* =========================================================================
 * decor.js — the living look of each region
 * -------------------------------------------------------------------------
 * Extends Level with everything that makes a room feel like a PLACE rather
 * than a set of blocks:
 *
 *   • flora that reacts to the heroes — grass blades bend away as you run
 *     through them, hanging vines and roots sway when you brush past
 *   • light sources placed in the terrain — cave crystals, temple torches,
 *     ironworks lamps, heart-crystal clusters — that actually light the room
 *   • a FOREGROUND layer that slides past in front of the camera (leaves,
 *     chains, rock teeth, banners, clouds…) for real depth
 *   • a giant LANDMARK per region, far in the background and placed in world
 *     space, so from anywhere in a region you can see where its heart is
 *   • each region's signature light: cold crystal glow, rippling water light,
 *     sun shafts, furnace glow and embers, blizzard fog, torchlight, open sky,
 *     and the purple heartbeat of the Heart of Aether
 *   • DARK caves where the heroes' lights merge and grow when they stay close
 *
 * Only open-world rooms (data.roomId set) use this; classic levels are
 * untouched.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;
  const T = C.TILE;
  const P = GG.Level.prototype;

  // What grows / hangs / glows in each biome.
  const FLORA = {
    cave:    { grass: ["#3f7a6a", "#5fb3a0"], grassH: [4, 8],  grassP: 0.35, hang: "roots", hangC: "#2a3a4a", hangP: 0.10, light: "crystal", lightP: 0.05, lightC: "#6ef0d0" },
    ruins:   { grass: ["#4f8a6a", "#6aa88a"], grassH: [5, 10], grassP: 0.55, hang: "vine",  hangC: "#3f7a58", hangP: 0.22, light: "shaft",   lightP: 0,    lightC: "#9fe8ff" },
    forest:  { grass: ["#4f9a34", "#7cc44a", "#9ad45a"], grassH: [7, 14], grassP: 0.9, hang: "vine", hangC: "#3d7a2a", hangP: 0.3, light: "flower", lightP: 0.05, lightC: "#ffe79a" },
    factory: { grass: null, hang: "chain", hangC: "#5a4f60", hangP: 0.08, light: "lamp", lightP: 0.04, lightC: "#ffb066" },
    ice:     { grass: null, hang: "icicle", hangC: "#dff4ff", hangP: 0.45, light: "crystal", lightP: 0.02, lightC: "#bfe8ff" },
    temple:  { grass: ["#9a8a4a", "#c8b060"], grassH: [3, 6], grassP: 0.2, hang: "banner", hangC: "#8a2a3a", hangP: 0.04, light: "torch", lightP: 0.035, lightC: "#ffb454" },
    city:    { grass: ["#6ab86a", "#8fd08a", "#b0e8a0"], grassH: [5, 11], grassP: 0.75, hang: "vine", hangC: "#6aa86a", hangP: 0.12, light: "flower", lightP: 0.03, lightC: "#fff1a8" },
    heart:   { grass: ["#9a6ae0", "#c79bff", "#e0c8ff"], grassH: [4, 10], grassP: 0.5, hang: "vine", hangC: "#7a4ac0", hangP: 0.2, light: "crystal", lightP: 0.06, lightC: "#d6a8ff" },
  };

  /** Scan the tile map once and plant flora, hangers and lights. */
  P.buildDecor = function () {
    const tm = this.tilemap, theme = this.theme;
    const F = FLORA[theme] || FLORA.cave;
    const blendF = this.data.blend && FLORA[this.data.blend];
    let seed = ((this.id || 1) * 2246822519) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.flora = []; this.hangers = []; this.lights = [];
    const open = (c, r) => { const id = tm.at(c, r); return id === 0; };
    for (let r = 1; r < tm.rows - 1; r++) for (let c = 1; c < tm.cols - 1; c++) {
      if (!tm.isSolid(c, r)) continue;
      // near a region border, some of the neighbour's plants creep in
      const f = blendF && rnd() < 0.3 ? blendF : F;
      if (open(c, r - 1)) {                            // an exposed top surface
        if (f.grass && rnd() < f.grassP) {
          const n = 2 + ((rnd() * 4) | 0);
          for (let k = 0; k < n; k++) this.flora.push({
            x: c * T + 3 + rnd() * (T - 6), y: r * T,
            h: f.grassH[0] + rnd() * (f.grassH[1] - f.grassH[0]),
            col: f.grass[(rnd() * f.grass.length) | 0], ph: rnd() * 6.28, bend: 0,
          });
        }
        if (rnd() < f.lightP && open(c, r - 2)) this.lights.push({ kind: f.light, x: c * T + T / 2, y: r * T, col: f.lightC, ph: rnd() * 6.28, s: 0.7 + rnd() * 0.6 });
      }
      if (open(c, r + 1) && open(c, r + 2) && rnd() < f.hangP) {   // an exposed underside
        this.hangers.push({ kind: f.hang, x: c * T + 4 + rnd() * (T - 8), y: (r + 1) * T, len: f.hang === "icicle" ? 8 + rnd() * 14 : 18 + rnd() * 46, col: f.hangC, ph: rnd() * 6.28, sw: 0, swv: 0 });
      }
      // wall torches / lamps on exposed sides
      if ((f.light === "torch" || f.light === "lamp") && (open(c + 1, r) || open(c - 1, r)) && open(c, r - 1) === false && rnd() < f.lightP * 0.6) {
        const side = open(c + 1, r) ? 1 : -1;
        this.lights.push({ kind: f.light, x: c * T + T / 2 + side * (T / 2 + 4), y: r * T + T / 2, col: f.lightC, ph: rnd() * 6.28, s: 1, wall: true });
      }
    }
    this._buildForeground(rnd);
  };

  /** Grass bends away from heroes; vines swing when brushed. */
  P.renderFlora = function (ctx, cam) {
    if (!this.flora) return;
    const t = (this.timeMs || 0) / 1000;
    const x0 = cam.x - 40, x1 = cam.x + cam.viewW / cam.zoom + 40, y0 = cam.y - 80, y1 = cam.y + cam.viewH / cam.zoom + 80;
    const heroes = this.players.filter(p => !p.dead);
    // lights first (they sit behind grass)
    for (const L of this.lights) {
      if (L.x < x0 || L.x > x1 || L.y < y0 || L.y > y1) continue;
      drawLight(ctx, L, t);
    }
    ctx.save();
    ctx.lineCap = "round";
    for (const b of this.flora) {
      if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
      let push = 0;
      for (const p of heroes) {
        const dx = b.x - p.cx, dy = b.y - (p.y + p.h);
        if (Math.abs(dx) < 34 && dy > -6 && dy < 30) push += Math.sign(dx || 1) * (1 - Math.abs(dx) / 34) * (0.9 + Math.min(1, Math.abs(p.vx) / 200) * 0.6);
      }
      b.bend = U.lerp(b.bend, U.clamp(push, -1.3, 1.3), 0.2);
      const sway = Math.sin(t * 1.6 + b.ph) * 0.12 + b.bend * 0.9;
      ctx.strokeStyle = b.col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo(b.x + sway * b.h * 0.3, b.y - b.h * 0.6, b.x + Math.sin(sway) * b.h, b.y - Math.cos(sway) * b.h);
      ctx.stroke();
    }
    // hanging vines / roots / chains / icicles / banners
    for (const h of this.hangers) {
      if (h.x < x0 || h.x > x1 || h.y < y0 || h.y > y1) continue;
      if (h.kind !== "icicle") {
        for (const p of heroes) {
          if (Math.abs(p.cx - h.x) < 18 && p.y < h.y + h.len && p.y + p.h > h.y) h.swv += (p.vx || 0) * 0.0006 + (p.cx < h.x ? 0.02 : -0.02);
        }
        h.swv += (-h.sw * 6 - h.swv * 1.8) * (1 / 60) + Math.sin(t * 0.8 + h.ph) * 0.0008;
        h.sw = U.clamp(h.sw + h.swv, -0.8, 0.8);
      }
      drawHanger(ctx, h, t);
    }
    ctx.restore();
  };

  function drawLight(ctx, L, t) {
    const fl = 0.85 + Math.sin(t * 9 + L.ph) * 0.08 + Math.sin(t * 23 + L.ph * 2) * 0.05;
    ctx.save();
    if (L.kind === "crystal") {
      ctx.fillStyle = L.col; ctx.shadowBlur = 12; ctx.shadowColor = L.col; ctx.globalAlpha = 0.9;
      const s = 6 * L.s;
      for (const [dx, h, w] of [[-4, 1.6, 0.8], [0, 2.4, 1], [4, 1.3, 0.7]]) {
        ctx.beginPath(); ctx.moveTo(L.x + dx * L.s - s * w * 0.5, L.y); ctx.lineTo(L.x + dx * L.s, L.y - s * h * 1.6); ctx.lineTo(L.x + dx * L.s + s * w * 0.5, L.y); ctx.fill();
      }
    } else if (L.kind === "torch") {
      ctx.fillStyle = "#4a3a28"; ctx.fillRect(L.x - 2, L.y - (L.wall ? 4 : 16), 4, L.wall ? 12 : 16);
      const fy = L.y - (L.wall ? 8 : 20);
      ctx.fillStyle = "#ffcf4d"; ctx.shadowBlur = 16; ctx.shadowColor = "#ff9a3a";
      ctx.beginPath(); ctx.ellipse(L.x, fy, 3.5 * fl, 7 * fl, Math.sin(t * 7 + L.ph) * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff4c8"; ctx.beginPath(); ctx.ellipse(L.x, fy + 2, 1.5, 3, 0, 0, Math.PI * 2); ctx.fill();
    } else if (L.kind === "lamp") {
      ctx.fillStyle = "#3a3240"; ctx.fillRect(L.x - 5, L.y - 7, 10, 12);
      ctx.fillStyle = "#ffb066"; ctx.shadowBlur = 14; ctx.shadowColor = "#ff9a4d"; ctx.globalAlpha = fl;
      ctx.fillRect(L.x - 3, L.y - 5, 6, 8);
    } else if (L.kind === "flower") {
      ctx.strokeStyle = "#4f9a34"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.lineTo(L.x, L.y - 10); ctx.stroke();
      ctx.fillStyle = L.col; ctx.shadowBlur = 10; ctx.shadowColor = L.col;
      for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + t * 0.3; ctx.beginPath(); ctx.arc(L.x + Math.cos(a) * 3, L.y - 11 + Math.sin(a) * 3, 2, 0, 6.28); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawHanger(ctx, h, t) {
    const ex = h.x + Math.sin(h.sw) * h.len, ey = h.y + Math.cos(h.sw) * h.len;
    if (h.kind === "icicle") {
      ctx.fillStyle = "rgba(223,244,255,0.85)";
      ctx.beginPath(); ctx.moveTo(h.x - 3, h.y); ctx.lineTo(h.x, h.y + h.len); ctx.lineTo(h.x + 3, h.y); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(h.x - 1, h.y, 1, h.len * 0.5);
      return;
    }
    if (h.kind === "chain") {
      ctx.strokeStyle = h.col; ctx.lineWidth = 2;
      const n = Math.max(2, (h.len / 6) | 0);
      for (let i = 0; i < n; i++) { const k = i / n; ctx.strokeRect(h.x + (ex - h.x) * k - 2, h.y + (ey - h.y) * k, 4, 5); }
      return;
    }
    if (h.kind === "banner") {
      ctx.fillStyle = h.col;
      ctx.beginPath(); ctx.moveTo(h.x - 8, h.y); ctx.lineTo(h.x + 8, h.y);
      ctx.lineTo(ex + 8, ey); ctx.lineTo(ex, ey - 6); ctx.lineTo(ex - 8, ey); ctx.fill();
      ctx.fillStyle = "#e2b659"; ctx.fillRect(h.x - 8, h.y, 16, 3);
      return;
    }
    // vines and roots: a sagging curve with leaves
    ctx.strokeStyle = h.col; ctx.lineWidth = h.kind === "roots" ? 2.2 : 1.8;
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    ctx.quadraticCurveTo(h.x + Math.sin(h.sw * 0.5) * h.len * 0.3, h.y + h.len * 0.55, ex, ey); ctx.stroke();
    if (h.kind === "vine") {
      ctx.fillStyle = h.col;
      for (let k = 0.25; k < 1; k += 0.25) {
        const lx = h.x + (ex - h.x) * k, ly = h.y + (ey - h.y) * k;
        ctx.beginPath(); ctx.ellipse(lx + (k * 10 % 2 ? 3 : -3), ly, 3, 1.6, 0.6, 0, 6.28); ctx.fill();
      }
    }
  }

  /* ---- foreground: silhouettes that slide past in front of the camera --- */
  const FG = {
    cave:    { kind: "teeth",  col: "rgba(6,8,16,0.92)" },
    ruins:   { kind: "column", col: "rgba(8,20,24,0.9)" },
    forest:  { kind: "leaves", col: "rgba(10,32,16,0.9)" },
    factory: { kind: "chains", col: "rgba(14,10,18,0.92)" },
    ice:     { kind: "drift",  col: "rgba(230,244,255,0.55)" },
    temple:  { kind: "banner", col: "rgba(40,14,22,0.9)" },
    city:    { kind: "cloud",  col: "rgba(250,252,255,0.55)" },
    heart:   { kind: "shard",  col: "rgba(24,10,40,0.9)" },
  };
  P._buildForeground = function (rnd) {
    const W = this.tilemap.w * 1.35 + 600;
    const n = Math.max(4, Math.round(W / 320));
    this._fg = [];
    for (let i = 0; i < n; i++) {
      this._fg.push({ x: (i + rnd() * 0.7) * (W / n) - 200, top: rnd() < 0.5, s: 0.7 + rnd() * 0.8, ph: rnd() * 6.28 });
    }
  };
  P.renderForeground = function (ctx, cam) {
    if (!this._fg || !this.data || this.data.roomId == null) return;
    const F = FG[this.theme] || FG.cave, t = (this.timeMs || 0) / 1000;
    const vw = cam.viewW, vh = cam.viewH, par = 1.35;
    ctx.save();
    ctx.fillStyle = F.col; ctx.strokeStyle = F.col;
    for (const e of this._fg) {
      const sx = e.x - cam.x * par, s = e.s;
      if (sx < -220 || sx > vw + 220) continue;
      const y = e.top ? 0 : vh;
      const dir = e.top ? 1 : -1;
      switch (F.kind) {
        case "teeth": {
          ctx.beginPath(); ctx.moveTo(sx - 70 * s, y);
          for (let k = 0; k <= 4; k++) { ctx.lineTo(sx - 70 * s + k * 35 * s + 17 * s, y + dir * (30 + (k % 2) * 34) * s); ctx.lineTo(sx - 70 * s + (k + 1) * 35 * s, y); }
          ctx.fill(); break;
        }
        case "column":
          ctx.fillRect(sx - 20 * s, e.top ? 0 : vh - 220 * s, 40 * s, 220 * s);
          ctx.fillRect(sx - 30 * s, e.top ? 220 * s - 14 : vh - 220 * s, 60 * s, 14); break;
        case "leaves": {
          for (let k = 0; k < 7; k++) {
            const a = k / 7 * Math.PI + Math.sin(t * 0.9 + e.ph + k) * 0.08;
            ctx.beginPath(); ctx.ellipse(sx + Math.cos(a) * 60 * s, y + dir * Math.sin(a) * 40 * s, 38 * s, 14 * s, a, 0, 6.28); ctx.fill();
          }
          break;
        }
        case "chains": {
          ctx.lineWidth = 6 * s;
          const sw = Math.sin(t * 0.7 + e.ph) * 10;
          for (let k = 0; k < 14; k++) ctx.strokeRect(sx + sw * k / 14 - 6 * s, (e.top ? 0 : vh - 280 * s) + k * 20 * s, 12 * s, 16 * s);
          break;
        }
        case "drift":
          ctx.beginPath(); ctx.ellipse(sx, y, 150 * s, 44 * s, 0, 0, 6.28); ctx.fill(); break;
        case "banner": {
          if (!e.top) { ctx.fillRect(sx - 18 * s, vh - 160 * s, 36 * s, 160 * s); break; }
          const sw = Math.sin(t * 0.8 + e.ph) * 12 * s;
          ctx.beginPath(); ctx.moveTo(sx - 30 * s, 0); ctx.lineTo(sx + 30 * s, 0); ctx.lineTo(sx + 30 * s + sw, 170 * s); ctx.lineTo(sx + sw, 140 * s); ctx.lineTo(sx - 30 * s + sw, 170 * s); ctx.fill();
          break;
        }
        case "cloud": {
          const dx = (t * 12 * s) % 400;
          for (const [ox, oy, r] of [[-60, 0, 50], [0, -12, 64], [60, 0, 48], [20, 16, 50]]) { ctx.beginPath(); ctx.arc(sx + ox * s + dx, y + dir * (10 + oy) * s, r * s, 0, 6.28); ctx.fill(); }
          break;
        }
        case "shard": {
          ctx.beginPath(); ctx.moveTo(sx - 30 * s, y); ctx.lineTo(sx, y + dir * 150 * s); ctx.lineTo(sx + 30 * s, y); ctx.fill();
          ctx.beginPath(); ctx.moveTo(sx + 20 * s, y); ctx.lineTo(sx + 50 * s, y + dir * 90 * s); ctx.lineTo(sx + 70 * s, y); ctx.fill();
          break;
        }
      }
    }
    ctx.restore();
  };

  /* ---- landmarks: one giant silhouette per region, in world space ------ */
  P.renderLandmark = function (ctx, cam) {
    const lm = this.data && this.data.landmark;
    if (!lm) return;
    const d = 0.1, vw = cam.viewW, vh = cam.viewH, t = (this.timeMs || 0) / 1000;
    // where the landmark sits relative to this room, seen through deep parallax
    const sx = vw / 2 + (lm.wx - (lm.ox + cam.x + vw / 2)) * d;
    const base = vh * 0.92 + (lm.wy - (lm.oy + cam.y + vh / 2)) * d * 0.5;
    if (sx < -500 || sx > vw + 500) return;
    ctx.save();
    ctx.fillStyle = lm.col || "rgba(0,0,0,0.35)";
    const S = 1.2;
    switch (lm.kind) {
      case "crystal":                     // the Great Geode
        for (const [ox, h, w] of [[-60, 260, 50], [0, 380, 70], [70, 240, 46], [-120, 150, 36], [120, 170, 40]]) {
          ctx.beginPath(); ctx.moveTo(sx + ox * S - w * S / 2, base); ctx.lineTo(sx + ox * S, base - h * S); ctx.lineTo(sx + ox * S + w * S / 2, base); ctx.fill();
        }
        break;
      case "tower":                       // the broken tower of the ruins
        ctx.fillRect(sx - 45 * S, base - 360 * S, 90 * S, 360 * S);
        ctx.beginPath(); ctx.moveTo(sx - 45 * S, base - 360 * S); ctx.lineTo(sx - 20 * S, base - 420 * S); ctx.lineTo(sx + 10 * S, base - 380 * S); ctx.lineTo(sx + 45 * S, base - 400 * S); ctx.lineTo(sx + 45 * S, base - 360 * S); ctx.fill();
        for (let k = 0; k < 5; k++) ctx.fillRect(sx - 60 * S, base - (70 + k * 70) * S, 120 * S, 8 * S);
        break;
      case "tree":                        // the World Tree
        ctx.fillRect(sx - 30 * S, base - 300 * S, 60 * S, 300 * S);
        for (const [ox, oy, r] of [[0, 330, 150], [-130, 280, 100], [130, 270, 110], [-60, 390, 110], [70, 400, 100]]) { ctx.beginPath(); ctx.arc(sx + ox * S, base - oy * S, r * S, 0, 6.28); ctx.fill(); }
        break;
      case "chimney":                     // the Great Furnace
        ctx.fillRect(sx - 120 * S, base - 150 * S, 240 * S, 150 * S);
        ctx.fillRect(sx - 60 * S, base - 420 * S, 50 * S, 280 * S); ctx.fillRect(sx + 20 * S, base - 360 * S, 40 * S, 220 * S);
        ctx.globalAlpha = 0.35;
        for (let k = 0; k < 5; k++) { const kk = (t * 0.05 + k / 5) % 1; ctx.beginPath(); ctx.arc(sx - 35 * S + kk * 60, base - (430 + kk * 220) * S, (20 + kk * 50) * S, 0, 6.28); ctx.fill(); }
        break;
      case "peak":                        // Frostpeak's summit
        ctx.beginPath(); ctx.moveTo(sx - 360 * S, base); ctx.lineTo(sx - 40 * S, base - 460 * S); ctx.lineTo(sx + 20 * S, base - 420 * S); ctx.lineTo(sx + 380 * S, base); ctx.fill();
        ctx.fillStyle = "rgba(240,248,255,0.25)";
        ctx.beginPath(); ctx.moveTo(sx - 120 * S, base - 350 * S); ctx.lineTo(sx - 40 * S, base - 460 * S); ctx.lineTo(sx + 20 * S, base - 420 * S); ctx.lineTo(sx + 90 * S, base - 340 * S); ctx.fill();
        break;
      case "ziggurat":                    // the Great Temple's crown
        for (let k = 0; k < 6; k++) ctx.fillRect(sx - (220 - k * 34) * S, base - (k + 1) * 60 * S, (440 - k * 68) * S, 62 * S);
        ctx.fillStyle = "rgba(255,210,120,0.25)"; ctx.fillRect(sx - 12 * S, base - 400 * S, 24 * S, 40 * S);
        break;
      case "citadel": {                   // the floating citadel
        const bob = Math.sin(t * 0.4) * 8;
        ctx.beginPath(); ctx.moveTo(sx - 180 * S, base - 280 * S + bob); ctx.lineTo(sx + 180 * S, base - 280 * S + bob); ctx.lineTo(sx, base - 120 * S + bob); ctx.fill();
        for (const [ox, h] of [[-110, 90], [-40, 170], [30, 130], [100, 80]]) ctx.fillRect(sx + ox * S - 16 * S, base - (280 + h) * S + bob, 32 * S, h * S);
        break;
      }
      case "heart": {                     // the Heart itself, beating
        const beat = heartbeat(t);
        ctx.fillStyle = `rgba(199,155,255,${0.18 + beat * 0.2})`;
        ctx.beginPath(); ctx.arc(sx, base - 260 * S, (110 + beat * 12) * S, 0, 6.28); ctx.fill();
        ctx.fillStyle = lm.col;
        ctx.beginPath(); ctx.moveTo(sx, base - 400 * S); ctx.lineTo(sx + 80 * S, base - 260 * S); ctx.lineTo(sx, base - 120 * S); ctx.lineTo(sx - 80 * S, base - 260 * S); ctx.fill();
        break;
      }
    }
    ctx.restore();
  };

  /** A double thump every 1.3s: lub-dub. */
  function heartbeat(t) {
    const k = t % 1.3;
    return Math.max(0, Math.exp(-((k - 0.05) ** 2) / 0.004), 0.7 * Math.exp(-((k - 0.32) ** 2) / 0.004));
  }
  GG.heartbeat = heartbeat;

  /* ---- region light signatures (screen space, over the world) ---------- */
  P.renderAmbience = function (ctx, cam) {
    if (!this.data || this.data.roomId == null) return;
    const vw = cam.viewW, vh = cam.viewH, t = (this.timeMs || 0) / 1000, z = cam.zoom;
    const toS = (wx, wy) => [(wx - cam.x) * z, (wy - cam.y) * z];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = (x, y, r, col, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
    };
    // light sources placed in the terrain
    for (const L of this.lights || []) {
      const [sx, sy] = toS(L.x, L.y - 8);
      if (sx < -120 || sx > vw + 120 || sy < -120 || sy > vh + 120) continue;
      const fl = L.kind === "torch" ? 0.85 + Math.sin(t * 9 + L.ph) * 0.1 + Math.sin(t * 21 + L.ph) * 0.05 : 0.9 + Math.sin(t * 1.5 + L.ph) * 0.1;
      glow(sx, sy, (L.kind === "torch" ? 110 : L.kind === "lamp" ? 90 : 60) * z * fl, L.col, L.kind === "torch" ? 0.32 : 0.22);
    }
    switch (this.theme) {
      case "ruins": {                     // water light rippling across everything
        ctx.globalAlpha = 0.07;
        for (let i = 0; i < 6; i++) {
          ctx.strokeStyle = "#9fe8ff"; ctx.lineWidth = 18;
          ctx.beginPath();
          for (let x = -20; x <= vw + 20; x += 20) ctx.lineTo(x, (i + 0.5) * vh / 6 + Math.sin(x * 0.012 + t * 0.8 + i * 1.7) * 26 + Math.sin(x * 0.031 - t * 1.3) * 8);
          ctx.stroke();
        }
        break;
      }
      case "forest": {                    // warm sun shafts through the canopy
        for (let i = 0; i < 4; i++) {
          const x = ((i * 0.29 + 0.1) * vw - cam.x * 0.15) % (vw + 300);
          const g = ctx.createLinearGradient(x, 0, x + 180, vh);
          g.addColorStop(0, "rgba(255,230,150,0.16)"); g.addColorStop(1, "rgba(255,230,150,0)");
          ctx.globalAlpha = 0.6 + Math.sin(t * 0.5 + i) * 0.2; ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 260, vh); ctx.lineTo(x + 150, vh); ctx.fill();
        }
        break;
      }
      case "factory": {                   // furnace glow from below + drifting embers
        const g = ctx.createLinearGradient(0, vh, 0, vh * 0.4);
        g.addColorStop(0, "rgba(255,120,40,0.18)"); g.addColorStop(1, "rgba(255,120,40,0)");
        ctx.globalAlpha = 0.8 + Math.sin(t * 2) * 0.2; ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 26; i++) {
          const k = (t * (0.08 + (i % 5) * 0.02) + i * 0.137) % 1;
          const x = ((i * 97.3 + Math.sin(t + i) * 30 - cam.x * 0.3) % vw + vw) % vw, y = vh * (1 - k);
          ctx.fillStyle = i % 3 ? "#ffb066" : "#ffd27a"; ctx.fillRect(x, y, 2, 2);
        }
        break;
      }
      case "ice": {                       // blizzard fog bands
        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < 3; i++) {
          const y = vh * (0.3 + i * 0.25) + Math.sin(t * 0.3 + i) * 20;
          const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
          g.addColorStop(0, "rgba(230,242,255,0)"); g.addColorStop(0.5, "rgba(230,242,255,0.12)"); g.addColorStop(1, "rgba(230,242,255,0)");
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, y - 60, vw, 120);
        }
        break;
      }
      case "city": {                      // open, bright sky light from above
        const g = ctx.createLinearGradient(0, 0, 0, vh * 0.6);
        g.addColorStop(0, "rgba(255,255,240,0.14)"); g.addColorStop(1, "rgba(255,255,240,0)");
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
        break;
      }
      case "heart": {                     // the whole room pulses with the heartbeat
        const b = heartbeat(t) * (GG.save && GG.save.settings.graphics.flash === false ? 0.25 : 1);   // gentler with reduced flashing
        ctx.globalCompositeOperation = "source-over";
        const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.3, vw / 2, vh / 2, vh * 0.85);
        g.addColorStop(0, "rgba(120,40,200,0)"); g.addColorStop(1, `rgba(120,40,200,${0.12 + b * 0.18})`);
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
        break;
      }
      case "temple": {                    // incense haze catching the torchlight
        ctx.globalAlpha = 0.05; ctx.fillStyle = "#ffcf8a";
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(((i * 230 - cam.x * 0.2 + t * 8) % (vw + 300)) - 100, vh * (0.2 + (i % 3) * 0.25), 200, 50, 0, 0, 6.28); ctx.fill(); }
        break;
      }
    }
    ctx.restore();
  };

  /**
   * Dark rooms: each hero carries a small light; standing close together
   * the lights MERGE into one bigger, brighter pool (stay together!).
   */
  P.sharedLightRadius = function (p) {
    const other = this.players.find(q => q !== p && !q.dead);
    if (!other) return 120;
    const d = Math.hypot(other.cx - p.cx, other.cy - p.cy);
    return 105 + 95 * U.clamp(1 - (d - 60) / 180, 0, 1);
  };
})(window);
