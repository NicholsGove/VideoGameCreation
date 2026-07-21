/* =========================================================================
 * game.js — top-level game controller
 * -------------------------------------------------------------------------
 * Owns the canvas, the fixed-timestep loop, the high-level state machine
 * (menu / playing / paused / complete) and wires together every subsystem:
 * input, camera, particles, audio, save, achievements, networking and the UI.
 *
 * Determinism: gameplay advances on a FIXED timestep (accumulator pattern) so
 * physics is frame-rate independent and identical for host/client. Rendering
 * interpolates on the real frame delta.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, C = GG.C, U = GG.util;

  class Game {
    constructor() {
      this.canvas = null; this.ctx = null;
      this.cam = new GG.Camera(C.VIEW_W, C.VIEW_H);
      // Split-screen cameras (each covers half the width in design space).
      this.camL = new GG.Camera(C.VIEW_W / 2, C.VIEW_H);
      this.camR = new GG.Camera(C.VIEW_W / 2, C.VIEW_H);
      this.fx = new GG.Particles(700);
      this.weather = new GG.Weather();
      this.level = null;
      this._transition = { active: false, t: 0, dur: 0.55, phase: "in", title: "", subtitle: "" };
      this.mode = "local";           // "local" | "online"
      this.role = "host";            // when online: "host" | "client"
      this.state = "menu";           // menu | playing | paused | complete
      this.levelId = 1;
      this.charAssign = [0, 1];       // [p0 char, p1 char]
      this._accum = 0; this._last = 0; this._raf = null;
      this._netSendCtr = 0;
      this._remoteInput = { left: false, right: false, up: false, jumpPressed: false, action: false };
      // Press-edges (jump/special/attack) buffered until a physics step
      // consumes them. Without this, frames that run zero fixed steps (common
      // on 144Hz+ displays, where frame dt < 1/120) silently eat key presses —
      // the classic "sometimes my jump doesn't come out" bug.
      this._edgeBuf = [{}, {}];
      this._wasWon = false;
      this.achievements = null;
    }

    init() {
      this.canvas = document.getElementById("game");
      this.canvas.width = C.CANVAS_W; this.canvas.height = C.CANVAS_H;
      this.ctx = this.canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      GG.input.attach();
      this.achievements = new GG.Achievements(GG.save);
      this._applySettings(GG.save.settings);
      this._wireNet();
      this._wireMeta();
      // Cinematic title scene + opening sequence.
      GG.title.init(this);
      GG.title.startIntro();
      GG.bus.on("title:ready", () => { if (this.state === "menu") GG.ui.showMainMenu(); });
      GG.bus.on("title:attract", () => GG.ui.hideMenus());
      // Start the RAF loop.
      this._last = performance.now();
      const loop = (ts) => { this._frame(ts); this._raf = requestAnimationFrame(loop); };
      this._raf = requestAnimationFrame(loop);
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    resize() {
      // Canvas keeps a fixed internal resolution; CSS scales it. Position the
      // DOM UI overlay exactly over the canvas rect.
      const r = this.canvas.getBoundingClientRect();
      const ui = document.getElementById("ui");
      ui.style.left = r.left + "px"; ui.style.top = r.top + "px";
      ui.style.width = r.width + "px"; ui.style.height = r.height + "px";
    }

    // ---- Settings application -------------------------------------------
    _applySettings(s) {
      GG.audio.applyVolumes({
        master: s.audio.master, music: s.audio.music, sfx: s.audio.sfx, voice: s.audio.voice,
      });
      this.cam.enabledShake = s.graphics.shake;
      this.fx.enabled = s.graphics.particles;
      if (s.bindings) GG.input.setBindings(s.bindings);
    }
    applySettings() { this._applySettings(GG.save.settings); }

    // ---- Session lifecycle ----------------------------------------------
    startLocal(levelId) {
      this.mode = "local"; this.role = "host";
      GG.audio.resume(); GG.audio.startMusic();
      this._loadLevel(levelId || 1);
      this.state = "playing";
      GG.ui.hideMenus(); GG.ui.showHUD();
    }

    startOnline(role, levelId) {
      this.mode = "online"; this.role = role;
      GG.audio.resume(); GG.audio.startMusic();
      this._loadLevel(levelId || 1);
      this.state = "playing";
      GG.ui.hideMenus(); GG.ui.showHUD();
      if (role === "host") this._broadcastLevel();
    }

    _loadLevel(id) {
      this.levelId = id;
      const data = GG.LEVELS.find(l => l.id === id) || GG.LEVELS[0];
      this.fx.clear();
      this.level = new GG.Level(data, this.cam, this.fx, this.charAssign);
      this.level.beginTiming();
      this._wasWon = false;
      this.weather.setForLevel(data);
      // The Level only bounds the camera it was handed, so the split-screen
      // cameras need the same world bounds — otherwise they clamp to the
      // level's top-left corner and both halves show the start of the maze.
      const tw = this.level.tilemap.w, th = this.level.tilemap.h;
      this.camL.setBounds(tw, th);
      this.camR.setBounds(tw, th);
      // snap all cameras to their targets immediately
      this.cam.update(0.0001, this.level.players);
      this.camL.update(0.0001, [this.level.players[0]]);
      this.camR.update(0.0001, [this.level.players[1]]);
      // Cinematic entrance card.
      this.startTransition(`${data.biome || data.name}`, `${data.name} — Aether Shard ${id}`);
      GG.bus.emit("level:loaded", { id, name: data.name, hint: data.hint });
    }

    restartLevel() {
      if (this.mode === "online" && this.role === "client") return; // host controls
      this._loadLevel(this.levelId);
      this.state = "playing";
      if (this.mode === "online" && this.role === "host") this._broadcastLevel();
      GG.ui.hideMenus(); GG.ui.showHUD();
    }

    /** Advance along the campaign order, playing a chapter cinematic if the
     *  finished level closed out a chapter. */
    nextLevel() {
      const order = GG.CAMPAIGN;
      const i = order.indexOf(this.levelId);
      const next = (i >= 0 && i + 1 < order.length) ? order[i + 1] : null;
      const cur = GG.LEVELS.find(l => l.id === this.levelId);
      const chap = cur && GG.CHAPTERS.find(c => c.id === cur.chapter);
      const endedChapter = chap && this.levelId === chap.to;
      const go = () => {
        if (next == null) { this.toMenu(); return; }
        if (this.mode === "online") this.startOnline(this.role, next);
        else this.startLocal(next);
      };
      if (endedChapter && GG.CUTSCENES["ch" + chap.id + "_end"]) {
        this.playCutscene("ch" + chap.id + "_end", go);
      } else go();
    }

    /** Play a story cinematic, then run `after`. */
    playCutscene(id, after) {
      this.state = "cutscene";
      this.level = null;
      GG.ui.hideMenus(); GG.ui.hideHUD();
      GG.cutscene.play(id, () => { if (after) after(); else this.toMenu(); });
    }

    toMenu() {
      this.state = "menu"; this.level = null;
      if (this.mode === "online") GG.net.close();
      this.mode = "local";
      GG.title.phase = "title"; GG.title.t = 0; GG.title.idle = 0;  // skip the intro on return
      GG.ui.showMainMenu();
    }

    pause() {
      if (this.state !== "playing") return;
      // True pause only in local play; online keeps simulating on the host.
      if (this.mode === "local") this.state = "paused";
      GG.ui.showPause();
    }
    resume() {
      if (this.state === "paused") this.state = "playing";
      GG.ui.hideMenus(); GG.ui.showHUD();
    }

    // ---- Networking wiring ----------------------------------------------
    _wireNet() {
      GG.net.onInput((inp) => {                                   // host receives client input
        // a press-edge in one packet must not be erased by the next packet
        const b = this._edgeBuf[1];
        b.jump = b.jump || !!inp.jumpPressed;
        b.special = b.special || !!inp.specialPressed;
        b.attack = b.attack || !!inp.attackPressed;
        this._remoteInput = inp;
      });
      GG.net.onState((snap) => { if (this.level) this.level.applySnapshot(snap); }); // client applies
      GG.net.onLevel((info) => {                                  // client sets up level
        this.charAssign = info.chars || [0, 1];
        this.mode = "online"; this.role = "client";
        this._loadLevel(info.id);
        this.state = "playing";
        GG.ui.hideMenus(); GG.ui.showHUD();
      });
      GG.bus.on("net:disconnected", () => {
        if (this.mode === "online") GG.ui.toast("Connection lost", "Returning to menu");
        this.toMenu();
      });
    }
    _broadcastLevel() { GG.net.sendLevel({ id: this.levelId, chars: this.charAssign }); }

    _wireMeta() {
      GG.bus.on("level:complete", (res) => {
        GG.save.recordCompletion(res.id, res);
        GG.save.addGems(res.gems);
        this.achievements.evaluate(res);
      });
      GG.bus.on("player:death", () => { GG.save.addDeath(); });
    }

    // ---- Per-frame -------------------------------------------------------
    _frame(ts) {
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > C.MAX_FRAME) dt = C.MAX_FRAME;

      GG.input.pollGamepads(dt);   // controller auto-detection + menu nav

      // Global hotkeys (keyboard Esc or gamepad Start).
      if (GG.input.globalPressed("pause") || GG.input.padStartPressed) {
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
      }
      if (this.state === "playing" && GG.input.globalPressed("restart")) this.restartLevel();
      // Co-op pings: F marks for Player 1, / (slash) for Player 2.
      if (this.state === "playing" && this.level) {
        const ping = (p) => {
          this.level.pings.push({ x: p.cx, y: p.y - 26, t: 3, color: p.character.body });
          GG.audio.sfx("uihover");
        };
        if (GG.input.wasPressed("KeyF")) ping(this.level.players[0]);
        if (GG.input.wasPressed("Slash")) ping(this.level.players[1]);
      }

      if (this.state === "playing") {
        this._sim(dt);
      }

      this._render(dt);
      GG.ui.tick(this);          // update HUD text
      GG.input.endFrame();
    }

    _buildLocalInput(playerIndex) {
      // Merge WASD + Arrow bindings so a single online player can use either.
      const a = GG.input.snapshot(0), b = GG.input.snapshot(1);
      return {
        left: a.left || b.left, right: a.right || b.right, up: a.up || b.up,
        down: a.down || b.down,
        jumpPressed: a.jumpPressed || b.jumpPressed, action: a.action || b.action,
      };
    }

    /** Merge a snapshot with any still-unconsumed press edges for slot i. */
    _bufEdges(i, snap) {
      const b = this._edgeBuf[i];
      snap.jumpPressed = snap.jumpPressed || !!b.jump;
      snap.specialPressed = snap.specialPressed || !!b.special;
      snap.attackPressed = snap.attackPressed || !!b.attack;
      b.jump = snap.jumpPressed; b.special = snap.specialPressed; b.attack = snap.attackPressed;
      return snap;
    }

    _sim(dt) {
      const lvl = this.level; if (!lvl) return;

      // Assign inputs based on mode/role (press-edges buffered until consumed).
      if (this.mode === "local") {
        lvl.players[0].input = this._bufEdges(0, GG.input.snapshot(0));
        lvl.players[1].input = this._bufEdges(1, GG.input.snapshot(1));
      } else if (this.role === "host") {
        lvl.players[0].input = this._bufEdges(0, this._buildLocalInput());
        lvl.players[1].input = this._bufEdges(1, Object.assign({}, this._remoteInput));
      } else { // client
        const mine = this._buildLocalInput();
        GG.net.sendInput(mine);           // send our input upstream
        lvl.players[1].input = mine;       // local echo (overwritten by snapshots)
      }

      if (this.role === "client" && this.mode === "online") {
        // Client does NOT simulate authoritative physics; it only advances
        // visuals and relies on host snapshots (applied via onState).
        lvl.renderTick(dt);
      } else {
        // Fixed-timestep authoritative simulation.
        this._accum += dt;
        let steps = 0;
        while (this._accum >= C.FIXED_DT && steps < 8) {
          lvl.step(C.FIXED_DT);
          this._accum -= C.FIXED_DT; steps++;
          // After the first sub-step, clear one-shot jump so we don't multi-jump.
          if (this.mode === "local") {
            lvl.players[0].input = Object.assign({}, lvl.players[0].input, { jumpPressed: false });
            lvl.players[1].input = Object.assign({}, lvl.players[1].input, { jumpPressed: false });
          } else if (this.role === "host") {
            lvl.players[0].input = Object.assign({}, lvl.players[0].input, { jumpPressed: false });
          }
        }
        this.fx.update(dt);
        // The edges were consumed by at least one step — release the buffer.
        if (steps > 0) this._edgeBuf = [{}, {}];
        // Host broadcasts snapshots at ~30 Hz.
        if (this.role === "host" && this.mode === "online") {
          if ((this._netSendCtr++ & 1) === 0) GG.net.sendState(lvl.snapshot());
        }
      }

      // Win transition (works for host and client via level.won).
      if (lvl.won && !this._wasWon) {
        this._wasWon = true;
        this._onLevelComplete();
      }
    }

    _onLevelComplete() {
      this.state = "complete";
      GG.audio.sfx("victory");
      const lvl = this.level;
      // Client records its own local progress too (host already did via event).
      if (this.role === "client") {
        GG.save.recordCompletion(lvl.id, {
          id: lvl.id, timeMs: lvl.timeMs, gems: lvl.gemsCollected,
          totalGems: lvl.totalGems, deaths: lvl.deaths, noDeath: lvl.deaths === 0,
        });
      }
      setTimeout(() => GG.ui.showComplete(this, {
        id: lvl.id, timeMs: lvl.timeMs, gems: lvl.gemsCollected,
        totalGems: lvl.totalGems, deaths: lvl.deaths,
      }), 700);
    }

    // ---- Cinematic transitions ------------------------------------------
    startTransition(title, subtitle) {
      this._transition = { active: true, t: 0, dur: 1.0, title: title || "", subtitle: subtitle || "" };
    }

    // ---- Rendering -------------------------------------------------------
    // The canvas backing store is 1920x1080; we scale the context by
    // RENDER_SCALE (2) so all draw calls use the 960x540 design space and come
    // out crisp at native 1080p. CSS then fits the 16:9 canvas to the window.
    _render(dt) {
      const ctx = this.ctx, S = C.RENDER_SCALE;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, C.CANVAS_W, C.CANVAS_H);
      ctx.setTransform(S, 0, 0, S, 0, 0);

      if (this.state === "cutscene") { GG.cutscene.render(ctx, dt); return; }

      if (this.level) this.weather.update(dt, this.level);

      if (!this.level) {
        this._renderMenuBackdrop(ctx, dt);
      } else if (this._useSplit()) {
        const lvl = this.level;
        if (this.state === "playing") {
          this.camL.update(dt, [lvl.players[0]]);
          this.camR.update(dt, [lvl.players[1]]);
        }
        const half = C.VIEW_W / 2;
        this._renderView(ctx, lvl, this.camL, dt, { x: 0, y: 0, w: half, h: C.VIEW_H });
        this._renderView(ctx, lvl, this.camR, dt, { x: half, y: 0, w: half, h: C.VIEW_H });
        // divider + a nameplate per half so it's obvious whose view is whose
        ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(half - 2, 0, 4, C.VIEW_H);
        const tag = (x, p, who) => {
          ctx.fillStyle = p.character.body; ctx.fillRect(x, 0, half, 3);
          ctx.fillStyle = "rgba(5,4,10,0.7)"; ctx.fillRect(x + 10, 9, 132, 21);
          ctx.fillStyle = p.character.light;
          ctx.font = "700 13px 'Cinzel', Georgia, serif";
          ctx.fillText(`${who} · ${p.character.name}${p.dead ? " ☠" : ""}`, x + 18, 24);
        };
        tag(0, lvl.players[0], "PLAYER 1");
        tag(half, lvl.players[1], "PLAYER 2");
      } else {
        const lvl = this.level;
        if (this.state === "playing") this.cam.update(dt, lvl.players);
        this._renderView(ctx, lvl, this.cam, dt, { x: 0, y: 0, w: C.VIEW_W, h: C.VIEW_H });
      }

      this._renderTransition(ctx, dt);
    }

    /** Split-screen kicks in (local only) when players separate a lot. */
    _useSplit() {
      const g = GG.save.settings.graphics;
      if (!g.splitscreen || this.mode === "online" || !this.level) return false;
      const p = this.level.players;
      const dx = Math.abs(p[0].cx - p[1].cx), dy = Math.abs(p[0].cy - p[1].cy);
      return dx > 640 || dy > 380;
    }

    /** Render one camera view into a clipped viewport rect (design space). */
    _renderView(ctx, lvl, cam, dt, vp) {
      const g = GG.save.settings.graphics;
      ctx.save();
      ctx.beginPath(); ctx.rect(vp.x, vp.y, vp.w, vp.h); ctx.clip();
      ctx.translate(vp.x, vp.y);

      lvl.renderBackground(ctx, cam);
      this.weather.renderBack(ctx, cam, lvl);

      ctx.save();
      cam.apply(ctx);
      lvl.renderWorld(ctx, cam);
      this.fx.render(ctx);
      this.weather.renderWorld(ctx, cam, lvl);
      ctx.restore();

      lvl.renderLighting(ctx, cam, g.lighting, g.bloom !== false);
      this.weather.renderFront(ctx, cam, lvl);
      ctx.restore();
    }

    _renderTransition(ctx, dt) {
      const tr = this._transition;
      if (!tr || !tr.active) return;
      tr.t += dt;
      const p = Math.min(1, tr.t / tr.dur);
      // Fade FROM black (cinematic entrance) with a title card that lingers.
      const alpha = 1 - p;
      if (alpha <= 0.001) { tr.active = false; return; }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
      const textA = Math.min(1, (1 - p) * 2.2);
      if (textA > 0 && tr.title) {
        ctx.globalAlpha = textA;
        ctx.textAlign = "center";
        ctx.fillStyle = "#e8ecff";
        ctx.font = "700 30px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText(tr.title, C.VIEW_W / 2, C.VIEW_H / 2 - 6);
        ctx.fillStyle = "#8f9ac2";
        ctx.font = "500 14px 'Segoe UI', system-ui, sans-serif";
        ctx.fillText(tr.subtitle, C.VIEW_W / 2, C.VIEW_H / 2 + 20);
      }
      ctx.restore();
      ctx.globalAlpha = 1; ctx.textAlign = "left";
    }

    _renderMenuBackdrop(ctx, dt) {
      // The cinematic title scene owns the menu backdrop.
      GG.title.render(ctx, dt);
    }
  }

  GG.Game = Game;
  GG.game = new Game();
})(window);
