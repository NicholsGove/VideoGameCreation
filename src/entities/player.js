/* =========================================================================
 * player.js — playable characters with unique abilities + tight platforming
 * -------------------------------------------------------------------------
 * Two original characters (no copied IP):
 *   • CIRCUIT — immune to electricity, flips BLUE switches, pushes heavy crates.
 *   • BLOOM   — immune to poison,      flips GREEN switches, jumps higher.
 *
 * Feel is tuned with coyote-time, jump-buffering and variable jump height so
 * controls stay responsive. A small state machine drives animation.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;

  // Character definitions — extend this array to add new playable characters.
  const CHARACTERS = [
    {
      // Nichols — the Inventor & Engineer. Brown skin, explorer jacket, a
      // mechanical gauntlet, small backpack. Green & silver palette.
      // NOTE: his colour drives which coloured mechanisms he can operate
      // (GREEN), but his immunity is unchanged — he still shrugs off electricity.
      id: "nichols", name: "Nichols", color: "green",
      body: "#3a8a4a", dark: "#255c31", light: "#bff0c8",
      immune: ["electric"], canPushHeavy: true, canRepair: true,
      canCarry: true, canGrapple: true, canBuild: true,     // engineer toolkit
      canDash: false, canCrawl: false, canDetect: false,
      jumpScale: 1.0, maxJumps: 1, narrow: false, height: 30, climbGrip: 1.0,
      pal: {
        skin: "#a56a43", skinShade: "#864f2f", hair: "#241812",
        jacket: "#3a8a4a", jacketDark: "#255c31", pants: "#2c3446",
        silver: "#c9d2e0", silverDark: "#8b95a8", belt: "#5a3a24",
        boot: "#3a2a1a", accent: "#6ec27e", glowc: "#9bf0b8",
      },
      blurb: "Immune to electricity · pushes heavy objects · repairs machines · activates GREEN mechanisms",
    },
    {
      // Nibihah — the Explorer & Acrobat. Brown skin, long braid, hooded cape,
      // satchel. Blue & gold palette. Double jump, fits through gaps.
      // Her colour drives which mechanisms she operates (BLUE); she remains
      // the one who can survive poison.
      id: "nibihah", name: "Nibihah", color: "blue",
      body: "#3a6ea5", dark: "#24466a", light: "#a9c8ec",
      immune: ["poison"], canPushHeavy: false, canRepair: false,
      canCarry: false, canGrapple: false, canBuild: false,
      canDash: true, canCrawl: true, canDetect: true,        // explorer toolkit
      jumpScale: 1.02, maxJumps: 2, narrow: true, height: 24, climbGrip: 0.45,
      pal: {
        skin: "#a56a43", skinShade: "#864f2f", hair: "#241812",
        cape: "#3a6ea5", capeDark: "#274a72", cloth: "#4f86c6",
        gold: "#ddb84a", goldDark: "#a3862f", belt: "#5a4324",
        boot: "#3a2a1a", accent: "#7fb0e6", glowc: "#a9d4ff",
      },
      blurb: "Immune to poison · double-jump · fits through narrow passages · activates BLUE mechanisms",
    },
  ];

  // Physics tuning constants (px, seconds).
  const MOVE = 2500;      // ground acceleration
  const MAX_SPD = 210;    // max horizontal speed
  const AIR = 1600;       // air acceleration
  const FRICTION = 1800;  // ground friction
  const ICE_FRICTION = 120;
  const JUMP_V = 720;     // base jump velocity
  const COYOTE = 0.09;    // grace period after leaving ledge
  const BUFFER = 0.10;    // jump buffer window
  const WALL_SLIDE_MAX = 95;   // max fall speed while wall-sliding
  const WALL_JUMP_VX = 240;    // horizontal kick off a wall
  const DASH_SPEED = 430;      // Nibihah's mid-air dash
  const DASH_TIME = 0.16;
  const CRAWL_H = 14;          // crawling collision height
  const THROW_MAX = 620;       // fully-charged throw speed
  const CHARGE_RATE = 1.7;     // charge units per second (0..1)
  const CARRY_SLOW = 0.82;     // carrying something slows you a little

  class Player {
    /** @param {number} index 0 or 1 @param {number} charIndex which character */
    constructor(index, charIndex, spawn) {
      this.index = index;
      this.character = CHARACTERS[charIndex % CHARACTERS.length];
      this.w = 22; this.h = this.character.height || 28;   // Lyra is shorter
      this.spawn = { x: spawn.x, y: spawn.y };
      this.reset();
      // Input for this player is injected each frame (local or networked).
      this.input = { left: false, right: false, up: false, down: false, jumpPressed: false, action: false };
      this.facing = 1;
    }

    reset() {
      this.x = this.spawn.x; this.y = this.spawn.y;
      this.vx = 0; this.vy = 0;
      this.onGround = false; this.groundRef = null;
      this.dead = false; this.deadTimer = 0;
      this._coyote = 0; this._buffer = 0; this._teleCool = 0;
      this.squash = 1; this._wasGround = false;
      this.jumpsLeft = this.character.maxJumps;
      this._wallSliding = false; this._wallDir = 0;
      this._dx = 0; this._dy = 0;     // per-frame movement delta (for carrying riders)
      this.pushing = false;           // set by Level when this hero is shoving something
      this.animName = "idle"; this.animTime = 0; this.blink = 0;
      this.celebrating = false;
      // --- ability state ---
      this.fullH = this.character.height || 28;
      this.h = this.fullH;
      this.crawling = false;
      this.carrying = null;           // crate currently held above the head
      this.charge = 0;                // throw charge 0..1
      this.dashesLeft = 1; this.dashTime = 0; this.dashDir = 1;
      this.grappleFx = null;          // {x,y,t} rope visual
      this.carriedBy = null;
    }

    kill(level, reason) {
      if (this.dead) return;
      this.dead = true; this.deadTimer = 0;
      this.vx = 0; this.vy = 0;
      GG.bus.emit("player:death", { index: this.index, reason });
      if (level) {
        level.deaths++;
        level.fx.burst({ x: this.cx, y: this.cy, count: 26, color: [this.character.body, "#fff", this.character.dark], speed: 220, life: 0.6, gravity: 500, glow: true });
        level.cam.shake(0.5);
      }
    }

    respawn() { this.reset(); }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }

    // ---- Main update -----------------------------------------------------
    update(dt, level) {
      if (this.dead) { this.deadTimer += dt; return; }
      this._teleCool = Math.max(0, this._teleCool - dt);

      const inp = this.input;
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir !== 0) this.facing = dir;

      // Surface under feet affects friction / conveyor push.
      let friction = FRICTION;
      let conveyor = 0;
      if (this.onGround) {
        const tid = level.tilemap.tileAtWorld(this.cx, this.y + this.h + 2);
        if (tid === GG.TILE.ICE) friction = ICE_FRICTION;
        if (tid === GG.TILE.CONVEYOR_L) conveyor = -60;
        if (tid === GG.TILE.CONVEYOR_R) conveyor = 60;
      }

      // Abilities: crawl, dash, grapple, carry & throw.
      this._updateAbilities(dt, level, inp, dir);
      const dashing = this.dashTime > 0;

      // Horizontal accel / friction (crawling and carrying slow you down).
      const accel = this.onGround ? MOVE : AIR;
      const speedCap = MAX_SPD * (this.crawling ? 0.55 : 1) * (this.carrying ? CARRY_SLOW : 1);
      if (dashing) {
        this.vx = this.dashDir * DASH_SPEED;
      } else if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.vx = U.clamp(this.vx, -speedCap, speedCap);
      } else if (this.onGround) {
        const s = Math.sign(this.vx);
        this.vx -= s * friction * dt;
        if (Math.sign(this.vx) !== s) this.vx = 0;
      }

      // Refill jumps when grounded (enables Lyra's mid-air double jump).
      if (this.onGround) this.jumpsLeft = this.character.maxJumps;

      // Coyote + jump buffer.
      this._coyote = this.onGround ? COYOTE : Math.max(0, this._coyote - dt);
      if (inp.jumpPressed) this._buffer = BUFFER; else this._buffer = Math.max(0, this._buffer - dt);

      const wantJump = this._buffer > 0;
      const canGround = wantJump && this._coyote > 0;
      const canWall = wantJump && this._wallSliding && !this.onGround;
      const canAir = wantJump && !this.onGround && this._coyote <= 0 && this.jumpsLeft > 0 && this.character.maxJumps > 1;

      if (canGround) {
        // A partner standing on your head weighs you down: you can still jump,
        // but noticeably lower. Keeps head-stacking useful without breaking it.
        const rider = level.players.find(q => q !== this && !q.dead && q.groundRef === this);
        this.vy = -JUMP_V * this.character.jumpScale * (rider ? 0.72 : 1);
        this._buffer = 0; this._coyote = 0; this.onGround = false;
        this.jumpsLeft = this.character.maxJumps - 1; this.squash = 0.7;
        GG.bus.emit("player:jump", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.y + this.h, count: 6, color: "#cfd8ff", speed: 60, life: 0.25, angle: -Math.PI / 2, spread: 0.8 });
      } else if (canWall) {
        // Kick away from the wall.
        this.vy = -JUMP_V * 0.92;
        this.vx = -this._wallDir * WALL_JUMP_VX;
        this.facing = -this._wallDir;
        this._buffer = 0; this._wallSliding = false;
        this.jumpsLeft = this.character.maxJumps - 1; this.squash = 0.72;
        GG.bus.emit("player:jump", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.cy, count: 8, color: "#cfd8ff", speed: 110, life: 0.3, glow: true });
      } else if (canAir) {
        // Lyra's double jump.
        this.vy = -JUMP_V * this.character.jumpScale * 0.9;
        this._buffer = 0; this.jumpsLeft--; this.squash = 0.72;
        GG.bus.emit("player:jump", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.cy, count: 12, color: [this.character.body, "#fff"], speed: 130, life: 0.35, glow: true, angle: Math.PI / 2, spread: 1.2 });
      }

      // Variable jump height: releasing up cuts the rise short.
      if (!inp.up && this.vy < -180) this.vy = -180;

      // Gravity (suspended during a dash).
      if (dashing) { this.vy = 0; }
      else { this.vy += C.GRAVITY * dt; this.vy = Math.min(this.vy, 900); }

      // Drop through one-way platforms by holding down.
      this.dropThrough = !!inp.down && !this.onGround ? true : (!!inp.down && this.groundRef && this.groundRef.oneWay);

      // Integrate with collision against the level's full solid set.
      const solids = level.solidsFor(this);
      const px = this.x, py = this.y;
      const dx = (this.vx + conveyor) * dt;
      GG.Physics.move(this, dx, this.vy * dt, solids);
      this._dx = this.x - px; this._dy = this.y - py; // delta (used to carry riders)

      // Wall-slide detection: airborne, pressing into a wall, descending.
      this._wallDir = this.hitWallDir;
      const pressingWall = (inp.right && this._wallDir > 0) || (inp.left && this._wallDir < 0);
      this._wallSliding = !this.onGround && this.vy > 0 && pressingWall;
      if (this._wallSliding) {
        // climbGrip < 1 means a better climber descends more slowly (Nibihah).
        this.vy = Math.min(this.vy, WALL_SLIDE_MAX * (this.character.climbGrip ?? 1));
        if (Math.random() < 0.3) level.fx.burst({ x: this.x + (this._wallDir > 0 ? this.w : 0), y: this.cy, count: 1, color: "#cfd8ff", speed: 30, life: 0.3 });
      }

      // Landing detection (squash + dust + sfx).
      if (this.onGround && !this._wasGround && this._fallSpeed > 260) {
        this.squash = 0.68;
        GG.bus.emit("player:land", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.y + this.h, count: 8, color: "#cfd8ff", speed: 90, life: 0.3, angle: -Math.PI / 2, spread: 1.4 });
        if (this._fallSpeed > 600) level.cam.shake(0.12);
      }
      this._wasGround = this.onGround;
      this._fallSpeed = this.vy;

      // Squash/stretch easing back to 1.
      this.squash = U.damp(this.squash, 1, 12, dt);

      // Advance animation state.
      const prev = this.animName;
      this.animName = this._poseState();
      if (this.animName !== prev) this.animTime = 0; else this.animTime += dt;
      this.blink -= dt;
      if (this.blink < -0.2 && Math.random() < 0.04) this.blink = 0.12;
    }

    // ---- Abilities -------------------------------------------------------
    /**
     * Per-frame ability handling. Nichols: carry / charge-throw / grapple.
     * Nibihah: crawl / mid-air dash. Both share the co-op item hand-off.
     */
    _updateAbilities(dt, level, inp, dir) {
      const ch = this.character;
      if (this.grappleFx) { this.grappleFx.t -= dt; if (this.grappleFx.t <= 0) this.grappleFx = null; }

      // --- Crawl (Nibihah): shrink while holding down on the ground -------
      if (ch.canCrawl) {
        const want = !!inp.down && this.onGround && !this.carrying;
        if (want && !this.crawling) {
          this.crawling = true; const d = this.fullH - CRAWL_H; this.h = CRAWL_H; this.y += d;
        } else if (!want && this.crawling) {
          // only stand back up if there is headroom
          const d = this.fullH - CRAWL_H;
          const probe = { x: this.x, y: this.y - d, w: this.w, h: this.fullH };
          if (!level.overlapsSolid(probe, this)) { this.y -= d; this.h = this.fullH; this.crawling = false; }
        }
      }

      // --- Dash (Nibihah): one mid-air burst, refreshed on landing --------
      if (ch.canDash) {
        if (this.onGround) this.dashesLeft = 1;
        if (this.dashTime > 0) this.dashTime -= dt;
        if (inp.specialPressed && this.dashesLeft > 0 && this.dashTime <= 0) {
          this.dashesLeft--; this.dashTime = DASH_TIME;
          this.dashDir = dir !== 0 ? dir : this.facing;
          this.facing = this.dashDir;
          GG.bus.emit("player:dash", { index: this.index });
          level.fx.burst({ x: this.cx, y: this.cy, count: 14, color: [ch.body, "#fff"], speed: 180, life: 0.32, glow: true, angle: this.dashDir > 0 ? Math.PI : 0, spread: 0.7 });
        }
      }

      // --- Carry & throw (Nichols) ---------------------------------------
      if (ch.canCarry) {
        if (this.carrying) {
          // hold the crate above the head; charge while ACTION is held
          const c = this.carrying;
          c.x = this.cx - c.w / 2;
          c.y = this.y - c.h - 2;
          c.vx = 0; c.vy = 0;
          if (inp.action && this._carryCool <= 0) this.charge = Math.min(1, this.charge + CHARGE_RATE * dt);
          else if (!inp.action && this.charge > 0.02) this._release(level);
        } else if (inp.action && this._carryCool <= 0) {
          // pick up an adjacent crate
          for (const c of level.crates) {
            if (c.carried || c.thrown) continue;
            const near = Math.abs(c.cx - this.cx) < this.w + 10 && Math.abs(c.cy - this.cy) < this.h;
            if (near) { this.carrying = c; c.carried = this; this._carryCool = 0.3; this.charge = 0; GG.bus.emit("crate:push", {}); break; }
          }
        }
      }
      this._carryCool = Math.max(0, (this._carryCool || 0) - dt);

      // --- Catch (either hero): grab a crate flying past you ---------------
      if (!this.carrying && inp.action && this._carryCool <= 0) {
        for (const c of level.crates) {
          if (!c.thrown || c.carried) continue;
          if (U.aabb(this, c)) {
            c.thrown = false; c.vx = 0; c.vy = 0;
            if (this.character.canCarry) { this.carrying = c; c.carried = this; }
            this._carryCool = 0.3;
            GG.bus.emit("crate:caught", {});
            level.fx.burst({ x: c.cx, y: c.cy, count: 10, color: "#fff", speed: 90, life: 0.3 });
            break;
          }
        }
      }
    }

    /** Release a charged throw in the aimed direction. */
    _release(level) {
      const c = this.carrying; if (!c) return;
      const power = 0.35 + this.charge * 0.65;
      let ax = this.facing, ay = 0;
      if (this.input.up) { ay = -1; if (!this.input.left && !this.input.right) ax = 0; }
      else if (this.input.down) { ay = 0.4; }
      const len = Math.hypot(ax, ay) || 1;
      c.vx = (ax / len) * THROW_MAX * power;
      c.vy = (ay / len) * THROW_MAX * power - 160 * power;   // slight lob
      c.carried = null; c.thrown = true; c.bounces = 3;
      this.carrying = null; this.charge = 0; this._carryCool = 0.25;
      GG.bus.emit("crate:thrown", {});
      level.fx.burst({ x: c.cx, y: c.cy, count: 12, color: [this.character.body, "#fff"], speed: 150, life: 0.35, glow: true });
    }

    // ---- Animation state selection --------------------------------------
    /** Pick the current animation from physics + flags. Works host- and
     *  client-side (only reads fields present after a snapshot). */
    _poseState() {
      if (this.dead) return "defeated";
      if (this.celebrating) return this.victoryPose || "celebrate";
      if (this._wallSliding) return "climb";
      if (!this.onGround) return this.vy < -30 ? "jump" : "fall";
      if (this.pushing) return "push";
      const spd = Math.abs(this.vx);
      if (spd > 150) return "run";
      if (spd > 18) return "walk";
      return "idle";
    }

    // ---- Rich procedural pixel-art renderer -----------------------------
    render(ctx) {
      const p = this, ch = p.character, pal = ch.pal;
      const st = p.animName, t = p.animTime;
      if (p.dead) ctx.globalAlpha = U.clamp(1 - p.deadTimer * 0.5, 0.25, 1);

      // ground shadow (soft)
      ctx.save();
      ctx.globalAlpha *= p.dead ? 0.4 : 0.28;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(p.cx, p.y + p.h + 1.5, p.w * 0.52, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // Local space: origin at feet-centre, +x = facing forward.
      ctx.save();
      ctx.translate(p.cx, p.y + p.h);
      ctx.scale(p.facing, 1);
      const sqY = p.squash, sqX = 1 + (1 - p.squash) * 0.55;
      ctx.scale(sqX, sqY);

      // Pose parameters per state ---------------------------------------
      let legPhase = 0, legSpeed = 0, armSwing = 0, lean = 0, bob = 0, crouch = 0;
      let armFwd = 0, armUp = 0, reach = 0;
      switch (st) {
        case "walk":  legSpeed = 9;  legPhase = Math.sin(t * legSpeed); armSwing = -legPhase * 3; bob = Math.abs(Math.sin(t * legSpeed)) * 1.2; break;
        case "run":   legSpeed = 15; legPhase = Math.sin(t * legSpeed); armSwing = -legPhase * 5; lean = 3; bob = Math.abs(Math.sin(t * legSpeed)) * 2; break;
        case "jump":  crouch = -2; armUp = 4; legPhase = 0.6; break;
        case "fall":  armUp = 2; legPhase = -0.4; break;
        case "climb": reach = Math.sin(t * 8) * 3; lean = 1; break;
        case "push":  lean = 4; armFwd = 6; legPhase = Math.sin(t * 6) * 0.5; break;
        case "celebrate": bob = Math.abs(Math.sin(t * 8)) * 4; armUp = 6 + Math.sin(t * 8) * 2; break;
        // survived something brutal: doubled over, catching their breath
        case "exhausted": crouch = 7; lean = 6; bob = Math.sin(t * 1.6) * 1.4; armFwd = 2; break;
        case "defeated": crouch = 8; break;
        default:      bob = Math.sin(t * 2.2) * 0.8; break; // idle breathing
      }
      ctx.translate(0, -bob + crouch * 0.4);
      ctx.rotate((lean * (st === "climb" ? 0 : 1)) * Math.PI / 180 * 0.4);

      const H = p.h, W = p.w;
      const legY = 0, hipY = -H * 0.42, chestY = -H * 0.62, headY = -H * 0.80;

      // === LEGS ===
      const legOff = legPhase * (st === "run" ? 5 : st === "walk" ? 3.5 : 1.5);
      const drawLeg = (dx, swing) => {
        ctx.fillStyle = pal.pants || pal.cloth || ch.dark;
        ctx.fillRect(dx - 2, hipY, 4, H * 0.30);
        ctx.fillStyle = pal.boot; // climbing boots
        ctx.fillRect(dx - 2.5, legY - 4 - crouch * 0.2, 5, 5);
      };
      if (st === "defeated") {
        ctx.fillStyle = pal.boot; ctx.fillRect(-6, -4, 6, 4); ctx.fillRect(2, -3, 6, 3);
      } else {
        drawLeg(-3 + legOff * 0.6, legOff); drawLeg(3 - legOff * 0.6, -legOff);
      }

      // === TORSO (jacket / cape) ===
      const isN = ch.id === "nichols";
      if (isN) {
        // Nichols: explorer jacket (blue) + utility belt + backpack
        ctx.fillStyle = pal.jacket; ctx.fillRect(-W * 0.34, chestY, W * 0.68, H * 0.30);
        ctx.fillStyle = pal.jacketDark; ctx.fillRect(-W * 0.34, chestY, W * 0.20, H * 0.30); // shade
        ctx.fillStyle = pal.belt; ctx.fillRect(-W * 0.34, hipY - 3, W * 0.68, 3);
        ctx.fillStyle = pal.silver; ctx.fillRect(-1, hipY - 3, 3, 3); // buckle
        // small backpack behind (drawn at back = -x)
        ctx.fillStyle = pal.jacketDark; ctx.fillRect(-W * 0.42, chestY + 3, 5, H * 0.22);
        ctx.fillStyle = pal.silverDark; ctx.fillRect(-W * 0.42, chestY + 6, 5, 2);
      } else {
        // Nibihah: light outfit + hooded cape (behind) + gold trim + satchel
        ctx.fillStyle = pal.capeDark; ctx.fillRect(-W * 0.46, chestY - 1, 6, H * 0.42 + reach * 0.1); // cape flowing back
        ctx.fillStyle = pal.cloth; ctx.fillRect(-W * 0.30, chestY, W * 0.60, H * 0.30);
        ctx.fillStyle = pal.gold; ctx.fillRect(-W * 0.30, hipY - 2, W * 0.60, 2); // sash
        ctx.fillStyle = pal.goldDark; ctx.fillRect(-2, chestY + 2, 4, H * 0.24); // knee-guard glint / center line
        // satchel across body
        ctx.fillStyle = pal.belt; ctx.fillRect(W * 0.10, chestY + 4, 6, 6);
        ctx.fillStyle = pal.gold; ctx.fillRect(W * 0.10, chestY + 4, 6, 1);
      }

      // === ARMS ===
      const armY = chestY + 3;
      const swing = armSwing + armFwd;
      // back arm
      ctx.fillStyle = isN ? pal.jacketDark : pal.capeDark;
      ctx.fillRect(-W * 0.30 - 1, armY - (armUp) - reach, 3, H * 0.22 + Math.abs(swing) * 0.2);
      // front arm / gauntlet
      if (isN) {
        // mechanical gauntlet (silver, glowing) on the front arm
        ctx.fillStyle = pal.skin; ctx.fillRect(W * 0.24, armY - armUp - reach, 3, H * 0.12);
        ctx.fillStyle = pal.silver;
        ctx.fillRect(W * 0.22, armY - armUp - reach + H * 0.10, 5, H * 0.14 + swing * 0.2);
        ctx.fillStyle = pal.glowc; ctx.shadowBlur = 6; ctx.shadowColor = pal.glowc;
        ctx.fillRect(W * 0.235, armY - armUp - reach + H * 0.13, 2.5, 3);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = pal.skin;
        ctx.fillRect(W * 0.24, armY - armUp - reach, 3, H * 0.22 + swing * 0.2);
        ctx.fillStyle = pal.gold; ctx.fillRect(W * 0.235, armY - armUp - reach + H * 0.10, 4, 2); // bracer
      }

      // === HEAD ===
      const hx = st === "run" || st === "push" ? lean * 0.4 : 0;
      // neck/skin
      ctx.fillStyle = pal.skin; ctx.fillRect(-W * 0.20 + hx, headY, W * 0.40, H * 0.20);
      ctx.fillStyle = pal.skinShade; ctx.fillRect(-W * 0.20 + hx, headY, W * 0.12, H * 0.20); // face shade (back)
      // hair / hood
      if (isN) {
        ctx.fillStyle = pal.hair; // short dark hair
        ctx.fillRect(-W * 0.22 + hx, headY - 2, W * 0.44, 5);
        ctx.fillRect(-W * 0.22 + hx, headY - 2, 4, H * 0.12);
      } else {
        // hooded cape up + long braid trailing back
        ctx.fillStyle = pal.capeDark; ctx.fillRect(-W * 0.24 + hx, headY - 3, W * 0.48, 5);
        ctx.fillStyle = pal.hair; ctx.fillRect(-W * 0.30 + hx, headY + 2, 4, H * 0.30 + Math.sin(t * 6) * 1.5); // braid down the back
        ctx.fillStyle = pal.gold; ctx.fillRect(-W * 0.24 + hx, headY - 3, W * 0.48, 1.5); // hood trim
      }
      // eye (facing forward), blink
      if (st !== "defeated") {
        ctx.fillStyle = "#0b0e18";
        if (this.blink > 0) ctx.fillRect(W * 0.10 + hx, headY + 7, 4, 1);
        else ctx.fillRect(W * 0.12 + hx, headY + 5, 3, 4);
      } else {
        ctx.strokeStyle = "#0b0e18"; ctx.lineWidth = 1; // x_x eyes
        ctx.beginPath(); ctx.moveTo(W*0.06+hx, headY+5); ctx.lineTo(W*0.14+hx, headY+9); ctx.moveTo(W*0.14+hx, headY+5); ctx.lineTo(W*0.06+hx, headY+9); ctx.stroke();
      }

      // celebrate sparkles
      if (st === "celebrate") {
        ctx.fillStyle = pal.glowc; ctx.shadowBlur = 6; ctx.shadowColor = pal.glowc;
        for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; ctx.fillRect(Math.cos(a) * 12, headY - 6 + Math.sin(a) * 6, 2, 2); }
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // --- ability feedback drawn in world space -------------------------
      if (this.grappleFx) {                       // grappling rope
        ctx.save();
        ctx.strokeStyle = pal.silver || "#cfe0ff"; ctx.lineWidth = 2;
        ctx.globalAlpha = Math.max(0, this.grappleFx.t / 0.25);
        ctx.shadowBlur = 6; ctx.shadowColor = ch.body;
        ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(this.grappleFx.x, this.grappleFx.y); ctx.stroke();
        ctx.restore();
      }
      if (this.carrying && this.charge > 0.02) {  // throw charge meter
        const w = 26, x = this.cx - w / 2, y = this.y - this.carrying.h - 12;
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x - 1, y - 1, w + 2, 6);
        const grd = ctx.createLinearGradient(x, 0, x + w, 0);
        grd.addColorStop(0, "#6ef0a0"); grd.addColorStop(0.6, "#f2c14e"); grd.addColorStop(1, "#ff6b6b");
        ctx.fillStyle = grd; ctx.fillRect(x, y, w * this.charge, 4);
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // For networking: compact authoritative state.
    getState() {
      return { x: Math.round(this.x * 10) / 10, y: Math.round(this.y * 10) / 10, vx: this.vx, vy: this.vy, f: this.facing, d: this.dead ? 1 : 0 };
    }
    setState(s) {
      if (!s) return;
      this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
      this.facing = s.f; this.dead = !!s.d;
    }
  }

  Player.CHARACTERS = CHARACTERS;
  GG.Player = Player;
})(window);
