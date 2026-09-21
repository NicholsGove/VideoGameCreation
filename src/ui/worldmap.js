/* =========================================================================
 * worldmap.js — the discovery map (full screen) and the corner minimap
 * -------------------------------------------------------------------------
 * Like Ori's map, it only shows what the heroes have explored: every cell
 * (screen) lights up in its region's colour the first time a hero sets foot
 * in it. Rooms glimpsed through a known doorway show as faint outlines;
 * sealed gates show the glyph of the power they need; shrines glow until
 * claimed. The headline number is the DISCOVERY PERCENTAGE — reach 100%
 * and the journey ends.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, C = GG.C;

  function roomRect(r, cs, ox, oy) { return { x: ox + r.x * cs, y: oy + r.y * cs, w: r.w * cs, h: r.h * cs }; }

  const map = {
    /** Heroes' fractional cell positions inside the current room. */
    _heroCells(level, room) {
      const WG = GG.WORLDGEN, T = C.TILE;
      return level.players.map(p => ({
        x: room.x + p.cx / (WG.CW * T), y: room.y + p.cy / (WG.CH * T),
        color: p.character.body, dead: p.dead,
      }));
    },

    /** Which rooms are known: explored (any cell) or seen through a doorway. */
    _knowledge(world, state) {
      const explored = new Set(), sensed = new Set();
      for (const c of world.cells) if (state.disc[c.key]) explored.add(c.room);
      for (const id of explored) for (const d of world.rooms[id].doors) if (!explored.has(d.to)) sensed.add(d.to);
      return { explored, sensed };
    },

    /**
     * Draw the map into a rect. opts: { full, focusRoom, level, t }
     */
    draw(ctx, rect, opts) {
      const run = GG.world, world = run.world, state = run.state;
      if (!state) return;
      const WG = GG.WORLDGEN;
      const { explored, sensed } = this._knowledge(world, state);
      const cur = world.rooms[state.room];
      const t = opts.t || 0;
      // extent of what's known (full map) or a window around the party (mini)
      let cs, ox, oy;
      if (opts.full) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const r of world.rooms) {
          if (!explored.has(r.id) && !sensed.has(r.id) && !(state.reveal && state.reveal[r.region])) continue;
          x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
        }
        if (x0 > x1) { x0 = cur.x; y0 = cur.y; x1 = cur.x + cur.w; y1 = cur.y + cur.h; }
        x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
        cs = Math.min(rect.w / (x1 - x0), rect.h / (y1 - y0), 34);
        ox = rect.x + (rect.w - (x1 - x0) * cs) / 2 - x0 * cs;
        oy = rect.y + (rect.h - (y1 - y0) * cs) / 2 - y0 * cs;
      } else {
        cs = opts.cell || 11;
        const hc = opts.level ? this._heroCells(opts.level, cur) : [{ x: cur.x + cur.w / 2, y: cur.y + cur.h / 2 }];
        const fx = hc.reduce((a, h) => a + h.x, 0) / hc.length, fy = hc.reduce((a, h) => a + h.y, 0) / hc.length;
        ox = rect.x + rect.w / 2 - fx * cs; oy = rect.y + rect.h / 2 - fy * cs;
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
      // regions whose map was bought from the merchant: every room outlined
      const rev = state.reveal || {};
      ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      for (const r of world.rooms) {
        if (!rev[r.region] || explored.has(r.id)) continue;
        const rr = roomRect(r, cs, ox, oy), reg = WG.REGIONS[r.region];
        ctx.fillStyle = "rgba(20,16,36,0.5)"; ctx.fillRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
        ctx.strokeStyle = reg.color; ctx.globalAlpha = 0.55; ctx.strokeRect(rr.x + 1.5, rr.y + 1.5, rr.w - 3, rr.h - 3); ctx.globalAlpha = 1;
        if (r.kind === "shrine") { ctx.fillStyle = WG.POWERS[r.power].tint; ctx.font = `${Math.max(8, cs * 0.5)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(WG.POWERS[r.power].glyph, rr.x + rr.w / 2, rr.y + rr.h / 2 + 1); }
      }
      // sensed rooms: faint dashed outline
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      for (const id of sensed) {
        const r = world.rooms[id], rr = roomRect(r, cs, ox, oy);
        ctx.strokeStyle = "rgba(200,190,230,0.35)"; ctx.strokeRect(rr.x + 1.5, rr.y + 1.5, rr.w - 3, rr.h - 3);
      }
      ctx.setLineDash([]);
      // explored rooms: cell by cell
      for (const id of explored) {
        const r = world.rooms[id], reg = WG.REGIONS[r.region];
        const rr = roomRect(r, cs, ox, oy);
        ctx.fillStyle = "rgba(10,8,20,0.75)"; ctx.fillRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
        for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
          const k = (r.x + i) + "," + (r.y + j);
          const x = ox + (r.x + i) * cs, y = oy + (r.y + j) * cs;
          if (state.disc[k]) { ctx.fillStyle = reg.color; ctx.globalAlpha = 0.55; ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4); ctx.globalAlpha = 1; }
          else { ctx.fillStyle = "rgba(120,110,150,0.18)"; ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4); }
        }
        ctx.strokeStyle = r.id === cur.id ? "#fff" : reg.color;
        ctx.lineWidth = r.id === cur.id ? 2 : 1.2;
        if (r.id === cur.id) { ctx.globalAlpha = 0.7 + Math.sin(t * 5) * 0.3; }
        ctx.strokeRect(rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2);
        ctx.globalAlpha = 1;
        // shrine glyph
        if (r.kind === "shrine") {
          const P = WG.POWERS[r.power];
          const got = run.hasPower(r.power);
          ctx.fillStyle = got ? "rgba(255,255,255,0.45)" : P.tint;
          ctx.font = `${Math.max(8, cs * 0.55)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          if (!got) { ctx.shadowBlur = 8; ctx.shadowColor = P.tint; }
          ctx.fillText(got ? "✓" : P.glyph, rr.x + rr.w / 2, rr.y + rr.h / 2 + 1);
          ctx.shadowBlur = 0;
        }
      }
      // doorways between known rooms (with the glyph of a power still needed)
      for (const id of explored) {
        const r = world.rooms[id];
        for (const d of r.doors) {
          const x = ox + (r.x + d.lx) * cs, y = oy + (r.y + d.ly) * cs;
          let px, py;
          if (d.side === "L") { px = x; py = y + cs * 0.75; } else if (d.side === "R") { px = x + cs; py = y + cs * 0.75; }
          else if (d.side === "U") { px = x + cs / 2; py = y; } else { px = x + cs / 2; py = y + cs; }
          const sealed = d.lock && !run.hasPower(d.lock);
          if (sealed) {
            const P = WG.POWERS[d.lock];
            ctx.fillStyle = "rgba(10,8,20,0.9)"; ctx.beginPath(); ctx.arc(px, py, Math.max(4, cs * 0.28), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = P.tint; ctx.font = `${Math.max(7, cs * 0.34)}px Georgia, serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(P.glyph, px, py + 0.5);
          } else {
            ctx.fillStyle = "#f6ecd2";
            const s = Math.max(2, cs * 0.14);
            ctx.fillRect(px - s, py - s, s * 2, s * 2);
          }
        }
      }
      // pins the players dropped
      for (const k of state.pins || []) {
        const [px, py] = k.split(",").map(Number);
        const x = ox + (px + 0.5) * cs, y = oy + (py + 0.5) * cs, r = Math.max(3, cs * 0.18);
        ctx.fillStyle = "#ff6b8a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y - r, r, Math.PI, 0); ctx.lineTo(x, y + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (opts.cursor) {
        const c = opts.cursor, x = ox + c.x * cs, y = oy + c.y * cs;
        ctx.strokeStyle = "#ffe79a"; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.4;
        ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2); ctx.globalAlpha = 1;
      }
      // the heroes
      if (opts.level) {
        for (const h of this._heroCells(opts.level, cur)) {
          ctx.fillStyle = h.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(ox + h.x * cs, oy + h.y * cs, Math.max(2.5, cs * 0.16), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
      return { cs, ox, oy };
    },

    /** Full-screen map overlay (design space 960x540). */
    drawFull(ctx, level, t, cursor) {
      const run = GG.world; if (!run.state) return;
      const WG = GG.WORLDGEN, W = C.VIEW_W, H = C.VIEW_H;
      ctx.save();
      ctx.fillStyle = "rgba(6,5,14,0.92)"; ctx.fillRect(0, 0, W, H);
      // parchment frame
      ctx.strokeStyle = "rgba(216,154,46,0.8)"; ctx.lineWidth = 2; ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.strokeStyle = "rgba(216,154,46,0.3)"; ctx.strokeRect(20, 20, W - 40, H - 40);
      // headline
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f2c14e"; ctx.font = "700 20px 'Cinzel', Georgia, serif";
      ctx.fillText("WORLD MAP", W / 2, 44);
      const pct = run.percent;
      ctx.fillStyle = "#f6ecd2"; ctx.font = "700 15px 'Cinzel', Georgia, serif";
      ctx.fillText(`${pct.toFixed(1)}% discovered  ·  ${run.discovered} / ${run.world.totalCells} areas`, W / 2, 66);
      // progress bar
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(W / 2 - 160, 74, 320, 5);
      const g = ctx.createLinearGradient(W / 2 - 160, 0, W / 2 + 160, 0);
      g.addColorStop(0, "#6ef0a0"); g.addColorStop(1, "#4fc3ff");
      ctx.fillStyle = g; ctx.fillRect(W / 2 - 160, 74, 320 * pct / 100, 5);
      this.draw(ctx, { x: 30, y: 88, w: W - 240, h: H - 118 }, { full: true, level, t, cursor });
      // legend: powers + regions
      const lx = W - 196;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f2c14e"; ctx.font = "700 12px 'Cinzel', Georgia, serif";
      ctx.fillText("POWERS", lx, 104);
      WG.POWER_ORDER.forEach((p, i) => {
        const P = WG.POWERS[p], got = run.hasPower(p);
        const y = 122 + i * 19;
        ctx.fillStyle = got ? P.tint : "rgba(200,190,230,0.3)";
        ctx.font = "13px Georgia, serif"; ctx.fillText(P.glyph, lx, y);
        ctx.font = "11px Georgia, serif"; ctx.fillStyle = got ? "#f6ecd2" : "rgba(200,190,230,0.35)";
        ctx.fillText(got ? P.name : "? ? ?", lx + 20, y);
      });
      ctx.fillStyle = "#f2c14e"; ctx.font = "700 12px 'Cinzel', Georgia, serif";
      ctx.fillText("REGIONS", lx, 290);
      const known = new Set();
      for (const c of run.world.cells) if (run.state.disc[c.key]) known.add(run.world.rooms[c.room].region);
      // secrets still hidden per region (gems and upgrades)
      if (!this._sec || this._secKey !== run.state.gems + "|" + Object.keys(run.state.upgrades || {}).length) {
        try { this._sec = run.secrets(); } catch (_) { this._sec = null; }
        this._secKey = run.state.gems + "|" + Object.keys(run.state.upgrades || {}).length;
      }
      WG.REGIONS.forEach((r, i) => {
        const y = 308 + i * 24;
        ctx.fillStyle = known.has(i) ? r.color : "rgba(200,190,230,0.25)";
        ctx.fillRect(lx, y - 8, 10, 10);
        ctx.font = "11px Georgia, serif"; ctx.fillStyle = known.has(i) ? "#f6ecd2" : "rgba(200,190,230,0.3)";
        ctx.fillText(known.has(i) ? r.name : "Undiscovered", lx + 16, y + 1);
        const sc = this._sec && this._sec[i];
        if (sc && known.has(i)) {
          const left = (sc.gemsT - sc.gems) + (sc.upT - sc.up);
          ctx.font = "9px Georgia, serif"; ctx.fillStyle = left ? "#cdb488" : "#6ef0a0";
          ctx.fillText(left ? `◆ ${sc.gems}/${sc.gemsT}  ♥⚡ ${sc.up}/${sc.upT}` : "✓ every secret found", lx + 16, y + 12);
        }
      });
      ctx.fillStyle = "rgba(246,236,210,0.6)"; ctx.font = "10px Georgia, serif"; ctx.textAlign = "center";
      ctx.fillText("M / Tab: close   ·   WASD / arrows: move cursor   ·   P / Enter: drop or lift a pin   ·   glyphs mark gates that need a power", W / 2, H - 22);
      ctx.restore();
    },

    /** Corner minimap with the discovery %. */
    drawMini(ctx, level, t) {
      const run = GG.world; if (!run.state) return;
      const W = C.VIEW_W, H = C.VIEW_H;
      const r = { x: W - 150, y: 64, w: 138, h: 80 };
      ctx.save();
      ctx.fillStyle = "rgba(8,6,16,0.72)"; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 22);
      ctx.strokeStyle = "rgba(216,154,46,0.7)"; ctx.lineWidth = 1; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 22);
      this.draw(ctx, r, { full: false, level, t, cell: 12 });
      ctx.fillStyle = "#f6ecd2"; ctx.font = "700 10px 'Cinzel', Georgia, serif"; ctx.textAlign = "left";
      ctx.fillText(`${run.percent.toFixed(1)}%`, r.x + 3, r.y + r.h + 14);
      ctx.textAlign = "right"; ctx.fillStyle = "rgba(246,236,210,0.55)"; ctx.font = "9px Georgia, serif";
      ctx.fillText("M · map", r.x + r.w, r.y + r.h + 14);
      ctx.restore();
    },
  };

  GG.worldmap = map;
})(window);
