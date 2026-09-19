/* =========================================================================
 * tests/powers.js — can the power trials actually be DONE in the engine?
 * -------------------------------------------------------------------------
 * Run with:   node tests/powers.js
 *
 * The world solver (tests/world.js) reasons about tiles. This suite plays the
 * real physics: scripted "bots" search over simple input plans (when to jump,
 * how long to charge a throw, when to let go of a swing) and must find at
 * least one plan that completes each power gate and power module. It also
 * proves a few can NOT be done without the power.
 * ========================================================================= */
"use strict";
const H = require("./harness.js");
H.load([
  "core/utils.js", "core/events.js", "core/statemachine.js", "core/input.js", "core/storage.js", "core/camera.js", "core/particles.js",
  "core/weather.js", "entities/sprites.js", "world/objects.js", "world/creatures.js", "world/tilemap.js", "world/levels.js",
  "world/worldgen.js", "world/level.js", "entities/player.js", "world/world.js",
]);
const GG = global.GG, T = GG.C.TILE, WG = GG.WORLDGEN, O = GG.obj;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const IDLE = { left: false, right: false, up: false, down: false, jumpPressed: false, action: false, special: false, specialPressed: false, attackPressed: false };
const I = (o) => Object.assign({}, IDLE, o || {});
const DT = 1 / 120;

function mk(content, opts, powers) {
  const def = WG.testRoom(content, opts);
  const lvl = new GG.Level(Object.assign({}, def, { objects: def.objects.map(o => Object.assign({}, o)) }), new GG.Camera(960, 540), new GG.Particles(20), [0, 1]);
  GG.world.state = { powers: powers.slice(), disc: {}, rooms: {} };
  GG.world.applyPowers(lvl);
  // park both heroes out of the way; each test places who it needs
  lvl.players[0].x = 1.2 * T; lvl.players[0].y = 15 * T - 30;
  lvl.players[1].x = 1.6 * T; lvl.players[1].y = 15 * T - 24;
  lvl.players.forEach(p => { p.input = I(); p.spawn = { x: p.x, y: p.y }; });
  for (let i = 0; i < 30; i++) lvl.step(DT);
  return lvl;
}
const place = (p, col, rowSurface) => { p.x = col * T + (T - p.w) / 2; p.y = rowSurface * T - p.h - 0.5; p.vx = p.vy = 0; p.spawn = { x: p.x, y: p.y }; };
const chan = (lvl, name) => Object.keys(lvl.channels).some(k => k.endsWith(name) && lvl.channels[k]);
/** Run a controller for up to `sec` seconds; stop early when done() is true. */
function run(lvl, sec, ctrl, done) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    const inp = ctrl(t, i) || [];
    lvl.players.forEach((p, k) => { p.input = I(inp[k]); });
    lvl.step(DT);
    if (done && done(lvl)) return true;
  }
  return done ? done(lvl) : false;
}
const ALL = WG.POWER_ORDER.slice();
const upTo = (p) => WG.POWER_ORDER.slice(0, WG.POWER_ORDER.indexOf(p) + 1);
const without = (p) => WG.POWER_ORDER.slice(0, WG.POWER_ORDER.indexOf(p));

/* ---- Strong Arms: throw a crate onto a high cargo plate -------------- */
function throwTrial(content, opts, powers, crateCol, targetDir, standCols) {
  for (const standCol of standCols) for (const charge of [0.4, 0.6, 0.9, 1.2]) for (const aim of ["upfwd", "up", "jumpfwd"]) {
    const lvl = mk(content, opts, powers);
    const n = lvl.players[0];
    place(n, crateCol - targetDir * 1.2, 16);
    const face = targetDir;
    let phase = 0, tHold = 0, releasedAt = -1;
    const done = run(lvl, 7, (t) => {
      const me = {};
      if (phase === 0) {                               // grab the crate
        me.action = true; me[face > 0 ? "right" : "left"] = Math.abs(n.cx - (crateCol * T + 16)) > 22;
        if (n.carrying) { phase = 1; tHold = t; }
      } else if (phase === 1) {                        // walk to the throwing spot, charging
        me.action = true;
        const tx = standCol * T + 16;
        if (Math.abs(n.cx - tx) > 6) me[n.cx < tx ? "right" : "left"] = true;
        else if (t - tHold > charge + 0.3) { phase = 2; }
        if (n.cx > tx - 8 && n.cx < tx + 8 && n.facing !== face) me[face > 0 ? "right" : "left"] = true;
      } else if (phase === 2) {                        // release with aim
        me.up = true; if (aim !== "up") me[face > 0 ? "right" : "left"] = true;
        if (aim === "jumpfwd") {                       // jump, and let fly at the top of the jump
          if (n.onGround && releasedAt < 0) { me.jumpPressed = true; me.action = true; releasedAt = t; }
          else if (n.vy < -40) me.action = true;
        }
        if (!n.carrying) { phase = 3; releasedAt = t; }
      }
      return [me, {}];
    }, (l) => phase === 3 && l.crates.some(c => !c.thrown && !c.carried) && Object.values(l.channels).some(v => v));
    if (done) return { ok: true, standCol, charge, aim };
  }
  return { ok: false };
}
{
  // the Strong Arms gate (gate on the right wall): shelf at cols 24..27 row 11
  const r = throwTrial("gate", { gateSide: "R", gatePower: "strongarms", tier: 4 }, upTo("strongarms"), 19, 1, [21, 22, 20, 23, 18]);
  ok(r.ok, "Strong Arms gate: Nichols can throw the crate onto the high plate " + JSON.stringify(r));
  const r2 = throwTrial("throwplate", { tier: 5 }, upTo("strongarms"), 5, 1, [7, 8, 6, 9]);
  ok(r2.ok, "Strong Arms trial: a crate can be thrown onto a hanging plate " + JSON.stringify(r2));
}

/* ---- Mind Grip: steer a cube onto a high plate ------------------------ */
{
  let good = null;
  for (const standCol of [21, 22, 20, 23]) for (const upT of [0.8, 1.2, 1.6, 2.0]) for (const rightT of [0.6, 1.0, 1.4, 1.8, 2.2]) {
    const lvl = mk("gate", { gateSide: "R", gatePower: "tele", tier: 8 }, ALL);
    const n = lvl.players[0];
    place(n, standCol, 16); n.facing = 1;
    let t0 = 0, phase = 0;
    const done = run(lvl, 8, (t, i) => {
      const me = {};
      if (phase === 0) { me.special = true; me.specialPressed = i === 2; if (n.teleHold) { phase = 1; t0 = t; } if (i > 20 && !n.teleHold) phase = 9; }
      else if (phase === 1) { if (t - t0 < upT) me.up = true; else if (t - t0 < upT + rightT) me.right = true; else { me.specialPressed = true; phase = 2; } }
      return [me, {}];
    }, (l) => phase === 2 && Object.values(l.channels).some(v => v));
    if (done) { good = { standCol, upT, rightT }; break; }
  }
  ok(!!good, "Mind Grip gate: Nichols can float the cube onto the high plate " + JSON.stringify(good));
}

/* ---- Wall Grip: climb the hanging chimney to its lever ---------------- */
function chimneyTrial(powers, who) {
  const lvl = mk("gate", { gateSide: "L", gatePower: "wallgrip", tier: 2 }, powers);
  const p = lvl.players[who];
  place(p, 13, 16);
  let hold = -1, phase = 0, jumpCd = 0;
  return run(lvl, 12, (t, i) => {
    const me = { up: true };
    jumpCd = Math.max(0, jumpCd - DT);
    // walk under the chimney, stop, jump straight up into it
    if (phase === 0) { if (p.cx > 8.6 * T) me.left = true; else if (Math.abs(p.vx) < 5 && p.onGround) { phase = 1; me.jumpPressed = true; hold = 0; } }
    else if (phase === 1) {
      if (hold === 0 && p.y + p.h < 12.6 * T) hold = -1;          // inside: lean on a wall
      if (hold < 0) me.left = true; else if (hold > 0) me.right = true;
      if (p._wallSliding && jumpCd === 0) { me.jumpPressed = true; jumpCd = 0.12; hold = -hold; }
      if (p.y + p.h < 6 * T - 4 && hold < 0) phase = 2;       // above the inner wall, flying toward it
      if (p.onGround && t > 1) { phase = 0; }
    } else if (phase === 2) {
      const onWall = p.onGround && Math.abs(p.y + p.h - 6 * T) < 3;
      me.left = !onWall;                                       // hop onto the inner wall
      if (onWall) { me.action = true; }
      if (p.onGround && !onWall) phase = 0;
    }
    const out = [{}, {}]; out[who] = me; return out;
  }, (l) => chan(l, "gate"));
}
ok(chimneyTrial(upTo("wallgrip"), 0), "Wall Grip gate: Nichols climbs the chimney and pulls the lever");
ok(chimneyTrial(upTo("wallgrip"), 1), "Wall Grip gate: Nibihah climbs the chimney and pulls the lever");
ok(!chimneyTrial(without("wallgrip"), 1), "Wall Grip gate: without Wall Grip the chimney can't be climbed");

/* ---- Grapple Hook: yank the unreachable green lever ------------------- */
{
  const lvl = mk("gate", { gateSide: "R", gatePower: "grapple", tier: 6 }, upTo("grapple"));
  const n = lvl.players[0];
  place(n, 18, 11); n.facing = 1;
  const done = run(lvl, 1.5, (t, i) => [{ right: i < 3, specialPressed: i === 20 }, {}], (l) => chan(l, "gate"));
  ok(done, "Grapple gate: Nichols yanks the lever from his ledge");
  const lvl2 = mk("gate", { gateSide: "R", gatePower: "grapple", tier: 6 }, without("grapple"));
  const n2 = lvl2.players[0]; place(n2, 18, 11); n2.facing = 1;
  ok(!run(lvl2, 1.5, (t, i) => [{ right: i < 3, specialPressed: i === 20 }, {}], (l) => chan(l, "gate")), "Grapple gate: nothing happens without the hook");
  const lvl3 = mk("grapplegap", { tier: 7 }, upTo("grapple"));
  const n3 = lvl3.players[0]; place(n3, 22, 10); n3.facing = -1;
  ok(run(lvl3, 1.5, (t, i) => [{ left: i < 3, specialPressed: i === 20 }, {}], (l) => chan(l, "g")), "Grapple trial: Nichols yanks the pillar lever from the far ledge");
}

/* ---- Jumps across gaps onto small islands (Sky Step + Wind Dash) ------ */
function gapTrial(content, opts, powers, startCol, dir, islandCols, useDash) {
  for (const jumpX of [0, 0.3, -0.3, 0.6]) for (const dj of [0.18, 0.25, 0.32, 0.4]) for (const dash of useDash ? [0.35, 0.45, 0.55, 0.65] : [99]) for (const stop of [0.8, 1.0, 1.2, 1.4, 99]) {
    const lvl = mk(content, opts, powers);
    const p = lvl.players[1];
    place(p, startCol, 16);
    let jumped = -1;
    const edge = (startCol + (dir > 0 ? 1 : 0)) * T + jumpX * T * -dir;
    const done = run(lvl, 3, (t, i) => {
      const me = { up: true };
      const past = dir > 0 ? p.x + p.w >= edge : p.x <= edge;
      if (jumped < 0 && past) { jumped = t; me.jumpPressed = true; }
      const since = jumped < 0 ? -1 : t - jumped;
      if (since < 0 || since < stop) me[dir > 0 ? "right" : "left"] = true;
      if (since >= dj && since < dj + DT * 1.5) me.jumpPressed = true;
      if (since >= dash && since < dash + DT * 1.5) me.specialPressed = true;
      return [{}, me];
    }, (l) => !p.dead && p.onGround && islandCols.includes(Math.floor(p.cx / T)) && Math.abs(p.y + p.h - 16 * T) < 2);
    if (done && !p.dead) return { ok: true, jumpX, dj, dash, stop };
  }
  return { ok: false };
}
{
  const r = gapTrial("dashgap", { tier: 6 }, upTo("winddash"), 6, 1, [15, 16], true);
  ok(r.ok, "Wind Dash trial: Nibihah can land on the island between the spike pits " + JSON.stringify(r));
  const r0 = gapTrial("dashgap", { tier: 6 }, upTo("skystep"), 6, 1, [15, 16], false);
  ok(!r0.ok, "Wind Dash trial: Sky Step alone can't reach the island");
  const r2 = gapTrial("gate", { gateSide: "R", gatePower: "winddash", tier: 5 }, upTo("winddash"), 18, 1, [27], true);
  ok(r2.ok, "Wind Dash gate: Nibihah can reach the lever island " + JSON.stringify(r2));
}

/* ---- Swing Ring: swing over the long spike pit ------------------------ */
function swingTrial(content, opts, powers, startCol, dir, islandCols) {
  for (const runIn of [0, 1, 2]) for (const rel of [0.2, 0.4, 0.6, 0.8, 1.0]) for (const pump of [0, 0.4, 0.8, 1.4]) for (const reel of [0, 0.3]) {
    const lvl = mk(content, opts, powers);
    const p = lvl.players[1];
    place(p, startCol - dir * runIn, 16);
    let phase = 0, t0 = 0;
    const edgeX = (startCol + (dir > 0 ? 1 : 0)) * T;
    const done = run(lvl, 6, (t, i) => {
      const me = {};
      if (phase === 0) { me[dir > 0 ? "right" : "left"] = true; me.up = true;
        if (dir > 0 ? p.x + p.w >= edgeX - 20 : p.x <= edgeX + 20) { me.jumpPressed = true; phase = 1; } }
      else if (phase === 1) {
        me.up = true; me[dir > 0 ? "right" : "left"] = true;
        // hook the ring only once it is in reach (otherwise R-Shift is her dash)
        me.specialPressed = lvl.objects.some(a => a instanceof O.SwingAnchor && Math.hypot(p.cx - a.cx, p.cy - a.cy) < 145 && p.cy - a.cy > 8);
        if (p.swing) { phase = 2; t0 = t; } if (p.onGround && t > 0.5) phase = 9; }
      else if (phase === 2) {
        const s = p.swing; if (!s) { phase = 3; }
        else {
          if (t - t0 < reel) me.up = true;
          if (t - t0 < pump) me[dir > 0 ? "right" : "left"] = true;
          const a = s.a * (dir > 0 ? 1 : -1);
          if (t - t0 > pump && a > rel && s.av * dir > 0) { me.jumpPressed = true; phase = 3; }
        }
      } else if (phase === 3) { me[dir > 0 ? "right" : "left"] = !p.onGround; }
      return [{}, me];
    }, (l) => !p.dead && p.onGround && islandCols.includes(Math.floor(p.cx / T)));
    if (done && !p.dead) return { ok: true, runIn, rel, pump, reel };
  }
  return { ok: false };
}
{
  const r = swingTrial("swinggap", { tier: 8 }, upTo("swing"), 5, 1, [15, 16]);
  ok(r.ok, "Swing trial: Nibihah swings from the ledge to the lever island " + JSON.stringify(r));
  const r2 = swingTrial("gate", { gateSide: "R", gatePower: "swing", tier: 7 }, upTo("swing"), 15, 1, [26, 27]);
  ok(r2.ok, "Swing gate: Nibihah swings across to the lever " + JSON.stringify(r2));
}

/* ---- Sky Step: the high shelf lever ------------------------------------ */
{
  const tryIt = (powers) => {
    for (const startCol of [10, 11, 12, 13, 14]) for (const dj of [0.15, 0.22, 0.3]) {
      const lvl = mk("gate", { gateSide: "L", gatePower: "skystep", tier: 3 }, powers);
      const p = lvl.players[1];
      place(p, startCol, 16);
      let jumped = -1;
      const done = run(lvl, 2.5, (t, i) => {
        const me = { up: true, left: true };
        if (i === 1) { me.jumpPressed = true; jumped = t; }
        if (jumped >= 0 && t - jumped >= dj && t - jumped < dj + DT * 1.5) me.jumpPressed = true;
        if (p.onGround && p.y + p.h < 11 * T) { me.left = Math.floor(p.cx / T) > 6; me.action = true; }
        return [{}, me];
      }, (l) => chan(l, "gate"));
      if (done) return true;
    }
    return false;
  };
  ok(tryIt(upTo("skystep")), "Sky Step gate: Nibihah double-jumps to the high lever");
  ok(!tryIt(without("skystep")), "Sky Step gate: a single jump can't reach it");
}

/* ---- Co-op climb: the boost wall -------------------------------------- */
{
  const lvl = mk("boostwall", { tier: 0 }, []);
  const [n, b] = lvl.players;
  place(n, 13, 16); place(b, 13, 16); b.y = n.y - b.h - 1; b.x = n.x;
  for (let i = 0; i < 30; i++) { n.input = I(); b.input = I(); lvl.step(DT); }
  const done = run(lvl, 2.5, (t, i) => {
    const onTop = b.onGround && b.y + b.h <= 12 * T + 1;
    return [{}, { up: true, right: i > 3 && !(onTop && b.cx > 15 * T + 4), jumpPressed: i === 2, action: onTop && t > 0.6 }];
  }, (l) => chan(l, "w"));
  ok(done, "Boost wall: Nibihah jumps off Nichols' head onto the wall and pulls the lever");
  const lvl2 = mk("boostwall", { tier: 0 }, []);
  const b2 = lvl2.players[1]; place(b2, 12, 16);
  ok(!run(lvl2, 2.5, (t, i) => [{}, { up: true, right: true, jumpPressed: i === 2, action: t > 0.9 }], (l) => chan(l, "w")), "Boost wall: nobody climbs it alone");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
