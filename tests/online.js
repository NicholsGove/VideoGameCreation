/* =========================================================================
 * tests/online.js — online co-op checks (no network needed)
 * -------------------------------------------------------------------------
 * Run with:   node tests/online.js
 *
 *  1. Control ownership: online, Player 1 (host) is driven ONLY by the WASD
 *     set and Player 2 (client) ONLY by the arrow set — each machine ignores
 *     the other hero's keys entirely.
 *  2. Dropped packets never eat a press: the client sends running press
 *     counters and the host turns any increase into an edge.
 *  3. The open world stays in sync: a client mirroring the host's journey
 *     builds the SAME room (same object ids), so host snapshots apply 1:1,
 *     including creatures, shots in flight and doorway state.
 * ========================================================================= */
"use strict";
const H = require("./harness.js");
H.load([
  "core/utils.js", "core/events.js", "core/statemachine.js", "core/input.js", "core/storage.js", "core/camera.js", "core/particles.js",
  "core/weather.js", "entities/sprites.js", "world/objects.js", "world/creatures.js", "world/tilemap.js", "world/levels.js",
  "world/worldgen.js", "world/level.js", "world/decor.js", "world/guardians.js", "entities/player.js", "world/world.js", "net/network.js", "game.js",
]);
const GG = global.GG;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const inp = GG.input;
const press = (code) => { inp._handleDown({ code, preventDefault() {} }); };
const release = (code) => { inp._handleUp({ code }); };

/* ---- 1. control ownership ------------------------------------------ */
press("ArrowLeft"); press("ArrowUp");
let p1 = inp.snapshotOnline(0), p2 = inp.snapshotOnline(1);
ok(!p1.left && !p1.jumpPressed, "Player 1 (host) ignores the arrow keys");
ok(p2.left && p2.jumpPressed, "Player 2 (client) moves with the arrow keys");
inp.endFrame(); release("ArrowLeft"); release("ArrowUp");
press("KeyA"); press("KeyW"); press("KeyE"); press("KeyQ");
p1 = inp.snapshotOnline(0); p2 = inp.snapshotOnline(1);
ok(p1.left && p1.jumpPressed && p1.attackPressed && p1.specialPressed, "Player 1 moves, jumps, shoots and uses powers with WASD + E/Q");
ok(!p2.left && !p2.jumpPressed && !p2.attackPressed && !p2.specialPressed, "Player 2 ignores WASD + E/Q");
inp.endFrame(); ["KeyA", "KeyW", "KeyE", "KeyQ"].forEach(release);
press("ShiftRight"); press("Period"); press("ArrowDown");
p1 = inp.snapshotOnline(0); p2 = inp.snapshotOnline(1);
ok(p2.specialPressed && p2.attackPressed && p2.action && p2.down, "Player 2 has special, attack and action on R-Shift / . / ↓");
ok(!p1.specialPressed && !p1.attackPressed && !p1.action, "…and Player 1 cannot trigger them");
inp.endFrame(); ["ShiftRight", "Period", "ArrowDown"].forEach(release);
press("KeyX"); press("ShiftLeft");
p1 = inp.snapshotOnline(0); p2 = inp.snapshotOnline(1);
ok(p1.meleePressed && p1.dodgePressed && !p2.meleePressed && !p2.dodgePressed, "Player 1 strikes (X) and rolls (L-Shift); Player 2 can't use those keys");
inp.endFrame(); ["KeyX", "ShiftLeft"].forEach(release);
press("Comma"); press("ControlRight");
p1 = inp.snapshotOnline(0); p2 = inp.snapshotOnline(1);
ok(p2.meleePressed && p2.dodgePressed && !p1.meleePressed && !p1.dodgePressed, "Player 2 strikes (,) and rolls (R-Ctrl); Player 1 can't use those keys");
inp.endFrame(); ["Comma", "ControlRight"].forEach(release);
// the game uses the right set for each role
GG.game.role = "host"; press("ArrowRight"); ok(!GG.game._buildLocalInput().right, "host machine: arrows do nothing"); inp.endFrame(); release("ArrowRight");
GG.game.role = "client"; press("KeyD"); ok(!GG.game._buildLocalInput().right, "client machine: WASD does nothing"); inp.endFrame(); release("KeyD");
GG.game.role = "client"; press("ArrowRight"); ok(GG.game._buildLocalInput().right, "client machine: arrows steer Player 2"); inp.endFrame(); release("ArrowRight");

/* ---- 2. press counters --------------------------------------------- */
GG.game._wireNet();
const host = GG.net._handlers.input;
GG.game._edgeBuf = [{}, {}]; GG.game._remoteSeen = null;
host({ left: false, nj: 0, ns: 0, na: 0, np: 0, nm: 0, nd: 0 });
host({ left: false, nj: 0, ns: 0, na: 0, np: 0, nm: 1, nd: 1 });
ok(GG.game._edgeBuf[1].melee && GG.game._edgeBuf[1].dodge, "strike and roll presses survive dropped packets too");
GG.game._edgeBuf = [{}, {}]; GG.game._remoteSeen = null;
host({ left: false, nj: 0, ns: 0, na: 0, np: 0 });
ok(!GG.game._edgeBuf[1].jump, "no press, no jump");
// the packet carrying the press (nj=1) is LOST; a later one arrives with nj=1
host({ left: false, nj: 1, ns: 0, na: 0, np: 0 });
ok(GG.game._edgeBuf[1].jump, "a jump survives a dropped packet (counter went up)");
GG.game._edgeBuf = [{}, {}];
host({ left: false, nj: 1, ns: 0, na: 0, np: 0 });
ok(!GG.game._edgeBuf[1].jump, "the same counter doesn't jump twice");
host({ left: false, nj: 1, ns: 1, na: 2, np: 0 });
ok(GG.game._edgeBuf[1].special && GG.game._edgeBuf[1].attack, "special and attack presses arrive too");

/* ---- 3. open-world sync -------------------------------------------- */
const W = GG.WORLDGEN.generate();
const cam = () => new GG.Camera(960, 540);
GG.world.begin(true);
GG.world.state.powers = GG.WORLDGEN.POWER_ORDER.slice(0, 4);
// pick a room with creatures to make it interesting
const roomId = W.rooms.findIndex(r => r.id > 0 && W.def(r.id).objects.some(o => ["beetle", "toad", "moth", "bat", "spitter"].includes(o.type)));
const door = W.rooms[roomId].doors.length ? 0 : -1;
const hostLvl = GG.world.makeLevel(roomId, door, cam(), new GG.Particles(10), [0, 1]);
const IDLE = { left: false, right: false, up: false, down: false, jumpPressed: false, action: false, special: false, specialPressed: false, attackPressed: false };
hostLvl.players.forEach(p => (p.input = Object.assign({}, IDLE)));
hostLvl.players[0].input.attackPressed = true;
for (let i = 0; i < 240; i++) { hostLvl.step(1 / 120); hostLvl.players[0].input.attackPressed = i % 50 === 0; }
const info = GG.world.syncInfo();
const snap = JSON.parse(JSON.stringify(hostLvl.snapshot()));
// the client machine
const saveHost = GG.world.state;
GG.world.state = null;
GG.world.mirror(info);
ok(GG.world.remote, "client mirrors the host's journey (never saves)");
ok(JSON.stringify(GG.world.state.powers) === JSON.stringify(saveHost.powers), "client knows the host's powers");
const cliLvl = GG.world.makeLevel(info.room, info.door, cam(), new GG.Particles(10), [0, 1]);
const ids = (l) => l.objects.map(o => o.id).join(",");
ok(ids(cliLvl) === ids(hostLvl), "client builds the identical room (same object ids)");
cliLvl.applySnapshot(snap);
let same = 0, total = 0;
for (const o of hostLvl.objects) {
  const a = o.getState ? JSON.stringify(o.getState()) : null;
  const b = cliLvl.byId(o.id) && cliLvl.byId(o.id).getState ? JSON.stringify(cliLvl.byId(o.id).getState()) : null;
  if (a !== null) { total++; if (a === b) same++; }
}
ok(total > 0 && same === total, `every object's state matches after one snapshot (${same}/${total})`);
ok(cliLvl.projectiles.length === hostLvl.projectiles.length, "shots in flight are mirrored");
ok(cliLvl.players[0].character.canShoot === true, "client applies the journey's powers to its heroes");
// rendering the client view (toad beams are rebuilt from synced state)
let threw = null;
try { cliLvl.renderWorld(H.el().getContext(), cliLvl.cam); } catch (e) { threw = e; }
ok(!threw, "client renders the mirrored room " + (threw ? threw.stack : ""));

/* ---- 4. a guardian fight and its escape, seen from the client ------- */
{
  GG.world.remote = false; GG.world.begin(true);
  const shrine = W.rooms.find(r => r.kind === "shrine" && r.region === 2);
  GG.world.state.powers = GG.WORLDGEN.POWER_ORDER.slice(0, 2);
  const hL = GG.world.makeLevel(shrine.id, 0, cam(), new GG.Particles(10), [0, 1]);
  hL.players.forEach((p, i) => { p.input = Object.assign({}, IDLE); p.x = (12 + i * 2) * 32; p.y = 16 * 32 - p.h - 1; p.invuln = 99; });
  for (let i = 0; i < 900; i++) hL.step(1 / 120);                  // the Thorn Queen wakes and summons
  const gd = hL.objects.find(o => o.guardian);
  const inf2 = GG.world.syncInfo(), sn2 = JSON.parse(JSON.stringify(hL.snapshot()));
  GG.world.state = null; GG.world.mirror(inf2);
  const cL = GG.world.makeLevel(inf2.room, 0, cam(), new GG.Particles(10), [0, 1]);
  cL.applySnapshot(sn2);
  const cg = cL.objects.find(o => o.guardian);
  ok(gd.awake && cg.st === gd.st && Math.abs(cg.hp - gd.hp) < 0.01, `client sees the guardian fight (${cg.st}, hp ${Math.round(cg.hp)})`);
  const hostDyn = hL.objects.filter(o => o.minionOf != null).length;
  ok(cL.objects.filter(o => o.minionOf != null || (hL.byId(o.id) && hL.byId(o.id).minionOf != null)).length >= hostDyn, `summoned minions appear on the client too (${hostDyn})`);
  // escape: the host claims, the client sees the wall coming
  GG.world.remote = false; GG.world.state = GG.world.state || {}; 
  gd.takeHit(hL, 9999, 1);
  const esc = hL.objects.find(o => o instanceof GG.obj.EscapeRun);
  hL.setChannel(esc.channel, true);
  for (let i = 0; i < 480; i++) hL.step(1 / 120);
  cL.applySnapshot(JSON.parse(JSON.stringify(hL.snapshot())));
  const ce = cL.objects.find(o => o instanceof GG.obj.EscapeRun);
  ok(esc.state === 1 && ce.state === 1 && Math.abs(ce.front - esc.front) < 2, "client sees the escape wall where the host has it");
  ok(esc.saveState() === 2, "an escape in progress saves as done (you left through the door)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
