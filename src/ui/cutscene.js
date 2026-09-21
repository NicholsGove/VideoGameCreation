/* =========================================================================
 * cutscene.js — scripted pixel-art cutscene player
 * -------------------------------------------------------------------------
 * Story beats are data: each has a painter (a procedural pixel-art scene), a
 * speaker and a line of dialogue. The player types the line out, waits, then
 * cross-fades to the next beat. Any key advances; Escape skips the whole scene.
 *
 * Rendered in the 960x540 design space (the game loop scales it to 1080p).
 * Adding a chapter cinematic = adding an entry to SCENES.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util, C = GG.C;
  const W = C.VIEW_W, H = C.VIEW_H;

  /* ---- Painters: each draws one scene at time t ------------------------- */
  const P = {
    sky(ctx, t, a, b) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, a); g.addColorStop(1, b);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
    stars(ctx, t, n = 90) {
      ctx.fillStyle = "#fff";
      for (let i = 0; i < n; i++) {
        const x = (i * 137) % W, y = (i * 71) % (H * 0.7);
        ctx.globalAlpha = 0.25 + 0.55 * Math.abs(Math.sin(t * 1.5 + i));
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    },
    hills(ctx, color, base, amp, seed) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, base - Math.abs(Math.sin((x + seed) * 0.006)) * amp);
      ctx.lineTo(W, H); ctx.fill();
    },
    // the Heart Engine, whole and glowing
    heartWhole(ctx, t) {
      P.sky(ctx, t, "#101a3a", "#2a3f6a"); P.stars(ctx, t);
      P.hills(ctx, "#0d1430", H * 0.82, 60, 0);
      const cx = W / 2, cy = H * 0.42, r = 62 + Math.sin(t * 2) * 3;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
      g.addColorStop(0, "rgba(160,230,255,0.8)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "#8fe6ff"; ctx.lineWidth = 4; ctx.shadowBlur = 24; ctx.shadowColor = "#8fe6ff";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, r - i * 16, t * (0.4 + i * 0.2), t * (0.4 + i * 0.2) + Math.PI * 1.5); ctx.stroke();
      }
      ctx.fillStyle = "#dff4ff"; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    },
    // the shattering
    shatter(ctx, t) {
      P.sky(ctx, t, "#2a1030", "#7a2030"); P.stars(ctx, t, 40);
      const cx = W / 2, cy = H * 0.42;
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const a = i * 0.45 + t * 0.3, d = 30 + t * 90 + i * 9;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
        ctx.fillStyle = i % 2 ? "#8fe6ff" : "#ffd27f";
        ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      }
      ctx.restore(); ctx.shadowBlur = 0;
      P.hills(ctx, "#150a1c", H * 0.84, 70, 40);
      // cracks
      ctx.strokeStyle = "rgba(255,120,120,0.5)"; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(i * 1.1) * 400, cy + Math.sin(i * 1.1) * 300); ctx.stroke(); }
    },
    // a ruined world
    ruinedWorld(ctx, t) {
      P.sky(ctx, t, "#241a2e", "#6a4a3a");
      P.hills(ctx, "#1a1422", H * 0.75, 80, 10);
      ctx.fillStyle = "#0f0b16";
      for (let i = 0; i < 6; i++) { const x = 80 + i * 150, h = 60 + (i % 3) * 50; ctx.fillRect(x, H * 0.78 - h, 34, h); }
      P.hills(ctx, "#0a0710", H * 0.9, 40, 90);
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#c8b48a";
      for (let i = 0; i < 40; i++) { const x = (i * 97 + t * 20) % W; ctx.fillRect(x, (i * 53) % H, 2, 2); }
      ctx.globalAlpha = 1;
    },
    // a cavern with one hero finding a compass half
    cavern(ctx, t, who) {
      P.sky(ctx, t, "#0b1020", "#1c2440");
      // cave walls
      ctx.fillStyle = "#141a2c";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0);
      for (let x = W; x >= 0; x -= 24) ctx.lineTo(x, 120 + Math.sin(x * 0.02) * 40);
      ctx.fill();
      P.hills(ctx, "#0d1220", H * 0.88, 40, 20);
      // crystals
      for (let i = 0; i < 8; i++) {
        const x = 60 + i * 110, y = H * 0.86 - 10;
        ctx.fillStyle = i % 2 ? "#4fc3ff" : "#6ef0a0"; ctx.shadowBlur = 14; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y - 26 - (i % 3) * 8); ctx.lineTo(x + 14, y); ctx.fill();
      }
      ctx.shadowBlur = 0;
      // the compass half glowing in front of the hero
      const hx = W / 2, hy = H * 0.86;
      const col = who === 0 ? "#6ef0a0" : "#4fc3ff";   // Nichols green, Nibihah blue
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(hx + 60, hy - 40, 0, hx + 60, hy - 40, 70);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.2; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx + 60, hy - 40, 70, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      P.half(ctx, hx + 60, hy - 40 + Math.sin(t * 2) * 4, col, who === 0 ? -1 : 1);
      GG.cutscene._hero(ctx, who, hx, hy, "idle", t);
    },
    // both heroes meeting
    meeting(ctx, t) {
      P.sky(ctx, t, "#0b1020", "#241c3a");
      P.hills(ctx, "#0d1220", H * 0.88, 40, 20);
      for (let i = 0; i < 6; i++) {
        const x = 80 + i * 150, y = H * 0.86;
        ctx.fillStyle = i % 2 ? "#4fc3ff" : "#6ef0a0"; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y - 22); ctx.lineTo(x + 12, y); ctx.fill();
      }
      ctx.shadowBlur = 0;
      const gap = Math.max(40, 200 - t * 60);
      GG.cutscene._hero(ctx, 0, W / 2 - gap, H * 0.86, "walk", t, 1);
      GG.cutscene._hero(ctx, 1, W / 2 + gap, H * 0.86, "walk", t, -1);
      P.half(ctx, W / 2 - gap + 26, H * 0.86 - 40, "#6ef0a0", -1);   // Nichols' half
      P.half(ctx, W / 2 + gap - 26, H * 0.86 - 40, "#4fc3ff", 1);    // Nibihah's half
    },
    // the compass merging + awakening
    compass(ctx, t) {
      P.sky(ctx, t, "#0b1020", "#2a2450");
      P.hills(ctx, "#0d1220", H * 0.88, 40, 20);
      const cx = W / 2, cy = H * 0.44;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160 + Math.sin(t * 4) * 20);
      g.addColorStop(0, "rgba(220,245,255,0.9)"); g.addColorStop(0.5, "rgba(110,240,160,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 180, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // ring
      ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 5; ctx.shadowBlur = 20; ctx.shadowColor = "#f2c14e";
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#dff4ff"; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); ctx.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); ctx.stroke(); }
      // needle
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 2) * 0.7);
      ctx.fillStyle = "#6ef0a0"; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.fill();
      ctx.fillStyle = "#4fc3ff"; ctx.beginPath(); ctx.moveTo(0, 34); ctx.lineTo(6, 0); ctx.lineTo(-6, 0); ctx.fill();
      ctx.restore(); ctx.shadowBlur = 0;
      GG.cutscene._hero(ctx, 0, cx - 90, H * 0.88, "idle", t, 1);
      GG.cutscene._hero(ctx, 1, cx + 90, H * 0.88, "idle", t, -1);
    },
    // escaping the caves toward daylight
    escape(ctx, t) {
      P.sky(ctx, t, "#141a2c", "#e8b86a");
      // cave mouth
      ctx.fillStyle = "#0b0e18";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath(); ctx.ellipse(W / 2, H * 0.6, 260, 200, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const g = ctx.createRadialGradient(W / 2, H * 0.6, 40, W / 2, H * 0.6, 260);
      g.addColorStop(0, "rgba(255,235,180,0.9)"); g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(W / 2, H * 0.6, 260, 200, 0, 0, Math.PI * 2); ctx.fill();
      GG.cutscene._hero(ctx, 0, W / 2 - 40, H * 0.82, "run", t, 1);
      GG.cutscene._hero(ctx, 1, W / 2 + 20, H * 0.82, "run", t, 1);
    },
    // distant ruins the compass points toward
    ruinsAhead(ctx, t) {
      P.sky(ctx, t, "#2a3f6a", "#e8a86a");
      P.hills(ctx, "#3a3050", H * 0.7, 90, 0);
      ctx.fillStyle = "#241d38";
      for (let i = 0; i < 4; i++) { const x = 200 + i * 160; ctx.fillRect(x, H * 0.72 - 90 - i * 10, 40, 100 + i * 10); }
      ctx.fillStyle = "#1a1428"; ctx.fillRect(0, H * 0.78, W, H);
      GG.cutscene._hero(ctx, 0, W * 0.42, H * 0.78, "idle", t, 1);
      GG.cutscene._hero(ctx, 1, W * 0.5, H * 0.78, "idle", t, 1);
      // compass beam pointing at the ruins
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.4 + Math.sin(t * 4) * 0.2;
      ctx.strokeStyle = "#f2c14e"; ctx.lineWidth = 3; ctx.shadowBlur = 14; ctx.shadowColor = "#f2c14e";
      ctx.beginPath(); ctx.moveTo(W * 0.47, H * 0.66); ctx.lineTo(W * 0.72, H * 0.5); ctx.stroke(); ctx.restore();
      ctx.shadowBlur = 0;
    },
    // the hooded figure watching from above
    hooded(ctx, t) {
      P.ruinsAhead(ctx, t);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
      const x = W * 0.78, y = H * 0.34;
      ctx.fillStyle = "#0a0710";
      ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.quadraticCurveTo(x + 26, y - 10, x + 20, y + 46);
      ctx.lineTo(x - 20, y + 46); ctx.quadraticCurveTo(x - 26, y - 10, x, y - 40); ctx.fill();
      ctx.fillStyle = "#c07bff"; ctx.shadowBlur = 14; ctx.shadowColor = "#c07bff";
      ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.3;
      ctx.fillRect(x - 7, y - 12, 5, 3); ctx.fillRect(x + 3, y - 12, 5, 3);
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    },
    // a compass half icon
    half(ctx, x, y, color, dir) {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = color; ctx.shadowBlur = 12; ctx.shadowColor = color;
      ctx.beginPath(); ctx.arc(0, 0, 13, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    },
  };

  /* ---- Scene scripts ----------------------------------------------------
   * Each beat: a painted panel (GG.PAINT), who speaks, the line, how long it
   * holds, the music MOOD underneath, a sound CUE as it appears, and the
   * camera's slow drift: cam = [zoomFrom, zoomTo, panX, panY].
   * --------------------------------------------------------------------- */
  const PP = GG.PAINT || {};
  const pt = (name, arg) => (c, t) => (PP[name] ? PP[name](c, t, arg) : P.sky(c, t, "#0b1020", "#241c3a"));
  const SCENES = {
    prologue: [
      { paint: pt("heartWhole"), speaker: "", text: "Thousands of years ago, the Heart Engine held the balance between earth and sky.", dur: 6, mood: "wonder", sfx: "heartbeat", cam: [1.12, 1.0, 0, 20] },
      { paint: pt("shatter"), speaker: "", text: "Then it shattered, and the world came apart with it.", dur: 5, mood: "tension", sfx: "shatter", cam: [1.0, 1.1, 0, 0], shake: 1.2 },
      { paint: pt("ruinedWorld"), speaker: "", text: "Kingdoms fell. Guardians vanished. The pathways between realms broke, and the shards were scattered.", dur: 6.5, mood: "sorrow", sfx: "wind", cam: [1.05, 1.1, -30, 0] },
      { paint: pt("cavern", 0), speaker: "Nichols", text: "A young inventor, hunting lost technology, finds one half of the Aether Compass.", dur: 5.5, mood: "mystery", sfx: "crystal", cam: [1.1, 1.0, -20, 10] },
      { paint: pt("cavern", 1), speaker: "Nibihah", text: "Elsewhere, an explorer searching for her missing family finds the other half.", dur: 5.5, mood: "mystery", sfx: "crystal", cam: [1.1, 1.0, 20, 10] },
      { paint: pt("meeting"), speaker: "", text: "Neither knows the other exists, until a collapsing cavern brings them together.", dur: 5.5, mood: "tension", sfx: "rumble", cam: [1.0, 1.12, 0, 10], shake: 0.4 },
      { paint: pt("compass"), speaker: "", text: "The two halves meet. They merge. The compass awakens…", dur: 5, mood: "wonder", sfx: "magic", cam: [1.0, 1.15, 0, -20] },
      { paint: pt("compass"), speaker: "The Compass", text: "\"Only together can you restore what has been broken.\"", dur: 5.5, mood: "hope", sfx: "choir", cam: [1.15, 1.2, 0, -20] },
    ],
    ch1_end: [
      { paint: pt("escape"), speaker: "", text: "Daylight at last. The heroes climb out of the caves, together, and no longer strangers.", dur: 5.5, mood: "hope", sfx: "birds", cam: [1.12, 1.0, 0, 0] },
      { paint: pt("ruinsAhead"), speaker: "Nichols", text: "\"The compass is pointing again… toward those ruins.\"", dur: 5, mood: "wonder", sfx: "chime", cam: [1.0, 1.08, 30, 0] },
      { paint: pt("hooded"), speaker: "", text: "High above, a hooded figure watches them go, and follows.", dur: 5.5, mood: "mystery", sfx: "thief", cam: [1.0, 1.12, 40, -10] },
    ],
    ch2_end: [
      { paint: pt("murals"), speaker: "", text: "Deep in the ruins they find murals: the Heart Engine, whole, and the hands that broke it.", dur: 6, mood: "mystery", sfx: "wind", cam: [1.15, 1.02, 0, -10] },
      { paint: pt("heartWhole"), speaker: "Nibihah", text: "\"It didn't shatter on its own. Someone did this… on purpose.\"", dur: 5, mood: "mystery", sfx: "heartbeat", cam: [1.0, 1.08, 0, 10] },
      { paint: pt("ruinsAhead"), speaker: "Nichols", text: "\"Then whatever they were afraid of is still inside it. And we're about to wake it up.\"", dur: 5.5, mood: "tension", cam: [1.05, 1.1, -20, 0] },
      { paint: pt("hooded"), speaker: "", text: "The hooded figure drops between them, and tears a recovered Aether Shard from its cradle.", dur: 5, mood: "tension", sfx: "thief", cam: [1.0, 1.15, 40, 0] },
      { paint: pt("shatter"), speaker: "", text: "The theft breaks something old. Pillars split, the ceiling folds, and the ruins begin to come down.", dur: 5, mood: "tension", sfx: "rumble", cam: [1.05, 1.12, 0, 0], shake: 1 },
      { paint: pt("escape"), speaker: "", text: "They run. Together. And they make it out, one shard poorer, and far less alone than they began.", dur: 5.5, mood: "hope", sfx: "whoosh", cam: [1.12, 1.0, 0, 0] },
      { paint: pt("companions"), speaker: "", text: "In the rubble, two small survivors find THEM: a white cat trailing rainbows, and a round little frog that walks in falling stars. They refuse to be left behind.", dur: 7.5, mood: "joy", sfx: "magic", cam: [1.0, 1.1, 0, 20] },
    ],
    ch3_end: [
      { paint: pt("forest", false), speaker: "", text: "The corrupted groves breathe again. The forest spirits circle the heroes, and approve.", dur: 6, mood: "wonder", sfx: "birds", cam: [1.1, 1.0, 0, 0] },
      { paint: pt("forest", true), speaker: "The Forest Guardian", text: "\"You move as one. Carry our shard, and our hope, to the Great Temple.\"", dur: 6, mood: "hope", sfx: "choir", cam: [1.0, 1.1, 0, -20] },
      { paint: pt("templeGates"), speaker: "Nibihah", text: "\"The temple gates are opening… it knew we were coming.\"", dur: 5.5, mood: "wonder", sfx: "rumble", cam: [1.0, 1.12, 0, 0] },
    ],
    ch4_end: [
      { paint: pt("compass"), speaker: "", text: "The temple's trials are passed. Deep below, ancient counterweights begin to move as one.", dur: 5.5, mood: "mystery", sfx: "rumble", cam: [1.0, 1.1, 0, 0] },
      { paint: pt("templeGates"), speaker: "Nichols", text: "\"Do you feel that? The whole temple is… lifting.\"", dur: 5, mood: "tension", sfx: "rumble", cam: [1.08, 1.0, 0, 20], shake: 0.6 },
      { paint: pt("templeRising"), speaker: "", text: "Stone by stone, the Great Temple rises into the sky, carrying the heroes with it.", dur: 6.5, mood: "wonder", sfx: "whoosh", cam: [1.1, 1.0, 0, 30] },
    ],
    ch5_end: [
      { paint: pt("finalShard"), speaker: "", text: "The final Aether Shard. After everything, every fall and every catch, the Compass is whole.", dur: 6, mood: "wonder", sfx: "magic", cam: [1.12, 1.0, 0, 0] },
      { paint: pt("guardianReveal"), speaker: "", text: "And the hooded figure steps from the light at last… lowering their hood.", dur: 5.5, mood: "mystery", sfx: "thief", cam: [1.0, 1.12, 0, -20] },
      { paint: pt("guardianReveal"), speaker: "The Guardian", text: "\"I am the last Guardian of the Heart Engine. I broke it, because something is imprisoned inside.\"", dur: 6.5, mood: "tension", cam: [1.12, 1.18, 0, -30] },
      { paint: pt("heartWhole"), speaker: "The Guardian", text: "\"Restore it, and you wake what sleeps within. Walk away, and the world stays broken. Choose.\"", dur: 6.5, mood: "tension", sfx: "heartbeat", cam: [1.0, 1.1, 0, 0] },
      { paint: pt("compass"), speaker: "Nibihah", text: "\"We've carried each other this far. We choose hope, together.\"", dur: 6, mood: "hope", sfx: "choir", cam: [1.1, 1.0, 0, 0] },
    ],
    ch6_end: [
      { paint: pt("heartWhole"), speaker: "", text: "The Compass turns. The Heart Engine drinks its light, and beats, whole, for the first time in a thousand years.", dur: 6.5, mood: "triumph", sfx: "logo", cam: [1.0, 1.12, 0, 10] },
      { paint: pt("worldHeals"), speaker: "", text: "And the world begins to heal. Ruins knit themselves whole. Forests bloom where ash lay. The sky reaches down and takes the earth's hand.", dur: 7.5, mood: "triumph", sfx: "birds", cam: [1.1, 1.0, -30, 0] },
      { paint: pt("guardiansReturn"), speaker: "", text: "The ancient guardians return to their posts, hoods lowered, eyes green with borrowed spring.", dur: 6.5, mood: "hope", sfx: "chime", cam: [1.0, 1.08, 0, 0] },
      { paint: pt("yearsLater"), speaker: "", text: "", dur: 3.5, mood: "hope", sfx: "page", cam: [1.0, 1.04, 0, 0] },
      { paint: pt("proposal", false), speaker: "Nichols", text: "Beneath the restored Heart Tree, an inventor goes down on one knee. \"Nibihah… every door we ever opened, we opened together. Marry me?\"", dur: 8, mood: "hope", sfx: "chime", cam: [1.0, 1.14, 0, 30] },
      { paint: pt("proposal", true), speaker: "Nibihah", text: "\"…You already know the rune I'd step on. YES.\"", dur: 5.5, mood: "joy", sfx: "fireworks", cam: [1.14, 1.05, 0, 20] },
      { paint: pt("wedding"), speaker: "", text: "Friends, villagers and guardians gather beneath the blossoms. The wedding lasts three days, and nobody solves a single puzzle alone.", dur: 7.5, mood: "joy", sfx: "bells", cam: [1.08, 1.0, 0, 0] },
      { paint: pt("kingdom"), speaker: "", text: "The kingdom stands rebuilt. Children race where the corruption once crept. The skies are quiet, and kind.", dur: 6.5, mood: "joy", sfx: "birds", cam: [1.0, 1.08, 20, 0] },
      { paint: pt("rise"), speaker: "", text: "The camera rises, past the Heart Tree, past the floating isles, into the healed and starlit dark.", dur: 6.5, mood: "wonder", sfx: "whoosh", cam: [1.0, 1.05, 0, 0] },
      { paint: pt("credits"), speaker: "", text: "", dur: 6.5, mood: "triumph", sfx: "logo", cam: [1.06, 1.0, 0, 0] },
      { paint: pt("secondStar"), speaker: "???", text: "…and far beyond the sea of clouds, over a land no compass has ever pointed to, a second star blinks awake.", dur: 7.5, mood: "mystery", sfx: "spark", cam: [1.0, 1.15, 60, -30] },
    ],
  };
  // The open-world ending: first the hooded thief, then the Heart wakes.
  SCENES.journey_end = [
    { paint: pt("keeper", 0), speaker: "", text: "At the Heart of Aether, the hooded thief is waiting for them. No running this time.", dur: 6, mood: "mystery", sfx: "thief", cam: [1.12, 1.0, 0, 0] },
    { paint: pt("keeper", 1), speaker: "The Thief", text: "\"Eight shards. I carried every one of them one room ahead of the dark, so it could never take them.\"", dur: 7, mood: "mystery", sfx: "crystal", cam: [1.0, 1.1, 40, 0] },
    { paint: pt("keeper", 2), speaker: "Oren, the last Keeper", text: "\"I scratched my face from the murals so no one would follow me. But you two followed each other. That was always the key.\"", dur: 7.5, mood: "hope", sfx: "chime", cam: [1.1, 1.18, 60, -10] },
    { paint: pt("keeper", 3), speaker: "", text: "The Keeper hands the shards over. The two halves of the compass flare, and the shards fly home.", dur: 6, mood: "triumph", sfx: "magic", cam: [1.0, 1.12, 0, 20] },
  ].concat(SCENES.ch6_end);

  /* ---- Player ----------------------------------------------------------- */
  const TOPBAR = 38, BOTBAR = 104;     // cinematic bars; the line is written in the bottom one
  const LIFT = 50;                      // paintings are composed on a 540-tall stage; lift it into the frame
  class Cutscene {
    constructor() { this.active = false; this.id = null; this.i = 0; this.t = 0; this.fade = 1; this.onDone = null; this._chars = null; this.prev = null; this.x = 0; }

    /** Lazily build two Player instances used to pose the heroes in scenes. */
    _ensureHeroes() {
      if (this._chars) return;
      this._chars = [new GG.Player(0, 0, { x: 0, y: 0 }), new GG.Player(1, 1, { x: 0, y: 0 })];
      for (const p of this._chars) { p.dead = false; p.onGround = true; p.squash = 1; }
    }
    /** Pose a hero in a painting; scale draws them larger than in play. */
    _hero(ctx, which, x, footY, pose, t, face, scale) {
      this._ensureHeroes();
      const p = this._chars[which];
      p.x = x - p.w / 2; p.y = footY - p.h;
      p.animName = pose; p.animTime = t; p.facing = face || 1;
      ctx.save();
      if (scale && scale !== 1) { ctx.translate(x, footY); ctx.scale(scale, scale); ctx.translate(-x, -footY); }
      try { p.render(ctx); } catch (_) {}
      ctx.restore();
    }

    play(id, onDone) {
      if (!SCENES[id]) { if (onDone) onDone(); return; }
      this.active = true; this.id = id; this.i = 0; this.t = 0; this.fade = 1; this.prev = null; this.intro = 0;
      this.onDone = onDone || null;
      this._enterBeat();
      GG.bus.emit("cutscene:start", { id });
    }
    _enterBeat() {
      const b = SCENES[this.id][this.i]; if (!b) return;
      if (GG.score) {
        if (b.mood) GG.score.play("story", b.mood);
        if (b.sfx) GG.score.cue(b.sfx);
        GG.score.cue("page");
      }
      this._typed = 0;
    }
    /** Advance to the next beat (or finish). */
    next() {
      const beats = SCENES[this.id]; if (!beats) return;
      const b = beats[this.i];
      // a first press finishes the typing; the next one turns the page
      if (b && Math.floor(this.t * 42) < b.text.length && this.t > 0.3) { this.t = b.text.length / 42 + 0.01; return; }
      this.prev = { b, t: this.t }; this.xf = 1;
      this.i++; this.t = 0;
      if (this.i >= beats.length) this.finish(); else this._enterBeat();
    }
    skip() { this.finish(); }
    finish() {
      if (!this.active) return;
      this.active = false;
      const cb = this.onDone; this.onDone = null;
      if (GG.score) GG.score.stop(1.2);
      GG.bus.emit("cutscene:end", { id: this.id });
      if (cb) cb();
    }
    onKey(code) {
      if (!this.active) return;
      if (code === "Escape") this.skip();
      else this.next();
    }

    /** Paint one beat through its slow camera (pan and zoom). */
    _paintBeat(ctx, b, t) {
      const cam = b.cam || [1.04, 1.0, 0, 0];
      const k = Math.min(1, t / b.dur), e = k * k * (3 - 2 * k);
      const z = cam[0] + (cam[1] - cam[0]) * e;
      const px = cam[2] * (e - 0.5), py = cam[3] * (e - 0.5);
      let sx = 0, sy = 0;
      if (b.shake && t < b.shake) { const a = (1 - t / b.shake) * 5; sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a; }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      ctx.translate(W / 2 + sx, H / 2 + sy - LIFT); ctx.scale(z, z); ctx.translate(-W / 2 - px, -H / 2 - py);
      try { b.paint(ctx, t); } catch (e2) { P.sky(ctx, t, "#0b1020", "#241c3a"); }
      ctx.restore();
    }

    render(ctx, dt) {
      if (!this.active) return;
      const beats = SCENES[this.id]; const b = beats[this.i]; if (!b) { this.finish(); return; }
      this.t += dt; this.intro = Math.min(1, (this.intro || 0) + dt * 1.5);
      if (this.t > b.dur + (b.text.length / 42)) { this.next(); if (!this.active) return; }

      // the painting, cross-fading from the previous one
      this._paintBeat(ctx, b, this.t);
      if (this.prev && this.xf > 0) {
        this.xf = Math.max(0, this.xf - dt * 1.4);
        this.prev.t += dt;
        ctx.save(); ctx.globalAlpha = this.xf; this._paintBeat(ctx, this.prev.b, this.prev.t); ctx.restore();
      }
      if (this.i === 0 && this.t < 1) { ctx.fillStyle = `rgba(5,4,10,${1 - this.t})`; ctx.fillRect(0, 0, W, H); }

      // cinematic bars slide in
      const tb = TOPBAR * this.intro, bb = BOTBAR * this.intro;
      ctx.fillStyle = "#040308";
      ctx.fillRect(0, 0, W, tb); ctx.fillRect(0, H - bb, W, bb);
      const edge = ctx.createLinearGradient(0, H - bb - 24, 0, H - bb);
      edge.addColorStop(0, "rgba(4,3,8,0)"); edge.addColorStop(1, "rgba(4,3,8,0.85)");
      ctx.fillStyle = edge; ctx.fillRect(0, H - bb - 24, W, 24);
      const lb = tb;

      // the line, written into the bottom bar like film subtitles
      const chars = Math.floor(this.t * 42);
      if (b.text) {
        const bx = 110, bw = W - 220, by = H - bb + 14;
        const rule = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        rule.addColorStop(0, "rgba(242,193,78,0)"); rule.addColorStop(0.5, "rgba(242,193,78,0.7)"); rule.addColorStop(1, "rgba(242,193,78,0)");
        ctx.fillStyle = rule; ctx.fillRect(bx, H - bb, bw, 1);
        let ty = by + 16;
        ctx.textAlign = "center";
        if (b.speaker) {
          const col = b.speaker === "Nichols" ? "#6ef0a0" : b.speaker === "Nibihah" ? "#7fd4ff" : "#f2c14e";
          ctx.font = "700 12px 'Cinzel', Georgia, serif"; ctx.fillStyle = col;
          ctx.fillText("~  " + b.speaker.toUpperCase() + "  ~", W / 2, by + 8);
          ty = by + 30;
        }
        // typewriter body text (wrapped, centred), with a soft blip as letters land
        const shown = b.text.slice(0, chars);
        if (chars > (this._typed || 0) && chars <= b.text.length && chars % 3 === 0 && GG.score) GG.score.cue("blip");
        this._typed = chars;
        ctx.font = "17px 'MedievalSharp', Georgia, serif";
        // wrap the FULL line so words don't jump between rows while typing
        const rows = []; let line = "";
        for (const word of b.text.split(" ")) { const test = line ? line + " " + word : word; if (ctx.measureText(test).width > bw) { rows.push(line); line = word; } else line = test; }
        rows.push(line);
        let left = shown.length;
        ctx.fillStyle = "#f6ecd2";
        rows.forEach((r, i) => {
          if (left <= 0) return;
          const part = r.slice(0, left); left -= r.length + 1;
          const full = ctx.measureText(r).width;
          ctx.textAlign = "left"; ctx.fillText(part, W / 2 - full / 2, ty + i * 22);
        });
        ctx.textAlign = "left";
        if (chars >= b.text.length) {
          ctx.globalAlpha = 0.5 + Math.sin(this.t * 5) * 0.4;
          ctx.fillStyle = "#f2c14e"; ctx.font = "12px 'Cinzel', serif";
          ctx.fillText("▼", W - 90, H - 18);
          ctx.globalAlpha = 1;
        }
      }
      // progress pips and the skip hint in the top bar
      ctx.globalAlpha = this.intro;
      for (let i = 0; i < beats.length; i++) { ctx.fillStyle = i < this.i ? "#f2c14e" : i === this.i ? "#fff4d0" : "rgba(255,255,255,0.2)"; ctx.fillRect(W / 2 - beats.length * 7 + i * 14, lb / 2 - 1, 8, 2); }
      ctx.fillStyle = "#8f9ac2"; ctx.font = "11px 'Segoe UI', sans-serif"; ctx.textAlign = "right";
      ctx.fillText("any key: next  ·  Esc: skip", W - 20, lb / 2 + 4); ctx.textAlign = "left";
      ctx.globalAlpha = 1;
    }
  }

  GG.cutscene = new Cutscene();
  GG.CUTSCENES = SCENES;
})(window);
