/* =========================================================================
 * level.js — runtime level: physics orchestration, rendering, net snapshots
 * -------------------------------------------------------------------------
 * Owns the tilemap, all objects, both players, the channel (signal) table and
 * the win condition. Update order is deliberate so platforms carry riders and
 * crates settle before players resolve against them.
 *
 * The Level is fully serialisable (snapshot / applySnapshot) which is what the
 * online host broadcasts each tick to keep clients in sync.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C, O = GG.obj;

  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  class Level {
    /**
     * @param {object} data     level definition (see levels.js)
     * @param {Camera} cam
     * @param {Particles} fx
     * @param {number[]} charAssign  [charIndexForP0, charIndexForP1]
     */
    constructor(data, cam, fx, charAssign) {
      this.data = data;
      this.cam = cam; this.fx = fx;
      this.id = data.id;
      this.name = data.name;
      this.theme = data.theme || "cave";
      this.dark = !!data.dark;

      this.tilemap = new GG.Tilemap(data.tiles);
      cam.setBounds(this.tilemap.w, this.tilemap.h);

      this.channels = {};        // name -> boolean
      this._forced = {};         // channel -> Set of forcing sources (latches)

      // Instantiate objects from data.
      this.objects = [];
      this.byIdMap = new Map();
      for (const o of (data.objects || [])) this._spawn(o);

      // Convenience buckets.
      this.crates = this.objects.filter(o => o instanceof O.Crate);
      this.platforms = this.objects.filter(o => o instanceof O.MovingPlatform);
      this.lasers = this.objects.filter(o => o instanceof O.Laser);
      this.mirrors = this.objects.filter(o => o instanceof O.Mirror);
      this.hazards = this.objects.filter(o => o instanceof O.Hazard);
      this.gems = this.objects.filter(o => o instanceof O.Gem);
      this.keyItems = this.objects.filter(o => o instanceof O.Key);
      this.exits = this.objects.filter(o => o instanceof O.Exit);
      this.portals = this.objects.filter(o => o instanceof O.Portal);
      // objects that are lethal on contact (moving hazards)
      this.movingHazards = this.objects.filter(o => typeof o.kills === "function" && !(o instanceof O.Hazard));

      // Players.
      this.players = [
        new GG.Player(0, charAssign ? charAssign[0] : 0, data.spawns[0]),
        new GG.Player(1, charAssign ? charAssign[1] : 1, data.spawns[1]),
      ];

      // Level state.
      this.keys = {};            // color -> count held
      this.gemsCollected = 0;
      this.totalGems = this.gems.length;
      this.secretsFound = 0;
      this.totalSecrets = this.objects.filter(o => o instanceof O.SecretSwitch).length;
      this.deaths = 0;
      this.won = false;
      this.winTimer = 0;
      this.timeMs = 0;
      this.started = false;
      this._laserHits = new Set();

      // Offscreen canvas for the darkness/lighting layer.
      this._lightCanvas = document.createElement("canvas");
      this._lightCanvas.width = C.VIEW_W; this._lightCanvas.height = C.VIEW_H;
      this._lightCtx = this._lightCanvas.getContext("2d");

      this._buildParallax();
    }

    _spawn(o) {
      const map = {
        gem: O.Gem, key: O.Key, lock: O.LockedDoor, button: O.Button, switch: O.Switch,
        door: O.Door, crate: O.Crate, platform: O.MovingPlatform, hazard: O.Hazard,
        mirror: O.Mirror, laser: O.Laser, teleporter: O.Teleporter, exit: O.Exit,
        narrow: O.NarrowGate, repair: O.RepairNode,
        bridge: O.BridgeAnchor, grapple: O.GrappleLever,
        hidden: O.HiddenPlatform, secret: O.SecretSwitch,
        portal: O.Portal, crumble: O.Crumble, blink: O.Blinker,
        crusher: O.Crusher, blade: O.Blade, rock: O.Rock,
        timeswitch: O.TimedSwitch, rotor: O.Rotor,
      };
      const Cls = map[o.type];
      if (!Cls) { console.warn("[Level] unknown object type:", o.type); return; }
      const inst = new Cls(o);
      this.objects.push(inst);
      this.byIdMap.set(inst.id, inst);
      return inst;
    }

    byId(id) { return this.byIdMap.get(id); }

    // ---- Channels (signals) ---------------------------------------------
    getChannel(name) { return name == null ? true : !!this.channels[name]; }
    setChannel(name, val) { if (name != null) this.channels[name] = !!val; }
    channelForcedBy() { return false; } // reserved hook for latching sources

    // ---- Solid set assembly ---------------------------------------------
    /** All solids relevant to `entity` this frame (tiles near it + dynamics).
     *  `includePlayers` lets crate/push passes exclude the players. */
    solidsFor(entity, includePlayers = true) {
      const near = this.tilemap.solidsIn(entity.x - 8, entity.y - 8, entity.w + 16, entity.h + 16);
      // Carried/thrown crates aren't solid (they're in flight or in your hands).
      for (const c of this.crates) if (c !== entity && !c.carried && !c.thrown) near.push(c);
      for (const p of this.platforms) near.push(p);
      for (const o of this.objects) {
        if (o instanceof O.Door || o instanceof O.LockedDoor ||
            o instanceof O.BridgeAnchor || o instanceof O.HiddenPlatform ||
            o instanceof O.Crumble || o instanceof O.Blinker) {
          const r = o.solidRect(); if (r) near.push(r);
        } else if (o instanceof O.NarrowGate) {
          // Narrow gates block everyone EXCEPT characters that fit (Lyra).
          const player = entity && entity.character;
          if (!player || !entity.character.narrow) { const r = o.solidRect(); if (r) near.push(r); }
        }
      }
      // Players are solid to each other -> enables standing on heads + pushing.
      if (includePlayers && entity && entity.character) {
        for (const p of this.players) if (p !== entity && !p.dead) near.push(p);
      }
      return near;
    }

    /** True if `rect` would intersect any solid (used for stand-up headroom). */
    overlapsSolid(rect, ignore) {
      const probe = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, character: ignore ? ignore.character : null };
      const solids = this.solidsFor(probe, false);
      for (const s of solids) {
        if (s === ignore || s.oneWay) continue;
        if (U.aabb(probe, s)) return true;
      }
      return false;
    }

    // ---- Fixed-step simulation ------------------------------------------
    step(dt) {
      if (this.won) { this.winTimer += dt; return; }
      if (this.started) this.timeMs += dt * 1000;
      for (const p of this.players) p.pushing = false; // recomputed by crate/push passes

      // 1) Platforms move first (compute per-frame delta).
      for (const p of this.platforms) p.update(dt, this);
      // 2) Carry riders (players + crates) resting on platforms.
      for (const p of this.platforms) this._carryRiders(p);

      // 3) Crates: push detection + gravity + collision.
      for (const c of this.crates) this._stepCrate(c, dt);

      // 4) Players.
      for (const p of this.players) p.update(dt, this);
      // 4b) Co-op: ride on a partner's head, and push each other around.
      this._carryPlayerRiders();
      this._resolvePlayerPush(dt);

      // 5) Interactables (switches/buttons/doors/teleporters/exits/hazards/lasers).
      for (const o of this.objects) {
        if (o instanceof O.Crate || o instanceof O.MovingPlatform) continue;
        o.update(dt, this);
      }

      // 6) Lasers traced after mirrors/crates settled.
      this._laserHits.clear();
      for (const l of this.lasers) this._traceLaser(l);

      // 7) Collectibles.
      for (const g of this.gems) for (const p of this.players) g.tryCollect(p, this);
      for (const k of this.keyItems) for (const p of this.players) k.tryCollect(p, this);

      // 8) Hazard + laser damage.
      for (const p of this.players) {
        if (p.dead) continue;
        if (this._laserHits.has(p)) { p.kill(this, "laser"); continue; }
        let killed = false;
        for (const hz of this.hazards) {
          if (hz.active(this) && U.aabb(p, hz) && hz.kills(p)) { p.kill(this, hz.kind); killed = true; break; }
        }
        // moving hazards: crushers, blades, falling rocks
        if (!killed) for (const mh of this.movingHazards) {
          if (mh.kills(p) && U.aabb(p, mh)) { p.kill(this, mh.constructor.name.toLowerCase()); killed = true; break; }
        }
        if (killed) continue;
        // Fell out of the world.
        if (p.y > this.tilemap.h + 80) p.kill(this, "pit");
      }

      // 9) Breakable tiles under weights.
      const weights = [...this.players.filter(p => !p.dead), ...this.crates];
      this.tilemap.updateBreakables(dt, weights);

      // 10) Auto-respawn dead players after a short delay (co-op friendly).
      for (const p of this.players) if (p.dead && p.deadTimer > 0.9) p.respawn();

      // 11) Win check. A Portal needs BOTH heroes inside it together; the older
      //     paired pads need each hero on their own pad.
      const alive = this.players.every(p => !p.dead);
      if (alive && this.portals.length) {
        if (this.portals.some(p => p.charge >= 1)) this._win();
      } else if (alive && this.exits.length && this.exits.every(e => e.occupied)) {
        this._win();
      }
    }

    /** Carry a player who is standing on another player's head (ride along). */
    _carryPlayerRiders() {
      for (const q of this.players) {
        if (q.dead) continue;
        const p = q.groundRef;
        if (p && p.character && p !== q) { q.x += p._dx; q.y += p._dy; }
      }
    }

    /** Mutual pushing: a grounded player walking into their partner shoves them.
     *  Enables lining up head-stacks and cooperative block-pushing chains. */
    _resolvePlayerPush(dt) {
      const pairs = [[this.players[0], this.players[1]], [this.players[1], this.players[0]]];
      for (const [p, q] of pairs) {
        if (p.dead || q.dead || !p.onGround) continue;
        const vOverlap = p.y + p.h > q.y + 4 && p.y < q.y + q.h - 4;
        if (!vOverlap) continue;
        let dir = 0;
        if (p.input.right && p.x < q.x && (q.x - (p.x + p.w)) < 3) dir = 1;
        if (p.input.left && p.x > q.x && (p.x - (q.x + q.w)) < 3) dir = -1;
        if (dir === 0) continue;
        p.pushing = true;
        const solids = this.solidsFor(q, false); // exclude players from q's push
        const before = q.x;
        GG.Physics.move(q, dir * 100 * dt, 0, solids);
        const moved = q.x - before;
        if (Math.abs(moved) > 0.01) { p.x += moved; }          // pusher follows
        else { p.x = dir > 0 ? q.x - p.w : q.x + q.w; }         // q blocked -> stay flush
      }
    }

    _carryRiders(plat) {
      if (!plat.dx && !plat.dy) return;
      const oldTop = plat.y - plat.dy;
      const oldX = plat.x - plat.dx;
      const riders = [...this.players.filter(p => !p.dead), ...this.crates];
      for (const r of riders) {
        const restsOnTop = Math.abs((r.y + r.h) - oldTop) < 4;
        const overlapX = r.x + r.w > oldX + 2 && r.x < oldX + plat.w - 2;
        if (restsOnTop && overlapX) { r.x += plat.dx; r.y += plat.dy; }
      }
    }

    _stepCrate(c, dt) {
      // Held overhead by a hero — that hero positions it, no physics.
      if (c.carried) { c.vx = 0; c.vy = 0; c.onGround = false; return; }

      // In flight after a throw: arcing projectile that bounces off surfaces.
      if (c.thrown) {
        c.vy += C.GRAVITY * 0.8 * dt;
        const solids = this.tilemap.solidsIn(c.x - 8, c.y - 8, c.w + 16, c.h + 16);
        for (const o of this.crates) if (o !== c && !o.carried && !o.thrown) solids.push(o);
        for (const p of this.platforms) solids.push(p);
        for (const o of this.objects) if (o instanceof O.Door || o instanceof O.LockedDoor || o instanceof O.BridgeAnchor) { const r = o.solidRect(); if (r) solids.push(r); }
        const bvx = c.vx, bvy = c.vy;
        GG.Physics.move(c, c.vx * dt, c.vy * dt, solids);
        if (c.hitWallDir !== 0 && (c.bounces | 0) > 0) {          // wall bounce
          c.vx = -bvx * 0.65; c.bounces--;
          GG.bus.emit("crate:bounce", {});
          this.fx.burst({ x: c.cx, y: c.cy, count: 8, color: "#cfd8ff", speed: 110, life: 0.3 });
        }
        if (c.hitCeil) c.vy = -bvy * 0.4;
        if (c.onGround) {
          if (Math.abs(bvy) > 220 && (c.bounces | 0) > 0) { c.vy = -bvy * 0.45; c.bounces--; }
          else { c.thrown = false; c.vx *= 0.4; }
        }
        if (c.thrown && Math.abs(c.vx) < 12 && c.onGround) c.thrown = false;
        return;
      }

      // Push detection from adjacent, grounded players pressing toward the crate.
      let pushDir = 0;
      for (const p of this.players) {
        if (p.dead || !p.onGround) continue;
        const vOverlap = p.y + p.h > c.y + 4 && p.y < c.y + c.h - 4;
        if (!vOverlap) continue;
        if (c.heavy && !p.character.canPushHeavy) continue; // ability gate
        if (p.input.right && p.x + p.w >= c.x - 4 && p.x + p.w <= c.x + 10) { pushDir = 1; p.pushing = true; }
        if (p.input.left  && p.x <= c.x + c.w + 4 && p.x >= c.x + c.w - 10) { pushDir = -1; p.pushing = true; }
      }
      if (pushDir !== 0) {
        c.vx = pushDir * 90;
        if (Math.random() < 0.08) GG.bus.emit("crate:push", {});
      } else {
        c.vx = U.damp(c.vx, 0, 12, dt);
        if (Math.abs(c.vx) < 2) c.vx = 0;
      }
      c.vy = Math.min(c.vy + C.GRAVITY * dt, 800);
      const solids = this.tilemap.solidsIn(c.x - 8, c.y - 8, c.w + 16, c.h + 16);
      for (const o of this.crates) if (o !== c) solids.push(o);
      for (const p of this.platforms) solids.push(p);
      for (const o of this.objects) if (o instanceof O.Door || o instanceof O.LockedDoor) { const r = o.solidRect(); if (r) solids.push(r); }
      GG.Physics.move(c, c.vx * dt, c.vy * dt, solids);
    }

    _mirrorAt(x, y) {
      for (const m of this.mirrors) if (U.pointInRect(x, y, m)) return m;
      return null;
    }

    _traceLaser(laser) {
      laser.segments = [];
      if (!laser.active(this)) return;
      const step = 4;
      let dir = DIRV[laser.dir].slice();
      let x = laser.cx, y = laser.cy, sx = x, sy = y, lastMirror = -1;
      for (let i = 0; i < 700; i++) {
        x += dir[0] * step; y += dir[1] * step;
        if (x < 0 || y < 0 || x > this.tilemap.w || y > this.tilemap.h) break;
        // solid tile blocks the beam
        const tid = this.tilemap.tileAtWorld(x, y);
        if (tid !== GG.TILE.EMPTY && tid !== undefined && new Set([1,2,3,4,5,6]).has(tid)) break;
        // crate blocks the beam
        let blocked = false;
        for (const cr of this.crates) if (U.pointInRect(x, y, cr)) { blocked = true; break; }
        if (blocked) break;
        // mirror reflects
        const m = this._mirrorAt(x, y);
        if (m && m.id !== lastMirror) {
          laser.segments.push({ x1: sx, y1: sy, x2: m.cx, y2: m.cy });
          dir = m.orient === "/" ? [-dir[1], -dir[0]] : [dir[1], dir[0]];
          x = m.cx; y = m.cy; sx = x; sy = y; lastMirror = m.id;
          continue;
        }
        // player hit (lasers are lethal to everyone)
        for (const p of this.players) if (!p.dead && U.pointInRect(x, y, p)) this._laserHits.add(p);
      }
      laser.segments.push({ x1: sx, y1: sy, x2: x, y2: y });
    }

    _win() {
      if (this.won) return;
      this.won = true; this.winTimer = 0;
      // Victory pose scales with how punishing the level was.
      const pose = (this.data.tier === "extreme") ? "exhausted" : "celebrate";
      for (const p of this.players) { p.celebrating = true; p.victoryPose = pose; }
      GG.bus.emit("level:complete", {
        id: this.id, timeMs: this.timeMs, gems: this.gemsCollected,
        totalGems: this.totalGems, deaths: this.deaths, noDeath: this.deaths === 0,
      });
      for (const e of this.exits) this.fx.burst({ x: e.cx, y: e.cy, count: 30, color: ["#ffcf4d", "#fff", "#5ce08a", "#35b7ff"], speed: 260, life: 0.9, gravity: 300, glow: true });
    }

    beginTiming() { this.started = true; }

    /**
     * Client-side visual-only update (online). Advances animation timers and
     * re-derives view state (laser beams, exit occupancy) WITHOUT running the
     * authoritative physics — positions/channels come from host snapshots.
     */
    renderTick(dt) {
      for (const o of this.objects) if ("t" in o) o.t += dt;
      for (const p of this.players) { p.animName = p._poseState(); p.animTime = (p.animTime || 0) + dt; p.blink -= dt; if (p.blink < -0.2 && Math.random() < 0.04) p.blink = 0.12; }
      this._laserHits.clear();
      for (const l of this.lasers) this._traceLaser(l);
      for (const e of this.exits) {
        const p = this.players[e.player];
        e.occupied = p && !p.dead && U.aabb(p, e);
      }
      this.fx.update(dt);
    }

    // ---- Rendering -------------------------------------------------------
    _buildParallax() {
      this._stars = [];
      for (let i = 0; i < 120; i++) {
        this._stars.push({ x: Math.random() * this.tilemap.w, y: Math.random() * this.tilemap.h * 0.7, r: Math.random() * 1.6 + 0.4, d: Math.random() * 0.6 + 0.2 });
      }
    }

    renderBackground(ctx, cam) {
      // Sky gradient by theme.
      const themes = {
        cave:    ["#0a0f1e", "#131a30"],
        temple:  ["#1a1226", "#2a1d3a"],
        ruins:   ["#0a1418", "#12242a"],
        factory: ["#1a1218", "#281a24"],
        ice:     ["#0e1a2c", "#1a2c46"],
        jungle:  ["#0a1a10", "#12301c"],
        city:    ["#0c1430", "#182448"],
        heart:   ["#180a24", "#2a1030"],
        forest:  ["#0c1a12", "#122b1c"],
        night:   ["#070a16", "#101838"],
        lab:     ["#0c1220", "#161f36"],
      };
      const t = themes[this.theme] || themes.cave;
      const g = ctx.createLinearGradient(0, 0, 0, cam.viewH);
      g.addColorStop(0, t[0]); g.addColorStop(1, t[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.viewW, cam.viewH);

      // Parallax stars (drawn in screen space using camera offset * depth).
      ctx.save();
      for (const s of this._stars) {
        const sx = (s.x - cam.x * s.d);
        const sy = (s.y - cam.y * s.d);
        if (sx < -4 || sx > cam.viewW + 4 || sy < -4 || sy > cam.viewH + 4) continue;
        ctx.globalAlpha = s.d;
        ctx.fillStyle = "#cdd6ff"; ctx.fillRect(sx, sy, s.r, s.r);
      }
      ctx.globalAlpha = 1; ctx.restore();
    }

    renderWorld(ctx, cam) {
      this.tilemap.render(ctx, cam);
      // Objects: draw non-players. Order: platforms/doors/hazards then pickups then lasers on top.
      for (const o of this.objects) if (!(o instanceof O.Laser)) o.render(ctx, this);
      for (const l of this.lasers) l.render(ctx, this);
      for (const p of this.players) p.render(ctx);
    }

    /** Subtle additive bloom: draws soft coloured glow around bright emitters
     *  using the "lighter" composite. Cheap, native-res, reads as bloom. */
    _renderBloom(ctx, cam) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = (wx, wy, r, color, a) => {
        const sx = (wx - cam.x) * cam.zoom, sy = (wy - cam.y) * cam.zoom;
        const rr = r * cam.zoom;
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
        gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = a; ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.fill();
      };
      for (const p of this.players) if (!p.dead) glow(p.cx, p.cy, 34, p.character.body, 0.22);
      for (const e of this.exits) glow(e.cx, e.cy, 40, (e.player === 0 ? O.COLORS.blue : O.COLORS.green).main, 0.28);
      for (const g of this.gems) if (!g.collected) glow(g.cx, g.cy, 22, O.COLORS.gold.main, 0.3);
      for (const l of this.lasers) if (l.active(this)) for (const s of l.segments) glow((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 30, O.COLORS.red.main, 0.18);
      ctx.restore();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }

    /** Lighting / darkness overlay drawn in SCREEN space after the world.
     *  Offscreen is (re)sized to the camera viewport so split-screen works. */
    renderLighting(ctx, cam, enabled, bloom) {
      if (bloom) this._renderBloom(ctx, cam);
      const vw = cam.viewW, vh = cam.viewH;
      if (!enabled && !this.dark) {
        const v = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vh * 0.8);
        v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.4)");
        ctx.fillStyle = v; ctx.fillRect(0, 0, vw, vh);
        return;
      }
      const lc = this._lightCtx;
      if (this._lightCanvas.width !== vw || this._lightCanvas.height !== vh) {
        this._lightCanvas.width = vw; this._lightCanvas.height = vh;
      }
      lc.clearRect(0, 0, vw, vh);
      lc.fillStyle = this.dark ? "rgba(3,4,10,0.96)" : "rgba(0,0,0,0.4)";
      lc.fillRect(0, 0, vw, vh);
      lc.globalCompositeOperation = "destination-out";
      const punch = (wx, wy, radius) => {
        const sx = (wx - cam.x) * cam.zoom, sy = (wy - cam.y) * cam.zoom;
        const r = radius * cam.zoom;
        const gr = lc.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
        gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.7, "rgba(0,0,0,0.9)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        lc.fillStyle = gr; lc.beginPath(); lc.arc(sx, sy, r, 0, Math.PI * 2); lc.fill();
      };
      for (const p of this.players) if (!p.dead) punch(p.cx, p.cy, this.dark ? 130 : 240);
      for (const e of this.exits) punch(e.cx, e.cy, 70);
      lc.globalCompositeOperation = "source-over";
      ctx.drawImage(this._lightCanvas, 0, 0, vw, vh);
    }

    // ---- Networking: full serialisable state ----------------------------
    snapshot() {
      const objState = {};
      for (const o of this.objects) {
        const s = o.getState ? o.getState() : null;
        if (s !== null && s !== undefined) objState[o.id] = s;
      }
      return {
        t: Math.round(this.timeMs),
        ch: Object.assign({}, this.channels),
        keys: Object.assign({}, this.keys),
        gems: this.gemsCollected,
        deaths: this.deaths,
        won: this.won,
        players: this.players.map(p => p.getState()),
        objs: objState,
        broken: Array.from(this.tilemap._broken),
      };
    }

    applySnapshot(s) {
      if (!s) return;
      this.timeMs = s.t;
      this.channels = s.ch || {};
      this.keys = s.keys || {};
      this.gemsCollected = s.gems || 0;
      this.deaths = s.deaths || 0;
      this.won = s.won;
      if (s.players) s.players.forEach((ps, i) => this.players[i] && this.players[i].setState(ps));
      if (s.objs) for (const o of this.objects) if (s.objs[o.id] !== undefined && o.setState) o.setState(s.objs[o.id]);
      if (s.broken) this.tilemap._broken = new Set(s.broken);
    }
  }

  GG.Level = Level;
})(window);
