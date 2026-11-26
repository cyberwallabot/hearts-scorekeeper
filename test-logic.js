"use strict";

const assert = require("assert");
const L = require("./hearts-logic");

function eq(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, msg);
}

// Pass direction cycles left, right, across, hold
eq(L.passForRound(0), "left");
eq(L.passForRound(1), "right");
eq(L.passForRound(2), "across");
eq(L.passForRound(3), "hold");
eq(L.passForRound(4), "left");
eq(L.passForRound(7), "hold");
assert.ok(L.passLabel("left").toLowerCase().includes("left"));
assert.ok(L.passLabel("hold").toLowerCase().includes("hold"));

// Regular round validation
eq(L.validateRoundScores([5, 8, 0, 13]).ok, true);
eq(L.validateRoundScores([5, 8, 0, 13]).total, 26);
eq(L.validateRoundScores([0, 0, 0, 26]).ok, true);
eq(L.validateRoundScores([7, 7, 7, 4]).ok, false);
assert.ok(L.validateRoundScores([7, 7, 7, 4]).error.includes("26"));
eq(L.validateRoundScores([7, 7, 7, 4]).total, 25);
eq(L.validateRoundScores([-1, 9, 9, 9]).ok, false);
eq(L.validateRoundScores([27, 0, 0, -1]).ok, false);
eq(L.validateRoundScores([1.5, 8.5, 8, 8]).ok, false);
eq(L.validateRoundScores([6, 6, 6]).ok, false);
eq(L.validateRoundScores(null).ok, false);

// Moon scoring
eq(L.moonScores(0, "add"), [0, 26, 26, 26]);
eq(L.moonScores(2, "add"), [26, 26, 0, 26]);
eq(L.moonScores(1, "subtract"), [0, -26, 0, 0]);
eq(L.moonScores(3, "subtract"), [0, 0, 0, -26]);
eq(L.moonScores(0, "add").reduce((a, b) => a + b, 0), 78);
eq(L.moonScores(0, "subtract").reduce((a, b) => a + b, 0), -26);

// looksLikeMoon
eq(L.looksLikeMoon([26, 0, 0, 0]), { match: true, shooter: 0 });
eq(L.looksLikeMoon([0, 0, 0, 26]), { match: true, shooter: 3 });
eq(L.looksLikeMoon([13, 13, 0, 0]), { match: false, shooter: -1 });
eq(L.looksLikeMoon([0, 26, 0, 26]), { match: false, shooter: -1 });
eq(L.looksLikeMoon([0, 0, 0, 0]), { match: false, shooter: -1 });

// Totals, leaders, game end
const rounds = [
  { scores: [5, 8, 0, 13] },
  { scores: [10, 2, 4, 10] },
];
eq(L.totals(rounds), [15, 10, 4, 23]);
eq(L.leaders(L.totals(rounds)), [2]);
eq(L.isGameOver(L.totals(rounds), 100), false);
eq(L.winners(L.totals(rounds), 100), []);

const almost = [
  { scores: [0, 26, 26, 26] }, // moon add, player 0
  { scores: [0, 26, 26, 26] },
  { scores: [0, 26, 26, 26] },
  { scores: [0, 26, 26, 26] },
];
eq(L.totals(almost), [0, 104, 104, 104]);
eq(L.isGameOver(L.totals(almost), 100), true);
eq(L.winners(L.totals(almost), 100), [0]);
eq(L.leaders(L.totals(almost)), [0]);

// Subtract moon can go negative and still lead
const sub = [{ scores: L.moonScores(1, "subtract") }, { scores: [10, 4, 6, 6] }];
eq(L.totals(sub), [10, -22, 6, 6]);
eq(L.leaders(L.totals(sub)), [1]);
eq(L.isGameOver([10, -22, 6, 100], 100), true);
eq(L.winners([10, -22, 6, 100], 100), [1]);

// Tie for lead and tie for win
eq(L.leaders([20, 12, 12, 30]), [1, 2]);
eq(L.isGameOver([100, 100, 80, 90], 100), true);
eq(L.winners([100, 100, 80, 90], 100), [2]);
eq(L.winners([100, 85, 85, 110], 100), [1, 2]);
eq(L.isGameOver([99, 99, 99, 99], 100), false);

// Edit/delete recalculation: remove a middle round
const three = [
  { scores: [5, 5, 8, 8] },
  { scores: [13, 0, 13, 0] },
  { scores: [0, 16, 4, 6] },
];
eq(L.totals(three), [18, 21, 25, 14]);
const deleted = [three[0], three[2]];
eq(L.totals(deleted), [5, 21, 12, 14]);
const edited = [three[0], { scores: [1, 2, 3, 20] }, three[2]];
eq(L.totals(edited), [6, 23, 15, 34]);

// Names
eq(L.normalizeName("  Amy  ", "Player 1"), "Amy");
eq(L.normalizeName("   ", "Player 2"), "Player 2");
eq(L.normalizeName("", "Player 3"), "Player 3");

console.log("All logic tests passed (" + 20 + "+ cases).");

// --- Slider clamp: max is exactly 26 minus others' set values ---
eq(L.otherSetSum([null, 4, 3, 0], 0), 7);
eq(L.sliderBounds([null, 4, 3, 0], 0), { min: 0, max: 19 });
eq(L.clampScore(100, [null, 4, 3, 0], 0), 19, "full-right / overflow lands on the rest, 19");
eq(L.clampScore(-5, [null, 4, 3, 0], 0), 0);
eq(L.clampScore(19, [null, 4, 3, 0], 0), 19);
eq(L.clampScore(18, [null, 4, 3, 0], 0), 18);
eq(L.sliderBounds([null, null, null, null], 2), { min: 0, max: 26 });
eq(L.sliderBounds([10, null, 6, null], 1), { min: 0, max: 10 });
eq(L.sliderBounds([10, 10, 6, null], 3), { min: 0, max: 0 });
eq(L.clampScore(5, [10, 10, 6, null], 3), 0);
eq(L.sliderBounds([26, null, null, null], 1), { min: 0, max: 0 });
eq(L.otherSetSum([null, null, 13, null], 0), 13);
eq(L.sliderBounds([null, null, 13, null], 0), { min: 0, max: 13 });

// Unknowns do not shrink the max; only set values count
eq(L.sliderBounds([null, 4, null, 3], 0), { min: 0, max: 19 });

// Assigning a value clamps only that player to the remaining points
eq(L.assignScore([null, 4, 3, 0], 0, 100), [19, 4, 3, 0]);
eq(L.assignScore([null, 4, 3, 0], 0, 19), [19, 4, 3, 0]);
eq(L.assignScore([null, 4, 3, 0], 0, -2), [0, 4, 3, 0]);
eq(L.clearScore([19, 4, 3, 0], 0), [null, 4, 3, 0]);
// Sanitize an impossible last value without shrinking the others
eq(L.reclampScores([4, 3, 0, 30]), [4, 3, 0, 19]);
eq(L.knownCount([4, 3, 0, null]), 3);
eq(L.knownCount([null, null, null, null]), 0);

// Applying a full-right value equals the rest when three are set to 4, 3, 0
(function () {
  var values = [null, 4, 3, 0];
  var b = L.sliderBounds(values, 0);
  eq(b.max, 19, "Confirmed example: others 4, 3, 0 → max 19");
  eq(L.clampScore(b.max, values, 0), 19);
  eq(4 + 3 + 0 + b.max, 26, "rest completes the hand");
})();

// --- Velocity-sensitive jog ---
eq(L.JOG_BASE_PX, 12);
// Slow: 12px in 200ms → 0.06 px/ms, gain ~1, exactly 1 point
(function () {
  var slow = L.applyJog(12, 200, 0);
  eq(slow.delta, 1, "slow 12px is one point");
  assert.ok(slow.gain < 1.3, "slow gain stays near 1, got " + slow.gain);
  var almost = L.applyJog(11, 200, 0);
  eq(almost.delta, 0, "slow 11px stays on the same point");
  assert.ok(almost.accum > 0);
  var two = L.applyJog(24, 400, 0);
  eq(two.delta, 2, "slow 24px is two points");
  var left = L.applyJog(-12, 200, 0);
  eq(left.delta, -1, "slide left lowers");
})();

// Fast: same 12px in 8ms → 1.5 px/ms, high gain, several points
(function () {
  var fast = L.applyJog(12, 8, 0);
  assert.ok(fast.gain > 2, "fast gain accelerates, got " + fast.gain);
  assert.ok(fast.delta > 1, "fast 12px covers more than 1 point, got " + fast.delta);
  var slow = L.applyJog(12, 200, 0);
  assert.ok(fast.delta > slow.delta, "faster movement yields a bigger delta");
})();

// applyJogToValue clamps to the rest
(function () {
  var values = [0, 4, 3, 0];
  // huge rightward flick from 0 must stop at 19, not 26
  var r = L.applyJogToValue(0, values, 0, 2000, 16, 0);
  eq(r.value, 19, "jog overflow clamps to the rest (19)");
  var down = L.applyJogToValue(3, values, 0, -2000, 16, 0);
  eq(down.value, 0, "jog overflow left clamps to 0");
})();

console.log("Clamp and velocity tests passed.");

// ================= Table-top additions =================

// --- Direction is relative to each player's orientation (their right is "more") ---
eq(L.localDx(30, 0, 0), 30, "bottom: screen right is more");
eq(L.localDx(30, 0, 180), -30, "top: screen right is LESS");
eq(L.localDx(-30, 0, 180), 30, "top: screen left is MORE");
eq(L.localDx(0, 30, 90), 30, "left player: screen down is more");
eq(L.localDx(0, -30, 90), -30, "left player: screen up is less");
eq(L.localDx(0, -30, 270), 30, "right player: screen up is more");
eq(L.localDx(0, 30, 270), -30, "right player: screen down is less");
eq(L.localDx(30, 0, 90), 0, "left player ignores sideways motion");
eq(L.localDx(30, 0, 360), 30, "rotation wraps");
eq(L.localDx(0, 30, 450), 30, "450 is the same as 90");

// --- jogStep: slow = 1 point per 12px, clamps, max = the rest ---
(function () {
  var b19 = L.sliderBounds([null, 4, 3, 0], 0);
  eq(b19, { min: 0, max: 19 });
  var st = { value: 0, accum: 0, over: 0 };
  var s = L.jogStep(st, b19, 12, 200);
  eq(s.value, 1, "12px slow = 1 point");
  eq(s.over, 0);
  s = L.jogStep({ value: 0, accum: 0, over: 0 }, b19, 24, 400);
  eq(s.value, 2, "24px slow = 2 points");

  // exact travel to the end lands on the rest, with no overshoot
  s = L.jogStep({ value: 0, accum: 0, over: 0 }, b19, 19 * 12, 4000);
  eq(s.value, 19, "full travel lands exactly on 19 (the rest)");
  eq(s.over, 0, "reaching the end is not overshoot");
  eq(s.moon, false);

  // below the threshold: still just 19
  s = L.jogStep(s, b19, L.MOON_OVERSHOOT_PX - 1, 4000);
  eq(s.value, 19, "value pinned at the rest while overshooting");
  eq(s.over, L.MOON_OVERSHOOT_PX - 1);
  eq(s.moon, false, "one pixel short of the moon");
  s = L.jogStep(s, b19, 1, 100);
  eq(s.moon, true, "threshold reached triggers the moon");
  eq(s.value, 19, "and the number never exceeds the rest");

  // pulling back reduces overshoot first, the value stays at the rest
  s = L.jogStep({ value: 19, accum: 0, over: 80 }, b19, -50, 4000);
  eq(s.over, 30);
  eq(s.value, 19);
  // pulling back past zero overshoot starts lowering the value again
  s = L.jogStep({ value: 19, accum: 0, over: 30 }, b19, -30 - 24, 4000);
  eq(s.over, 0);
  eq(s.value, 17, "back past the end lowers the value");

  // left end clamps at 0
  s = L.jogStep({ value: 2, accum: 0, over: 0 }, b19, -400, 4000);
  eq(s.value, 0);
  eq(s.over, 0);
  assert.ok(s.accum >= 0, "no negative leftover at zero");
})();

// --- a fast flick does not count the distance used up reaching the end ---
(function () {
  var b = { min: 0, max: 19 };
  // 160px at ~10px/ms: gain is capped at 5, so 160 * 5 = 800 gained px, 228 needed.
  var s = L.jogStep({ value: 0, accum: 0, over: 0 }, b, 160, 16);
  eq(s.value, 19, "fast flick reaches the rest");
  assert.ok(s.gain > 4 && s.gain <= 5, "gain capped at 5, got " + s.gain);
  var usedRaw = (19 * L.JOG_BASE_PX) / s.gain;
  assert.ok(Math.abs(s.over - (160 - usedRaw) / s.gain) < 1e-6, "over is only the leftover, at walking pace: " + s.over);
  assert.ok(s.over < L.MOON_OVERSHOOT_PX, "a normal full-right flick must not trigger the moon");
})();

// --- the max shrinks as other players set values: always 26 minus the others ---
(function () {
  eq(L.sliderBounds([null, null, null, null], 0).max, 26);
  eq(L.sliderBounds([null, 10, null, null], 0).max, 16);
  eq(L.sliderBounds([null, 10, 6, null], 0).max, 10);
  eq(L.sliderBounds([null, 10, 6, 7], 0).max, 3);
  // someone else grows while we hold a value: our value is pulled to the new max
  var s = L.jogStep({ value: 12, accum: 0, over: 0 }, { min: 0, max: 8 }, 0, 16);
  eq(s.value, 8, "stale value is clamped to the live max");
  // zero left: pushing right is immediately overshoot
  s = L.jogStep({ value: 0, accum: 0, over: 0 }, { min: 0, max: 0 }, 10, 4000);
  eq(s.value, 0);
  eq(s.over, 10);
})();

// --- shuffle bag: no repeats until all have played ---
(function () {
  var ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"];
  var seed = 7;
  function rng() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  var bag = [];
  var last = null;
  var seen = [];
  var r, k, run;
  for (run = 0; run < 5; run++) {
    seen = [];
    for (k = 0; k < ids.length; k++) {
      r = L.nextFromBag(bag, ids, rng, last);
      assert.ok(ids.indexOf(r.id) !== -1, "valid id");
      assert.ok(seen.indexOf(r.id) === -1, "repeat inside a bag: " + r.id + " in " + seen);
      seen.push(r.id);
      if (k === 0 && run > 0) assert.notStrictEqual(r.id, last, "first of a new bag never repeats the last one");
      bag = r.bag;
      last = r.id;
    }
    eq(seen.length, ids.length, "every animation played once");
    eq(bag.length, 0, "bag empty after all played");
  }
  // survives a stale/unknown bag from localStorage
  r = L.nextFromBag(["zzz", "a"], ids, rng, null);
  eq(r.id, "a");
  r = L.nextFromBag(["zzz"], ids, rng, null);
  assert.ok(ids.indexOf(r.id) !== -1);
  eq(r.bag.length, ids.length - 1);
})();

console.log("Table-top logic tests passed.");

/* ---------------- v4: history, stats, undo/redo ---------------- */
(function () {
  // dealer rotation + pass targets
  eq([0, 1, 2, 3, 4, 5].map(function (k) { return L.dealerForRound(0, k); }), [0, 1, 2, 3, 0, 1]);
  eq(L.dealerForRound(2, 3), 1);
  eq(L.passTarget(0, "left"), 1); eq(L.passTarget(0, "right"), 3); eq(L.passTarget(0, "across"), 2);
  eq(L.passTarget(3, "left"), 0); eq(L.passTarget(1, "hold"), null);

  // new game + sanitize (migration from the v1 localStorage shape)
  var g = L.newGameState({ players: ["Maya", " ", "Priya", "Jon"], target: 50, firstDealer: 6, now: 1000, id: "g1" });
  eq(g.players, ["Maya", "Player 2", "Priya", "Jon"]);
  eq([g.target, g.firstDealer, g.startedAt, g.id, g.version, g.started], [50, 2, 1000, "g1", 2, true]);
  var v1 = { version: 1, started: true, players: ["A", "B", "C", "D"], target: 100, moonMode: "subtract",
    rounds: [{ scores: [1, 2, 3, 20], pass: "left" }, { scores: [1, 2], pass: "left" }, { scores: [-26, 0, 0, 0], moon: 0, pass: "right" }] };
  var m = L.sanitizeState(v1, 5000);
  eq(m.version, 2); eq(m.rounds.length, 2, "invalid round dropped"); eq(m.rounds[0].moon, null); eq(m.rounds[1].moon, 0);
  eq(m.moonMode, "subtract"); eq(m.startedAt, 5000); assert.ok(m.id); eq(m.firstDealer, 0);
  eq(L.sanitizeState(null), null); eq(L.sanitizeState("x"), null);

  // running totals, ranks, moons
  var rounds = [{ scores: [13, 5, 0, 8], moon: null, pass: "left" }, { scores: [0, 26, 26, 26], moon: 0, pass: "right" }, { scores: [3, 3, 10, 10], moon: null, pass: "across" }];
  eq(L.runningTotals(rounds), [[13, 5, 0, 8], [13, 31, 26, 34], [16, 34, 36, 44]]);
  eq(L.ranks([16, 34, 16, 44]), [1, 3, 1, 4]);
  eq(L.moonsOf(rounds), [{ round: 1, player: 0 }]);

  // game record
  var st = L.newGameState({ players: ["Maya", "Omar", "Priya", "Jon"], target: 40, now: 1000, id: "gA" });
  st.rounds = rounds;
  var rec = L.buildGameRecord(st, 1000 + 47 * 60000);
  eq(rec.totals, [16, 34, 36, 44]); eq(rec.winners, [0]); eq(rec.winnerNames, ["Maya"]);
  eq(rec.moons, [{ round: 1, player: 0, name: "Maya" }]); eq(rec.hands, 3); eq(rec.durationMs, 47 * 60000);
  eq(L.formatDuration(rec.durationMs), "47m"); eq(L.formatDuration(65 * 60000), "1h 05m"); eq(L.formatDuration(20000), "<1m"); eq(L.formatDuration(0), "0m");
  rec.rounds[0].scores[0] = 99; eq(st.rounds[0].scores[0], 13, "record is a deep copy");
  rec.rounds[0].scores[0] = 13;

  // backup parsing / merge
  assert.ok(L.validGameRecord(rec));
  eq(L.validGameRecord({ id: "x" }), false);
  var tampered = JSON.parse(JSON.stringify(rec)); tampered.totals = [0, 0, 0, 0]; tampered.winners = [3];
  var pb = L.parseBackup({ app: "hearts-table", games: [tampered, { id: "junk" }] });
  eq(pb.ok, true); eq(pb.games.length, 1); eq(pb.invalid, 1);
  eq(pb.games[0].totals, [16, 34, 36, 44], "totals rebuilt from hands"); eq(pb.games[0].winners, [0]);
  eq(L.parseBackup([rec]).games.length, 1);
  eq(L.parseBackup({ nope: 1 }).ok, false);
  var mg = L.mergeGames([rec], [rec, Object.assign({}, rec, { id: "gB" })]);
  eq(mg.games.length, 2); eq(mg.added.length, 1); eq(mg.skipped, 1);

  // roster
  eq(L.updateRoster(["Omar", "maya", "Zed"], ["Maya", "Player 2", "  Jo  Ann "]), ["Maya", "Jo Ann", "Omar", "Zed"]);
  eq(L.updateRoster([], ["a", "b", "c"], 2), ["a", "b"]);

  // stats: ties count as a win for each tied player; moons, best/worst, avg
  var g2 = L.newGameState({ players: ["maya", "Omar", "Priya", "Ben"], target: 26, now: 2000, id: "gC" });
  g2.rounds = [{ scores: [0, 0, 26, 0], moon: null, pass: "left" }];
  var rec2 = L.buildGameRecord(g2, 3000);
  eq(rec2.winners, [0, 1, 3]);
  var stats = L.computeStats([rec, rec2]);
  var maya = stats.filter(function (s) { return s.key === "maya"; })[0];
  eq([maya.played, maya.wins, maya.winPct, maya.moons, maya.best, maya.worst, maya.avgScore], [2, 2, 100, 1, 0, 16, 8]);
  eq(maya.name, "Maya", "most recent spelling wins");
  var priya = stats.filter(function (s) { return s.key === "priya"; })[0];
  eq([priya.played, priya.wins, priya.winPct, priya.worst], [2, 0, 0, 36]);
  eq(stats[0].key, "maya", "sorted by wins");
  eq(L.computeStats([]), []);

  // undo/redo
  var h = { undo: [], redo: [] };
  h = L.historyRecord(h, "s0");            // action: s0 -> s1
  h = L.historyRecord(h, "s1");            // action: s1 -> s2
  var u = L.historyUndo(h, "s2"); eq(u.state, "s1");
  var u2 = L.historyUndo(u.hist, "s1"); eq(u2.state, "s0");
  eq(L.historyUndo(u2.hist, "s0"), null);
  var r1 = L.historyRedo(u2.hist, "s0"); eq(r1.state, "s1");
  var r2 = L.historyRedo(r1.hist, "s1"); eq(r2.state, "s2");
  eq(L.historyRedo(r2.hist, "s2"), null);
  var cut = L.historyRecord(r1.hist, "s1"); eq(cut.redo, [], "new action clears redo");
  var capped = { undo: [], redo: [] }; for (var k = 0; k < 10; k++) capped = L.historyRecord(capped, k, 4);
  eq(capped.undo, [6, 7, 8, 9]);

  // hand status
  eq(L.handStatus([5, null, 8, null]), { known: 2, sum: 13, left: 13, complete: false, over: false });
  eq(L.handStatus([5, 13, 8, 0]).complete, true);
})();
console.log("History, stats and undo/redo tests passed.");
