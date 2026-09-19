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
      // Shared ability energy: telekinesis and swinging drain one common pool.
      // Levels may shrink the pool (`energyMax`) for scarcity challenges.
      this.energyMax = data.energyMax || 100;
      this.energy = this.energyMax;
      this.pings = [];               // co-op markers: {x,y,t,color}
      this.enemies = this.objects.filter(o => o instanceof O.Sentinel);
      this.rats = this.objects.filter(o => o instanceof O.Rat);
      this.bosses = this.objects.filter(o => o instanceof O.Boss);
      this.projectiles = [];         // weapon fire: {x,y,vx,vy,from,arrow}
      // Open-world creatures & barriers that weapons can hurt, and the shots
      // creatures fire back (spores, laser bolts).
      this.hittables = this.objects.filter(o => o.hittable);
      this.hostiles = [];            // {x,y,vx,vy,r,life,grav,color,kind}
      // Story pets join after Chapter 2: Nova, a tiny celestial cat who walks
      // with Nichols, and Pip, a magical frog who hops after Nibihah.
      const pet = (kind, name, owner) => ({
        kind, name, owner,
        x: data.spawns[owner].x - 20, y: data.spawns[owner].y,
        vy: 0, t: 0, trail: 0,
        mood: "follow",       // follow | sit | sleep | yawn | roll | alert | cheer
        moodT: 0,             // seconds left in the current mood
        idleT: 0,             // how long the owner has stood still
        alertT: 0,            // cooldown between "there's a secret here!" calls
        near: null,           // the secret currently being sensed
        blink: 0, ear: 0, hop: 0,
      });
      this.pets = (data.chapter >= 3)
        ? [pet("cat", "Nova", 0), pet("frog", "Pip", 1)]
        : [];
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
        telecube: O.TeleCube, anchor: O.SwingAnchor, tandem: O.TandemPlate,
        tether: O.TetherZone, wind: O.WindZone, runeseq: O.RuneSeq,
        seesaw: O.Seesaw, battery: O.Battery, dock: O.Receptacle,
        sentinel: O.Sentinel, watcher: O.Watcher, boss: O.Boss,
        tutor: O.Tutor, rat: O.Rat,
      };
      const Cls = map[o.type] || (GG.OBJ_EXT && GG.OBJ_EXT[o.type]);
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
        } else if (o.dynSolid) {
          // open-world pieces: room veils, light bridges, thorn barriers
          const r = o.solidRect(entity); if (r) near.push(r);
        } else if (o instanceof O.Seesaw) {
          near.push(o.panL, o.panR);
        } else if (o instanceof O.NarrowGate) {
          // Narrow gates block everyone EXCEPT characters that fit (Lyra).
          const player = entity && entity.character;
          if (!player || !entity.character.narrow) { const r = o.solidRect(); if (r) near.push(r); }
        }
      }
      // Players are solid to each other -> enables standing on heads + pushing.
      // EXCEPT: a rider standing on YOUR head is not your ceiling — otherwise
      // the carrier's jump collides with their own passenger and dies at 0px.
      if (includePlayers && entity && entity.character) {
        for (const p of this.players) {
          if (p === entity || p.dead) continue;
          if (p.groundRef === entity || p._stackedOn === entity) continue;   // my rider, not a wall
          near.push(p);
        }
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
      this.age = (this.age || 0) + dt;             // seconds since the room was entered
      if (this.won) { this.winTimer += dt; return; }
      if (this.started) this.timeMs += dt * 1000;
      for (const p of this.players) p.pushing = false; // recomputed by crate/push passes

      // 1) Platforms move first (compute per-frame delta).
      for (const p of this.platforms) p.update(dt, this);
      // 2) Carry riders (players + crates) resting on platforms.
      for (const p of this.platforms) this._carryRiders(p);

      // 3) Crates: push detection + gravity + collision.
      for (const c of this.crates) this._stepCrate(c, dt);

      // 4) Players. A swinging hero follows pendulum physics; a hero riding a
      //    jumping carrier is glued to their head for the flight.
      for (const p of this.players) {
        if (p._stackedOn) this._stepStacked(p, dt);
        else if (p.swing) this._stepSwing(p, dt);
        else p.update(dt, this);
      }
      // 4b) Telekinesis roots the holder in place: snap him back and pin him.
      for (const p of this.players) {
        if (p.teleHold && !p.dead) {
          if (p._rootX == null) { p._rootX = p.x; p._rootY = p.y; }
          p.x = p._rootX; if (p.onGround) p.y = p._rootY;
          p.vx = 0; p._buffer = 0;
          if (!p.onGround) p.teleHold.dropTele();   // knocked airborne -> lose grip
        } else p._rootX = p._rootY = null;
      }
      // 4c) Co-op: ride on a partner's head, and push each other around.
      this._carryPlayerRiders();
      this._resolvePlayerPush(dt);
      // 4d) Shared energy regenerates while no ability is drawing on it.
      const drawing = this.players.some(p => p.teleHold || p.swing);
      if (!drawing) this.energy = Math.min(this.energyMax, this.energy + 12 * dt);
      // pings fade
      for (const g of this.pings) g.t -= dt;
      this.pings = this.pings.filter(g => g.t > 0);

      // 4e) Weapons: Nichols' bolt gun, Nibihah's arrows (slight arc).
      for (const p of this.players) {
        p._atkCd = Math.max(0, (p._atkCd || 0) - dt);
        if (!p.dead && p.input && p.input.attackPressed && p._atkCd === 0 && p.character.canShoot !== false) {
          p._atkCd = 0.45;
          const arrow = p.character.id === "nibihah";   // the explorer shoots arrows
          // fire from the hip, not the chest — rats are ankle-height
          this.projectiles.push({
            x: p.cx + p.facing * 14, y: p.y + p.h - 12,
            vx: p.facing * (arrow ? 440 : 540), vy: arrow ? -50 : 0,
            from: p.index, arrow, life: 1.4,
          });
          GG.bus.emit("laser:shot", {});
          GG.audio && GG.audio.sfx("laser");
          this.fx.burst({ x: p.cx + p.facing * 14, y: p.cy - 4, count: 4, color: p.character.light, speed: 60, life: 0.2 });
        }
      }
      for (const s of this.projectiles) {
        if (s.arrow) s.vy += 240 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (this.tilemap.isSolid(Math.floor(s.x / C.TILE), Math.floor(s.y / C.TILE))) { s.life = 0; continue; }
        const hit = { x: s.x - 4, y: s.y - 4, w: 8, h: 8 };
        for (const r of this.rats) {
          if (!r.deadRat && U.aabb(hit, r)) { r.takeHit(this, Math.sign(s.vx)); s.life = 0; break; }
        }
        if (s.life > 0) for (const h of this.hittables) {
          if (h.alive !== false && U.aabb(hit, h.hitRect ? h.hitRect() : h)) { h.takeHit(this, 1, Math.sign(s.vx)); s.life = 0; break; }
        }
        if (s.life > 0) for (const b of this.bosses) {
          if (!b.defeated && U.aabb(hit, b)) { b.takeHit(this, 1, Math.sign(s.vx)); s.life = 0; break; }
        }
      }
      this.projectiles = this.projectiles.filter(s => s.life > 0);
      for (const h of this.hostiles) {
        h.vy += (h.grav || 0) * dt;
        h.x += h.vx * dt; h.y += h.vy * dt; h.life -= dt;
        if (this.tilemap.isSolid(Math.floor(h.x / C.TILE), Math.floor(h.y / C.TILE))) {
          h.life = 0;
          this.fx.burst({ x: h.x, y: h.y, count: 6, color: h.color || "#ff9aa4", speed: 60, life: 0.25 });
          continue;
        }
        const r = h.r || 5, box = { x: h.x - r, y: h.y - r, w: r * 2, h: r * 2 };
        for (const p of this.players) {
          if (!p.dead && U.aabb(box, p)) { p.kill(this, h.kind || "shot"); h.life = 0; break; }
        }
      }
      this.hostiles = this.hostiles.filter(h => h.life > 0);

      // 4f) A wiped party lets the rat nests recover (they never respawn otherwise).
      if (this.players.every(p => p.dead)) {
        for (const r of this.rats) r.reset();
        for (const o of this.objects) if (o.onPartyWipe) o.onPartyWipe(this);
      }

      // 4g) Nova and Pip trot after their heroes, sense nearby secrets, and
      //     fall asleep if nobody is going anywhere.
      for (const pet of this.pets) this._stepPet(pet, dt);

      // 4h) The wildlife goes about its business (and scatters when crowded).
      this._stepAmbient(dt);

      // 5) Interactables (switches/buttons/doors/teleporters/exits/hazards/lasers).
      //    Plain crates and platforms were already stepped above — but a
      //    TeleCube's telekinesis brain still needs its update.
      for (const o of this.objects) {
        if ((o instanceof O.Crate && !o.tele) || o instanceof O.MovingPlatform) continue;
        o.update(dt, this);
      }

      // 6) Lasers traced after mirrors/crates settled.
      this._laserHits.clear();
      for (const l of this.lasers) this._traceLaser(l);

      // 7) Collectibles.
      for (const g of this.gems) for (const p of this.players) {
        const had = g.collected; g.tryCollect(p, this);
        if (!had && g.collected && p.feel) p.feel("excited", 1.4);   // a little delight
      }
      for (const k of this.keyItems) for (const p of this.players) {
        const had = k.collected; k.tryCollect(p, this);
        if (!had && k.collected && p.feel) p.feel("proud", 1.6);
      }

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

    /**
     * Pet brain. Nova (cat) and Pip (frog) follow their hero, sniff out hidden
     * platforms, secret switches and uncollected gems, and drift into little
     * idle behaviours — sitting, yawning, rolling over, dozing off — whenever
     * the party stops moving.
     */
    _stepPet(pet, dt) {
      pet.t += dt;
      pet.blink = pet.blink > 0 ? pet.blink - dt : (Math.random() < dt * 0.4 ? 0.12 : 0);
      const o = this.players[pet.owner];
      if (!o) return;

      // -- follow: trail a few paces behind, on the hero's back side --------
      const tx = o.cx - o.facing * 22 - 6;
      const moving = Math.abs(o.vx) > 24 && !o.dead;
      const far = Math.abs(pet.x - tx);
      pet.x = U.damp(pet.x, tx, far > 90 ? 11 : 6, dt);     // sprint to catch up
      const ground = o.y + o.h - 12;
      if (pet.kind === "frog") {                             // Pip hops
        pet.hop = far > 12 ? Math.abs(Math.sin(pet.t * 6)) : U.damp(pet.hop, 0, 8, dt);
        pet.y = U.damp(pet.y, ground - pet.hop * 10, 10, dt);
      } else {
        pet.y = U.damp(pet.y, ground, 10, dt);
        pet.ear = U.damp(pet.ear, moving ? 0 : Math.sin(pet.t * 1.7) * 0.5, 4, dt);
      }

      // -- sensing: is there something hidden within a whisker's reach? -----
      pet.alertT = Math.max(0, pet.alertT - dt);
      let found = null, bestD = 74;
      const consider = (ox, oy) => {
        const d = Math.hypot(ox - pet.x, oy - pet.y);
        if (d < bestD) { bestD = d; found = { x: ox, y: oy }; }
      };
      for (const ob of this.objects) {
        // Nova senses structure — hidden platforms and secret switches.
        // Pip senses loot — gems still waiting to be picked up.
        const isSecret = (ob instanceof O.HiddenPlatform && ob.reveal < 0.5) ||
                         (ob instanceof O.SecretSwitch && !ob.on);
        if (pet.kind === "cat" && isSecret) consider(ob.cx, ob.cy);
      }
      if (pet.kind === "frog") for (const g of this.gems) if (!g.collected) consider(g.cx, g.cy);
      pet.near = found;

      if (found && pet.alertT <= 0 && pet.mood !== "cheer") {
        pet.mood = "alert"; pet.moodT = 1.1; pet.alertT = 3.4;
        // a soft mrrp / croak, plus a spark pointing at the secret
        GG.bus.emit("pet:alert", { kind: pet.kind, name: pet.name, x: found.x, y: found.y });
        this.fx.burst({
          x: found.x, y: found.y, count: 5, life: 0.9, speed: 18, lift: 12, glow: true,
          color: pet.kind === "cat" ? ["#a9d4ff", "#fff"] : ["#f2e14e", "#fff"],
        });
      }

      // -- mood machine -----------------------------------------------------
      pet.moodT = Math.max(0, pet.moodT - dt);
      if (moving) { pet.idleT = 0; if (pet.moodT <= 0) pet.mood = "follow"; }
      else {
        pet.idleT += dt;
        if (pet.moodT <= 0) {
          if (pet.idleT > 16) pet.mood = "sleep";                     // dozed off
          else if (pet.idleT > 3.5) {
            // pick a little flourish, then settle back down
            const r = Math.random();
            if (pet.mood === "sit" && r < 0.35) { pet.mood = pet.kind === "cat" ? "roll" : "yawn"; pet.moodT = 1.6; }
            else if (pet.mood === "sit" && r < 0.6) { pet.mood = "yawn"; pet.moodT = 1.2; }
            else { pet.mood = "sit"; pet.moodT = 2.6; }
          }
        }
      }
      if (this.won && pet.mood !== "cheer") { pet.mood = "cheer"; pet.moodT = 4; }

      // -- footprint trails --------------------------------------------------
      pet.trail -= dt;
      if (moving && pet.trail <= 0) {
        pet.trail = 0.09;
        if (pet.kind === "cat") {
          const rainbow = ["#ff6b6b", "#ffb14d", "#f2e14e", "#6ef0a0", "#4fc3ff", "#c07bff"];
          this.fx.burst({ x: pet.x, y: pet.y + 8, count: 2, color: rainbow, speed: 22, life: 0.7, lift: 14, glow: true });
        } else {
          this.fx.burst({ x: pet.x, y: pet.y + 8, count: 2, color: ["#fff", "#f2c14e"], speed: 18, life: 0.8, lift: 20, glow: true });
        }
      }
    }

    /** Nova the celestial cat and Pip the star-frog. Small, but full of life. */
    _renderPet(ctx, pet) {
      const o = this.players[pet.owner];
      const dir = o ? o.facing : 1;
      const m = pet.mood, t = pet.t;
      // sitting/sleeping settles the body down; rolling flips it over
      const sit = (m === "sit" || m === "sleep" || m === "yawn") ? 2 : 0;
      const roll = m === "roll" ? Math.min(1, pet.moodT / 1.6) : 0;
      const breathe = m === "sleep" ? Math.sin(t * 2) * 0.7 : 0;

      ctx.save(); ctx.translate(pet.x, pet.y + sit);
      if (roll > 0) ctx.rotate(Math.sin((1 - roll) * Math.PI * 2) * 1.6);
      if (m === "cheer") ctx.translate(0, -Math.abs(Math.sin(t * 9)) * 5);

      // Figma-imported sprites (Nova the celestial fox / Pip the frog)
      const spr = GG.SPRITES && (pet.kind === "cat" ? GG.SPRITES.nova : GG.SPRITES.pip);
      if (spr) {
        if (m === "sleep") ctx.scale(1, 0.85);                 // curled down
        ctx.translate(0, -pet.hop * 6 * (pet.kind === "frog" ? 1 : 0));
        // small companions: Nova's sprite is long (tail!), so scale by a
        // modest height — she ends up ~20px nose-to-tail vs 26+px heroes
        GG.drawSprite(ctx, spr, 0, 9, pet.kind === "cat" ? 9 : 8, dir, {
          t, blink: pet.blink,
          legOff: (m === "follow" && o && Math.abs(o.vx) > 24) ? Math.sin(t * 12) * 1.5 : 0,
        });
        // shared: sleeping "z", and an arrow of light toward a sensed secret
        if (m === "sleep") {
          ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "bold 6px monospace";
          ctx.fillText("z", dir * 9, -8 - ((t * 6) % 6));
        }
        ctx.restore();
        if (pet.near && pet.mood === "alert") {                // points it out
          const a = Math.atan2(pet.near.y - pet.y, pet.near.x - pet.x);
          ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(t * 10) * 0.2;
          ctx.strokeStyle = pet.kind === "cat" ? "#a9d4ff" : "#f2e14e"; ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(pet.x + Math.cos(a) * 10, pet.y + 3 + Math.sin(a) * 10);
          ctx.lineTo(pet.near.x, pet.near.y); ctx.stroke();
          ctx.setLineDash([]); ctx.restore();
        }
        return;
      }

      if (pet.kind === "cat") {
        // ---- Nova: white fur, glowing blue tail, floating crystal ears ----
        ctx.shadowBlur = 8; ctx.shadowColor = "rgba(120,190,255,0.55)";  // celestial aura
        ctx.fillStyle = "#f6f1e9";
        ctx.beginPath(); ctx.ellipse(0, 6 + breathe, 7, 4.5 - sit * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ded4c6";                                       // belly/leg shade
        ctx.beginPath(); ctx.ellipse(0, 8.5 + breathe, 5.5, 2, 0, 0, Math.PI * 2); ctx.fill();
        if (!sit) {                                                      // trotting paws
          for (let i = 0; i < 2; i++) {
            const px = -3 + i * 7, sw = Math.sin(t * 12 + i * 3) * 1.6;
            ctx.fillStyle = "#f6f1e9"; ctx.fillRect(px + sw, 8, 2.2, 3);
          }
        }
        ctx.fillStyle = "#f6f1e9";                                        // head
        ctx.beginPath(); ctx.arc(dir * 6, 2, 4, 0, Math.PI * 2); ctx.fill();

        // floating crystal ears — they hover just off the head and pulse
        const eb = Math.sin(t * 3) * 0.6 + pet.ear * 2;
        ctx.fillStyle = "#a9d4ff"; ctx.shadowBlur = 7; ctx.shadowColor = "#a9d4ff";
        ctx.globalAlpha = 0.9;
        const ear = (ex) => {
          ctx.beginPath();
          ctx.moveTo(ex, -3.5 + eb); ctx.lineTo(ex + 1.8, -0.5 + eb);
          ctx.lineTo(ex, 0.6 + eb); ctx.lineTo(ex - 1.8, -0.5 + eb); ctx.closePath(); ctx.fill();
        };
        ear(dir * 4.2); ear(dir * 8.2);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;

        // glowing blue tail, curling and drifting
        const wag = m === "cheer" ? Math.sin(t * 12) * 6 : Math.sin(t * 4) * 3;
        const grad = ctx.createLinearGradient(-dir * 6, 5, -dir * 13, -4);
        grad.addColorStop(0, "#f6f1e9"); grad.addColorStop(1, "#5fb8ff");
        ctx.strokeStyle = grad; ctx.lineWidth = 2.4; ctx.lineCap = "round";
        ctx.shadowBlur = 8; ctx.shadowColor = "#5fb8ff";
        ctx.beginPath(); ctx.moveTo(-dir * 6, 5);
        ctx.quadraticCurveTo(-dir * 12, 2 + wag, -dir * 11, -4 + wag * 0.4); ctx.stroke();
        ctx.shadowBlur = 0;

        // face
        const eyeShut = m === "sleep" || pet.blink > 0 || m === "yawn";
        if (eyeShut) {
          ctx.strokeStyle = "#3a3128"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(dir * 6, 1.6, 1.6, 0.15, Math.PI - 0.15); ctx.stroke();
        } else {
          ctx.fillStyle = "#4fc3ff"; ctx.shadowBlur = 5; ctx.shadowColor = "#4fc3ff";
          ctx.fillRect(dir * 5.2, 0.6, 1.8, 2);
          ctx.fillRect(dir * 8, 0.8, 1.4, 1.8);
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = "#ff9ac4"; ctx.fillRect(dir * 9 - 0.6, 3, 1.6, 1.2);   // nose
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 0.6;       // whiskers
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(dir * 9, 3); ctx.lineTo(dir * 15, 2 + i * 2); ctx.stroke();
        }
        if (m === "yawn") {                                                    // wide little yawn
          ctx.fillStyle = "#c9607a";
          ctx.beginPath(); ctx.ellipse(dir * 8.5, 4.6, 1.4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // ---- Pip: emerald frog with a tiny backpack and huge eyes --------
        ctx.fillStyle = "#3f9e46";
        ctx.beginPath(); ctx.ellipse(0, 6 + breathe, 6.2, 4.2 - sit * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#5fc45a";                                             // lit back
        ctx.beginPath(); ctx.ellipse(0, 4.6 + breathe, 5.4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#dff5d0";                                             // pale belly
        ctx.beginPath(); ctx.ellipse(dir * 1.5, 8.4, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
        // folded legs, springing on the hop
        ctx.fillStyle = "#3f9e46";
        const spring = 1 - pet.hop * 0.6;
        ctx.fillRect(-dir * 5, 6, 3, 4 * spring); ctx.fillRect(dir * 4, 7, 3, 3.4 * spring);
        // tiny backpack
        ctx.fillStyle = "#6b4526"; ctx.fillRect(-dir * 5.5, 2.5, 4, 4.5);
        ctx.fillStyle = "#e8c65c"; ctx.fillRect(-dir * 5.5, 3.6, 4, 1);
        // head + cheeks (inflate before a croak)
        const puff = m === "alert" ? Math.min(1, pet.moodT / 1.1) : 0;
        ctx.fillStyle = "#4fae4d";
        ctx.beginPath(); ctx.arc(dir * 3, 1, 3.6 + puff * 1.4, 0, Math.PI * 2); ctx.fill();
        if (puff > 0) {
          ctx.fillStyle = "#7fd070"; ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.ellipse(dir * 3, 3, 3.6 + puff * 2, 2.2 + puff * 1.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // big expressive eyes on top of the head
        const shut = m === "sleep" || pet.blink > 0;
        const ey = -2.4, e1 = dir * 1.6, e2 = dir * 5.2;
        ctx.fillStyle = "#4fae4d";                                             // eye mounds
        ctx.beginPath(); ctx.arc(e1, ey, 2.6, 0, Math.PI * 2); ctx.arc(e2, ey, 2.6, 0, Math.PI * 2); ctx.fill();
        if (shut) {
          ctx.strokeStyle = "#1f3a1c"; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(e1 - 2, ey); ctx.lineTo(e1 + 2, ey);
          ctx.moveTo(e2 - 2, ey); ctx.lineTo(e2 + 2, ey); ctx.stroke();
        } else {
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(e1, ey, 2.1, 0, Math.PI * 2); ctx.arc(e2, ey, 2.1, 0, Math.PI * 2); ctx.fill();
          const look = m === "alert" ? dir * 0.8 : Math.sin(t * 0.9) * 0.5;
          ctx.fillStyle = "#1a1220";
          ctx.beginPath(); ctx.arc(e1 + look, ey, 1.1, 0, Math.PI * 2); ctx.arc(e2 + look, ey, 1.1, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillRect(e1 + look + 0.3, ey - 1.1, 0.8, 0.8); ctx.fillRect(e2 + look + 0.3, ey - 1.1, 0.8, 0.8);
        }
        ctx.strokeStyle = "#1f3a1c"; ctx.lineWidth = 0.9;                      // wide smile
        ctx.beginPath(); ctx.arc(dir * 3, 1.4, 2.6, 0.2, Math.PI - 0.2); ctx.stroke();
        if (m === "cheer") {                                                   // a little wave
          ctx.strokeStyle = "#4fae4d"; ctx.lineWidth = 2; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(dir * 5, 5);
          ctx.lineTo(dir * 8, 1 + Math.sin(t * 14) * 2.5); ctx.stroke();
        }
      }

      // shared: sleeping "z", and an arrow of light toward a sensed secret
      if (m === "sleep") {
        ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "bold 6px monospace";
        ctx.fillText("z", dir * 9, -4 - ((t * 6) % 6));
      }
      ctx.restore();

      if (pet.near && pet.mood === "alert") {                                  // points it out
        const a = Math.atan2(pet.near.y - pet.y, pet.near.x - pet.x);
        ctx.save(); ctx.globalAlpha = 0.45 + Math.sin(t * 10) * 0.2;
        ctx.strokeStyle = pet.kind === "cat" ? "#a9d4ff" : "#f2e14e"; ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(pet.x + Math.cos(a) * 10, pet.y + 3 + Math.sin(a) * 10);
        ctx.lineTo(pet.near.x, pet.near.y); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
    }

    /**
     * A rider glued to a jumping carrier's head. They fly as one unit; the
     * rider can JUMP OFF mid-flight for a springboard boost (the classic
     * co-op double-lift), and the stack dissolves when the carrier lands.
     */
    _stepStacked(p, dt) {
      const c = p._stackedOn;
      if (!c || c.dead || p.dead) { p._stackedOn = null; return; }
      // ride the head
      p.x = c.x + (c.w - p.w) / 2;
      p.y = c.y - p.h;
      p.vx = c.vx; p.vy = c.vy;
      p.facing = c.facing;
      p.onGround = false; p.groundRef = null;
      p.animName = "jump"; p.animTime = (p.animTime || 0) + dt;
      // springboard: jumping off mid-flight launches from the carrier's speed
      if (p.input && p.input.jumpPressed) {
        p._stackedOn = null;
        p.vy = Math.min(c.vy, 0) - 620 * p.character.jumpScale * 0.9;
        p.jumpsLeft = Math.max(0, p.character.maxJumps - 1);
        GG.bus.emit("player:jump", { index: p.index });
        this.fx.burst({ x: p.cx, y: p.y + p.h, count: 10, color: [p.character.body, "#fff"], speed: 120, life: 0.35, glow: true });
        return;
      }
      // the flight ends when the carrier touches down — back to a normal stand
      if (c.onGround) { p._stackedOn = null; p.vy = 0; }
    }

    /** Spend from the shared ability pool. Returns false when it runs dry. */
    spendEnergy(amount) {
      if (this.energy < amount) { this.energy = Math.max(0, this.energy - amount); return false; }
      this.energy -= amount;
      return true;
    }

    /**
     * Pendulum swing for Nibihah (deterministic, fixed-step):
     *  angle a is measured from straight-down at the anchor; pump with
     *  left/right near the bottom of the arc, reel with up/down, release with
     *  jump/special to launch with the current tangential velocity.
     */
    _stepSwing(p, dt) {
      const s = p.swing;
      s.cool = Math.max(0, s.cool - dt);
      const inp = p.input || {};
      // drains the shared pool; an empty pool drops the line
      if (!this.spendEnergy(8 * dt) || p.dead) { p.swing = null; return; }
      // pump: push in your direction of travel near the bottom of the arc
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir !== 0 && Math.abs(s.a) < 1.1) s.av += dir * 2.2 * dt;
      // reel the line in/out
      if (inp.up) s.L = Math.max(50, s.L - 75 * dt);
      if (inp.down) s.L = Math.min(235, s.L + 75 * dt);
      // pendulum step
      s.av += -(C.GRAVITY / s.L) * Math.sin(s.a) * dt;
      s.av *= (1 - 0.12 * dt);
      s.a += s.av * dt;
      const nx = s.ax + Math.sin(s.a) * s.L, ny = s.ay + Math.cos(s.a) * s.L;
      // crashing into stone stuns the swing dead
      const probe = { x: nx - p.w / 2, y: ny - p.h / 2, w: p.w, h: p.h, character: p.character };
      if (this.overlapsSolid(probe, p)) {
        p.swing = null; p.vx = 0; p.vy = 40; p.squash = 0.7;
        this.cam.shake(0.15);
        this.fx.burst({ x: p.cx, y: p.cy, count: 8, color: "#cfd8ff", speed: 90, life: 0.3 });
        return;
      }
      p.x = nx - p.w / 2; p.y = ny - p.h / 2;
      p.vx = s.av * s.L * Math.cos(s.a);
      p.vy = -s.av * s.L * Math.sin(s.a);
      if (Math.abs(p.vx) > 10) p.facing = Math.sign(p.vx);
      p.onGround = false;
      p.animName = "jump"; p.animTime = (p.animTime || 0) + dt;
      // release: jump or a fresh special press
      if ((inp.jumpPressed || (inp.specialPressed && s.cool <= 0))) {
        p.swing = null;
        p.jumpsLeft = Math.max(p.jumpsLeft, 1);      // keep her double jump alive
        this.fx.burst({ x: p.cx, y: p.cy, count: 6, color: p.character.body, speed: 80, life: 0.3, glow: true });
      }
      if (Math.random() < dt * 8) this.fx.burst({ x: p.cx, y: p.cy, count: 1, color: p.character.light, speed: 20, life: 0.25 });
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
      laser.segments = []; laser.ghost = null;
      const live = laser.active(this);
      const warn = !live && laser.warning && laser.warning(this);
      if (!live && !warn) return;
      const step = 4;
      let dir = DIRV[laser.dir].slice();
      let x = laser.cx, y = laser.cy, sx = x, sy = y, lastMirror = -1;
      for (let i = 0; i < 700; i++) {
        x += dir[0] * step; y += dir[1] * step;
        if (x < 0 || y < 0 || x > this.tilemap.w || y > this.tilemap.h) break;
        // solid tile blocks the beam
        if (this.tilemap.isSolid(Math.floor(x / C.TILE), Math.floor(y / C.TILE))) break;
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
        if (live) for (const p of this.players) if (!p.dead && U.pointInRect(x, y, p)) this._laserHits.add(p);
      }
      laser.segments.push({ x1: sx, y1: sy, x2: x, y2: y });
      if (!live) { laser.ghost = laser.segments; laser.segments = []; }
    }

    _win() {
      if (this.won) return;
      this.won = true; this.winTimer = 0;
      // Victory pose scales with how punishing the level was.
      const pose = (this.data.tier === "extreme") ? "exhausted" : "celebrate";
      for (const p of this.players) {
        p.celebrating = true; p.victoryPose = pose;
        // grinning, or doubled over and grinning anyway
        if (p.feel) p.feel(pose === "exhausted" ? "exhausted" : "laughing", 6);
      }
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
      // Advance animation clocks — but NOT MovingPlatform/Rotor "t", which is
      // path progress, not a clock; snapshots own it.
      for (const o of this.objects) if ("t" in o && !(o instanceof O.MovingPlatform)) o.t += dt;
      // Glide the remote hero toward the latest snapshot target so 60 Hz
      // packets render as motion, not steps.
      for (const p of this.players) {
        if (p._netTX == null) continue;
        p.x = U.damp(p.x, p._netTX, 22, dt);
        p.y = U.damp(p.y, p._netTY, 22, dt);
        if (Math.abs(p.x - p._netTX) + Math.abs(p.y - p._netTY) < 0.5) { p._netTX = p._netTY = null; }
      }
      for (const p of this.players) { p.animName = p._poseState(); p.animTime = (p.animTime || 0) + dt; p.blink -= dt; if (p.blink < -0.2 && Math.random() < 0.04) p.blink = 0.12; }
      this._laserHits.clear();
      for (const l of this.lasers) this._traceLaser(l);
      for (const e of this.exits) {
        const p = this.players[e.player];
        e.occupied = p && !p.dead && U.aabb(p, e);
      }
      // decorative-only systems still animate on remote clients
      for (const p of this.players) if (p._stepCloth) p._stepCloth(dt);   // scarf/braid/cape
      for (const pet of this.pets) this._stepPet(pet, dt);
      this._stepAmbient(dt);
      this.fx.update(dt);
    }

    // ---- Rendering -------------------------------------------------------

    /**
     * Layered biome backdrops. Every theme is a stack of parallax layers built
     * from a handful of reusable painters (ridges, columns, trees, islands,
     * clouds, crystal clusters, fog bands, light shafts) so each chapter reads
     * as a distinct place without hand-authoring eleven separate scenes.
     *
     * Each layer: { d: depth 0..1 (0 = infinitely far), paint: fn(ctx, cam, L) }
     * Layer geometry is generated once from a seeded RNG so it never shimmers.
     */
    _buildParallax() {
      // deterministic per-level RNG — the same level always looks the same
      let seed = (this.id * 2654435761) >>> 0;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const W = this.tilemap.w, H = this.tilemap.h;
      const span = W + 1200;                       // generous so parallax never runs out

      // --- generic geometry generators ---------------------------------
      const ridge = (n, base, amp) => {            // jagged silhouette points
        const pts = [];
        for (let i = 0; i <= n; i++) pts.push({ x: (i / n) * span, y: base + (rnd() - 0.5) * amp });
        return pts;
      };
      const scatter = (n, yMin, yMax, sMin, sMax) => {
        const a = [];
        for (let i = 0; i < n; i++) a.push({
          x: rnd() * span, y: yMin + rnd() * (yMax - yMin),
          s: sMin + rnd() * (sMax - sMin), p: rnd() * 6.28, f: 0.3 + rnd() * 1.2,
        });
        return a;
      };

      this._stars = scatter(150, 0, H * 0.75, 0.4, 2.0).map(s => (s.d = 0.15 + rnd() * 0.5, s));
      this._motes = scatter(60, 0, H, 0.6, 2.2);

      // --- reusable painters -------------------------------------------
      // Draws a filled silhouette from ridge points down to the bottom.
      const paintRidge = (pts, fill) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6;
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.moveTo(ox, cam.viewH + 40);
        for (const p of pts) ctx.lineTo(p.x + ox, p.y + oy);
        ctx.lineTo(pts[pts.length - 1].x + ox, cam.viewH + 40); ctx.closePath(); ctx.fill();
      };
      // Hanging stalactites / dripping rock teeth.
      const paintTeeth = (items, fill, flip) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6;
        ctx.fillStyle = fill;
        for (const it of items) {
          const x = it.x + ox, y = it.y + oy, w = it.s * 5, h = it.s * 26;
          if (x < -60 || x > cam.viewW + 60) continue;
          ctx.beginPath();
          if (flip) { ctx.moveTo(x - w, y); ctx.lineTo(x + w, y); ctx.lineTo(x, y - h); }
          else { ctx.moveTo(x - w, y); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); }
          ctx.closePath(); ctx.fill();
        }
      };
      // Glowing crystal clusters embedded in the rock.
      const paintCrystals = (items, col) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        for (const it of items) {
          const x = it.x + ox, y = it.y + oy;
          if (x < -40 || x > cam.viewW + 40) continue;
          ctx.globalAlpha = 0.35 + Math.sin(t * it.f + it.p) * 0.18;
          ctx.fillStyle = col; ctx.shadowBlur = 14 * it.s; ctx.shadowColor = col;
          for (let k = -1; k <= 1; k++) {
            const h = it.s * (10 + k * 3), w = it.s * 2.4;
            ctx.beginPath();
            ctx.moveTo(x + k * w * 2, y); ctx.lineTo(x + k * w * 2 + w, y - h * 0.6);
            ctx.lineTo(x + k * w * 2, y - h); ctx.lineTo(x + k * w * 2 - w, y - h * 0.6);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      };
      // Layered tree silhouettes with soft canopies.
      const paintTrees = (items, trunk, leaf) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        for (const it of items) {
          const x = it.x + ox, y = it.y + oy, s = it.s;
          if (x < -80 || x > cam.viewW + 80) continue;
          const sway = Math.sin(t * 0.6 + it.p) * s * 1.2;
          ctx.fillStyle = trunk;
          ctx.beginPath(); ctx.moveTo(x - s * 1.6, y); ctx.lineTo(x + s * 1.6, y);
          ctx.lineTo(x + s * 0.9 + sway, y - s * 22); ctx.lineTo(x - s * 0.9 + sway, y - s * 22);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = leaf;                                  // stacked canopy blobs
          for (let k = 0; k < 3; k++) {
            const cy = y - s * (16 + k * 6), r = s * (11 - k * 2.5);
            ctx.beginPath(); ctx.ellipse(x + sway * (1 + k * 0.3), cy, r, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
          }
        }
      };
      // Weathered temple columns, some snapped off.
      const paintColumns = (items, stone, shade) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6;
        for (const it of items) {
          const x = it.x + ox, y = it.y + oy, w = it.s * 9, h = it.s * (30 + (it.p % 1) * 40);
          if (x < -60 || x > cam.viewW + 60) continue;
          ctx.fillStyle = stone; ctx.fillRect(x - w / 2, y - h, w, h);
          ctx.fillStyle = shade; ctx.fillRect(x - w / 2, y - h, w * 0.3, h);       // shaded side
          ctx.fillStyle = stone;                                                    // capital + base
          ctx.fillRect(x - w * 0.75, y - h - w * 0.4, w * 1.5, w * 0.4);
          ctx.fillRect(x - w * 0.75, y - w * 0.35, w * 1.5, w * 0.35);
          ctx.fillStyle = shade;                                                    // fluting
          for (let k = -1; k <= 1; k++) ctx.fillRect(x + k * w * 0.28, y - h, 1, h);
        }
      };
      // Floating sky islands: rock wedge with a grass cap.
      const paintIslands = (items, rock, cap) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        for (const it of items) {
          const bobY = Math.sin(t * 0.4 + it.p) * it.s * 1.5;
          const x = it.x + ox, y = it.y + oy + bobY, w = it.s * 22, h = it.s * 16;
          if (x < -120 || x > cam.viewW + 120) continue;
          ctx.fillStyle = rock;
          ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y);
          ctx.lineTo(x + w * 0.18, y + h); ctx.lineTo(x - w * 0.1, y + h * 0.7);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = cap;
          ctx.beginPath(); ctx.ellipse(x, y, w / 2, it.s * 2.2, 0, 0, Math.PI * 2); ctx.fill();
        }
      };
      // Soft cloud banks.
      const paintClouds = (items, col, alpha) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        ctx.globalAlpha = alpha; ctx.fillStyle = col;
        for (const it of items) {
          const x = it.x + ox + t * it.f * 4, y = it.y + oy, s = it.s;
          const wx = ((x % (cam.viewW + 300)) + cam.viewW + 300) % (cam.viewW + 300) - 150;
          for (let k = 0; k < 4; k++) {
            ctx.beginPath();
            ctx.ellipse(wx + k * s * 7 - s * 10, y + Math.sin(k + it.p) * s * 2, s * 9, s * 4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      };
      // God rays / shafts of light angling down through the scene.
      const paintShafts = (items, col, alpha) => (ctx, cam, d) => {
        const ox = -cam.x * d, t = this.timeMs / 1000;
        ctx.globalAlpha = alpha;
        for (const it of items) {
          const x = it.x + ox;
          if (x < -160 || x > cam.viewW + 160) continue;
          const w = it.s * 12, sway = Math.sin(t * 0.3 + it.p) * 6;
          const g = ctx.createLinearGradient(x, 0, x + 70 + sway, cam.viewH);
          g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(x - w, 0); ctx.lineTo(x + w, 0);
          ctx.lineTo(x + 70 + sway + w * 2, cam.viewH); ctx.lineTo(x + 70 + sway - w * 2, cam.viewH);
          ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      // Soft light pools glowing on the cave floor beneath the crystals.
      const paintPools = (items, rgb) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        for (const it of items) {
          const x = it.x + ox, y = it.y + oy;
          if (x < -160 || x > cam.viewW + 160) continue;
          const rw = it.s * 90, breathe = 0.22 + Math.sin(t * it.f + it.p) * 0.08;
          const g = ctx.createRadialGradient(x, y, 0, x, y, rw);
          g.addColorStop(0, `rgba(${rgb},${breathe})`); g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(x, y, rw, rw * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        }
      };
      // A single wide fog band drifting near the floor (the "realism" haze).
      const paintFog = (fy, rgb) => (ctx, cam, d) => {
        const t = this.timeMs / 1000;
        const y = fy - cam.y * d * 0.6;
        const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        g.addColorStop(0, `rgba(${rgb},0)`);
        g.addColorStop(0.5, `rgba(${rgb},${0.06 + Math.sin(t * 0.4) * 0.02})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, y - 60, cam.viewW, 120);
      };
      // Hanging vines with glowing tips, swaying gently (forest).
      const paintVines = (items) => (ctx, cam, d) => {
        const ox = -cam.x * d, t = this.timeMs / 1000;
        for (const it of items) {
          const x = it.x + ox;
          if (x < -20 || x > cam.viewW + 20) continue;
          const vh = 40 + it.s * 60, sway = Math.sin(t * 0.8 + it.p) * 4;
          ctx.strokeStyle = "#2e8f50"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, 0);
          ctx.quadraticCurveTo(x + sway * 0.5, vh * 0.6, x + sway, vh); ctx.stroke();
          ctx.fillStyle = "#5ce08a"; ctx.shadowBlur = 6; ctx.shadowColor = "#5ce08a";
          ctx.fillRect(x + sway - 2, vh, 4, 5);
          ctx.shadowBlur = 0;
        }
      };
      // Spirit flowers pulsing on the forest floor.
      const paintFlowers = (items) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        const cols = ["#a9f07e", "#ff9ad4", "#7fd4ff"];
        for (let i = 0; i < items.length; i++) {
          const it = items[i], x = it.x + ox, y = it.y + oy;
          if (x < -30 || x > cam.viewW + 30) continue;
          const col = cols[i % cols.length];
          ctx.strokeStyle = "#2e8f50"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x, y + 2); ctx.stroke();
          ctx.fillStyle = col; ctx.shadowBlur = 12; ctx.shadowColor = col;
          ctx.globalAlpha = 0.75 + Math.sin(t * 1.8 + it.p) * 0.25;
          ctx.beginPath(); ctx.arc(x, y, 4 + it.s, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
      };
      // Drifting nebula blooms for the celestial chapters.
      const paintNebula = (items, cols) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        for (let i = 0; i < items.length; i++) {
          const it = items[i], x = it.x + ox, y = it.y + oy;
          const r = it.s * 60 + Math.sin(t * 0.3 + it.p) * 10;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, cols[i % cols.length]); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.globalAlpha = 0.35; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      };
      // Distant machinery: pipes, tanks and slow-turning gears.
      const paintMachines = (items, metal, shade, glow) => (ctx, cam, d) => {
        const ox = -cam.x * d, oy = -cam.y * d * 0.6, t = this.timeMs / 1000;
        for (const it of items) {
          const x = it.x + ox, y = it.y + oy, s = it.s;
          if (x < -90 || x > cam.viewW + 90) continue;
          ctx.fillStyle = metal; ctx.fillRect(x - s * 8, y - s * 34, s * 16, s * 34);
          ctx.fillStyle = shade; ctx.fillRect(x - s * 8, y - s * 34, s * 4, s * 34);
          ctx.fillStyle = glow;                                     // lit portholes
          for (let k = 0; k < 3; k++) ctx.fillRect(x - s * 2, y - s * (28 - k * 9), s * 4, s * 3);
          ctx.save();                                                // slow gear
          ctx.translate(x + s * 12, y - s * 20); ctx.rotate(t * 0.4 * it.f);
          ctx.fillStyle = shade;
          for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-s, -s * 9, s * 2, s * 4); }
          ctx.beginPath(); ctx.arc(0, 0, s * 5, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      };

      // --- per-biome layer stacks ---------------------------------------
      const B = {
        // Chapter 1 — Underground Caves (synced to the Figma environment):
        // #05070f->#1b2740 depths, hazy far ridges, god rays, big glowing
        // crystals with light pools, drifting fog.
        cave: {
          sky: ["#05070f", "#0e1526", "#1b2740"],
          layers: [
            { d: 0.10, paint: paintRidge(ridge(14, H * 0.45, 120), "#0c1322") },
            { d: 0.20, paint: paintTeeth(scatter(26, 0, H * 0.28, 0.7, 1.8), "#101828") },
            { d: 0.24, paint: paintShafts(scatter(4, 0, 1, 0.9, 1.8), "rgba(191,230,255,0.12)", 1) },
            { d: 0.28, paint: paintRidge(ridge(18, H * 0.62, 90), "#131c30") },
            { d: 0.34, paint: paintCrystals(scatter(16, H * 0.35, H * 0.85, 0.9, 2.2), "#6ef0d0") },
            { d: 0.36, paint: paintPools(scatter(6, H * 0.8, H * 0.95, 1.2, 2.4), "110,240,208") },
            { d: 0.40, paint: paintFog(H * 0.78, "159,200,255") },
            { d: 0.45, paint: paintTeeth(scatter(18, 0, H * 0.18, 1.0, 2.4), "#182238") },
          ],
        },
        // Chapter 2 — Wrecked Ruins: broken columns, cold mist, drowned stone
        ruins: {
          sky: ["#081218", "#0f1f26", "#183038"],
          layers: [
            { d: 0.08, paint: paintRidge(ridge(10, H * 0.40, 150), "#0c1c22") },
            { d: 0.18, paint: paintColumns(scatter(14, H * 0.72, H * 0.88, 0.8, 1.7), "#17303a", "#0f2029") },
            { d: 0.26, paint: paintShafts(scatter(5, 0, 1, 0.8, 1.6), "rgba(150,220,235,0.16)", 1) },
            { d: 0.34, paint: paintColumns(scatter(9, H * 0.86, H * 0.98, 1.2, 2.2), "#1e3b47", "#132a33") },
            { d: 0.40, paint: paintCrystals(scatter(8, H * 0.5, H * 0.9, 0.6, 1.2), "#7fd4ff") },
          ],
        },
        // Chapter 3 — Enchanted Forest (synced to the Figma environment):
        // #0a1a12->#1e4a2c greens, canopy layers, warm gold rays, hanging
        // vines with glowing tips, spirit flowers, ground mist.
        forest: {
          sky: ["#0a1a12", "#12301e", "#1e4a2c"],
          layers: [
            { d: 0.08, paint: paintRidge(ridge(12, H * 0.42, 100), "#0d2417") },
            { d: 0.16, paint: paintTrees(scatter(16, H * 0.78, H * 0.92, 0.8, 1.4), "#12301e", "#1d4f2c") },
            { d: 0.24, paint: paintShafts(scatter(6, 0, 1, 0.9, 1.8), "rgba(255,233,168,0.18)", 1) },
            { d: 0.30, paint: paintVines(scatter(10, 0, 1, 0.8, 1.8)) },
            { d: 0.32, paint: paintTrees(scatter(12, H * 0.9, H * 1.02, 1.3, 2.1), "#173d25", "#26602f") },
            { d: 0.40, paint: paintFlowers(scatter(5, H * 0.88, H * 0.96, 0.8, 1.4)) },
            { d: 0.42, paint: paintFog(H * 0.82, "191,230,200") },
          ],
        },
        jungle: null,   // alias -> forest (filled in below)
        // Chapter 4 — The Great Temple: gold, banners, deep incense haze
        temple: {
          sky: ["#160e22", "#241634", "#3a2246"],
          layers: [
            { d: 0.10, paint: paintRidge(ridge(9, H * 0.38, 80), "#1d1230") },
            { d: 0.18, paint: paintColumns(scatter(12, H * 0.74, H * 0.9, 1.0, 1.9), "#3a2a4e", "#261a35") },
            { d: 0.26, paint: paintShafts(scatter(5, 0, 1, 1.0, 2.0), "rgba(255,205,110,0.15)", 1) },
            { d: 0.34, paint: paintCrystals(scatter(12, H * 0.45, H * 0.9, 0.8, 1.6), "#f2c14e") },
            { d: 0.42, paint: paintColumns(scatter(7, H * 0.92, H * 1.04, 1.6, 2.4), "#463256", "#2d1f3c") },
          ],
        },
        // Chapter 5 — Temple in the Sky: floating islands above a cloud sea
        city: {
          sky: ["#12224a", "#254273", "#4d76a8"],
          layers: [
            { d: 0.06, paint: paintClouds(scatter(8, H * 0.2, H * 0.5, 1.4, 2.6), "#9fc0e8", 0.30) },
            { d: 0.14, paint: paintIslands(scatter(9, H * 0.28, H * 0.6, 0.8, 1.6), "#2f4f78", "#3f7f8f") },
            { d: 0.24, paint: paintClouds(scatter(7, H * 0.45, H * 0.8, 1.8, 3.2), "#c3dbf5", 0.28) },
            { d: 0.34, paint: paintIslands(scatter(6, H * 0.6, H * 0.9, 1.4, 2.4), "#3b628f", "#4e97a6") },
            { d: 0.44, paint: paintShafts(scatter(4, 0, 1, 1.2, 2.2), "rgba(255,240,190,0.14)", 1) },
          ],
        },
        ice: null,      // alias -> city
        // Chapter 6 — The Heavens: nebulae, star fields, drifting rune rings
        heart: {
          sky: ["#0d0620", "#1c0c33", "#2e1440"],
          layers: [
            { d: 0.05, paint: paintNebula(scatter(6, H * 0.15, H * 0.75, 0.8, 2.0), ["rgba(140,90,255,0.5)", "rgba(255,110,190,0.4)", "rgba(90,190,255,0.45)"]) },
            { d: 0.18, paint: paintIslands(scatter(7, H * 0.3, H * 0.75, 0.7, 1.5), "#2a1a44", "#5b3f8f") },
            { d: 0.30, paint: paintCrystals(scatter(14, H * 0.3, H * 0.9, 0.7, 1.6), "#c79bff") },
            { d: 0.40, paint: paintShafts(scatter(4, 0, 1, 1.0, 2.0), "rgba(200,160,255,0.13)", 1) },
          ],
        },
        night: null,    // alias -> heart
        // Industrial interludes
        factory: {
          sky: ["#150f18", "#231824", "#332232"],
          layers: [
            { d: 0.10, paint: paintRidge(ridge(11, H * 0.44, 90), "#1a1220") },
            { d: 0.20, paint: paintMachines(scatter(9, H * 0.78, H * 0.92, 0.9, 1.8), "#2e2233", "#1d1522", "#ff9a4d") },
            { d: 0.32, paint: paintMachines(scatter(6, H * 0.9, H * 1.02, 1.4, 2.4), "#3a2b3f", "#241a2a", "#ffb066") },
            { d: 0.40, paint: paintShafts(scatter(3, 0, 1, 1.0, 1.8), "rgba(255,150,80,0.10)", 1) },
          ],
        },
        lab: null,      // alias -> factory
      };
      B.jungle = B.forest; B.ice = B.city; B.night = B.heart; B.lab = B.factory;
      this._biome = B[this.theme] || B.cave;
      this._buildAmbient(rnd);
    }

    /**
     * Ambient wildlife. Each biome is stocked with creatures that live their
     * own small lives and react to the heroes — flyers scatter, ground animals
     * bolt for cover, and the shy ones freeze and watch from a distance.
     */
    _buildAmbient(rnd) {
      const W = this.tilemap.w, H = this.tilemap.h;
      // kind: [flyer?, colour, size, skittishness]
      const CASTS = {
        cave:    ["moth", "firefly", "bat", "lizard", "firefly", "moth"],
        ruins:   ["dragonfly", "firefly", "lizard", "moth", "fish", "turtle"],
        forest:  ["butterfly", "firefly", "rabbit", "deer", "squirrel", "bird", "frog", "bee", "leaf"],
        jungle:  ["butterfly", "frog", "bird", "dragonfly", "lizard", "bee"],
        temple:  ["moth", "firefly", "bird", "scarab", "dragonfly"],
        city:    ["bird", "butterfly", "dragonfly", "leaf", "bee"],
        ice:     ["bird", "moth", "fish"],
        factory: ["moth", "firefly", "lizard"],
        lab:     ["moth", "firefly"],
        heart:   ["firefly", "moth", "butterfly", "wisp", "wisp"],
        night:   ["owl", "firefly", "moth", "bat"],
      };
      const cast = CASTS[this.theme] || CASTS.cave;
      // Open-world rooms have real floors at many heights: ground animals
      // settle onto the nearest surface below their home instead of floating.
      const tm = this.tilemap, T = C.TILE;
      const settle = (x, y) => {
        let c = Math.floor(x / T), r = Math.floor(y / T);
        c = U.clamp(c, 1, tm.cols - 2);
        for (let k = 0; k < tm.rows; k++, r++) {
          if (r >= tm.rows - 1) return null;
          if (tm.at(c, r) === 0 && (tm.isSolid(c, r + 1) || tm.at(c, r + 1) === 7)) return (r + 1) * T - 4;
        }
        return null;
      };
      const FLYERS = new Set(["butterfly", "firefly", "bird", "dragonfly", "bee", "moth", "bat", "leaf", "wisp", "scarab", "owl"]);
      this._ambient = [];
      const n = 22;
      for (let i = 0; i < n; i++) {
        const kind = cast[(rnd() * cast.length) | 0];
        const fly = FLYERS.has(kind);
        const hx = rnd() * W;
        let hy = fly ? rnd() * H * 0.7 : H * (0.55 + rnd() * 0.4);
        if (this.data.roomId != null) {
          if (!fly) { const sy = settle(hx, rnd() * H); if (sy == null) continue; hy = sy; }
          else if (tm.isSolid(Math.floor(hx / T), Math.floor(hy / T))) continue;
        }
        this._ambient.push({
          kind, fly, hx, hy,                      // home position
          x: hx, y: hy, vx: 0, vy: 0,
          t: rnd() * 6.28, p: rnd() * 6.28,
          f: 0.6 + rnd() * 1.4,                   // personal tempo
          fear: 0,                                // 0 calm .. 1 fleeing
          shy: 60 + rnd() * 70,                   // flight distance
          state: "calm",                          // calm | flee | watch | hide
          dir: rnd() < 0.5 ? -1 : 1,
        });
      }
    }

    _stepAmbient(dt) {
      if (!this._ambient) return;
      for (const a of this._ambient) {
        a.t += dt * a.f;
        // nearest living hero decides the mood
        let d = 1e9, px = 0;
        for (const p of this.players) {
          if (p.dead) continue;
          const dd = Math.hypot(p.cx - a.x, p.cy - a.y);
          if (dd < d) { d = dd; px = p.cx; }
        }
        // deer and owls hold their ground and stare before bolting
        const watcher = a.kind === "deer" || a.kind === "owl";
        if (d < a.shy * (watcher ? 0.55 : 1)) a.state = "flee";
        else if (watcher && d < a.shy * 1.8) a.state = "watch";
        else if (d > a.shy * 2.2) a.state = "calm";

        a.fear = U.damp(a.fear, a.state === "flee" ? 1 : 0, a.state === "flee" ? 12 : 1.5, dt);

        if (a.state === "flee") {
          const away = a.x < px ? -1 : 1;
          a.dir = away;
          if (a.fly) { a.vx = away * 70 * a.f; a.vy = -34 - Math.sin(a.t * 6) * 22; }
          else { a.vx = away * 95 * a.f; a.vy = 0; }
        } else {
          // drift home, wandering gently on the way
          const tx = a.hx + Math.sin(a.t * 0.5 + a.p) * (a.fly ? 46 : 22);
          const ty = a.hy + (a.fly ? Math.sin(a.t * (a.kind === "butterfly" ? 2.2 : 0.8) + a.p) * 22 : 0);
          a.vx = U.damp(a.vx, (tx - a.x) * 1.6, 4, dt);
          a.vy = U.damp(a.vy, (ty - a.y) * 1.6, 4, dt);
          if (Math.abs(a.vx) > 3) a.dir = a.vx < 0 ? -1 : 1;
        }
        a.x += a.vx * dt; a.y += a.vy * dt;
        // never stray too far from home, and never leave the level
        a.x = U.clamp(a.x, 8, this.tilemap.w - 8);
        a.y = U.clamp(a.y, 8, this.tilemap.h - 8);
        if (Math.abs(a.x - a.hx) > 220) a.hx = a.x;    // adopt a new home after a long flight
      }
    }

    _renderAmbient(ctx, cam) {
      if (!this._ambient) return;
      ctx.save();
      // same transform as the world layer (zoom included) so wildlife sits on the ground
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
      const vw = cam.viewW / cam.zoom, vh = cam.viewH / cam.zoom;
      for (const a of this._ambient) {
        const sx = a.x - cam.x, sy = a.y - cam.y;
        if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;
        this._drawCreature(ctx, a);
      }
      ctx.restore();
    }

    /** One tiny creature, drawn at world coordinates. */
    _drawCreature(ctx, a) {
      const t = a.t, d = a.dir, flap = Math.sin(t * (a.fly ? 14 : 6));
      ctx.save(); ctx.translate(a.x, a.y);

      switch (a.kind) {
        case "butterfly": {
          const w = 3 + Math.abs(flap) * 3.5;
          ctx.fillStyle = "#ff9ad4";
          ctx.beginPath(); ctx.ellipse(-w, -1, w, 3, 0.4, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.ellipse(w, -1, w, 3, -0.4, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#ffe08a";
          ctx.beginPath(); ctx.ellipse(-w * 0.8, 0.5, w * 0.5, 1.6, 0.4, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.ellipse(w * 0.8, 0.5, w * 0.5, 1.6, -0.4, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#3a2438"; ctx.fillRect(-0.6, -2, 1.2, 5);
          break;
        }
        case "firefly": case "wisp": {
          const c = a.kind === "wisp" ? "#c79bff" : "#e8ff8a";
          const pulse = 0.4 + Math.sin(t * 3 + a.p) * 0.4;
          ctx.globalAlpha = Math.max(0.08, pulse);
          ctx.fillStyle = c; ctx.shadowBlur = 10; ctx.shadowColor = c;
          ctx.beginPath(); ctx.arc(0, 0, a.kind === "wisp" ? 2.4 : 1.5, 0, 6.28); ctx.fill();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          break;
        }
        case "bird": {
          ctx.strokeStyle = "#2b3550"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
          const w = 5 + flap * 3;
          ctx.beginPath();
          ctx.moveTo(-6, w * 0.4); ctx.quadraticCurveTo(-2, -w, 0, 0);
          ctx.quadraticCurveTo(2, -w, 6, w * 0.4); ctx.stroke();
          break;
        }
        case "owl": {
          ctx.fillStyle = "#6b5540";
          ctx.beginPath(); ctx.ellipse(0, 0, 5, 7, 0, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#8a6f52";
          ctx.beginPath(); ctx.ellipse(0, 2, 3.4, 4.5, 0, 0, 6.28); ctx.fill();
          ctx.beginPath();                                   // ear tufts
          ctx.moveTo(-4, -5); ctx.lineTo(-2.5, -9); ctx.lineTo(-1, -5);
          ctx.moveTo(4, -5); ctx.lineTo(2.5, -9); ctx.lineTo(1, -5); ctx.fill();
          ctx.fillStyle = "#ffd05a";                          // big watching eyes
          ctx.beginPath(); ctx.arc(-2, -2, 2, 0, 6.28); ctx.arc(2, -2, 2, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#1a1220";
          const look = a.state === "watch" ? d * 0.7 : 0;
          ctx.beginPath(); ctx.arc(-2 + look, -2, 1, 0, 6.28); ctx.arc(2 + look, -2, 1, 0, 6.28); ctx.fill();
          break;
        }
        case "bat": {
          ctx.fillStyle = "#2a2038";
          const w = 6 + flap * 4;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(-w, -3); ctx.lineTo(-w * 0.6, 2); ctx.lineTo(0, 3);
          ctx.lineTo(w * 0.6, 2); ctx.lineTo(w, -3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#ff6b6b"; ctx.fillRect(-1, -1, 0.9, 0.9); ctx.fillRect(0.5, -1, 0.9, 0.9);
          break;
        }
        case "dragonfly": {
          ctx.globalAlpha = 0.55; ctx.fillStyle = "#bfe8ff";
          const w = 7 + Math.abs(flap) * 2;
          ctx.beginPath(); ctx.ellipse(-2, -1, w, 1.6, 0.2, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.ellipse(2, -1, w, 1.6, -0.2, 0, 6.28); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#3fc3a0"; ctx.fillRect(-1, -1, 2, 9);
          ctx.beginPath(); ctx.arc(0, -2, 2, 0, 6.28); ctx.fill();
          break;
        }
        case "bee": {
          ctx.fillStyle = "#f2c14e";
          ctx.beginPath(); ctx.ellipse(0, 0, 3, 2.2, 0, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#2a2018";
          ctx.fillRect(-1.6, -2.2, 1.2, 4.4); ctx.fillRect(1, -2.2, 1.2, 4.4);
          ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.ellipse(0, -2.5, 3 + Math.abs(flap), 1.4, 0, 0, 6.28); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "moth": {
          ctx.globalAlpha = 0.85; ctx.fillStyle = "#cfc3a8";
          const w = 3 + Math.abs(flap) * 2.5;
          ctx.beginPath(); ctx.ellipse(-w * 0.6, 0, w, 2.6, 0.3, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.ellipse(w * 0.6, 0, w, 2.6, -0.3, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#8b7f68"; ctx.fillRect(-0.6, -1.5, 1.2, 4); ctx.globalAlpha = 1;
          break;
        }
        case "scarab": {
          ctx.fillStyle = "#e8c65c"; ctx.shadowBlur = 6; ctx.shadowColor = "#e8c65c";
          ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2.6, 0, 0, 6.28); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "#a3862f";
          ctx.fillRect(-0.5, -2.6, 1, 5.2);
          break;
        }
        case "leaf": {
          ctx.rotate(t * 1.2);
          ctx.fillStyle = ["#c98f3a", "#b6642f", "#8fae4a"][(a.p * 3) | 0 % 3];
          ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 1.6, 0, 0, 6.28); ctx.fill();
          break;
        }
        case "rabbit": {
          const hop = a.state === "flee" ? Math.abs(Math.sin(t * 9)) * 6 : 0;
          ctx.translate(0, -hop);
          ctx.fillStyle = "#d8cbb8";
          ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.arc(d * 5, -3, 3, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#d8cbb8";                           // long ears, laid back when fleeing
          const lay = a.state === "flee" ? 0.9 : 0.15;
          for (let k = 0; k < 2; k++) {
            ctx.save(); ctx.translate(d * 5, -5); ctx.rotate(d * (lay + k * 0.3));
            ctx.beginPath(); ctx.ellipse(0, -3, 1.3, 4, 0, 0, 6.28); ctx.fill(); ctx.restore();
          }
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-d * 6, -1, 2, 0, 6.28); ctx.fill();  // tail
          ctx.fillStyle = "#2a2018"; ctx.fillRect(d * 6, -4, 1.2, 1.2);
          break;
        }
        case "squirrel": {
          ctx.fillStyle = "#a4643a";
          ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 3, 0, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.arc(d * 4, -2.5, 2.4, 0, 6.28); ctx.fill();
          ctx.strokeStyle = "#c07f4c"; ctx.lineWidth = 3.2; ctx.lineCap = "round";  // big curling tail
          ctx.beginPath(); ctx.moveTo(-d * 4, 1);
          ctx.quadraticCurveTo(-d * 10, -2, -d * 7, -8 + Math.sin(t * 4) * 1.5); ctx.stroke();
          ctx.fillStyle = "#2a2018"; ctx.fillRect(d * 5, -3, 1.1, 1.1);
          break;
        }
        case "deer": {
          const alert = a.state !== "calm";
          ctx.fillStyle = "#9c7248";
          ctx.fillRect(-8, -6, 16, 8);                          // body
          for (let k = 0; k < 4; k++) ctx.fillRect(-7 + k * 4.6, 2, 1.8, 7);   // legs
          ctx.save(); ctx.translate(d * 8, -8); ctx.rotate(alert ? -d * 0.25 : d * 0.15);
          ctx.fillStyle = "#9c7248"; ctx.fillRect(-1.5, -6, 3.5, 8);           // neck
          ctx.beginPath(); ctx.ellipse(d * 1.5, -7, 3.2, 2.2, 0, 0, 6.28); ctx.fill();
          ctx.strokeStyle = "#6d4d2f"; ctx.lineWidth = 1.2;                    // antlers
          ctx.beginPath();
          ctx.moveTo(0, -9); ctx.lineTo(-1.5, -14); ctx.moveTo(-1.5, -14); ctx.lineTo(-3.5, -13);
          ctx.moveTo(1, -9); ctx.lineTo(2.5, -14); ctx.moveTo(2.5, -14); ctx.lineTo(4.5, -13);
          ctx.stroke();
          ctx.fillStyle = "#1a1220"; ctx.fillRect(d * 2, -8, 1.2, 1.2);
          ctx.restore();
          ctx.fillStyle = "#e6d8c4";                                            // white tail flash
          ctx.beginPath(); ctx.arc(-8, -4, alert ? 2.6 : 1.6, 0, 6.28); ctx.fill();
          break;
        }
        case "lizard": {
          const scurry = a.state === "flee" ? Math.sin(t * 16) * 1.5 : 0;
          ctx.fillStyle = "#5f7f4a";
          ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 2, 0, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.arc(d * 5, -0.5, 2, 0, 6.28); ctx.fill();
          ctx.strokeStyle = "#5f7f4a"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(-d * 5, 0);
          ctx.quadraticCurveTo(-d * 9, scurry, -d * 12, -scurry); ctx.stroke();
          for (let k = 0; k < 2; k++) {
            ctx.beginPath(); ctx.moveTo(-2 + k * 5, 1);
            ctx.lineTo(-3 + k * 5 + scurry, 3.5); ctx.stroke();
          }
          ctx.fillStyle = "#ffd05a"; ctx.fillRect(d * 6, -1.2, 1, 1);
          break;
        }
        case "frog": {
          const hop = a.state === "flee" ? Math.abs(Math.sin(t * 10)) * 7 : 0;
          ctx.translate(0, -hop);
          ctx.fillStyle = "#4f9e46";
          ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 3, 0, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#6fc45a";
          ctx.beginPath(); ctx.arc(-1.6, -3, 1.6, 0, 6.28); ctx.arc(1.6, -3, 1.6, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#1a1220"; ctx.fillRect(-2.1, -3.6, 1, 1); ctx.fillRect(1.1, -3.6, 1, 1);
          ctx.fillStyle = "#4f9e46"; ctx.fillRect(-5, 1, 2.4, 2.6 - hop * 0.2); ctx.fillRect(2.6, 1, 2.4, 2.6 - hop * 0.2);
          break;
        }
        case "fish": {
          ctx.fillStyle = "#4fa8d8";
          ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, 6.28); ctx.fill();
          ctx.beginPath();                                       // tail fin
          ctx.moveTo(-d * 5, 0); ctx.lineTo(-d * 9, -2.6 + flap); ctx.lineTo(-d * 9, 2.6 + flap);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#bfe8ff"; ctx.beginPath(); ctx.ellipse(0, 1, 3.4, 1, 0, 0, 6.28); ctx.fill();
          ctx.fillStyle = "#1a1220"; ctx.fillRect(d * 3, -1, 1, 1);
          break;
        }
        case "turtle": {
          ctx.fillStyle = "#5f7f4a";
          ctx.beginPath(); ctx.arc(d * 5, 0, 2.2, 0, 6.28); ctx.fill();         // head
          ctx.fillRect(-4, 2, 2.4, 2.4); ctx.fillRect(2, 2, 2.4, 2.4);          // feet
          ctx.fillStyle = "#7a5a30";                                            // shell
          ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, Math.PI, 0); ctx.fill();
          ctx.strokeStyle = "#5d4426"; ctx.lineWidth = 0.8;
          for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 2.6, 0); ctx.lineTo(k * 1.8, -3.4); ctx.stroke(); }
          break;
        }
        default: {
          ctx.fillStyle = "#cdd6ff";
          ctx.beginPath(); ctx.arc(0, 0, 2, 0, 6.28); ctx.fill();
        }
      }
      ctx.restore();
    }

    renderBackground(ctx, cam) {
      const bio = this._biome;
      // Sky: a three-stop gradient so the horizon glows rather than banding.
      const g = ctx.createLinearGradient(0, 0, 0, cam.viewH);
      g.addColorStop(0, bio.sky[0]); g.addColorStop(0.55, bio.sky[1]); g.addColorStop(1, bio.sky[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.viewW, cam.viewH);

      // Star field (skipped for the leafy biomes, which have a canopy overhead).
      if (this.theme !== "forest" && this.theme !== "jungle") {
        ctx.save();
        const tw = this.timeMs / 1000;
        for (const s of this._stars) {
          const sx = s.x - cam.x * s.d, sy = s.y - cam.y * s.d;
          if (sx < -4 || sx > cam.viewW + 4 || sy < -4 || sy > cam.viewH + 4) continue;
          ctx.globalAlpha = s.d * (0.7 + Math.sin(tw * s.f + s.p) * 0.3);
          ctx.fillStyle = "#cdd6ff"; ctx.fillRect(sx, sy, s.s, s.s);
        }
        ctx.globalAlpha = 1; ctx.restore();
      }

      // Parallax layers, far to near.
      ctx.save();
      for (const L of bio.layers) L.paint(ctx, cam, L.d);
      ctx.restore();

      // Foreground dust motes / fireflies drifting through the near field.
      ctx.save();
      const t = this.timeMs / 1000;
      const moteCol = this.theme === "forest" || this.theme === "jungle" ? "#d8ff8a"
        : this.theme === "heart" || this.theme === "night" ? "#d9b8ff" : "#9fc8ff";
      for (const m of this._motes) {
        const mx = m.x - cam.x * 0.62 + Math.sin(t * m.f + m.p) * 14;
        const my = m.y - cam.y * 0.62 + Math.cos(t * m.f * 0.7 + m.p) * 10;
        if (mx < -6 || mx > cam.viewW + 6 || my < -6 || my > cam.viewH + 6) continue;
        ctx.globalAlpha = 0.20 + Math.sin(t * 1.6 + m.p) * 0.16;
        ctx.fillStyle = moteCol; ctx.shadowBlur = 6; ctx.shadowColor = moteCol;
        ctx.beginPath(); ctx.arc(mx, my, m.s * 0.7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();

      // Ambient wildlife lives between the backdrop and the tiles.
      this._renderAmbient(ctx, cam);
    }

    renderWorld(ctx, cam) {
      this.tilemap.render(ctx, cam);
      // Objects: draw non-players. Order: platforms/doors/hazards then pickups then lasers on top.
      for (const o of this.objects) if (!(o instanceof O.Laser)) o.render(ctx, this);
      for (const l of this.lasers) l.render(ctx, this);
      // the little companions (behind their heroes)
      for (const pet of this.pets) this._renderPet(ctx, pet);
      // weapon fire
      for (const s of this.projectiles) {
        ctx.save();
        if (s.arrow) {
          const a = Math.atan2(s.vy, s.vx);
          ctx.translate(s.x, s.y); ctx.rotate(a);
          ctx.strokeStyle = "#c9a06a"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
          ctx.fillStyle = "#c9d2e0"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.fill();
          ctx.fillStyle = "#a9d4ff"; ctx.fillRect(-9, -2, 3, 4);
        } else {
          ctx.fillStyle = "#9bf0b8"; ctx.shadowBlur = 8; ctx.shadowColor = "#9bf0b8";
          ctx.beginPath(); ctx.ellipse(s.x, s.y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore(); ctx.shadowBlur = 0;
      }
      for (const h of this.hostiles) {
        ctx.save();
        ctx.fillStyle = h.color || "#ff9aa4"; ctx.shadowBlur = 10; ctx.shadowColor = h.color || "#ff9aa4";
        if (h.kind === "bolt") {
          const a = Math.atan2(h.vy, h.vx);
          ctx.translate(h.x, h.y); ctx.rotate(a);
          ctx.beginPath(); ctx.ellipse(0, 0, 8, 2.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(2, 0, 3, 1.2, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r || 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.arc(h.x - 1.5, h.y - 1.5, (h.r || 5) * 0.35, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      for (const p of this.players) {
        // the swing rope, drawn beneath the hero
        if (p.swing) {
          ctx.strokeStyle = p.character.light; ctx.lineWidth = 2;
          ctx.globalAlpha = 0.9;
          ctx.beginPath(); ctx.moveTo(p.swing.ax, p.swing.ay); ctx.lineTo(p.cx, p.cy - 4); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        p.render(ctx);
      }
      // co-op pings
      for (const g of this.pings) {
        const f = Math.min(1, g.t / 0.5);
        ctx.save(); ctx.translate(g.x, g.y - (1 - Math.min(1, g.t / 3)) * 6);
        ctx.globalAlpha = f;
        ctx.strokeStyle = g.color; ctx.lineWidth = 2;
        ctx.shadowBlur = 10; ctx.shadowColor = g.color;
        ctx.rotate(Math.PI / 4);
        const s = 8 + Math.sin(g.t * 8) * 2;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.restore(); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
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
      for (const e of this.exits) glow(e.cx, e.cy, 40, (e.player === 0 ? O.COLORS.green : O.COLORS.blue).main, 0.28);
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
      // Per-biome colour grade: a whisper of warm/cool laid over the whole
      // frame ties world, characters and UI light into one palette.
      const GRADE = {
        cave: "rgba(80,130,255,0.05)", ruins: "rgba(90,200,220,0.05)",
        forest: "rgba(255,220,120,0.06)", jungle: "rgba(255,220,120,0.06)",
        temple: "rgba(255,180,90,0.06)", city: "rgba(140,190,255,0.06)",
        ice: "rgba(140,190,255,0.06)", heart: "rgba(200,120,255,0.07)",
        night: "rgba(200,120,255,0.07)", factory: "rgba(255,140,80,0.05)",
        lab: "rgba(255,140,80,0.05)",
      };
      ctx.fillStyle = GRADE[this.theme] || GRADE.cave;
      ctx.fillRect(0, 0, vw, vh);
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
        // shots in flight (so the online partner sees bolts, arrows and spores)
        pj: this.projectiles.map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.arrow ? 1 : 0]),
        hs: (this.hostiles || []).map(h => [Math.round(h.x), Math.round(h.y), Math.round(h.vx), Math.round(h.vy), h.kind === "bolt" ? 1 : 0]),
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
      if (s.pj) this.projectiles = s.pj.map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], arrow: !!a[4], life: 0.1 }));
      if (s.hs) this.hostiles = s.hs.map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], kind: a[4] ? "bolt" : "spore", r: a[4] ? 4 : 5, color: a[4] ? "#ff6ad5" : "#caff7a", life: 0.1 }));
    }
  }

  GG.Level = Level;
})(window);
