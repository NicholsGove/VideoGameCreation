/* =========================================================================
 * paintings.js — the painted story panels
 * -------------------------------------------------------------------------
 * Every story beat is a small painting drawn live on the canvas: layered
 * skies with nebulae and auroras, mountains that fade into the haze, light
 * rays, glowing crystals, drifting motes and petals, and the heroes drawn
 * large in the scene. The cutscene player adds a slow pan-and-zoom camera
 * and cross-fades between them.
 *
 *   GG.PAINT.<scene>(ctx, t)      one painted panel at time t (seconds)
 *   GG.PAINT.lib                  the brushes the scenes are built from
 *
 * All drawing is in the 960x540 design space. Painters overscan a little so
 * the camera can zoom and pan without showing edges.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, C = GG.C;
  const W = C.VIEW_W, H = C.VIEW_H, OS = 60;          // overscan
  const TAU = Math.PI * 2;

  /** Tiny seeded RNG so every painting looks the same each time. */
  function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const hero = (c, who, x, y, pose, t, face, scale) => GG.cutscene && GG.cutscene._hero(c, who, x, y, pose, t, face, scale || 2.2);

  /* =====================================================================
   * BRUSHES
   * =================================================================== */
  const L = {
    sky(c, stops) {
      const g = c.createLinearGradient(0, -OS, 0, H + OS);
      stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
      c.fillStyle = g; c.fillRect(-OS, -OS, W + OS * 2, H + OS * 2);
    },
    nebula(c, x, y, r, col, a) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = a || 0.35; c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
    },
    stars(c, t, n, seed, maxY) {
      const R = rng(seed || 7);
      c.save(); c.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const x = R() * (W + OS * 2) - OS, y = R() * (maxY || H * 0.7) - OS * 0.5, s = R() < 0.1 ? 2.2 : R() < 0.4 ? 1.4 : 0.9;
        c.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.6 + R()) + i));
        c.fillStyle = R() < 0.15 ? "#ffe9c4" : R() < 0.3 ? "#c4dcff" : "#ffffff";
        c.fillRect(x, y, s, s);
        if (s > 2) { c.globalAlpha *= 0.4; c.fillRect(x - 3, y + 0.6, 8, 1); c.fillRect(x + 0.6, y - 3, 1, 8); }
      }
      c.restore();
    },
    aurora(c, t, cols, y0, amp) {
      c.save(); c.globalCompositeOperation = "lighter";
      cols.forEach((col, k) => {
        const g = c.createLinearGradient(0, y0 - 80, 0, y0 + 60);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, col); g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g; c.globalAlpha = 0.28;
        c.beginPath(); c.moveTo(-OS, y0 + 80);
        for (let x = -OS; x <= W + OS; x += 16) c.lineTo(x, y0 + Math.sin(x * 0.006 + t * 0.35 + k * 1.7) * (amp || 40) + Math.sin(x * 0.017 - t * 0.5) * 10 - k * 18);
        for (let x = W + OS; x >= -OS; x -= 16) c.lineTo(x, y0 + 90 + Math.sin(x * 0.008 + t * 0.3 + k) * 20 - k * 18);
        c.fill();
      });
      c.restore();
    },
    orb(c, x, y, r, core, glow, a) {
      c.save(); c.globalCompositeOperation = "lighter";
      const g = c.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, glow); g.addColorStop(1, "rgba(0,0,0,0)");
      c.globalAlpha = a == null ? 0.8 : a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 4, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = core; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    },
    rays(c, x, y, col, n, len, t, spread, a) {
      c.save(); c.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const ang = (spread ? -spread / 2 + spread * i / (n - 1) : i / n * TAU) + Math.sin(t * 0.3 + i) * 0.03 + Math.PI / 2 * (spread ? 1 : 0);
        const w = 0.03 + (i % 3) * 0.015;
        const g = c.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
        c.globalAlpha = (a || 0.25) * (0.6 + 0.4 * Math.sin(t * 0.8 + i * 1.3));
        c.fillStyle = g; c.beginPath(); c.moveTo(x, y);
        c.lineTo(x + Math.cos(ang - w) * len, y + Math.sin(ang - w) * len); c.lineTo(x + Math.cos(ang + w) * len, y + Math.sin(ang + w) * len); c.fill();
      }
      c.restore();
    },
    /** A mountain range from summed sines. */
    range(c, base, amp, col, seed, jag, peaks) {
      const R = rng(seed); const ph = [R() * 9, R() * 9, R() * 9];
      c.fillStyle = col; c.beginPath(); c.moveTo(-OS, H + OS);
      for (let x = -OS; x <= W + OS; x += 6) {
        const y = base - (Math.sin(x * 0.004 + ph[0]) * 0.5 + 0.5) * amp - Math.sin(x * 0.013 + ph[1]) * amp * 0.25 * (peaks || 1) - Math.abs(Math.sin(x * 0.041 + ph[2])) * (jag || 6);
        c.lineTo(x, y);
      }
      c.lineTo(W + OS, H + OS); c.closePath(); c.fill();
    },
    haze(c, y, h, col, a) {
      const g = c.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, col); g.addColorStop(1, "rgba(0,0,0,0)");
      c.save(); c.globalAlpha = a || 0.5; c.fillStyle = g; c.fillRect(-OS, y - h, W + OS * 2, h * 2); c.restore();
    },
    mist(c, t, y, col, a, speed) {
      c.save(); c.globalAlpha = a || 0.18; c.fillStyle = col;
      for (let i = 0; i < 7; i++) {
        const x = ((i * 190 + t * (speed || 10) * (1 + i % 3 * 0.4)) % (W + 500)) - 250;
        c.beginPath(); c.ellipse(x, y + Math.sin(i * 2 + t * 0.2) * 8, 180 + (i % 3) * 60, 22 + (i % 2) * 10, 0, 0, TAU); c.fill();
      }
      c.restore();
    },
    /** Pines / round trees along a ridge. */
    forest(c, base, col, seed, scale, round) {
      const R = rng(seed); c.fillStyle = col;
      for (let x = -OS; x < W + OS; x += 10 + R() * 18) {
        const h = (30 + R() * 50) * (scale || 1), y = base + Math.sin(x * 0.01 + seed) * 10;
        if (round) { c.beginPath(); c.arc(x, y - h * 0.6, h * 0.45, 0, TAU); c.fill(); c.fillRect(x - 2, y - h * 0.3, 4, h * 0.3 + 30); }
        else { c.beginPath(); c.moveTo(x - h * 0.28, y); c.lineTo(x, y - h); c.lineTo(x + h * 0.28, y); c.fill(); }
      }
      c.fillRect(-OS, base + 4, W + OS * 2, H);
    },
    ruins(c, base, col, seed, scale) {
      const R = rng(seed); c.fillStyle = col; const s = scale || 1;
      for (let i = 0; i < 9; i++) {
        const x = -OS + i * (W + OS * 2) / 9 + R() * 40, h = (40 + R() * 110) * s, w = (18 + R() * 16) * s;
        c.fillRect(x, base - h, w, h);
        if (R() < 0.5) { c.fillRect(x - 6 * s, base - h - 8 * s, w + 12 * s, 8 * s); }                 // capital
        if (R() < 0.4) { c.beginPath(); c.moveTo(x, base - h); c.lineTo(x + w * 0.4, base - h - 16 * s); c.lineTo(x + w, base - h); c.fill(); }  // broken top
        if (R() < 0.3 && i < 8) { c.beginPath(); c.arc(x + w + 30 * s, base - h * 0.7, 30 * s, Math.PI, 0); c.lineTo(x + w + 60 * s, base); c.lineTo(x + w + 52 * s, base); c.arc(x + w + 30 * s, base - h * 0.7, 22 * s, 0, Math.PI, true); c.lineTo(x + w, base); c.fill(); }
      }
      c.fillRect(-OS, base, W + OS * 2, H);
    },
    crystals(c, t, base, seed, cols, n, scale) {
      const R = rng(seed);
      for (let i = 0; i < (n || 10); i++) {
        const x = -20 + R() * (W + 40), s = (0.6 + R() * 0.9) * (scale || 1), col = cols[(R() * cols.length) | 0];
        const y = base + R() * 30;
        c.save(); c.globalCompositeOperation = "lighter";
        const g = c.createRadialGradient(x, y - 20 * s, 0, x, y - 20 * s, 60 * s);
        g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
        c.globalAlpha = 0.25 + 0.12 * Math.sin(t * 1.5 + i); c.fillStyle = g; c.beginPath(); c.arc(x, y - 20 * s, 60 * s, 0, TAU); c.fill(); c.restore();
        c.fillStyle = col;
        for (const [dx, h, w] of [[0, 46, 9], [-10, 28, 7], [11, 34, 7]]) {
          c.beginPath(); c.moveTo(x + (dx - w) * s, y); c.lineTo(x + dx * s, y - h * s); c.lineTo(x + (dx + w) * s, y); c.fill();
        }
        c.fillStyle = "rgba(255,255,255,0.55)";
        c.beginPath(); c.moveTo(x - 2 * s, y - 4 * s); c.lineTo(x, y - 44 * s); c.lineTo(x + 2 * s, y - 4 * s); c.fill();
      }
    },
    /** A cave's back wall: layered rock catching the light. */
    caveBack(c, seed, tint) {
      const R = rng(seed || 2);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0a0f1f"); g.addColorStop(0.6, tint || "#16213e"); g.addColorStop(1, "#0b1122");
      c.fillStyle = g; c.fillRect(-OS, -OS, W + OS * 2, H + OS * 2);
      for (let i = 0; i < 60; i++) {
        const x = R() * (W + 100) - 50, y = R() * H, rx = 30 + R() * 90, ry = 12 + R() * 30;
        c.fillStyle = R() < 0.5 ? "rgba(40,56,96,0.35)" : "rgba(6,8,18,0.35)";
        c.beginPath(); c.ellipse(x, y, rx, ry, R() - 0.5, 0, TAU); c.fill();
      }
      c.strokeStyle = "rgba(90,120,180,0.12)"; c.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const y = 60 + i * 50 + R() * 20; c.beginPath(); c.moveTo(-OS, y); for (let x = -OS; x <= W + OS; x += 30) c.lineTo(x, y + Math.sin(x * 0.01 + i) * 10); c.stroke(); }
    },
    /** Cave: dark walls framing the panel with stalactites. */
    caveFrame(c, col, seed) {
      const R = rng(seed || 3); c.fillStyle = col;
      c.beginPath(); c.moveTo(-OS, -OS); c.lineTo(W + OS, -OS);
      for (let x = W + OS; x >= -OS; x -= 14) c.lineTo(x, 40 + Math.sin(x * 0.02) * 26 + (R() < 0.18 ? 40 + R() * 70 : R() * 12));
      c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-OS, -OS); c.lineTo(80 + Math.sin(1) * 20, -OS);
      for (let y = 0; y <= H + OS; y += 20) c.lineTo(50 + Math.sin(y * 0.03) * 30 + R() * 10, y);
      c.lineTo(-OS, H + OS); c.fill();
      c.beginPath(); c.moveTo(W + OS, -OS);
      for (let y = 0; y <= H + OS; y += 20) c.lineTo(W - 50 - Math.sin(y * 0.025 + 1) * 30 - R() * 10, y);
      c.lineTo(W + OS, H + OS); c.fill();
    },
    ground(c, y, col, top) {
      c.fillStyle = col; c.fillRect(-OS, y, W + OS * 2, H + OS);
      if (top) { c.fillStyle = top; c.fillRect(-OS, y, W + OS * 2, 3); }
    },
    water(c, t, y, col, glint) {
      const g = c.createLinearGradient(0, y, 0, H + OS);
      g.addColorStop(0, col); g.addColorStop(1, "#05060e");
      c.fillStyle = g; c.fillRect(-OS, y, W + OS * 2, H + OS - y);
      c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = glint || "rgba(200,230,255,0.25)"; c.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const yy = y + 4 + i * i * 0.55, x = ((i * 137 + t * 14 * (1 + i % 3)) % (W + 200)) - 100, w = 20 + (i % 5) * 18;
        c.globalAlpha = 0.5 - i * 0.015; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke();
      }
      c.restore();
    },
    /** Floating particles: motes, embers, snow, petals, ash, spores. */
    motes(c, t, kind, n, seed) {
      const R = rng(seed || 11);
      c.save(); if (kind !== "ash" && kind !== "snow") c.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const sx = R() * (W + OS * 2) - OS, sy = R() * (H + OS * 2) - OS, sp = 8 + R() * 22, ph = R() * TAU;
        let x = sx, y = sy;
        if (kind === "embers") { y = (sy - t * sp * 2.2) % (H + OS * 2); if (y < -OS) y += H + OS * 2; x += Math.sin(t + ph) * 12; }
        else if (kind === "snow" || kind === "ash") { y = (sy + t * sp) % (H + OS * 2) - OS; x += Math.sin(t * 0.8 + ph) * 16; }
        else if (kind === "petals") { y = (sy + t * sp * 1.2) % (H + OS * 2) - OS; x = (sx + t * sp * 0.8 + Math.sin(t + ph) * 20) % (W + OS * 2) - OS; }
        else { x += Math.sin(t * 0.4 + ph) * 18; y += Math.cos(t * 0.3 + ph) * 14; }
        const a = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.3 + ph));
        c.globalAlpha = a;
        if (kind === "embers") { c.fillStyle = i % 3 ? "#ffb14d" : "#ff6b3d"; c.fillRect(x, y, 2, 2); }
        else if (kind === "snow") { c.fillStyle = "#f4fbff"; c.beginPath(); c.arc(x, y, 1 + (i % 3) * 0.8, 0, TAU); c.fill(); }
        else if (kind === "ash") { c.fillStyle = "#b8a890"; c.fillRect(x, y, 2, 1.5); }
        else if (kind === "petals") { c.fillStyle = i % 2 ? "#ffb3d4" : "#ffe2ee"; c.save(); c.translate(x, y); c.rotate(t * 2 + ph); c.beginPath(); c.ellipse(0, 0, 3.5, 1.8, 0, 0, TAU); c.fill(); c.restore(); }
        else { const col = kind === "green" ? "#9bf0b8" : kind === "gold" ? "#ffe79a" : kind === "violet" ? "#d6a8ff" : "#bfe6ff"; c.fillStyle = col; c.shadowBlur = 8; c.shadowColor = col; c.beginPath(); c.arc(x, y, 1.2 + (i % 3) * 0.6, 0, TAU); c.fill(); }
      }
      c.restore();
    },
    vignette(c, a, col) {
      const g = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, col || `rgba(0,0,0,${a || 0.6})`);
      c.fillStyle = g; c.fillRect(-OS, -OS, W + OS * 2, H + OS * 2);
    },
    grade(c, col, a) { c.save(); c.globalCompositeOperation = "soft-light"; c.globalAlpha = a || 0.3; c.fillStyle = col; c.fillRect(-OS, -OS, W + OS * 2, H + OS * 2); c.restore(); },
    rimLight(c, x, y, r, col, a) { L.nebula(c, x, y, r, col, a || 0.35); },

    /* ---- story props ------------------------------------------------- */
    heartEngine(c, x, y, r, t, broken) {
      L.orb(c, x, y, r * 0.3, "#e8f7ff", broken ? "rgba(255,120,140,0.7)" : "rgba(140,220,255,0.75)", 0.7);
      c.save(); c.translate(x, y); c.lineCap = "round";
      // thin orbiting rings of light
      for (let i = 0; i < 4; i++) {
        c.save(); c.rotate(i * 0.8 + t * (0.12 + i * 0.05) * (i % 2 ? -1 : 1));
        c.strokeStyle = i % 2 ? "rgba(242,193,78,0.85)" : "rgba(143,230,255,0.9)"; c.lineWidth = 1.6; c.shadowBlur = 14; c.shadowColor = c.strokeStyle;
        const rr = r * (1 - i * 0.12);
        if (broken) { for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(0, 0, rr, k * 2.1, k * 2.1 + 1.1); c.stroke(); } }
        else { c.beginPath(); c.ellipse(0, 0, rr, rr * (0.28 + i * 0.12), 0, 0, TAU); c.stroke(); }
        c.restore();
      }
      // the crystal heart at the centre
      const p = 1 + Math.sin(t * 3) * 0.05;
      c.scale(p, p); c.shadowBlur = 20; c.shadowColor = broken ? "#ff8aa0" : "#bfe8ff";
      c.fillStyle = broken ? "#ffb0c0" : "#dff4ff";
      c.beginPath(); c.moveTo(0, -r * 0.34); c.lineTo(r * 0.2, 0); c.lineTo(0, r * 0.34); c.lineTo(-r * 0.2, 0); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,0.9)"; c.beginPath(); c.moveTo(0, -r * 0.3); c.lineTo(r * 0.07, 0); c.lineTo(0, r * 0.1); c.lineTo(-r * 0.07, 0); c.fill();
      c.shadowBlur = 0; c.restore();
    },
    compassHalf(c, x, y, s, col, dir, t) {
      c.save(); c.translate(x, y); c.scale(s, s);
      L.nebula(c, 0, 0, 40, col, 0.5);
      c.fillStyle = "#3a2c1e"; c.beginPath(); c.arc(0, 0, 15, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); c.fill();
      c.strokeStyle = "#f2c14e"; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 15, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); c.stroke();
      c.fillStyle = col; c.shadowBlur = 14; c.shadowColor = col;
      c.beginPath(); c.moveTo(0, -10); c.lineTo(dir * 7, 0); c.lineTo(0, 10); c.fill();
      c.restore();
    },
    compassWhole(c, x, y, s, t) {
      c.save(); c.translate(x, y); c.scale(s, s);
      L.nebula(c, 0, 0, 110, "rgba(220,245,255,0.9)", 0.55);
      L.rays(c, 0, 0, "rgba(255,240,200,0.7)", 16, 260, t, 0, 0.18);
      c.fillStyle = "#3a2c1e"; c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.fill();
      c.strokeStyle = "#f2c14e"; c.lineWidth = 4; c.shadowBlur = 20; c.shadowColor = "#f2c14e"; c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.stroke();
      c.lineWidth = 1.5; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.3; c.beginPath(); c.moveTo(Math.cos(a) * 28, Math.sin(a) * 28); c.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); c.stroke(); }
      c.rotate(Math.sin(t * 1.4) * 0.5);
      c.fillStyle = "#6ef0a0"; c.shadowColor = "#6ef0a0"; c.beginPath(); c.moveTo(0, -20); c.lineTo(5, 0); c.lineTo(-5, 0); c.fill();
      c.fillStyle = "#4fc3ff"; c.shadowColor = "#4fc3ff"; c.beginPath(); c.moveTo(0, 20); c.lineTo(5, 0); c.lineTo(-5, 0); c.fill();
      c.shadowBlur = 0; c.fillStyle = "#fff"; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
      c.restore();
    },
    hooded(c, x, y, s, t, lowered, glow) {
      c.save(); c.translate(x, y); c.scale(s, s);
      const sway = Math.sin(t * 1.6) * 3;
      if (glow) L.nebula(c, 0, -30, 80, glow, 0.35);
      c.fillStyle = "#171221";
      c.beginPath(); c.moveTo(-20, 0); c.quadraticCurveTo(-24 + sway, -30, -12, -46); c.lineTo(0, -62); c.lineTo(13, -46); c.quadraticCurveTo(26 + sway * 1.5, -24, 24 + sway * 2, 0); c.closePath(); c.fill();
      c.strokeStyle = "rgba(199,155,255,0.8)"; c.lineWidth = 1.2; c.stroke();
      if (lowered) { c.fillStyle = "#9b6a46"; c.beginPath(); c.arc(0, -53, 9, 0, TAU); c.fill(); c.fillStyle = "#d8d0e8"; c.beginPath(); c.arc(0, -58, 9, Math.PI, 0); c.fill(); }
      else { c.fillStyle = "#c79bff"; c.shadowBlur = 10; c.shadowColor = "#c79bff"; c.globalAlpha = 0.7 + Math.sin(t * 3) * 0.3; c.fillRect(-6, -52, 3.5, 2.5); c.fillRect(3, -52, 3.5, 2.5); }
      c.restore();
    },
    heartTree(c, x, y, s, t, bloom) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = "#3a2618";
      c.beginPath(); c.moveTo(-16, 0); c.quadraticCurveTo(-8, -60, -30, -120); c.lineTo(-18, -124); c.quadraticCurveTo(0, -80, 4, -130); c.lineTo(16, -128); c.quadraticCurveTo(8, -70, 34, -118); c.lineTo(42, -110); c.quadraticCurveTo(12, -60, 18, 0); c.fill();
      const R = rng(41);
      for (let i = 0; i < 26; i++) {
        const a = R() * TAU, d = R() * 90, px = Math.cos(a) * d * 1.3, py = -150 + Math.sin(a) * d * 0.55;
        c.fillStyle = bloom ? (i % 3 ? "#ffb3d4" : "#ff8ac0") : (i % 3 ? "#4fae5f" : "#3a8a4a");
        c.beginPath(); c.arc(px, py, 26 + R() * 18, 0, TAU); c.fill();
      }
      if (bloom) { L.nebula(c, 0, -150, 140, "rgba(255,200,230,0.8)", 0.3); }
      c.restore();
    },
    landmarkRow(c, y, col, s) {
      // the eight regions' landmarks along a horizon
      const xs = [0.06, 0.19, 0.31, 0.44, 0.56, 0.68, 0.81, 0.94].map(f => f * W);
      c.fillStyle = col; const k = s || 1;
      // geode
      for (const [dx, h, w] of [[-12, 60, 16], [0, 90, 20], [14, 55, 14]]) { c.beginPath(); c.moveTo(xs[0] + dx * k - w * k / 2, y); c.lineTo(xs[0] + dx * k, y - h * k); c.lineTo(xs[0] + dx * k + w * k / 2, y); c.fill(); }
      // broken tower
      c.fillRect(xs[1] - 10 * k, y - 100 * k, 20 * k, 100 * k); c.beginPath(); c.moveTo(xs[1] - 10 * k, y - 100 * k); c.lineTo(xs[1] - 4 * k, y - 114 * k); c.lineTo(xs[1] + 3 * k, y - 104 * k); c.lineTo(xs[1] + 10 * k, y - 108 * k); c.lineTo(xs[1] + 10 * k, y - 100 * k); c.fill();
      // world tree
      c.fillRect(xs[2] - 5 * k, y - 70 * k, 10 * k, 70 * k); for (const [dx, dy, r] of [[0, 90, 36], [-26, 74, 24], [26, 72, 26]]) { c.beginPath(); c.arc(xs[2] + dx * k, y - dy * k, r * k, 0, TAU); c.fill(); }
      // furnace
      c.fillRect(xs[3] - 26 * k, y - 34 * k, 52 * k, 34 * k); c.fillRect(xs[3] - 14 * k, y - 96 * k, 10 * k, 64 * k); c.fillRect(xs[3] + 6 * k, y - 80 * k, 9 * k, 50 * k);
      // peak
      c.beginPath(); c.moveTo(xs[4] - 70 * k, y); c.lineTo(xs[4] - 8 * k, y - 110 * k); c.lineTo(xs[4] + 6 * k, y - 100 * k); c.lineTo(xs[4] + 70 * k, y); c.fill();
      // ziggurat
      for (let i = 0; i < 5; i++) c.fillRect(xs[5] - (44 - i * 8) * k, y - (i + 1) * 16 * k, (88 - i * 16) * k, 17 * k);
      // floating citadel
      c.beginPath(); c.moveTo(xs[6] - 40 * k, y - 70 * k); c.lineTo(xs[6] + 40 * k, y - 70 * k); c.lineTo(xs[6], y - 30 * k); c.fill();
      for (const [dx, h] of [[-24, 26], [-8, 44], [8, 34], [24, 20]]) c.fillRect(xs[6] + (dx - 4) * k, y - (70 + h) * k, 8 * k, h * k);
      // heart spire
      c.beginPath(); c.moveTo(xs[7], y - 120 * k); c.lineTo(xs[7] + 14 * k, y); c.lineTo(xs[7] - 14 * k, y); c.fill();
    },
    island(c, x, y, s, top, rock, t) {
      c.save(); c.translate(x, y + Math.sin(t * 0.7 + x) * 4); c.scale(s, s);
      c.fillStyle = rock;
      c.beginPath(); c.moveTo(-56, 0); c.quadraticCurveTo(-40, 30, -18, 44); c.lineTo(-4, 78); c.lineTo(10, 46); c.quadraticCurveTo(40, 28, 56, 0); c.closePath(); c.fill();
      c.fillStyle = top;
      c.beginPath(); c.moveTo(-58, 2); c.quadraticCurveTo(-40, -14, -10, -12); c.quadraticCurveTo(20, -18, 58, 2); c.closePath(); c.fill();
      c.beginPath(); c.arc(-24, -16, 12, 0, TAU); c.arc(-8, -22, 14, 0, TAU); c.fill();
      c.fillStyle = "rgba(190,230,255,0.45)"; c.fillRect(34, 4, 4, 70 + Math.sin(t * 3) * 2);    // a little waterfall
      c.fillStyle = "rgba(190,230,255,0.2)"; c.fillRect(31, 60, 10, 20);
      c.restore();
    },
    crowd(c, t, base, seed, n) {
      const R = rng(seed || 5);
      for (let i = 0; i < (n || 14); i++) {
        const x = 60 + i * (W - 120) / (n || 14) + R() * 20, h = 26 + R() * 14, bob = Math.abs(Math.sin(t * 3 + i)) * 3;
        c.fillStyle = ["#4a3a5a", "#5a4a3a", "#3a4a5a", "#6a4a4a"][i % 4];
        c.beginPath(); c.moveTo(x - 9, base); c.lineTo(x - 6, base - h - bob); c.lineTo(x + 6, base - h - bob); c.lineTo(x + 9, base); c.fill();
        c.fillStyle = "#b4784c"; c.beginPath(); c.arc(x, base - h - 6 - bob, 6, 0, TAU); c.fill();
      }
    },
    lanterns(c, t, y, n) {
      c.strokeStyle = "rgba(40,30,20,0.8)"; c.lineWidth = 1; c.beginPath();
      for (let x = -OS; x <= W + OS; x += 10) c.lineTo(x, y + Math.sin(x / (W / 3) * Math.PI) * 30);
      c.stroke();
      for (let i = 0; i < (n || 12); i++) {
        const x = i * W / (n || 12) + 30, yy = y + Math.sin(x / (W / 3) * Math.PI) * 30 + 8;
        L.orb(c, x, yy, 4, ["#ffcf7a", "#ff9ac4", "#9bf0b8", "#a9d4ff"][i % 4], "rgba(255,200,120,0.6)", 0.35 + Math.sin(t * 2 + i) * 0.1);
      }
    },
  };

  /* =====================================================================
   * SCENES — one painter per story beat
   * =================================================================== */
  const S = {};

  // ---- The world before: the Heart Engine above its temple ------------
  S.heartWhole = (c, t) => {
    L.sky(c, ["#060a1e", "#101a3a", "#2a2a5a", "#5a3a6a"]);
    L.nebula(c, 700, 120, 260, "rgba(120,80,200,0.6)", 0.3); L.nebula(c, 180, 90, 200, "rgba(60,140,220,0.6)", 0.25);
    L.stars(c, t, 160, 3);
    L.aurora(c, t, ["rgba(110,240,190,0.9)", "rgba(120,160,255,0.8)"], 150, 36);
    L.range(c, 400, 120, "#1a2046", 11, 8); L.haze(c, 390, 60, "rgba(120,140,220,0.5)", 0.5);
    L.range(c, 450, 80, "#121634", 12, 10);
    // the temple spire
    c.fillStyle = "#0c0f24"; c.beginPath(); c.moveTo(430, 470); c.lineTo(462, 300); c.lineTo(498, 300); c.lineTo(530, 470); c.fill();
    c.fillRect(452, 280, 56, 22);
    L.heartEngine(c, 480, 210, 70 + Math.sin(t * 2) * 3, t, false);
    L.rays(c, 480, 210, "rgba(160,230,255,0.8)", 14, 420, t, 0, 0.14);
    L.range(c, 520, 50, "#080a18", 13, 12);
    L.motes(c, t, "blue", 40, 21);
    L.vignette(c, 0.6);
  };
  // ---- The shattering -----------------------------------------------------
  S.shatter = (c, t) => {
    L.sky(c, ["#1a0614", "#4a0e22", "#8a2030", "#2a0a14"]);
    L.stars(c, t, 50, 4, 200);
    const cx = 480, cy = 210, burst = Math.min(1, t / 1.2);
    L.nebula(c, cx, cy, 300 * burst + 60, "rgba(255,120,120,0.8)", 0.45);
    L.rays(c, cx, cy, "rgba(255,200,160,0.9)", 20, 520, t, 0, 0.2 * burst);
    // cracks through the sky
    c.save(); c.strokeStyle = "rgba(255,210,210,0.8)"; c.lineWidth = 2; c.shadowBlur = 16; c.shadowColor = "#ff8a8a";
    const R = rng(9);
    for (let i = 0; i < 7; i++) { let x = cx, y = cy; c.beginPath(); c.moveTo(x, y); const a = i * 0.9 + 0.3; for (let k = 0; k < 8; k++) { x += Math.cos(a + (R() - 0.5)) * 60 * burst; y += Math.sin(a + (R() - 0.5)) * 45 * burst; c.lineTo(x, y); } c.stroke(); }
    c.restore();
    // the shards fly out, trailing light
    for (let i = 0; i < 18; i++) {
      const a = i * 0.36 + 0.2, d = 20 + t * (70 + (i % 5) * 18);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7 + t * t * 6;
      const col = i % 3 === 0 ? "#ffd27f" : i % 3 === 1 ? "#8fe6ff" : "#c79bff";
      c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = col; c.globalAlpha = 0.5; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(cx + Math.cos(a) * d * 0.6, cy + Math.sin(a) * d * 0.42); c.stroke(); c.restore();
      c.save(); c.translate(x, y); c.rotate(t * 3 + i); c.fillStyle = col; c.shadowBlur = 14; c.shadowColor = col;
      c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 0); c.lineTo(0, 8); c.lineTo(-5, 0); c.fill(); c.restore();
    }
    L.heartEngine(c, cx, cy, 60 * (1 - burst * 0.5), t * 3, true);
    L.range(c, 440, 90, "#1a0810", 21, 12); L.range(c, 500, 50, "#0c0408", 22, 16);
    L.motes(c, t, "embers", 60, 23);
    L.vignette(c, 0.7);
  };
  // ---- A broken world -----------------------------------------------------
  S.ruinedWorld = (c, t) => {
    L.sky(c, ["#1c1420", "#3a2a30", "#7a5040", "#b07a50"]);
    L.orb(c, 700, 300, 26, "#ffd8a0", "rgba(255,170,100,0.6)", 0.5);
    L.range(c, 360, 90, "#3a2a34", 31, 6); L.haze(c, 350, 50, "rgba(200,150,120,0.5)", 0.5);
    L.ruins(c, 420, "#241a24", 32, 1);
    // smoke plumes
    c.save(); for (let k = 0; k < 3; k++) { const x0 = 160 + k * 300; for (let i = 0; i < 9; i++) { const y = 400 - i * 34 - (t * 12 % 34), r = 16 + i * 8; c.globalAlpha = 0.18 - i * 0.015; c.fillStyle = "#2a2028"; c.beginPath(); c.arc(x0 + Math.sin(i + t * 0.3) * 20 + i * 8, y, r, 0, TAU); c.fill(); } } c.restore();
    L.ruins(c, 480, "#140e16", 33, 1.3);
    L.motes(c, t, "ash", 90, 34);
    L.grade(c, "#ffb070", 0.2);
    L.vignette(c, 0.65);
  };
  // ---- A cavern and a glowing compass half -----------------------------
  S.cavern = (c, t, who) => {
    const col = who === 0 ? "#6ef0a0" : "#4fc3ff";
    L.caveBack(c, 4 + who, who === 0 ? "#142a30" : "#14223e");
    L.rays(c, who === 0 ? 300 : 660, -40, "rgba(170,210,255,0.5)", 5, 560, t, 0.5, 0.25);
    L.crystals(c, t, 470, 5 + who, [col, "#c79bff", "#8fe6ff"], 9, 1);
    L.caveFrame(c, "#070a16", 6 + who);
    L.ground(c, 470, "#0a0e1c", "#1e2a44");
    const hx = who === 0 ? 390 : 570;
    hero(c, who, hx, 470, "idle", t, who === 0 ? 1 : -1);
    L.compassHalf(c, hx + (who === 0 ? 80 : -80), 380 + Math.sin(t * 2) * 6, 1.8, col, who === 0 ? -1 : 1, t);
    L.motes(c, t, who === 0 ? "green" : "blue", 40, 40 + who);
    L.vignette(c, 0.75);
  };
  // ---- Two halves, two heroes -----------------------------------------------
  S.meeting = (c, t) => {
    L.caveBack(c, 50, "#1a1a3a");
    L.crystals(c, t, 470, 51, ["#6ef0a0", "#4fc3ff"], 7, 1.1);
    L.caveFrame(c, "#070a16", 52);
    L.ground(c, 470, "#0a0e1c", "#1e2a44");
    const gap = Math.max(70, 260 - t * 55);
    L.nebula(c, 480 - gap, 400, 120, "rgba(110,240,160,0.6)", 0.35); L.nebula(c, 480 + gap, 400, 120, "rgba(79,195,255,0.6)", 0.35);
    hero(c, 0, 480 - gap, 470, "walk", t, 1); hero(c, 1, 480 + gap, 470, "walk", t, -1);
    L.compassHalf(c, 480 - gap + 40, 360, 1.3, "#6ef0a0", -1, t); L.compassHalf(c, 480 + gap - 40, 360, 1.3, "#4fc3ff", 1, t);
    // the cavern shakes: falling pebbles
    c.fillStyle = "#3a4058"; for (let i = 0; i < 12; i++) { const x = (i * 83) % W, y = ((t * 260 + i * 97) % 520) - 40; c.fillRect(x, y, 3, 3); }
    L.motes(c, t, "blue", 30, 53);
    L.vignette(c, 0.75);
  };
  // ---- The compass awakens ------------------------------------------------
  S.compass = (c, t) => {
    L.caveBack(c, 60, "#1e1e46");
    L.caveFrame(c, "#070a16", 61);
    L.ground(c, 470, "#0a0e1c", "#1e2a44");
    L.compassWhole(c, 480, 250, 1.5 + Math.min(0.4, t * 0.1), t);
    hero(c, 0, 360, 470, "idle", t, 1); hero(c, 1, 600, 470, "idle", t, -1);
    L.motes(c, t, "gold", 70, 62);
    L.vignette(c, 0.6);
  };
  // ---- Out of the caves into dawn ----------------------------------------
  S.escape = (c, t) => {
    L.sky(c, ["#5a7ab0", "#e8b88a", "#ffd9a0"]);
    L.orb(c, 480, 320, 40, "#fff4d8", "rgba(255,220,160,0.9)", 0.7);
    L.rays(c, 480, 320, "rgba(255,230,180,0.8)", 12, 500, t, 0, 0.18);
    L.range(c, 380, 70, "#8a7aa0", 71, 4); L.forest(c, 420, "#4a5a6a", 72, 0.7);
    // cave mouth frame
    c.fillStyle = "#0b0e18"; c.beginPath(); c.rect(-OS, -OS, W + OS * 2, H + OS * 2);
    c.ellipse(480, 330, 330 + t * 8, 250 + t * 6, 0, 0, TAU, true); c.fill("evenodd");
    L.ground(c, 470, "#0b0e18");
    hero(c, 0, 380 + t * 10, 470, "run", t, 1); hero(c, 1, 450 + t * 12, 470, "run", t, 1);
    L.motes(c, t, "gold", 30, 73);
    L.vignette(c, 0.5);
  };
  // ---- Ruins on the horizon, the compass points ---------------------------
  S.ruinsAhead = (c, t) => {
    L.sky(c, ["#2a3f6a", "#8a7ab0", "#f0b070", "#ffd9a0"]);
    L.orb(c, 760, 330, 30, "#fff0c8", "rgba(255,210,150,0.8)", 0.6);
    L.range(c, 360, 80, "#6a5a88", 81, 5); L.haze(c, 350, 40, "rgba(255,200,160,0.5)", 0.5);
    L.ruins(c, 380, "#4a3a60", 82, 0.8);
    L.range(c, 440, 60, "#2a2440", 83, 8);
    L.ground(c, 470, "#1a1428");
    hero(c, 0, 330, 470, "idle", t, 1); hero(c, 1, 390, 470, "idle", t, 1);
    c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.45 + Math.sin(t * 4) * 0.2;
    c.strokeStyle = "#f2c14e"; c.lineWidth = 3; c.shadowBlur = 16; c.shadowColor = "#f2c14e";
    c.beginPath(); c.moveTo(380, 390); c.quadraticCurveTo(520, 300, 640, 330); c.stroke(); c.restore();
    L.motes(c, t, "gold", 25, 84);
    L.vignette(c, 0.5);
  };
  // ---- The hooded watcher -------------------------------------------------
  S.hooded = (c, t) => {
    L.sky(c, ["#0a0a1e", "#1a1a3a", "#3a2a5a"]);
    L.stars(c, t, 90, 91, 300);
    L.orb(c, 700, 150, 44, "#e8e4ff", "rgba(200,180,255,0.6)", 0.5);
    L.range(c, 380, 90, "#1a1834", 92, 6);
    L.ruins(c, 420, "#12102a", 93, 0.9);
    // the cliff and the figure against the moon
    c.fillStyle = "#07060e"; c.beginPath(); c.moveTo(560, H + OS); c.lineTo(600, 250); c.lineTo(760, 240); c.lineTo(820, H + OS); c.fill();
    L.hooded(c, 690, 244, 1.6, t, false, "rgba(199,155,255,0.5)");
    L.ground(c, 480, "#07060e");
    hero(c, 0, 250, 480, "idle", t, 1, 1.4); hero(c, 1, 290, 480, "idle", t, 1, 1.4);
    L.motes(c, t, "violet", 25, 94);
    L.vignette(c, 0.7);
  };
  // ---- Murals in the ruins --------------------------------------------------
  S.murals = (c, t) => {
    L.sky(c, ["#1a1420", "#2a2030"]);
    c.fillStyle = "#3a3040"; c.fillRect(-OS, -OS, W + OS * 2, H + OS * 2);
    for (let y = 0; y < H; y += 32) for (let x = (y / 32) % 2 * 24; x < W; x += 48) { c.fillStyle = "rgba(0,0,0,0.15)"; c.fillRect(x, y, 47, 31); }
    // the mural: the heart, the hands that broke it
    c.save(); c.globalAlpha = 0.85;
    c.fillStyle = "#6a5040"; c.fillRect(180, 60, 600, 300);
    c.strokeStyle = "#f2c14e"; c.lineWidth = 3; c.strokeRect(180, 60, 600, 300);
    L.heartEngine(c, 480, 200, 50, t * 0.3, false);
    c.fillStyle = "#2a1a14";
    for (const dx of [-1, 1]) { c.beginPath(); c.moveTo(480 + dx * 190, 330); c.quadraticCurveTo(480 + dx * 120, 250, 480 + dx * 60, 220); c.lineTo(480 + dx * 70, 240); c.quadraticCurveTo(480 + dx * 130, 270, 480 + dx * 200, 340); c.fill(); }
    c.fillStyle = "#1a1210"; c.beginPath(); c.arc(640, 120, 24, 0, TAU); c.fill();   // the scratched-out face
    c.strokeStyle = "#8a6a50"; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(620 + i * 6, 100); c.lineTo(626 + i * 6, 142); c.stroke(); }
    c.restore();
    L.ground(c, 470, "#1a1420");
    hero(c, 0, 400, 470, "idle", t, 1); hero(c, 1, 560, 470, "idle", t, -1);
    L.nebula(c, 480, 380, 260, "rgba(255,190,120,0.5)", 0.25);
    L.motes(c, t, "gold", 30, 101);
    L.vignette(c, 0.75);
  };
  // ---- Forest breathes again ------------------------------------------------
  S.forest = (c, t, guardian) => {
    L.sky(c, ["#08180e", "#12301c", "#2a5a2a", "#6aae5a"]);
    L.rays(c, 600, -40, "rgba(220,255,180,0.6)", 6, 620, t, 0.7, 0.2);
    L.forest(c, 330, "#1a3a22", 111, 1.2, true); L.haze(c, 330, 50, "rgba(160,220,140,0.4)", 0.4);
    L.forest(c, 400, "#0e2414", 112, 1.6, true);
    if (guardian) {
      // the Forest Guardian: a great antlered spirit of light
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.6 + Math.sin(t) * 0.1;
      c.strokeStyle = "#caff9a"; c.lineWidth = 3; c.shadowBlur = 20; c.shadowColor = "#caff9a";
      c.beginPath(); c.ellipse(480, 250, 50, 70, 0, 0, TAU); c.stroke();
      for (const d of [-1, 1]) { c.beginPath(); c.moveTo(480 + d * 20, 185); c.lineTo(480 + d * 50, 130); c.lineTo(480 + d * 80, 120); c.moveTo(480 + d * 50, 130); c.lineTo(480 + d * 56, 96); c.stroke(); }
      c.fillStyle = "#e8ffd0"; c.fillRect(466, 236, 6, 4); c.fillRect(488, 236, 6, 4);
      c.restore();
      L.compassHalf(c, 480, 340 + Math.sin(t * 2) * 5, 1.4, "#f2c14e", 1, t);
    }
    L.ground(c, 470, "#081a0e", "#2a5a2a");
    hero(c, 0, 380, 470, guardian ? "celebrate" : "idle", t, 1); hero(c, 1, 580, 470, guardian ? "celebrate" : "idle", t, -1);
    // wisps
    for (let i = 0; i < 8; i++) { const a = t * 0.6 + i * 0.8; L.orb(c, 480 + Math.cos(a) * (180 + i * 10), 330 + Math.sin(a * 1.3) * 60, 3, "#e8ffd0", "rgba(200,255,160,0.7)", 0.4); }
    L.motes(c, t, "green", 50, 113);
    L.vignette(c, 0.6);
  };
  // ---- The temple gates open --------------------------------------------------
  S.templeGates = (c, t) => {
    L.sky(c, ["#1a1410", "#3a2a18", "#6a4a24"]);
    const open = Math.min(1, t / 3);
    L.nebula(c, 480, 280, 260, "rgba(255,210,120,0.9)", 0.3 + open * 0.4);
    L.rays(c, 480, 280, "rgba(255,220,140,0.9)", 12, 500, t, 1.2, 0.2 * open);
    c.fillStyle = "#2a1e12"; c.fillRect(-OS, 100, 300, H); c.fillRect(W - 240, 100, 300, H);
    c.fillStyle = "#3a2a18"; for (let i = 0; i < 6; i++) c.fillRect(-OS + i * 10, 100 - i * 16, 300 + 100 - i * 20, 16);
    c.fillStyle = "#4a3620"; c.fillRect(300 - open * 120, 120, 180, 350); c.fillRect(480 + open * 120, 120, 180, 350);
    c.strokeStyle = "#f2c14e"; c.lineWidth = 2; c.strokeRect(310 - open * 120, 140, 160, 320); c.strokeRect(490 + open * 120, 140, 160, 320);
    L.ground(c, 470, "#1a120a", "#6a4a24");
    hero(c, 0, 440, 470, "idle", t, 1); hero(c, 1, 520, 470, "idle", t, -1);
    L.motes(c, t, "gold", 40, 121);
    L.vignette(c, 0.6);
  };
  // ---- The temple lifts into the sky ------------------------------------------
  S.templeRising = (c, t) => {
    L.sky(c, ["#2a4a8a", "#7fb0ff", "#dfefff"]);
    L.mist(c, t, 420, "#ffffff", 0.4, 20); L.mist(c, t * 1.3, 470, "#e8f0ff", 0.5, 30);
    const lift = Math.min(160, t * 30);
    c.save(); c.translate(0, -lift);
    c.fillStyle = "#6a5238"; c.beginPath(); c.moveTo(280, 420); c.lineTo(680, 420); c.lineTo(560, 540); c.lineTo(480, 620); c.lineTo(400, 540); c.fill();
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? "#8a6c48" : "#7a5e3e"; c.fillRect(330 + i * 16, 420 - (i + 1) * 30, 300 - i * 32, 31); }
    c.fillStyle = "#f2c14e"; c.fillRect(470, 250, 20, 20);
    // falling rocks from its base
    c.fillStyle = "#4a3a28"; for (let i = 0; i < 10; i++) { const y = 540 + ((t * 120 + i * 50) % 200); c.fillRect(400 + i * 17, y, 6, 6); }
    c.restore();
    L.mist(c, t * 0.8, 520, "#ffffff", 0.55, 14);
    L.motes(c, t, "gold", 20, 131);
    L.vignette(c, 0.4);
  };
  // ---- The final shard: the compass whole in the sky --------------------------
  S.finalShard = (c, t) => {
    L.sky(c, ["#182448", "#4a6ab0", "#9fc8ff"]);
    L.island(c, 180, 300, 1, "#8fd08a", "#6a6f96", t); L.island(c, 800, 250, 0.7, "#8fd08a", "#6a6f96", t);
    L.mist(c, t, 460, "#ffffff", 0.35, 10);
    L.compassWhole(c, 480, 230, 1.3, t);
    L.ground(c, 470, "#4a4e70", "#8fd08a");
    hero(c, 0, 380, 470, "idle", t, 1); hero(c, 1, 580, 470, "idle", t, -1);
    L.motes(c, t, "gold", 40, 141);
    L.vignette(c, 0.45);
  };
  // ---- The guardian reveals itself (classic chapter 5) ------------------------
  S.guardianReveal = (c, t) => {
    L.sky(c, ["#0a0a1e", "#2a1a4a", "#5a3a7a"]);
    L.rays(c, 480, -40, "rgba(230,210,255,0.8)", 7, 600, t, 0.6, 0.25);
    L.hooded(c, 480, 450, 2.4, t, t > 2.5, "rgba(230,210,255,0.6)");
    L.ground(c, 470, "#0a0814", "#3a2a5a");
    hero(c, 0, 240, 470, "idle", t, 1); hero(c, 1, 720, 470, "idle", t, -1);
    L.motes(c, t, "violet", 40, 151);
    L.vignette(c, 0.7);
  };
  // ---- The world heals (grey to green over time) --------------------------------
  S.worldHeals = (c, t) => {
    const k = Math.min(1, t / 5);
    const mix = (a, b) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
    L.sky(c, [mix("#3a3440", "#2a5a9a"), mix("#6a5a5a", "#9fd8ff"), mix("#8a7060", "#ffe8b0")]);
    L.orb(c, 760, 200, 36, "#fff4d8", "rgba(255,230,170,0.8)", 0.3 + k * 0.5);
    L.range(c, 360, 90, mix("#4a4048", "#5a8a6a"), 161, 5); L.haze(c, 360, 50, "rgba(255,255,255,0.5)", 0.3);
    L.forest(c, 410, mix("#3a3038", "#3a8a4a"), 162, 1.1, true);
    L.ground(c, 460, mix("#2a2428", "#2f704a"), mix("#3a3038", "#6ac46a"));
    // flowers popping up
    const R = rng(163);
    for (let i = 0; i < 40; i++) { const x = R() * W, y = 470 + R() * 60, b = U_clamp((k * 1.3 - R() * 0.8) * 3, 0, 1); if (b <= 0) continue; c.fillStyle = ["#ff8ac0", "#ffe79a", "#a9d4ff", "#ffffff"][i % 4]; c.beginPath(); c.arc(x, y, 3 * b, 0, TAU); c.fill(); }
    L.motes(c, t, "gold", 30, 164);
    L.vignette(c, 0.45);
  };
  // ---- Guardians return to their posts -------------------------------------------
  S.guardiansReturn = (c, t) => {
    L.sky(c, ["#2a3f6a", "#7aa0c0", "#c8e8b0"]);
    L.range(c, 360, 70, "#5a7a6a", 171, 5);
    L.ground(c, 430, "#2f704a", "#6ac46a");
    for (let i = 0; i < 4; i++) {
      const x = 170 + i * 205;
      L.hooded(c, x, 440, 1.5, t + i, true, "rgba(155,240,184,0.4)");
      L.orb(c, x, 356, 3, "#9bf0b8", "rgba(155,240,184,0.8)", 0.4);
    }
    L.motes(c, t, "green", 40, 172);
    L.vignette(c, 0.45);
  };
  // ---- Title card: "Years later" ----------------------------------------------
  S.yearsLater = (c, t) => {
    L.sky(c, ["#1a2450", "#6a5a8a", "#e8a86a"]);
    L.orb(c, 480, 480, 60, "#fff0c8", "rgba(255,200,140,0.8)", 0.6);
    L.range(c, 470, 60, "#2a2440", 181, 4);
    c.save(); c.textAlign = "center"; c.globalAlpha = Math.min(1, t / 1.2);
    c.fillStyle = "#f6ecd2"; c.font = "700 34px 'Cinzel', Georgia, serif"; c.shadowBlur = 18; c.shadowColor = "#f2c14e";
    c.fillText("Years later…", 480, 250); c.restore();
  };
  // ---- The proposal beneath the Heart Tree --------------------------------------
  S.proposal = (c, t, yes) => {
    L.sky(c, ["#2a3f6a", "#c07a8a", "#f0c07a"]);
    L.orb(c, 760, 330, 34, "#fff4d8", "rgba(255,210,170,0.8)", 0.5);
    L.range(c, 400, 60, "#6a5a7a", 191, 4);
    L.heartTree(c, 480, 460, 1.3, t, true);
    L.ground(c, 460, "#2f704a", "#6ac46a");
    if (yes) {
      hero(c, 0, 440, 460, "celebrate", t, 1); hero(c, 1, 520, 460, "celebrate", t, -1);
      for (let i = 0; i < 30; i++) { const a = t * 2 + i; L.orb(c, 480 + Math.cos(a) * (40 + i * 8), 300 + Math.sin(a * 1.3) * 90, 1.6, i % 2 ? "#f2c14e" : "#ff9ac4", "rgba(255,200,220,0.6)", 0.3); }
    } else {
      hero(c, 0, 440, 460, "push", t, 1); hero(c, 1, 520, 460, "idle", t, -1);
      L.orb(c, 470, 410, 2.5, "#fff", "rgba(255,240,255,0.9)", 0.5);          // the ring
    }
    L.motes(c, t, "petals", 60, 192);
    L.vignette(c, 0.4);
  };
  // ---- The wedding ------------------------------------------------------------------
  S.wedding = (c, t) => {
    L.sky(c, ["#2a3f6a", "#c07a8a", "#f0c07a"]);
    L.heartTree(c, 480, 470, 1.6, t, true);
    L.lanterns(c, t, 120, 14);
    L.ground(c, 470, "#2f704a", "#6ac46a");
    L.crowd(c, t, 470, 201, 16);
    hero(c, 0, 450, 470, "celebrate", t, 1); hero(c, 1, 510, 470, "celebrate", t, -1);
    L.motes(c, t, "petals", 80, 202);
    L.vignette(c, 0.4);
  };
  // ---- The rebuilt kingdom ------------------------------------------------------------
  S.kingdom = (c, t) => {
    L.sky(c, ["#3a6ab0", "#9fd8ff", "#e8f4ff"]);
    L.island(c, 150, 120, 0.8, "#8fd08a", "#7a80a8", t); L.island(c, 820, 90, 0.6, "#8fd08a", "#7a80a8", t);
    // city skyline with banners
    const R = rng(211);
    for (let i = 0; i < 12; i++) { const x = i * 85 - 20, h = 90 + R() * 120; c.fillStyle = i % 2 ? "#c9d2e0" : "#b0bad0"; c.fillRect(x, 440 - h, 60, h); c.fillStyle = "#7a5a9a"; c.beginPath(); c.moveTo(x - 6, 440 - h); c.lineTo(x + 30, 440 - h - 30); c.lineTo(x + 66, 440 - h); c.fill();
      c.fillStyle = i % 3 ? "#4fc3ff" : "#6ef0a0"; c.fillRect(x + 28, 440 - h - 58, 2, 28); c.beginPath(); c.moveTo(x + 30, 440 - h - 58); c.lineTo(x + 46 + Math.sin(t * 3 + i) * 3, 440 - h - 52); c.lineTo(x + 30, 440 - h - 46); c.fill(); }
    L.ground(c, 440, "#6a7a5a", "#8fd08a");
    hero(c, 0, 440, 470, "idle", t, 1); hero(c, 1, 500, 470, "idle", t, -1);
    hero(c, 1, 280 + Math.sin(t * 2) * 60, 470, "run", t, Math.cos(t * 2) > 0 ? 1 : -1, 1.3);
    hero(c, 0, 700 - Math.sin(t * 2) * 60, 470, "run", t, Math.cos(t * 2) > 0 ? -1 : 1, 1.3);
    L.motes(c, t, "gold", 20, 212);
    L.vignette(c, 0.35);
  };
  // ---- The camera rises into the stars --------------------------------------------------
  S.rise = (c, t) => {
    const r = Math.min(1, t / 5);
    L.sky(c, ["#05040a", "#101838", "#2a3f6a"]);
    L.stars(c, t, Math.floor(40 + r * 140), 221);
    c.save(); c.translate(0, r * 360);
    L.heartTree(c, 480, 470, 1.3, t, true);
    L.ground(c, 470, "#2f704a", "#6ac46a");
    hero(c, 0, 450, 470, "idle", t, 1); hero(c, 1, 510, 470, "idle", t, -1);
    c.restore();
    L.aurora(c, t, ["rgba(110,240,190,0.9)", "rgba(200,140,255,0.8)"], 180 - r * 60, 40);
    L.vignette(c, 0.5);
  };
  // ---- Credits card ------------------------------------------------------------------------
  S.credits = (c, t) => {
    L.sky(c, ["#05040a", "#0b1020", "#1a1838"]);
    L.stars(c, t, 160, 231);
    L.nebula(c, 480, 260, 300, "rgba(120,100,220,0.6)", 0.3);
    c.save(); c.textAlign = "center";
    c.fillStyle = "#f2c14e"; c.font = "800 44px 'Cinzel', serif"; c.shadowBlur = 24; c.shadowColor = "#f2c14e";
    c.fillText("ECHOES OF AETHER", 480, 250); c.shadowBlur = 0;
    c.fillStyle = "#e8dcc0"; c.font = "16px 'MedievalSharp', serif"; c.fillText("for Nichols & Nibihah, who never let go", 480, 292);
    c.font = "12px 'Segoe UI', sans-serif"; c.fillStyle = "#8f9ac2"; c.fillText("design · code · art · music · made together", 480, 326);
    c.restore();
  };
  // ---- A second star ----------------------------------------------------------------------
  S.secondStar = (c, t) => {
    L.sky(c, ["#05040a", "#0b1020", "#182040"]);
    L.stars(c, t, 90, 241, 300);
    L.mist(c, t, 420, "#2a3050", 0.6, 6); L.mist(c, t * 1.2, 470, "#1a2040", 0.7, 9);
    const p = 0.5 + Math.sin(t * 2) * 0.3;
    L.orb(c, 800, 200, 6, "#fff", "rgba(199,155,255,0.9)", p);
    L.rays(c, 800, 200, "rgba(199,155,255,0.8)", 8, 110, t, 0, 0.35 * p);
    L.nebula(c, 800, 200, 90, "rgba(199,155,255,0.7)", 0.3 * p);
    L.vignette(c, 0.7);
  };
  // ---- Two little companions join (classic chapter 2) ---------------------------------------
  S.companions = (c, t) => {
    L.sky(c, ["#141a2c", "#8a6a70", "#e8b86a"]);
    L.ruins(c, 420, "#2a2030", 251, 0.9);
    L.ground(c, 470, "#1a1428", "#3a2a40");
    hero(c, 0, 360, 470, "idle", t, 1); hero(c, 1, 600, 470, "idle", t, -1);
    // Nova, the white cat trailing rainbows
    c.save(); c.translate(440, 462); c.scale(2, 2);
    c.fillStyle = "#f0e6da"; c.beginPath(); c.ellipse(0, 2, 8, 5, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(7, -3, 4.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(5, -6); c.lineTo(6, -11); c.lineTo(8, -6); c.moveTo(8, -6); c.lineTo(10, -10); c.lineTo(11, -5); c.fill();
    c.strokeStyle = "#f0e6da"; c.lineWidth = 2; c.beginPath(); c.moveTo(-7, 1); c.quadraticCurveTo(-14, Math.sin(t * 4) * 4 - 4, -13, -8); c.stroke();
    c.fillStyle = "#4fc3ff"; c.fillRect(7, -4, 2, 2); c.restore();
    const rb = ["#ff6b6b", "#ffb14d", "#f2e14e", "#6ef0a0", "#4fc3ff", "#c07bff"];
    c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 6; i++) { c.fillStyle = rb[i]; c.globalAlpha = 0.6; c.fillRect(410 - i * 12, 462 + Math.sin(t * 3 + i) * 3, 8, 5); } c.restore();
    // Pip, the round frog that walks in falling stars
    c.save(); c.translate(530, 460 - Math.abs(Math.sin(t * 5)) * 14); c.scale(2, 2);
    c.fillStyle = "#5fae4f"; c.beginPath(); c.ellipse(0, 3, 7, 4.5, 0, 0, TAU); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(-2, -4, 2.4, 0, TAU); c.arc(2, -4, 2.4, 0, TAU); c.fill();
    c.fillStyle = "#1a1220"; c.fillRect(-2.8, -4.8, 1.7, 1.7); c.fillRect(1.2, -4.8, 1.7, 1.7); c.restore();
    for (let i = 0; i < 6; i++) L.orb(c, 550 + i * 14, 450 + Math.sin(t * 2 + i * 2) * 8, 1.5, i % 2 ? "#fff" : "#f2c14e", "rgba(255,230,150,0.7)", 0.4);
    L.motes(c, t, "gold", 30, 252);
    L.vignette(c, 0.55);
  };
  // ---- The Keeper at the Heart (open-world ending) --------------------------------------------
  S.keeper = (c, t, beat) => {
    L.sky(c, ["#0a0414", "#1a0a2e", "#3a1a5c", "#5a2a7c"]);
    L.stars(c, t, 90, 261, 280);
    L.heartEngine(c, 480, 170, 60, t, beat < 3);
    L.range(c, 420, 60, "#1a0e2e", 262, 8);
    L.ground(c, 470, "#0e081a", "#3a1a5c");
    const kx = beat >= 3 ? 700 : 600;
    L.hooded(c, kx, 470, 2, t, beat >= 2, "rgba(199,155,255,0.45)");
    if (beat >= 1) {
      const n = 8, sp = beat >= 3 ? t * 1.6 : t * 0.8, cx = beat >= 3 ? 480 : kx, cy = beat >= 3 ? 170 + (1 - Math.min(1, t / 3)) * 150 : 330;
      for (let i = 0; i < n; i++) { const a = sp + i / n * TAU, r = beat >= 3 ? 80 * (1 - Math.min(0.8, t / 4)) : 70; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.4;
        c.save(); c.translate(x, y); c.fillStyle = "#c79bff"; c.shadowBlur = 16; c.shadowColor = "#c79bff"; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 0); c.lineTo(0, 9); c.lineTo(-6, 0); c.fill(); c.restore(); }
    }
    hero(c, 0, 330, 470, beat >= 3 ? "celebrate" : "idle", t, 1); hero(c, 1, 400, 470, beat >= 3 ? "celebrate" : "idle", t, 1);
    L.motes(c, t, "violet", 40, 263);
    L.vignette(c, 0.7);
  };

  // a tiny clamp without depending on GG.util load order
  function U_clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  GG.PAINT = Object.assign(S, { lib: L });
})(window);
