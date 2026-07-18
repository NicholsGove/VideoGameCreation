/* =========================================================================
 * events.js — lightweight publish/subscribe event bus
 * -------------------------------------------------------------------------
 * Decouples systems: gameplay emits events ("button:pressed", "player:death"…)
 * and audio / achievements / UI / networking react without direct references.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  class EventBus {
    constructor() { this._handlers = new Map(); }

    /** Subscribe. Returns an unsubscribe function. */
    on(type, fn) {
      if (!this._handlers.has(type)) this._handlers.set(type, new Set());
      this._handlers.get(type).add(fn);
      return () => this.off(type, fn);
    }

    /** Subscribe once. */
    once(type, fn) {
      const off = this.on(type, (payload) => { off(); fn(payload); });
      return off;
    }

    off(type, fn) {
      const set = this._handlers.get(type);
      if (set) set.delete(fn);
    }

    /** Emit an event to all subscribers. Errors in one handler don't break others. */
    emit(type, payload) {
      const set = this._handlers.get(type);
      if (!set) return;
      for (const fn of Array.from(set)) {
        try { fn(payload); }
        catch (err) { console.error(`[EventBus] handler for "${type}" failed:`, err); }
      }
    }

    clear() { this._handlers.clear(); }
  }

  GG.EventBus = EventBus;
  // A single global bus instance used by most systems.
  GG.bus = new EventBus();
})(window);
