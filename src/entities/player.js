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
      // how he FEELS: heavy and grounded — slower to get going and to turn,
      // falls a touch faster, lands with a thud
      feel: { accel: 0.82, air: 0.88, turn: 0.8, stop: 1.15, maxFall: 960, heavy: true },
      pal: {
        skin: "#b4784c", skinShade: "#8d5a36", skinLit: "#cf9163",
        hair: "#2a1c14", hairLit: "#4a3423",
        jacket: "#3f8f52", jacketDark: "#28603a", jacketLit: "#5fb374",
        under: "#e8dcc0", pants: "#2f3a4e", pantsDark: "#222a3a",
        silver: "#cfd8e6", silverDark: "#8b95a8", belt: "#6b4526", beltLit: "#8f6236",
        boot: "#40301e", bootPlate: "#a8b2c4",
        scarf: "#e0674f", scarfDark: "#b04434", scarfLit: "#f5917a",
        eye: "#6ef0a0", accent: "#6ec27e", glowc: "#9bf0b8", crystal: "#7ef7c0",
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
      // how she FEELS: light and quick — snappy turns, floaty descent
      feel: { accel: 1.25, air: 1.2, turn: 1.5, stop: 0.95, maxFall: 780, heavy: false },
      pal: {
        skin: "#b4784c", skinShade: "#8d5a36", skinLit: "#cf9163", hair: "#241812",
        hairLit: "#3d2a1c",
        cape: "#3f76ad", capeDark: "#28527c", capeLit: "#5f96cd",
        cloth: "#4f86c6", under: "#dfe8f4", armor: "#b8c2d4", armorDark: "#7d8798",
        gold: "#e8c65c", goldDark: "#a3862f", belt: "#6b4526",
        boot: "#40301e", bootPlate: "#c4a24a",
        eye: "#7fd4ff", accent: "#7fb0e6", glowc: "#a9d4ff", crystal: "#a9d4ff",
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
  const COYOTE = 0.12;    // grace period after leaving ledge (Ori-generous)
  const BUFFER = 0.14;    // jump buffer window (Ori-generous)
  const WALL_SLIDE_MAX = 95;   // max fall speed while wall-sliding
  const WALL_JUMP_VX = 240;    // horizontal kick off a wall
  const DASH_SPEED = 430;      // Nibihah's mid-air dash
  const DASH_TIME = 0.16;
  const CRAWL_H = 14;          // crawling collision height
  const THROW_MAX = 620;       // fully-charged throw speed
  const CHARGE_RATE = 1.7;     // charge units per second (0..1)
  const CARRY_SLOW = 0.82;     // carrying something slows you a little
  const ROLL_SPEED = 360;      // dodge roll (ground only)
  const ROLL_TIME = 0.24;
  const MELEE_TIME = 0.16, MELEE_CD = 0.34;

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
      // --- expression + idle personality ---
      this.expr = "focused";          // drives eyebrows/mouth (see _face)
      this._exprHold = 0;             // seconds an expression is locked in
      this.idleVariant = 0;           // which little idle flourish is playing
      this._idleTimer = 0;
      this.hairWind = 0;              // hair reacts to speed (cosmetic only)
      // --- ability state ---
      this.fullH = this.character.height || 28;
      this.h = this.fullH;
      this.crawling = false;
      this.carrying = null;           // crate currently held above the head
      this.charge = 0;                // throw charge 0..1
      this.dashesLeft = 1; this.dashTime = 0; this.dashDir = 1;
      this.grappleFx = null;          // {x,y,t} rope visual
      this.carriedBy = null;
      // --- health & combat (open world) ---
      this.maxHp = this.maxHp || 3;
      this.hp = this.maxHp;
      this.invuln = this._everSpawned ? 1.0 : 0;      // a moment's grace after reviving
      this.spawnFx = this._everSpawned ? 0.6 : 0;      // light gathers back into the hero
      this._everSpawned = true;
      this.meleeT = 0; this.meleeCd = 0; this._meleeFresh = false;
      this.rollT = 0; this.rollCd = 0; this.rollDir = 1;
      this.hurtT = 0;
    }

    /**
     * Take a hit from a creature, a guardian or their shots. In the open
     * world heroes have hearts; elsewhere (and from spikes, lasers and pits)
     * a hit is still a fall. Returns true if it landed.
     */
    hurt(level, dmg, fromX) {
      if (this.dead || this.invuln > 0 || this.rollT > 0) return false;
      if (!level || !level.healthMode) { this.kill(level, "creature"); return true; }
      this.hp -= dmg || 1;
      this.invuln = 1.1; this.hurtT = 0.35;
      const dir = Math.sign(this.cx - (fromX == null ? this.cx - this.facing : fromX)) || -this.facing;
      this.vx = dir * 260; this.vy = -300; this._noCut = true; this.onGround = false;
      this.swing = null; if (this.teleHold) this.teleHold.dropTele && this.teleHold.dropTele();
      GG.bus.emit("hit:stop", { s: 0.07 });
      GG.bus.emit("player:hurt", { index: this.index, hp: this.hp });
      if (GG.input && GG.input.rumble) GG.input.rumble(this.index, 0.7, 0.4, 160);
      level.cam.shake(0.22);
      level.fx.burst({ x: this.cx, y: this.cy, count: 14, color: ["#ff6b6b", "#fff", this.character.body], speed: 170, life: 0.4, glow: true });
      if (this.hp <= 0) this.kill(level, "creature");
      return true;
    }

    kill(level, reason) {
      if (this.dead) return;
      this.dead = true; this.deadTimer = 0;
      this.vx = 0; this.vy = 0;
      GG.bus.emit("hit:stop", { s: 0.1 });        // the world holds its breath
      if (level && level.cam) level.cam.shake(0.25);
      GG.bus.emit("player:death", { index: this.index, reason });
      if (GG.input && GG.input.rumble) GG.input.rumble(this.index, 1, 0.6, 280);
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
      if (dir !== 0 && !(this.rollT > 0)) this.facing = dir;
      this._updateCombat(dt, level, inp, dir);

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
      const feel = this.character.feel || { accel: 1, air: 1, turn: 1, stop: 1, maxFall: 900 };
      let accel = this.onGround ? MOVE * feel.accel : AIR * feel.air;
      // turning around bites harder for the light acrobat, softer for the engineer
      if (dir !== 0 && Math.sign(this.vx) === -dir) accel *= 1 + feel.turn * 0.6;
      if (this.swimming) accel *= 0.55;
      const speedCap = MAX_SPD * (this.crawling ? 0.55 : 1) * (this.carrying ? CARRY_SLOW : 1) * (this.swimming ? 0.7 : 1);
      if (this.onGround || dashing) this._momentum = false;
      if (this.rollT > 0) {
        this.vx = this.rollDir * ROLL_SPEED;            // a quick, low roll
      } else if (dashing) {
        this.vx = this.dashDir * DASH_SPEED;
      } else if (this._wasDashing) {
        this.vx = U.clamp(this.vx, -speedCap, speedCap);            // a dash ends crisply
      } else if (dir !== 0) {
        if (this._momentum && Math.sign(this.vx) === dir && Math.abs(this.vx) > speedCap) {
          // MOMENTUM: speed from a wall kick, a swing or a toss carries on and
          // bleeds off gently instead of being clipped the instant you steer
          this.vx = dir * Math.max(speedCap, Math.abs(this.vx) - 380 * dt);
        } else {
          this.vx += dir * accel * dt;
          this.vx = U.clamp(this.vx, -speedCap, speedCap);
        }
      } else if (this.onGround) {
        const s = Math.sign(this.vx);
        this.vx -= s * friction * feel.stop * dt;
        if (Math.sign(this.vx) !== s) this.vx = 0;
      }
      this._wasDashing = dashing;

      // Refill jumps when grounded (enables Lyra's mid-air double jump).
      if (this.onGround) this.jumpsLeft = this.character.maxJumps;

      // Coyote + jump buffer.
      this._coyote = this.onGround ? COYOTE : Math.max(0, this._coyote - dt);
      if (inp.jumpPressed) this._buffer = BUFFER; else this._buffer = Math.max(0, this._buffer - dt);

      const wantJump = this._buffer > 0;
      const canGround = wantJump && this._coyote > 0;
      const canWall = wantJump && this._wallSliding && !this.onGround && this.character.canWallJump !== false;
      const canAir = wantJump && !this.onGround && this._coyote <= 0 && this.jumpsLeft > 0 && this.character.maxJumps > 1;

      if (canGround && this.rollT > 0) { this.rollT = 0; this.vx = U.clamp(this.vx, -MAX_SPD, MAX_SPD); }
      if (canGround) {
        // A partner standing on your head weighs you down: you still jump,
        // just noticeably lower — and your rider is carried up with you.
        const rider = level.players.find(q => q !== this && !q.dead && q.groundRef === this);
        this.vy = -JUMP_V * this.character.jumpScale * (rider ? 0.72 : 1);
        // The rider rides the jump glued to the carrier's head (Level handles
        // the stacked flight; loose velocities just make them collide mid-air).
        if (rider) rider._stackedOn = this;
        this._buffer = 0; this._coyote = 0; this.onGround = false;
        this.jumpsLeft = this.character.maxJumps - 1;
        this.squash = 1.24;                        // STRETCH on the rise (anticipation)
        GG.bus.emit("player:jump", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.y + this.h, count: 9, color: "#cfd8ff", speed: 70, life: 0.28, angle: -Math.PI / 2, spread: 1.1 });
      } else if (canWall) {
        // Kick away from the wall.
        this.vy = -JUMP_V * 0.92;
        this.vx = -this._wallDir * WALL_JUMP_VX;
        this._momentum = true;
        GG.bus.emit("player:walljump", { index: this.index });
        this.facing = -this._wallDir;
        this._buffer = 0; this._wallSliding = false;
        this.jumpsLeft = this.character.maxJumps - 1; this.squash = 1.2;
        GG.bus.emit("player:jump", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.cy, count: 8, color: "#cfd8ff", speed: 110, life: 0.3, glow: true });
      } else if (canAir) {
        // Lyra's double jump.
        this.vy = -JUMP_V * this.character.jumpScale * 0.9;
        this._buffer = 0; this.jumpsLeft--; this.squash = 1.2;
        GG.bus.emit("player:jump", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.cy, count: 12, color: [this.character.body, "#fff"], speed: 130, life: 0.35, glow: true, angle: Math.PI / 2, spread: 1.2 });
      }

      // Variable jump height: releasing up cuts the rise short.
      // (not while flung by a partner, a mushroom or rising air)
      if (this.vy >= 0) this._noCut = false;
      if (!inp.up && this.vy < -180 && !this._noCut) this.vy = -180;

      // Gravity (suspended during a dash).
      if (dashing) { this.vy = 0; }
      else if (this.swimming) {
        // water: slow sinking, and JUMP is a swim stroke upward
        this.vy += C.GRAVITY * 0.28 * dt; this.vy = Math.min(this.vy, 130);
        if (inp.jumpPressed) { this.vy = -300; this._buffer = 0; GG.bus.emit("player:swim", { index: this.index }); level.fx.burst({ x: this.cx, y: this.y, count: 5, color: "#bfe8ff", speed: 50, life: 0.4 }); }
      }
      else { this.vy += C.GRAVITY * dt; this.vy = Math.min(this.vy, feel.maxFall || 900); }

      // Drop through one-way platforms by holding down.
      this.dropThrough = !!inp.down && !this.onGround ? true : (!!inp.down && this.groundRef && this.groundRef.oneWay);

      // Integrate with collision against the level's full solid set.
      let solids = level.solidsFor(this);
      // Holding DOWN drops you through one-way ledges (and keeps you falling
      // through them while you hold it).
      if (this.dropThrough) solids = solids.filter(s => !s.oneWay);
      const px = this.x, py = this.y;
      const dx = (this.vx + conveyor) * dt;
      GG.Physics.move(this, dx, this.vy * dt, solids);
      this._dx = this.x - px; this._dy = this.y - py; // delta (used to carry riders)
      // a roll never carries you off a ledge at roll speed (it can't stretch a gap)
      if (this.rollT > 0 && !this.onGround) { this.rollT = 0; this.vx = U.clamp(this.vx, -MAX_SPD, MAX_SPD); }

      // LEDGE GRAB: brushing a ledge's lip with your feet a hair too low
      // (a few pixels) catches it and hauls you up instead of sliding off.
      if (!this.onGround && this.hitWallDir !== 0 && dir === this.hitWallDir && this.vy > -80 && !this.carrying) {
        const tm = level.tilemap, T = C.TILE;
        const col = this.hitWallDir > 0 ? Math.floor((this.x + this.w + 1) / T) : Math.floor((this.x - 1) / T);
        const feet = this.y + this.h;
        const row = Math.floor((feet - 1) / T);
        const top = row * T;
        if (tm.isSolid(col, row) && !tm.isSolid(col, row - 1) && !tm.isSolid(col, row - 2) && feet - top <= 3.5 && feet - top > 0) {
          this.y = top - this.h - 0.01; this.vy = 0;
          this.x += this.hitWallDir * 3;
          this._ledgeT = 0.14; this.squash = 0.8;
          GG.bus.emit("player:ledge", { index: this.index });
          level.fx.burst({ x: this.cx + this.hitWallDir * 8, y: top, count: 5, color: "#cfd8ff", speed: 40, life: 0.25 });
        }
      }
      this._ledgeT = Math.max(0, (this._ledgeT || 0) - dt);

      // Wall-slide detection: airborne, pressing into a wall, descending.
      this._wallDir = this.hitWallDir;
      const pressingWall = (inp.right && this._wallDir > 0) || (inp.left && this._wallDir < 0);
      this._wallSliding = !this.onGround && this.vy > 0 && pressingWall && this.character.canWallJump !== false;
      if (this._wallSliding) {
        // climbGrip < 1 means a better climber descends more slowly (Nibihah).
        this.vy = Math.min(this.vy, WALL_SLIDE_MAX * (this.character.climbGrip ?? 1));
        if (Math.random() < 0.3) level.fx.burst({ x: this.x + (this._wallDir > 0 ? this.w : 0), y: this.cy, count: 1, color: "#cfd8ff", speed: 30, life: 0.3 });
      }

      // Landing detection (squash + dust + sfx). Dust and shake scale with
      // impact speed so hard landings feel HEAVY.
      if (this.onGround && !this._wasGround && this._fallSpeed > 260) {
        const hard = this._fallSpeed > 600;
        this.squash = hard ? 0.58 : 0.66;
        GG.bus.emit("player:land", { index: this.index });
        level.fx.burst({
          x: this.cx, y: this.y + this.h,
          count: Math.min(18, 6 + (this._fallSpeed / 70) | 0),
          color: "#cfd8ff", speed: 70 + this._fallSpeed * 0.1, life: 0.32,
          angle: -Math.PI / 2, spread: 1.5,
        });
        const heavy = this.character.feel && this.character.feel.heavy;
        if (hard) level.cam.shake(heavy ? 0.26 : 0.14);
        else if (this._fallSpeed > 380) level.cam.shake(heavy ? 0.1 : 0.04);
        if (level.cam.kick) level.cam.kick(Math.min(14, this._fallSpeed / (heavy ? 55 : 80)));
        if (heavy && this._fallSpeed > 380) {
          level.fx.burst({ x: this.cx, y: this.y + this.h, count: 8, color: ["#8a7a66", "#b8a888"], speed: 90, life: 0.4, angle: -Math.PI / 2, spread: 2.6, gravity: 300 });
          GG.bus.emit("player:thud", { index: this.index });
        }
      }
      this._wasGround = this.onGround;

      // Footstep dust while running — small, constant ground feedback.
      this._stepT = (this._stepT || 0) - dt;
      if (this.onGround && Math.abs(this.vx) > 150 && this._stepT <= 0) {
        this._stepT = 0.16;
        const tid = level.tilemap.tileAtWorld(this.cx, this.y + this.h + 2);
        GG.bus.emit("player:step", { index: this.index, surface: tid === GG.TILE.ICE ? "ice" : (level.theme || "cave"), heavy: !!(this.character.feel && this.character.feel.heavy) });
        level.fx.burst({
          x: this.cx - this.facing * 6, y: this.y + this.h,
          count: 2, color: "#cfd8ff", speed: 38, life: 0.24,
          angle: -Math.PI / 2, spread: 0.7,
        });
      }
      this._fallSpeed = this.vy;

      // The airborne stack dissolves once the rider lands or drifts aside.
      if (this._stackedOn && (this.onGround || Math.abs(this.cx - this._stackedOn.cx) > this.w + 8)) {
        this._stackedOn = null;
      }

      // Squash/stretch easing back to 1.
      this.squash = U.damp(this.squash, 1, 12, dt);
      // a shared cheer (high-five at a shrine) wears off
      if (this._cheerT > 0) { this._cheerT -= dt; if (this._cheerT <= 0) { this.celebrating = false; } }

      // Advance animation state.
      const prev = this.animName;
      this.animName = this._poseState();
      if (this.animName !== prev) this.animTime = 0; else this.animTime += dt;
      this.blink -= dt;
      if (this.blink < -0.2 && Math.random() < 0.04) this.blink = 0.12;

      // ---- personality: expressions + idle flourishes --------------------
      this._exprHold = Math.max(0, this._exprHold - dt);
      if (this.animName === "idle") {
        this._idleTimer += dt;
        if (this._idleTimer > 3.2) {            // pick a new little flourish
          this._idleTimer = 0;
          this.idleVariant = (this.idleVariant + 1 + ((Math.random() * 3) | 0)) % 5;
        }
      } else { this._idleTimer = 0; this.idleVariant = 0; }
      if (this._exprHold <= 0) {
        // read the world and feel something about it
        const partner = level.players.find(q => q !== this);
        const close = partner && !partner.dead && Math.hypot(partner.cx - this.cx, partner.cy - this.cy) < 70;
        const danger = level.rats && level.rats.some(r => !r.deadRat && Math.hypot(r.cx - this.cx, r.cy - this.cy) < 120);
        if (this.dead) this.expr = "sad";
        else if (this.celebrating) this.expr = "laughing";
        else if (danger) this.expr = "worried";
        else if (this.pushing || this.teleHold) this.expr = "determined";
        else if (this.swing || this.dashTime > 0) this.expr = "excited";
        else if (!this.onGround) this.expr = "surprised";
        else if (close && this.animName === "idle") this.expr = "happy";
        else this.expr = "focused";
      }

      // ---- cloth & hair physics ------------------------------------------
      this._stepCloth(dt);
    }

    /**
     * Visual-only step (runs on host AND remote clients each frame).
     * Capes/scarves were removed by request — only hair wind remains.
     */
    _stepCloth(dt) {
      this.hairWind = U.damp(this.hairWind, -this.vx * 0.05, 6, dt);
    }

    /** Momentary expression override (used by events + cutscenes). */
    feel(expr, seconds) { this.expr = expr; this._exprHold = seconds || 1.2; }

    /**
     * Faces are intentionally left FEATURELESS — no eyes, no brows, no mouth.
     * At this sprite scale the drawn eyes read as unsettling rather than
     * expressive, so mood is carried entirely by pose, cloth motion and the
     * small floating cues below. `this.expr` still drives everything else and
     * is kept live so faces could be reinstated in one place if ever wanted.
     */
    _face(ctx, hx, headY, hh, W, pal, st) {
      const t = this.animTime;
      if (this.expr === "confused") {                            // floating "?"
        ctx.save();
        ctx.translate(W * 0.24 + hx, headY - 3);
        ctx.scale(this.facing, 1);                               // keep it readable when facing left
        ctx.fillStyle = pal.glowc; ctx.globalAlpha = 0.8 + Math.sin(t * 4) * 0.2;
        ctx.font = "bold 7px monospace"; ctx.fillText("?", 0, 0);
        ctx.restore();
      }
      if (this.expr === "exhausted") {                           // sweat bead
        ctx.fillStyle = "#9fd8ff"; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(W * 0.22 + hx, headY + 3 + ((t * 14) % 7), 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ---- Combat: strike and roll --------------------------------------
    _updateCombat(dt, level, inp, dir) {
      this.invuln = Math.max(0, (this.invuln || 0) - dt);
      this.spawnFx = Math.max(0, (this.spawnFx || 0) - dt);
      this.hurtT = Math.max(0, (this.hurtT || 0) - dt);
      this.meleeT = Math.max(0, (this.meleeT || 0) - dt);
      this.meleeCd = Math.max(0, (this.meleeCd || 0) - dt);
      this.rollT = Math.max(0, (this.rollT || 0) - dt);
      this.rollCd = Math.max(0, (this.rollCd || 0) - dt);
      const busy = this.carrying || this.teleHold || this.swing || this.celebrating;
      // STRIKE: a short swing in front of you (Level resolves what it hits)
      if (inp.meleePressed && this.meleeCd <= 0 && !busy) {
        this.meleeT = MELEE_TIME; this.meleeCd = MELEE_CD; this._meleeFresh = true;
        this.squash = 1.08;
        GG.bus.emit("player:melee", { index: this.index });
      }
      // ROLL: a quick dodge along the ground; creatures can't touch you mid-roll
      if (inp.dodgePressed && this.rollCd <= 0 && this.onGround && !busy && !this.crawling &&
          (!level.spendEnergy || level.energy >= 12)) {
        if (level.spendEnergy) level.spendEnergy(12);
        this.rollT = ROLL_TIME; this.rollCd = 0.55; this.rollDir = dir || this.facing; this.facing = this.rollDir;
        this.squash = 0.78;
        GG.bus.emit("player:roll", { index: this.index });
        level.fx.burst({ x: this.cx, y: this.y + this.h, count: 8, color: "#cfd8ff", speed: 80, life: 0.3, angle: -Math.PI / 2, spread: 1.4 });
      }
    }

    /** The box a strike covers this frame (world space). */
    meleeBox() {
      return { x: this.facing > 0 ? this.x + this.w - 4 : this.x - 34, y: this.y - 6, w: 38, h: this.h + 10 };
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
        if (this.dashTime > 0) {
          this.dashTime -= dt;
          // afterimage trail while the dash is live
          level.fx.burst({ x: this.cx, y: this.cy, count: 2, color: [ch.body, "#fff"], speed: 12, life: 0.22, glow: true });
        }
        if (inp.specialPressed && this.dashesLeft > 0 && this.dashTime <= 0) {
          this.dashesLeft--; this.dashTime = DASH_TIME;
          this.dashDir = dir !== 0 ? dir : this.facing;
          this.facing = this.dashDir;
          GG.bus.emit("player:dash", { index: this.index });
          level.fx.burst({ x: this.cx, y: this.cy, count: 14, color: [ch.body, "#fff"], speed: 180, life: 0.32, glow: true, angle: this.dashDir > 0 ? Math.PI : 0, spread: 0.7 });
        }
      }

      // --- Co-op TOSS: the engineer heaves a partner off his head ---------
      const actEdge = inp.action && !this._prevAct;
      this._prevAct = !!inp.action;
      if (ch.feel && ch.feel.heavy && actEdge && this.onGround && !this.carrying) {
        const rider = level.players.find(q => q !== this && !q.dead && q.groundRef === this);
        if (rider) {
          rider.vy = -560; rider.vx = this.facing * 230; rider._momentum = true; rider._noCut = true;
          rider.onGround = false; rider.groundRef = null; rider.jumpsLeft = Math.max(rider.jumpsLeft, rider.character.maxJumps - 1);
          rider.squash = 1.3; this.squash = 0.75; this._carryCool = 0.35;
          GG.bus.emit("player:toss", { index: this.index });
          level.fx.burst({ x: rider.cx, y: rider.y + rider.h, count: 12, color: [ch.body, "#fff"], speed: 120, life: 0.35, glow: true, angle: -Math.PI / 2, spread: 1 });
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
          // pick up an adjacent crate (telekinetic cubes answer to the mind, not the hands)
          for (const c of level.crates) {
            if (c.carried || c.thrown || c.tele) continue;
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
      if (this._wallSliding || this._ledgeT > 0) return "climb";
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
      // flicker while invulnerable after a hit
      if (!p.dead && p.hurtT <= 0 && p.invuln > 0 && p.spawnFx <= 0 && Math.sin(p.invuln * 40) > 0.3) ctx.globalAlpha = 0.45;
      // RESPAWN: a column of light, and the hero gathers back out of it
      if (p.spawnFx > 0) {
        const k = p.spawnFx / 0.6;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(0, p.y - 120, 0, p.y + p.h);
        g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, ch.light);
        ctx.globalAlpha = k * 0.7; ctx.fillStyle = g; ctx.fillRect(p.cx - 10 * k - 4, p.y - 120, (10 * k + 4) * 2, 120 + p.h);
        for (let i = 0; i < 6; i++) { const a = i * 1.05 + k * 6; ctx.fillStyle = "#fff"; ctx.fillRect(p.cx + Math.cos(a) * 26 * k, p.cy + Math.sin(a) * 26 * k, 2, 2); }
        ctx.restore();
        ctx.globalAlpha = 1 - k * 0.8;
      }
      if (p.hurtT > 0) ctx.globalAlpha = 0.6 + Math.sin(p.hurtT * 60) * 0.4;

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
      if (p.rollT > 0) {                                   // tuck and roll
        const a = (1 - p.rollT / 0.24) * Math.PI * 2;
        ctx.translate(0, -p.h * 0.45); ctx.rotate(a); ctx.scale(0.8, 0.8); ctx.translate(0, p.h * 0.45);
      }

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

      const isN = ch.id === "nichols";
      // Visual proportions only — the physics hitbox stays p.w × p.h.
      // Nibihah is shorter (24px) with the same 22px hitbox, which drew her
      // nearly square; a slimmer visual width restores an athletic build.
      const H = p.h, W = p.w * (isN ? 1 : 0.78);
      const legY = 0, hipY = -H * 0.42, chestY = -H * 0.64, headY = -H * 0.84;
      const legW = isN ? 5 : 3.8, legX = isN ? 3.5 : 2.8;   // leg thickness / stance

      // ---- idle flourishes give each hero a little personality ----------
      let wrenchSpin = 0, gloveTug = 0, compass = 0, lookAbout = 0, twirl = 0, hairTuck = 0, dust = 0;
      if (st === "idle") {
        const v = this.idleVariant, ph = Math.min(1, this._idleTimer / 1.6);
        const swell = Math.sin(ph * Math.PI);                 // ease in and out
        if (isN) {
          if (v === 0) gloveTug = swell; else if (v === 1) wrenchSpin = swell;
          else if (v === 2) compass = swell; else if (v === 3) lookAbout = swell;
        } else {
          // twirls a crystal / tucks a strand of hair back / brushes off dust
          if (v === 0) twirl = swell; else if (v === 1) hairTuck = swell;
          else if (v === 2) dust = swell; else if (v === 3) lookAbout = swell;
        }
      }

      // === BODY — the player's Figma sprite, drawn 1:1 =================
      // Art comes from GG.SPRITES (imported from the Figma file) and is
      // scaled so the sprite's full height fits the physics hitbox. The
      // rect groups tagged in the data get procedural motion: legs swing
      // with the run cycle, arms lift for flourishes, the braid sways,
      // hair spikes lean in the wind, and eyes squash shut on blinks.
      const spr = GG.SPRITES && GG.SPRITES[ch.id];
      const legOff = legPhase * (st === "run" ? 5 : st === "walk" ? 3.5 : 1.5);
      const swing = armSwing + armFwd;
      const wind = U.clamp(this.hairWind * 0.4 + Math.sin(t * 2.2) * 0.6, -2, 2);
      const armLift = armUp + reach + twirl * 6 + hairTuck * 7 + gloveTug * 2;
      const hx = (st === "run" || st === "push" ? lean * 0.4 : 0) + lookAbout * Math.sin(t * 2) * 2;
      const hh = H * 0.22;

      // Drawn 20% larger than the hitbox so the heroes clearly tower over
      // their pets; physics/collision still use the untouched p.w × p.h box.
      const VS = 1.2;
      if (spr) {
        GG.drawSprite(ctx, spr, 0, 0, H * VS, 1, {
          legOff: legOff * 0.6,
          armLift, swing,
          braidSway: Math.sin(t * 3) * 1.2 - wind * 0.5,
          hairLean: wind,
          blink: this.blink,
          t,
        });

        // idle flourish props appear at the sprite's arm anchor
        if (spr.armAnchor && (wrenchSpin > 0 || compass > 0 || twirl > 0 || dust > 0)) {
          const S2 = (H * VS) / spr.h;
          const ax = (spr.armAnchor.x - spr.w / 2) * S2;
          const ay = (spr.armAnchor.y - spr.h) * S2 - armLift;
          if (wrenchSpin > 0) {                              // spins a wrench
            ctx.save(); ctx.translate(ax, ay + 5); ctx.rotate(t * 9);
            ctx.fillStyle = pal.silver || "#cfd8e6";
            ctx.fillRect(-1, -5, 2, 10); ctx.fillRect(-2.5, -6, 5, 2.5);
            ctx.restore();
          }
          if (compass > 0) {                                 // studies the compass
            ctx.fillStyle = pal.gold || "#e8c65c";
            ctx.beginPath(); ctx.arc(ax + 1, ay + 6, 4, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = pal.crystal || "#7ef7c0"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(ax + 1, ay + 6);
            ctx.lineTo(ax + 1 + Math.cos(t * 2) * 3, ay + 6 + Math.sin(t * 2) * 3); ctx.stroke();
          }
          if (twirl > 0) {                                   // twirls a crystal
            ctx.save(); ctx.translate(ax + 1, ay - 5); ctx.rotate(t * 7);
            ctx.fillStyle = pal.crystal || "#a9d4ff"; ctx.shadowBlur = 10; ctx.shadowColor = pal.glowc;
            ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3, 0); ctx.lineTo(0, 4); ctx.lineTo(-3, 0); ctx.fill();
            ctx.shadowBlur = 0; ctx.restore();
          }
          if (dust > 0) {                                    // brushes off dust
            ctx.globalAlpha = dust * 0.6; ctx.fillStyle = "#cdb488";
            for (let i = 0; i < 4; i++) ctx.fillRect(ax - 6 + i * 3, ay + 8 + Math.sin(t * 8 + i) * 2, 1.5, 1.5);
            ctx.globalAlpha = 1;
          }
        }
      }

      // === OUTFIT: a hat or trinket bought from the merchant ==========
      if (p.outfit && GG.OUTFITS && GG.OUTFITS[p.outfit]) GG.OUTFITS[p.outfit].draw(ctx, H * VS, t, pal);

      // === FACE EXTRAS (floating "?" / sweat bead) ====================
      this._face(ctx, hx, headY, hh, W, pal, st);

      // celebrate sparkles
      if (st === "celebrate") {
        ctx.fillStyle = pal.glowc; ctx.shadowBlur = 6; ctx.shadowColor = pal.glowc;
        for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; ctx.fillRect(Math.cos(a) * 12, headY - 8 + Math.sin(a) * 6, 2, 2); }
        ctx.shadowBlur = 0;
      }

      ctx.restore();

      // --- the strike: a bright crescent in front of the hero -----------
      if (this.meleeT > 0) {
        const k = 1 - this.meleeT / 0.16;
        ctx.save();
        ctx.translate(this.cx, this.cy - 2); ctx.scale(this.facing, 1);
        ctx.strokeStyle = ch.light; ctx.lineWidth = 4 * (1 - k) + 1; ctx.lineCap = "round";
        ctx.shadowBlur = 12; ctx.shadowColor = ch.body; ctx.globalAlpha = 1 - k * 0.6;
        ctx.beginPath(); ctx.arc(6, 0, 24, -1.2 + k * 0.6, 1.0 + k * 0.6); ctx.stroke();
        ctx.restore();
      }
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
      return { x: Math.round(this.x * 10) / 10, y: Math.round(this.y * 10) / 10, vx: this.vx, vy: this.vy, f: this.facing, d: this.dead ? 1 : 0,
               hp: this.hp, mh: this.maxHp, iv: Math.round((this.invuln || 0) * 100), m: Math.round((this.meleeT || 0) * 100), r: Math.round((this.rollT || 0) * 100), o: this.outfit || 0 };
    }
    setState(s) {
      if (!s) return;
      this.x = s.x; this.y = s.y; this.vx = s.vx; this.vy = s.vy;
      this.facing = s.f; this.dead = !!s.d;
      if (s.hp != null) { this.hp = s.hp; this.maxHp = s.mh; this.invuln = s.iv / 100; this.meleeT = s.m / 100; this.rollT = s.r / 100; this.outfit = s.o || null; }
    }
  }

  Player.CHARACTERS = CHARACTERS;
  GG.Player = Player;
})(window);
