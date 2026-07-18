/* =========================================================================
 * storage.js — save system (localStorage) with a single versioned profile
 * -------------------------------------------------------------------------
 * Persists: completed levels, best times, collected gems, unlocked cosmetics,
 * achievements, and settings. Fails gracefully if storage is unavailable
 * (e.g. private mode) by falling back to an in-memory object.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  const KEY = "circuit_and_bloom_save_v1";

  const DEFAULT_SAVE = {
    version: 1,
    progress: {
      // levelId -> { completed:true, bestMs:number, gems:number, noDeath:bool, rooms:number }
    },
    unlockedLevel: 1,        // highest level index the player may select
    cosmetics: { p0: "default", p1: "default" },
    unlockedSkins: ["default"],
    achievements: {},        // id -> unlockedTimestamp
    totalDeaths: 0,
    totalGems: 0,
    settings: {
      audio: { master: 0.9, music: 0.6, sfx: 0.9, voice: 0.8 },
      graphics: {
        displayMode: "borderless", // "borderless" | "fullscreen" | "windowed"
        fullscreen: false, vsync: true, lighting: true, shake: true,
        particles: true, bloom: true, weather: true, splitscreen: true,
      },
      gameplay: { language: "en", colorblind: false, holdToRestart: false },
      bindings: null,        // null => use defaults
    },
  };

  class Storage {
    constructor() {
      this._mem = null;      // in-memory fallback
      this.data = this._load();
    }

    _available() {
      try {
        const t = "__t"; localStorage.setItem(t, "1"); localStorage.removeItem(t);
        return true;
      } catch (_) { return false; }
    }

    _load() {
      try {
        if (this._available()) {
          const raw = localStorage.getItem(KEY);
          if (raw) return GG.util.deepDefaults(JSON.parse(raw), DEFAULT_SAVE);
        }
      } catch (err) { console.warn("[Storage] load failed, using defaults", err); }
      return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    }

    save() {
      try {
        if (this._available()) localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (err) { console.warn("[Storage] save failed", err); }
      GG.bus.emit("save:written", this.data);
    }

    // ---- Progress helpers -----------------------------------------------
    getLevel(id) { return this.data.progress[id] || null; }

    /** Record a completed level, keeping the best time and best gem count. */
    recordCompletion(id, result) {
      const p = this.data.progress[id] || { completed: false, bestMs: Infinity, gems: 0, noDeath: false, rooms: 0 };
      p.completed = true;
      if (result.timeMs < (p.bestMs ?? Infinity)) p.bestMs = result.timeMs;
      p.gems = Math.max(p.gems || 0, result.gems || 0);
      p.rooms = Math.max(p.rooms || 0, result.rooms || 0);
      p.noDeath = p.noDeath || !!result.noDeath;
      this.data.progress[id] = p;
      this.data.unlockedLevel = Math.max(this.data.unlockedLevel, id + 1);
      this.save();
      return p;
    }

    addGems(n) { this.data.totalGems += n; }
    addDeath() { this.data.totalDeaths += 1; }

    unlockSkin(id) {
      if (!this.data.unlockedSkins.includes(id)) {
        this.data.unlockedSkins.push(id);
        this.save();
        GG.bus.emit("cosmetic:unlocked", id);
      }
    }

    // ---- Settings --------------------------------------------------------
    get settings() { return this.data.settings; }
    saveSettings() { this.save(); }

    resetAll() {
      this.data = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      this.save();
    }
  }

  GG.Storage = Storage;
  GG.save = new Storage();
  GG.DEFAULT_SAVE = DEFAULT_SAVE;
})(window);
