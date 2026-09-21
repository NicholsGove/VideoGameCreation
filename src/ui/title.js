/* =========================================================================
 * title.js — the title screen and the opening sequence
 * -------------------------------------------------------------------------
 * Rendered in the 960x540 design space (scaled to 1080p by the game loop)
 * while the DOM menu panels sit on top (right-hand side).
 *
 *   • PRESS  a quiet ember and "press any key" (browsers only allow sound
 *            after the first key or click, so the intro waits for it)
 *   • INTRO  a spark in the dark, two heartbeats, the camera tilts down out
 *            of the stars onto the valley, "Aether Studios presents", light
 *            gathers into the logo on a choir-and-timpani hit, and the main
 *            theme begins
 *   • TITLE  an Ori-style vista: aurora and nebulae, the Heart of Aether
 *            pulsing in the distance with light rays, the eight region
 *            landmarks on the horizon, floating islands with waterfalls, a
 *            misty lake, and the heroes on a cliff under a glowing tree,
 *            framed by swaying leaves and drifting spirit lights
 *   • ATTRACT after a while idle, a slideshow of the story paintings
 *
 * Secrets kept from before: click the logo five times, or the Konami code.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;
  const W = C.VIEW_W, H = C.VIEW_H, OS = 60, TAU = Math.PI * 2;

  const KONAMI = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
  const ATTRACT_AFTER = 40;           // seconds idle on the title before the slideshow
  const ATTRACT = [
    ["heartWhole", "Two heroes. One shattered world."],
    ["cavern", "Each carries half of the Aether Compass."],
    ["forest", "Explore eight regions together."],
    ["templeRising", "Face their guardians. Outrun their fury."],
    ["finalShard", "Neither can finish alone."],
    ["worldHeals", "Restore the Heart of Aether."],
  ];
  const LOGO = { x: 292, y: 118 };
  const INTRO_LEN = 8.2;

  class Title {
    constructor() {
      this.phase = "press";           // press | intro | title | attract
      this.t = 0; this.clock = 0;
      this.idle = 0;
      this.konami = [];
      this.logoClicks = 0;
      this.easterEgg = 0;
      this.logoPop = 0; this.flash = 0;
      this.attractIdx = 0; this.attractT = 0;
      this._built = false;
      this._cues = {};
    }

    init(game) {
      this.game = game;
      this.p1 = new GG.Player(0, 0, { x: 250, y: 400 });
      this.p2 = new GG.Player(1, 1, { x: 300, y: 400 });
      for (const p of [this.p1, this.p2]) { p.dead = false; p.onGround = true; p.squash = 1; p.facing = 1; }
      this._bakeLayers();
      this._built = true;
    }

    /* ---- pre-painted layers (static shapes, painted once at 2x) -------- */
    _bake(fn) {
      const cv = document.createElement("canvas");
      cv.width = (W + OS * 2) * 2; cv.height = (H + OS * 2) * 2;
      const c = cv.getContext("2d"); if (!c) return null;
      c.setTransform(2, 0, 0, 2, OS * 2, OS * 2);
      try { fn(c); } catch (e) { console.warn("[title] layer", e); }
      return cv;
    }
    _bakeLayers() {
      const L = GG.PAINT && GG.PAINT.lib; if (!L) return;
      this.layers = {
        landmarks: this._bake(c => { L.landmarkRow(c, 372, "rgba(34,38,86,0.9)", 0.8); L.haze(c, 350, 50, "rgba(120,110,200,0.55)", 0.55); L.haze(c, 372, 22, "rgba(150,130,210,0.6)", 0.6); }),
        range: this._bake(c => { L.range(c, 400, 70, "#1b2150", 301, 6, 1.2); L.haze(c, 400, 30, "rgba(110,120,200,0.5)", 0.45); }),
        hills: this._bake(c => { L.forest(c, 448, "#0f1636", 302, 0.9, true); }),
        cliff: this._bake(c => {
          // the heroes' cliff, with a glowing spirit tree
          c.fillStyle = "#070a18";
          c.beginPath(); c.moveTo(-OS, H + OS); c.lineTo(-OS, 440);
          for (let x = -OS; x <= 400; x += 8) c.lineTo(x, 456 + Math.sin(x * 0.05) * 3 + (x > 360 ? (x - 360) * 1.2 : 0));
          c.lineTo(420, 520); c.lineTo(380, H + OS); c.fill();
          c.fillStyle = "#1c2a4a"; for (let x = -OS; x < 370; x += 5) c.fillRect(x, 454 + Math.sin(x * 0.05) * 3, 3, 3 + (x % 3));
          // tree trunk & branches
          c.fillStyle = "#0a0e1e";
          c.beginPath(); c.moveTo(96, 458); c.quadraticCurveTo(104, 400, 86, 350); c.lineTo(96, 346); c.quadraticCurveTo(116, 390, 116, 458); c.fill();
          c.beginPath(); c.moveTo(104, 390); c.quadraticCurveTo(140, 360, 170, 352); c.lineTo(172, 358); c.quadraticCurveTo(140, 368, 110, 400); c.fill();
          c.beginPath(); c.moveTo(94, 372); c.quadraticCurveTo(60, 350, 40, 352); c.lineTo(40, 358); c.quadraticCurveTo(64, 358, 94, 382); c.fill();
        }),
      };
    }
    _blit(ctx, cv, dx, dy) { if (cv) ctx.drawImage(cv, -OS + dx, -OS + dy, W + OS * 2, H + OS * 2); }

    // ---- Input hooks (wired from main.js) -------------------------------
    onKey(code) {
      if (this.phase === "press") { this.startIntroNow(); return; }
      if (this.phase === "intro") { this.skipIntro(); return; }
      if (this.phase === "attract") { this.exitAttract(); return; }
      this.idle = 0;
      this.konami.push(code); if (this.konami.length > KONAMI.length) this.konami.shift();
      if (this.konami.join(",") === KONAMI.join(",")) { this._triggerEasterEgg(); this.konami = []; }
    }
    onClick(x, y) {
      if (this.phase === "press") { this.startIntroNow(); return; }
      if (this.phase === "intro") { this.skipIntro(); return; }
      if (this.phase === "attract") { this.exitAttract(); return; }
      this.idle = 0;
      if (Math.hypot(x - LOGO.x, y - LOGO.y) < 150) {
        this.logoClicks++; this.logoPop = 1; GG.score ? GG.score.cue("spark") : GG.audio.sfx("gem");
        if (this.logoClicks % 5 === 0) this._triggerEasterEgg();
      }
    }
    /** The first key: sound is allowed now, so the real intro can play. */
    startIntroNow() {
      if (GG.audio) GG.audio.resume();
      this.phase = "intro"; this.t = 0; this._cues = {};
    }
    skipIntro() {
      if (this.phase !== "intro" && this.phase !== "press") return;
      this.phase = "title"; this.t = 0; this.flash = 0.6;
      if (GG.audio) GG.audio.resume();
      if (GG.score) { GG.score.cue("logo"); GG.score.play("title"); }
      GG.bus.emit("title:ready");
    }
    exitAttract() { this.phase = "title"; this.t = 0; this.idle = 0; GG.bus.emit("title:ready"); }
    _triggerEasterEgg() { this.easterEgg = 6; this.logoPop = 1; GG.score ? GG.score.cue("shimmer") : GG.audio.sfx("achieve"); GG.bus.emit("title:easteregg"); }

    /** Called on boot; the intro waits for the first key or click. */
    startIntro() { this.phase = "press"; this.t = 0; }
    /** Back to the title from a game: the theme returns. */
    returnToTitle() { this.phase = "title"; this.t = 0; this.idle = 0; if (GG.score) GG.score.play("title"); }

    // ---- Update ----------------------------------------------------------
    update(dt) {
      this.t += dt; this.clock += dt;
      this.logoPop = Math.max(0, this.logoPop - dt * 2);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.easterEgg = Math.max(0, this.easterEgg - dt);
      if (this.phase === "intro") {
        // the sound of the opening, cued as the picture reaches each moment
        const cue = (at, name, fn) => { if (this.t >= at && !this._cues[name]) { this._cues[name] = 1; if (GG.score) GG.score.cue(name.replace(/\d+$/, "")); if (fn) fn(); } };
        cue(0.25, "spark"); cue(1.1, "heartbeat1"); cue(2.3, "heartbeat2");
        cue(2.7, "whoosh"); cue(3.4, "shimmer"); cue(5.4, "riser");
        cue(6.6, "logo", () => { this.flash = 1; if (GG.score) GG.score.play("title"); });
        if (this.t > INTRO_LEN) { this.phase = "title"; this.t = 0; GG.bus.emit("title:ready"); }
      }
      if (this.phase === "title") {
        this.idle += dt;
        if (this.idle > ATTRACT_AFTER) { this.phase = "attract"; this.attractT = 0; this.attractIdx = 0; GG.bus.emit("title:attract"); }
        this._showcase(dt);
      }
      if (this.phase === "attract") {
        this.attractT += dt;
        if (this.attractT > 5.5) { this.attractT = 0; this.attractIdx++; if (GG.score) GG.score.cue("page"); if (this.attractIdx >= ATTRACT.length) this.exitAttract(); }
      }
    }

    _showcase(dt) {
      for (const p of [this.p1, this.p2]) { p.animTime = (p.animTime || 0) + dt; p.blink -= dt; if (p.blink < -0.2 && Math.random() < 0.03) p.blink = 0.12; }
      const cyc = this.clock % 14;
      this.p1.facing = 1; this.p2.facing = cyc < 9 ? 1 : -1;
      if (cyc < 8) { this.p1.animName = "idle"; this.p2.animName = "idle"; }
      else if (cyc < 9.6) { this.p1.animName = "celebrate"; this.p2.animName = "celebrate"; }
      else { this.p1.animName = "idle"; this.p2.animName = "idle"; }
    }

    // ---- Render ----------------------------------------------------------
    render(ctx, dt) {
      if (!this._built) return;
      this.update(dt);
      if (this.phase === "attract") { this._renderAttract(ctx); return; }
      if (this.phase === "press") { this._renderPress(ctx); return; }
      // the intro tilts down out of the sky onto the valley
      let camY = 0, fade = 0;
      if (this.phase === "intro") {
        const k = U.clamp((this.t - 2.6) / 3.6, 0, 1), e = 1 - Math.pow(1 - k, 3);
        camY = -420 * (1 - e);
        fade = this.t < 2.6 ? 1 : Math.max(0, 1 - (this.t - 2.6) / 0.9);
      }
      this._renderVista(ctx, camY);
      if (this.phase === "intro") this._renderIntroOverlay(ctx, fade);
      const logoA = this.phase === "intro" ? U.clamp((this.t - 6.4) / 0.5, 0, 1) : 1;
      if (this.phase === "intro" && this.t > 5.4 && this.t < 6.8) this._renderGather(ctx, (this.t - 5.4) / 1.2);
      if (logoA > 0) this._renderLogo(ctx, logoA);
      if (this.flash > 0) {                              // a bloom of light from the emblem
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const fg = ctx.createRadialGradient(LOGO.x, LOGO.y, 0, LOGO.x, LOGO.y, 520);
        fg.addColorStop(0, `rgba(255,245,220,${this.flash * 0.7})`); fg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      if (this.phase === "title") {
        ctx.globalAlpha = 0.35 + Math.sin(this.clock * 2) * 0.15;
        ctx.fillStyle = "#cdd6ff"; ctx.font = "11px 'Segoe UI', sans-serif"; ctx.textAlign = "left";
        ctx.fillText("↑↑↓↓←→←→↑↓  ·  click the emblem", 16, H - 14);
        ctx.globalAlpha = 1;
      }
    }

    /** The waiting screen: one ember breathing in the dark. */
    _renderPress(ctx) {
      const t = this.clock;
      ctx.fillStyle = "#03040a"; ctx.fillRect(0, 0, W, H);
      const L = GG.PAINT && GG.PAINT.lib;
      const p = 0.6 + Math.sin(t * 2) * 0.25;
      if (L) { L.nebula(ctx, W / 2, H / 2 - 20, 140, "rgba(140,200,255,0.8)", 0.25 * p); L.orb(ctx, W / 2, H / 2 - 20, 3 + p, "#eaf6ff", "rgba(160,220,255,0.9)", 0.5 * p); }
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.45 + Math.sin(t * 2.4) * 0.3;
      ctx.fillStyle = "#e8dcc0"; ctx.font = "600 15px 'Cinzel', Georgia, serif";
      ctx.fillText("Press any key", W / 2, H / 2 + 40);
      ctx.globalAlpha = 0.35; ctx.font = "11px 'Segoe UI', sans-serif"; ctx.fillStyle = "#8f9ac2";
      ctx.fillText("best with sound on", W / 2, H / 2 + 62);
      ctx.globalAlpha = 1; ctx.textAlign = "left";
    }

    /** The whole valley, with parallax. camY < 0 looks up into the sky. */
    _renderVista(ctx, camY) {
      const L = GG.PAINT && GG.PAINT.lib; if (!L) return;
      const t = this.clock;
      const camX = Math.sin(t * 0.06) * 22;
      const off = (d) => [-camX * d, -camY * d];
      // sky
      L.sky(ctx, ["#03050f", "#0a1330", "#1c1f4c", "#3e2e66", "#7a4a78"]);
      ctx.save(); let o = off(0.04); ctx.translate(o[0], o[1]);
      L.nebula(ctx, 700, 90, 300, "rgba(130,80,210,0.7)", 0.28);
      L.nebula(ctx, 140, 60, 220, "rgba(60,130,220,0.7)", 0.25);
      L.nebula(ctx, 480, -200, 260, "rgba(90,200,200,0.6)", 0.18);
      L.stars(ctx, t, 220, 17, 340);
      // an occasional shooting star
      const sk = (t % 9) / 1.2;
      if (sk < 1) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = `rgba(255,255,255,${1 - sk})`; ctx.lineWidth = 1.5; const sx = 120 + sk * 300, sy = 40 + sk * 90; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 60, sy - 18); ctx.stroke(); ctx.restore(); }
      ctx.restore();
      ctx.save(); o = off(0.1); ctx.translate(o[0], o[1]);
      L.aurora(ctx, t, ["rgba(110,240,190,0.95)", "rgba(110,160,255,0.85)", "rgba(200,120,255,0.7)"], 150, 42);
      ctx.restore();
      // the Heart of Aether, beating far away
      ctx.save(); o = off(0.16); ctx.translate(o[0], o[1]);
      const beat = GG.heartbeat ? GG.heartbeat(t) : 0;
      L.rays(ctx, 470, 238, "rgba(170,210,255,0.85)", 16, 460, t, 0, 0.12 + beat * 0.06);
      L.nebula(ctx, 470, 238, 170 + beat * 20, "rgba(199,155,255,0.8)", 0.32 + beat * 0.15);
      L.heartEngine(ctx, 470, 238, 44 + beat * 4, t * 0.6, false);
      ctx.restore();
      // the eight landmarks on the horizon
      this._blit(ctx, this.layers.landmarks, ...off(0.22));
      // floating islands
      ctx.save(); o = off(0.3); ctx.translate(o[0], o[1]);
      L.island(ctx, 150, 250, 0.55, "#2a4a5a", "#1a1f40", t); L.island(ctx, 760, 205, 0.45, "#2a4a5a", "#1a1f40", t + 2); L.island(ctx, 620, 300, 0.3, "#2a4a5a", "#1a1f40", t + 4);
      ctx.restore();
      this._blit(ctx, this.layers.range, ...off(0.36));
      ctx.save(); o = off(0.4); ctx.translate(o[0], o[1]); L.mist(ctx, t, 415, "#8a90d0", 0.12, 8); ctx.restore();
      this._blit(ctx, this.layers.hills, ...off(0.5));
      // the lake, catching the Heart's light
      ctx.save(); o = off(0.55); ctx.translate(o[0], o[1]);
      L.water(ctx, t, 462, "#141c44", "rgba(190,210,255,0.3)");
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.25 + beat * 0.1;
      for (let y = 464; y < 560; y += 4) {
        const k = (y - 462) / 100, w = 34 * (1 - k * 0.5) * (0.7 + 0.3 * Math.sin(y * 0.3 + t * 3));
        ctx.fillStyle = `rgba(199,165,255,${0.5 * (1 - k)})`;
        ctx.fillRect(470 - w / 2 + Math.sin(y * 0.2 + t * 2) * 4, y, w, 2);
      }
      ctx.restore();
      L.mist(ctx, t * 1.4, 470, "#aab4ff", 0.1, 14);
      ctx.restore();
      // the heroes' cliff + the glowing tree
      o = off(0.8);
      this._blit(ctx, this.layers.cliff, ...o);
      ctx.save(); ctx.translate(o[0], o[1]);
      // its canopy: soft leaf clouds lit from inside, and blossoms of light
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3, x = 104 + Math.cos(a * 2.3) * (26 + (i % 3) * 16), y = 332 + Math.sin(a * 3.1) * 14 - (i % 2) * 10 + Math.sin(t * 0.8 + i) * 1.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 30); g.addColorStop(0, "rgba(120,210,255,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.fill(); }
      ctx.restore();
      for (let i = 0; i < 22; i++) { const a = i * 1.7, r = 16 + (i % 5) * 10; L.orb(ctx, 104 + Math.cos(a) * r * 1.7, 334 + Math.sin(a) * r * 0.7 + Math.sin(t + i) * 2, 1.8, "#e8fbff", "rgba(150,230,255,0.8)", 0.3 + 0.15 * Math.sin(t * 2 + i)); }
      L.nebula(ctx, 104, 340, 90, "rgba(120,220,255,0.7)", 0.22);
      this._drawHero(ctx, this.p1, 236, 457);
      this._drawHero(ctx, this.p2, 280, 457);
      ctx.restore();
      // spirit lights drifting up, fireflies
      ctx.save(); o = off(0.9); ctx.translate(o[0], o[1]);
      L.motes(ctx, t, "blue", 36, 401); L.motes(ctx, t * 0.8, "green", 22, 402);
      ctx.restore();
      // foreground leaves framing the corners
      this._renderLeaves(ctx, t, camX, camY);
      L.vignette(ctx, 0.55);
    }

    _renderLeaves(ctx, t, camX, camY) {
      const dx = -camX * 1.4, dy = -camY * 1.3;
      ctx.save(); ctx.translate(dx, dy);
      ctx.fillStyle = "#02030a";
      const leaf = (x, y, a, s) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.sin(t * 0.9 + x) * 0.05); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(30, -14, 70, 0); ctx.quadraticCurveTo(30, 14, 0, 0); ctx.fill(); ctx.restore(); };
      // top-left branch
      ctx.beginPath(); ctx.moveTo(-OS, -OS); ctx.quadraticCurveTo(90, 10, 210, -10); ctx.lineTo(210, -4); ctx.quadraticCurveTo(90, 22, -OS, 30); ctx.fill();
      for (let i = 0; i < 9; i++) leaf(-20 + i * 26, 6 + (i % 2) * 8, 0.6 + (i % 3) * 0.4, 0.8 + (i % 2) * 0.3);
      // bottom-right ferns (under the menu edge, but they peek out)
      for (let i = 0; i < 7; i++) leaf(W - 20 - i * 18, H + 10, -2.1 + i * 0.12, 1.1 + (i % 2) * 0.3);
      ctx.restore();
      // big soft bokeh drifting in the foreground
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const x = ((i * 173 + t * (6 + i)) % (W + 200)) - 100 + dx * 0.5, y = 80 + (i * 97) % 380 + Math.sin(t * 0.4 + i) * 20;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 26 + i * 3);
        g.addColorStop(0, i % 2 ? "rgba(160,220,255,0.18)" : "rgba(180,255,210,0.14)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26 + i * 3, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    _drawHero(ctx, p, x, footY) {
      p.x = x - p.w / 2; p.y = footY - p.h; p.dead = false;
      if (this.easterEgg > 0) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
        ctx.fillStyle = `hsl(${(this.clock * 200) % 360},90%,60%)`; ctx.beginPath(); ctx.arc(x, footY - p.h / 2, 22, 0, TAU); ctx.fill(); ctx.restore(); }
      // rim light from the Heart
      if (GG.PAINT) GG.PAINT.lib.nebula(ctx, x + 6, footY - p.h / 2, 30, "rgba(199,155,255,0.6)", 0.25);
      ctx.save(); ctx.translate(x, footY); ctx.scale(1.3, 1.3); ctx.translate(-x, -footY);
      p.render(ctx);
      ctx.restore();
    }

    /** Light gathers into the emblem just before the logo appears. */
    _renderGather(ctx, k) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 40; i++) {
        const a = i * 2.4, r = (1 - k) * (260 + (i % 7) * 30);
        const x = LOGO.x + Math.cos(a + k * 3) * r, y = LOGO.y + Math.sin(a + k * 3) * r * 0.6;
        ctx.globalAlpha = 0.3 + k * 0.7; ctx.fillStyle = i % 2 ? "#9bf0b8" : "#9fd8ff";
        ctx.fillRect(x, y, 2.5, 2.5);
      }
      ctx.restore();
    }

    /** The emblem (the two compass halves) and the title lettering. */
    _renderLogo(ctx, a) {
      const t = this.clock, float = Math.sin(t * 1.1) * 3;
      const pop = 1 + this.logoPop * 0.06;
      const L = GG.PAINT && GG.PAINT.lib;
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(LOGO.x, LOGO.y + float); ctx.scale(pop, pop);
      // emblem: a rotating gold ring, and the two halves meeting in the middle
      if (L) L.nebula(ctx, 0, -6, 150, "rgba(150,210,255,0.7)", 0.22);
      ctx.save(); ctx.rotate(t * 0.15);
      ctx.strokeStyle = "rgba(242,193,78,0.55)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, -6, 92, 0, TAU); ctx.stroke();
      for (let i = 0; i < 16; i++) { const an = i / 16 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 86, -6 + Math.sin(an) * 86); ctx.lineTo(Math.cos(an) * (i % 4 ? 90 : 98), -6 + Math.sin(an) * (i % 4 ? 90 : 98)); ctx.stroke(); }
      ctx.restore();
      // the two compass halves as glowing crescents: green (Nichols), blue (Nibihah)
      for (const [dir, col] of [[-1, "rgba(110,240,160,"], [1, "rgba(79,195,255,"]]) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const cg = ctx.createRadialGradient(dir * 30, -6, 20, dir * 30, -6, 90);
        cg.addColorStop(0, col + "0)"); cg.addColorStop(0.75, col + (0.22 * a) + ")"); cg.addColorStop(1, col + "0)");
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(0, -6, 84, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.lineTo(0, -6); ctx.fill();
        ctx.strokeStyle = col + (0.8 * a) + ")"; ctx.lineWidth = 3; ctx.shadowBlur = 16; ctx.shadowColor = col + "1)";
        ctx.beginPath(); ctx.arc(0, -6, 80, dir > 0 ? -Math.PI / 2 + 0.25 : Math.PI / 2 + 0.25, dir > 0 ? Math.PI / 2 - 0.25 : Math.PI * 1.5 - 0.25); ctx.stroke();
        ctx.restore();
      }
      // lettering
      ctx.textAlign = "center";
      const egg = this.easterEgg > 0;
      ctx.font = "800 58px 'Cinzel', Georgia, serif";
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillText("ECHOES", 3, 8);
      const sweep = ((t % 6) / 6) * 700 - 350;                   // a light sweep across the letters
      const g = ctx.createLinearGradient(-190, 0, 190, 0);
      g.addColorStop(0, "#e9b94a"); g.addColorStop(0.5, "#fff6d8"); g.addColorStop(1, "#e9b94a");
      ctx.fillStyle = egg ? `hsl(${(t * 140) % 360},90%,70%)` : g;
      ctx.shadowBlur = 20 + this.logoPop * 20; ctx.shadowColor = egg ? `hsl(${(t * 160) % 360},90%,60%)` : "rgba(242,193,78,0.8)";
      ctx.fillText("ECHOES", 0, 4);
      ctx.shadowBlur = 0;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createLinearGradient(sweep - 40, -40, sweep + 40, 40);
      sg.addColorStop(0, "rgba(255,255,255,0)"); sg.addColorStop(0.5, "rgba(255,255,255,0.8)"); sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg; ctx.fillText("ECHOES", 0, 4); ctx.restore();
      ctx.font = "600 22px 'Cinzel', Georgia, serif";
      const sub = "O F   A E T H E R";
      const g2 = ctx.createLinearGradient(-120, 0, 120, 0); g2.addColorStop(0, "#6ef0a0"); g2.addColorStop(1, "#7fd4ff");
      ctx.fillStyle = g2; ctx.shadowBlur = 14; ctx.shadowColor = "#7fd4ff";
      ctx.fillText(sub, 0, 36);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(232,220,192,0.85)"; ctx.font = "italic 13px Georgia, serif";
      ctx.fillText("a cooperative adventure for two", 0, 60);
      ctx.restore();
      // sparks orbiting the emblem
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 12; i++) { const an = t * 0.8 + i * 0.52; const x = LOGO.x + Math.cos(an) * 100, y = LOGO.y - 6 + float + Math.sin(an) * 34;
        ctx.globalAlpha = a * (0.3 + 0.4 * Math.sin(an * 2)); ctx.fillStyle = i % 2 ? "#9fd8ff" : "#ffe79a"; ctx.fillRect(x, y, 2, 2); }
      ctx.restore(); ctx.globalAlpha = 1; ctx.textAlign = "left";
    }

    /** Over the sky during the intro: the spark, the heartbeats, the studio card. */
    _renderIntroOverlay(ctx, fade) {
      const t = this.t, L = GG.PAINT && GG.PAINT.lib;
      if (fade > 0) {
        ctx.fillStyle = `rgba(3,4,10,${fade})`; ctx.fillRect(0, 0, W, H);
        // the spark, and the Heart's first beats around it
        if (L && t < 3.2) {
          const s = U.clamp(t / 0.6, 0, 1) * (t > 2.8 ? Math.max(0, 1 - (t - 2.8) / 0.4) : 1);
          let beat = 0;
          for (const at of [1.1, 2.3]) { const d = t - at; if (d > 0 && d < 0.6) beat = Math.max(beat, Math.exp(-d * 6)); }
          L.nebula(ctx, W / 2, H / 2 - 20, 60 + beat * 180, "rgba(199,155,255,0.9)", (0.2 + beat * 0.5) * s);
          L.orb(ctx, W / 2, H / 2 - 20, 3 + beat * 4, "#f4ecff", "rgba(200,170,255,0.9)", 0.6 * s);
        }
      }
      // "Aether Studios presents", written across the stars
      if (t > 3.1 && t < 5.9) {
        const a = t < 3.6 ? (t - 3.1) / 0.5 : t > 5.3 ? (5.9 - t) / 0.6 : 1;
        ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
        ctx.fillStyle = "#e8ecff"; ctx.font = "600 13px 'Cinzel', Georgia, serif";
        ctx.fillText("A E T H E R   S T U D I O S", W / 2, H / 2 - 30);
        ctx.fillStyle = "rgba(232,220,192,0.8)"; ctx.font = "italic 13px Georgia, serif";
        ctx.fillText("presents", W / 2, H / 2 - 10);
        ctx.restore();
      }
      if (t > 0.6) { ctx.globalAlpha = 0.45; ctx.fillStyle = "#8f9ac2"; ctx.font = "11px 'Segoe UI', sans-serif"; ctx.textAlign = "right"; ctx.fillText("press any key to skip", W - 16, H - 14); ctx.textAlign = "left"; ctx.globalAlpha = 1; }
    }

    /** Idle slideshow of the story paintings. */
    _renderAttract(ctx) {
      const [scene, caption] = ATTRACT[this.attractIdx % ATTRACT.length];
      const P = GG.PAINT, t = this.attractT;
      ctx.save();
      const z = 1.02 + t * 0.012;
      ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
      try { P[scene](ctx, t, scene === "cavern" ? 0 : undefined); } catch (_) { ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
      const a = Math.min(1, t / 0.8) * (t > 4.7 ? Math.max(0, (5.5 - t) / 0.8) : 1);
      ctx.fillStyle = `rgba(3,4,10,${1 - a})`; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#040308"; ctx.fillRect(0, 0, W, 40); ctx.fillRect(0, H - 40, W, 40);
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
      ctx.fillStyle = "#f6ecd2"; ctx.font = "600 24px 'Cinzel', Georgia, serif"; ctx.shadowBlur = 16; ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.fillText(caption, W / 2, H - 70);
      ctx.restore();
      ctx.globalAlpha = 0.5 + Math.sin(this.clock * 3) * 0.3; ctx.fillStyle = "#e8dcc0"; ctx.textAlign = "center";
      ctx.font = "12px 'Cinzel', Georgia, serif"; ctx.fillText("PRESS ANY KEY", W / 2, H - 15);
      ctx.globalAlpha = 1; ctx.textAlign = "left";
    }
  }

  GG.title = new Title();
})(window);
