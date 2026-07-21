/* =========================================================================
 * sprites.js — character art imported 1:1 from the player's Figma file
 * -------------------------------------------------------------------------
 * Source: "Echoes of Aether — Character Sprites" (Figma). Every rect below
 * is a rectangle from that file, in Figma pixel coordinates. The renderer
 * scales each sprite so its full height fits the entity's hitbox height,
 * anchored feet-centre, and flips it horizontally to face the way the
 * entity is moving (art faces RIGHT).
 *
 * Rect fields: x, y, w, h, c (fill), glow (optional halo colour),
 *              g (optional animation group):
 *   legL/legR — swing with the run cycle      armF/armB — arm swing + lift
 *   braid     — sways behind Nibihah          hairTop   — leans in the wind
 *   eye       — squashes shut on blinks
 * ========================================================================= */
(function (GG) {
  "use strict";

  const R = (x, y, w, h, c, g, glow) => ({ x, y, w, h, c, g, glow });

  const NICHOLS = {
    w: 240, h: 340,
    // where idle-flourish props (wrench, compass) appear: gauntlet centre
    armAnchor: { x: 200, y: 220 },
    rects: [
      R(30, 160, 30, 70, "#28603a", "armB"),
      R(70, 250, 40, 50, "#2f3a4e", "legL"), R(70, 250, 10, 50, "#222a3a", "legL"),
      R(130, 250, 40, 50, "#2f3a4e", "legR"), R(130, 250, 10, 50, "#222a3a", "legR"),
      R(60, 300, 50, 40, "#40301e", "legL"), R(60, 300, 50, 10, "#a8b2c4", "legL"),
      R(130, 300, 50, 40, "#40301e", "legR"), R(130, 300, 50, 10, "#a8b2c4", "legR"),
      R(70, 150, 100, 80, "#e8dcc0"),
      R(50, 150, 40, 100, "#3f8f52"), R(50, 150, 10, 100, "#28603a"),
      R(150, 150, 40, 100, "#3f8f52"), R(180, 150, 10, 100, "#5fb374"),
      R(50, 230, 140, 20, "#6b4526"), R(110, 230, 20, 20, "#8f6236"),
      R(180, 160, 30, 40, "#b4784c", "armF"),
      R(180, 200, 40, 40, "#cfd8e6", "armF"),
      R(190, 210, 20, 20, "#7ef7c0", "armF", "#9cf0b8"),
      R(110, 140, 30, 10, "#b4784c"),
      R(70, 70, 100, 70, "#b4784c"), R(70, 70, 20, 70, "#8d5a36"), R(140, 80, 20, 50, "#cf9163"),
      R(60, 40, 120, 30, "#2a1c14"),
      R(70, 20, 30, 20, "#2a1c14", "hairTop"), R(110, 10, 30, 30, "#2a1c14", "hairTop"), R(150, 20, 30, 20, "#2a1c14", "hairTop"),
      R(60, 70, 30, 40, "#2a1c14"), R(60, 70, 60, 10, "#2a1c14"),
      R(80, 50, 60, 10, "#4a3423"),
      // Eye 1 (back)
      R(114, 90, 8, 8, "#f2f6ff", "eye"), R(122, 90, 8, 8, "#3fe07c", "eye", "#80f2b8"),
      R(114, 98, 8, 8, "#f2f6ff", "eye"), R(122, 98, 8, 8, "#f2f6ff", "eye"),
      // Eye 2 (front)
      R(144, 90, 8, 8, "#f2f6ff", "eye"), R(152, 90, 8, 8, "#3fe07c", "eye", "#80f2b8"),
      R(144, 98, 8, 8, "#f2f6ff", "eye"), R(152, 98, 8, 8, "#f2f6ff", "eye"),
    ],
  };

  const NIBIHAH = {
    w: 200, h: 280,
    armAnchor: { x: 155, y: 175 },
    rects: [
      R(30, 140, 20, 50, "#28527c", "armB"),
      R(30, 110, 30, 10, "#e8c65c", "braid"),
      R(30, 120, 30, 30, "#241812", "braid"), R(40, 150, 30, 30, "#241812", "braid"), R(50, 180, 20, 20, "#241812", "braid"),
      R(50, 160, 10, 10, "#3d2a1c", "braid"), R(55, 195, 20, 10, "#e8c65c", "braid"),
      R(65, 195, 30, 50, "#4f86c6", "legL"), R(65, 195, 10, 50, "#28527c", "legL"),
      R(105, 200, 30, 50, "#4f86c6", "legR"), R(105, 200, 10, 50, "#28527c", "legR"),
      R(65, 215, 30, 10, "#e8c65c", "legL"), R(105, 220, 30, 10, "#e8c65c", "legR"),
      R(55, 245, 40, 30, "#40301e", "legL"), R(55, 245, 40, 10, "#e8c65c", "legL"),
      R(105, 250, 40, 30, "#40301e", "legR"), R(105, 250, 40, 10, "#e8c65c", "legR"),
      R(50, 130, 90, 70, "#4f86c6"),
      R(50, 160, 10, 30, "#28527c"), R(130, 160, 10, 30, "#28527c"),
      R(60, 140, 80, 20, "#b8c2d4"),
      R(60, 190, 80, 10, "#e8c65c"),
      R(140, 140, 30, 30, "#b4784c", "armF"),
      R(140, 170, 30, 10, "#e8c65c", "armF"), R(140, 190, 30, 10, "#dfe8f4", "armF"),
      R(90, 120, 20, 10, "#b4784c"),
      R(50, 60, 90, 60, "#b4784c"), R(50, 60, 20, 60, "#8d5a36"), R(110, 70, 20, 40, "#cf9163"),
      R(120, 100, 10, 10, "#e8c65c"),
      R(40, 30, 110, 30, "#241812"),
      R(50, 10, 40, 20, "#241812", "hairTop"), R(100, 20, 30, 10, "#241812", "hairTop"),
      R(40, 60, 30, 60, "#241812"), R(40, 60, 50, 10, "#241812"),
      R(50, 40, 50, 10, "#3d2a1c"),
      // Eye 1 (back)
      R(89, 74, 8, 8, "#f2f6ff", "eye"), R(97, 74, 8, 8, "#4fc3ff", "eye", "#4fc2ff"),
      R(89, 82, 8, 8, "#f2f6ff", "eye"), R(97, 82, 8, 8, "#4fc3ff", "eye", "#4fc2ff"),
      // Eye 2 (front)
      R(117, 74, 8, 8, "#f2f6ff", "eye"), R(125, 74, 8, 8, "#4fc3ff", "eye", "#4fc2ff"),
      R(117, 82, 8, 8, "#f2f6ff", "eye"), R(125, 82, 8, 8, "#4fc3ff", "eye", "#4fc2ff"),
    ],
  };

  const NOVA = {
    w: 144, h: 64,
    rects: [
      R(80, 0, 8, 8, "#a9d4ff"), R(112, 0, 8, 8, "#a9d4ff"),
      R(80, 8, 16, 8, "#a9d4ff"), R(104, 8, 16, 8, "#a9d4ff"),
      R(16, 16, 16, 8, "#5fb8ff", null, "#5eb8ff"), R(80, 16, 48, 8, "#f6f1e9"),
      R(8, 24, 16, 8, "#5fb8ff", null, "#5eb8ff"), R(24, 24, 8, 8, "#a9d4ff"),
      R(32, 24, 8, 8, "#5fb8ff", null, "#5eb8ff"), R(56, 24, 72, 8, "#f6f1e9"),
      R(8, 32, 8, 8, "#5fb8ff", null, "#5eb8ff"), R(16, 32, 8, 8, "#a9d4ff"),
      R(24, 32, 8, 8, "#5fb8ff", null, "#5eb8ff"), R(48, 32, 56, 8, "#f6f1e9"),
      R(104, 32, 8, 8, "#4fc3ff", "eye"), R(112, 32, 8, 8, "#f6f1e9"),
      R(120, 32, 8, 8, "#ff9ac4"), R(128, 32, 8, 8, "#f6f1e9"),
      R(16, 40, 16, 8, "#5fb8ff", null, "#5eb8ff"), R(40, 40, 80, 8, "#f6f1e9"), R(120, 40, 16, 8, "#ded4c6"),
      R(40, 48, 8, 8, "#ded4c6"), R(48, 48, 64, 8, "#f6f1e9"), R(112, 48, 8, 8, "#ded4c6"),
      R(40, 56, 16, 8, "#f6f1e9", "legL"), R(72, 56, 16, 8, "#f6f1e9", "legR"), R(104, 56, 8, 8, "#f6f1e9", "legR"),
    ],
  };

  const PIP = {
    w: 112, h: 48,
    rects: [
      R(32, 0, 8, 8, "#ffffff", "eye"), R(40, 0, 8, 8, "#1a1220", "eye"),
      R(64, 0, 8, 8, "#ffffff", "eye"), R(72, 0, 8, 8, "#1a1220", "eye"),
      R(32, 8, 16, 8, "#ffffff", "eye"), R(64, 8, 16, 8, "#ffffff", "eye"),
      R(16, 16, 8, 8, "#6b4526"), R(24, 16, 16, 8, "#5fc45a"), R(40, 16, 40, 8, "#3f9e46"), R(80, 16, 8, 8, "#5fc45a"),
      R(16, 24, 8, 8, "#6b4526"), R(24, 24, 8, 8, "#e8c65c", null, "#e8c75c"), R(32, 24, 56, 8, "#3f9e46"), R(88, 24, 8, 8, "#dff5d0"),
      R(16, 32, 8, 8, "#6b4526"), R(24, 32, 8, 8, "#5fc45a"), R(32, 32, 16, 8, "#3f9e46"), R(48, 32, 48, 8, "#dff5d0"),
      R(24, 40, 16, 8, "#3f9e46", "legL"), R(56, 40, 16, 8, "#3f9e46", "legR"), R(88, 40, 8, 8, "#3f9e46", "legR"),
    ],
  };

  const GUARDIAN = {
    w: 240, h: 288,
    // stroked ellipse halo, drawn behind the head
    halo: { x: 54, y: -12, w: 132, h: 132, stroke: "#e8c65c", sw: 5, glow: "#e8c75c" },
    rects: [
      R(72, 102, 96, 120, "#28143f"),
      R(90, 120, 6, 6, "#f2f6ff"), R(144, 138, 6, 6, "#f2f6ff"), R(108, 168, 6, 6, "#f2f6ff"),
      R(132, 198, 6, 6, "#f2f6ff"), R(84, 186, 6, 6, "#f2f6ff"),
      R(24, 90, 42, 12, "#c79bff", "wing", "#bf7aff"), R(12, 108, 54, 12, "#c79bff", "wing", "#bf7aff"),
      R(6, 126, 60, 12, "#c79bff", "wing", "#bf7aff"), R(12, 144, 48, 12, "#c79bff", "wing", "#bf7aff"),
      R(24, 162, 36, 12, "#c79bff", "wing", "#bf7aff"),
      R(174, 90, 42, 12, "#c79bff", "wing", "#bf7aff"), R(174, 108, 54, 12, "#c79bff", "wing", "#bf7aff"),
      R(174, 126, 60, 12, "#c79bff", "wing", "#bf7aff"), R(180, 144, 48, 12, "#c79bff", "wing", "#bf7aff"),
      R(180, 162, 36, 12, "#c79bff", "wing", "#bf7aff"),
      R(78, 96, 84, 96, "#3b3550"), R(78, 96, 12, 96, "#241f36"), R(150, 96, 12, 96, "#565073"),
      R(102, 102, 6, 36, "#c07bff", null, "#bf7aff"), R(126, 114, 6, 48, "#c07bff", null, "#bf7aff"),
      R(114, 156, 6, 30, "#c07bff", null, "#bf7aff"),
      R(108, 132, 24, 24, "#c07bff", null, "#bf7aff"),
      R(66, 84, 108, 12, "#e8c65c"), R(66, 96, 108, 6, "#8f7228"),
      R(48, 84, 30, 24, "#e8c65c"), R(162, 84, 30, 24, "#e8c65c"),
      R(48, 108, 30, 6, "#8f7228"), R(162, 108, 30, 6, "#8f7228"),
      R(54, 114, 24, 54, "#3b3550"), R(162, 114, 24, 54, "#3b3550"),
      R(48, 168, 36, 18, "#e8c65c"), R(156, 168, 36, 18, "#e8c65c"),
      R(60, 186, 18, 18, "#c07bff", null, "#bf7aff"), R(162, 186, 18, 18, "#c07bff", null, "#bf7aff"),
      R(78, 192, 84, 18, "#e8c65c"),
      R(84, 210, 30, 54, "#241f36"), R(126, 210, 30, 54, "#241f36"),
      R(108, 210, 6, 54, "#3b3550"), R(150, 210, 6, 54, "#3b3550"),
      R(78, 264, 42, 18, "#e8c65c"), R(120, 264, 42, 18, "#e8c65c"),
      R(84, 24, 72, 60, "#3b3550"), R(84, 24, 12, 60, "#241f36"), R(144, 24, 12, 60, "#565073"),
      R(90, 6, 12, 18, "#e8c65c"), R(114, 0, 12, 24, "#e8c65c"), R(138, 6, 12, 18, "#e8c65c"),
      R(84, 42, 72, 12, "#e8c65c"),
      R(108, 54, 24, 12, "#ffffff", "eye", "#bf7aff"),
      R(90, 60, 12, 12, "#ffffff", "eye", "#bf7aff"), R(138, 60, 12, 12, "#ffffff", "eye", "#bf7aff"),
      R(96, 72, 12, 6, "#ffffff", "eye", "#bf7aff"), R(132, 72, 12, 6, "#ffffff", "eye", "#bf7aff"),
      R(12, 48, 12, 6, "#e8c65c", "rune", "#e8c75c"), R(12, 42, 6, 18, "#e8c65c", "rune", "#e8c75c"),
      R(216, 60, 12, 6, "#e8c65c", "rune", "#e8c75c"), R(216, 54, 6, 18, "#e8c65c", "rune", "#e8c75c"),
      R(18, 204, 12, 6, "#e8c65c", "rune", "#e8c75c"), R(18, 198, 6, 18, "#e8c65c", "rune", "#e8c75c"),
      R(210, 216, 12, 6, "#e8c65c", "rune", "#e8c75c"), R(210, 210, 6, 18, "#e8c65c", "rune", "#e8c75c"),
      R(36, 252, 12, 6, "#e8c65c", "rune", "#e8c75c"), R(36, 246, 6, 18, "#e8c65c", "rune", "#e8c75c"),
      R(198, 264, 12, 6, "#e8c65c", "rune", "#e8c75c"), R(198, 258, 6, 18, "#e8c65c", "rune", "#e8c75c"),
    ],
  };

  // ---- enemies from the "World & Enemies" Figma page -------------------
  const RAT = {
    w: 160, h: 48,
    rects: [
      R(112, 0, 16, 8, "#4a3a30"),                                     // ear
      R(8, 8, 8, 8, "#c98a8a", "tail"), R(48, 8, 72, 8, "#6e5a4e"), R(120, 8, 8, 8, "#4a3a30"),
      R(0, 16, 16, 8, "#c98a8a", "tail"), R(32, 16, 96, 8, "#6e5a4e"),
      R(128, 16, 8, 8, "#ff5a5a", "eye", "#ff5a5a"),                   // beady red eye
      R(0, 24, 8, 8, "#c98a8a", "tail"), R(24, 24, 112, 8, "#6e5a4e"), R(136, 24, 16, 8, "#c98a8a"),
      R(24, 32, 8, 8, "#4a3a30"), R(32, 32, 88, 8, "#8a7362"), R(120, 32, 8, 8, "#4a3a30"),
      R(32, 40, 16, 8, "#4a3a30", "legL"), R(72, 40, 16, 8, "#4a3a30", "legR"), R(112, 40, 16, 8, "#4a3a30", "legL"),
    ],
  };

  const SENTINEL = {
    w: 96, h: 64,
    rects: [
      R(24, 0, 48, 8, "#8b95a8"),
      R(16, 8, 64, 8, "#8b95a8"),
      R(8, 16, 80, 8, "#8b95a8"),
      R(8, 24, 8, 8, "#8b95a8"), R(16, 24, 8, 8, "#5a6273"),
      R(24, 24, 48, 8, "#ff5a5a", "eye", "#ff5a5a"),                   // burning visor slit
      R(72, 24, 8, 8, "#5a6273"), R(80, 24, 8, 8, "#8b95a8"),
      R(8, 32, 80, 8, "#8b95a8"),
      R(16, 40, 64, 8, "#8b95a8"),
      R(24, 48, 16, 8, "#5a6273"), R(56, 48, 16, 8, "#5a6273"),
      R(32, 56, 32, 8, "#9fd8ff", "thruster", "#9fd8ff"),              // hover glow
    ],
  };

  const WATCHER = {
    w: 96, h: 64,
    rects: [
      R(24, 0, 48, 8, "#3a2f52"),
      R(16, 8, 64, 8, "#f2f6ff"),
      R(8, 16, 32, 8, "#f2f6ff"), R(40, 16, 16, 8, "#c07bff", null, "#c07bff"), R(56, 16, 32, 8, "#f2f6ff"),
      R(8, 24, 24, 8, "#f2f6ff"), R(32, 24, 32, 8, "#c07bff", null, "#c07bff"), R(64, 24, 24, 8, "#f2f6ff"),
      R(8, 32, 24, 8, "#f2f6ff"), R(32, 32, 8, 8, "#c07bff"), R(40, 32, 16, 8, "#1a1220", "pupil"), R(56, 32, 8, 8, "#c07bff"), R(64, 32, 24, 8, "#f2f6ff"),
      R(8, 40, 24, 8, "#f2f6ff"), R(32, 40, 32, 8, "#c07bff", null, "#c07bff"), R(64, 40, 24, 8, "#f2f6ff"),
      R(16, 48, 64, 8, "#f2f6ff"),
      R(24, 56, 48, 8, "#3a2f52"),
    ],
  };

  /**
   * Draw a Figma sprite anchored at feet-centre (fx, fy = feet position),
   * scaled to `height` pixels tall, facing `dir` (1 = right, -1 = left).
   * `anim` (all optional): { legOff, armLift, swing, braidSway, hairLean,
   *                          blink, t } — offsets applied per rect group.
   */
  function drawSprite(ctx, spr, fx, fy, height, dir, anim) {
    const a = anim || {};
    const S = height / spr.h;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(dir || 1, 1);
    if (spr.halo) {
      const hl = spr.halo;
      ctx.strokeStyle = hl.stroke; ctx.lineWidth = hl.sw * S;
      ctx.shadowBlur = 12; ctx.shadowColor = hl.glow;
      ctx.beginPath();
      ctx.ellipse((hl.x + hl.w / 2 - spr.w / 2) * S, (hl.y + hl.h / 2 - spr.h) * S,
        (hl.w / 2) * S, (hl.h / 2) * S, 0, 0, Math.PI * 2);
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    for (const r of spr.rects) {
      let x = (r.x - spr.w / 2) * S, y = (r.y - spr.h) * S;
      let w = r.w * S, h = r.h * S;
      switch (r.g) {
        case "legL": x += a.legOff || 0; break;
        case "legR": x -= a.legOff || 0; break;
        case "armF": y -= a.armLift || 0; y += (a.swing || 0) * 0.3; break;
        case "armB": y -= (a.swing || 0) * 0.3; break;
        case "braid": x += a.braidSway || 0; break;
        case "hairTop": x += a.hairLean || 0; break;
        case "tail": y += Math.sin((a.t || 0) * 9 + r.x * 0.2) * 1.5; break;
        case "pupil": x += a.pupil || 0; break;
        case "thruster": h *= 0.7 + Math.abs(Math.sin((a.t || 0) * 16)) * 0.5; break;
        case "wing": x += Math.sin((a.t || 0) * 1.6 + r.y) * 2 * (x < 0 ? -1 : 1); break;
        case "rune": y += Math.sin((a.t || 0) * 2 + r.x) * 3; break;
        case "eye":
          if (a.blink > 0) { y += h * 0.4; h *= 0.2; }
          break;
      }
      ctx.fillStyle = r.c;
      if (r.glow) { ctx.shadowBlur = 6; ctx.shadowColor = r.glow; }
      ctx.fillRect(x, y, w, h);
      if (r.glow) ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  GG.SPRITES = { nichols: NICHOLS, nibihah: NIBIHAH, nova: NOVA, pip: PIP, guardian: GUARDIAN,
                 rat: RAT, sentinel: SENTINEL, watcher: WATCHER };
  GG.drawSprite = drawSprite;
})(window.GG = window.GG || {});
