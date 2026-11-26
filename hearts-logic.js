/**
 * Pure Hearts scorekeeping logic. No DOM, no storage.
 * A standard Hearts hand has 26 points (13 hearts + Queen of Spades).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HeartsLogic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PASS_ORDER = ["left", "right", "across", "hold"];
  var PASS_LABELS = {
    left: "Pass left",
    right: "Pass right",
    across: "Pass across",
    hold: "Hold (no pass)",
  };

  // Pixels of slow horizontal travel needed to change one point.
  // 12px × 26 points = 312px, which still fits on a 390px phone screen.
  var JOG_BASE_PX = 12;

  function passForRound(roundIndex) {
    return PASS_ORDER[((roundIndex % 4) + 4) % 4];
  }

  function passLabel(dir) {
    return PASS_LABELS[dir] || dir;
  }

  function moonScores(shooterIndex, mode) {
    var scores = [0, 0, 0, 0];
    var i;
    if (shooterIndex < 0 || shooterIndex > 3) {
      throw new Error("Shooter must be a player index 0–3");
    }
    if (mode === "subtract") {
      scores[shooterIndex] = -26;
    } else {
      for (i = 0; i < 4; i++) {
        scores[i] = i === shooterIndex ? 0 : 26;
      }
    }
    return scores;
  }

  function isInteger(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n;
  }

  function isSetScore(n) {
    return isInteger(n);
  }

  function validateRoundScores(scores) {
    var i, s, total;
    if (!scores || scores.length !== 4) {
      return { ok: false, error: "Enter a score for each of the four players.", total: 0 };
    }
    total = 0;
    for (i = 0; i < 4; i++) {
      s = scores[i];
      if (!isInteger(s) || s < 0 || s > 26) {
        return {
          ok: false,
          error: "Each score must be a whole number from 0 to 26.",
          total: null,
        };
      }
      total += s;
    }
    if (total !== 26) {
      return {
        ok: false,
        error: "Points must add up to 26 (now " + total + ").",
        total: total,
      };
    }
    return { ok: true, error: null, total: total };
  }

  function looksLikeMoon(scores) {
    var i, shooter, count26;
    if (!scores || scores.length !== 4) return { match: false, shooter: -1 };
    count26 = 0;
    shooter = -1;
    for (i = 0; i < 4; i++) {
      if (scores[i] === 26) {
        count26 += 1;
        shooter = i;
      } else if (scores[i] !== 0) {
        return { match: false, shooter: -1 };
      }
    }
    if (count26 === 1) return { match: true, shooter: shooter };
    return { match: false, shooter: -1 };
  }

  function totals(rounds) {
    var t = [0, 0, 0, 0];
    var r, i;
    if (!rounds) return t;
    for (r = 0; r < rounds.length; r++) {
      for (i = 0; i < 4; i++) {
        t[i] += rounds[r].scores[i];
      }
    }
    return t;
  }

  function leaders(totalsArr) {
    var i, min, result;
    if (!totalsArr || !totalsArr.length) return [];
    min = totalsArr[0];
    for (i = 1; i < totalsArr.length; i++) {
      if (totalsArr[i] < min) min = totalsArr[i];
    }
    result = [];
    for (i = 0; i < totalsArr.length; i++) {
      if (totalsArr[i] === min) result.push(i);
    }
    return result;
  }

  function isGameOver(totalsArr, target) {
    var i;
    if (!isInteger(target) || target <= 0) return false;
    for (i = 0; i < totalsArr.length; i++) {
      if (totalsArr[i] >= target) return true;
    }
    return false;
  }

  function winners(totalsArr, target) {
    if (!isGameOver(totalsArr, target)) return [];
    return leaders(totalsArr);
  }

  function defaultState() {
    return {
      version: 1,
      started: false,
      players: ["Player 1", "Player 2", "Player 3", "Player 4"],
      target: 100,
      moonMode: "add",
      rounds: [],
    };
  }

  function normalizeName(name, fallback) {
    var n = (name == null ? "" : String(name)).trim();
    return n || fallback;
  }

  // Sum of already-set scores for everyone except `index`. Unknowns are ignored.
  function otherSetSum(values, index) {
    var sum = 0;
    var i;
    if (!values) return 0;
    for (i = 0; i < values.length; i++) {
      if (i !== index && isSetScore(values[i])) sum += values[i];
    }
    return sum;
  }

  // Slider range for a player: min 0, max = remaining points (26 − others' set values).
  // Full-right is always "the rest."
  function sliderBounds(values, index) {
    var max = 26 - otherSetSum(values, index);
    if (max < 0) max = 0;
    if (max > 26) max = 26;
    return { min: 0, max: max };
  }

  function clampScore(value, values, index) {
    var b = sliderBounds(values, index);
    var n = typeof value === "number" ? value : Number(value);
    if (!isFinite(n)) return b.min;
    n = Math.round(n);
    if (n < b.min) return b.min;
    if (n > b.max) return b.max;
    return n;
  }

  function assignScore(values, index, value) {
    var next = values ? values.slice() : [null, null, null, null];
    next[index] = clampScore(value, next, index);
    return next;
  }

  function clearScore(values, index) {
    var next = values ? values.slice() : [null, null, null, null];
    next[index] = null;
    return next;
  }

  // Safety net for impossible combinations. Shrinks the largest overflow first
  // so already-valid scores (for example 4, 3, 0) stay put while 30 becomes 19.
  function reclampScores(values) {
    var next = values ? values.slice() : [null, null, null, null];
    var i, b, excess, best, bestEx, c, guard;
    for (i = 0; i < next.length; i++) {
      if (!isSetScore(next[i])) continue;
      if (next[i] < 0) next[i] = 0;
      if (next[i] > 26) next[i] = 26;
    }
    guard = 0;
    while (guard < 8) {
      best = -1;
      bestEx = 0;
      for (i = 0; i < next.length; i++) {
        if (!isSetScore(next[i])) continue;
        b = sliderBounds(next, i);
        excess = next[i] - b.max;
        if (excess > bestEx) {
          bestEx = excess;
          best = i;
        } else if (next[i] < b.min) {
          next[i] = b.min;
        }
      }
      if (best < 0) break;
      next[best] = sliderBounds(next, best).max;
      guard += 1;
    }
    return next;
  }

  function knownCount(values) {
    var n = 0;
    var i;
    if (!values) return 0;
    for (i = 0; i < values.length; i++) {
      if (isSetScore(values[i])) n += 1;
    }
    return n;
  }

  // Speed in pixels per millisecond. Slow movement stays at gain 1 (1 point
  // per JOG_BASE_PX). Faster movement raises the gain so the same travel
  // covers more points, like a jog wheel.
  function jogVelocityGain(speedPxPerMs) {
    var s = speedPxPerMs > 0 ? speedPxPerMs : 0;
    var dead = 0.12; // up to 120px/s is still fine control: 1 point per JOG_BASE_PX
    var extra;
    if (s <= dead) return 1;
    extra = s - dead;
    return 1 + Math.min(4, 3 * extra + 8 * extra * extra);
  }

  function applyJog(dx, dtMs, accum) {
    var dt = dtMs > 1 ? dtMs : 1;
    var speed = Math.abs(dx) / dt;
    var gain = jogVelocityGain(speed);
    var next = (accum || 0) + dx * gain;
    var delta = 0;
    var unit = JOG_BASE_PX;
    while (next >= unit) {
      delta += 1;
      next -= unit;
    }
    while (next <= -unit) {
      delta -= 1;
      next += unit;
    }
    return { accum: next, delta: delta, speed: speed, gain: gain };
  }

  function applyJogToValue(value, values, index, dx, dtMs, accum) {
    var step = applyJog(dx, dtMs, accum);
    var nextValue = clampScore((isSetScore(value) ? value : 0) + step.delta, values, index);
    step.value = nextValue;
    return step;
  }


  // ---- Table-top additions -------------------------------------------------

  // Raw pixels of extra push, past the end of the slide, that triggers the moon.
  var MOON_OVERSHOOT_PX = 110;

  // Project a screen-space movement onto a player's own "right" axis.
  // rot is how far that player's panel is rotated: 0 bottom, 90 left, 180 top, 270 right.
  var ROT_AXIS = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };
  function localDx(dx, dy, rot) {
    var ax = ROT_AXIS[((Math.round(rot / 90) * 90) % 360 + 360) % 360] || [1, 0];
    var v = dx * ax[0] + dy * ax[1];
    return v === 0 ? 0 : v;
  }

  // One step of the jog wheel with overshoot tracking.
  // st = { value, accum, over }, bounds = { min, max }, dx = local px since last event.
  // Slow travel is 1 point per JOG_BASE_PX, faster travel accelerates, the value
  // never leaves [min, max], and pushing further right than max builds `over`
  // (raw px, no acceleration). When over reaches MOON_OVERSHOOT_PX, moon is true.
  // Optional tune = { unit: px per point, maxGain: cap on acceleration }.
  function jogStep(st, bounds, dx, dtMs, tune) {
    var unit = tune && tune.unit > 0 ? tune.unit : JOG_BASE_PX;
    var dt = dtMs > 1 ? dtMs : 1;
    var gain = jogVelocityGain(Math.abs(dx) / dt);
    if (tune && tune.maxGain >= 1 && gain > tune.maxGain) gain = tune.maxGain;
    var min = bounds.min;
    var max = bounds.max;
    var value = st.value;
    var accum = st.accum || 0;
    var over = st.over || 0;
    var raw = dx;
    var total, toMax, gained, usedRaw;

    if (value > max) { value = max; accum = 0; }
    if (value < min) { value = min; accum = 0; }

    // Overshoot counts at "walking pace": distance is divided by the speed gain,
    // so a fast flick to the end never fires the moon by accident. Only a
    // deliberate, steady push past the end does.
    if (over > 0 && raw > 0) {
      over += raw / gain;
      raw = 0;
    } else if (over > 0) {
      total = over + raw;
      if (total >= 0) { over = total; raw = 0; }
      else { over = 0; raw = total; accum = 0; }
    }

    if (raw > 0) {
      toMax = Math.max(0, (max - value) * unit - accum);
      gained = raw * gain;
      if (gained < toMax) {
        accum += gained;
      } else {
        usedRaw = toMax / gain;
        over += Math.max(0, raw - usedRaw) / gain;
        value = max;
        accum = 0;
      }
    } else if (raw < 0) {
      accum += raw * gain;
    }

    while (accum >= unit) { value += 1; accum -= unit; }
    while (accum <= -unit) { value -= 1; accum += unit; }
    if (value <= min) { value = min; if (accum < 0) accum = 0; }
    if (value >= max) { value = max; accum = 0; }

    return {
      value: value,
      accum: accum,
      over: over,
      moon: over >= MOON_OVERSHOOT_PX,
      gain: gain,
    };
  }

  // Shuffle bag for moon animations: nothing repeats until every one has played.
  function shuffle(arr, rng) {
    var a = arr.slice();
    var i, j, t;
    rng = rng || Math.random;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rng() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function nextFromBag(bag, allIds, rng, lastId) {
    var b = (bag || []).filter(function (id) { return allIds.indexOf(id) !== -1; });
    var t;
    if (!b.length) {
      b = shuffle(allIds, rng);
      // The next draw is b[b.length - 1]; do not repeat the last one played.
      if (allIds.length > 1 && b[b.length - 1] === lastId) {
        t = b[0]; b[0] = b[b.length - 1]; b[b.length - 1] = t;
      }
    }
    return { id: b[b.length - 1], bag: b.slice(0, b.length - 1) };
  }


  /* ---------------- v4: games, history, stats, undo/redo ---------------- */

  function mod4(n) { return ((n % 4) + 4) % 4; }

  // Dealer rotates clockwise one seat per hand, starting from firstDealer.
  function dealerForRound(firstDealer, roundIndex) {
    return mod4((isInteger(firstDealer) ? firstDealer : 0) + (isInteger(roundIndex) ? roundIndex : 0));
  }

  // Seats run clockwise: 0 bottom, 1 left, 2 top, 3 right. A player's left is the next seat clockwise.
  function passTarget(seat, dir) {
    if (dir === "left") return mod4(seat + 1);
    if (dir === "right") return mod4(seat + 3);
    if (dir === "across") return mod4(seat + 2);
    return null;
  }

  function makeId(now, rng) {
    var r = rng || Math.random;
    return "g" + Math.floor(now || 0).toString(36) + Math.floor(r() * 1e9).toString(36);
  }

  function newGameState(opts) {
    opts = opts || {};
    var now = typeof opts.now === "number" ? opts.now : Date.now();
    var players = (opts.players || []).slice(0, 4);
    while (players.length < 4) players.push("");
    return {
      version: 2,
      id: opts.id || makeId(now, opts.rng),
      started: true,
      startedAt: now,
      players: players.map(function (n, i) { return normalizeName(n, "Player " + (i + 1)); }),
      target: isInteger(opts.target) && opts.target > 0 ? opts.target : 100,
      moonMode: opts.moonMode === "subtract" ? "subtract" : "add",
      firstDealer: isInteger(opts.firstDealer) ? mod4(opts.firstDealer) : 0,
      rounds: [],
    };
  }

  function validRound(r) {
    return !!r && Array.isArray(r.scores) && r.scores.length === 4 &&
      r.scores.every(function (s) { return typeof s === "number" && isFinite(s) && Math.floor(s) === s; }) &&
      PASS_ORDER.indexOf(r.pass) !== -1 &&
      (r.moon == null || (isInteger(r.moon) && r.moon >= 0 && r.moon < 4));
  }

  // Accepts v1 (localStorage era) and v2 states, returns a clean v2 state or null.
  function sanitizeState(p, now) {
    if (!p || typeof p !== "object") return null;
    var base = defaultState();
    var t = typeof now === "number" ? now : Date.now();
    var rounds = Array.isArray(p.rounds) ? p.rounds.filter(validRound).map(function (r) {
      return { scores: r.scores.slice(), moon: r.moon == null ? null : r.moon, pass: r.pass };
    }) : [];
    return {
      version: 2,
      id: typeof p.id === "string" && p.id ? p.id : makeId(t),
      started: !!p.started,
      startedAt: typeof p.startedAt === "number" ? p.startedAt : t,
      players: Array.isArray(p.players) && p.players.length === 4
        ? p.players.map(function (n, i) { return normalizeName(n, "Player " + (i + 1)); })
        : base.players.slice(),
      target: (typeof p.target === "number" && p.target > 0) ? Math.floor(p.target) : 100,
      moonMode: p.moonMode === "subtract" ? "subtract" : "add",
      firstDealer: isInteger(p.firstDealer) ? mod4(p.firstDealer) : 0,
      rounds: rounds,
    };
  }

  function runningTotals(rounds) {
    var t = [0, 0, 0, 0];
    return (rounds || []).map(function (r) {
      t = t.map(function (v, i) { return v + r.scores[i]; });
      return t.slice();
    });
  }

  // 1-based rank, lowest score first; ties share a rank (1, 1, 3, 4).
  function ranks(totalsArr) {
    return totalsArr.map(function (v) {
      var better = 0;
      totalsArr.forEach(function (o) { if (o < v) better++; });
      return better + 1;
    });
  }

  function moonsOf(rounds) {
    var out = [];
    (rounds || []).forEach(function (r, k) { if (isInteger(r.moon)) out.push({ round: k, player: r.moon }); });
    return out;
  }

  function buildGameRecord(st, finishedAt) {
    var tots = totals(st.rounds);
    var w = winners(tots, st.target);
    var end = typeof finishedAt === "number" ? finishedAt : Date.now();
    return {
      version: 2,
      id: st.id,
      startedAt: st.startedAt,
      finishedAt: end,
      durationMs: Math.max(0, end - (st.startedAt || end)),
      players: st.players.slice(),
      target: st.target,
      moonMode: st.moonMode,
      firstDealer: st.firstDealer || 0,
      rounds: st.rounds.map(function (r) { return { scores: r.scores.slice(), moon: r.moon == null ? null : r.moon, pass: r.pass }; }),
      totals: tots,
      winners: w,
      winnerNames: w.map(function (i) { return st.players[i]; }),
      moons: moonsOf(st.rounds).map(function (m) { return { round: m.round, player: m.player, name: st.players[m.player] }; }),
      hands: st.rounds.length,
    };
  }

  function validGameRecord(g) {
    return !!g && typeof g === "object" && typeof g.id === "string" && g.id.length > 0 && g.id.length < 80 &&
      Array.isArray(g.players) && g.players.length === 4 && g.players.every(function (n) { return typeof n === "string"; }) &&
      Array.isArray(g.rounds) && g.rounds.length > 0 && g.rounds.every(validRound) &&
      typeof g.finishedAt === "number" && isFinite(g.finishedAt);
  }

  // Rebuild derived fields so imported data can't disagree with its own hands.
  function normalizeGameRecord(g) {
    var st = {
      id: g.id, startedAt: typeof g.startedAt === "number" ? g.startedAt : g.finishedAt,
      players: g.players.map(function (n, i) { return normalizeName(String(n).slice(0, 40), "Player " + (i + 1)); }),
      target: isInteger(g.target) && g.target > 0 ? g.target : 100,
      moonMode: g.moonMode === "subtract" ? "subtract" : "add",
      firstDealer: isInteger(g.firstDealer) ? mod4(g.firstDealer) : 0,
      rounds: g.rounds,
    };
    var rec = buildGameRecord(st, g.finishedAt);
    if (!rec.winners.length) { rec.winners = leaders(rec.totals); rec.winnerNames = rec.winners.map(function (i) { return st.players[i]; }); }
    return rec;
  }

  function parseBackup(obj) {
    var list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.games) ? obj.games : null);
    if (!list) return { ok: false, error: "That file has no games in it.", games: [] };
    var games = [], bad = 0;
    list.forEach(function (g) { if (validGameRecord(g)) games.push(normalizeGameRecord(g)); else bad++; });
    var roster = obj && Array.isArray(obj.roster) ? obj.roster.filter(function (n) { return typeof n === "string" && n.trim(); }).map(function (n) { return n.trim().slice(0, 40); }) : [];
    return { ok: true, games: games, invalid: bad, roster: roster };
  }

  function mergeGames(existing, incoming) {
    var ids = {};
    (existing || []).forEach(function (g) { ids[g.id] = true; });
    var added = [], skipped = 0;
    (incoming || []).forEach(function (g) {
      if (ids[g.id]) { skipped++; return; }
      ids[g.id] = true;
      added.push(g);
    });
    return { games: (existing || []).concat(added), added: added, skipped: skipped };
  }

  function nameKey(n) { return String(n || "").trim().replace(/\s+/g, " ").toLowerCase(); }
  function isPlaceholderName(n) { return /^player [1-4]$/i.test(String(n || "").trim()); }

  // Most recent first, unique (case-insensitive), placeholders dropped.
  function updateRoster(roster, names, cap) {
    var out = [], seen = {};
    (names || []).concat(roster || []).forEach(function (n) {
      var k = nameKey(n);
      if (!k || seen[k] || isPlaceholderName(n)) return;
      seen[k] = true;
      out.push(String(n).trim().replace(/\s+/g, " "));
    });
    return out.slice(0, cap || 30);
  }

  function computeStats(games) {
    var by = {};
    (games || []).forEach(function (g) {
      var w = Array.isArray(g.winners) ? g.winners : winners(g.totals || totals(g.rounds), g.target);
      var tots = g.totals || totals(g.rounds);
      g.players.forEach(function (name, i) {
        var k = nameKey(name);
        if (!k) return;
        var s = by[k] || (by[k] = { name: String(name).trim(), key: k, played: 0, wins: 0, sum: 0, moons: 0, best: null, worst: null, last: 0, hands: 0 });
        s.played++;
        if (w.indexOf(i) !== -1) s.wins++;
        s.sum += tots[i];
        s.hands += g.rounds.length;
        g.rounds.forEach(function (r) { if (r.moon === i) s.moons++; });
        if (s.best === null || tots[i] < s.best) s.best = tots[i];
        if (s.worst === null || tots[i] > s.worst) s.worst = tots[i];
        if ((g.finishedAt || 0) >= s.last) { s.last = g.finishedAt || 0; s.name = String(name).trim(); }
      });
    });
    return Object.keys(by).map(function (k) {
      var s = by[k];
      return {
        name: s.name, key: k, played: s.played, wins: s.wins,
        winPct: s.played ? Math.round(s.wins / s.played * 100) : 0,
        avgScore: s.played ? Math.round(s.sum / s.played * 10) / 10 : 0,
        moons: s.moons, best: s.best, worst: s.worst, last: s.last
      };
    }).sort(function (a, b) {
      return b.wins - a.wins || b.winPct - a.winPct || a.avgScore - b.avgScore || b.played - a.played || (a.name < b.name ? -1 : 1);
    });
  }

  function formatDuration(ms) {
    if (!(ms > 0)) return "0m";
    var m = Math.round(ms / 60000);
    if (m < 1) return "<1m";
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60), r = m % 60;
    return h + "h " + (r < 10 ? "0" : "") + r + "m";
  }

  // Undo/redo with snapshots. `hist` = {undo: [], redo: []}.
  function historyRecord(hist, snapshot, cap) {
    var u = (hist && hist.undo ? hist.undo : []).concat([snapshot]);
    var c = cap || 60;
    if (u.length > c) u = u.slice(u.length - c);
    return { undo: u, redo: [] };
  }
  function historyUndo(hist, current) {
    if (!hist || !hist.undo || !hist.undo.length) return null;
    return {
      state: hist.undo[hist.undo.length - 1],
      hist: { undo: hist.undo.slice(0, -1), redo: (hist.redo || []).concat([current]) },
    };
  }
  function historyRedo(hist, current) {
    if (!hist || !hist.redo || !hist.redo.length) return null;
    return {
      state: hist.redo[hist.redo.length - 1],
      hist: { undo: (hist.undo || []).concat([current]), redo: hist.redo.slice(0, -1) },
    };
  }

  // Describes a hand that is being entered, for the hub.
  function handStatus(values) {
    var known = knownCount(values), sum = 0;
    values.forEach(function (v) { if (isSetScore(v)) sum += v; });
    return { known: known, sum: sum, left: 26 - sum, complete: known === 4 && sum === 26, over: sum > 26 };
  }

  return {
    PASS_ORDER: PASS_ORDER,
    PASS_LABELS: PASS_LABELS,
    JOG_BASE_PX: JOG_BASE_PX,
    passForRound: passForRound,
    passLabel: passLabel,
    moonScores: moonScores,
    validateRoundScores: validateRoundScores,
    looksLikeMoon: looksLikeMoon,
    totals: totals,
    leaders: leaders,
    isGameOver: isGameOver,
    winners: winners,
    defaultState: defaultState,
    normalizeName: normalizeName,
    otherSetSum: otherSetSum,
    sliderBounds: sliderBounds,
    clampScore: clampScore,
    assignScore: assignScore,
    clearScore: clearScore,
    reclampScores: reclampScores,
    knownCount: knownCount,
    jogVelocityGain: jogVelocityGain,
    applyJog: applyJog,
    applyJogToValue: applyJogToValue,
    isSetScore: isSetScore,
    MOON_OVERSHOOT_PX: MOON_OVERSHOOT_PX,
    localDx: localDx,
    jogStep: jogStep,
    shuffle: shuffle,
    dealerForRound: dealerForRound,
    passTarget: passTarget,
    makeId: makeId,
    newGameState: newGameState,
    validRound: validRound,
    sanitizeState: sanitizeState,
    runningTotals: runningTotals,
    ranks: ranks,
    moonsOf: moonsOf,
    buildGameRecord: buildGameRecord,
    validGameRecord: validGameRecord,
    normalizeGameRecord: normalizeGameRecord,
    parseBackup: parseBackup,
    mergeGames: mergeGames,
    nameKey: nameKey,
    isPlaceholderName: isPlaceholderName,
    updateRoster: updateRoster,
    computeStats: computeStats,
    formatDuration: formatDuration,
    historyRecord: historyRecord,
    historyUndo: historyUndo,
    historyRedo: historyRedo,
    handStatus: handStatus,
    nextFromBag: nextFromBag,
  };
});
