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
    p0: { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", action: "KeyS", special: "KeyQ", attack: "KeyE" },
    p1: { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", action: "ArrowDown", special: "ShiftRight", attack: "Period" },
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
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
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
          start: !!b[9],
        };
        this.pads[i] = st;
        this._padPrev[i] = { jump, special, attack };
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
