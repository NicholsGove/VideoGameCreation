/* =========================================================================
 * tests/verify.js — headless verification harness
 * -------------------------------------------------------------------------
 * Run with:   node tests/verify.js
 *
 * Loads the real game files with a stubbed DOM and checks:
 *   1. Character identity (colours, immunities, ability flags)
 *   2. Colour-lock ownership — every coloured lever is operable by exactly
 *      one hero, and by the hero the puzzle intends
 *   3. Spawn safety — nobody dies standing still at the start
 *   4. Staged solvability — gates are opened in puzzle order, proving each
 *      trigger is reachable BEFORE the gate it controls, and that the goal is
 *      reachable at the end. Models real jump limits, wall-jump chimneys,
 *      rideable lifts/rotors and portals.
 *   5. The portal rule — it must not open for a single hero
 * ========================================================================= */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");

/* ---- minimal DOM/browser stubs --------------------------------------- */
function grad() { return { addColorStop() {} }; }
function ctx2d() {
  return new Proxy({}, {
    get: (t, k) => {
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad();
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "canvas") return { width: 1920, height: 1080 };
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
function el() {
  const e = {
    getContext: () => ctx2d(), style: {}, dataset: {}, width: 0, height: 0, innerHTML: "",
    appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return el(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  e.content = { firstElementChild: e };
  return e;
}
global.window = global;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
try { Object.defineProperty(global, "navigator", { value: { getGamepads: () => [] }, configurable: true }); } catch (_) {}
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.document = { createElement: () => el(), getElementById: () => el(), addEventListener() {}, readyState: "complete", documentElement: {} };

for (const f of [
  "core/utils.js", "core/events.js", "core/statemachine.js", "core/input.js", "core/camera.js", "core/particles.js",
  "core/weather.js", "entities/sprites.js", "world/objects.js", "world/tilemap.js", "world/levels.js", "world/level.js", "world/decor.js", "world/guardians.js", "entities/player.js",
  "net/network.js", "game.js",
]) vm.runInThisContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8"), { filename: f });

const GG = global.GG, T = GG.C.TILE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const IDLE = { left: false, right: false, up: false, down: false, jumpPressed: false, action: false, special: false, specialPressed: false };
const mkLevel = (def) => new GG.Level(def, new GG.Camera(960, 540), new GG.Particles(40), [0, 1]);

/* ---- 1. character identity ------------------------------------------- */
const [NICHOLS, NIBIHAH] = GG.Player.CHARACTERS;
ok(NICHOLS.name === "Nichols" && NICHOLS.color === "green", "Nichols is GREEN");
ok(NIBIHAH.name === "Nibihah" && NIBIHAH.color === "blue", "Nibihah is BLUE");
ok(NICHOLS.immune.includes("electric") && !NICHOLS.immune.includes("poison"), "Nichols still shrugs off electricity (not poison)");
ok(NIBIHAH.immune.includes("poison") && !NIBIHAH.immune.includes("electric"), "Nibihah still survives poison (not electricity)");
ok(NICHOLS.canPushHeavy && NICHOLS.canRepair && NICHOLS.canCarry && NICHOLS.canGrapple && NICHOLS.canBuild, "Nichols keeps the engineer toolkit");
ok(NIBIHAH.canDash && NIBIHAH.canCrawl && NIBIHAH.canDetect && NIBIHAH.maxJumps === 2, "Nibihah keeps the explorer toolkit");
ok(NICHOLS.body !== NIBIHAH.body, "the heroes are visually distinct");

/* ---- 2. colour-lock ownership ---------------------------------------- */
let locks = 0;
for (const def of GG.LEVELS) {
  const lvl = mkLevel(def);
  for (const o of lvl.objects) {
    if (!o.colorLock) continue;
    locks++;
    const forNichols = o.colorLock === NICHOLS.color;
    const forNibihah = o.colorLock === NIBIHAH.color;
    ok(forNichols !== forNibihah, `L${def.id}: lever at col${Math.floor(o.x / T)} belongs to exactly one hero`);
    // a grapple lever is Nichols' tool, so it must answer to his colour
    if (o instanceof GG.obj.GrappleLever) ok(forNichols, `L${def.id}: grapple lever answers to Nichols`);
  }
}
ok(locks > 0, `found ${locks} colour-locked mechanisms`);

/* ---- 3. spawn safety -------------------------------------------------- */
for (const def of GG.LEVELS) {
  const lvl = mkLevel(def);
  lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
  let threw = null;
  try { for (let i = 0; i < 600; i++) lvl.step(1 / 120); } catch (e) { threw = e; }
  ok(!threw, `L${def.id} simulates 5s without error ${threw ? threw.message : ""}`);
  ok(lvl.deaths === 0, `L${def.id} nobody dies idling at spawn`);
  for (const p of lvl.players) ok(p.onGround, `L${def.id} ${p.character.name} lands safely`);
}

/* ---- 4. staged solvability ------------------------------------------- */
function solidGrid(lvl, openCh) {
  const R = lvl.tilemap.rows, C = lvl.tilemap.cols;
  const S = []; for (let r = 0; r < R; r++) S.push(new Array(C).fill(false));
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (lvl.tilemap.isSolid(c, r)) S[r][c] = true;
  const stamp = (x, y, w, h) => {
    for (let r = Math.floor(y / T); r < Math.ceil((y + h) / T); r++)
      for (let c = Math.floor(x / T); c < Math.ceil((x + w) / T); c++)
        if (r >= 0 && r < R && c >= 0 && c < C) S[r][c] = true;
  };
  for (const o of lvl.objects) {
    const n = o.constructor.name;
    let solid = false;
    if (n === "Door") solid = !(o.channels || [o.channel]).every(c => openCh.has(c));
    else if (n === "LockedDoor") solid = !openCh.has("KEY:" + o.color);
    else if (n === "NarrowGate" || n === "HiddenPlatform" || n === "Blinker" || n === "Crumble") solid = true;
    else continue;
    if (solid) stamp(o.x, o.y, o.w, o.h);
  }
  // lifts are standable at their extremes (never as a solid swept blob — that
  // would wall off the very shaft they serve)
  for (const o of lvl.objects) {
    const n = o.constructor.name;
    if (n === "Seesaw") { stamp(o.panL.x, o.y, o.panL.w, o.panL.h); stamp(o.panR.x, o.y, o.panR.w, o.panR.h); }
    if (n === "MovingPlatform") { stamp(o.x0, o.y0, o.w, o.h); stamp(o.x1, o.y1, o.w, o.h); }
    else if (n === "Rotor") {
      stamp(o.hubX - o.radius - o.w / 2, o.hubY - o.h / 2, o.w, o.h);
      stamp(o.hubX + o.radius - o.w / 2, o.hubY - o.h / 2, o.w, o.h);
      stamp(o.hubX - o.w / 2, o.hubY - o.radius - o.h / 2, o.w, o.h);
      stamp(o.hubX - o.w / 2, o.hubY + o.radius - o.h / 2, o.w, o.h);
    }
  }
  return S;
}
function liftEdges(lvl) {
  const out = [];
  for (const o of lvl.objects) {
    const n = o.constructor.name;
    if (n === "SwingAnchor") {
      // a swing ring connects everything standable in its neighbourhood
      const c0 = Math.floor(o.cx / T), r0 = Math.floor(o.cy / T);
      const spots = [];
      for (let dc = -5; dc <= 5; dc++) for (let dr = -2; dr <= 9; dr++) spots.push([c0 + dc, r0 + dr]);
      for (let a = 0; a < spots.length; a += 7)          // sparse all-pairs
        for (let b = a + 7; b < spots.length; b += 7) out.push([spots[a], spots[b]]);
      // and explicit edges from directly-below to the far sides
      out.push([[c0, r0 + 4], [c0 - 4, r0 + 2]]);
      out.push([[c0, r0 + 4], [c0 + 4, r0 + 2]]);
      out.push([[c0 - 4, r0 + 3], [c0 + 4, r0 + 3]]);
    }
    if (n === "MovingPlatform" && !(o.constructor.name === "Rotor")) {
      out.push([[Math.floor((o.x0 + o.w / 2) / T), Math.floor(o.y0 / T) - 1],
                [Math.floor((o.x1 + o.w / 2) / T), Math.floor(o.y1 / T) - 1]]);
    } else if (n === "Rotor") {
      const r = o.radius, hx = o.hubX, hy = o.hubY;
      const pts = [[hx - r, hy], [hx + r, hy], [hx, hy - r], [hx, hy + r]]
        .map(p => [Math.floor(p[0] / T), Math.floor(p[1] / T) - 1]);
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) out.push([pts[a], pts[b]]);
    }
  }
  return out;
}
/** climb = max ledge height in tiles, gap = max jump span. */
function reachable(S, start, climb, gap, lifts) {
  const R = S.length, C = S[0].length;
  const P = (c, r) => r >= 0 && r < R && c >= 0 && c < C && !S[r][c];
  const stand = (c, r) => P(c, r) && (r + 1 >= R || S[r + 1][c]);
  const land = (c, r) => { let rr = r; while (rr + 1 < R && P(c, rr + 1)) rr++; return stand(c, rr) ? [c, rr] : null; };
  // a chimney no wider than 4 tiles can be climbed by chaining wall jumps
  const chimney = (c, r) => {
    let l = 0, rt = 0;
    for (let d = 1; d <= 3; d++) if (!P(c - d, r)) { l = d; break; }
    for (let d = 1; d <= 3; d++) if (!P(c + d, r)) { rt = d; break; }
    return l && rt && (l + rt) <= 4;
  };
  const K = (c, r) => r * C + c, seen = new Set(), q = [];
  const s0 = land(start[0], start[1]); if (!s0) return seen;
  q.push(s0); seen.add(K(s0[0], s0[1]));
  while (q.length) {
    const [c, r] = q.shift();
    for (let h = 0; h <= climb; h++) {
      let blocked = false;
      for (let hh = 1; hh <= h; hh++) if (!P(c, r - hh)) { blocked = true; break; }
      if (blocked) break;
      for (const d of [-1, 1]) for (let k = 1; k <= gap; k++) {
        let clear = true;
        for (let kk = 1; kk <= k; kk++) if (!P(c + d * kk, r - h)) { clear = false; break; }
        if (!clear) break;
        const t = land(c + d * k, r - h);
        if (t && !seen.has(K(t[0], t[1]))) { seen.add(K(t[0], t[1])); q.push(t); }
      }
    }
    for (const [a, b] of lifts) for (const [p0, p1] of [[a, b], [b, a]]) {
      if (Math.abs(p0[0] - c) <= 2 && Math.abs(p0[1] - r) <= 2) {
        const t = land(p1[0], p1[1]);
        if (t && !seen.has(K(t[0], t[1]))) { seen.add(K(t[0], t[1])); q.push(t); }
        seen.add(K(p1[0], p1[1]));
      }
    }
    for (let up = 1; up <= 20; up++) {
      const rr = r - up; if (!P(c, rr)) break;
      if (!chimney(c, rr)) continue;
      const t = land(c, rr);
      if (t && !seen.has(K(t[0], t[1]))) { seen.add(K(t[0], t[1])); q.push(t); }
      seen.add(K(c, rr));
    }
  }
  return seen;
}
const tileOf = (o) => [Math.floor((o.x + (o.w || T) / 2) / T), Math.floor((o.y + (o.h || T) / 2) / T)];
const nearSet = (o, set, C) => {
  const [c, r] = tileOf(o);
  for (let dr = -2; dr <= 2; dr++) for (let dc = -1; dc <= 1; dc++) if (set.has((r + dr) * C + (c + dc))) return true;
  return false;
};
const TRIGGERS = ["Switch", "GrappleLever", "Button", "SecretSwitch", "TimedSwitch", "RepairNode"];
let broken = 0;
for (const def of GG.LEVELS.filter(l => l.chapter > 0)) {
  const lvl = mkLevel(def);
  const C = lvl.tilemap.cols;
  const start = [Math.floor(lvl.players[0].x / T), Math.floor(lvl.players[0].y / T)];
  const lifts = liftEdges(lvl);
  const open = new Set();
  for (let iter = 0; iter < 16; iter++) {
    const seen = reachable(solidGrid(lvl, open), start, 7, 4, lifts);
    let progress = false;
    for (const o of lvl.objects) {
      const n = o.constructor.name;
      if (TRIGGERS.includes(n) && o.channel && !open.has(o.channel) && nearSet(o, seen, C)) {
        // cargo plates accept crates OR a lured sentinel's weight
        if (o.needsCrate && !lvl.crates.some(c => nearSet(c, seen, C)) &&
            !(lvl.enemies || []).some(e => nearSet(e, seen, C))) continue;
        open.add(o.channel); progress = true;
      } else if (n === "Key" && !open.has("KEY:" + o.color) && nearSet(o, seen, C)) {
        open.add("KEY:" + o.color); progress = true;
      } else if (n === "Boss" && o.channel && !open.has(o.channel)) {
        // the Celestial falls to weapons fire — always winnable once reached
        open.add(o.channel); progress = true;
      } else if (n === "Receptacle" && o.channel && !open.has(o.channel)) {
        // powered when the cradle AND some battery are both reachable
        const bat = lvl.objects.find(b => b.constructor.name === "Battery" && nearSet(b, seen, C));
        if (bat && nearSet(o, seen, C)) { open.add(o.channel); progress = true; }
      } else if (n === "TandemPlate" && o.channel && !open.has(o.channel)) {
        const padB = { x: o.bx, y: o.by, w: o.w, h: o.h };
        if (nearSet(o, seen, C) && nearSet(padB, seen, C)) { open.add(o.channel); progress = true; }
      } else if (n === "RuneSeq" && o.channel && !open.has(o.channel)) {
        if (o.pads.every(p => nearSet({ x: p.x, y: p.y, w: p.w, h: p.h }, seen, C))) { open.add(o.channel); progress = true; }
      }
    }
    if (!progress) break;
  }
  const seen = reachable(solidGrid(lvl, open), start, 7, 4, lifts);
  const goals = lvl.portals.length ? lvl.portals : lvl.exits;
  const unreachable = goals.filter(g => !nearSet(g, seen, C));
  const shut = lvl.objects.filter(o => o.constructor.name === "Door" && !(o.channels || [o.channel]).every(c => open.has(c)));
  const unpowered = lvl.portals.filter(p => p.channels && !p.channels.every(c => open.has(c)));
  const good = !unreachable.length && !shut.length && !unpowered.length;
  if (!good) {
    broken++;
    console.log(`  ✗ L${def.id} "${def.name}" not solvable` +
      (shut.length ? ` — gates stuck at cols ${shut.map(g => Math.floor(g.x / T)).join(",")}` : "") +
      (unpowered.length ? " — portal unpowered" : "") +
      (unreachable.length ? " — goal unreachable" : ""));
  }
  ok(good, `L${def.id} "${def.name}" solvable`);
}

/* ---- 5. the portal rule ---------------------------------------------- */
{
  const def = GG.LEVELS.find(l => l.chapter > 0 && (l.objects || []).some(o => o.type === "portal"));
  const lvl = mkLevel(def);
  lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
  const portal = lvl.portals[0], a = lvl.players[0], b = lvl.players[1];
  for (let i = 0; i < 260; i++) { a.x = portal.cx - a.w / 2; a.y = portal.cy - a.h / 2; a.vy = 0; lvl.step(1 / 120); }
  ok(!lvl.won, "portal stays shut for a lone hero");
  for (let i = 0; i < 260; i++) {
    a.x = portal.cx - a.w / 2 - 8; a.y = portal.cy - a.h / 2; a.vy = 0;
    b.x = portal.cx - b.w / 2 + 8; b.y = portal.cy - b.h / 2; b.vy = 0;
    lvl.step(1 / 120);
  }
  ok(lvl.won, "portal opens when BOTH heroes are inside");
  ok(lvl.players.every(p => p.celebrating), "both heroes celebrate on completion");
}

/* ---- 6. new mechanics unit checks ------------------------------------ */
function flatWith(objs, rows) {
  rows = rows || 18;
  const g = [];
  for (let r = 0; r < rows; r++) { const row = new Array(40).fill(0); if (r >= rows - 2) row.fill(1); row[0] = 2; row[39] = 2; g.push(row); }
  const d = { id: 990, name: "T", theme: "jungle", spawns: [{ x: 96, y: (rows - 5) * T }, { x: 800, y: (rows - 5) * T }],
    objects: objs.concat([{ type: "portal", x: 1100, y: (rows - 4) * T, w: 64, h: 64 }]), tiles: g };
  const l = mkLevel(d); l.beginTiming();
  l.players.forEach(p => (p.input = Object.assign({}, IDLE)));
  return l;
}
{ // telekinesis: grab, steer, rooted holder, energy drain, release
  const lvl = flatWith([{ type: "telecube", x: 300, y: 480, kind: "free" }]);
  const cube = lvl.crates.find(c => c.tele), N = lvl.players[0];
  for (let i = 0; i < 40; i++) lvl.step(1 / 120);
  N.x = 340; N.input = Object.assign({}, IDLE, { specialPressed: true });
  lvl.step(1 / 120);
  ok(cube.carried === N && N.teleHold === cube, "Nichols tele-grabs a cube from range");
  const e0 = lvl.energy, nx = N.x;
  N.input = Object.assign({}, IDLE, { up: true, left: true });
  for (let i = 0; i < 60; i++) lvl.step(1 / 120);
  ok(cube.y < 470 && cube.x < 320, "held cube steers with his movement keys");
  ok(Math.abs(N.x - nx) < 2, "the holder is rooted while telekinesis is active");
  ok(lvl.energy < e0, "telekinesis drains the shared energy pool");
  N.input = Object.assign({}, IDLE, { specialPressed: true });
  lvl.step(1 / 120); lvl.step(1 / 120);
  ok(!N.teleHold, "a second SPECIAL releases the cube");
  N.input = Object.assign({}, IDLE);   // real input gives one-frame edges
  const fy = cube.y;
  for (let i = 0; i < 60; i++) lvl.step(1 / 120);
  ok(Math.abs(cube.y - fy) < 3, "a free cube floats where it was left");
  // Nibihah cannot grab
  const B = lvl.players[1];
  B.x = cube.x - 30; B.input = Object.assign({}, IDLE, { specialPressed: true });
  lvl.step(1 / 120);
  ok(!cube.carried, "Nibihah cannot use telekinesis");
}
{ // swing: attach, pendulum motion, energy drain, release keeps momentum
  const lvl = flatWith([{ type: "anchor", x: 500, y: 260, w: 18, h: 18 }]);
  const B = lvl.players[1];
  for (let i = 0; i < 30; i++) lvl.step(1 / 120);
  B.x = 460; B.y = 380; B.vy = 0; B.onGround = false;
  B.input = Object.assign({}, IDLE, { specialPressed: true });
  lvl.step(1 / 120);
  ok(!!B.swing, "Nibihah hooks a swing ring with SPECIAL");
  const e0 = lvl.energy;
  B.input = Object.assign({}, IDLE, { right: true });
  let maxV = 0;
  for (let i = 0; i < 200; i++) { lvl.step(1 / 120); maxV = Math.max(maxV, Math.abs(B.vx)); }
  ok(maxV > 60, "pumping builds real swing momentum (" + maxV.toFixed(0) + "px/s)");
  ok(lvl.energy < e0, "swinging drains the shared pool");
  B.input = Object.assign({}, IDLE, { jumpPressed: true });
  lvl.step(1 / 120);
  ok(!B.swing, "jump releases the line");
  // Nichols cannot swing
  const N = lvl.players[0];
  N.x = 470; N.y = 380; N.onGround = false; N.input = Object.assign({}, IDLE, { specialPressed: true });
  lvl.step(1 / 120);
  ok(!N.swing, "Nichols cannot swing");
}
{ // tandem plates: both pressed together -> on; one alone -> off
  const lvl = flatWith([{ type: "tandem", x: 300, y: 500, bx: 600, by: 512, channel: "tp", w: T, h: 10 }]);
  const [A, B] = lvl.players;
  A.x = 305; A.y = 480; B.x = 900;
  for (let i = 0; i < 80; i++) lvl.step(1 / 120);
  ok(!lvl.getChannel("tp"), "one hero on a tandem plate is not enough");
  B.x = 605; B.y = 480;
  for (let i = 0; i < 20; i++) { A.x = 305; B.x = 605; lvl.step(1 / 120); }
  ok(lvl.getChannel("tp"), "both plates pressed together fire the channel");
}
{ // rune sequence: order matters, wrong step resets, completion latches
  const lvl = flatWith([{ type: "runeseq", x: 300, y: 500, channel: "rs", pads: [
    { x: 300, y: 508 }, { x: 400, y: 508 }, { x: 500, y: 508 } ] }]);
  const seq = lvl.objects.find(o => o.constructor.name === "RuneSeq");
  const A = lvl.players[0];
  const stand = (px) => { A.x = px; A.y = 484; for (let i = 0; i < 12; i++) lvl.step(1 / 120); };
  for (let i = 0; i < 30; i++) lvl.step(1 / 120);
  stand(300); ok(seq.idx === 1, "first rune advances the song");
  stand(500); ok(seq.idx === 0, "a wrong rune resets it");
  stand(300); stand(400); stand(500);
  ok(seq.done && lvl.getChannel("rs"), "the full verse latches the channel");
}
{ // wind: pushes, bracing resists, a parked cube shelters
  const lvl = flatWith([{ type: "wind", x: 200, y: 100, w: 400, h: 420, dir: 1, push: 300, period: 2, blow: 2 },
                        { type: "telecube", x: 900, y: 480, kind: "free" }]);
  const A = lvl.players[0];
  for (let i = 0; i < 30; i++) lvl.step(1 / 120);
  A.x = 300; A.vx = 0;
  for (let i = 0; i < 60; i++) lvl.step(1 / 120);
  ok(A.x > 310, "the gale shoves an unbraced hero");
  A.x = 300; A.vx = 0; A.input = Object.assign({}, IDLE, { down: true });
  const bx = A.x;
  for (let i = 0; i < 60; i++) { A.input = Object.assign({}, IDLE, { down: true }); lvl.step(1 / 120); }
  ok(Math.abs(A.x - bx) < 20, "crouching braces against the wind");
  const cube = lvl.crates.find(c => c.tele);
  cube.x = 380; cube.y = 400; cube._restY = 400;
  A.input = Object.assign({}, IDLE); A.x = 300; A.vx = 0;
  for (let i = 0; i < 60; i++) lvl.step(1 / 120);
  ok(Math.abs(A.x - 300) < 20, "a parked stone shelters the whole gust");
}
{ // tether: snaps when the heroes drift apart inside the zone
  const lvl = flatWith([{ type: "tether", x: 100, y: 100, w: 900, h: 420, maxDist: 150 }]);
  const [A, B] = lvl.players;
  for (let i = 0; i < 30; i++) lvl.step(1 / 120);
  A.x = 200; B.x = 700;
  lvl.step(1 / 120);
  ok(A.dead && B.dead, "the aether thread snaps when they separate — both fall");
}
{ // energy pool: drains to empty, regenerates when unused
  const lvl = flatWith([]);
  lvl.energy = 5;
  for (let i = 0; i < 240; i++) lvl.step(1 / 120);
  ok(lvl.energy > 15, "the shared pool regenerates while unused");
}
{ // seesaw: heavier hero sinks his pan and raises the other
  const lvl = flatWith([{ type: "seesaw", x: 500, y: 430, span: 3 }]);
  const saw = lvl.objects.find(o => o.constructor.name === "Seesaw");
  const N = lvl.players[0];
  for (let i = 0; i < 40; i++) lvl.step(1 / 120);
  ok(Math.abs(saw.o) < 2, "an empty seesaw rests level");
  N.x = saw.panL.x + 8; N.y = saw.panL.y - N.h - 1; N.vy = 0;
  for (let i = 0; i < 200; i++) { lvl.step(1 / 120); }
  ok(saw.o < -20, "Nichols' weight sinks his pan (o=" + saw.o.toFixed(0) + ")");
  ok(saw.panR.y < 430 - 20, "…and the far pan rises as a lift");
}
{ // battery: pickup by either hero, ferry, dock latches the channel
  const lvl = flatWith([{ type: "battery", x: 300, y: 470 },
                        { type: "dock", x: 700, y: 482, channel: "pw", w: 28, h: 30 }]);
  const bat = lvl.objects.find(o => o.constructor.name === "Battery");
  const B = lvl.players[1];
  for (let i = 0; i < 40; i++) lvl.step(1 / 120);
  B.x = bat.x - 10; B.y = bat.y - 4;
  B.input = Object.assign({}, IDLE, { action: true });
  lvl.step(1 / 120);
  ok(bat.holder === B && B.hasBattery === bat, "Nibihah can carry a power cell");
  B.input = Object.assign({}, IDLE);
  for (let i = 0; i < 70; i++) { B.x = 690; lvl.step(1 / 120); }
  B.input = Object.assign({}, IDLE, { action: true });   // set it down at the cradle
  lvl.step(1 / 120); B.input = Object.assign({}, IDLE);
  for (let i = 0; i < 60; i++) lvl.step(1 / 120);
  ok(bat.docked && lvl.getChannel("pw"), "a docked cell powers the cradle forever");
}
{ // sentinel: patrols, chases, kills, and weighs plates
  const lvl = flatWith([{ type: "sentinel", x: 400, y: 482, x1: 560, sight: 130 },
                        { type: "button", x: 620, y: 502, channel: "lure", needsCrate: true, w: 64, h: 10 }]);
  const sn = lvl.enemies[0], N = lvl.players[0], B2 = lvl.players[1];
  N.x = 100; B2.x = 900;
  const sx = sn.x;
  for (let i = 0; i < 240; i++) lvl.step(1 / 120);
  ok(Math.abs(sn.x - sx) > 30, "the husk walks its patrol");
  ok(!lvl.getChannel("lure"), "the heavy plate ignores heroes");
  // lure it onto the plate, then he dies for science
  N.x = 640; N.y = 470;
  let died = false;
  for (let i = 0; i < 400 && !died; i++) { N.x = 640; lvl.step(1 / 120); died = N.dead; }
  ok(lvl.getChannel("lure"), "a lured husk's weight presses the plate");
  ok(died, "…but touching it is death");
}
{ // watcher: spots a hero only while gazing; a parked cube blinds it
  const lvl = flatWith([{ type: "watcher", x: 800, y: 470, channel: "seen", dir: -1, range: 400, period: 2, gaze: 2 },
                        { type: "telecube", x: 900, y: 480, kind: "free" }]);
  const A = lvl.players[0], B9 = lvl.players[1];
  A.x = 600; A.y = 470; B9.x = 1000;
  for (let i = 0; i < 30; i++) { A.x = 600; B9.x = 1000; lvl.step(1 / 120); }
  ok(lvl.getChannel("seen"), "the eye raises the alarm when it sees a hero");
  const cube = lvl.crates.find(c => c.tele);
  cube.x = 700; cube.y = 470; cube._restY = 470;
  for (let i = 0; i < 200; i++) { A.x = 600; B9.x = 1000; lvl.step(1 / 120); }
  ok(!lvl.getChannel("seen"), "a parked stone blinds the eye");
}
{ // the Celestial: 40 hits, seals stun+wound, wave 2 teleports on a 10s clock
  const lvl = flatWith([{ type: "boss", x: 300, y: 60, w: 8 * T, h: 3 * T, phases: ["a", "b"], channel: "boss" }]);
  const boss = lvl.objects.find(o => o.constructor.name === "Boss");
  const A = lvl.players[0], B7 = lvl.players[1];
  A.x = 100; B7.x = 900;
  for (let i = 0; i < 30; i++) lvl.step(1 / 120);
  ok(boss.hp === 40 && boss.wave === 1 && !lvl.getChannel("boss"), "the Celestial wakes with 40 health in wave 1");
  // seals stun it and tear 4 points off
  lvl.setChannel("a", true); lvl.step(1 / 120);
  ok(boss.phase === 1 && boss.hp === 36 && boss._stun > 0, "a broken seal wounds and stuns it");
  // starfire falls and kills
  let shotSeen = false, died = false;
  for (let i = 0; i < 1500 && !died; i++) {
    lvl.step(1 / 120);
    if (boss._shots.length) { shotSeen = true; const s = boss._shots[0]; A.x = s.x - 2; A.y = s.y + 10; A.dead = false; }
    died = lvl.deaths > 0;
  }
  ok(shotSeen && died, "starfire falls, and it kills");
  // weapons whittle it into wave 2…
  const bx0 = boss.x;
  while (boss.hp > 20) boss.takeHit(lvl, 1, 1);
  lvl.step(1 / 120);
  ok(boss.wave === 2, "half health begins wave 2");
  let teleports = 0, lastX = boss.x;
  for (let i = 0; i < 120 * 25; i++) { lvl.step(1 / 120); if (boss.x !== lastX) { teleports++; lastX = boss.x; } }
  ok(teleports >= 2 && teleports <= 3, `wave 2 teleports on a ~10s cooldown (${teleports} blinks in 25s)`);
  // …and 40 total hits end it
  while (boss.hp > 0) boss.takeHit(lvl, 1, 1);
  lvl.step(1 / 120);
  ok(boss.defeated && lvl.getChannel("boss"), "forty hits fell the Celestial and power the exit");
  for (let i = 0; i < 300; i++) lvl.step(1 / 120);
  ok(boss._shots.length === 0, "a defeated Celestial attacks no more");
}
{ // rats: wander, chase when healthy, flee when wounded, 4 hits, stay dead
  const lvl = flatWith([{ type: "rat", x: 500, y: 480 }]);
  const rat = lvl.rats[0], A = lvl.players[0], B8 = lvl.players[1];
  A.x = 100; B8.x = 940;
  const rx0 = rat.x;
  for (let i = 0; i < 400; i++) { A.x = 100; B8.x = 940; lvl.step(1 / 120); }
  ok(!rat.deadRat && Math.abs(rat.x - rx0) > 8, "a rat wanders its nest");
  ok(Math.abs(rat.x - rat.x0) < 160, "…but stays near home");
  A.x = rat.x - 150; A.y = 470; A.dead = false;
  let closed = false;
  for (let i = 0; i < 240; i++) { const d0 = Math.abs(rat.cx - A.cx); A.x = rat.x - 150; lvl.step(1 / 120); if (Math.abs(rat.cx - A.cx) < d0) closed = true; A.dead = false; }
  ok(closed, "a healthy rat hunts the nearest hero");
  rat.hp = 1;
  let fled = false;
  for (let i = 0; i < 240; i++) { A.x = rat.x - 100; const d0 = Math.abs(rat.cx - A.cx); lvl.step(1 / 120); if (Math.abs(rat.cx - A.cx) > d0 + 0.5) fled = true; A.dead = false; }
  ok(fled, "a wounded rat bolts");
  rat.hp = 4;
  for (let i = 0; i < 4; i++) rat.takeHit(lvl, 1);
  ok(rat.deadRat, "four hits fell a rat");
  for (let i = 0; i < 300; i++) lvl.step(1 / 120);
  ok(rat.deadRat, "a dead rat stays dead");
  A.dead = true; B8.dead = true; lvl.step(1 / 120);
  ok(!rat.deadRat && rat.hp === 4, "…unless BOTH heroes fall — then the nest recovers");
}
{ // weapons: attack key fires; four shots kill a rat; bolts vs arrows
  const lvl = flatWith([{ type: "rat", x: 700, y: 480 }]);
  const rat = lvl.rats[0], N = lvl.players[0], B9 = lvl.players[1];
  N.x = 400; N.facing = 1; B9.x = 100;
  for (let i = 0; i < 30; i++) lvl.step(1 / 120);
  N.input = Object.assign({}, IDLE, { attackPressed: true });
  lvl.step(1 / 120);
  ok(lvl.projectiles.length === 1 && !lvl.projectiles[0].arrow, "Nichols' attack key fires a bolt");
  N.input = Object.assign({}, IDLE);
  B9.facing = 1; B9.input = Object.assign({}, IDLE, { attackPressed: true });
  lvl.step(1 / 120);
  ok(lvl.projectiles.some(s => s.arrow), "Nibihah's attack key fires an arrow");
  B9.input = Object.assign({}, IDLE);
  let shots = 0;
  for (let i = 0; i < 2000 && !rat.deadRat; i++) {
    if (N._atkCd === 0 && shots < 12) { N.x = rat.x - 220; N.facing = 1; N.y = rat.y - 6; N.input = Object.assign({}, IDLE, { attackPressed: true }); shots++; }
    else N.input = Object.assign({}, IDLE);
    N.dead = false;
    lvl.step(1 / 120);
  }
  // (the arrow assertion above already winged it once, so total hits = 4)
  ok(rat.deadRat && shots >= 3, `sustained fire puts a rat down (${shots} more shots)`);
}
{ // tutorials + pets + new bindings
  const l11 = GG.LEVELS.find(l => l.id === 11);
  ok(l11.objects.some(o => o.type === "tutor" && /R-SHIFT|ring/i.test((o.lines || []).join(" "))), "level 11 teaches swinging in-world");
  for (const id of [1, 4, 7, 15, 22, 70]) {
    const l = GG.LEVELS.find(x => x.id === id);
    ok(l.objects.some(o => o.type === "tutor"), `level ${id} carries a tutorial sign`);
  }
  ok(GG.LEVELS.filter(l => l.chapter > 0 && l.objects.some(o => o.type === "rat")).every(l => l.id > 20), "rats only nest beyond level 20");
  const lvl = mkLevel(GG.LEVELS.find(l => l.id === 26));
  ok(lvl.pets.length === 2 && lvl.pets[0].kind === "cat" && lvl.pets[1].kind === "frog", "the cat and frog join from Chapter 3");
  const lvl1 = mkLevel(GG.LEVELS.find(l => l.id === 1));
  ok(lvl1.pets.length === 0, "no pets before they are found");
  lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
  let threw = null;
  try { for (let i = 0; i < 300; i++) lvl.step(1 / 120); } catch (e) { threw = e; }
  ok(!threw, "pets trot along without error");
  ok(GG.DEFAULT_BINDINGS.p0.attack === "KeyE" && GG.DEFAULT_BINDINGS.p1.attack === "Period", "attack keys bound for both players");
}
{ // carrying a rider: the carrier can STILL JUMP (lower), and lifts the rider
  const mkStack = () => {
    const lvl = flatWith([]);
    lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
    const N = lvl.players[0], B = lvl.players[1];
    N.x = 300; B.x = 700;
    for (let i = 0; i < 40; i++) lvl.step(1 / 120);
    return { lvl, N, B };
  };
  // solo apex first, for comparison
  const solo = mkStack();
  solo.N.input = Object.assign({}, IDLE, { up: true, jumpPressed: true });
  let soloApex = solo.N.y;
  for (let i = 0; i < 150; i++) { solo.lvl.step(1 / 120); solo.N.input = Object.assign({}, IDLE, { up: true }); soloApex = Math.min(soloApex, solo.N.y); }
  // now with Nibihah on his head
  const s = mkStack();
  s.B.x = s.N.x; s.B.y = s.N.y - s.B.h - 1; s.B.vy = 0;
  for (let i = 0; i < 16; i++) s.lvl.step(1 / 120);
  ok(s.B.groundRef === s.N, "Nibihah is riding on Nichols' head");
  const groundY = s.N.y;
  s.N.input = Object.assign({}, IDLE, { up: true, jumpPressed: true });
  let apex = s.N.y, riderApex = s.B.y, together = true;
  for (let i = 0; i < 150; i++) {
    s.lvl.step(1 / 120);
    s.N.input = Object.assign({}, IDLE, { up: true });
    apex = Math.min(apex, s.N.y); riderApex = Math.min(riderApex, s.B.y);
    if (Math.abs(s.B.cx - s.N.cx) > 30) together = false;
  }
  ok(groundY - apex > 40, `the carrier truly leaves the ground with a rider aboard (rose ${(groundY - apex).toFixed(0)}px)`);
  ok(apex > soloApex, "…but not as high as jumping alone (the weight is real)");
  ok(riderApex < s.N.y - 20 && together, "the rider is lifted along, still stacked");
}
{ // input edges survive frames where zero physics steps run (144Hz+ fix):
  // "sometimes I can't jump while running" — the edge landed on a frame with
  // dt < 1/120, ran no steps, and was cleared before ever being consumed.
  const lvl = flatWith([]);
  const g = GG.game;
  g.level = lvl; g.mode = "local"; g.role = "host"; g.state = "playing";
  g._accum = 0; g._edgeBuf = [{}, {}]; g._wasWon = false;
  lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
  for (let i = 0; i < 40; i++) lvl.step(1 / 120);   // settle on the ground
  const N = lvl.players[0];
  const orig = GG.input.snapshot.bind(GG.input);
  let script = Object.assign({}, IDLE, { right: true, up: true, jumpPressed: true });
  GG.input.snapshot = (i) => (i === 0 ? Object.assign({}, script) : Object.assign({}, IDLE));
  g._sim(0.004);                                     // 4ms frame: ZERO steps — edge must survive
  script = Object.assign({}, IDLE, { right: true, up: true });  // the live edge is gone now
  g._sim(0.02);                                      // a real frame consumes the buffer
  GG.input.snapshot = orig;
  ok(N.vy < -300, `a jump pressed on a zero-step frame still fires (vy=${N.vy.toFixed(0)})`);
  // and the buffer releases once consumed — no phantom double jumps
  g._sim(0.02);
  ok(!g._edgeBuf[0].jump, "the consumed edge does not linger");
  g.level = null; g.state = "menu";
}
{ // energyMax override: scarcity levels start with a smaller pool
  const d44 = GG.LEVELS.find(l => l.id === 44);
  ok(d44 && d44.energyMax === 45, "level 44 declares a shallow pool");
  const lvl = mkLevel(d44);
  ok(lvl.energyMax === 45 && lvl.energy === 45, "the level honours its energyMax");
}

/* ---- 6. render smoke: every level draws without throwing --------------
 * All the art is procedural, so a typo in a draw call is a black screen at
 * runtime and nothing else. Rendering each level against the stub context
 * catches those before they ship. */
{
  const C2 = ctx2d();
  let drawn = 0, err = null, errId = 0;
  for (const def of GG.LEVELS) {
    const lvl = mkLevel(def);
    lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
    try {
      for (let f = 0; f < 12; f++) {
        lvl.step(1 / 60);
        lvl.renderBackground(C2, lvl.cam);
        lvl.renderWorld(C2, lvl.cam);
        for (const p of lvl.players) p.render(C2);
        lvl.renderLighting(C2, lvl.cam);
      }
      drawn++;
    } catch (e) { if (!err) { err = e; errId = def.id; } }
  }
  ok(!err, `every level renders (level ${errId}: ${err && err.message})`);
  ok(drawn === GG.LEVELS.length, `${drawn}/${GG.LEVELS.length} levels drew a frame`);
}
{ // the pets and the wildlife are alive and reacting
  const d30 = GG.LEVELS.find(l => l.id === 30);      // chapter 3+, so Nova & Pip exist
  const lvl = mkLevel(d30);
  lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
  ok(lvl.pets.length === 2 && lvl.pets[0].name === "Nova" && lvl.pets[1].name === "Pip",
     "Nova and Pip join the party from chapter 3");
  const pip = lvl.pets[1], startX = pip.x;
  lvl.players[1].x += 200;                            // Nibihah runs off
  for (let i = 0; i < 120; i++) lvl.step(1 / 60);
  ok(Math.abs(pip.x - startX) > 40, "Pip chases after Nibihah");
  for (let i = 0; i < 1400; i++) lvl.step(1 / 60);    // nobody moves for a long while
  ok(lvl.pets.every(p => p.mood !== "follow"), "the pets settle down when the party idles");
  // wildlife flees when a hero closes in
  const a = lvl._ambient[0];
  a.hx = lvl.players[0].cx; a.hy = lvl.players[0].cy; a.x = a.hx; a.y = a.hy;
  for (let i = 0; i < 30; i++) lvl.step(1 / 60);
  ok(a.state === "flee" && a.fear > 0.3, "ambient creatures scatter from the heroes");
}
{ // capes/scarves are gone by request — no trailing cloth chains remain
  const d1 = GG.LEVELS.find(l => l.id === 1);
  const lvl = mkLevel(d1);
  const nib = lvl.players[1];
  ok(nib.trail === undefined && nib.cloak === undefined, "heroes carry no cloth chains");
}
{ // Figma-imported sprites: present, and drawn for both heroes
  const S = GG.SPRITES;
  ok(S && S.nichols && S.nibihah && S.nova && S.pip && S.guardian, "all five Figma sprites imported");
  ok(S.rat && S.sentinel && S.watcher, "enemy sprites (rat/sentinel/watcher) imported from Figma");
  ok(S.nichols.rects.some(r => r.g === "eye") && S.nibihah.rects.some(r => r.g === "eye"),
     "the player's Figma eyes made it into both hero sprites");
  ok(typeof GG.drawSprite === "function", "the shared sprite renderer exists");
}
{ // netcode: platform/rotor positions re-derive from snapshots (client fix)
  const plat = new GG.obj.MovingPlatform({ x: 0, y: 0, x2: 100, y2: 0 });
  plat.setState({ t: 0.5, dir: 1 });
  ok(Math.abs(plat.x - 50) < 0.01, "a snapshot moves a client-side platform");
  const rot = new GG.obj.Rotor({ x: 200, y: 100, radius: 96 });
  rot.setState(Math.round(Math.PI / 2 * 100));
  ok(Math.abs((rot.y + rot.h / 2) - 196) < 2, "a snapshot swings a client-side rotor arm");
}
{ // netcode: stale packets on the unordered fast lane are dropped
  const net = new GG.NetworkManager();
  let got = [];
  net.onState((d) => got.push(d));
  net._onMessage({ t: "state", q: 5, d: "newer" });
  net._onMessage({ t: "state", q: 3, d: "stale" });
  net._onMessage({ t: "state", q: 6, d: "newest" });
  ok(got.join(",") === "newer,newest", "late out-of-order snapshots never regress the view");
}
{ // the Celestial Guardian is genuinely enormous
  const boss = new GG.obj.Boss({ x: 0, y: 0 });
  const hero = 30;                                   // Nichols' height in pixels
  ok(boss.h >= hero * 4 && boss.h <= hero * 6, `the boss stands ${(boss.h / hero).toFixed(1)}x a hero`);
}

console.log(`\n${pass} passed, ${fail} failed` + (broken ? ` (${broken} level(s) unsolvable)` : ""));
process.exit(fail ? 1 : 0);
