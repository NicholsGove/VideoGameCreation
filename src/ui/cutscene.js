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

  /* ---- Scene scripts ---------------------------------------------------- */
  const SCENES = {
    prologue: [
      { paint: P.heartWhole,  speaker: "",         text: "Thousands of years ago, the Heart Engine held the balance between earth and sky.", dur: 5 },
      { paint: P.shatter,     speaker: "",         text: "Then it shattered — and the world came apart with it.", dur: 4.5 },
      { paint: P.ruinedWorld, speaker: "",         text: "Kingdoms fell. Guardians vanished. The pathways between realms broke, and the shards were scattered.", dur: 6 },
      { paint: (c, t) => P.cavern(c, t, 0), speaker: "Nichols", text: "A young inventor, hunting lost technology, finds one half of the Aether Compass.", dur: 5 },
      { paint: (c, t) => P.cavern(c, t, 1), speaker: "Nibihah", text: "Elsewhere, an explorer searching for her missing family finds the other half.", dur: 5 },
      { paint: P.meeting,     speaker: "",         text: "Neither knows the other exists — until a collapsing cavern brings them together.", dur: 5 },
      { paint: P.compass,     speaker: "",         text: "The two halves meet. They merge. The compass awakens…", dur: 4.5 },
      { paint: P.compass,     speaker: "The Compass", text: "\"Only together can you restore what has been broken.\"", dur: 5 },
    ],
    ch6_end: [
      { paint: P.heartWhole,  speaker: "", text: "The Compass turns. The Heart Engine drinks its light — and beats, whole, for the first time in a thousand years.", dur: 6 },
      { paint: (c, t) => { P.sky(c, t, "#2a3f6a", "#9fd8a0"); P.hills(c, "#2f704a", 400, 90, 20); c.fillStyle = "#4fae5f"; for (let i = 0; i < 8; i++) c.fillRect(90 + i * 105, 330 - (i % 3) * 24, 26, 130); },
        speaker: "", text: "And the world begins to heal. Ruins knit themselves whole. Forests bloom where ash lay. The sky reaches down and takes the earth's hand.", dur: 7 },
      { paint: (c, t) => { P.sky(c, t, "#2a3f6a", "#9fd8a0"); P.hills(c, "#2f704a", 420, 80, 40); for (let i = 0; i < 4; i++) { const x = 160 + i * 190; c.fillStyle = "#0a0710"; c.beginPath(); c.moveTo(x, 360); c.quadraticCurveTo(x + 22, 390, x + 16, 440); c.lineTo(x - 16, 440); c.quadraticCurveTo(x - 22, 390, x, 360); c.fill(); c.fillStyle = "#9bf0b8"; c.fillRect(x - 6, 384, 4, 3); c.fillRect(x + 2, 384, 4, 3); } },
        speaker: "", text: "The ancient guardians return to their posts — hoods lowered, eyes green with borrowed spring.", dur: 6 },
      { paint: (c, t) => { P.sky(c, t, "#1a2450", "#e8a86a"); c.textAlign = "center"; c.fillStyle = "#f6ecd2"; c.font = "700 26px 'Cinzel', serif"; c.fillText("Years later…", 480, 270); c.textAlign = "left"; },
        speaker: "", text: "", dur: 3.5 },
      { paint: (c, t) => { P.sky(c, t, "#2a3f6a", "#f0c07a"); P.hills(c, "#2f704a", 430, 70, 10); c.fillStyle = "#5a3a24"; c.fillRect(462, 250, 36, 200); c.fillStyle = "#4fae5f"; c.beginPath(); c.arc(480, 220, 90, 0, Math.PI * 2); c.fill(); c.save(); c.globalCompositeOperation = "lighter"; const g = c.createRadialGradient(480, 250, 4, 480, 250, 60); g.addColorStop(0, "rgba(255,220,240,0.9)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.beginPath(); c.arc(480, 250, 60, 0, Math.PI * 2); c.fill(); c.restore(); GG.cutscene._hero(c, 0, 430, 470, "push", t, 1); GG.cutscene._hero(c, 1, 500, 470, "idle", t, -1); },
        speaker: "Nichols", text: "Beneath the restored Heart Tree, an inventor goes down on one knee. \"Nibihah… every door we ever opened, we opened together. Marry me?\"", dur: 7 },
      { paint: (c, t) => { P.sky(c, t, "#2a3f6a", "#f0c07a"); P.hills(c, "#2f704a", 430, 70, 10); GG.cutscene._hero(c, 0, 445, 470, "celebrate", t, 1); GG.cutscene._hero(c, 1, 505, 470, "celebrate", t, -1); c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 24; i++) { const a = t * 2 + i; c.fillStyle = i % 2 ? "#f2c14e" : "#ff9ac4"; c.fillRect(480 + Math.cos(a) * (40 + i * 9), 300 + Math.sin(a * 1.3) * 80 + i * 4, 3, 3); } c.restore(); },
        speaker: "Nibihah", text: "\"…You already know the rune I'd step on. YES.\"", dur: 5 },
      { paint: (c, t) => { P.sky(c, t, "#2a3f6a", "#f0c07a"); P.hills(c, "#2f704a", 440, 60, 30); for (let i = 0; i < 9; i++) { const x = 120 + i * 90; if (i === 4 || i === 5) continue; c.fillStyle = i % 3 === 0 ? "#0a0710" : "#5a4324"; c.fillRect(x, 420, 20, 46); c.fillStyle = "#a56a43"; c.beginPath(); c.arc(x + 10, 414, 8, 0, Math.PI * 2); c.fill(); } GG.cutscene._hero(c, 0, 450, 470, "celebrate", t, 1); GG.cutscene._hero(c, 1, 505, 470, "celebrate", t, -1); c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 30; i++) { c.fillStyle = ["#f2c14e", "#ff9ac4", "#9bf0b8", "#a9d4ff"][i % 4]; c.fillRect((i * 61 + t * 40) % 960, ((i * 37 + t * 55) % 300) + 120, 3, 3); } c.restore(); },
        speaker: "", text: "Friends, villagers and guardians gather beneath the blossoms. The wedding lasts three days, and nobody solves a single puzzle alone.", dur: 7 },
      { paint: (c, t) => { P.sky(c, t, "#2a3f6a", "#9fd8a0"); P.hills(c, "#2f704a", 430, 80, 20); c.fillStyle = "#c9d2e0"; c.fillRect(700, 330, 60, 120); c.fillRect(180, 350, 50, 100); GG.cutscene._hero(c, 0, 452, 470, "idle", t, 1); GG.cutscene._hero(c, 1, 492, 470, "idle", t, -1); GG.cutscene._hero(c, 1, 300 + Math.sin(t * 3) * 40, 470, "run", t, Math.sin(t * 3) > 0 ? 1 : -1); },
        speaker: "", text: "The kingdom stands rebuilt. Children race where the corruption once crept. The skies are quiet, and kind.", dur: 6 },
      { paint: (c, t) => { const rise = Math.min(1, t / 5); P.sky(c, t, "#1a2450", "#2a3f6a"); c.save(); c.translate(0, rise * 220); P.hills(c, "#2f704a", 430, 80, 20); GG.cutscene._hero(c, 0, 452, 470, "idle", t, 1); GG.cutscene._hero(c, 1, 492, 470, "idle", t, -1); c.restore(); P.stars(c, t, Math.floor(rise * 80)); c.fillStyle = `rgba(5,4,10,${rise * 0.5})`; c.fillRect(0, 0, 960, 540); },
        speaker: "", text: "The camera rises — past the Heart Tree, past the floating isles, into the healed and starlit dark.", dur: 6 },
      { paint: (c, t) => { P.sky(c, t, "#05040a", "#0b1020"); P.stars(c, t); c.textAlign = "center"; c.fillStyle = "#f2c14e"; c.font = "800 34px 'Cinzel', serif"; c.shadowBlur = 20; c.shadowColor = "#f2c14e"; c.fillText("ECHOES OF AETHER", 480, 250); c.shadowBlur = 0; c.fillStyle = "#cdb488"; c.font = "15px 'MedievalSharp', serif"; c.fillText("for Nichols & Nibihah — who never let go", 480, 290); c.font = "12px 'Segoe UI', sans-serif"; c.fillStyle = "#8f9ac2"; c.fillText("design · code · art · music — made together", 480, 330); c.textAlign = "left"; },
        speaker: "", text: "", dur: 6 },
      { paint: (c, t) => { P.sky(c, t, "#05040a", "#101838"); P.stars(c, t, 50); P.hills(c, "#0a0f1e", 460, 50, 70); c.save(); c.globalAlpha = 0.5 + Math.sin(t * 2) * 0.2; c.fillStyle = "#c07bff"; c.shadowBlur = 16; c.shadowColor = "#c07bff"; c.beginPath(); c.arc(820, 180, 5, 0, Math.PI * 2); c.fill(); c.restore(); },
        speaker: "???", text: "…and far beyond the sea of clouds, over a land no compass has ever pointed to — a second star blinks awake.", dur: 7 },
    ],
    ch4_end: [
      { paint: P.compass,    speaker: "",        text: "The temple's trials are passed. Deep below, ancient counterweights begin to move as one.", dur: 5 },
      { paint: P.shatter,    speaker: "Nichols", text: "\"Do you feel that? The whole temple is… lifting.\"", dur: 4.5 },
      { paint: (c, t) => { P.sky(c, t, "#182448", "#7fb0ff"); P.hills(c, "#241d38", 480, 60, 30); c.save(); c.translate(0, Math.max(-160, -t * 30)); P.hills(c, "#2a2340", 420, 90, 10); c.fillStyle = "#3a3057"; c.fillRect(340, 260, 280, 200); c.restore(); },
        speaker: "", text: "Stone by stone, the Great Temple rises into the sky — carrying the heroes with it.", dur: 6 },
    ],
    ch5_end: [
      { paint: (c, t) => { P.sky(c, t, "#182448", "#7fb0ff"); GG.cutscene._hero(c, 0, 380, 470, "idle", t, 1); GG.cutscene._hero(c, 1, 460, 470, "idle", t, -1); P.half(c, 480, 250 + Math.sin(t * 2) * 5, "#f2c14e", 1); },
        speaker: "", text: "The final Aether Shard. After everything — every fall, every catch — the Compass is whole.", dur: 5.5 },
      { paint: P.hooded,     speaker: "",        text: "And the hooded figure steps from the light at last… lowering their hood.", dur: 5 },
      { paint: P.hooded,     speaker: "The Guardian", text: "\"I am the last Guardian of the Heart Engine. I broke it — because something is imprisoned inside.\"", dur: 6 },
      { paint: P.heartWhole, speaker: "The Guardian", text: "\"Restore it, and you wake what sleeps within. Walk away, and the world stays broken. Choose.\"", dur: 6 },
      { paint: P.compass,    speaker: "Nibihah", text: "\"We've carried each other this far. We choose hope — together.\"", dur: 5.5 },
    ],
    ch3_end: [
      { paint: (c, t) => { P.sky(c, t, "#0c2413", "#3a6a2a"); P.hills(c, "#12301c", 440, 90, 20); GG.cutscene._hero(c, 0, 400, 470, "idle", t, 1); GG.cutscene._hero(c, 1, 480, 470, "idle", t, -1); },
        speaker: "", text: "The corrupted groves breathe again. The forest spirits circle the heroes — and approve.", dur: 5.5 },
      { paint: (c, t) => { P.sky(c, t, "#0c2413", "#3a6a2a"); P.hills(c, "#12301c", 440, 90, 20); P.half(c, 480, 260 + Math.sin(t * 2) * 6, "#f2c14e", 1); GG.cutscene._hero(c, 0, 400, 470, "celebrate", t, 1); GG.cutscene._hero(c, 1, 540, 470, "celebrate", t, -1); },
        speaker: "The Forest Guardian", text: "\"You move as one. Carry our shard — and our hope — to the Great Temple.\"", dur: 5.5 },
      { paint: P.ruinsAhead, speaker: "Nibihah", text: "\"The temple gates are opening… it knew we were coming.\"", dur: 5 },
    ],
    ch2_end: [
      { paint: P.ruinedWorld, speaker: "",        text: "Deep in the ruins they find murals — the Heart Engine, whole, and the hands that broke it.", dur: 5.5 },
      { paint: P.heartWhole,  speaker: "Nibihah", text: "\"It didn't shatter on its own. Someone did this… on purpose.\"", dur: 5 },
      { paint: P.ruinsAhead,  speaker: "Nichols", text: "\"Then whatever they were afraid of is still inside it. And we're about to wake it up.\"", dur: 5.5 },
      { paint: P.hooded,      speaker: "",        text: "The hooded figure drops between them — and tears a recovered Aether Shard from its cradle.", dur: 5 },
      { paint: P.shatter,     speaker: "",        text: "The theft breaks something old. Pillars split, the ceiling folds, and the ruins begin to come down.", dur: 5 },
      { paint: P.escape,      speaker: "",        text: "They run. Together. And they make it out — one shard poorer, and far less alone than they began.", dur: 5.5 },
      { paint: (c, t) => { P.sky(c, t, "#141a2c", "#e8b86a"); P.hills(c, "#1a1428", 460, 50, 20);
          GG.cutscene._hero(c, 0, 380, 470, "idle", t, 1); GG.cutscene._hero(c, 1, 560, 470, "idle", t, -1);
          // the little white cat
          c.save(); c.translate(440, 462);
          c.fillStyle = "#f0e6da"; c.beginPath(); c.ellipse(0, 6, 8, 5, 0, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(7, 1, 4.5, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.moveTo(5, -2); c.lineTo(6, -7); c.lineTo(8, -2); c.moveTo(8, -2); c.lineTo(10, -6); c.lineTo(11, -1); c.fill();
          c.strokeStyle = "#f0e6da"; c.lineWidth = 2; c.beginPath(); c.moveTo(-7, 5); c.quadraticCurveTo(-14, Math.sin(t * 4) * 4, -13, -4); c.stroke();
          c.fillStyle = "#4fc3ff"; c.fillRect(7, 0, 2, 2); c.restore();
          // rainbow wisps behind it
          const rb = ["#ff6b6b", "#ffb14d", "#f2e14e", "#6ef0a0", "#4fc3ff", "#c07bff"];
          c.save(); c.globalCompositeOperation = "lighter";
          for (let i = 0; i < 6; i++) { c.fillStyle = rb[i]; c.globalAlpha = 0.6; c.fillRect(420 - i * 7, 466 + Math.sin(t * 3 + i) * 2, 4, 3); }
          c.restore(); c.globalAlpha = 1;
          // the little frog
          c.save(); c.translate(520, 464 + Math.abs(Math.sin(t * 5)) * -8);
          c.fillStyle = "#5fae4f"; c.beginPath(); c.ellipse(0, 5, 7, 4.5, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#fff"; c.beginPath(); c.arc(-2, -2, 2.4, 0, Math.PI * 2); c.arc(2, -2, 2.4, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#1a1220"; c.fillRect(-2.8, -2.8, 1.7, 1.7); c.fillRect(1.2, -2.8, 1.7, 1.7); c.restore();
          // star twinkles behind it
          c.save(); c.globalCompositeOperation = "lighter";
          for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? "#fff" : "#f2c14e"; c.globalAlpha = 0.5 + Math.sin(t * 4 + i) * 0.4; c.fillRect(540 + i * 8, 460 + Math.sin(t * 2 + i * 2) * 4, 2.5, 2.5); }
          c.restore(); c.globalAlpha = 1;
        },
        speaker: "", text: "In the rubble, two small survivors find THEM: a white cat trailing rainbows, and a round little frog that walks in falling stars. They refuse to be left behind.", dur: 7 },
    ],
    ch1_end: [
      { paint: P.escape,      speaker: "",         text: "Daylight at last. The heroes climb out of the caves — together, and no longer strangers.", dur: 5 },
      { paint: P.ruinsAhead,  speaker: "Nichols",  text: "\"The compass is pointing again… toward those ruins.\"", dur: 4.5 },
      { paint: P.hooded,      speaker: "",         text: "High above, a hooded figure watches them go — and follows.", dur: 5 },
    ],
  };

  /* ---- Player ----------------------------------------------------------- */
  class Cutscene {
    constructor() { this.active = false; this.id = null; this.i = 0; this.t = 0; this.fade = 1; this.onDone = null; this._chars = null; }

    /** Lazily build two Player instances used to pose the heroes in scenes. */
    _ensureHeroes() {
      if (this._chars) return;
      this._chars = [new GG.Player(0, 0, { x: 0, y: 0 }), new GG.Player(1, 1, { x: 0, y: 0 })];
      for (const p of this._chars) { p.dead = false; p.onGround = true; p.squash = 1; }
    }
    _hero(ctx, which, x, footY, pose, t, face) {
      this._ensureHeroes();
      const p = this._chars[which];
      p.x = x - p.w / 2; p.y = footY - p.h;
      p.animName = pose; p.animTime = t; p.facing = face || 1;
      try { p.render(ctx); } catch (_) {}
    }

    play(id, onDone) {
      if (!SCENES[id]) { if (onDone) onDone(); return; }
      this.active = true; this.id = id; this.i = 0; this.t = 0; this.fade = 1;
      this.onDone = onDone || null;
      GG.bus.emit("cutscene:start", { id });
    }
    /** Advance to the next beat (or finish). */
    next() {
      this.i++; this.t = 0; this.fade = 1;
      if (this.i >= SCENES[this.id].length) this.finish();
    }
    skip() { this.finish(); }
    finish() {
      if (!this.active) return;
      this.active = false;
      const cb = this.onDone; this.onDone = null;
      GG.bus.emit("cutscene:end", { id: this.id });
      if (cb) cb();
    }
    onKey(code) {
      if (!this.active) return;
      if (code === "Escape") this.skip();
      else this.next();
    }

    render(ctx, dt) {
      if (!this.active) return;
      const beats = SCENES[this.id]; const b = beats[this.i]; if (!b) { this.finish(); return; }
      this.t += dt;
      this.fade = Math.max(0, this.fade - dt * 2.5);
      if (this.t > b.dur) { this.next(); return; }

      try { b.paint(ctx, this.t); } catch (e) { P.sky(ctx, this.t, "#0b1020", "#241c3a"); }

      // letterbox bars
      ctx.fillStyle = "#05040a";
      ctx.fillRect(0, 0, W, 44); ctx.fillRect(0, H - 96, W, 96);

      // dialogue plate
      const bx = 60, by = H - 88, bw = W - 120, bh = 62;
      ctx.fillStyle = "rgba(25,19,48,0.92)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = "#d89a2e"; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
      if (b.speaker) {
        ctx.fillStyle = "#f2c14e"; ctx.font = "700 14px 'Cinzel', Georgia, serif";
        ctx.fillText(b.speaker, bx + 14, by + 20);
      }
      // typewriter body text (wrapped)
      const chars = Math.floor(this.t * 42);
      const shown = b.text.slice(0, chars);
      ctx.fillStyle = "#f6ecd2"; ctx.font = "16px 'MedievalSharp', 'Segoe UI', serif";
      let line = "", y = by + (b.speaker ? 40 : 30);
      for (const word of shown.split(" ")) {
        const test = line ? line + " " + word : word;
        if (ctx.measureText(test).width > bw - 28) { ctx.fillText(line, bx + 14, y); line = word; y += 20; }
        else line = test;
      }
      ctx.fillText(line, bx + 14, y);

      // prompt
      if (chars >= b.text.length) {
        ctx.globalAlpha = 0.5 + Math.sin(this.t * 5) * 0.4;
        ctx.fillStyle = "#f2c14e"; ctx.font = "12px 'Cinzel', serif";
        ctx.fillText("▼", bx + bw - 24, by + bh - 12);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "#8f9ac2"; ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.fillText("ESC to skip", bx + bw - 90, 28);

      // beat cross-fade
      if (this.fade > 0) { ctx.fillStyle = `rgba(5,4,10,${this.fade})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  GG.cutscene = new Cutscene();
  GG.CUTSCENES = SCENES;
})(window);
