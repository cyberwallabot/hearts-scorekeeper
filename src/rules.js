/* Hearts game rules for 3–6 players, variants, records and stats. Pure: no DOM, no storage. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HeartsRules = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COLORS = ["#3d7bfd", "#20a464", "#e8890c", "#9b5cf6", "#0ea5b7", "#e64897"];
  var MIN_PLAYERS = 3, MAX_PLAYERS = 6;
  var PASS_LABEL = { left: "Pass left", right: "Pass right", across: "Pass across", hold: "No pass" };

  function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function range(n) { var a = [], i; for (i = 0; i < n; i++) a.push(i); return a; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- rules / variants ---------- */

  function defaultRules() {
    return { name: "Classic", moonMode: "add", spot: false, jack: false, passMode: "classic" };
  }
  function sanitizeRules(r, legacyMoon) {
    var d = defaultRules();
    r = r && typeof r === "object" ? r : {};
    return {
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 30) : d.name,
      moonMode: (r.moonMode || legacyMoon) === "subtract" ? "subtract" : "add",
      spot: !!r.spot,
      jack: !!r.jack,
      passMode: ["classic", "nohold", "none"].indexOf(r.passMode) !== -1 ? r.passMode : "classic"
    };
  }
  function rulesSummary(r) {
    var t = pointsTotal(r);
    var bits = ["Moon each hand, default " + (r.moonMode === "subtract" ? "−" + t + " to shooter" : "+" + t + " to others")];
    if (r.spot) bits.push("Spot hearts");
    if (r.jack) bits.push("J♦ −10");
    if (r.passMode === "nohold") bits.push("No hold hands");
    if (r.passMode === "none") bits.push("No passing");
    return bits.join(" · ");
  }
  // Hearts + Queen in one hand. Spot hearts: ♥2..♥A = 2..14 (104) + ♠Q 13.
  function pointsTotal(rules) { return rules && rules.spot ? 117 : 26; }

  function cardsInfo(n) {
    return ({
      3: { each: 17, removed: "2♦" },
      4: { each: 13, removed: "" },
      5: { each: 10, removed: "2♦ 2♣" },
      6: { each: 8, removed: "2♦ 2♣ 3♦ 3♣" }
    })[n] || { each: Math.floor(52 / n), removed: "" };
  }

  /* ---------- seats, dealer, passing ---------- */

  function activeSeats(st) {
    var n = st.players.length;
    return range(n).filter(function (i) { return !(st.out && st.out[i]); });
  }
  function passCycle(activeCount, passMode) {
    var even = activeCount % 2 === 0;
    if (passMode === "none") return ["hold"];
    if (passMode === "nohold") return even ? ["left", "right", "across"] : ["left", "right"];
    return even ? ["left", "right", "across", "hold"] : ["left", "right", "hold"];
  }
  function passFor(handIndex, activeCount, passMode) {
    var c = passCycle(activeCount, passMode);
    return c[mod(handIndex, c.length)];
  }
  // Seats run clockwise. A player's left is the next active seat clockwise.
  function passTarget(seat, dir, active) {
    var k = active.indexOf(seat), n = active.length;
    if (k === -1 || dir === "hold") return null;
    if (dir === "left") return active[mod(k + 1, n)];
    if (dir === "right") return active[mod(k - 1, n)];
    if (dir === "across") return n % 2 === 0 ? active[mod(k + n / 2, n)] : null;
    return null;
  }
  function nextDealer(prev, active) {
    var k = active.indexOf(prev);
    if (k === -1) {
      var later = active.filter(function (s) { return s > prev; });
      return later.length ? later[0] : active[0];
    }
    return active[mod(k + 1, active.length)];
  }
  // Dealer for the next hand: one seat clockwise from the last hand's dealer.
  function currentDealer(st) {
    var active = activeSeats(st);
    if (!st.rounds.length) return active.indexOf(st.firstDealer) !== -1 ? st.firstDealer : nextDealer(st.firstDealer, active);
    return nextDealer(st.rounds[st.rounds.length - 1].dealer, active);
  }

  /* ---------- hand entry ---------- */

  function entryBounds(pts, i, active, total) {
    var others = 0;
    active.forEach(function (s) { if (s !== i && isInt(pts[s])) others += pts[s]; });
    return { min: 0, max: Math.max(0, total - others) };
  }
  // Queen of Spades is always taken; its holder has at least 13 points.
  // If only one player can have it, it is known.
  function queenCandidates(pts, active) {
    return active.filter(function (s) { return isInt(pts[s]) && pts[s] >= 13; });
  }
  function handStatus(entry, st) {
    var rules = st.rules, total = pointsTotal(rules), active = activeSeats(st);
    var pts = entry.pts, sum = 0, missing = [];
    active.forEach(function (s) { if (isInt(pts[s])) sum += pts[s]; else missing.push(s); });
    var res = { total: total, sum: sum, left: total - sum, known: active.length - missing.length, count: active.length,
      missing: missing, suggestion: null, complete: false, reason: "", moonCandidate: null, queen: null, queenCandidates: [] };
    active.forEach(function (s) { if (pts[s] === total) res.moonCandidate = s; });
    if (missing.length === 1 && res.left >= 0) res.suggestion = { seat: missing[0], value: res.left };
    var eff = pts.slice();
    if (res.suggestion) eff[res.suggestion.seat] = res.suggestion.value;
    var allSet = active.every(function (s) { return isInt(eff[s]); });
    var effSum = 0;
    active.forEach(function (s) { if (isInt(eff[s])) effSum += eff[s]; });
    var qc = queenCandidates(eff, active);
    res.queenCandidates = qc;
    if (isInt(entry.queen) && active.indexOf(entry.queen) !== -1) res.queen = entry.queen;
    else if (allSet && qc.length === 1) res.queen = qc[0];
    var names = st.players;
    if (sum > total) res.reason = (sum - total) + " points too many";
    else if (missing.length > 1) res.reason = listNames(missing.map(function (s) { return names[s]; })) + " still to set";
    else if (allSet && effSum !== total) res.reason = (total - effSum) + " points left to give out";
    else if (isInt(entry.queen) && isInt(eff[entry.queen]) && eff[entry.queen] < 13) res.reason = names[entry.queen] + " can't have the ♠Q with " + eff[entry.queen];
    else if (allSet && !qc.length) res.reason = "Someone must hold the ♠Q (13+)";
    else if (rules.jack && !(isInt(entry.jack) && active.indexOf(entry.jack) !== -1)) res.reason = "Who took the J♦?";
    else if (allSet) res.complete = true;
    return res;
  }
  function listNames(a) {
    if (a.length <= 1) return a.join("");
    if (a.length === 2) return a[0] + " and " + a[1];
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function blankEntry(n) { var p = []; while (p.length < n) p.push(null); return { pts: p, queen: null, jack: null }; }

  // Turn a complete entry into a stored hand.
  function makeHand(entry, st) {
    var hs = handStatus(entry, st);
    if (!hs.complete) throw new Error(hs.reason || "Hand not complete");
    var n = st.players.length, active = activeSeats(st);
    var pts = range(n).map(function (s) { return active.indexOf(s) === -1 ? 0 : (isInt(entry.pts[s]) ? entry.pts[s] : hs.suggestion && hs.suggestion.seat === s ? hs.suggestion.value : 0); });
    var scores = pts.slice();
    var jack = st.rules.jack ? entry.jack : null;
    if (isInt(jack)) scores[jack] -= 10;
    return withOut({ scores: scores, pts: pts, moon: null, pass: passFor(st.rounds.length, active.length, st.rules.passMode),
      dealer: currentDealer(st), queen: hs.queen, jack: isInt(jack) ? jack : null }, st);
  }
  // Remember who sat out, so editing an old hand later uses the same players.
  function withOut(h, st) {
    if (st.out && st.out.some(Boolean)) h.out = st.out.map(Boolean);
    return h;
  }
  function makeMoonHand(shooter, st, jack, handIndex, dealer, pass, moonMode) {
    var n = st.players.length, active = activeSeats(st), total = pointsTotal(st.rules);
    var mode = moonMode === "subtract" || moonMode === "add" ? moonMode : (st.rules && st.rules.moonMode === "subtract" ? "subtract" : "add");
    var scores = range(n).map(function (s) {
      if (active.indexOf(s) === -1) return 0;
      if (mode === "subtract") return s === shooter ? -total : 0;
      return s === shooter ? 0 : total;
    });
    var j = st.rules.jack && isInt(jack) ? jack : null;
    if (j !== null) scores[j] -= 10;
    var k = isInt(handIndex) ? handIndex : st.rounds.length;
    return withOut({ scores: scores, pts: null, moon: shooter, moonMode: mode, pass: pass || passFor(k, active.length, st.rules.passMode),
      dealer: isInt(dealer) ? dealer : currentDealer(st), queen: shooter, jack: j }, st);
  }
  // How many points the moon pile was, after undoing a J♦ −10 on the same hand.
  function moonPoints(h) {
    if (!h || !isInt(h.moon) || !h.scores) return 0;
    var jackHere = isInt(h.jack), i, best, n;
    if (h.moonMode === "subtract") {
      n = -h.scores[h.moon];
      if (jackHere && h.jack === h.moon) n -= 10;
      return n;
    }
    best = 0;
    for (i = 0; i < h.scores.length; i++) {
      if (i === h.moon) continue;
      n = h.scores[i] + (jackHere && h.jack === i ? 10 : 0);
      if (n > best) best = n;
    }
    return best;
  }
  function moonPhrase(h) {
    if (!h || !isInt(h.moon)) return "";
    var n = moonPoints(h);
    return h.moonMode === "subtract" ? "−" + n + " to the shooter" : "+" + n + " to everyone else";
  }
  // Scores are the source of truth for old saves that had one moon setting for the whole game.
  function inferMoonMode(scores, shooter, fallback) {
    if (!scores || !isInt(shooter) || shooter < 0 || shooter >= scores.length) {
      return fallback === "subtract" || fallback === "add" ? fallback : null;
    }
    var self = scores[shooter], othersMax = -Infinity, i;
    for (i = 0; i < scores.length; i++) if (i !== shooter && scores[i] > othersMax) othersMax = scores[i];
    if (self <= -13 && othersMax <= 0) return "subtract";
    if (othersMax >= 13) return "add";
    if (fallback === "subtract" || fallback === "add") return fallback;
    return null;
  }

  /* ---------- totals, standings ---------- */

  function totals(rounds, n) {
    var t = range(n).map(function () { return 0; });
    (rounds || []).forEach(function (r) { r.scores.forEach(function (v, i) { if (i < n) t[i] += v; }); });
    return t;
  }
  function runningTotals(rounds, n) {
    var t = range(n).map(function () { return 0; });
    return (rounds || []).map(function (r) { t = t.map(function (v, i) { return v + (r.scores[i] || 0); }); return t.slice(); });
  }
  function leaders(tots, active) {
    if (!active.length) return [];
    var min = Math.min.apply(null, active.map(function (s) { return tots[s]; }));
    return active.filter(function (s) { return tots[s] === min; });
  }
  function losers(tots, active) {
    if (active.length < 2) return [];
    var max = Math.max.apply(null, active.map(function (s) { return tots[s]; }));
    var min = Math.min.apply(null, active.map(function (s) { return tots[s]; }));
    if (max === min) return [];
    return active.filter(function (s) { return tots[s] === max; });
  }
  function ranks(tots, active) {
    var r = tots.map(function () { return null; });
    active.forEach(function (s) {
      var better = 0;
      active.forEach(function (o) { if (tots[o] < tots[s]) better++; });
      r[s] = better + 1;
    });
    return r;
  }
  function isOver(st) {
    if (!st.started) return false;
    var t = totals(st.rounds, st.players.length);
    return activeSeats(st).some(function (s) { return t[s] >= st.target; });
  }
  function winners(st) {
    if (!isOver(st)) return [];
    return leaders(totals(st.rounds, st.players.length), activeSeats(st));
  }

  function handRecap(r, players) {
    if (isInt(r.moon)) {
      var s = players[r.moon] + " shot the moon (" + moonPhrase(r) + ")";
      if (isInt(r.jack)) s += "; " + players[r.jack] + " took the J♦";
      return s;
    }
    var bits = [];
    if (isInt(r.queen)) {
      var h = r.pts[r.queen] - 13;
      bits.push(players[r.queen] + " took " + (h > 0 ? h + (h === 1 ? " heart" : " hearts") + " + the Queen" : "the Queen"));
    }
    var most = -1, who = null;
    r.pts.forEach(function (p, i) { if (i !== r.queen && p > most) { most = p; who = i; } });
    if (who !== null && most > 0) bits.push(players[who] + " took " + most);
    if (isInt(r.jack)) bits.push(players[r.jack] + " took the J♦ (−10)");
    var clean = r.pts.map(function (p, i) { return p === 0 && i !== r.jack && !(r.out && r.out[i]) ? players[i] : null; }).filter(Boolean);
    if (clean.length && clean.length < r.pts.length) bits.push(listNames(clean) + " stayed clean");
    return bits.join(" · ");
  }

  /* ---------- game state ---------- */

  function makeId(now) { return "g" + Math.floor(now || Date.now()).toString(36) + Math.floor(Math.random() * 1e9).toString(36); }
  function normName(n, fb) { var s = (n == null ? "" : String(n)).trim().replace(/\s+/g, " ").slice(0, 20); return s || fb; }
  function nameKey(n) { return String(n || "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function isPlaceholder(n) { return /^player \d+$/i.test(String(n || "").trim()); }

  function newGame(o) {
    o = o || {};
    var now = isInt(o.now) ? o.now : Date.now();
    var players = (o.players || []).slice(0, MAX_PLAYERS);
    while (players.length < MIN_PLAYERS) players.push("");
    players = players.map(function (p, i) { return normName(p, "Player " + (i + 1)); });
    return {
      version: 3, id: o.id || makeId(now), started: true, startedAt: now,
      players: players, colors: players.map(function (p, i) { return i; }), out: players.map(function () { return false; }),
      target: isInt(o.target) && o.target > 0 ? o.target : 100,
      rules: sanitizeRules(o.rules), firstDealer: isInt(o.firstDealer) ? mod(o.firstDealer, players.length) : 0, rounds: []
    };
  }
  function validHand(r, n) {
    return !!r && Array.isArray(r.scores) && r.scores.length === n && r.scores.every(isInt) &&
      ["left", "right", "across", "hold"].indexOf(r.pass) !== -1 &&
      (r.moon == null || (isInt(r.moon) && r.moon >= 0 && r.moon < n)) &&
      (r.pts == null || (Array.isArray(r.pts) && r.pts.length === n && r.pts.every(isInt)));
  }
  // Fill fields older saves didn't have (pts, dealer, queen).
  function upgradeHand(r, k, n, firstDealer, legacyMoon) {
    var h = { scores: r.scores.slice(), moon: isInt(r.moon) ? r.moon : null, pass: r.pass,
      pts: Array.isArray(r.pts) ? r.pts.slice() : (isInt(r.moon) ? null : r.scores.slice()),
      dealer: isInt(r.dealer) && r.dealer >= 0 && r.dealer < n ? r.dealer : mod((firstDealer || 0) + k, n),
      queen: isInt(r.queen) && r.queen >= 0 && r.queen < n ? r.queen : null, jack: isInt(r.jack) && r.jack >= 0 && r.jack < n ? r.jack : null };
    if (Array.isArray(r.out) && r.out.length === n && r.out.some(Boolean)) h.out = r.out.map(Boolean);
    if (h.queen === null) {
      if (h.moon !== null) h.queen = h.moon;
      else if (h.pts) { var c = h.pts.map(function (p, i) { return p >= 13 ? i : -1; }).filter(function (i) { return i >= 0; }); if (c.length === 1) h.queen = c[0]; }
    }
    if (h.moon !== null) {
      var explicit = r.moonMode === "add" || r.moonMode === "subtract" ? r.moonMode : null;
      var fromScores = inferMoonMode(h.scores, h.moon, null);
      h.moonMode = fromScores || explicit || (legacyMoon === "subtract" ? "subtract" : "add");
    }
    return h;
  }
  // Accepts v1 (localStorage era), v2 (4 players) and v3 states.
  function sanitizeState(p, now) {
    if (!p || typeof p !== "object") return null;
    var t = isInt(now) ? now : Date.now();
    var players = Array.isArray(p.players) && p.players.length >= MIN_PLAYERS && p.players.length <= MAX_PLAYERS
      ? p.players.map(function (x, i) { return normName(x, "Player " + (i + 1)); }) : ["Player 1", "Player 2", "Player 3", "Player 4"];
    var n = players.length;
    var fd = isInt(p.firstDealer) ? mod(p.firstDealer, n) : 0;
    var legacyMoon = (p.rules && p.rules.moonMode) || p.moonMode;
    var rounds = (Array.isArray(p.rounds) ? p.rounds : []).filter(function (r) { return validHand(r, n); }).map(function (r, k) { return upgradeHand(r, k, n, fd, legacyMoon); });
    var st = {
      version: 3, id: typeof p.id === "string" && p.id ? p.id.slice(0, 80) : makeId(t), started: !!p.started,
      startedAt: isInt(p.startedAt) ? p.startedAt : t, players: players,
      colors: Array.isArray(p.colors) && p.colors.length === n && p.colors.every(function (c) { return isInt(c) && c >= 0 && c < COLORS.length; }) ? p.colors.slice() : range(n),
      out: Array.isArray(p.out) && p.out.length === n ? p.out.map(Boolean) : players.map(function () { return false; }),
      target: isInt(p.target) && p.target > 0 ? p.target : 100,
      rules: sanitizeRules(p.rules, p.moonMode), firstDealer: fd, rounds: rounds
    };
    if (isInt(p.finishedAt)) st.finishedAt = p.finishedAt;
    if (activeSeats(st).length < MIN_PLAYERS) st.out = players.map(function () { return false; });
    return st;
  }

  /* ---------- records, backup ---------- */

  function buildRecord(st, finishedAt) {
    var n = st.players.length, tots = totals(st.rounds, n), w = winners(st);
    var end = isInt(finishedAt) ? finishedAt : Date.now();
    return {
      version: 3, id: st.id, startedAt: st.startedAt, finishedAt: end, durationMs: Math.max(0, end - (st.startedAt || end)),
      players: st.players.slice(), colors: st.colors.slice(), out: st.out.slice(), target: st.target, rules: clone(st.rules),
      moonMode: st.rules.moonMode, firstDealer: st.firstDealer, rounds: clone(st.rounds), totals: tots,
      winners: w, winnerNames: w.map(function (i) { return st.players[i]; }),
      moons: st.rounds.map(function (r, k) { return isInt(r.moon) ? { round: k, player: r.moon, name: st.players[r.moon], moonMode: r.moonMode === "subtract" ? "subtract" : "add" } : null; }).filter(Boolean),
      hands: st.rounds.length
    };
  }
  function validRecord(g) {
    if (!g || typeof g !== "object" || typeof g.id !== "string" || !g.id || g.id.length > 80) return false;
    if (!Array.isArray(g.players) || g.players.length < MIN_PLAYERS || g.players.length > MAX_PLAYERS || !g.players.every(function (x) { return typeof x === "string"; })) return false;
    var n = g.players.length;
    return Array.isArray(g.rounds) && g.rounds.length > 0 && g.rounds.every(function (r) { return validHand(r, n); }) && isInt(g.finishedAt);
  }
  // Rebuild derived fields so a record can't disagree with its own hands.
  function normalizeRecord(g) {
    var st = sanitizeState({ id: g.id, started: true, startedAt: isInt(g.startedAt) ? g.startedAt : g.finishedAt, players: g.players,
      colors: g.colors, out: g.out, target: g.target, rules: g.rules, moonMode: g.moonMode, firstDealer: g.firstDealer, rounds: g.rounds });
    var rec = buildRecord(st, g.finishedAt);
    if (!rec.winners.length) { rec.winners = leaders(rec.totals, activeSeats(st)); rec.winnerNames = rec.winners.map(function (i) { return st.players[i]; }); }
    return rec;
  }
  function parseBackup(obj) {
    var list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.games) ? obj.games : null);
    if (!list) return { ok: false, error: "That file has no games in it.", games: [], invalid: 0, roster: [], presets: [] };
    var games = [], bad = 0;
    list.forEach(function (g) { if (validRecord(g)) games.push(normalizeRecord(g)); else bad++; });
    var roster = obj && Array.isArray(obj.roster) ? obj.roster.filter(function (x) { return typeof x === "string" && x.trim(); }).map(function (x) { return x.trim().slice(0, 20); }) : [];
    var presets = obj && Array.isArray(obj.presets) ? obj.presets.filter(function (x) { return x && typeof x === "object"; }).map(function (x) { return sanitizeRules(x); }) : [];
    return { ok: true, games: games, invalid: bad, roster: roster, presets: presets };
  }
  function mergeGames(existing, incoming) {
    var ids = {}, added = [], skipped = 0;
    (existing || []).forEach(function (g) { ids[g.id] = true; });
    (incoming || []).forEach(function (g) { if (ids[g.id]) { skipped++; return; } ids[g.id] = true; added.push(g); });
    return { games: (existing || []).concat(added), added: added, skipped: skipped };
  }
  function updateRoster(roster, names, cap) {
    var out = [], seen = {};
    (names || []).concat(roster || []).forEach(function (x) {
      var k = nameKey(x);
      if (!k || seen[k] || isPlaceholder(x)) return;
      seen[k] = true; out.push(String(x).trim().replace(/\s+/g, " "));
    });
    return out.slice(0, cap || 30);
  }

  /* ---------- stats ---------- */

  function computeStats(games) {
    var by = {};
    var sorted = (games || []).slice().sort(function (a, b) { return (a.finishedAt || 0) - (b.finishedAt || 0); });
    sorted.forEach(function (g) {
      var n = g.players.length, tots = g.totals || totals(g.rounds, n), w = g.winners || [];
      var act = range(n).filter(function (i) { return !(g.out && g.out[i]); });
      g.players.forEach(function (name, i) {
        var k = nameKey(name);
        if (!k) return;
        var s = by[k] || (by[k] = { name: name, key: k, played: 0, wins: 0, sum: 0, moons: 0, queens: 0, jacks: 0, best: null, worst: null,
          bestHand: null, worstHand: null, hands: 0, last: 0, streak: 0, bestStreak: 0, h2h: {} });
        s.played++;
        var won = w.indexOf(i) !== -1;
        if (won) { s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); } else s.streak = 0;
        s.sum += tots[i];
        if (s.best === null || tots[i] < s.best) s.best = tots[i];
        if (s.worst === null || tots[i] > s.worst) s.worst = tots[i];
        g.rounds.forEach(function (r) {
          if (g.out && g.out[i] && r.scores[i] === 0 && !isInt(r.pts && r.pts[i])) return;
          s.hands++;
          if (r.moon === i) s.moons++;
          if (r.queen === i && r.moon !== i) s.queens++;
          if (r.jack === i) s.jacks++;
          if (s.bestHand === null || r.scores[i] < s.bestHand) s.bestHand = r.scores[i];
          if (s.worstHand === null || r.scores[i] > s.worstHand) s.worstHand = r.scores[i];
        });
        act.forEach(function (o) {
          if (o === i) return;
          var ok = nameKey(g.players[o]);
          var h = s.h2h[ok] || (s.h2h[ok] = { name: g.players[o], games: 0, ahead: 0, behind: 0 });
          h.games++; h.name = g.players[o];
          if (tots[i] < tots[o]) h.ahead++; else if (tots[i] > tots[o]) h.behind++;
        });
        if ((g.finishedAt || 0) >= s.last) { s.last = g.finishedAt || 0; s.name = name; }
      });
    });
    return Object.keys(by).map(function (k) {
      var s = by[k];
      return { name: s.name, key: k, played: s.played, wins: s.wins, winPct: s.played ? Math.round(s.wins / s.played * 100) : 0,
        avgScore: s.played ? Math.round(s.sum / s.played * 10) / 10 : 0, moons: s.moons, queens: s.queens, jacks: s.jacks,
        best: s.best, worst: s.worst, bestHand: s.bestHand, worstHand: s.worstHand, hands: s.hands,
        streak: s.streak, bestStreak: s.bestStreak, last: s.last,
        h2h: Object.keys(s.h2h).map(function (o) { return s.h2h[o]; }).sort(function (a, b) { return b.games - a.games || (a.name < b.name ? -1 : 1); }) };
    }).sort(function (a, b) { return b.wins - a.wins || b.winPct - a.winPct || a.avgScore - b.avgScore || b.played - a.played || (a.name < b.name ? -1 : 1); });
  }

  function csvCell(v) { var s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(games) {
    var rows = [["game_id", "finished_at", "target", "rules", "hand", "player", "seat", "points", "score", "running_total", "rank_after", "dealer", "pass", "moon", "queen", "jack", "final_total", "winner", "moon_choice"]];
    (games || []).forEach(function (g) {
      var n = g.players.length, run = runningTotals(g.rounds, n), act = range(n).filter(function (i) { return !(g.out && g.out[i]); });
      var rulesTxt = rulesSummary(sanitizeRules(g.rules, g.moonMode));
      g.rounds.forEach(function (r, k) {
        var rk = ranks(run[k], act);
        g.players.forEach(function (p, i) {
          rows.push([g.id, new Date(g.finishedAt).toISOString(), g.target, rulesTxt, k + 1, p, i + 1, r.pts ? r.pts[i] : "", r.scores[i], run[k][i], rk[i] || "",
            g.players[r.dealer] || "", r.pass, r.moon === i ? "yes" : "", r.queen === i ? "yes" : "", r.jack === i ? "yes" : "", g.totals[i], (g.winners || []).indexOf(i) !== -1 ? "yes" : "",
            isInt(r.moon) ? (r.moonMode === "subtract" ? "subtract" : "add") : ""]);
        });
      });
    });
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n") + "\n";
  }

  function formatDuration(ms) {
    if (!(ms > 0)) return "0m";
    var m = Math.floor(ms / 60000);
    if (m < 1) return "<1m";
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60), r = m % 60;
    return h + "h " + (r < 10 ? "0" : "") + r + "m";
  }
  function formatClock(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }

  function historyRecord(h, snap, cap) {
    var u = (h && h.undo ? h.undo : []).concat([snap]), c = cap || 60;
    if (u.length > c) u = u.slice(u.length - c);
    return { undo: u, redo: [] };
  }
  function historyUndo(h, cur) {
    if (!h || !h.undo || !h.undo.length) return null;
    return { state: h.undo[h.undo.length - 1], hist: { undo: h.undo.slice(0, -1), redo: (h.redo || []).concat([cur]) } };
  }
  function historyRedo(h, cur) {
    if (!h || !h.redo || !h.redo.length) return null;
    return { state: h.redo[h.redo.length - 1], hist: { undo: (h.undo || []).concat([cur]), redo: h.redo.slice(0, -1) } };
  }
  function nextFromBag(bag, allIds, rng, lastId) {
    var b = (bag || []).filter(function (id) { return allIds.indexOf(id) !== -1; });
    if (!b.length) {
      b = allIds.slice();
      var i, j, t, r = rng || Math.random;
      for (i = b.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = b[i]; b[i] = b[j]; b[j] = t; }
      if (b.length > 1 && b[b.length - 1] === lastId) { t = b[0]; b[0] = b[b.length - 1]; b[b.length - 1] = t; }
    }
    return { id: b[b.length - 1], bag: b.slice(0, -1) };
  }

  return {
    COLORS: COLORS, MIN_PLAYERS: MIN_PLAYERS, MAX_PLAYERS: MAX_PLAYERS, PASS_LABEL: PASS_LABEL,
    isInt: isInt, defaultRules: defaultRules, sanitizeRules: sanitizeRules, rulesSummary: rulesSummary, pointsTotal: pointsTotal, cardsInfo: cardsInfo,
    activeSeats: activeSeats, passCycle: passCycle, passFor: passFor, passTarget: passTarget, nextDealer: nextDealer, currentDealer: currentDealer,
    entryBounds: entryBounds, queenCandidates: queenCandidates, handStatus: handStatus, blankEntry: blankEntry, makeHand: makeHand, makeMoonHand: makeMoonHand, moonPhrase: moonPhrase,
    totals: totals, runningTotals: runningTotals, leaders: leaders, losers: losers, ranks: ranks, isOver: isOver, winners: winners, handRecap: handRecap,
    makeId: makeId, normName: normName, nameKey: nameKey, isPlaceholder: isPlaceholder, newGame: newGame, validHand: validHand, sanitizeState: sanitizeState,
    buildRecord: buildRecord, validRecord: validRecord, normalizeRecord: normalizeRecord, parseBackup: parseBackup, mergeGames: mergeGames, updateRoster: updateRoster,
    computeStats: computeStats, toCsv: toCsv, formatDuration: formatDuration, formatClock: formatClock, listNames: listNames,
    historyRecord: historyRecord, historyUndo: historyUndo, historyRedo: historyRedo, nextFromBag: nextFromBag
  };
});
