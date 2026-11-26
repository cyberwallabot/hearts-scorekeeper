/* Part 3: saving hands, moon, undo/redo, editing, hands list, scorecard + chart, winner screen, share card. */
var editStash = null, scTimer = 0, scAuto = false;

function trySave() {
  if (locked() || moonBusy) return;
  var c = ctx(), hs = R.handStatus(entry, c.st);
  if (!hs.complete) { sfx("error"); buzz([20, 40, 20]); toast(hs.reason); return; }
  if (hs.moonCandidate !== null) { askMoon(hs.moonCandidate, true); return; }
  var hand = R.makeHand(entry, c.st);
  commitHand(hand, c);
}

function commitHand(hand, c) {
  var wasOver = isOver(), n = state.players.length;
  hist = R.historyRecord(hist, clone(state));
  var msg;
  if (c.editing) {
    hand.pass = c.hand.pass; hand.dealer = c.hand.dealer;
    if (c.hand.out) hand.out = c.hand.out.slice(); else delete hand.out;
    state.rounds[c.index] = hand;
    editing = null;
    entry = editStash || R.blankEntry(n);
    editStash = null;
    msg = "Hand " + (c.index + 1) + " updated — totals recalculated";
  } else {
    state.rounds.push(hand);
    entry = R.blankEntry(n);
    msg = "Hand " + state.rounds.length + " saved";
  }
  entryUndo = emptyUndo(n);
  syncFinished();
  persist();
  sfx("save"); buzz(18);
  paintAll();
  var nowOver = isOver();
  if (nowOver && !wasOver && !celebrated && !c.editing) {
    celebrated = true; persist();
    if (moonBusy) pendingWinner = true; else showWinnerScreen();
  } else if (nowOver && !wasOver && !celebrated) {
    celebrated = true; persist();
    toast(msg);
    if (moonBusy) pendingWinner = true; else showWinnerScreen();
  } else {
    toast(msg);
    if (!c.editing && settings.autoSheet && !nowOver) {
      if (moonBusy) pendingSheet = true; else openScorecard({ auto: true, hand: state.rounds.length - 1 });
    }
  }
}
var pendingSheet = false;

/* ---------- shooting the moon ---------- */
function askMoon(seat, fromValue) {
  if (locked() || moonBusy || !state) return;
  var c = ctx();
  if (seat === null || seat === undefined) {
    openModal("Who shot the moon?", "<p>Pick the player who took every heart and the ♠Q.</p>" +
      '<div class="pick-list">' + c.active.map(function (i) {
        return '<button type="button" class="ghost pick" data-seat="' + i + '">' + avatar(state, i) + "<span>" + esc(state.players[i]) + "</span></button>";
      }).join("") + "</div>", [{ label: "Cancel", className: "ghost", onClick: closeModal }]);
    faceModal(0);
    $("modal-body").querySelectorAll(".pick").forEach(function (b) {
      b.addEventListener("click", function () { var s = Number(b.getAttribute("data-seat")); closeModal(); askMoon(s); });
    });
    return;
  }
  var jack = state.rules.jack ? (isInt(entry.jack) ? entry.jack : null) : null;
  var draw = function () {
    var hand = R.makeMoonHand(seat, c.st, jack, c.index, c.dealer, c.pass);
    var n = state.players.length, run = R.runningTotals(state.rounds, n);
    var before = c.editing ? (c.index > 0 ? run[c.index - 1] : state.players.map(function () { return 0; })) : R.totals(state.rounds, n);
    var total = handTotal();
    var rows = c.active.map(function (i) {
      return "<tr><td>" + avatar(state, i) + " " + esc(state.players[i]) + "</td><td>" + before[i] + '</td><td class="d">' + (hand.scores[i] >= 0 ? "+" : "") + hand.scores[i] + "</td><td><b>" + (before[i] + hand.scores[i]) + "</b></td></tr>";
    }).join("");
    var how = state.rules.moonMode === "subtract" ? esc(state.players[seat]) + " gets −" + total + "; everyone else 0." : esc(state.players[seat]) + " scores 0; everyone else +" + total + ".";
    var jackHtml = state.rules.jack ? '<div class="field-label">Who took the J♦ (−10)?</div><div class="chips jack-pick">' + c.active.map(function (i) {
      return '<button type="button" data-j="' + i + '" aria-pressed="' + (jack === i ? "true" : "false") + '">' + esc(state.players[i]) + "</button>";
    }).join("") + "</div>" : "";
    return "<p>" + (fromValue ? esc(state.players[seat]) + " took all " + total + " points: that is shooting the moon. " : "") + how + "</p>" +
      '<table class="moon-preview"><thead><tr><th>Player</th><th>Now</th><th>Hand</th><th>New total</th></tr></thead><tbody>' + rows + "</tbody></table>" + jackHtml;
  };
  var confirm = function () {
    if (state.rules.jack && jack === null) { toast("Pick who took the J♦ first."); sfx("error"); return; }
    closeModal();
    triggerMoon(seat, jack);
  };
  openModal(state.players[seat] + " shot the moon?", draw(), [
    { label: fromValue ? "Cancel" : "Not a moon", className: "ghost", id: "moon-cancel", onClick: closeModal },
    { label: "🌙 Shoot the moon", className: "primary", id: "moon-confirm", onClick: confirm }
  ]);
  faceModal(seatRot(seat));
  var wireJack = function () {
    $("modal-body").querySelectorAll("[data-j]").forEach(function (b) {
      b.addEventListener("click", function () { jack = Number(b.getAttribute("data-j")); $("modal-body").innerHTML = draw(); wireJack(); });
    });
  };
  wireJack();
}

function triggerMoon(seat, jack) {
  if (moonBusy) return;
  endAllDrags();
  var c = ctx();
  var hand = R.makeMoonHand(seat, c.st, jack, c.index, c.dealer, c.pass);
  moonBusy = true; // so the winner screen / scorecard waits for the animation
  startMoonAnimation(seat);
  commitHand(hand, c);
}

function pickVariant() {
  var ids = M.VARIANTS.map(function (v) { return v.id; });
  var r = R.nextFromBag(Array.isArray(moonBag.bag) ? moonBag.bag : [], ids, Math.random, moonBag.last);
  moonBag = { bag: r.bag, last: r.id };
  DB.kvSet("moonBag", moonBag);
  return r.id;
}
function moonDone() {
  moonBusy = false;
  moonCtl = null;
  $("moon-stage").hidden = true;
  $("moon-stage").innerHTML = "";
  paintAll();
  if (pendingWinner) { pendingWinner = false; pendingSheet = false; showWinnerScreen(); }
  else if (pendingSheet) { pendingSheet = false; openScorecard({ auto: true, hand: state.rounds.length - 1 }); }
}
function moonText() {
  var t = handTotal();
  return state.rules.moonMode === "subtract" ? "Minus " + t + " for the shooter" : "Everyone else takes " + t;
}
function playCalmMoon(name) {
  var stage = $("moon-stage");
  stage.hidden = false;
  stage.innerHTML = '<div class="moon-sky calm"></div><div class="calm-moon"><span class="calm-badge">🌙</span><b>' + esc(name) + " shot the moon!</b><span>" + esc(moonText()) + "</span><small>Tap to continue</small></div>";
  var t = setTimeout(moonDone, 2200);
  return { skip: function () { clearTimeout(t); moonDone(); } };
}
// The celebration is always upright (rot 0), whichever layout is in use.
function startMoonAnimation(seat, forcedId) {
  var id = forcedId || pickVariant();
  moonBusy = true;
  moonStartedAt = Date.now();
  sfx("bang");
  buzz([20, 60, 120]);
  var name = state.players[seat];
  if (calm() && !forcedId) { moonCtl = playCalmMoon(name); return "calm"; }
  moonCtl = M.play({ container: $("moon-stage"), name: name, rot: 0, variant: id, timeScale: window.__heartsTS || 1, onDone: moonDone });
  return id;
}
$("moon-stage").addEventListener("pointerdown", function (e) {
  e.preventDefault();
  if (moonCtl && Date.now() - moonStartedAt > 500) moonCtl.skip();
});

/* ---------- undo / redo / edit / delete ---------- */
function describeChange(a, b) {
  if (!a || !b) return "";
  if (b.rounds.length > a.rounds.length) return "hand " + b.rounds.length + " is back";
  if (b.rounds.length < a.rounds.length) return "hand " + a.rounds.length + " removed";
  if (JSON.stringify(a.out) !== JSON.stringify(b.out) || a.players.join() !== b.players.join()) return "players restored";
  return "change undone";
}
function undo() {
  if (!hist.undo.length || moonBusy) return;
  var wasOver = isOver();
  var r = R.historyUndo(hist, clone(state));
  var before = state;
  state = r.state; hist = r.hist;
  editing = null; editStash = null;
  entry = R.blankEntry(state.players.length); entryUndo = emptyUndo(state.players.length);
  syncFinished();
  if (wasOver && !isOver()) celebrated = false;
  persist(); paintAll();
  sfx("undo"); buzz(10);
  toast("Undo: " + describeChange(before, state), hist.redo.length ? { label: "Redo", run: redo } : null);
}
function redo() {
  if (!hist.redo.length || moonBusy) return;
  var r = R.historyRedo(hist, clone(state));
  var before = state;
  state = r.state; hist = r.hist;
  editing = null; editStash = null;
  entry = R.blankEntry(state.players.length); entryUndo = emptyUndo(state.players.length);
  syncFinished();
  if (isOver()) celebrated = true; // redo never replays the winner screen
  persist(); paintAll();
  sfx("save");
  var d = before.rounds.length < state.rounds.length ? "hand " + state.rounds.length + " restored" : "change redone";
  toast("Redo: " + d);
}
function startEdit(idx) {
  var h = state.rounds[idx];
  if (!h) return;
  closeSheet(); closeScorecard(); hideWinnerScreen();
  if (editing == null) editStash = clone(entry);
  editing = idx;
  var n = state.players.length, total = handTotal();
  var pts = h.pts ? h.pts.slice() : state.players.map(function (p, i) { return i === h.moon ? total : 0; });
  entry = { pts: pts.map(function (v, i) { return h.out && h.out[i] ? null : v; }), queen: h.moon === null ? h.queen : null, jack: h.jack };
  entryUndo = emptyUndo(n);
  persist(); paintAll();
  toast("Editing hand " + (idx + 1) + (h.moon !== null ? " (moon by " + state.players[h.moon] + ")" : ""));
}
function cancelEdit() {
  if (editing == null) return;
  editing = null;
  entry = editStash || R.blankEntry(state.players.length);
  editStash = null;
  entryUndo = emptyUndo(state.players.length);
  persist(); paintAll();
  toast("Edit cancelled");
}
function deleteRound(idx) {
  var h = state.rounds[idx];
  if (!h) return;
  openModal("Delete hand " + (idx + 1) + "?", "<p>" + esc(R.handRecap(h, state.players) || "") + "</p><p>Later hands keep their scores; totals are recalculated. You can undo this.</p>", [
    { label: "Keep it", className: "ghost", onClick: closeModal },
    { label: "Delete hand", className: "danger", id: "delete-confirm", onClick: function () {
      closeModal();
      hist = R.historyRecord(hist, clone(state));
      state.rounds.splice(idx, 1);
      if (editing != null) cancelEdit();
      syncFinished(); persist(); paintAll(); closeSheet();
      toast("Hand " + (idx + 1) + " deleted — totals recalculated", { label: "Undo", run: undo });
    } }
  ]);
}

/* ---------- hands list ---------- */
function handTags(h, st) {
  var t = [];
  if (h.moon !== null) t.push('<span class="tag moon">☾ Shot the moon: ' + esc(st.players[h.moon]) + "</span>");
  else if (isInt(h.queen)) t.push('<span class="tag q">♠Q ' + esc(st.players[h.queen]) + "</span>");
  if (isInt(h.jack)) t.push('<span class="tag j">J♦ ' + esc(st.players[h.jack]) + "</span>");
  return t.join("");
}
function showHands() {
  if (!state) return;
  openSheet("Hands", function (body) {
    if (!state.rounds.length) { body.innerHTML = '<p class="empty">No hands saved yet. Enter each player\'s points, then Save.</p>'; return; }
    var n = state.players.length, run = R.runningTotals(state.rounds, n);
    var html = state.rounds.map(function (h, k) { return k; }).reverse().map(function (k) {
      var h = state.rounds[k];
      return '<div class="hist-item"><div class="top"><span class="rlabel">Hand ' + (k + 1) + '</span><span class="rpass">' + esc(R.PASS_LABEL[h.pass]) + " · " + esc(state.players[h.dealer] || "") + " dealt</span></div>" +
        '<div class="recap">' + esc(R.handRecap(h, state.players)) + "</div>" + handTags(h, state) +
        '<div class="hgrid">' + state.players.map(function (p, i) {
          if (h.out && h.out[i]) return "";
          return '<div class="' + (h.moon === i ? "shooter" : "") + '">' + avatar(state, i) + "<span>" + esc(p) + "</span><b>" + (h.scores[i] > 0 ? "+" : "") + h.scores[i] +
            (h.queen === i && h.moon === null ? ' <em class="qb">♠Q</em>' : "") + "</b><small>total " + run[k][i] + "</small></div>";
        }).join("") + "</div>" +
        '<div class="row-actions"><button type="button" class="ghost small" data-edit="' + k + '">Edit hand ' + (k + 1) + '</button><button type="button" class="ghost small" data-del="' + k + '">Delete</button></div></div>';
    }).join("");
    body.innerHTML = html;
    body.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { startEdit(Number(b.getAttribute("data-edit"))); }); });
    body.querySelectorAll("[data-del]").forEach(function (b) { b.addEventListener("click", function () { deleteRound(Number(b.getAttribute("data-del"))); }); });
  });
}

/* ---------- scorecard (table + chart) ---------- */
function chartSvg(st, w, h) {
  var n = st.players.length, run = R.runningTotals(st.rounds, n), act = R.activeSeats(st);
  var all = [0, st.target];
  run.forEach(function (r) { r.forEach(function (v) { all.push(v); }); });
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all) * 1.05;
  var pl = 34, pr = 10, pt = 10, pb = 22, W = w - pl - pr, H = h - pt - pb;
  var hands = Math.max(1, run.length);
  var x = function (k) { return pl + (k / hands) * W; };
  var y = function (v) { return pt + H - (v - lo) / (hi - lo || 1) * H; };
  var s = '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Running totals by hand, line per player, dashed line at ' + st.target + '">';
  var step = hi - lo > 160 ? 50 : hi - lo > 60 ? 20 : 10, v;
  for (v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    s += '<line class="grid" x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="ax" x="' + (pl - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + "</text>";
  }
  for (var k = 0; k <= hands; k++) if (hands <= 12 || k % Math.ceil(hands / 12) === 0) s += '<text class="ax" x="' + x(k).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle">' + k + "</text>";
  s += '<line class="target" x1="' + pl + '" x2="' + (w - pr) + '" y1="' + y(st.target).toFixed(1) + '" y2="' + y(st.target).toFixed(1) + '"/>' +
    '<text class="tlabel" x="' + (w - pr) + '" y="' + (y(st.target) - 5).toFixed(1) + '" text-anchor="end">Game ends at ' + st.target + "</text>";
  st.players.forEach(function (p, i) {
    var pts = ["" + x(0).toFixed(1) + "," + y(0).toFixed(1)].concat(run.map(function (r, k) { return x(k + 1).toFixed(1) + "," + y(r[i]).toFixed(1); }));
    var out = act.indexOf(i) === -1;
    s += '<polyline class="pl' + (out ? " out" : "") + '" points="' + pts.join(" ") + '" style="stroke:' + colorOf(st, i) + '"/>';
    if (run.length) s += '<circle cx="' + x(run.length).toFixed(1) + '" cy="' + y(run[run.length - 1][i]).toFixed(1) + '" r="4" style="fill:' + colorOf(st, i) + '"/>';
  });
  return s + "</svg>";
}
function scorecardHtml(st, opts) {
  opts = opts || {};
  var n = st.players.length, run = R.runningTotals(st.rounds, n), tots = R.totals(st.rounds, n), act = R.activeSeats(st);
  var rk = R.ranks(tots, act), lead = st.rounds.length ? R.leaders(tots, act) : [], last = R.losers(tots, act);
  var order = st.players.map(function (p, i) { return i; });
  var stand = '<div class="sc-standings">' + order.slice().sort(function (a, b) {
    var ao = act.indexOf(a) === -1, bo = act.indexOf(b) === -1;
    return ao - bo || tots[a] - tots[b] || a - b;
  }).map(function (i) {
    var out = act.indexOf(i) === -1;
    return '<div class="sc-pl' + (lead.indexOf(i) !== -1 ? " lead" : "") + (last.indexOf(i) !== -1 ? " last" : "") + (out ? " out" : "") + '">' +
      '<span class="rk">' + (out ? "–" : rk[i]) + "</span>" + avatar(st, i) + '<span class="nm">' + esc(st.players[i]) + (out ? " (left)" : "") + "</span><b>" + tots[i] + "</b></div>";
  }).join("") + "</div>";
  var head = "<tr><th>#</th>" + order.map(function (i) {
    return '<th style="--pc:' + colorOf(st, i) + '">' + avatar(st, i) + '<span class="thn">' + esc(st.players[i]) + "</span></th>";
  }).join("") + "<th>Deal · pass</th></tr>";
  var rows = st.rounds.map(function (h, k) {
    var hi = opts.hand === k ? " fresh" : "";
    return '<tr class="' + (h.moon !== null ? "moon" : "") + hi + '"><td class="h">' + (k + 1) + "</td>" + order.map(function (i) {
      if (h.out && h.out[i]) return '<td class="na">–</td>';
      var b = (h.moon === i ? '<em class="mt">☾</em>' : "") + (h.queen === i && h.moon === null ? '<em class="qb">♠Q</em>' : "") + (h.jack === i ? '<em class="jb">J♦</em>' : "");
      return "<td" + (h.moon === i ? ' class="shooter"' : "") + "><b>" + (h.scores[i] > 0 ? "+" : "") + h.scores[i] + "</b>" + b + "<small>" + run[k][i] + "</small></td>";
    }).join("") + '<td class="ps">' + esc(initialOf(st.players[h.dealer])) + " · " + esc(R.PASS_LABEL[h.pass].replace("Pass ", "")) +
      (h.moon !== null ? '<br><span class="tag moon">☾ ' + esc(st.players[h.moon]) + "</span>" : "") +
      (opts.readOnly ? "" : ' <button type="button" class="link small" data-edit="' + k + '" aria-label="Edit hand ' + (k + 1) + '">Edit</button>') + "</td></tr>";
  }).join("");
  if (!rows) rows = '<tr><td colspan="' + (n + 2) + '" class="muted">No hands yet</td></tr>';
  var foot = "<tr><td>Total</td>" + order.map(function (i) {
    return '<td class="' + (lead.indexOf(i) !== -1 ? "win" : "") + '"><b>' + tots[i] + "</b><small>" + (act.indexOf(i) === -1 ? "left" : ordinal(rk[i])) + "</small></td>";
  }).join("") + "<td></td></tr>";
  var legend = '<div class="legend">' + order.map(function (i) { return '<span><i style="background:' + colorOf(st, i) + '"></i>' + esc(st.players[i]) + "</span>"; }).join("") + '<span><i class="tl"></i>Game ends at ' + st.target + "</span></div>";
  return stand + '<div class="sc-grid2"><div class="scoresheet scd"><table><thead>' + head + "</thead><tbody>" + rows + "</tbody><tfoot>" + foot + "</tfoot></table></div>" +
    '<div class="sc-chart">' + chartSvg(st, 640, 300) + legend + "</div></div>" +
    '<p class="muted small">House rules: ' + esc(st.rules.name) + " · " + esc(R.rulesSummary(st.rules)) + " · Lowest score wins.</p>";
}
function openScorecard(opts) {
  if (!state) return;
  opts = opts || {};
  closeSheet();
  clearTimeout(scTimer);
  scAuto = !!opts.auto;
  $("sc-title").textContent = "Scorecard";
  $("sc-body").innerHTML = scorecardHtml(state, { hand: opts.hand });
  $("sc-body").querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { startEdit(Number(b.getAttribute("data-edit"))); }); });
  var rc = $("sc-recap");
  if (opts.auto && isInt(opts.hand) && state.rounds[opts.hand]) {
    rc.hidden = false;
    rc.innerHTML = "<b>Hand " + (opts.hand + 1) + ":</b> " + esc(R.handRecap(state.rounds[opts.hand], state.players)) +
      ' <span class="muted">Back to the table in 3 s</span> <button type="button" class="ghost small" id="sc-stay">Stay here</button>';
    $("sc-stay").addEventListener("click", function () { clearTimeout(scTimer); scAuto = false; rc.querySelector(".muted").textContent = ""; $("sc-stay").remove(); });
    scTimer = setTimeout(function () { if (scAuto) closeScorecard(); }, 3000);
  } else rc.hidden = true;
  $("scorecard").hidden = false;
  $("scorecard").scrollTop = 0;
  paintClock();
}
function closeScorecard() { clearTimeout(scTimer); scAuto = false; $("scorecard").hidden = true; }
$("sc-back").addEventListener("click", closeScorecard);
$("scorecard").addEventListener("pointerdown", function (e) { if (scAuto && !(e.target.closest && e.target.closest("#sc-back"))) { /* any touch keeps it open */ clearTimeout(scTimer); scAuto = false; var m = $("sc-recap").querySelector(".muted"); if (m) m.textContent = ""; } });

/* ---------- winner screen ---------- */
function bestMoment(st) {
  var moons = st.rounds.map(function (h, k) { return h.moon !== null ? k : -1; }).filter(function (k) { return k >= 0; });
  if (moons.length) { var k = moons[moons.length - 1]; return st.players[st.rounds[k].moon] + " shot the moon in hand " + (k + 1); }
  var act = R.activeSeats(st), best = null;
  act.forEach(function (i) {
    var clean = st.rounds.filter(function (h) { return h.scores[i] <= 0; }).length;
    if (!best || clean > best.n) best = { i: i, n: clean };
  });
  if (best && best.n) return st.players[best.i] + " stayed clean in " + plural(best.n, "hand");
  return "";
}
function standingsHtml(st) {
  var n = st.players.length, tots = R.totals(st.rounds, n), act = R.activeSeats(st), w = R.winners(st), rk = R.ranks(tots, act);
  var moons = st.players.map(function () { return 0; }), queens = moons.slice();
  st.rounds.forEach(function (h) { if (h.moon !== null) moons[h.moon]++; else if (isInt(h.queen)) queens[h.queen]++; });
  return act.slice().sort(function (a, b) { return tots[a] - tots[b] || a - b; }).map(function (i) {
    return '<li class="' + (w.indexOf(i) !== -1 ? "win" : "") + '"><span class="pos">' + ordinal(rk[i]) + "</span>" + avatar(st, i) + '<span class="nm">' + esc(st.players[i]) +
      (moons[i] ? ' <em class="moons">' + new Array(moons[i] + 1).join("☾") + "</em>" : "") + (queens[i] ? ' <em class="qs">♠Q×' + queens[i] + "</em>" : "") + "</span><b>" + tots[i] + "</b></li>";
  }).join("");
}
var confettiRaf = 0;
function confetti() {
  var cv = $("confetti");
  var ctx2 = cv.getContext && cv.getContext("2d");
  if (!ctx2 || calm()) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
  var colors = ["#ff4d5e", "#f3e2a8", "#ffffff", "#5ee08f", "#7cc0ff", "#d72638"];
  var parts = [], k;
  for (k = 0; k < 160; k++) {
    parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.2, y: H * 0.45, vx: (Math.random() - 0.5) * 22 * dpr, vy: (-Math.random() * 22 - 6) * dpr,
      r: (4 + Math.random() * 6) * dpr, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: colors[k % colors.length], heart: k % 5 === 0 });
  }
  var t0 = performance.now();
  cancelAnimationFrame(confettiRaf);
  function frame(now) {
    ctx2.clearRect(0, 0, W, H);
    var alive = false;
    parts.forEach(function (p) {
      p.vy += 0.55 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      if (p.y < H + 40) alive = true;
      ctx2.save(); ctx2.translate(p.x, p.y); ctx2.rotate(p.a); ctx2.fillStyle = p.c;
      if (p.heart) { ctx2.font = (p.r * 3) + "px sans-serif"; ctx2.fillText("♥", -p.r, p.r); }
      else ctx2.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx2.restore();
    });
    if (alive && now - t0 < 6000 && !$("winner-screen").hidden) confettiRaf = requestAnimationFrame(frame);
    else ctx2.clearRect(0, 0, W, H);
  }
  confettiRaf = requestAnimationFrame(frame);
}
var winnerShows = 0;
function showWinnerScreen(quiet) {
  if (!isOver()) return;
  closeScorecard(); closeSheet(); closeKeypad();
  var n = state.players.length, tots = R.totals(state.rounds, n), w = R.winners(state);
  var moons = state.rounds.filter(function (h) { return h.moon !== null; }).length;
  $("ws-title").textContent = winnerLine(w, tots);
  $("ws-sub").textContent = plural(state.rounds.length, "hand") + " · " + R.formatDuration(elapsed()) + (moons ? " · " + plural(moons, "moon") : "") + " · Game to " + state.target + ". Saved to history.";
  var bm = bestMoment(state);
  $("ws-moment").textContent = bm ? "Best moment: " + bm : "";
  $("ws-moment").hidden = !bm;
  $("ws-standings").innerHTML = standingsHtml(state);
  $("winner-screen").hidden = false;
  winnerShows++;
  if (!quiet) { sfx("win"); buzz([30, 50, 30, 50, 120]); confetti(); }
}
function hideWinnerScreen() { $("winner-screen").hidden = true; cancelAnimationFrame(confettiRaf); }
$("ws-close").addEventListener("click", hideWinnerScreen);
$("ws-rematch").addEventListener("click", function () { hideWinnerScreen(); rematch(); });
$("ws-new").addEventListener("click", function () { hideWinnerScreen(); goToSetup(); });
$("ws-sheet").addEventListener("click", function () { hideWinnerScreen(); openScorecard(); });
$("ws-share").addEventListener("click", function () { shareResults(state); });

/* ---------- share card (PNG, made on this device) ---------- */
function shareCanvas(st) {
  var W = 1080, H = 1350, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  var g = cv.getContext("2d");
  var n = st.players.length, tots = R.totals(st.rounds, n), act = R.activeSeats(st), w = R.winners(st);
  var grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#0d2a1f"); grd.addColorStop(1, "#06110c");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = "#d72638"; g.font = "bold 64px system-ui, sans-serif"; g.fillText("♥", 80, 140);
  g.fillStyle = "#f3e2a8"; g.font = "600 40px system-ui, sans-serif"; g.fillText("Hearts Table", 160, 132);
  g.fillStyle = "#ffffff"; g.font = "800 78px system-ui, sans-serif";
  var title = w.length ? (w.length > 1 ? R.listNames(w.map(function (k) { return st.players[k]; })) + " tie!" : st.players[w[0]] + " wins with " + tots[w[0]] + "!") : "Game in progress";
  g.fillText(title.length > 24 ? title.slice(0, 24) + "…" : title, 80, 260);
  g.fillStyle = "#b9c9c0"; g.font = "36px system-ui, sans-serif";
  var moons = st.rounds.filter(function (h) { return h.moon !== null; }).length;
  g.fillText(fmtDay(st.finishedAt || Date.now()) + " · " + plural(st.rounds.length, "hand") + (moons ? " · " + plural(moons, "moon") : "") + " · to " + st.target, 80, 320);
  var rk = R.ranks(tots, act), y = 420;
  act.slice().sort(function (a, b) { return tots[a] - tots[b] || a - b; }).forEach(function (i) {
    var win = w.indexOf(i) !== -1;
    g.fillStyle = win ? "rgba(243,226,168,.16)" : "rgba(255,255,255,.06)";
    g.beginPath(); if (g.roundRect) g.roundRect(70, y - 62, W - 140, 96, 24); else g.rect(70, y - 62, W - 140, 96); g.fill();
    g.fillStyle = "#ffffff"; g.font = "700 40px system-ui, sans-serif"; g.fillText(String(rk[i]), 100, y);
    g.fillStyle = colorOf(st, i); g.beginPath(); g.arc(190, y - 14, 32, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.font = "700 34px system-ui, sans-serif"; g.textAlign = "center"; g.fillText(initialOf(st.players[i]), 190, y - 2); g.textAlign = "left";
    g.font = (win ? "700 " : "500 ") + "44px system-ui, sans-serif"; g.fillText(st.players[i], 245, y);
    g.textAlign = "right"; g.font = "800 52px system-ui, sans-serif"; g.fillText(String(tots[i]), W - 110, y); g.textAlign = "left";
    y += 116;
  });
  var bm = bestMoment(st);
  if (bm) { g.fillStyle = "#f3e2a8"; g.font = "italic 36px system-ui, sans-serif"; g.fillText("Best moment: " + bm, 80, y + 10); y += 50; }
  // mini chart
  var run = R.runningTotals(st.rounds, n), top = Math.max(y + 40, 1000), bottom = H - 110, left = 90, right = W - 90;
  var hi = Math.max(st.target, Math.max.apply(null, [0].concat([].concat.apply([], run)))) * 1.05, lo = Math.min(0, Math.min.apply(null, [0].concat([].concat.apply([], run))));
  var X = function (k) { return left + k / Math.max(1, run.length) * (right - left); }, Y = function (v) { return bottom - (v - lo) / (hi - lo || 1) * (bottom - top); };
  g.strokeStyle = "rgba(255,255,255,.35)"; g.setLineDash([10, 10]); g.lineWidth = 3; g.beginPath(); g.moveTo(left, Y(st.target)); g.lineTo(right, Y(st.target)); g.stroke(); g.setLineDash([]);
  act.forEach(function (i) {
    g.strokeStyle = colorOf(st, i); g.lineWidth = 6; g.beginPath(); g.moveTo(X(0), Y(0));
    run.forEach(function (r, k) { g.lineTo(X(k + 1), Y(r[i])); }); g.stroke();
  });
  g.fillStyle = "#8fa69a"; g.font = "28px system-ui, sans-serif"; g.fillText("Scored with Hearts Table · lowest score wins", 80, H - 50);
  return cv;
}
function shareResults(st) {
  var cv = shareCanvas(st);
  var name = "hearts-" + new Date(st.finishedAt || Date.now()).toISOString().slice(0, 10) + ".png";
  var done = function (blob) {
    if (!blob) { toast("Couldn't make the image."); return; }
    var file = null;
    try { file = new File([blob], name, { type: "image/png" }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      navigator.share({ files: [file], title: "Hearts results" }).catch(function () {});
    } else { download(name, blob); toast("Saved " + name); }
  };
  if (cv.toBlob) cv.toBlob(done, "image/png"); else done(null);
}
