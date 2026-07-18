/* =========================================================================
 * title.js — cinematic title scene (canvas) + opening sequence + secrets
 * -------------------------------------------------------------------------
 * Rendered in the 960x540 design space (scaled to 1080p by the game loop) while
 * the DOM menu panels sit on top. Provides:
 *   • Opening sequence: fade-in → studio card → glowing logo → title.
 *   • A living animated scene: day/night sky, parallax temple + floating
 *     islands, clouds, rotating gears, fireflies, birds, water reflection.
 *   • Nichols & Nibihah idling in the scene with little interactions.
 *   • A floating, glowing, pulsing game logo with particles.
 *   • Secrets: logo-click gag, Konami code easter egg, and an attract mode
 *     that starts after a period of inactivity.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;

  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
  const ATTRACT_AFTER = 30;   // seconds of title inactivity before attract mode
  const BIOMES = [
    { name: "Temple",        sky: ["#2a3a6a", "#e8a86a"] },
    { name: "Sunken Ruins",  sky: ["#12242a", "#2a6a6a"] },
    { name: "Factory",       sky: ["#281a24", "#c05a3a"] },
    { name: "Icy Peaks",     sky: ["#2a4a7a", "#cfe6ff"] },
    { name: "Jungle",        sky: ["#123018", "#6aae4a"] },
    { name: "Floating City", sky: ["#182448", "#7fb0ff"] },
    { name: "Heart Engine",  sky: ["#2a1030", "#c04a8a"] },
  ];
  const ATTRACT_CAPTIONS = [
    "Two heroes. One shattered world.",
    "Solve puzzles together — neither can finish alone.",
    "Boost, carry and cover for each other.",
    "Restore the Heart Engine.",
    "Echoes of Aether",
  ];

  class Title {
    constructor() {
      this.phase = "intro";           // intro | title | attract
      this.t = 0;                     // phase timer
      this.tod = 0.15;               // time-of-day 0..1 (dawn..night)
      this.idle = 0;                 // seconds since last title interaction
      this.konami = [];
      this.logoClicks = 0;
      this.easterEgg = 0;            // >0 = seconds of retro-outfit gag remaining
      this.logoPop = 0;
      this.attractIdx = 0; this.attractT = 0;
      this._built = false;
      this._birds = []; this._fireflies = []; this._islands = []; this._clouds = [];
    }

    init(game) {
      this.game = game;
      this._buildScene();
      // Two showcase heroes standing on the ledge beside the menu.
      this.p1 = new GG.Player(0, 0, { x: 250, y: 400 });
      this.p2 = new GG.Player(1, 1, { x: 300, y: 400 });
      for (const p of [this.p1, this.p2]) { p.dead = false; p.onGround = true; p.squash = 1; p.facing = 1; }
      this._built = true;
    }

    _buildScene() {
      for (let i = 0; i < 60; i++) this._fireflies.push({ x: Math.random(), y: 0.4 + Math.random() * 0.5, ph: Math.random() * 6, sp: 0.2 + Math.random() * 0.5 });
      for (let i = 0; i < 4; i++) this._islands.push({ x: Math.random(), y: 0.2 + Math.random() * 0.3, s: 0.5 + Math.random(), sp: 0.006 + Math.random() * 0.01 });
      for (let i = 0; i < 5; i++) this._clouds.push({ x: Math.random(), y: 0.08 + Math.random() * 0.25, w: 0.12 + Math.random() * 0.2, sp: 0.004 + Math.random() * 0.008 });
    }

    // ---- Input hooks (wired from main.js) -------------------------------
    onKey(code) {
      if (this.phase === "intro") { this.skipIntro(); return; }
      if (this.phase === "attract") { this.exitAttract(); return; }
      this.idle = 0;
      // Konami tracking
      this.konami.push(code); if (this.konami.length > KONAMI.length) this.konami.shift();
      if (this.konami.join(",") === KONAMI.join(",")) { this._triggerEasterEgg(); this.konami = []; }
    }
    onClick(x, y) {
      if (this.phase === "intro") { this.skipIntro(); return; }
      if (this.phase === "attract") { this.exitAttract(); return; }
      this.idle = 0;
      // logo hit-box (top-centre area)
      if (y < 150 && x > C.VIEW_W * 0.18 && x < C.VIEW_W * 0.82) {
        this.logoClicks++; this.logoPop = 1; GG.audio && GG.audio.sfx("gem");
        if (this.logoClicks % 5 === 0) this._triggerEasterEgg();
      }
    }
    skipIntro() { if (this.phase === "intro") { this.phase = "title"; this.t = 0; GG.bus.emit("title:ready"); } }
    exitAttract() { this.phase = "title"; this.t = 0; this.idle = 0; GG.bus.emit("title:ready"); }
    _triggerEasterEgg() { this.easterEgg = 6; this.logoPop = 1; GG.audio && GG.audio.sfx("achieve"); GG.bus.emit("title:easteregg"); }

    startIntro() { this.phase = "intro"; this.t = 0; }

    // ---- Update ----------------------------------------------------------
    update(dt) {
      this.t += dt;
      this.tod = (this.tod + dt / 180) % 1;   // full day/night every 3 minutes
      this.logoPop = Math.max(0, this.logoPop - dt * 2);
      this.easterEgg = Math.max(0, this.easterEgg - dt);
      if (this.phase === "intro" && this.t > 5.2) this.skipIntro();
      if (this.phase === "title") {
        this.idle += dt;
        if (this.idle > ATTRACT_AFTER) { this.phase = "attract"; this.attractT = 0; this.attractIdx = 0; GG.bus.emit("title:attract"); }
        this._showcase(dt);
      }
      if (this.phase === "attract") {
        this.attractT += dt;
        if (this.attractT > 4) { this.attractT = 0; this.attractIdx++; if (this.attractIdx >= BIOMES.length) this.exitAttract(); }
      }
      // scene motion
      for (const b of this._birds) { b.x += b.sp * dt; b.ph += dt * 8; }
      if (Math.random() < dt * 0.4 && this._birds.length < 6) this._birds.push({ x: -0.05, y: 0.12 + Math.random() * 0.2, sp: 0.06 + Math.random() * 0.05, ph: 0 });
      this._birds = this._birds.filter(b => b.x < 1.1);
    }

    _showcase(dt) {
      // Simple scripted idle behaviour + occasional interactions.
      for (const p of [this.p1, this.p2]) { p.animTime = (p.animTime || 0) + dt; p.blink -= dt; if (p.blink < -0.2 && Math.random() < 0.03) p.blink = 0.12; }
      const cyc = this.t % 12;
      if (cyc < 7)        { this.p1.animName = "idle"; this.p2.animName = "idle"; this.p1.facing = 1; this.p2.facing = -1; }
      else if (cyc < 8.5) { this.p1.animName = "celebrate"; this.p2.animName = "celebrate"; }  // high-five-ish
      else if (cyc < 10)  { this.p1.animName = "push"; this.p2.animName = "idle"; }             // stretch
      else                { this.p1.animName = "walk"; this.p2.animName = "walk"; }
    }

    // ---- Render ----------------------------------------------------------
    render(ctx, dt) {
      if (!this._built) return;
      this.update(dt);
      if (this.phase === "attract") { this._renderAttract(ctx); return; }
      this._renderScene(ctx, this.game && this.game.level ? null : "Temple");
      // characters on the ledge
      this._drawHero(ctx, this.p1, 250, 452);
      this._drawHero(ctx, this.p2, 300, 452);
      this._renderLogo(ctx);
      if (this.phase === "intro") this._renderIntroOverlay(ctx);
      else {
        // subtle hint bottom-left
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 2) * 0.2;
        ctx.fillStyle = "#cdd6ff"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "left";
        ctx.fillText("↑↑↓↓←→←→↑↓  ·  click the logo", 16, C.VIEW_H - 16);
        ctx.globalAlpha = 1;
      }
    }

    _skyColors() {
      // interpolate a small day/night palette by time-of-day
      const stops = [
        [0.00, ["#1a2450", "#e8a86a"]], // dawn
        [0.30, ["#3a72c4", "#bfe0ff"]], // day
        [0.55, ["#2a4a8a", "#f0a05a"]], // dusk
        [0.75, ["#0a1030", "#3a2a5a"]], // night
        [1.00, ["#1a2450", "#e8a86a"]],
      ];
      let a = stops[0], b = stops[1];
      for (let i = 0; i < stops.length - 1; i++) if (this.tod >= stops[i][0] && this.tod < stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
      const f = (this.tod - a[0]) / (b[0] - a[0] || 1);
      const lerpC = (c1, c2) => {
        const p1 = parseInt(c1.slice(1), 16), p2 = parseInt(c2.slice(1), 16);
        const r = Math.round(((p1 >> 16) & 255) * (1 - f) + ((p2 >> 16) & 255) * f);
        const g = Math.round(((p1 >> 8) & 255) * (1 - f) + ((p2 >> 8) & 255) * f);
        const bl = Math.round((p1 & 255) * (1 - f) + (p2 & 255) * f);
        return `rgb(${r},${g},${bl})`;
      };
      return [lerpC(a[1][0], b[1][0]), lerpC(a[1][1], b[1][1])];
    }

    _renderScene(ctx) {
      const W = C.VIEW_W, H = C.VIEW_H, night = this.tod > 0.6 && this.tod < 0.95;
      const [top, bot] = this._skyColors();
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, top); g.addColorStop(1, bot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // stars at night
      if (night) { ctx.fillStyle = "#fff"; for (let i = 0; i < 80; i++) { const x = (i * 137) % W, y = (i * 71) % (H * 0.5); ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(this.t + i)); ctx.fillRect(x, y, 1.5, 1.5); } ctx.globalAlpha = 1; }

      // sun / moon arc
      const arc = this.tod * Math.PI * 2 - Math.PI / 2;
      const sx = W / 2 + Math.cos(arc) * W * 0.42, sy = H * 0.55 + Math.sin(arc) * H * 0.5;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = night ? "#dfe8ff" : "#ffe6a0"; ctx.shadowBlur = 30; ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      // clouds
      for (const c of this._clouds) { c.x += c.sp * dtGuard(); if (c.x > 1.2) c.x -= 1.4; const x = c.x * W, y = c.y * H, w = c.w * W;
        ctx.globalAlpha = 0.22; ctx.fillStyle = "#dfe8ff"; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;

      // far mountains + temple silhouette
      ctx.fillStyle = this._shade(top, -30);
      ctx.beginPath(); ctx.moveTo(0, H * 0.72);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, H * 0.72 - Math.abs(Math.sin(x * 0.01)) * 70 - (x > W * 0.55 && x < W * 0.8 ? 40 : 0));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      // temple block
      ctx.fillStyle = this._shade(top, -50);
      ctx.fillRect(W * 0.6, H * 0.5, W * 0.16, H * 0.28);
      for (let i = 0; i < 5; i++) ctx.fillRect(W * 0.6 + i * (W * 0.16 / 5), H * 0.46, 8, H * 0.04);
      // rotating gear on the temple
      this._gear(ctx, W * 0.68, H * 0.4, 22, this.t * 0.6, this._shade(top, -20));
      this._gear(ctx, W * 0.72, H * 0.46, 14, -this.t * 0.9, this._shade(top, -20));

      // floating islands drifting
      for (const is of this._islands) { is.x += is.sp * dtGuard(); if (is.x > 1.2) is.x -= 1.4; const x = is.x * W, y = is.y * H + Math.sin(this.t * 0.6 + is.x * 8) * 6, s = is.s;
        ctx.fillStyle = this._shade(bot, -40); ctx.beginPath(); ctx.moveTo(x - 26 * s, y); ctx.lineTo(x + 26 * s, y); ctx.lineTo(x, y + 20 * s); ctx.fill();
        ctx.fillStyle = "#5a8a3c"; ctx.fillRect(x - 26 * s, y - 4, 52 * s, 5); }

      // birds
      ctx.strokeStyle = night ? "#8892b0" : "#33405a"; ctx.lineWidth = 1.5;
      for (const b of this._birds) { const x = b.x * W, y = b.y * H, f = Math.sin(b.ph) * 4;
        ctx.beginPath(); ctx.moveTo(x - 5, y + f); ctx.lineTo(x, y); ctx.lineTo(x + 5, y + f); ctx.stroke(); }

      // fireflies / magical particles
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const ff of this._fireflies) { const x = (ff.x + Math.sin(this.t * ff.sp + ff.ph) * 0.02) * W; const y = (ff.y + Math.cos(this.t * ff.sp + ff.ph) * 0.02) * H;
        ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(this.t * 2 + ff.ph)); ctx.fillStyle = "#bff0c8"; ctx.fillRect(x, y, 2, 2); }
      ctx.restore(); ctx.globalAlpha = 1;

      // ground ledge + water reflection strip
      ctx.fillStyle = "#1a1e2c"; ctx.fillRect(0, H * 0.86, W, H * 0.14);
      ctx.fillStyle = this._shade(bot, -20); ctx.globalAlpha = 0.25; ctx.fillRect(0, H * 0.86, W, 6); ctx.globalAlpha = 1;
      // soft fog band
      ctx.fillStyle = "rgba(200,210,235,0.06)"; ctx.fillRect(0, H * 0.7, W, H * 0.2);
    }

    _gear(ctx, x, y, r, ang, color) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = color;
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -r - 3, 4, 6); }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0b0e18"; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    _drawHero(ctx, p, x, footY) {
      p.x = x - p.w / 2; p.y = footY - p.h; p.dead = false;
      // retro-outfit easter egg: rainbow glow aura
      if (this.easterEgg > 0) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
        ctx.fillStyle = `hsl(${(this.t * 200) % 360},90%,60%)`; ctx.beginPath(); ctx.arc(x, footY - p.h / 2, 20, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      p.render(ctx);
    }

    _renderLogo(ctx) {
      const W = C.VIEW_W;
      const float = Math.sin(this.t * 1.2) * 5;
      const pulse = 1 + Math.sin(this.t * 2) * 0.02 + this.logoPop * 0.08;
      const cy = 78 + float;
      ctx.save();
      ctx.translate(W / 2, cy); ctx.scale(pulse, pulse); ctx.textAlign = "center";
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.font = "800 46px 'Segoe UI', system-ui, sans-serif";
      ctx.fillText("ECHOES OF AETHER", 3, 5);
      // glow gradient text
      ctx.shadowBlur = 18 + this.logoPop * 20; ctx.shadowColor = this.easterEgg > 0 ? `hsl(${(this.t*160)%360},90%,60%)` : "#7fd4ff";
      const grd = ctx.createLinearGradient(-200, 0, 200, 0);
      grd.addColorStop(0, "#7fc4ff"); grd.addColorStop(0.5, "#dff0ff"); grd.addColorStop(1, "#9bf0b8");
      ctx.fillStyle = this.easterEgg > 0 ? `hsl(${(this.t*140)%360},90%,70%)` : grd;
      ctx.fillText("ECHOES OF AETHER", 0, 0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#cdd6ff"; ctx.font = "600 14px 'Segoe UI', sans-serif";
      ctx.fillText("· A Cooperative Adventure ·", 0, 24);
      ctx.restore();
      // logo particles
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 10; i++) { const a = this.t + i * 0.63; const x = W / 2 + Math.cos(a) * (150 + i * 6); const y = cy + Math.sin(a * 1.3) * 14;
        ctx.globalAlpha = 0.3 + 0.3 * Math.sin(a * 2); ctx.fillStyle = i % 2 ? "#7fc4ff" : "#9bf0b8"; ctx.fillRect(x, y, 2, 2); }
      ctx.restore(); ctx.globalAlpha = 1; ctx.textAlign = "left";
    }

    _renderIntroOverlay(ctx) {
      const W = C.VIEW_W, H = C.VIEW_H, t = this.t;
      let cover = 0, studioA = 0;
      if (t < 1.0) cover = 1 - t;                 // fade from black
      if (t >= 1.0 && t < 3.0) studioA = t < 1.4 ? (t - 1.0) / 0.4 : t > 2.6 ? (3.0 - t) / 0.4 : 1;
      if (t >= 3.0 && t < 3.6) cover = 0;          // logo already drawn beneath
      // studio card
      if (studioA > 0) {
        ctx.fillStyle = "#05070f"; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = studioA; ctx.textAlign = "center";
        ctx.fillStyle = "#e8ecff"; ctx.font = "600 22px 'Segoe UI', sans-serif";
        ctx.fillText("A N   O R I G I N A L   G A M E", W / 2, H / 2 - 6);
        ctx.fillStyle = "#5ce08a"; ctx.font = "800 30px 'Segoe UI', sans-serif";
        ctx.fillText("AETHER STUDIOS", W / 2, H / 2 + 28);
        ctx.globalAlpha = 1; ctx.textAlign = "left";
      }
      if (cover > 0) { ctx.fillStyle = `rgba(5,7,15,${cover})`; ctx.fillRect(0, 0, W, H); }
      // skip hint
      if (t > 0.6) { ctx.globalAlpha = 0.5; ctx.fillStyle = "#8f9ac2"; ctx.font = "12px 'Segoe UI', sans-serif"; ctx.textAlign = "right"; ctx.fillText("press any key to skip", W - 16, H - 16); ctx.textAlign = "left"; ctx.globalAlpha = 1; }
    }

    _renderAttract(ctx) {
      const W = C.VIEW_W, H = C.VIEW_H;
      const biome = BIOMES[this.attractIdx % BIOMES.length];
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, biome.sky[0]); g.addColorStop(1, biome.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // parallax silhouettes
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let x = 0; x < W; x += 60) ctx.fillRect(x, H * 0.6 + Math.sin((x + this.attractT * 40) * 0.02) * 30, 50, H);
      // characters demoing
      this.p1.animName = "run"; this.p2.animName = "run"; this.p1.facing = this.p2.facing = 1;
      this.p1.animTime = (this.p1.animTime || 0) + dtGuard(); this.p2.animTime = (this.p2.animTime || 0) + dtGuard();
      const px = (this.attractT / 4) * W;
      this._drawHero(ctx, this.p1, (px % W), H * 0.7);
      this._drawHero(ctx, this.p2, ((px + 40) % W), H * 0.7);
      // caption
      ctx.globalAlpha = Math.min(1, this.attractT) * (this.attractT > 3 ? (4 - this.attractT) : 1);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "700 26px 'Segoe UI', sans-serif";
      ctx.fillText(ATTRACT_CAPTIONS[this.attractIdx % ATTRACT_CAPTIONS.length], W / 2, H / 2);
      ctx.fillStyle = "#cdd6ff"; ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillText("— " + biome.name + " —", W / 2, H / 2 + 26);
      ctx.globalAlpha = 1; ctx.textAlign = "left";
      // banner
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0, H - 34, W, 34);
      ctx.globalAlpha = 0.6 + Math.sin(this.t * 3) * 0.3; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.font = "13px 'Segoe UI', sans-serif"; ctx.fillText("PRESS ANY KEY", W / 2, H - 12);
      ctx.globalAlpha = 1; ctx.textAlign = "left";
    }

    _shade(rgb, d) {
      const m = rgb.match(/\d+/g); if (!m) return rgb;
      const c = m.map(v => U.clamp(parseInt(v) + d, 0, 255));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }

  // small helper: last dt for scene drift (title updates dt itself)
  let _lastDt = 1 / 60; function dtGuard() { return _lastDt; }

  const _title = new Title();
  const _origUpdate = _title.update.bind(_title);
  _title.update = function (dt) { _lastDt = dt; _origUpdate(dt); };

  GG.title = _title;
})(window);
