"use strict";
const assert = require("assert");
const R = require("./src/rules.js");
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);

// --- setup / players ---
let st = R.newGame({ players: ["Alice", "Bob", "Carol", "Dave"], target: 50, now: 1000, id: "t1" });
eq([st.players.length, st.target, st.rules.name, st.rules.moonMode, st.firstDealer], [4, 50, "Classic", "add", 0]);
eq(R.newGame({ players: ["a", "b"] }).players.length, 3, "min 3 players");
eq(R.newGame({ players: ["1", "2", "3", "4", "5", "6", "7"] }).players.length, 6, "max 6");

// --- punch list test game: hand 1 = 5/0/8/13, auto-fill Dave ---
let e = R.blankEntry(4); e.pts = [5, 0, 8, null];
let hs = R.handStatus(e, st);
eq(hs.suggestion, { seat: 3, value: 13 }, "HT-02 auto-fill last player");
eq(hs.complete, true); eq(hs.queen, 3, "Dave must hold the Queen (only 13+)");
e.pts = [5, null, 8, null];
hs = R.handStatus(e, st);
eq(hs.complete, false); eq(hs.reason, "Bob and Dave still to set");
eq(hs.left, 13); eq(hs.known, 2);
e.pts = [5, 0, 8, 14]; eq(R.handStatus(e, st).reason, "1 points too many");
e.pts = [7, 7, 6, 6]; eq(R.handStatus(e, st).reason, "Someone must hold the ♠Q (13+)");
e.pts = [13, 13, 0, 0]; hs = R.handStatus(e, st); eq(hs.queenCandidates, [0, 1]); eq(hs.queen, null, "ambiguous Queen left unset");
e.queen = 1; eq(R.handStatus(e, st).queen, 1);
e.pts = [5, 0, 8, 13]; e.queen = 0; eq(R.handStatus(e, st).reason, "Alice can't have the ♠Q with 5");
e = R.blankEntry(4); e.pts = [5, 0, 8, null];
let h1 = R.makeHand(e, st);
eq([h1.scores, h1.pass, h1.dealer, h1.queen, h1.moon], [[5, 0, 8, 13], "left", 0, 3, null]);
st.rounds.push(h1);
eq(R.handRecap(h1, st.players), "Dave took the Queen · Carol took 8 · Bob stayed clean");
// hand 2: Carol shoots the moon (+26)
let h2 = R.makeMoonHand(2, st);
eq([h2.scores, h2.pass, h2.dealer, h2.moonMode], [[26, 26, 0, 26], "right", 1, "add"]);
eq(R.moonPhrase(h2), "+26 to everyone else");
eq(R.handRecap(h2, st.players), "Carol shot the moon (+26 to everyone else)");
st.rounds.push(h2);
eq(R.totals(st.rounds, 4), [31, 26, 8, 39], "punch list hand 2 totals");
eq(R.runningTotals(st.rounds, 4), [[5, 0, 8, 13], [31, 26, 8, 39]]);
eq(R.currentDealer(st), 2, "Carol deals hand 3");
eq(R.passFor(2, 4, "classic"), "across");
// hand 3 (R-01): 2/3/4/17 -> Dave 56 >= 50, Carol lowest wins
e = R.blankEntry(4); e.pts = [2, 3, 4, 17];
st.rounds.push(R.makeHand(e, st));
eq(R.isOver(st), true); eq(R.winners(st), [2], "Carol wins with 12");
eq(R.totals(st.rounds, 4), [33, 29, 12, 56]);
eq(R.ranks(R.totals(st.rounds, 4), [0, 1, 2, 3]), [3, 2, 1, 4]);
eq(R.losers([33, 29, 12, 56], [0, 1, 2, 3]), [3]);

// --- -26 moon mode (R-04): shooter can go negative ---
let s2 = R.newGame({ players: ["A", "B", "C", "D"], rules: { moonMode: "subtract" } });
eq(R.makeMoonHand(1, s2).scores, [0, -26, 0, 0]);
eq(R.makeMoonHand(1, s2).moonMode, "subtract");
let fresh = R.newGame({ players: ["A", "B", "C", "D"], rules: { moonMode: "add" } });
eq(R.makeMoonHand(0, fresh, null, 0, 0, "left", "subtract").scores, [-26, 0, 0, 0], "per-hand choice overrides the game default");
eq(R.makeMoonHand(0, fresh, null, 0, 0, "left", "add").scores, [0, 26, 26, 26]);

// --- passing patterns / player counts ---
eq(R.passCycle(4, "classic"), ["left", "right", "across", "hold"]);
eq(R.passCycle(3, "classic"), ["left", "right", "hold"]);
eq(R.passCycle(6, "classic"), ["left", "right", "across", "hold"]);
eq(R.passCycle(5, "nohold"), ["left", "right"]);
eq(R.passCycle(4, "none"), ["hold"]);
eq(R.passTarget(0, "left", [0, 1, 2, 3, 4, 5]), 1); eq(R.passTarget(0, "right", [0, 1, 2, 3, 4, 5]), 5); eq(R.passTarget(1, "across", [0, 1, 2, 3, 4, 5]), 4);
eq(R.passTarget(0, "across", [0, 1, 2]), null); eq(R.passTarget(2, "hold", [0, 1, 2, 3]), null);
eq(R.cardsInfo(5), { each: 10, removed: "2♦ 2♣" });

// --- variants: spot hearts, jack of diamonds ---
let sp = R.newGame({ players: ["A", "B", "C", "D"], rules: { spot: true, jack: true } });
eq(R.pointsTotal(sp.rules), 117);
e = R.blankEntry(4); e.pts = [40, 0, 50, null];
hs = R.handStatus(e, sp); eq(hs.suggestion.value, 27); eq(hs.reason, "Who took the J♦?");
e.jack = 1; hs = R.handStatus(e, sp); eq(hs.complete, true);
let hj = R.makeHand(e, sp); eq(hj.scores, [40, -10, 50, 27]); eq(hj.jack, 1);
eq(R.MOON_POINTS, 26);
eq(R.makeMoonHand(0, sp).scores, [0, 26, 26, 26], "spot hearts moon is 26, not the 117-point hand");
eq(R.moonPhrase(R.makeMoonHand(0, sp)), "+26 to everyone else");
eq(R.makeMoonHand(1, sp, null, 0, 0, "left", "subtract").scores, [0, -26, 0, 0], "spot hearts −26 moon");
eq(R.makeMoonHand(0, sp, 2).scores, [0, 26, 16, 26], "jack is −10 on top of a 26-point moon");

// --- removed player (HT-12): excluded from entry, standings and dealing ---
let s5 = R.newGame({ players: ["A", "B", "C", "D", "E"], target: 100 });
e = R.blankEntry(5); e.pts = [10, 3, 0, 13, null]; s5.rounds.push(R.makeHand(e, s5));
s5.out[1] = true;
eq(R.activeSeats(s5), [0, 2, 3, 4]);
e = R.blankEntry(5); e.pts = [1, null, 2, null, 10];
hs = R.handStatus(e, s5); eq(hs.suggestion, { seat: 3, value: 13 }, "removed player is never 'still to set'");
let h = R.makeHand(e, s5); eq(h.scores, [1, 0, 2, 13, 10]); eq(h.pass, "right", "4 active -> classic 4-cycle"); s5.rounds.push(h);
eq(R.totals(s5.rounds, 5), [11, 3, 2, 26, 10], "past scores kept");
eq(R.leaders(R.totals(s5.rounds, 5), R.activeSeats(s5)), [2]);
eq(R.nextDealer(1, [0, 2, 3, 4]), 2);

// --- sanitize / migrate v2 and v1 ---
let v2 = { version: 2, id: "old", started: true, startedAt: 5, players: ["A", "B", "C", "D"], target: 100, moonMode: "subtract", firstDealer: 1,
  rounds: [{ scores: [5, 0, 8, 13], moon: null, pass: "left" }, { scores: [0, -26, 0, 0], moon: 1, pass: "right" }, { scores: [1, 2], pass: "left" }] };
let m = R.sanitizeState(v2);
eq([m.version, m.rules.moonMode, m.rounds.length, m.rounds[0].dealer, m.rounds[1].dealer, m.rounds[0].queen, m.rounds[1].queen, m.rounds[0].pts], [3, "subtract", 2, 1, 2, 3, 1, [5, 0, 8, 13]]);
eq(m.rounds[1].moonMode, "subtract", "old −26 moon hand keeps its choice");
eq(R.totals(m.rounds, 4), [5, -26, 8, 13]);
let legacyAdd = R.sanitizeState({ players: ["A", "B", "C", "D"], moonMode: "add", started: true,
  rounds: [{ scores: [26, 26, 0, 26], moon: 2, pass: "left" }] });
eq(legacyAdd.rounds[0].moonMode, "add");
eq(R.totals(legacyAdd.rounds, 4), [26, 26, 0, 26]);
let scoresWin = R.sanitizeState({ players: ["A", "B", "C", "D"], moonMode: "add", started: true,
  rounds: [{ scores: [0, -26, 0, 0], moon: 1, pass: "right", moonMode: "add" }] });
eq(scoresWin.rounds[0].moonMode, "subtract", "stored scores beat a mismatched moonMode flag");
eq(R.sanitizeState(null), null);

// --- records, backup, merge ---
let rec = R.buildRecord(st, 1000 + 30 * 60000);
eq([rec.totals, rec.winnerNames, rec.hands, rec.moons.length, rec.durationMs], [[33, 29, 12, 56], ["Carol"], 3, 1, 30 * 60000]);
assert.ok(R.validRecord(rec));
let tam = JSON.parse(JSON.stringify(rec)); tam.totals = [0, 0, 0, 0]; tam.winners = [0];
let pb = R.parseBackup({ games: [tam, { id: "x" }], roster: ["Zed"], presets: [{ name: "Ours", jack: true }] });
eq([pb.ok, pb.games.length, pb.invalid, pb.games[0].totals, pb.games[0].winners, pb.roster, pb.presets[0].name, pb.presets[0].jack], [true, 1, 1, [33, 29, 12, 56], [2], ["Zed"], "Ours", true]);
eq(R.mergeGames([rec], [rec, Object.assign({}, rec, { id: "b" })]).added.length, 1);
eq(R.updateRoster(["bob"], ["Bob", "Player 3", "Ann"]), ["Bob", "Ann"]);

// --- CSV (HT-14) ---
let csv = R.toCsv([rec]).trim().split("\n");
eq(csv.length, 1 + 3 * 4);
assert.ok(csv[0].startsWith("game_id,finished_at,target"));
assert.ok(csv[2].includes(",Bob,2,0,0,0,"), csv[2]);
assert.ok(csv.some(l => l.includes(",Carol,3,,0,8,") && l.includes(",yes,")), "moon row flagged");

// --- stats (HT-14): queens, hands, h2h, streak ---
let st2 = R.newGame({ players: ["Alice", "Bob", "Carol", "Dave"], target: 26, id: "t2" });
e = R.blankEntry(4); e.pts = [0, 26, 0, null];
st2.rounds.push(R.makeHand(e, st2));
let rec2 = R.buildRecord(st2, 1000 + 60 * 60000);
let S = R.computeStats([rec, rec2]);
let carol = S.find(s => s.key === "carol"), bob = S.find(s => s.key === "bob"), dave = S.find(s => s.key === "dave");
eq([carol.played, carol.wins, carol.moons, carol.streak, carol.bestStreak, carol.best, carol.bestHand], [2, 2, 1, 2, 2, 0, 0]);
eq([dave.queens, dave.worstHand, dave.wins], [2, 26, 1], "Dave: queen in hands 1 and 3, worst hand 26 (moon), tied win in game 2");
eq(bob.queens, 1);
let cb = carol.h2h.find(h => h.name === "Bob"); eq([cb.games, cb.ahead, cb.behind], [2, 2, 0]);
eq(S[0].key, "carol");

// --- misc ---
eq(R.formatClock(3723000), "1:02:03"); eq(R.formatClock(65000), "1:05"); eq(R.formatDuration(65 * 60000), "1h 05m");
let u = R.historyUndo(R.historyRecord({ undo: [], redo: [] }, "a"), "b"); eq(u.state, "a"); eq(R.historyRedo(u.hist, "a").state, "b");
let bag = [], seen = new Set(), last = null;
for (let k = 0; k < 14; k++) { const r = R.nextFromBag(bag, [...Array(14).keys()], Math.random, last); seen.add(r.id); bag = r.bag; last = r.id; }
eq(seen.size, 14);
console.log("Rules (3-6 players, variants, records, stats, CSV) tests passed.");
// out snapshot + recap wording
{
  let s = R.newGame({ players: ["A", "B", "C", "D"] }); s.out[3] = true;
  let e2 = R.blankEntry(4); e2.pts = [8 + 13, 5, null, null];
  let h = R.makeHand(e2, s); eq(h.out, [false, false, false, true]); eq(h.scores, [21, 5, 0, 0]);
  eq(R.handRecap(h, s.players), "A took 8 hearts + the Queen · B took 5 · C stayed clean");
  let back = R.sanitizeState(Object.assign({}, s, { rounds: [h] })); eq(back.rounds[0].out, [false, false, false, true]);
  console.log("Out-snapshot and recap tests passed.");
}
