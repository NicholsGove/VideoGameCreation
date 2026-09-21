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
  "world/worldgen.js", "world/level.js", "world/decor.js", "world/guardians.js", "entities/player.js", "world/world.js",
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
      if (p.onGround && Math.abs(p.y + p.h - 6 * T) < 3) { me.left = me.right = false; me.action = true; }   // landed on the lever's perch
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

/* ---- Movement & environment (aesthetics round) ------------------------ */
const heroOnFloor = (lvl, p, col) => { place(p, col, 16); for (let i = 0; i < 20; i++) { lvl.players.forEach(q => q.input = I()); lvl.step(DT); } };
{
  // TOSS: Nichols heaves Nibihah off his head, higher than she can jump
  const lvl = mk("simple", { tier: 0, seed: 77 }, []);
  const [n, b] = lvl.players;
  place(n, 3, 16); place(b, 3, 16); b.y = n.y - b.h - 1; b.x = n.cx - b.w / 2;
  for (let i = 0; i < 40; i++) { n.input = I(); b.input = I(); lvl.step(DT); }
  const ridingStart = b.groundRef === n;
  let top = b.y, tossed = false;
  const off = GG.bus.on("player:toss", () => { tossed = true; });
  run(lvl, 1.2, (t, i) => [{ action: i >= 2 && i < 6 }, {}], () => { top = Math.min(top, b.y); return false; });
  if (off) off();
  ok(ridingStart, "Toss: Nibihah rides on Nichols' head");
  ok(tossed && n.y - (top + b.h) > 2.2 * T, "Toss: Nichols throws her well above his head (" + ((n.y - (top + b.h)) / T).toFixed(2) + " tiles)");
}
{
  // CATCH: Nichols holds ACTION and catches Nibihah falling from high up
  const lvl = mk("simple", { tier: 0, seed: 77 }, []);
  const [n, b] = lvl.players;
  heroOnFloor(lvl, n, 3);
  b.x = n.cx - b.w / 2; b.y = 3 * T; b.vy = 0;
  let caught = false;
  run(lvl, 1.5, () => [{ action: true }, {}], () => { if (b.groundRef === n) caught = true; return caught; });
  ok(caught, "Catch: a falling partner lands safely on the catcher's head");
}
{
  // SUNBEAMS: light is harmless; turning a mirror lights the crystal and opens the gate
  const lvl = mk("sunbeam", { tier: 6 }, ALL);
  const [n, b] = lvl.players;
  heroOnFloor(lvl, b, 23);
  run(lvl, 1.2, () => [{}, {}]);
  ok(!b.dead && !chan(lvl, "sL") && !chan(lvl, "sR"), "Sunbeam: the golden beam is harmless and the crystals start dark");
  heroOnFloor(lvl, n, 8);
  const done = run(lvl, 3, (t, i) => [{ action: i === 2 }, {}], (l) => chan(l, "sL"));
  ok(done, "Sunbeam: turning the left mirror lights the left sun crystal");
  const gate = lvl.objects.find(o => o instanceof O.Door);
  run(lvl, 0.2, () => [{}, {}]);
  ok(gate && gate.open, "Sunbeam: the gate opens");
  // the other side works on its own too
  const lvl2 = mk("sunbeam", { tier: 6 }, ALL);
  heroOnFloor(lvl2, lvl2.players[1], 23);
  ok(run(lvl2, 3, (t, i) => [{}, { action: i === 2 }], (l) => chan(l, "sR")), "Sunbeam: Nibihah lights the right crystal from her side");
}
{
  // HEARTBEAT stones share the level clock, and there is always a way on
  const lvl = mk("heartbeat", { tier: 8 }, ALL);
  const bl = lvl.objects.filter(o => o instanceof O.Blinker);
  ok(bl.length === 4 && bl.every(o => o.sync), "Heartbeat: four synced stones");
  let window = true;
  for (let k = 0; k + 1 < bl.length; k++) {
    let best = 0, cur = 0;
    for (let t = 0; t < 5.2; t += 0.01) {
      const on = (o) => ((((t + o.phase) % o.period) / o.period) < o.duty);
      cur = on(bl[k]) && on(bl[k + 1]) ? cur + 0.01 : 0; best = Math.max(best, cur);
    }
    if (best < 0.35) window = false;
  }
  ok(window, "Heartbeat: neighbouring stones overlap long enough to hop across");
}
/** Find a twist in a region's open cell by trying seeds. */
function twistRoom(region, type) {
  for (let seed = 1; seed < 400; seed++) {
    const def = WG.testRoom("plain", { region, tier: region, seed: seed * 7919 });
    const o = def.objects.find(q => q.type === type);
    if (o) return { seed: seed * 7919, o };
  }
  return null;
}
{
  const w = twistRoom(1, "water");
  ok(!!w, "Ruins: tidal water appears in open cells");
  if (w) {
    const lvl = mk("plain", { region: 1, tier: 1, seed: w.seed }, upTo("wallgrip"));
    const b = lvl.players[1];
    place(b, Math.floor(w.o.x / T) + 4, 16);
    let swam = false, top = b.y;
    run(lvl, 4, (t, i) => [{}, { jumpPressed: i % 40 === 0 }], () => { if (b.swimming) swam = true; top = Math.min(top, b.y); return false; });
    ok(swam && !b.dead, "Ruins: heroes swim in the water (and don't drown)");
  }
}
{
  const w = twistRoom(2, "bouncer");
  ok(!!w, "Wilds: bounce mushrooms appear");
  if (w) {
    const lvl = mk("plain", { region: 2, tier: 2, seed: w.seed }, upTo("skystep"));
    const n = lvl.players[0];
    n.x = w.o.x + T - n.w / 2; n.y = w.o.y - 2 * T; n.vy = 0;
    let top = n.y, bounced = false;
    run(lvl, 2, () => [{}, {}], () => { top = Math.min(top, n.y); if (n.y + n.h < w.o.y - 4 * T) bounced = true; return false; });
    ok(bounced, "Wilds: a mushroom flings a hero over 4 tiles up (" + ((w.o.y - top - n.h) / T).toFixed(1) + ")");
  }
}
for (const [region, label] of [[3, "Ironworks steam vent"], [6, "Sky Isles updraft"]]) {
  const w = twistRoom(region, "updraft");
  ok(!!w, label + " appears");
  if (!w) continue;
  const lvl = mk("plain", { region, tier: region, seed: w.seed }, ALL);
  const b = lvl.players[1];
  place(b, Math.floor(w.o.x / T) + 0.5, 16);
  let top = b.y;
  run(lvl, 4, () => [{}, {}], () => { top = Math.min(top, b.y); return false; });
  ok((16 * T - (top + b.h)) > 3 * T, label + " lifts a hero (" + ((16 * T - top - b.h) / T).toFixed(1) + " tiles)");
}

/* ---- Guardians can be beaten, and escapes can be outrun ------------- */
function guardianBot(region, powers, secs) {
  const lvl = mk("shrine", { region, tier: region }, powers);
  lvl.healthMode = true;
  const gd = lvl.objects.find(o => o.guardian);
  const P = lvl.players;
  P.forEach((p, i) => place(p, 8 + i * 2, 16));
  let t = 0;
  const done = run(lvl, secs, (tt, i) => {
    t = tt;
    return P.map((p, k) => {
      const me = {};
      if (p.dead || !gd.alive) return me;
      const dx = gd.cx - p.cx, dist = Math.abs(dx);
      const danger = lvl.hostiles.some(h => Math.abs(h.x - p.cx) < 70 && (h.kind === "wave" || Math.abs(h.y - p.cy) < 60));
      const beamLow = gd.beam && gd.beam.y > p.y + p.h - 30;
      if (gd.st === "tired") {
        if (dist > 40) me[dx > 0 ? "right" : "left"] = true;
        else { p.facing = Math.sign(dx) || 1; me.meleePressed = i % 20 === k * 10; }
        me.attackPressed = i % 30 === 0;
      } else {
        // keep a respectful distance, shoot if we can
        if (dist < 150) me[dx > 0 ? "left" : "right"] = true;
        me.attackPressed = i % 40 === k * 20;
        if (gd.st === "charge" && dist < 170 && p.onGround) me.dodgePressed = true;
      }
      if ((danger || (beamLow && gd.beam.live === false && gd.beam.t < 0.25)) && p.onGround) { me.jumpPressed = true; me.up = true; }
      else if (!p.onGround && p.vy < 0) me.up = true;
      return me;
    });
  }, () => !gd.alive);
  return { won: done, t: Math.round(t), deaths: lvl.deaths, hp: Math.round(gd.hp) };
}
if (process.env.GDBG) {
  const reasons = {}; GG.bus.on("player:death", e => reasons[e.reason] = (reasons[e.reason] || 0) + 1);
  const hurt = {}; GG.bus.on("player:hurt", () => {});
  console.log(JSON.stringify(guardianBot(+process.env.GDBG, ALL, 60)), reasons); process.exit(0);
}
for (const [region, powers] of [[0, []], [3, upTo("strongarms")], [7, ALL]]) {
  const r = guardianBot(region, powers, 150);
  ok(r.won, `Guardian of region ${region} (${GG.GUARDIANS[region].name}) can be beaten by two heroes ${JSON.stringify(r)}`);
}
{
  // the shrine stays sealed while the guardian lives, then escape: RUN
  const lvl = mk("shrine", { region: 2, tier: 2 }, upTo("wallgrip"));
  lvl.healthMode = true;
  const sh = lvl.objects.find(o => o instanceof O.PowerShrine), gd = lvl.objects.find(o => o.guardian);
  const P = lvl.players;
  P[0].x = sh.cx - 30; P[0].y = sh.y + sh.h - P[0].h - 1; P[1].x = sh.cx + 8; P[1].y = sh.y + sh.h - P[1].h - 1;
  run(lvl, 1, () => [{}, {}]);
  ok(!sh.taken, "Shrine: sealed while its guardian is alive");
  gd.takeHit(lvl, 999, 1); gd.hp = 0; if (gd.alive) gd.die(lvl);
  let claimed = false;
  lvl.onPower = () => { claimed = true; };
  P[0].x = sh.cx - 30; P[0].y = sh.y + sh.h - P[0].h - 1; P[1].x = sh.cx + 8; P[1].y = sh.y + sh.h - P[1].h - 1;
  run(lvl, 1, () => [{}, {}], () => claimed);
  ok(claimed, "Shrine: opens once the guardian falls");
  const esc = lvl.objects.find(o => o instanceof O.EscapeRun);
  let left = false, fails0 = 0;
  // two bots sprint for the doorway, hopping the rubble
  const done = run(lvl, 14, () => P.map(p => {
    const me = { left: true };
    const block = lvl.objects.some(o => o instanceof O.Rubble && o.landed && p.x - (o.x + o.w) < 36 && p.x > o.x);
    if (p.onGround && (block || p.hitWallDir < 0)) { me.jumpPressed = true; me.up = true; }
    else if (!p.onGround && p.vy < 0) me.up = true;
    return me;
  }), (l) => P.every(p => !p.dead && p.x < 2 * T));
  ok(esc.state === 1 && done && esc.fails === 0, `Escape: both heroes outrun the ${esc.S.kind} to the doorway (fails ${esc.fails})`);
  // and standing still gets you caught (it's a real chase)
  const lvl2 = mk("shrine", { region: 2, tier: 2 }, upTo("wallgrip"));
  const e2 = lvl2.objects.find(o => o instanceof O.EscapeRun);
  lvl2.setChannel(e2.channel, true);
  run(lvl2, 12, () => [{}, {}]);
  ok(e2.fails > 0, "Escape: dawdling means the wall catches you (and the run restarts)");
}
{
  // Strike + combo + roll (on the flat floor by the left wall)
  const lvl = mk("plain", { region: 1, tier: 1, seed: 11 }, ["arms"]);
  lvl.healthMode = true;
  const [n, b] = lvl.players;
  const bug = lvl.addObject({ type: "beetle", x: 4 * T + 2, y: 16 * T - 20, tough: 3 });
  bug.awake = false;
  place(n, 3, 16); n.facing = 1; n.x = bug.x - n.w - 3;
  b.x = 20 * T; b.y = 16 * T - b.h - 1;
  const hp0 = bug.hp;
  run(lvl, 0.3, (t, i) => [{ meleePressed: i === 1 }, {}]);
  ok(bug.hp < hp0 && bug.stunT > 0 && bug.stunBy === 0, "Strike: Nichols' strike hurts and dazes a beetle");
  let combo = false; const off = GG.bus.on("combo:finisher", () => { combo = true; });
  n.x = 1 * T; b.x = bug.x - b.w - 3; b.y = 16 * T - b.h - 1; b.facing = 1; b.vx = b.vy = 0;
  bug.stunT = 1; bug.stunBy = 0;
  run(lvl, 0.3, (t, i) => [{}, { meleePressed: i === 1 }]);
  if (off) off();
  ok(combo, "Combo: Nibihah's follow-up on the dazed beetle is a co-op finisher");
  // roll: invulnerable to creature contact
  const lvl3 = mk("plain", { region: 1, tier: 1, seed: 11 }, ["arms"]);
  lvl3.healthMode = true;
  const n3 = lvl3.players[0]; place(n3, 2, 16); place(lvl3.players[1], 20, 16);
  const hpA = n3.hp;
  const bug3 = lvl3.addObject({ type: "beetle", x: 4 * T, y: 16 * T - 20, tough: 1 }); bug3.awake = false; bug3.kills = () => true;
  n3.x = 4 * T - n3.w - 4;                                   // right up against it
  run(lvl3, 0.6, (t, i) => [{ right: t > 0.05 && t < 0.32, dodgePressed: i === 8 }, {}]);
  ok(n3.hp === hpA, "Roll: rolling through a creature doesn't cost a heart");
  const lvl4 = mk("plain", { region: 1, tier: 1, seed: 11 }, ["arms"]);
  lvl4.healthMode = true;
  const n4 = lvl4.players[0]; place(n4, 2, 16); place(lvl4.players[1], 20, 16);
  const bug4 = lvl4.addObject({ type: "beetle", x: 4 * T, y: 16 * T - 20, tough: 1 }); bug4.awake = false; bug4.kills = () => true;
  run(lvl4, 0.4, () => [{ right: true }, {}]);
  ok(n4.hp === n4.maxHp - 1 && !n4.dead, "Hearts: walking into a creature costs one heart, not a life (" + n4.hp + "/" + n4.maxHp + ")");
}
{
  // measured jump limits don't move: a roll that runs off a ledge is clamped
  const lvl = mk("plain", { region: 0, tier: 0, seed: 5 }, []);
  const p = lvl.players[0]; heroOnFloor(lvl, p, 8);
  run(lvl, 0.3, (t, i) => [{ right: true, dodgePressed: i === 1, jumpPressed: i === 10, up: i >= 10 }, {}]);
  ok(Math.abs(p.vx) <= 211, "Roll: jumping out of a roll uses normal run speed (" + Math.round(p.vx) + ")");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
