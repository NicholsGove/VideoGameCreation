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
  "core/utils.js", "core/events.js", "core/statemachine.js", "core/camera.js", "core/particles.js",
  "world/objects.js", "world/tilemap.js", "world/levels.js", "world/level.js", "entities/player.js",
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
    if (n === "MovingPlatform") {
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
        if (o.needsCrate && !lvl.crates.some(c => nearSet(c, seen, C))) continue;
        open.add(o.channel); progress = true;
      } else if (n === "Key" && !open.has("KEY:" + o.color) && nearSet(o, seen, C)) {
        open.add("KEY:" + o.color); progress = true;
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

console.log(`\n${pass} passed, ${fail} failed` + (broken ? ` (${broken} level(s) unsolvable)` : ""));
process.exit(fail ? 1 : 0);
