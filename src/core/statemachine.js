/* =========================================================================
 * statemachine.js — generic finite state machine
 * -------------------------------------------------------------------------
 * Used for the top-level game flow (menu / playing / paused / win) and for
 * per-entity behaviour (player: idle/run/jump/fall/dead; enemies; etc.).
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  class StateMachine {
    /**
     * @param {Object} states  map of name -> { enter?, update?, exit?, ... }
     * @param {string} initial name of the starting state
     * @param {*} ctx           context passed to every callback (e.g. the owner)
     */
    constructor(states, initial, ctx) {
      this.states = states;
      this.ctx = ctx;
      this.current = null;
      this.name = null;
      this.time = 0; // seconds spent in the current state
      if (initial) this.change(initial);
    }

    change(name, data) {
      if (name === this.name) return;              // ignore no-op transitions
      const next = this.states[name];
      if (!next) { console.warn(`[FSM] unknown state "${name}"`); return; }
      if (this.current && this.current.exit) this.current.exit(this.ctx, name);
      const prev = this.name;
      this.current = next;
      this.name = name;
      this.time = 0;
      if (next.enter) next.enter(this.ctx, prev, data);
    }

    update(dt, ...args) {
      this.time += dt;
      if (this.current && this.current.update) this.current.update(this.ctx, dt, ...args);
    }

    is(name) { return this.name === name; }
  }

  GG.StateMachine = StateMachine;
})(window);
