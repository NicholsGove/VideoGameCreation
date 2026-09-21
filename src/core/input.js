/* =========================================================================
 * input.js — keyboard input manager with per-player bindings + rebinding
 * -------------------------------------------------------------------------
 * Exposes an abstract action model ("left/right/jump/action") per player so
 * gameplay never reads raw key codes. Bindings are data-driven and can be
 * rebound at runtime (Settings > Controls) and persisted via Storage.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  // Default bindings. Player 0 = WASD, Player 1 = Arrow keys.
  const DEFAULT_BINDINGS = {
    // `special` = grapple/telekinesis (Nichols) or swing/dash (Nibihah).
    // `attack`  = Nichols' bolt gun / Nibihah's bow.
    // `melee`   = close-range strike, `dodge` = a quick ground roll.
    p0: { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", action: "KeyS", special: "KeyQ", attack: "KeyE", melee: "KeyX", dodge: "ShiftLeft" },
    p1: { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", action: "ArrowDown", special: "ShiftRight", attack: "Period", melee: "Comma", dodge: "ControlRight" },
  };
  // Global (non-player) keys.
  const GLOBAL_KEYS = { pause: "Escape", restart: "KeyR", confirm: "Enter" };

  class Input {
    constructor() {
      this._down = new Set();       // currently held physical codes
      this._pressed = new Set();    // codes that went down this frame
      this._released = new Set();
      this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      this.globalKeys = Object.assign({}, GLOBAL_KEYS);
      this._rebindCb = null;        // active rebind capture callback
      this._attached = false;
      // Gamepad state (auto-detected). pads[0] -> player 0, pads[1] -> player 1.
      this.pads = [null, null];
      this._padPrev = [{}, {}];
      this._navCd = 0;
      this.lastDevice = "keyboard";
      this._padStartPrev = false;
      this.padStartPressed = false;
      this._gp = [null, null];
    }

    /** Controller rumble (if the pad supports it and it's switched on). */
    rumble(i, strong, weak, ms) {
      const set = GG.save && GG.save.settings && GG.save.settings.gameplay;
      if (set && set.rumble === false) return;
      const gp = this._gp && this._gp[i];
      try {
        if (gp && gp.vibrationActuator) gp.vibrationActuator.playEffect("dual-rumble", { duration: ms || 120, strongMagnitude: strong || 0.5, weakMagnitude: weak || 0.3 });
      } catch (_) {}
    }

    attach() {
      if (this._attached) return;
      this._attached = true;
      this._onDown = (e) => this._handleDown(e);
      this._onUp = (e) => this._handleUp(e);
      this._onBlur = () => this._down.clear(); // release everything on focus loss
      window.addEventListener("keydown", this._onDown, { passive: false });
      window.addEventListener("keyup", this._onUp);
      window.addEventListener("blur", this._onBlur);
    }

    _handleDown(e) {
      // Rebind capture mode: swallow the next key and report it.
      if (this._rebindCb) {
        e.preventDefault();
        const cb = this._rebindCb; this._rebindCb = null;
        cb(e.code);
        return;
      }
      // Prevent the browser scrolling on arrows/space during play.
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Tab"].includes(e.code)) e.preventDefault();
      if (!this._down.has(e.code)) this._pressed.add(e.code);
      this._down.add(e.code);
    }

    _handleUp(e) {
      this._down.delete(e.code);
      this._released.add(e.code);
    }

    /** Begin capturing the next key for a rebind. cb(code) called once. */
    beginRebind(cb) { this._rebindCb = cb; }
    cancelRebind() { this._rebindCb = null; }

    // ---- Raw queries -----------------------------------------------------
    isDown(code) { return this._down.has(code); }
    wasPressed(code) { return this._pressed.has(code); }
    wasReleased(code) { return this._released.has(code); }

    // ---- Player action queries ------------------------------------------
    /** @param {number} p player index (0 or 1) @param {string} action */
    action(p, action) {
      const b = this.bindings["p" + p];
      return b ? this._down.has(b[action]) : false;
    }
    actionPressed(p, action) {
      const b = this.bindings["p" + p];
      return b ? this._pressed.has(b[action]) : false;
    }

    /** Returns a compact snapshot of one player's inputs — used by networking. */
    snapshot(p) {
      const pad = this.pads[p] || {};
      return {
        left: this.action(p, "left") || !!pad.left,
        right: this.action(p, "right") || !!pad.right,
        up: this.action(p, "up") || !!pad.up,
        down: this.action(p, "down") || !!pad.down,
        jumpPressed: this.actionPressed(p, "up") || !!pad.jumpPressed,
        action: this.action(p, "action") || !!pad.action,
        special: this.action(p, "special") || !!pad.special,
        specialPressed: this.actionPressed(p, "special") || !!pad.specialPressed,
        attackPressed: this.actionPressed(p, "attack") || !!pad.attackPressed,
        meleePressed: this.actionPressed(p, "melee") || !!pad.meleePressed,
        dodgePressed: this.actionPressed(p, "dodge") || !!pad.dodgePressed,
      };
    }

    /**
     * Online play: each machine controls exactly ONE hero, and only with that
     * hero's own keys — Player 1 (host) uses WASD + Q/E/F, Player 2 (client)
     * uses the arrows + Right-Shift/./slash. The other set is ignored, so
     * nobody can steer with the partner's controls. The local machine's FIRST
     * gamepad (if any) also drives this hero.
     */
    snapshotOnline(p) {
      const b = this.bindings["p" + p] || {};
      const pad = this.pads[0] || {};
      const down = (a) => this._down.has(b[a]);
      const pressed = (a) => this._pressed.has(b[a]);
      const pingKey = p === 0 ? "KeyF" : "Slash";
      return {
        left: down("left") || !!pad.left,
        right: down("right") || !!pad.right,
        up: down("up") || !!pad.up || !!pad.jump,
        down: down("down") || !!pad.down,
        jumpPressed: pressed("up") || !!pad.jumpPressed,
        action: down("action") || !!pad.action,
        special: down("special") || !!pad.special,
        specialPressed: pressed("special") || !!pad.specialPressed,
        attackPressed: pressed("attack") || !!pad.attackPressed,
        meleePressed: pressed("melee") || !!pad.meleePressed,
        dodgePressed: pressed("dodge") || !!pad.dodgePressed,
        pingPressed: this._pressed.has(pingKey),
      };
    }

    /**
     * Poll connected gamepads (call once per frame). Auto-detects controllers,
     * maps standard layout, produces jump edges, and emits menu-nav events.
     * dt is used only for the menu-nav repeat cooldown.
     */
    pollGamepads(dt) {
      this._navCd = Math.max(0, this._navCd - (dt || 0));
      this.padStartPressed = false;
      const gps = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (let i = 0; i < 2; i++) {
        const gp = gps[i];
        if (!gp) { this.pads[i] = null; continue; }
        const b = gp.buttons.map(x => x.pressed);
        const ax = gp.axes;
        const jump = !!(b[0]);                        // A / cross
        const special = !!(b[3] || b[5]);             // Y / RB -> dash / grapple / tele / swing
        const attack = !!(b[1] || b[7]);              // B / RT -> weapon fire
        const melee = !!b[4], dodge = !!(b[6] || b[10]);   // LB = strike, LT / L3 = roll
        const prevJump = this._padPrev[i].jump, prevSpecial = this._padPrev[i].special, prevAttack = this._padPrev[i].attack;
        const st = {
          left: b[14] || ax[0] < -0.4,
          right: b[15] || ax[0] > 0.4,
          up: b[12] || ax[1] < -0.4,
          down: b[13] || ax[1] > 0.4,
          jump, jumpPressed: jump && !prevJump,
          action: !!b[2],                             // X
          special, specialPressed: special && !prevSpecial,
          attackPressed: attack && !prevAttack,
          meleePressed: melee && !this._padPrev[i].melee,
          dodgePressed: dodge && !this._padPrev[i].dodge,
          start: !!b[9],
        };
        this.pads[i] = st;
        this._padPrev[i] = { jump, special, attack, melee, dodge };
        this._gp[i] = gp;
        if (b.some(x => x) || Math.abs(ax[0]) > 0.3 || Math.abs(ax[1]) > 0.3) this.lastDevice = "gamepad";
        // Player-1 pad drives menu navigation + Start = pause.
        if (i === 0) {
          if (st.start && !this._padStartPrev) this.padStartPressed = true;
          this._padStartPrev = st.start;
          if (this._navCd === 0) {
            if (st.down) { GG.bus.emit("pad:menu", "down"); this._navCd = 0.18; }
            else if (st.up) { GG.bus.emit("pad:menu", "up"); this._navCd = 0.18; }
            else if (st.jumpPressed || (b[9])) { GG.bus.emit("pad:menu", "confirm"); this._navCd = 0.25; }
          }
        }
      }
    }

    globalPressed(name) { return this._pressed.has(this.globalKeys[name]); }

    /** Must be called at the END of each frame to reset edge state. */
    endFrame() {
      this._pressed.clear();
      this._released.clear();
    }

    setBindings(b) { if (b) this.bindings = GG.util.deepDefaults(b, DEFAULT_BINDINGS); }
    resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); }
  }

  GG.Input = Input;
  GG.input = new Input();
  GG.DEFAULT_BINDINGS = DEFAULT_BINDINGS;
})(window);
