/* =========================================================================
 * tests/journey.js — rewards, save slots and replay
 * -------------------------------------------------------------------------
 * Run with:   node tests/journey.js
 *
 * Checks the open-world bookkeeping around the adventure itself: hidden
 * upgrades raise hearts and energy, the merchant takes gems, save slots are
 * independent, New Game+ carries outfits and toughens the world, shrines you
 * already own don't bring their guardian back, fast travel lists safe
 * shrines, the map's secret counts add up, and settings like Assist mode and
 * colourblind mode take effect.
 * ========================================================================= */
"use strict";
const H = require("./harness.js");
H.load([
  "core/utils.js", "core/events.js", "core/statemachine.js", "core/input.js", "core/storage.js", "core/camera.js", "core/particles.js",
  "core/weather.js", "entities/sprites.js", "world/objects.js", "world/creatures.js", "world/tilemap.js", "world/levels.js",
  "world/worldgen.js", "world/level.js", "world/decor.js", "world/guardians.js", "entities/player.js", "world/world.js",
]);
const GG = global.GG, WG = GG.WORLDGEN, O = GG.obj, T = GG.C.TILE;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const W = GG.world;
const mk = (room, door) => W.makeLevel(room, door == null ? -1 : door, new GG.Camera(960, 540), new GG.Particles(20), [0, 1]);

/* ---- save slots ------------------------------------------------------ */
W.useSlot(1); W.begin(true); W.state.gems = 5; W.persist();
W.useSlot(2); W.begin(true); W.state.gems = 50; W.state.powers.push("arms"); W.persist();
ok(localStorage.getItem("echoes_world_save_v1") && localStorage.getItem("echoes_world_save_v1_s2"), "slots 1 and 2 are saved under their own keys");
W.useSlot(1); W.begin(false);
ok(W.state.gems === 5 && W.state.powers.length === 0, "slot 1 keeps its own journey");
ok(W.slotInfo(2).powers === 1 && W.slotInfo(3) === null, "slot info: slot 2 has a power, slot 3 is empty");
W.wipe(2); ok(W.slotInfo(2) === null, "a slot can be erased");

/* ---- upgrades: hearts and energy ------------------------------------- */
W.useSlot(1); W.begin(true);
let lvl = mk(0);
ok(lvl.players.every(p => p.maxHp === 3 && p.hp === 3), "heroes start with 3 hearts");
const up = W.world.extras.list;
ok(up.filter(u => u.kind === "heart").length >= 8 && up.filter(u => u.kind === "energy").length >= 6, `upgrades hidden: ${up.filter(u => u.kind === "heart").length} heart crystals, ${up.filter(u => u.kind === "energy").length} energy cells`);
GG.bus.emit("upgrade:found", { uid: up[0].uid, kind: "heart" });
ok(lvl.players.every(p => p.maxHp === 4 && p.hp === 4), "a Heart Crystal gives BOTH heroes another heart");
const eu = up.find(u => u.kind === "energy");
GG.bus.emit("upgrade:found", { uid: eu.uid, kind: "energy" });
ok(lvl.energyMax === 120, "an Energy Cell grows the shared energy pool");
// a room remembers its taken upgrade
const ur = W.world.rooms[up[0].room];
const lvlU = mk(ur.id, 0);
const upObj = lvlU.objects.find(o => o instanceof O.Upgrade && o.uid === up[0].uid);
ok(upObj && upObj.taken, "a found upgrade stays found");

/* ---- merchant ---------------------------------------------------------- */
W.state.gems = 40;
ok(W.wallet === 40, "wallet shows gems not yet spent");
ok(W.buy(30) && W.wallet === 10, "buying spends gems");
ok(!W.buy(30) && W.wallet === 10, "you can't buy what you can't afford");
W.state.perks.skin = 1; W.applyPowers(lvl);
ok(lvl.players[0].maxHp === 5, "Thick Skin adds a heart");
W.state.perks.hitter = 1; W.state.perks.magnet = 1; W.state.perks.recover = 1; W.applyPowers(lvl);
ok(lvl.meleeMul === 1.5 && lvl.magnet > 0 && lvl.energyRegen > 1, "Heavy Hitter, Gem Magnet and Quick Recovery take effect");
W.state.outfits.owned.crown = 1; W.state.outfits.wear = ["crown", null]; W.applyPowers(lvl);
ok(lvl.players[0].outfit === "crown" && !lvl.players[1].outfit, "outfits are worn by the hero you choose");

/* ---- guardians remember -------------------------------------------- */
const shrine = W.world.rooms.find(r => r.kind === "shrine" && r.region === 0);
let ls = mk(shrine.id, 0);
ok(ls.objects.find(o => o.guardian).alive, "an unclaimed shrine has its guardian");
ok(ls.objects.find(o => o instanceof O.PowerShrine).taken === false, "…and its power waits");
W.state.powers.push("arms");
ls = mk(shrine.id, 0);
ok(!ls.objects.find(o => o.guardian).alive, "once the power is yours the guardian doesn't come back");
ok(ls.objects.find(o => o instanceof O.EscapeRun).state === 2, "…and the escape doesn't replay");
GG.bus.emit("boss:defeated", { region: 0 });
ok(W.state.bosses[0] === 1, "beating a guardian is remembered");

/* ---- fast travel ------------------------------------------------------ */
for (const c of W.world.cells) if (c.room === shrine.id || c.room === 0) W.state.disc[c.key] = 1;
const spots = W.travelSpots();
ok(spots.some(s => s.room === shrine.id) && spots.some(s => s.room === 0), "fast travel lists the start and a safe shrine");
ok(W.canFastTravelFrom(shrine.id) && W.canFastTravelFrom(0) && !W.canFastTravelFrom(1), "fast travel only from a shrine or the start");

/* ---- map secrets -------------------------------------------------------- */
const sec = W.secrets();
ok(sec.length === 8 && sec.every(r => r.gemsT > 0 && r.upT >= 1), "every region counts its gems and upgrades for the map");

/* ---- New Game+ ---------------------------------------------------------- */
W.state.done = true; W.persist();
W.begin(true, { ng: true });
ok(W.state.ng === 1 && W.state.outfits.owned.crown && W.state.powers.length === 0, "New Game+ starts over, keeps outfits");
const nr = W.world.rooms.find(r => r.kind === "normal" && W.world.def(r.id).objects.some(o => o.type === "beetle"));
const base = W.world.def(nr.id).objects.find(o => o.type === "beetle");
const lng = mk(nr.id, 0);
const bug = lng.objects.find(o => o instanceof O.Beetle);
ok(bug.maxHp > 4 * (base.tough || 1) * 1.4, "New Game+ beasts are tougher");
ok(lng.hazardScale > 1, "New Game+ traps cycle faster");

/* ---- settings ------------------------------------------------------------ */
GG.save.settings.gameplay.assist = true; W.state.ng = 0; W.applyPowers(lng);
ok(lng.players[0].maxHp === 3 + W.count("heart") + 2 && lng.hazardScale < 1, "Assist mode: +2 hearts and slower traps");
GG.save.settings.gameplay.assist = false;
GG.setColorblind(true);
ok(O.COLORS.red.main !== "#ff5a6a" && GG.colorblind, "colourblind mode swaps the palette");
GG.setColorblind(false);
ok(O.COLORS.red.main === "#ff5a6a", "…and swaps it back");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
