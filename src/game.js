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
      this.camL.enabledShake = this.camR.enabledShake = s.graphics.shake;
      if (GG.setColorblind) GG.setColorblind(!!s.gameplay.colorblind);
      // assist mode / perks change hearts and trap speed: re-apply live
      if (this.worldMode && this.level && GG.world.state) GG.world.applyPowers(this.level);
      this.fx.enabled = s.graphics.particles;
      if (s.bindings) GG.input.setBindings(s.bindings);
    }
    applySettings() { this._applySettings(GG.save.settings); }

    // ---- Session lifecycle ----------------------------------------------
    // ---- Open world ---------------------------------------------------------
    /** Local co-op journey through the open world. fresh=true starts over. */
    startWorld(fresh, opts) {
      this.mode = "local"; this.role = "host";
      this.worldMode = true; this.mapOpen = false;
      GG.audio.resume(); GG.audio.startMusic();
      const st = GG.world.begin(fresh, opts);
      this._loadRoom(st.room, st.door, { banner: true });
      this.state = "playing";
      GG.ui.hideMenus(); GG.ui.showHUD();
      if (fresh) setTimeout(() => GG.ui.toast("🗺 Explore together", "Discover 100% of the world to finish"), 1200);
    }

    /** Online journey: the host's save drives the world; the client mirrors it. */
    startWorldOnline(role) {
      this.mode = "online"; this.role = role;
      this.worldMode = true; this.mapOpen = false;
      GG.audio.resume(); GG.audio.startMusic();
      if (role === "host") {
        const st = GG.world.begin(false);
        this._loadRoom(st.room, st.door, { banner: true });
        this.state = "playing";
        GG.ui.hideMenus(); GG.ui.showHUD();
        this._broadcastRoom();
      }
    }

    _broadcastRoom(extra) {
      if (this.mode !== "online" || this.role !== "host") return;
      GG.net.sendLevel(Object.assign(GG.world.syncInfo(), { chars: this.charAssign }, extra || {}));
    }

    /** Build and enter a room of the open world. */
    _loadRoom(roomId, door, opts) {
      opts = opts || {};
      const prevRegion = this.level && this.level.data ? this.level.data.region : null;
      this.fx.clear();
      this.level = GG.world.makeLevel(roomId, door, this.cam, this.fx, this.charAssign);
      const lvl = this.level, data = lvl.data;
      this.levelId = data.id;
      this._wasWon = false;
      lvl.onPassage = (pas) => this._travel(pas);
      lvl.onPower = (power) => this._onPowerGained(power);
      this.weather.setForLevel(data);
      GG.audio.setMusicTheme(data.theme);
      if (GG.audio.setAmbience) GG.audio.setAmbience(data.theme);
      // the first time the party sets foot in a region: a short scene
      const ws = GG.world.state;
      if (this._intro && this._intro.region !== data.region) this._intro = null;
      if (ws && !GG.world.remote && data.region != null && !ws.seenRegions[data.region]) {
        ws.seenRegions[data.region] = 1;
        this._intro = { t: 0, region: data.region };
        if (GG.score) { GG.score.cue("whoosh"); setTimeout(() => GG.score.cue("choir"), 500); }
      }
      const tw = lvl.tilemap.w, th = lvl.tilemap.h;
      this.camL.setBounds(tw, th); this.camR.setBounds(tw, th);
      for (let i = 0; i < 30; i++) this.cam.update(0.1, lvl.players);   // settle instantly
      this.camL.update(0.0001, [lvl.players[0]]); this.camR.update(0.0001, [lvl.players[1]]);
      if (opts.banner || prevRegion !== data.region) {
        this._banner = { t: 0, title: data.biome, sub: data.name !== data.biome ? data.name : "" };
      } else if (data.name !== data.biome) {
        this._banner = { t: 0, title: data.name, sub: "", small: true };
      }
      this._travelFade = { t: 0, phase: "in" };
      // stepping into the very last unexplored room completes the map
      if (!(this.mode === "online" && this.role === "client") && GG.world.complete && !GG.world.state.done) this._worldEnding();
    }

    /** Both heroes stepped into a doorway: carry the party to the next room. */
    _travel(pas) {
      if (this.mode === "online" && this.role === "client") return;
      if (this._travelFade && this._travelFade.phase === "out") return;
      const lvl = this.level;
      GG.world.captureRoom(lvl);
      const dest = GG.world.destination(lvl.roomId, pas.door);
      GG.world.state.room = dest.room; GG.world.state.door = dest.door;
      GG.world.persist();
      GG.bus.emit("teleport:used", {});
      this._travelFade = { t: 0, phase: "out", dest };
    }

    /** Fast travel between shrines (both heroes go together). */
    fastTravel(roomId, door) {
      if (this.mode === "online" && this.role === "client") return;
      if (this.level) GG.world.captureRoom(this.level);
      GG.world.state.room = roomId; GG.world.state.door = door;
      GG.world.persist();
      GG.bus.emit("teleport:used", {});
      this.state = "playing"; GG.ui.hideMenus(); GG.ui.showHUD();
      this._travelFade = { t: 0, phase: "out", dest: { room: roomId, door } };
    }

    _finishTravel(dest) {
      this._loadRoom(dest.room, dest.door);
      this._broadcastRoom();
    }

    _onPowerGained(power) {
      const lvl = this.level;
      if (GG.world.grantPower(power, lvl)) {
        GG.audio.sfx("achieve"); setTimeout(() => GG.audio.sfx("victory"), 350);
        GG.ui.showPowerGained(power);
        this._broadcastRoom({ update: true, power });
      }
    }

    toggleMap(force) {
      if (!this.worldMode || !this.level) return;
      this.mapOpen = force != null ? force : !this.mapOpen;
      GG.bus.emit(this.mapOpen ? "ui:nav" : "ui:transition");
    }

    /** 100% discovered: the Heart wakes and the story ends. */
    _worldEnding() {
      if (this._ending) return;
      this._ending = true;
      const st = GG.world.state;
      st.done = true;
      GG.world.persist();
      const stats = { timeMs: st.timeMs, deaths: st.deaths, gems: st.gems, slain: st.slain, powers: st.powers.length, pct: GG.world.percent,
                      splits: Object.assign({}, st.splits), combos: st.combos || 0, ng: st.ng || 0, upgrades: Object.keys(st.upgrades || {}).length };
      // best journey time (per New Game+ level)
      const bests = GG.save.data.bestJourney || (GG.save.data.bestJourney = {});
      const bk = "ng" + (st.ng || 0);
      stats.best = !bests[bk] || st.timeMs < bests[bk];
      if (stats.best) { bests[bk] = st.timeMs; GG.save.save(); }
      this._broadcastRoom({ ending: true, stats });
      GG.ui.toast("✦ 100% DISCOVERED ✦", "The Heart of Aether awakens…");
      setTimeout(() => {
        this.mapOpen = false;
        this.playCutscene(GG.CUTSCENES.journey_end ? "journey_end" : "ch6_end", () => { this._ending = false; this.worldMode = false; GG.ui.showWorldEnd(stats); });
      }, 2600);
    }

    startLocal(levelId) {
      this.worldMode = false;
      this.mode = "local"; this.role = "host";
      GG.audio.resume(); GG.audio.startMusic();
      this._loadLevel(levelId || 1);
      this.state = "playing";
      GG.ui.hideMenus(); GG.ui.showHUD();
    }

    startOnline(role, levelId) {
      this.worldMode = false;
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
      GG.audio.setMusicTheme(data.theme);      // soundtrack follows the biome
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

    restartLevel(resetRoom) {
      if (this.mode === "online" && this.role === "client") return; // host controls
      if (this.worldMode) {
        // back to the doorway you came in by (optionally resetting the room)
        const lvl = this.level;
        if (resetRoom) delete GG.world.state.rooms[lvl.roomId];
        else GG.world.captureRoom(lvl);
        this._loadRoom(lvl.roomId, GG.world.state.door);
        this.state = "playing";
        this._broadcastRoom();
        GG.ui.hideMenus(); GG.ui.showHUD();
        return;
      }
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
      if (this.worldMode && this.level && !GG.world.remote) { GG.world.captureRoom(this.level); GG.world.persist(); }
      this.worldMode = false; this.mapOpen = false; this._intro = null;
      if (GG.audio.setAmbience) GG.audio.setAmbience(null);
      this.state = "menu"; this.level = null;
      if (this.mode === "online") GG.net.close();
      this.mode = "local";
      if (GG.title.returnToTitle) GG.title.returnToTitle(); else { GG.title.phase = "title"; GG.title.t = 0; GG.title.idle = 0; }  // skip the intro on return
      GG.ui.showMainMenu();
    }

    pause() {
      if (this.state !== "playing") return;
      // True pause only in local play; online keeps simulating on the host.
      if (this.mode === "local") this.state = "paused";
      GG.ui.showPause();
    }
    resume() {
      GG.ui._shopOpen = false;
      if (this.state === "paused") this.state = "playing";
      GG.ui.hideMenus(); GG.ui.showHUD();
    }

    // ---- Networking wiring ----------------------------------------------
    _wireNet() {
      GG.net.onInput((inp) => {                                   // host receives client input
        // Edges arrive as running counters (robust to dropped packets): any
        // increase since the last packet is a fresh press.
        const seen = this._remoteSeen || (this._remoteSeen = { j: 0, s: 0, a: 0, p: 0, m: 0, d: 0 });
        const b = this._edgeBuf[1];
        if (inp.nj != null) {
          if (inp.nj > seen.j) b.jump = true;
          if (inp.ns > seen.s) b.special = true;
          if (inp.na > seen.a) b.attack = true;
          if (inp.np > seen.p) this._remotePing = true;
          if ((inp.nm || 0) > seen.m) b.melee = true;
          if ((inp.nd || 0) > seen.d) b.dodge = true;
          seen.m = Math.max(seen.m, inp.nm || 0); seen.d = Math.max(seen.d, inp.nd || 0);
          seen.j = Math.max(seen.j, inp.nj); seen.s = Math.max(seen.s, inp.ns);
          seen.a = Math.max(seen.a, inp.na); seen.p = Math.max(seen.p, inp.np);
        } else {
          b.jump = b.jump || !!inp.jumpPressed;
          b.special = b.special || !!inp.specialPressed;
          b.attack = b.attack || !!inp.attackPressed;
          b.melee = b.melee || !!inp.meleePressed;
          b.dodge = b.dodge || !!inp.dodgePressed;
        }
        this._remoteInput = Object.assign({}, inp, { jumpPressed: false, specialPressed: false, attackPressed: false, meleePressed: false, dodgePressed: false });
      });
      GG.net.onState((snap) => {                                  // client applies + reconciles
        if (!this.level) return;
        const lvl = this.level;
        const me = lvl.players[1], other = lvl.players[0];
        const pred = { x: me.x, y: me.y, vx: me.vx, vy: me.vy, dead: me.dead };
        const oPrev = { x: other.x, y: other.y };
        lvl.applySnapshot(snap);
        // OUR hero: the local prediction is fresher than the host's echo
        // (which lags by a round-trip). Keep it unless the host disagrees
        // hard — walls, deaths, teleports — then snap to the truth.
        if (!me.dead && !pred.dead) {
          const d = Math.hypot(me.x - pred.x, me.y - pred.y);
          if (d < 90) {
            me.x = pred.x + (me.x - pred.x) * 0.15;   // gentle drift to truth
            me.y = pred.y + (me.y - pred.y) * 0.15;
            me.vx = pred.vx; me.vy = pred.vy;
          }
        }
        // The HOST's hero: glide to each snapshot instead of stepping —
        // renderTick eases toward this target, hiding the packet cadence.
        other._netTX = other.x; other._netTY = other.y;
        other.x = oPrev.x; other.y = oPrev.y;
      });
      GG.net.onLevel((info) => {                                  // client sets up level
        if (info.world) {
          this.charAssign = info.chars || [0, 1];
          GG.world.mirror(info);
          if (info.ending) { this.worldMode = false; this.playCutscene("ch6_end", () => GG.ui.showWorldEnd(info.stats || {})); return; }
          if (info.update) {
            if (this.level) GG.world.applyPowers(this.level);
            if (info.power) GG.ui.showPowerGained(info.power);
            return;
          }
          this.mode = "online"; this.role = "client"; this.worldMode = true;
          this._loadRoom(info.room, info.door);
          this.state = "playing";
          GG.ui.hideMenus(); GG.ui.showHUD();
          return;
        }
        this.charAssign = info.chars || [0, 1];
        this.mode = "online"; this.role = "client";
        this._loadLevel(info.id);
        this.state = "playing";
        GG.ui.hideMenus(); GG.ui.showHUD();
      });
      // fresh press-counters for every new connection
      GG.bus.on("net:connected", () => { this._remoteSeen = null; this._edgeN = null; });
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
      GG.bus.on("player:death", () => { GG.save.addDeath(); if (this.worldMode && GG.world.state && !GG.world.remote) GG.world.state.deaths++; });
      const worldAchv = () => { if (this.worldMode && GG.world.state && this.achievements) this.achievements.evaluate({ world: { pct: GG.world.percent, powers: GG.world.state.powers.length } }); };
      GG.bus.on("power:gained", worldAchv);
      GG.bus.on("map:discovered", worldAchv);
      GG.bus.on("creature:slain", () => { if (this.worldMode && GG.world.state) GG.world.state.slain = (GG.world.state.slain || 0) + 1; });
      GG.bus.on("gem:collected", () => { if (this.worldMode && GG.world.state && !GG.world.remote) GG.world.state.gems = (GG.world.state.gems || 0) + 1; });
      GG.bus.on("shop:open", () => {
        if (!this.worldMode || this.state !== "playing") return;
        if (this.mode === "online" && this.role === "client") { GG.ui.toast("The merchant", "Player 1 does the trading"); return; }
        if (this.mode === "local") this.state = "paused";
        GG.ui.showShop();
      });
      GG.bus.on("boss:start", (e) => { this._bossBanner = { t: 0, name: e.name, title: e.title }; });
      GG.bus.on("boss:defeated", () => { this._broadcastRoom({ update: true }); });
      GG.bus.on("upgrade:found", () => { this._broadcastRoom({ update: true }); });
    }

    // ---- Per-frame -------------------------------------------------------
    _frame(ts) {
      let dt = (ts - this._last) / 1000;
      this._last = ts;
      if (dt > C.MAX_FRAME) dt = C.MAX_FRAME;

      GG.input.pollGamepads(dt);   // controller auto-detection + menu nav

      // Global hotkeys (keyboard Esc or gamepad Start).
      if (GG.input.globalPressed("pause") || GG.input.padStartPressed) {
        if (this.mapOpen) this.toggleMap(false);
        else if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
      }
      if (this.state === "playing" && GG.input.globalPressed("restart")) this.restartLevel();
      // World map: M or Tab (Esc also closes it)
      if (this.worldMode && (this.state === "playing" || this.state === "paused") &&
          (GG.input.wasPressed("KeyM") || GG.input.wasPressed("Tab"))) {
        if (this.state === "paused") { this.resume(); this.toggleMap(true); } else this.toggleMap();
      }
      // H hides / shows the in-world tutorial tips (unless H was rebound to a move).
      if (this.state === "playing" && this.level && GG.input.wasPressed("KeyH")) {
        const b = GG.input.bindings || {};
        const bound = [b.p0, b.p1].some(m => m && Object.values(m).includes("KeyH"));
        if (!bound) {
          const g = GG.save.settings.gameplay;
          if (g.tutorials === "off") { g.tutorials = g._tutorialsWas || "smart"; GG.ui.toast("Tips shown", "Press H to hide them again"); }
          else { g._tutorialsWas = g.tutorials || "smart"; g.tutorials = "off"; GG.ui.toast("Tips hidden", "Press H to bring them back"); }
          GG.save.saveSettings(); GG.audio.sfx("uihover");
        }
      }
      // Co-op pings: F marks for Player 1, / (slash) for Player 2.
      if (this.state === "playing" && this.level) {
        const ping = (p) => {
          this.level.pings.push({ x: p.cx, y: p.y - 26, t: 3, color: p.character.body });
          GG.audio.sfx("uihover");
        };
        if (this.mode === "local") {
          if (GG.input.wasPressed("KeyF")) ping(this.level.players[0]);
          if (GG.input.wasPressed("Slash")) ping(this.level.players[1]);
        } else if (this.role === "host") {
          if (GG.input.wasPressed("KeyF")) ping(this.level.players[0]);
          if (this._remotePing) { this._remotePing = false; ping(this.level.players[1]); }
        }
      }

      // map cursor: move with WASD / arrows, P or Enter drops a pin
      if (this.mapOpen && this.worldMode) this._mapKeys();
      // region intro: any jump / Enter skips once it has been on screen a moment
      if (this._intro) {
        this._intro.t += dt;
        const skip = this._intro.t > 1.2 && (GG.input.wasPressed("Enter") || GG.input.wasPressed("Space") || GG.input.actionPressed(0, "up") || GG.input.actionPressed(1, "up"));
        if (this._intro.t > 5.2 || skip) this._intro = null;
      }
      if (this.state === "playing") {
        const tf = this._travelFade;
        if (tf && tf.phase === "out") {
          tf.t += dt;
          if (tf.t >= 0.24) { const d = tf.dest; this._travelFade = null; this._finishTravel(d); }
        } else if (!((this.mapOpen || this._intro) && this.mode === "local")) {
          this._sim(dt);
        }
      }

      this._render(dt);
      GG.ui.tick(this);          // update HUD text
      GG.input.endFrame();
    }

    /** Online: this machine's hero, driven ONLY by that hero's own keys
     *  (host = Player 1 = WASD set, client = Player 2 = arrow set). */
    _buildLocalInput() {
      return GG.input.snapshotOnline(this.role === "client" ? 1 : 0);
    }

    /** Merge a snapshot with any still-unconsumed press edges for slot i. */
    _bufEdges(i, snap) {
      const b = this._edgeBuf[i];
      snap.jumpPressed = snap.jumpPressed || !!b.jump;
      snap.specialPressed = snap.specialPressed || !!b.special;
      snap.attackPressed = snap.attackPressed || !!b.attack;
      snap.meleePressed = snap.meleePressed || !!b.melee;
      snap.dodgePressed = snap.dodgePressed || !!b.dodge;
      b.jump = snap.jumpPressed; b.special = snap.specialPressed; b.attack = snap.attackPressed;
      b.melee = snap.meleePressed; b.dodge = snap.dodgePressed;
      return snap;
    }

    _sim(dt) {
      const lvl = this.level; if (!lvl) return;

      // Hit-stop: on meaty hits the whole sim freezes for a few frames.
      // Rendering continues, so the freeze reads as impact, not lag.
      if (!this._hitWired) {
        this._hitWired = true;
        GG.bus.on("hit:stop", (e) => { this._hitStop = Math.max(this._hitStop || 0, (e && e.s) || 0.06); });
        GG.bus.on("player:death", () => { this._deathFlash = 0.45; });
      }
      if (this._hitStop > 0) { this._hitStop -= dt; this._accum = 0; return; }

      // Assign inputs based on mode/role (press-edges buffered until consumed).
      if (this.mode === "local") {
        lvl.players[0].input = this._bufEdges(0, GG.input.snapshot(0));
        lvl.players[1].input = this._bufEdges(1, GG.input.snapshot(1));
      } else if (this.role === "host") {
        lvl.players[0].input = this._bufEdges(0, this._buildLocalInput());
        lvl.players[1].input = this._bufEdges(1, Object.assign({}, this._remoteInput));
      } else { // client
        const mine = this._buildLocalInput();
        // Press-edges travel as running counters: the fast lane is unreliable,
        // and a dropped packet must never swallow a jump or a shot.
        const n = this._edgeN || (this._edgeN = { j: 0, s: 0, a: 0, p: 0, m: 0, d: 0 });
        if (mine.meleePressed) n.m++;
        if (mine.dodgePressed) n.d++;
        if (mine.jumpPressed) n.j++;
        if (mine.specialPressed) n.s++;
        if (mine.attackPressed) n.a++;
        if (mine.pingPressed) n.p++;
        GG.net.sendInput(Object.assign({}, mine, { nj: n.j, ns: n.s, na: n.a, np: n.p, nm: n.m, nd: n.d }));
        lvl.players[1].input = mine;       // local echo (overwritten by snapshots)
      }

      if (this.role === "client" && this.mode === "online") {
        // The client never simulates AUTHORITATIVE physics — but it does
        // PREDICT its own hero locally so controls feel instant instead of
        // arriving a full round-trip late. Snapshots from the host remain
        // the truth: onState reconciles the prediction against them.
        lvl.renderTick(dt);
        this._accum += dt;
        let psteps = 0;
        while (this._accum >= C.FIXED_DT && psteps < 8) {
          const me = lvl.players[1];
          if (!me.dead) me.update(C.FIXED_DT, lvl);
          this._accum -= C.FIXED_DT; psteps++;
          me.input = Object.assign({}, me.input, { jumpPressed: false, specialPressed: false, attackPressed: false, meleePressed: false, dodgePressed: false });
        }
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
        // Host broadcasts snapshots every frame (~60 Hz) — the fast lane is
        // unreliable, so a lost packet just means the next one lands sooner.
        if (this.role === "host" && this.mode === "online" && steps > 0) {
          GG.net.sendState(lvl.snapshot());
        }
      }

      // Open world: discovery, autosave, and the 100% ending.
      if (this.worldMode && lvl === this.level && !(this.mode === "online" && this.role === "client")) {
        const fresh = GG.world.tick(lvl, dt);
        if (fresh) {
          this._broadcastRoom({ update: true });
          GG.bus.emit("map:discovered", { pct: GG.world.percent });
          if (GG.world.complete) this._worldEnding();
        }
      }
      // Beasts nearby? Bring in the combat layer of the music.
      if (this.worldMode && lvl === this.level && GG.audio && GG.audio.setCombat) {
        let near = 0;
        for (const o of lvl.objects) {
          if (!(o instanceof GG.obj.Creature) || !o.alive) continue;
          if (lvl.players.some(p => !p.dead && Math.abs(p.cx - o.cx) < 420 && Math.abs(p.cy - o.cy) < 300)) near++;
        }
        const big = lvl.objects.some(o => (o.guardian && o.alive && o.awake === true) || (o.front != null && o.state === 1));
        GG.audio.setCombat(big ? 1 : near ? Math.min(1, 0.5 + near * 0.25) : 0);
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

      if (this.worldMode && this.level) this._renderWorldOverlay(ctx, dt);
      this._renderTransition(ctx, dt);
    }

    /** Open-world overlays: minimap, region banner, doorway fades, full map. */
    _renderWorldOverlay(ctx, dt) {
      this._owT = (this._owT || 0) + dt;
      const t = this._owT, W = C.VIEW_W, H = C.VIEW_H;
      if (!this.mapOpen) GG.worldmap.drawMini(ctx, this.level, t);
      // region / room banner
      const b = this._banner;
      if (b) {
        b.t += dt;
        const life = b.small ? 2.2 : 3.4;
        const a = b.t < 0.5 ? b.t / 0.5 : b.t > life - 0.8 ? Math.max(0, (life - b.t) / 0.8) : 1;
        if (b.t > life) this._banner = null;
        else {
          ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
          const y = b.small ? 118 : 150;
          if (!b.small) {
            const g = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
            g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(5,4,12,0.6)"); g.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g; ctx.fillRect(W / 2 - 260, y - 34, 520, 58);
          }
          ctx.fillStyle = "#f2c14e"; ctx.font = `700 ${b.small ? 15 : 26}px 'Cinzel', Georgia, serif`;
          ctx.shadowBlur = 12; ctx.shadowColor = "rgba(242,193,78,0.6)";
          ctx.fillText(b.title, W / 2, y);
          ctx.shadowBlur = 0;
          if (b.sub) { ctx.fillStyle = "#e8dcc0"; ctx.font = "italic 13px Georgia, serif"; ctx.fillText(b.sub, W / 2, y + 20); }
          ctx.restore();
        }
      }
      // doorway fade (out when leaving, in when arriving)
      const tf = this._travelFade;
      if (tf) {
        let a = 0;
        if (tf.phase === "out") a = Math.min(1, tf.t / 0.24);
        else { tf.t += dt; a = Math.max(0, 1 - tf.t / 0.35); if (a <= 0) this._travelFade = null; }
        ctx.fillStyle = `rgba(4,4,10,${a})`; ctx.fillRect(0, 0, W, H);
      }
      this._renderBossBar(ctx, dt);
      this._renderSpeedrun(ctx);
      if (this._intro) this._renderIntro(ctx, dt);
      if (this.mapOpen) GG.worldmap.drawFull(ctx, this.level, t, this._mapCursor);
    }

    /** A guardian's health across the bottom of the screen, and its name card. */
    _renderBossBar(ctx, dt) {
      const lvl = this.level, W = C.VIEW_W, H = C.VIEW_H;
      const g = lvl.objects.find(o => o.guardian && o.alive && o.awake === true);
      const bb = this._bossBanner;
      if (bb) {
        bb.t += dt;
        if (bb.t > 3) this._bossBanner = null;
        else {
          const a = bb.t < 0.4 ? bb.t / 0.4 : bb.t > 2.4 ? (3 - bb.t) / 0.6 : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center";
          ctx.fillStyle = "rgba(5,4,12,0.6)"; ctx.fillRect(0, H / 2 - 50, W, 74);
          ctx.fillStyle = "#ff8a8a"; ctx.font = "700 30px 'Cinzel', Georgia, serif"; ctx.shadowBlur = 16; ctx.shadowColor = "#ff5a6a";
          ctx.fillText(bb.name, W / 2, H / 2 - 8); ctx.shadowBlur = 0;
          ctx.fillStyle = "#e8dcc0"; ctx.font = "italic 14px Georgia, serif"; ctx.fillText(bb.title, W / 2, H / 2 + 14);
          ctx.restore();
        }
      }
      if (!g) return;
      const w = 420, x = (W - w) / 2, y = H - 38;
      ctx.save();
      ctx.fillStyle = "rgba(5,4,12,0.75)"; ctx.fillRect(x - 6, y - 18, w + 12, 30);
      ctx.fillStyle = "#f6ecd2"; ctx.font = "700 11px 'Cinzel', Georgia, serif"; ctx.textAlign = "center";
      ctx.fillText(g.G.name + (g.phase2 ? "  ·  ENRAGED" : "") + (g.vulnerable ? "  ·  DAZED, STRIKE NOW!" : ""), W / 2, y - 5);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = g.vulnerable ? "#ffe79a" : g.G.col; ctx.fillRect(x, y, w * Math.max(0, g.hp / g.maxHp), 7);
      ctx.restore();
    }

    /** Speedrun timer + the last split (Settings > Gameplay). */
    _renderSpeedrun(ctx) {
      const gp = GG.save.settings.gameplay;
      if (!gp.speedrun || !GG.world.state) return;
      const st = GG.world.state, ms = st.timeMs || 0;
      const txt = U.formatTime(ms);
      ctx.save(); ctx.textAlign = "left";
      ctx.fillStyle = "rgba(5,4,12,0.7)"; ctx.fillRect(12, C.VIEW_H - 50, 170, 38);
      ctx.fillStyle = "#6ef0a0"; ctx.font = "700 16px monospace"; ctx.fillText(txt, 20, C.VIEW_H - 30);
      const last = Object.entries(st.splits || {}).sort((a, b) => b[1] - a[1])[0];
      if (last) { ctx.fillStyle = "#cdb488"; ctx.font = "10px monospace"; ctx.fillText(GG.WORLDGEN.POWERS[last[0]].name + " " + U.formatTime(last[1]).split(".")[0], 20, C.VIEW_H - 17); }
      ctx.restore();
    }

    /** The first steps into a region: a short scene with its landmark and lore. */
    _renderIntro(ctx, dt) {
      const it = this._intro, W = C.VIEW_W, H = C.VIEW_H, t = it.t;
      const reg = GG.WORLDGEN.REGIONS[it.region];
      const a = t < 0.6 ? t / 0.6 : t > 4.4 ? Math.max(0, (5.2 - t) / 0.8) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      // letterbox bars slide in
      const bar = 70 * Math.min(1, t / 0.5);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0.15)"); g.addColorStop(0.5, "rgba(5,4,12,0.55)"); g.addColorStop(1, "rgba(0,0,0,0.15)");
      ctx.fillStyle = g; ctx.fillRect(0, bar, W, H - bar * 2);
      // the region's landmark rises out of the dark
      const lvl = this.level;
      if (lvl && lvl.renderLandmark && lvl.data.landmark) {
        ctx.save(); ctx.globalAlpha = a * 0.9;
        const lm = lvl.data.landmark;
        const fake = { viewW: W, viewH: H, x: lm.wx - lm.ox - W / 2, y: lm.wy - lm.oy - H / 2 - 40 + (1 - Math.min(1, t / 2)) * 80, zoom: 1 };
        lvl.renderLandmark(ctx, fake);
        ctx.restore();
      }
      ctx.textAlign = "center";
      ctx.fillStyle = reg.color; ctx.font = "700 34px 'Cinzel', Georgia, serif"; ctx.shadowBlur = 20; ctx.shadowColor = reg.color;
      ctx.fillText(reg.name, W / 2, H / 2 - 10); ctx.shadowBlur = 0;
      ctx.fillStyle = "#e8dcc0"; ctx.font = "italic 15px Georgia, serif";
      const lines = reg.lore || [];
      lines.forEach((l, i) => { ctx.globalAlpha = a * U.clamp((t - 0.9 - i * 0.7) / 0.6, 0, 1); ctx.fillText(l, W / 2, H / 2 + 24 + i * 22); });
      ctx.globalAlpha = a * 0.6; ctx.font = "10px Georgia, serif"; ctx.fillStyle = "#cdb488";
      if (t > 1.2) ctx.fillText("Jump or Enter to continue", W / 2, H - bar + 22 > H - 20 ? H - 24 : H - bar + 22);
      ctx.restore();
    }

    /** Map cursor + pins. */
    _mapKeys() {
      const I = GG.input, st = GG.world.state; if (!st) return;
      const cur = GG.world.world.rooms[st.room];
      if (!this._mapCursor || this._mapCursor.room !== st.room) this._mapCursor = { x: cur.x, y: cur.y, room: st.room };
      const c = this._mapCursor;
      if (I.wasPressed("KeyA") || I.wasPressed("ArrowLeft")) c.x--;
      if (I.wasPressed("KeyD") || I.wasPressed("ArrowRight")) c.x++;
      if (I.wasPressed("KeyW") || I.wasPressed("ArrowUp")) c.y--;
      if (I.wasPressed("KeyS") || I.wasPressed("ArrowDown")) c.y++;
      if (I.wasPressed("KeyP") || I.wasPressed("Enter") || I.wasPressed("Space")) {
        const k = c.x + "," + c.y, i = st.pins.indexOf(k);
        if (i >= 0) st.pins.splice(i, 1); else st.pins.push(k);
        GG.bus.emit(i >= 0 ? "ui:transition" : "ui:confirm");
        GG.world.persist(); this._broadcastRoom({ update: true });
      }
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

      if (lvl.renderForeground) lvl.renderForeground(ctx, cam);
      lvl.renderLighting(ctx, cam, g.lighting, g.bloom !== false);
      this.weather.renderFront(ctx, cam, lvl);

      // Death flash: a red-black pulse that swallows the view and fades out
      // as the fallen hero respawns.
      if (this._deathFlash > 0 && g.flash === false) this._deathFlash = 0;
      if (this._deathFlash > 0) {
        this._deathFlash -= dt;
        const a = Math.max(0, this._deathFlash / 0.45);
        ctx.fillStyle = `rgba(120,10,20,${a * 0.28})`;
        ctx.fillRect(0, 0, vp.w, vp.h);
        const v = ctx.createRadialGradient(vp.w / 2, vp.h / 2, vp.h * 0.2, vp.w / 2, vp.h / 2, vp.h * 0.75);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, `rgba(10,0,4,${a * 0.55})`);
        ctx.fillStyle = v; ctx.fillRect(0, 0, vp.w, vp.h);
      }
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
