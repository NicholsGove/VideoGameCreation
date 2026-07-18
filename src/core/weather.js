/* =========================================================================
 * weather.js — ambient atmosphere: weather + fog + drifting particles
 * -------------------------------------------------------------------------
 * A self-contained screen-space effects layer that gives each biome a mood:
 * snow on icy peaks, falling leaves in the jungle, embers in the factory,
 * dust motes in temples, drifting fog and parallax clouds everywhere it fits.
 *
 * Particles live in normalised [0,1] viewport space so they render correctly
 * in split-screen (each half shows the full effect) and at any resolution.
 * Honours the Settings "weather" toggle for performance.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util;

  // biome -> which effects to enable
  const BIOME_WEATHER = {
    Temple:        { motes: 60, fog: 0.10, tint: "#1a2140" },
    "Sunken Ruins":{ motes: 50, fog: 0.22, drips: true, tint: "#10202a" },
    Factory:       { embers: 40, fog: 0.12, tint: "#241a20" },
    "Icy Peaks":   { snow: 130, fog: 0.16, tint: "#20304a" },
    Jungle:        { leaves: 40, rain: 60, fog: 0.14, tint: "#12301c" },
    "Floating City": { clouds: 6, rain: 40, motes: 30, fog: 0.10, tint: "#182448" },
    "Heart Engine":{ embers: 50, motes: 40, fog: 0.20, tint: "#2a1830" },
  };

  class Weather {
    constructor() {
      this.enabledEffects = {};
      this.motes = []; this.snow = []; this.rain = []; this.leaves = [];
      this.embers = []; this.clouds = [];
      this.fog = 0; this.t = 0; this.tint = null;
    }

    setForLevel(data) {
      const cfg = (data && (BIOME_WEATHER[data.biome] || BIOME_WEATHER[data.name])) || { motes: 40, fog: 0.12 };
      this.enabledEffects = cfg;
      this.fog = cfg.fog || 0;
      this.tint = cfg.tint || null;
      this.motes = this._spawn(cfg.motes || 0);
      this.snow = this._spawn(cfg.snow || 0);
      this.rain = this._spawn(cfg.rain || 0);
      this.leaves = this._spawn(cfg.leaves || 0);
      this.embers = this._spawn(cfg.embers || 0);
      this.clouds = this._spawnClouds(cfg.clouds || 0);
    }

    _spawn(n) {
      const a = [];
      for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: Math.random(), s: Math.random(), r: Math.random() * Math.PI * 2, ph: Math.random() * Math.PI * 2 });
      return a;
    }
    _spawnClouds(n) {
      const a = [];
      for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: Math.random() * 0.5, w: 0.18 + Math.random() * 0.22, spd: 0.004 + Math.random() * 0.01 });
      return a;
    }

    _on() { return GG.save.settings.graphics.weather !== false; }

    update(dt, level) {
      if (!this._on()) return;
      this.t += dt;
      const wrap = (p) => { if (p.y > 1.05) { p.y -= 1.1; p.x = Math.random(); } if (p.x > 1.05) p.x -= 1.1; if (p.x < -0.05) p.x += 1.1; };
      for (const p of this.snow)   { p.y += (0.05 + p.s * 0.08) * dt; p.x += Math.sin(this.t + p.ph) * 0.02 * dt; wrap(p); }
      for (const p of this.rain)   { p.y += (0.9 + p.s * 0.5) * dt; p.x += 0.12 * dt; wrap(p); }
      for (const p of this.leaves) { p.y += (0.08 + p.s * 0.06) * dt; p.x += Math.sin(this.t * 1.5 + p.ph) * 0.06 * dt; p.r += dt * 2; wrap(p); }
      for (const p of this.motes)  { p.y += Math.sin(this.t * 0.5 + p.ph) * 0.01 * dt; p.x += 0.01 * dt; wrap(p); }
      for (const p of this.embers) { p.y -= (0.05 + p.s * 0.07) * dt; p.x += Math.sin(this.t * 2 + p.ph) * 0.03 * dt; if (p.y < -0.05) { p.y += 1.1; p.x = Math.random(); } }
      for (const c of this.clouds) { c.x += c.spd * dt; if (c.x > 1.2) c.x -= 1.4; }
    }

    // Behind the world (clouds + biome tint haze).
    renderBack(ctx, cam) {
      if (!this._on()) return;
      const vw = cam.viewW, vh = cam.viewH;
      for (const c of this.clouds) {
        const x = c.x * vw, y = c.y * vh, w = c.w * vw;
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = "#dfe8ff";
        ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    renderWorld() { /* effects are screen-space; nothing in world layer */ }

    // In front of the world (precipitation + fog).
    renderFront(ctx, cam) {
      if (!this._on()) return;
      const vw = cam.viewW, vh = cam.viewH;

      // dust motes
      ctx.fillStyle = "#cdd6ff";
      for (const p of this.motes) { ctx.globalAlpha = 0.12 + p.s * 0.18; ctx.fillRect(p.x * vw, p.y * vh, 2, 2); }

      // snow
      ctx.fillStyle = "#ffffff";
      for (const p of this.snow) { ctx.globalAlpha = 0.5 + p.s * 0.4; const r = 1 + p.s * 2; ctx.beginPath(); ctx.arc(p.x * vw, p.y * vh, r, 0, Math.PI * 2); ctx.fill(); }

      // rain streaks
      ctx.strokeStyle = "rgba(180,205,255,0.5)"; ctx.lineWidth = 1;
      for (const p of this.rain) { ctx.globalAlpha = 0.35 + p.s * 0.3; const x = p.x * vw, y = p.y * vh; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12 + p.s * 8); ctx.stroke(); }

      // leaves
      for (const p of this.leaves) {
        ctx.globalAlpha = 0.7; ctx.save(); ctx.translate(p.x * vw, p.y * vh); ctx.rotate(p.r);
        ctx.fillStyle = p.s > 0.5 ? "#7bbf4a" : "#c98a3a";
        ctx.fillRect(-3, -2, 6, 4); ctx.restore();
      }

      // embers
      for (const p of this.embers) { ctx.globalAlpha = 0.5 + Math.sin(this.t * 8 + p.ph) * 0.3; ctx.fillStyle = p.s > 0.5 ? "#ff9a3a" : "#ffcf4d"; ctx.fillRect(p.x * vw, p.y * vh, 2, 2); }

      ctx.globalAlpha = 1;

      // fog: drifting horizontal haze bands
      if (this.fog > 0) {
        for (let i = 0; i < 3; i++) {
          const yy = ((this.t * (6 + i * 4) + i * vh / 3) % (vh + 80)) - 40;
          const g = ctx.createLinearGradient(0, yy, 0, yy + 90);
          g.addColorStop(0, "rgba(200,210,235,0)");
          g.addColorStop(0.5, `rgba(200,210,235,${this.fog})`);
          g.addColorStop(1, "rgba(200,210,235,0)");
          ctx.fillStyle = g; ctx.fillRect(0, yy, vw, 90);
        }
      }
    }
  }

  GG.Weather = Weather;
})(window);
