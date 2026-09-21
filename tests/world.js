/* =========================================================================
 * tests/world.js — open-world verification
 * -------------------------------------------------------------------------
 * Run with:   node tests/world.js            (add -v for per-room detail)
 *
 * For EVERY room of the generated world, and from EVERY doorway the heroes
 * could first arrive through, a two-hero reachability solver proves:
 *   • both heroes can reach every other doorway (nobody is left behind)
 *   • every map cell of the room can be entered (so 100% is achievable)
 *   • shrines can be reached by both heroes together
 *   • a doorway sealed by a power gate is UNREACHABLE without that power
 *     and reachable with it (the metroidvania gating really holds)
 * using only the powers the heroes can own when they first get there.
 *
 * The solver models real jump limits (measured in-engine): a single jump
 * climbs 3 tiles / clears 4; Sky Step climbs 6 / clears 6; Sky Step + Wind
 * Dash clears 8; standing on a partner's head adds a 4-tile boost. Wall Grip
 * climbs chimneys up to 4 tiles wide. Levers, plates (incl. cargo plates for
 * crates and mind-cubes), rune songs, tandem pads, keys, power cells, thorn
 * barriers and grapple levers open their channels in stages.
 *
 * It also simulates every room from every arrival (nobody dies idling) and
 * renders every room once through the real renderer.
 * ========================================================================= */
"use strict";
const H = require("./harness.js");
H.load([
  "core/utils.js", "core/events.js", "core/statemachine.js", "core/input.js", "core/storage.js", "core/camera.js", "core/particles.js",
  "core/weather.js", "entities/sprites.js", "world/objects.js", "world/creatures.js", "world/tilemap.js", "world/levels.js",
  "world/worldgen.js", "world/level.js", "world/decor.js", "world/guardians.js", "entities/player.js", "world/world.js",
]);
const GG = global.GG, T = GG.C.TILE, O = GG.obj, WG = GG.WORLDGEN;
const VERBOSE = process.argv.includes("-v");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };

const W = WG.generate();
const powersFor = (tier) => WG.POWER_ORDER.slice(0, Math.max(0, tier));
const IDLE = { left: false, right: false, up: false, down: false, jumpPressed: false, action: false, special: false, specialPressed: false, attackPressed: false };

function mkLevel(roomId, door, powers) {
  GG.world.state = { powers: powers.slice(), disc: {}, rooms: {}, room: roomId, door, timeMs: 0 };
  GG.world.gen = W;
  return GG.world.makeLevel(roomId, door, new GG.Camera(960, 540), new GG.Particles(40), [0, 1]);
}

/* ---------------------------------------------------------------------
 * Solver
 * ------------------------------------------------------------------- */
const JUMPS = {
  base:   { maxH: 3, k: [5, 5, 4, 2] },
  sky:    { maxH: 6, k: [7, 7, 7, 5, 5, 3, 3] },
  skyDash:{ maxH: 6, k: [9, 9, 9, 6, 6, 3, 3] },
};
function heroJumps(hero, powers) {
  if (hero === 1 && powers.includes("skystep")) return powers.includes("winddash") ? JUMPS.skyDash : JUMPS.sky;
  return JUMPS.base;
}

function solve(lvl, startTiles, powers) {
  const R = lvl.tilemap.rows, C = lvl.tilemap.cols;
  const tm = lvl.tilemap;
  const open = new Set();                        // open channels / tokens
  let keysGot = 0;
  const has = (p) => powers.includes(p);
  const objs = lvl.objects;
  const colorOf = [lvl.players[0].baseChar.color, lvl.players[1].baseChar.color];
  const cellOf = (x, y) => [Math.floor(x / T), Math.floor(y / T)];

  // hazards per hero
  const hz = [new Set(), new Set()];
  for (const o of objs) {
    if (!(o instanceof O.Hazard)) continue;
    for (let r = Math.floor(o.y / T); r <= Math.floor((o.y + o.h - 1) / T); r++)
      for (let c = Math.floor(o.x / T); c <= Math.floor((o.x + o.w - 1) / T); c++) {
        const k = r * C + c;
        if (o.kind === "electric") hz[1].add(k);          // Nibihah fears lightning
        else if (o.kind === "poison") hz[0].add(k);       // Nichols fears poison
        else { hz[0].add(k); hz[1].add(k); }
      }
  }
  const doorOpen = (o) => {
    let sig = o.need ? o.need.every(g => g.some(c => open.has(c))) : o.channels ? o.channels.every(c => open.has(c)) : open.has(o.channel);
    if (o.invert) sig = !sig;                     // arena gates: open unless a fight is on
    return sig;
  };
  function grids(hero) {
    const S = new Uint8Array(R * C), OWt = new Uint8Array(R * C);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const id = tm.at(c, r);
      if (tm.isSolid(c, r)) S[r * C + c] = 1;
      else if (id === 7) OWt[r * C + c] = 1;
    }
    const stamp = (x, y, w, h, arr) => {
      for (let r = Math.floor(y / T); r <= Math.floor((y + h - 1) / T); r++)
        for (let c = Math.floor(x / T); c <= Math.floor((x + w - 1) / T); c++)
          if (r >= 0 && r < R && c >= 0 && c < C) arr[r * C + c] = 1;
    };
    for (const o of objs) {
      if (o instanceof O.Door) { if (!doorOpen(o)) stamp(o.x, o.y, o.w, o.h, S); }
      else if (o instanceof O.LockedDoor) { if (!open.has("LOCK:" + o.id)) stamp(o.x, o.y, o.w, o.h, S); }
      else if (o instanceof O.Barrier) { if (!open.has("BAR:" + o.id)) stamp(o.x, o.y, o.w, o.h, S); }
      else if (o instanceof O.Span) {
        const on = o.any ? o.any.some(c => open.has(c)) : open.has(o.channel);
        if (on !== !!o.invert) stamp(o.x, o.y, o.w, Math.min(o.h, 12), o.oneWay ? OWt : S);
      }
      else if (o instanceof O.Crumble || o instanceof O.Blinker || o instanceof O.HiddenPlatform) stamp(o.x, o.y, o.w, 12, OWt);
      else if (o instanceof O.NarrowGate) { if (hero === 0) stamp(o.x, o.y, o.w, o.h, S); }
      else if (o instanceof O.MovingPlatform && !(o instanceof O.Rotor)) { stamp(o.x0, o.y0, o.w, 12, OWt); stamp(o.x1, o.y1, o.w, 12, OWt); }
    }
    return { S, OWt };
  }
  function lifts() {
    const out = [];
    for (const o of objs) {
      if (o instanceof O.MovingPlatform && !(o instanceof O.Rotor)) {
        const a = [Math.floor((o.x0 + o.w / 2) / T), Math.floor(o.y0 / T) - 1];
        const b = [Math.floor((o.x1 + o.w / 2) / T), Math.floor(o.y1 / T) - 1];
        // every tile along the ride is a place you can hop off
        const n = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
        const pts = [];
        for (let i = 0; i <= n; i++) pts.push([Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n)]);
        for (let i = 0; i < pts.length - 1; i++) out.push([pts[i], pts[i + 1]]);
      }
    }
    return out;
  }
  function reach(hero, starts, boostFrom) {
    const { S, OWt } = grids(hero);
    const H = hz[hero];
    const P = (c, r) => r >= 0 && r < R && c >= 0 && c < C && !S[r * C + c] && !H.has(r * C + c);
    const standOn = (c, r) => r + 1 >= R || S[(r + 1) * C + c] || OWt[(r + 1) * C + c];
    const stand = (c, r) => P(c, r) && standOn(c, r);
    const land = (c, r) => { let rr = r; while (true) { if (!P(c, rr)) return null; if (stand(c, rr)) return [c, rr]; rr++; if (rr >= R) return null; } };
    const J = heroJumps(hero, powers);
    const wall = has("wallgrip");
    const chimney = (c, r) => {
      let l = 0, rt = 0;
      for (let d = 1; d <= 4; d++) if (!P(c - d, r)) { l = d; break; }
      for (let d = 1; d <= 4; d++) if (!P(c + d, r)) { rt = d; break; }
      // interior 2..4 tiles wide (a 1-tile slot is too tight to kick in)
      return l && rt && (l + rt) >= 3 && (l + rt) <= 5;
    };
    const seen = new Set(), stood = new Set(), q = [];
    const push = (t, standing) => { if (!t) return; const k = t[1] * C + t[0]; if (standing) stood.add(k); if (!seen.has(k)) { seen.add(k); q.push(t); } };
    for (const s0 of starts) push(land(s0[0], s0[1]), true);
    const L = lifts();
    const anchors = has("swing") && hero === 1 ? objs.filter(o => o instanceof O.SwingAnchor) : [];
    while (q.length) {
      const [c, r] = q.shift();
      const boosted = boostFrom && boostFrom.has(r * C + c) && stand(c, r);
      // measured: standing on a partner's head reaches a 4-tile ledge (7 with Sky Step)
      const maxH = boosted ? (J === JUMPS.base ? 4 : 7) : J.maxH;
      for (let h = 0; h <= maxH; h++) {
        if (h > 0 && !P(c, r - h)) break;
        const kMax = boosted && h > J.maxH ? 2 : J.k[Math.min(h, J.k.length - 1)];
        if (h > 0 && stand(c, r - h)) push([c, r - h], true);
        for (const d of [-1, 1]) for (let k = 1; k <= kMax; k++) {
          if (!P(c + d * k, r - h)) break;
          const t = land(c + d * k, r - h);
          if (t) push(t, true);
        }
      }
      // drop through a one-way ledge
      if (r + 1 < R && OWt[(r + 1) * C + c]) push(land(c, r + 1), true);
      // wall-grip chimneys
      // Wall Grip: jump into a chimney (its first rows within a jump) and kick
      // up it for as long as the walls continue
      if (wall) { let inChim = false;
        for (let up = 1; up <= 40; up++) {
          const rr = r - up; if (!P(c, rr)) break;
          if (chimney(c, rr)) { inChim = true; push([c, rr], false); }
          else if (inChim || up > 3) break;
        } }
      // lifts
      for (const [a, b] of L) for (const [p0, p1] of [[a, b], [b, a]]) {
        if (Math.abs(p0[0] - c) <= 2 && Math.abs(p0[1] - r) <= 2) push(land(p1[0], p1[1]) || [p1[0], p1[1]], true);
      }
      // swing rings (Nibihah)
      for (const an of anchors) {
        const ac = Math.floor(an.cx / T), ar = Math.floor(an.cy / T);
        if (Math.abs(c - ac) <= 5 && r - ar >= 0 && r - ar <= 7) {
          for (let dc = -10; dc <= 10; dc++) for (let dr = -1; dr <= 8; dr++) { const t = [ac + dc, ar + dr]; if (stand(t[0], t[1])) push(t, true); }
        }
      }
    }
    return { seen, stood, P, stand };
  }
  const near = (set, x, y, w, h, dx, dy) => {
    const c0 = Math.floor(x / T) - (dx || 0), c1 = Math.floor((x + (w || T) - 1) / T) + (dx || 0);
    const r0 = Math.floor(y / T) - (dy == null ? 1 : dy), r1 = Math.floor((y + (h || T) - 1) / T) + (dy == null ? 0 : dy);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (set.has(r * C + c)) return true;
    return false;
  };
  let A, B;
  for (let iter = 0; iter < 30; iter++) {
    A = reach(0, startTiles, null); B = reach(1, startTiles, null);
    // co-op boost: where both can stand, either can ride the other's head
    const both = new Set([...A.stood].filter(k => B.stood.has(k)));
    A = reach(0, startTiles, both); B = reach(1, startTiles, both);
    const both2 = new Set([...A.stood].filter(k => B.stood.has(k)));
    A = reach(0, startTiles, both2); B = reach(1, startTiles, both2);
    const heroSets = [A.stood, B.stood];
    let progress = false;
    const openCh = (ch) => { if (ch != null && !open.has(ch)) { open.add(ch); progress = true; } };
    for (const o of objs) {
      if (o instanceof O.GrappleLever) {
        if (near(A.stood, o.x, o.y, o.w, o.h, 1)) openCh(o.channel);
        else if (has("grapple")) {
          const lc = Math.floor(o.cx / T), lr = Math.floor(o.cy / T);
          for (const k of A.stood) { const c = k % C, r = (k / C) | 0; if (Math.abs(r - lr) <= 1 && Math.abs((c + 0.5) * T - o.cx) < (o.range || 200) - 12) { openCh(o.channel); break; } }
        }
      } else if (o instanceof O.Switch || o instanceof O.TimedSwitch || o instanceof O.RepairNode) {
        for (let h = 0; h < 2; h++) {
          if (o.colorLock && colorOf[h] !== o.colorLock) continue;
          if (o instanceof O.RepairNode && h !== 0) continue;
          if (near(heroSets[h], o.x, o.y, o.w, o.h, 0)) openCh(o.channel);
        }
      } else if (o instanceof O.Button) {
        if (!o.needsCrate) { if (near(A.stood, o.x, o.y - 8, o.w, 12, 0) || near(B.stood, o.x, o.y - 8, o.w, 12, 0)) openCh(o.channel); continue; }
        const bc = Math.floor(o.cx / T), br = Math.floor(o.y / T);
        const cargo = lvl.crates.filter(cr => (o.teleOnly ? cr.tele : !cr.tele));
        for (const cr of cargo) {
          if (cr.tele) {
            if (!has("tele")) continue;
            let ok1 = false, ok2 = false;
            for (const k of A.stood) { const c = k % C, r = (k / C) | 0;
              if (Math.hypot(c * T - cr.cx, r * T - cr.cy) < 210) ok1 = true;
              if (Math.abs(c - bc) <= 6 && r - br >= -2 && r - br <= 5) ok2 = true; }
            if (ok1 && ok2) openCh(o.channel);
          } else {
            if (!near(A.stood, cr.x, cr.y, cr.w, cr.h, 1)) continue;
            // pushing: only along the same floor, with nothing in the way
            const crR = Math.floor((cr.y + cr.h - 1) / T), plR = Math.floor((o.y + o.h - 1) / T);
            if (crR === plR) {
              const c0 = Math.min(Math.floor(cr.cx / T), bc), c1 = Math.max(Math.floor(cr.cx / T), bc);
              let flat = true;
              for (let c = c0; c <= c1; c++) if (!A.stand(c, plR)) { flat = false; break; }
              if (flat) { openCh(o.channel); break; }
            }
            // carrying (Strong Arms): anywhere he can walk to
            if (has("strongarms") && near(A.stood, o.x, o.y - 8, o.w, 12, 1)) { openCh(o.channel); break; }
            if (has("strongarms")) for (const k of A.stood) { const c = k % C, r = (k / C) | 0; if (Math.abs(c - bc) <= 7 && r - br >= 0 && r - br <= 7) { openCh(o.channel); break; } }
          }
        }
      } else if (o instanceof O.TandemPlate) {
        const a = { x: o.x, y: o.y - 8 }, b = { x: o.bx, y: o.by - 8 };
        const ok1 = near(A.stood, a.x, a.y, o.w, 12, 0) && near(B.stood, b.x, b.y, o.w, 12, 0);
        const ok2 = near(B.stood, a.x, a.y, o.w, 12, 0) && near(A.stood, b.x, b.y, o.w, 12, 0);
        if (ok1 || ok2) openCh(o.channel);
      } else if (o instanceof O.RuneSeq) {
        const good = o.pads.every(p => [0, 1].some(h => (!p.who || colorOf[h] === p.who) && near(heroSets[h], p.x, p.y - 8, p.w, 12, 0)));
        if (good) openCh(o.channel);
      } else if (o instanceof O.Key) {
        if (!open.has("KEY:" + o.id) && (near(A.stood, o.x, o.y, o.w, o.h, 0, 1) || near(B.stood, o.x, o.y, o.w, o.h, 0, 1))) { open.add("KEY:" + o.id); keysGot++; progress = true; }
      } else if (o instanceof O.Receptacle) {
        const bat = objs.find(b => b instanceof O.Battery && [0, 1].some(h => near(heroSets[h], b.x, b.y, b.w, b.h, 1, 1) && near(heroSets[h], o.x, o.y, o.w, o.h, 1)));
        if (bat) openCh(o.channel);
      } else if (O.LightReceiver && o instanceof O.LightReceiver) {
        // a sunbeam puzzle: whoever can stand at its turning mirror can aim it
        const m = lvl.byId(o.via);
        if (m && [0, 1].some(h => near(heroSets[h], m.x, m.y, m.w, m.h, 1, 1))) openCh(o.channel);
      } else if (o instanceof O.Barrier) {
        if (!has("arms") || open.has("BAR:" + o.id)) continue;
        const bc = Math.floor(o.cx / T), r0 = Math.floor(o.y / T), r1 = Math.floor((o.y + o.h - 1) / T);
        for (const set of heroSets) for (const k of set) { const c = k % C, r = (k / C) | 0; if (Math.abs(c - bc) <= 12 && r >= r0 && r <= r1) { open.add("BAR:" + o.id); progress = true; break; } }
      }
    }
    // locks open with collected keys (one each)
    const locks = objs.filter(o => o instanceof O.LockedDoor);
    const usedKeys = locks.filter(l => open.has("LOCK:" + l.id)).length;
    let spare = keysGot - usedKeys;
    for (const l of locks) if (spare > 0 && !open.has("LOCK:" + l.id) && (near(A.seen, l.x - T, l.y, l.w + 2 * T, l.h, 1) || near(B.seen, l.x - T, l.y, l.w + 2 * T, l.h, 1))) { open.add("LOCK:" + l.id); spare--; progress = true; }
    if (!progress) break;
  }
  return { A, B, open, C };
}

/* ---------------------------------------------------------------------
 * Checks per room
 * ------------------------------------------------------------------- */
const tileOfFeet = (a) => [Math.floor((a.x + 8) / T), Math.floor((a.y - 1) / T)];
if (require.main !== module) { module.exports = { solve, mkLevel, W, tileOfFeet, powersFor, GG }; return; }
let roomsChecked = 0, brokenRooms = 0;
for (const room of W.rooms) {
  const def = W.def(room.id);
  const tier = room.tier;
  const powers = powersFor(tier);
  const doors = room.doors;
  let roomOk = true;
  const entries = doors.map((d, i) => i).filter(i => {
    const d = doors[i];
    if (d.lock && d.host && !powers.includes(d.lock)) return false;   // can't come in through a gate you can't open
    return true;
  });
  if (!entries.length) entries.push(-1);
  for (const e of entries) {
    const lvl = mkLevel(room.id, e, powers);
    const starts = (e >= 0 ? def.arrivals[e] : def.arrivals[0] || [{ x: 3 * T, y: 16 * T }]).map(tileOfFeet);
    const res = solve(lvl, starts, powers);
    const C = res.C;
    const both = (t) => res.A.seen.has(t[1] * C + t[0]) && res.B.seen.has(t[1] * C + t[0]);
    const passages = lvl.objects.filter(o => o instanceof O.Passage);
    for (let di = 0; di < doors.length; di++) {
      const d = doors[di];
      const tgt = passTiles(passages.find(p => p.door === di), C);
      const reachBoth = tgt.some(both);
      if (d.lock && d.host && !powers.includes(d.lock)) {
        // must NOT be passable yet
        ok(!reachBoth, `room ${room.id} (${def.name}, r${room.region}) gate '${d.lock}' door ${di} is sealed without the power (entry ${e})`);
        // …and must open once the power is in hand
        const pw2 = powersFor(WG.POWER_ORDER.indexOf(d.lock) + 1);
        const lvl2 = mkLevel(room.id, e, pw2);
        const res2 = solve(lvl2, starts, pw2);
        const ok2 = tgt.some(t => res2.A.seen.has(t[1] * res2.C + t[0]) && res2.B.seen.has(t[1] * res2.C + t[0]));
        ok(ok2, `room ${room.id} (${def.name}, r${room.region}) gate '${d.lock}' door ${di} opens with the power (entry ${e})`);
        if (!ok2) roomOk = false;
      } else {
        ok(reachBoth, `room ${room.id} (${def.name}, r${room.region}, ${room.w}x${room.h}) both heroes reach door ${di} [${d.side}] from entry ${e}`);
        if (!reachBoth) roomOk = false;
      }
    }
    // every cell enterable
    for (const cell of room.cells) {
      const x0 = cell.i * WG.CW, y0 = cell.j * WG.CH;
      let hit = false;
      for (const k of res.A.seen) { const c = k % C, r = (k / C) | 0; if (c >= x0 && c < x0 + WG.CW && r >= y0 && r < y0 + WG.CH) { hit = true; break; } }
      if (!hit) for (const k of res.B.seen) { const c = k % C, r = (k / C) | 0; if (c >= x0 && c < x0 + WG.CW && r >= y0 && r < y0 + WG.CH) { hit = true; break; } }
      ok(hit, `room ${room.id} (${def.name}) cell ${cell.i},${cell.j} [${cell.content}] can be entered from entry ${e}`);
      if (!hit) roomOk = false;
    }
    // RETURN TRIPS — no soft-locks: from the deepest spot the heroes can
    // reach in every cell (and from the shrine), every doorway must still be
    // reachable. Otherwise dropping into a pit could strand the party.
    const samples = [];
    for (const cell of room.cells) {
      const x0 = cell.i * WG.CW, y0 = cell.j * WG.CH;
      let best = null;
      for (const k of res.A.stood) { const c = k % C, r = (k / C) | 0;
        if (c >= x0 && c < x0 + WG.CW && r >= y0 && r < y0 + WG.CH && res.B.stood.has(k) && (!best || r > best[1])) best = [c, r]; }
      if (best) samples.push(best);
    }
    for (const o of lvl.objects) if (o instanceof O.PowerShrine) samples.push([Math.floor(o.cx / T), Math.floor((o.y + o.h - 1) / T)]);
    for (const sp of samples) {
      const lvlR = mkLevel(room.id, e, powers);
      const back = solve(lvlR, [sp], powers);
      for (let di = 0; di < doors.length; di++) {
        const d = doors[di];
        if (d.lock && d.host && !powers.includes(d.lock)) continue;
        const tgt = passTiles(lvlR.objects.find(p => p instanceof O.Passage && p.door === di), back.C);
        const good = tgt.some(t => back.A.seen.has(t[1] * back.C + t[0]) && back.B.seen.has(t[1] * back.C + t[0]));
        ok(good, `room ${room.id} (${def.name}) from (${sp}) the heroes can get back to door ${di} [${d.side}] (entry ${e})`);
        if (!good) roomOk = false;
      }
    }
    for (const o of lvl.objects) if (o instanceof O.PowerShrine) {
      const t = [Math.floor(o.cx / T), Math.floor((o.y + o.h - 1) / T)];
      const r = [0, -1, 1, -2, 2].some(dc => both([t[0] + dc, t[1]]));
      ok(r, `room ${room.id} shrine reachable by both heroes`);
      if (!r) roomOk = false;
    }
    // hidden upgrades, storytellers and merchants can all be reached
    for (const o of lvl.objects) if ((O.Upgrade && o instanceof O.Upgrade) || (O.NPC && o instanceof O.NPC)) {
      const c0 = Math.floor(o.cx / T), r0 = Math.floor(o.cy / T);
      let got = false;
      // standing within a jump (3 tiles) below it, give or take a column
      for (let dr = -1; dr <= 3 && !got; dr++) for (let dc = -1; dc <= 1 && !got; dc++) { const k = (r0 + dr) * C + c0 + dc; if (res.A.seen.has(k) || res.B.seen.has(k)) got = true; }
      ok(got, `room ${room.id} (${def.name}) ${o.constructor.name} at ${c0},${r0} can be reached (entry ${e})`);
    }
  }
  roomsChecked++;
  if (!roomOk) brokenRooms++;
  if (VERBOSE && !roomOk) dump(room);
}
/** Standing tiles inside a doorway's trigger zone. */
function passTiles(p, C) {
  const out = [];
  for (let r = Math.floor(p.y / T); r <= Math.floor((p.y + p.h - 1) / T); r++)
    for (let c = Math.floor(p.x / T); c <= Math.floor((p.x + p.w - 1) / T); c++) out.push([c, r]);
  return out;
}
function near3(res, t, C) {
  // doorway targets: accept any standing tile within 1 column of the arrival
  for (const dc of [-1, 1, 2, -2]) { const k = t[1] * C + t[0] + dc; if (res.A.seen.has(k) && res.B.seen.has(k)) return true; }
  return false;
}
function dump(room) {
  const def = W.def(room.id);
  console.log(`--- room ${room.id} ${def.name} ${room.w}x${room.h} tier ${room.tier} cells: ${room.cells.map(c => c.content).join(",")}`);
  const g = def.tiles;
  const mark = {};
  for (const o of def.objects) mark[Math.floor((o.y + (o.h || T) - 1) / T) * 1000 + Math.floor(o.x / T)] = (o.type || "?")[0].toUpperCase();
  for (let r = 0; r < g.length; r++) {
    let s = "";
    for (let c = 0; c < g[0].length; c++) s += mark[r * 1000 + c] || (g[r][c] === 0 ? "." : g[r][c] === 7 ? "-" : "#");
    console.log(s);
  }
}

/* ---------------------------------------------------------------------
 * Simulation: every room, every arrival — nobody dies standing still for
 * 2 seconds, nothing throws; and every room renders.
 * ------------------------------------------------------------------- */
let simBad = 0;
for (const room of W.rooms) {
  const def = W.def(room.id);
  const powers = WG.POWER_ORDER.slice();
  for (let e = 0; e < Math.max(1, room.doors.length); e++) {
    const lvl = mkLevel(room.id, room.doors.length ? e : -1, powers);
    lvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
    let threw = null;
    // arrival grace: nothing may kill a hero who just walked in and hasn't moved yet
    try { for (let i = 0; i < 240; i++) lvl.step(1 / 120); } catch (err) { threw = err; }
    ok(!threw, `room ${room.id} simulates from entry ${e} ${threw ? threw.stack : ""}`);
    ok(lvl.deaths === 0, `room ${room.id} (${def.name}) nobody dies idling at entry ${e}`);
    if (lvl.deaths) simBad++;
    for (const p of lvl.players) ok(!p.dead && p.onGround, `room ${room.id} ${p.character.name} stands safely at entry ${e}`);
  }
  // render smoke
  const lvl = mkLevel(room.id, -1, powers);
  const ctx = H.el().getContext();
  let rthrew = null;
  try { lvl.renderBackground(ctx, lvl.cam); lvl.renderWorld(ctx, lvl.cam); lvl.renderLighting(ctx, lvl.cam, true, true); } catch (err) { rthrew = err; }
  ok(!rthrew, `room ${room.id} renders ${rthrew ? rthrew.stack : ""}`);
}

/* ---- world-level invariants ---------------------------------------- */
ok(W.rooms.filter(r => r.kind === "shrine").length === WG.POWER_ORDER.length, "one shrine per power");
ok(new Set(W.rooms.filter(r => r.kind === "shrine").map(r => r.power)).size === WG.POWER_ORDER.length, "every power has its shrine");
ok(W.totalCells >= 200, `the world is big: ${W.totalCells} screens across ${W.rooms.length} rooms`);
// doors are paired and consistent
for (const r of W.rooms) for (const d of r.doors) ok(W.rooms[d.to].doors.includes(d.pair) && d.pair.pair === d, `room ${r.id} door pairing`);
// every room reachable in the world graph once all powers are owned
{
  const seen = new Set([0]), q = [0];
  while (q.length) { const id = q.shift(); for (const d of W.rooms[id].doors) if (!seen.has(d.to)) { seen.add(d.to); q.push(d.to); } }
  ok(seen.size === W.rooms.length, `all ${W.rooms.length} rooms are connected`);
}
// progression: with powers gained in shrine order, every room opens up
{
  const owned = new Set(); let frontier = new Set([0]);
  for (let step = 0; step <= WG.POWER_ORDER.length; step++) {
    const q = [...frontier];
    while (q.length) { const id = q.shift(); for (const d of W.rooms[id].doors) { if (d.lock && !owned.has(d.lock)) continue; if (!frontier.has(d.to)) { frontier.add(d.to); q.push(d.to); } } }
    const shrines = W.rooms.filter(r => r.kind === "shrine" && frontier.has(r.id) && !owned.has(r.power));
    for (const s of shrines) owned.add(s.power);
    if (!shrines.length) break;
  }
  ok(frontier.size === W.rooms.length, `progression opens every room (${frontier.size}/${W.rooms.length}) and grants every power (${owned.size})`);
}

console.log(`\nworld: ${W.rooms.length} rooms, ${W.totalCells} screens · rooms checked ${roomsChecked}, broken ${brokenRooms}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
