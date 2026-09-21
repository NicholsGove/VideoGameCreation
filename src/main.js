/* =========================================================================
 * main.js — bootstrap
 * -------------------------------------------------------------------------
 * Waits for the DOM, wires audio unlock (browsers require a user gesture),
 * then initialises the UI and game controller. Any load error is surfaced to
 * the player instead of failing silently.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  function boot() {
    try {
      GG.ui.init();
      GG.game.init();

      // Unlock/resume the AudioContext on the first user interaction.
      // (on the title screen the title's own score takes over instead)
      const unlock = () => { GG.audio.resume(); if (GG.game.state !== "menu") GG.audio.startMusic(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
      window.addEventListener("pointerdown", unlock);
      window.addEventListener("keydown", unlock);

      // Title-screen interactions: skip intro, Konami code, attract exit.
      // During a cutscene, keys advance/skip the scene instead.
      window.addEventListener("keydown", (e) => {
        if (GG.game.state === "cutscene") { GG.cutscene.onKey(e.code); return; }
        if (GG.game.state === "menu" && GG.title) GG.title.onKey(e.code);
      });
      const canvas = document.getElementById("game");
      canvas.addEventListener("pointerdown", (e) => {
        if (GG.game.state === "cutscene") { GG.cutscene.next(); return; }
        if (GG.game.state !== "menu" || !GG.title) return;
        const r = canvas.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * GG.C.VIEW_W;
        const y = (e.clientY - r.top) / r.height * GG.C.VIEW_H;
        GG.title.onClick(x, y);
      });

      // Persist save when the tab is hidden/closed.
      window.addEventListener("visibilitychange", () => { if (document.hidden) GG.save.save(); });
      window.addEventListener("beforeunload", () => GG.save.save());

      console.log("[Circuit & Bloom] ready — %d levels loaded", GG.LEVEL_COUNT);
    } catch (err) {
      console.error("Boot failed:", err);
      const b = document.getElementById("boot");
      if (b) { b.textContent = "Failed to start: " + err.message; b.style.color = "#ff5a6a"; }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
