/* =========================================================================
 * achievements.js — achievement definitions + unlock tracking
 * -------------------------------------------------------------------------
 * Data-driven: each achievement has a `check(save, ctx)` predicate. They are
 * evaluated on relevant events and persisted via Storage. Unlocking emits
 * "achievement:unlocked" which the UI (toast) and Audio react to.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  const DEFS = [
    { id: "first_clear",  name: "Sparks Fly",       desc: "Complete Level 1.",
      check: (s) => s.progress[1] && s.progress[1].completed },
    { id: "flawless",     name: "Untouchable",      desc: "Finish a level without dying.",
      check: (s, c) => c && c.noDeath },
    { id: "speedrun",     name: "Overclocked",      desc: "Finish a level in under 60 seconds.",
      check: (s, c) => c && c.timeMs < 60000 },
    { id: "gem_hoarder",  name: "Gem Hoarder",      desc: "Collect every gem in a level.",
      check: (s, c) => c && c.totalGems > 0 && c.gems >= c.totalGems },
    { id: "team_players", name: "Better Together",  desc: "Complete 3 levels.",
      check: (s) => Object.values(s.progress).filter(p => p.completed).length >= 3 },
    { id: "finisher",     name: "Full Circuit",     desc: "Complete every level.",
      check: (s) => Object.values(s.progress).filter(p => p.completed).length >= GG.LEVEL_COUNT },
    { id: "all_gems",     name: "Collector",        desc: "Collect 100 gems total.",
      check: (s) => s.totalGems >= 100 },
    // ---- the open-world journey
    { id: "w_power",      name: "Awakened",         desc: "Claim your first power at a shrine.",
      check: (s, c) => c && c.world && c.world.powers >= 1 },
    { id: "w_half",       name: "Halfway There",    desc: "Discover 50% of the world.",
      check: (s, c) => c && c.world && c.world.pct >= 50 },
    { id: "w_powers",     name: "Every Gift",       desc: "Claim all eight powers.",
      check: (s, c) => c && c.world && c.world.powers >= 8 },
    { id: "w_map",        name: "Cartographers",    desc: "Discover 100% of the world.",
      check: (s, c) => c && c.world && c.world.pct >= 100 },
  ];

  class Achievements {
    constructor(save) { this.save = save; this.defs = DEFS; }

    /** Evaluate all achievements against current save + an optional context. */
    evaluate(ctx) {
      const data = this.save.data;
      for (const def of this.defs) {
        if (data.achievements[def.id]) continue;
        let ok = false;
        try { ok = def.check(data, ctx); } catch (_) { ok = false; }
        if (ok) {
          data.achievements[def.id] = Date.now();
          this.save.save();
          GG.bus.emit("achievement:unlocked", def);
        }
      }
    }

    unlockedCount() { return Object.keys(this.save.data.achievements).length; }
    isUnlocked(id) { return !!this.save.data.achievements[id]; }
  }

  GG.Achievements = Achievements;
  GG.DEFS_ACHIEVEMENTS = DEFS;
})(window);
