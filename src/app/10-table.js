/* Part 2: the game screen. Pass-the-phone (upright, default) and shared-table (rotated, 4 players) layouts. */
var built = { key: "", mode: "phone" };
var drags = {};        // pointerId -> drag
var dragBySeat = {};   // seat -> drag
var keypadSeat = null, keypadBuf = "", keypadFresh = true;

function layoutMode() {
  if (!state) return "phone";
  return settings.layout === "table" && state.players.length === 4 && R.activeSeats(state).length === 4 ? "table" : "phone";
}
function seatRot(i) { return layoutMode() === "table" ? TABLE_SEATS[i].rot : 0; }

// Everything about the hand being entered (or edited).
function ctx() {
  if (editing != null && state.rounds[editing]) {
    var h = state.rounds[editing];
    var st = { players: state.players, colors: state.colors, rules: state.rules, target: state.target, firstDealer: state.firstDealer,
      out: h.out ? h.out.slice() : state.players.map(function () { return false; }), rounds: state.rounds.slice(0, editing), started: true };
    return { st: st, index: editing, pass: h.pass, dealer: h.dealer, active: R.activeSeats(st), editing: true, hand: h };
  }
  var act = R.activeSeats(state);
  return { st: state, index: state.rounds.length, pass: R.passFor(state.rounds.length, act.length, state.rules.passMode),
    dealer: R.currentDealer(state), active: act, editing: false, hand: null };
}
function handTotal() { return R.pointsTotal(state.rules); }
function locked() { return isOver() && editing == null; }
function status() { var c = ctx(); return R.handStatus(entry, c.st); }
function boundsFor(i) { var c = ctx(); return R.entryBounds(entry.pts, i, c.active, handTotal()); }

/* ---------- build ---------- */
function cardHtml(i) {
  var jack = state.rules.jack;
  return '<div class="card" id="card-' + i + '" data-seat="' + i + '" tabindex="0" role="group" aria-label="' + esc(state.players[i]) + '" style="--pc:' + colorOf(state, i) + '">' +
    '<div class="c-top">' + avatar(state, i) + '<span class="c-name">' + esc(state.players[i]) + '</span>' +
      '<span class="chip rank" id="crank-' + i + '"></span><span class="chip dealer" id="cdeal-' + i + '" hidden>Deals</span></div>' +
    '<div class="c-mid"><div class="c-total"><span class="c-tl">total</span><b id="ctot-' + i + '">0</b><span class="c-after" id="cafter-' + i + '"></span></div>' +
      '<div class="c-pass" id="cpass-' + i + '"></div></div>' +
    '<div class="c-entry">' +
      '<button type="button" class="step" id="cminus-' + i + '" aria-label="' + esc(state.players[i]) + ' minus 1">−</button>' +
      '<button type="button" class="c-val unknown" id="cval-' + i + '" aria-label="' + esc(state.players[i]) + ' points this hand">?</button>' +
      '<button type="button" class="step" id="cplus-' + i + '" aria-label="' + esc(state.players[i]) + ' plus 1">+</button>' +
      '<div class="c-slider" id="cslider-' + i + '" data-seat="' + i + '" role="slider" tabindex="0" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="26" aria-valuenow="0" aria-label="' + esc(state.players[i]) + ' score slider">' +
        '<div class="cs-track" id="cstrack-' + i + '"><i class="cs-fill" id="csfill-' + i + '"></i><span class="cs-thumb" id="csthumb-' + i + '"></span></div>' +
      '</div>' +
    '</div>' +
    '<div class="c-acts">' +
      '<button type="button" class="c-ok" id="cok-' + i + '" hidden></button>' +
      '<button type="button" class="c-q" id="cq-' + i + '" hidden aria-pressed="false">♠Q</button>' +
      (jack ? '<button type="button" class="c-j" id="cj-' + i + '" aria-pressed="false">J♦</button>' : "") +
      '<button type="button" class="c-moon" id="cmoon-' + i + '" hidden>🌙 Moon</button>' +
    '</div>' +
    '<div class="c-drag" id="cdrag-' + i + '" hidden><div class="cd-num" id="cdnum-' + i + '">0</div>' +
      '<div class="cd-slider"><div class="cd-track"><i id="cdbar-' + i + '"></i><span class="cd-thumb" id="cdthumb-' + i + '"></span></div></div>' +
      '<div class="cd-range"><span id="cdmin-' + i + '">0</span><span id="cdcap-' + i + '"></span><span id="cdmax-' + i + '">26</span></div>' +
      '<div class="cd-moon" id="cdmoon-' + i + '"><span>🌙 keep pushing to shoot the moon</span><div class="bar"><i></i></div></div></div>' +
  '</div>';
}
function controlsHtml() {
  return '<header class="g-head">' +
      '<div class="g-title" id="g-title"></div>' +
      '<div class="g-meta"><span id="g-rules"></span><span id="g-target"></span><span id="g-clock" class="g-clock"></span>' +
      '<span class="wake" id="wake-pill" role="status"><i></i><span></span></span></div>' +
      '<div class="edit-banner" id="edit-banner" hidden><span id="edit-text"></span><button type="button" class="ghost small" id="edit-cancel">Cancel edit</button></div>' +
    '</header>';
}
function entryHtml() {
  return '<section class="g-entry" id="g-entry">' +
      '<div class="meter" id="meter"><i id="meter-bar"></i></div>' +
      '<div class="g-status"><b id="entry-status"></b><span id="entry-hint"></span></div>' +
      '<div class="g-actions">' +
        '<button type="button" class="moon-main" id="moon-btn">🌙 Shoot the moon</button>' +
        '<button type="button" class="primary save" id="save-btn"><span class="sv-main" id="save-main">Save hand</span><span class="sv-why" id="save-why"></span></button>' +
      '</div>' +
      '<div class="g-over" id="g-over" hidden><b id="g-over-text"></b><button type="button" class="primary small" id="g-over-results">See results</button><button type="button" class="ghost small" id="g-over-new">New game</button></div>' +
    '</section>';
}
function barHtml() {
  var b = function (id, icon, label) { return '<button type="button" class="bar-btn" id="' + id + '"><svg class="ic"><use href="#ic-' + icon + '"/></svg><span>' + label + "</span></button>"; };
  return '<nav class="g-bar" aria-label="Game">' + b("undo-btn", "undo", "Undo") + b("redo-btn", "redo", "Redo") + b("sheet-btn", "chart", "Scorecard") +
    b("hands-btn", "list", "Hands") + b("help-btn", "help", "Help") + b("menu-btn", "menu", "Menu") + "</nav>";
}

function buildGame() {
  var mode = layoutMode(), act = R.activeSeats(state);
  var key = mode + "|" + state.id + "|" + state.players.join("/") + "|" + act.join(",") + "|" + state.rules.jack;
  if (built.key === key) return;
  endAllDrags();
  built = { key: key, mode: mode };
  var g = $("game");
  g.className = "game lay-" + mode + " n" + act.length;
  if (mode === "table") {
    g.innerHTML = '<div class="tbl">' + TABLE_SEATS.map(function (s, i) {
      return '<div class="tq q-' + s.pos + '"><div class="seat" id="seat-' + i + '" style="--rot:' + s.rot + 'deg">' + cardHtml(i) + "</div></div>";
    }).join("") + '<div class="hubx">' + controlsHtml() + entryHtml() + barHtml() + "</div></div>";
  } else {
    g.innerHTML = controlsHtml() + '<section class="cards" id="cards">' + act.map(cardHtml).join("") + "</section>" + entryHtml() + barHtml();
  }
  act.forEach(wireCard);
  $("save-btn").addEventListener("click", trySave);
  $("moon-btn").addEventListener("click", function () { askMoon(null); });
  $("undo-btn").addEventListener("click", undo);
  $("redo-btn").addEventListener("click", redo);
  $("sheet-btn").addEventListener("click", function () { openScorecard(); });
  $("hands-btn").addEventListener("click", showHands);
  $("help-btn").addEventListener("click", showHelpMenu);
  $("menu-btn").addEventListener("click", showMenu);
  $("edit-cancel").addEventListener("click", cancelEdit);
  $("g-over-results").addEventListener("click", function () { showWinnerScreen(true); });
  $("g-over-new").addEventListener("click", askNewGame);
  sizeSeats();
}

function sizeSeats() {
  if (built.mode !== "table") return;
  TABLE_SEATS.forEach(function (s, i) {
    var seat = $("seat-" + i);
    if (!seat) return;
    var r = seat.parentNode.getBoundingClientRect();
    var swap = s.rot === 90 || s.rot === 270;
    seat.style.width = (swap ? r.height : r.width) + "px";
    seat.style.height = (swap ? r.width : r.height) + "px";
  });
}

function wireCard(i) {
  var card = $("card-" + i);
  card.addEventListener("pointerdown", function (e) { onDown(e, i); });
  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerup", onUp);
  card.addEventListener("pointercancel", onCancel);
  card.addEventListener("lostpointercapture", onCancel);
  card.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  card.addEventListener("keydown", function (e) { onCardKey(e, i); });
  $("cminus-" + i).addEventListener("click", function () { stepPts(i, -1); });
  $("cplus-" + i).addEventListener("click", function () { stepPts(i, 1); });
  $("cval-" + i).addEventListener("click", function (e) { if (e.detail === 0) openKeypad(i); }); // keyboard activation; pointer taps go through onUp
  $("cok-" + i).addEventListener("click", function () { var hs = status(); if (hs.suggestion && hs.suggestion.seat === i) setPts(i, hs.suggestion.value); });
  $("cq-" + i).addEventListener("click", function () { if (locked()) return; entry.queen = entry.queen === i ? null : i; persist(); paintAll(); buzz(8); });
  if ($("cj-" + i)) $("cj-" + i).addEventListener("click", function () { if (locked()) return; entry.jack = entry.jack === i ? null : i; persist(); paintAll(); buzz(8); });
  $("cmoon-" + i).addEventListener("click", function () { askMoon(i); });
  var sl = $("cslider-" + i);
  sl.addEventListener("pointerdown", onSliderDown, { passive: false });
  sl.addEventListener("pointermove", onSliderMove, { passive: false });
  sl.addEventListener("pointerup", onSliderUp);
  sl.addEventListener("pointercancel", onSliderCancel);
  sl.addEventListener("lostpointercapture", onSliderCancel);
}

/* ---------- entry operations ---------- */
function setPts(i, v, quiet) {
  if (locked() || moonBusy) return;
  var total = handTotal(), b = boundsFor(i);
  if (v !== null) {
    v = Math.max(0, Math.min(total, Math.round(v)));
    if (v === total) { askMoon(i, true); return; }
    if (v > b.max) { toast("Only " + b.max + " points left to give " + state.players[i] + "."); sfx("error"); return; }
  }
  if (entry.pts[i] === v) { paintAll(); return; }
  entryUndo[i] = (entryUndo[i] || []).concat([entry.pts[i]]).slice(-20);
  entry.pts[i] = v;
  if (entry.queen === i && (v === null || v < 13)) entry.queen = null;
  persist();
  if (!quiet) { buzz(8); sfx("tick"); }
  paintAll();
  popVal(i);
}
function stepPts(i, d) {
  if (locked()) return;
  var cur = entry.pts[i], hs = status();
  if (cur === null) {
    if (hs.suggestion && hs.suggestion.seat === i) cur = hs.suggestion.value;
    else if (d > 0) cur = 0;
    else return;
  }
  var b = boundsFor(i), next = Math.max(0, cur + d);
  if (next > b.max) { buzz(4); sfx("error"); flashCard(i); return; }
  setPts(i, next);
}
function undoPts(i) {
  var st = entryUndo[i] || [];
  if (!st.length) return false;
  var prev = st.pop();
  entryUndo[i] = st;
  entry.pts[i] = prev;
  persist(); paintAll(); popVal(i);
  sfx("undo");
  toast(state.players[i] + (prev === null ? " back to not set" : " back to " + prev));
  return true;
}
function askClear(i, after) {
  var v = entry.pts[i];
  if (v === null) return;
  openModal("Clear " + state.players[i] + "'s " + v + "?", "<p>" + esc(state.players[i]) + " goes back to “?” for this hand. You can undo it.</p>", [
    { label: "Keep " + v, className: "ghost", onClick: closeModal },
    { label: "Clear", className: "danger", id: "clear-confirm", onClick: function () {
      closeModal();
      setPts(i, null, true);
      sfx("clear");
      toast("Cleared " + state.players[i] + "'s " + v, { label: "Undo", run: function () { undoPts(i); } });
      if (after) after();
    } }
  ]);
  faceModal(seatRot(i));
}
function faceModal(rot) {
  var m = $("modal").querySelector(".modal");
  m.style.setProperty("--face", (rot || 0) + "deg");
  m.classList.toggle("sideways", rot === 90 || rot === 270);
}
function popVal(i) {
  var el = $("cval-" + i);
  if (!el || calm()) return;
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}
function flashCard(i) {
  var el = $("card-" + i);
  if (!el) return;
  el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope");
}

/* ---------- painting ---------- */
var lastTotals = null;
function paintAll() {
  if (!state || $("game").hidden) return;
  buildGame();
  var c = ctx(), hs = R.handStatus(entry, c.st), total = hs.total, n = state.players.length;
  var run = R.runningTotals(state.rounds, n);
  var base = c.editing ? (c.index > 0 ? run[c.index - 1] : state.players.map(function () { return 0; })) : R.totals(state.rounds, n);
  var shown = c.editing ? run[c.index] : base;
  var act = R.activeSeats(state);
  var rk = R.ranks(shown, act), lead = state.rounds.length ? R.leaders(shown, act) : [], last = R.losers(shown, act);
  var lk = locked();
  var mode = built.mode;
  var eff = entry.pts.slice();
  if (hs.suggestion) eff[hs.suggestion.seat] = hs.suggestion.value;

  c.active.forEach(function (i) {
    var card = $("card-" + i);
    if (!card) return;
    var v = entry.pts[i], sug = hs.suggestion && hs.suggestion.seat === i;
    card.classList.toggle("lead", lead.indexOf(i) !== -1);
    card.classList.toggle("last", last.indexOf(i) !== -1);
    card.classList.toggle("locked", lk);
    card.classList.toggle("suggested", !!sug);
    $("ctot-" + i).textContent = String(shown[i]);
    $("crank-" + i).textContent = state.rounds.length ? ordinal(rk[i]) : "";
    $("cdeal-" + i).hidden = c.dealer !== i;
    var after = $("cafter-" + i);
    var ev = isInt(eff[i]) ? eff[i] - (isInt(entry.jack) && entry.jack === i ? 10 : 0) : null;
    after.textContent = c.editing ? "after hand " + (c.index + 1) : (ev !== null && !lk ? "→ " + (base[i] + ev) : "");
    var tgt = R.passTarget(i, c.pass, c.active);
    $("cpass-" + i).textContent = c.pass === "hold" ? "No pass this hand" : (tgt === null ? "" : "Pass 3 " + c.pass + " → " + state.players[tgt]);
    var b = R.entryBounds(entry.pts, i, c.active, total);
    var val = $("cval-" + i);
    if (!sliderDragFor(i)) {
      val.classList.toggle("unknown", v === null && !sug);
      val.classList.toggle("sug", v === null && !!sug);
      val.textContent = v !== null ? String(v) : (sug ? String(hs.suggestion.value) : "?");
      paintSlider(i, isInt(v) ? v : 0, b.max);
    }
    val.setAttribute("aria-label", state.players[i] + ": " + (v !== null ? v + " points" : sug ? "suggested " + hs.suggestion.value + ", not confirmed" : "not set") + ". Tap to type.");
    $("cminus-" + i).disabled = lk || v === null && !sug || (v !== null && v <= 0);
    $("cplus-" + i).disabled = lk || (isInt(v) ? v >= b.max : b.max <= 0);
    var ok = $("cok-" + i);
    ok.hidden = !sug || lk;
    ok.textContent = sug ? "✓ " + hs.suggestion.value : "";
    ok.setAttribute("aria-label", sug ? "Confirm " + state.players[i] + " gets the last " + hs.suggestion.value : "");
    var q = $("cq-" + i), isQ = hs.queen === i, canQ = hs.queenCandidates.indexOf(i) !== -1;
    q.hidden = !(isQ || (canQ && hs.queenCandidates.length > 1));
    q.setAttribute("aria-pressed", isQ ? "true" : "false");
    q.textContent = isQ ? "♠Q" : "♠Q?";
    q.title = isQ ? state.players[i] + " took the Queen of Spades" : "Did " + state.players[i] + " take the Queen?";
    var j = $("cj-" + i);
    if (j) { j.setAttribute("aria-pressed", entry.jack === i ? "true" : "false"); j.disabled = lk; }
    $("cmoon-" + i).hidden = mode !== "table" || lk;
  });

  // headline
  var dealerName = state.players[c.dealer] || "";
  var passTxt = c.pass === "hold" ? "No pass (hold hand)" : "Pass 3 cards " + c.pass;
  $("g-title").innerHTML = "<b>Hand " + (c.index + 1) + "</b><span>" + esc(passTxt) + "</span><span>" + esc(dealerName) + " deals</span>";
  $("g-rules").textContent = "House rules: " + state.rules.name;
  $("g-rules").title = R.rulesSummary(state.rules);
  $("g-target").textContent = "Game to " + state.target;
  paintClock();
  $("edit-banner").hidden = !c.editing;
  if (c.editing) $("edit-text").textContent = "Editing hand " + (c.index + 1) + " · totals shown as of that hand";

  // meter + status
  var pct = Math.max(0, Math.min(100, hs.sum / total * 100));
  $("meter-bar").style.width = pct + "%";
  $("meter").className = "meter" + (hs.sum > total ? " bad" : hs.complete ? " ok" : "");
  $("entry-status").textContent = hs.known + " of " + hs.count + " set · " + hs.sum + " of " + total;
  var hint = $("entry-hint");
  if (hs.complete && hs.suggestion) hint.textContent = state.players[hs.suggestion.seat] + " gets the last " + hs.suggestion.value + " (tap ✓ or Save)";
  else if (hs.complete) hint.textContent = "Ready to save";
  else hint.textContent = hs.reason;
  hint.className = hs.complete ? "ok" : (hs.sum > total ? "bad" : "");
  var save = $("save-btn");
  save.disabled = !hs.complete || lk || moonBusy;
  $("save-main").textContent = c.editing ? "Save changes to hand " + (c.index + 1) : "Save hand " + (c.index + 1);
  $("save-why").textContent = hs.complete ? "" : hs.reason;
  save.setAttribute("aria-label", $("save-main").textContent + (hs.complete ? "" : ", disabled: " + hs.reason));
  $("moon-btn").hidden = lk;
  $("moon-btn").disabled = moonBusy;
  $("undo-btn").disabled = !hist.undo.length;
  $("redo-btn").disabled = !hist.redo.length;
  $("g-over").hidden = !lk;
  $("save-btn").hidden = lk;
  if (lk) {
    var w = R.winners(state), tots = R.totals(state.rounds, n);
    $("g-over-text").textContent = winnerLine(w, tots);
  }
  paintWake();
  paintTotalsBump(shown);
}
function winnerLine(w, tots) {
  if (!w.length) return "";
  var names = w.map(function (k) { return state.players[k]; });
  return names.length > 1 ? R.listNames(names) + " tie with " + tots[w[0]] + "!" : names[0] + " wins with " + tots[w[0]] + "!";
}
function paintTotalsBump(shown) {
  if (lastTotals && lastTotals.length === shown.length && !calm()) {
    shown.forEach(function (v, i) {
      if (v !== lastTotals[i] && $("ctot-" + i)) { var el = $("ctot-" + i); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    });
  }
  lastTotals = shown.slice();
}
function elapsed() {
  if (!state) return 0;
  var end = state.finishedAt || Date.now();
  return Math.max(0, end - state.startedAt);
}
function paintClock() {
  var el = $("g-clock");
  if (!el || !state) return;
  el.hidden = !settings.timer;
  el.textContent = "⏱ " + R.formatClock(elapsed()) + " · " + plural(state.rounds.length, "hand");
  if ($("sc-clock") && !$("scorecard").hidden) $("sc-clock").textContent = "⏱ " + R.formatClock(elapsed()) + " · " + plural(state.rounds.length, "hand");
}
setInterval(function () { if (state && !document.hidden) paintClock(); }, 1000);

/* ---------- keyboard on a card ---------- */
function onCardKey(e, i) {
  if (e.target.closest && e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;
  var k = e.key;
  if (k === "ArrowRight" || k === "ArrowUp" || k === "+") { e.preventDefault(); stepPts(i, 1); }
  else if (k === "ArrowLeft" || k === "ArrowDown" || k === "-") { e.preventDefault(); stepPts(i, -1); }
  else if (k === "Enter" || k === " ") { e.preventDefault(); openKeypad(i); }
  else if (k === "Delete" || k === "Backspace") { e.preventDefault(); askClear(i); }
  else if (/^[0-9]$/.test(k)) { e.preventDefault(); openKeypad(i, k); }
}

/* ---------- slide (no hold needed) ---------- */
var SLIDE_START = 10;
function onDown(e, i) {
  if (moonBusy || locked()) return;
  if (e.target.closest && (e.target.closest(".c-slider") || (e.target.closest("button") && !e.target.closest(".c-val")))) return;
  if (dragBySeat[i]) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  ac();
  var card = $("card-" + i);
  try { card.setPointerCapture(e.pointerId); } catch (err) {}
  var hs = status(), v = entry.pts[i];
  var startVal = isInt(v) ? v : (hs.suggestion && hs.suggestion.seat === i ? hs.suggestion.value : 0);
  var d = { pid: e.pointerId, seat: i, rot: seatRot(i), phase: "press", onVal: !!(e.target.closest && e.target.closest(".c-val")),
    sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: null, st: { value: startVal, accum: 0, over: 0 }, from: v };
  drags[e.pointerId] = d;
  dragBySeat[i] = d;
}
function onMove(e) {
  var d = drags[e.pointerId];
  if (!d) return;
  e.preventDefault();
  if (d.phase === "press") {
    var ddx = e.clientX - d.sx, ddy = e.clientY - d.sy;
    var along = L.localDx(ddx, ddy, d.rot), across = Math.sqrt(Math.max(0, ddx * ddx + ddy * ddy - along * along));
    if (Math.abs(along) >= SLIDE_START && Math.abs(along) > Math.abs(across) * 0.8) {
      d.phase = "drag"; d.lx = d.sx; d.ly = d.sy; d.lt = null;
      $("card-" + d.seat).classList.add("dragging");
      $("cdrag-" + d.seat).hidden = false;
      buzz(10);
    } else if (ddx * ddx + ddy * ddy > 40 * 40) { d.phase = "cancel"; }
    if (d.phase !== "drag") return;
  }
  if (d.phase !== "drag") return;
  var dxs = e.clientX - d.lx, dys = e.clientY - d.ly;
  var dt = d.lt == null ? 16 : (e.timeStamp - d.lt);
  d.lx = e.clientX; d.ly = e.clientY; d.lt = e.timeStamp;
  var dx = L.localDx(dxs, dys, d.rot);
  var prev = d.st.value, b = boundsFor(d.seat);
  var s = L.jogStep(d.st, b, dx, dt, built.mode === "table" ? TABLE_TUNE : PHONE_TUNE);
  d.st = { value: s.value, accum: s.accum, over: s.over };
  if (s.value !== prev) { buzz(5); sfx("tick"); }
  if (s.moon && b.max === handTotal()) { var seat = d.seat; endDrag(d); paintAll(); askMoon(seat, true); return; }
  paintDrag(d, b);
}
function paintDrag(d, b) {
  var i = d.seat, v = d.st.value, over = d.st.over || 0;
  var pct = b.max ? v / b.max * 100 : 0;
  $("cdnum-" + i).textContent = String(v);
  $("cdbar-" + i).style.width = pct + "%";
  $("cdthumb-" + i).style.left = pct + "%";
  paintSlider(i, v, b.max);
  $("cdmin-" + i).textContent = "0";
  $("cdmax-" + i).textContent = String(b.max);
  $("cdcap-" + i).textContent = v === b.max && b.max < handTotal() ? "the rest" : "";
  var mo = $("cdmoon-" + i);
  var moonable = b.max === handTotal();
  mo.classList.toggle("on", moonable && over > 0);
  mo.querySelector("i").style.width = Math.min(100, over / L.MOON_OVERSHOOT_PX * 100) + "%";
}
function onUp(e) {
  var d = drags[e.pointerId];
  if (!d) return;
  var i = d.seat;
  if (d.phase === "drag") {
    var v = d.st.value;
    endDrag(d);
    if (v === handTotal()) { paintAll(); askMoon(i, true); return; }
    if (v !== d.from) setPts(i, v, true); else paintAll();
  } else if (d.phase === "press") {
    endDrag(d);
    openKeypad(i); // a tap never changes or clears a value
  } else {
    endDrag(d);
  }
}
function onCancel(e) {
  var d = drags[e.pointerId];
  if (!d) return;
  endDrag(d);
  paintAll();
}
function endDrag(d) {
  delete drags[d.pid];
  if (dragBySeat[d.seat] === d) delete dragBySeat[d.seat];
  var card = $("card-" + d.seat);
  if (card) {
    card.classList.remove("dragging");
    try { card.releasePointerCapture(d.pid); } catch (e) {}
  }
  if ($("cdrag-" + d.seat)) $("cdrag-" + d.seat).hidden = true;
}
function endAllDrags() {
  Object.keys(drags).forEach(function (k) { endDrag(drags[k]); });
  Object.keys(sliderDrags).forEach(function (k) {
    var d = sliderDrags[k];
    delete sliderDrags[k];
    var sl = $("cslider-" + d.seat);
    if (sl) { try { sl.releasePointerCapture(Number(k)); } catch (e) {} }
  });
}

/* ---------- score slider (track + thumb) ---------- */
var sliderDrags = {};
function sliderDragFor(i) {
  var k;
  for (k in sliderDrags) if (sliderDrags[k].seat === i) return sliderDrags[k];
  return null;
}
function paintSlider(i, value, max) {
  var sl = $("cslider-" + i);
  if (!sl) return;
  var pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  var fill = $("csfill-" + i), thumb = $("csthumb-" + i);
  if (fill) fill.style.width = pct + "%";
  if (thumb) thumb.style.left = pct + "%";
  sl.classList.toggle("off", !(max > 0));
  sl.setAttribute("aria-valuemax", String(max));
  sl.setAttribute("aria-valuenow", String(Math.round(value) || 0));
  sl.setAttribute("aria-valuetext", max > 0 ? Math.round(value) + " of " + max : "no points left");
  sl.setAttribute("aria-disabled", max > 0 && !locked() ? "false" : "true");
}
// Finger position along the track, in the player's own left-to-right axis
// (shared-table seats are rotated). Returns 0..1.
function sliderRatio(track, clientX, clientY, rot) {
  var r = track.getBoundingClientRect();
  var along = L.localDx(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2), rot);
  var w = track.offsetWidth || 1;
  return Math.max(0, Math.min(1, (along + w / 2) / w));
}
function sliderValueAt(d, x, y) {
  var track = $("cstrack-" + d.seat);
  if (!track || !(d.max > 0)) return 0;
  return Math.max(0, Math.min(d.max, Math.round(sliderRatio(track, x, y, seatRot(d.seat)) * d.max)));
}
function previewSlider(d, x, y) {
  var v = sliderValueAt(d, x, y);
  paintSlider(d.seat, v, d.max);
  var val = $("cval-" + d.seat);
  if (val) {
    val.textContent = String(v);
    val.classList.remove("unknown", "sug");
  }
  if (v !== d.last) { d.last = v; buzz(5); sfx("tick"); }
  return v;
}
function onSliderDown(e) {
  if (moonBusy || locked()) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  var i = Number(e.currentTarget.getAttribute("data-seat"));
  var b = boundsFor(i);
  if (!(b.max > 0)) { toast("No points left for " + state.players[i] + "."); sfx("error"); return; }
  e.preventDefault();
  e.stopPropagation();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  var d = { pid: e.pointerId, seat: i, from: entry.pts[i], max: b.max, last: null };
  sliderDrags[e.pointerId] = d;
  previewSlider(d, e.clientX, e.clientY);
}
function onSliderMove(e) {
  var d = sliderDrags[e.pointerId];
  if (!d) return;
  e.preventDefault();
  previewSlider(d, e.clientX, e.clientY);
}
function finishSlider(d, x, y, commit) {
  if (!d || sliderDrags[d.pid] !== d) return;
  delete sliderDrags[d.pid];
  var sl = $("cslider-" + d.seat);
  if (sl) { try { sl.releasePointerCapture(d.pid); } catch (e) {} }
  if (!commit) { paintAll(); return; }
  var v = sliderValueAt(d, x, y);
  if (v === handTotal() && d.max === handTotal()) { paintAll(); askMoon(d.seat, true); return; }
  if (v !== d.from) setPts(d.seat, v, true); else paintAll();
}
function onSliderUp(e) {
  var d = sliderDrags[e.pointerId];
  if (!d) return;
  finishSlider(d, e.clientX, e.clientY, true);
}
function onSliderCancel(e) {
  var d = sliderDrags[e.pointerId];
  if (!d) return;
  finishSlider(d, e.clientX, e.clientY, false);
}

/* ---------- keypad ---------- */
function openKeypad(i, firstDigit) {
  if (locked() || moonBusy || !state) return;
  keypadSeat = i;
  keypadFresh = true;
  var v = entry.pts[i];
  keypadBuf = isInt(v) ? String(v) : "";
  if (firstDigit) { keypadBuf = firstDigit; keypadFresh = false; }
  var total = handTotal(), b = boundsFor(i), hs = status();
  $("kp-avatar").outerHTML = avatar(state, i, "kp-av").replace('class="avatar', 'id="kp-avatar" class="avatar');
  $("kp-title").textContent = state.players[i] + " · hand " + (ctx().index + 1);
  var chips = [0, 1, 2, 5, 13];
  if (state.rules.spot) chips = [0, 2, 5, 10, 13, 20];
  var html = chips.filter(function (c) { return c <= b.max && c < total; }).map(function (c) {
    return '<button type="button" class="kchip" data-v="' + c + '">' + c + "</button>";
  }).join("");
  if (b.max > 0 && b.max < total && chips.indexOf(b.max) === -1) html += '<button type="button" class="kchip rest" data-v="' + b.max + '">' + b.max + " left</button>";
  if (b.max === total) html += '<button type="button" class="kchip moon" data-v="' + total + '">🌙 ' + total + " Moon</button>";
  $("kp-chips").innerHTML = html;
  $("kp-chips").querySelectorAll(".kchip").forEach(function (btn) {
    btn.addEventListener("click", function () { var val = Number(btn.getAttribute("data-v")); closeKeypad(); setPts(i, val); });
  });
  var grid = "";
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"].forEach(function (k) {
    if (k === "back") grid += '<button type="button" class="kkey fn" data-k="back" aria-label="Delete digit">⌫</button>';
    else if (k === "ok") grid += '<button type="button" class="kkey fn ok" data-k="ok" aria-label="Done">✓</button>';
    else grid += '<button type="button" class="kkey" data-k="' + k + '">' + k + "</button>";
  });
  $("kp-grid").innerHTML = grid;
  $("kp-grid").querySelectorAll(".kkey").forEach(function (btn) {
    btn.addEventListener("click", function () { keypadPress(btn.getAttribute("data-k")); });
  });
  $("kp-undo").hidden = !(entryUndo[i] && entryUndo[i].length);
  $("kp-clear").hidden = !isInt(v);
  var box = $("keypad-box"), rot = seatRot(i);
  box.style.setProperty("--face", rot + "deg");
  box.classList.toggle("sideways", rot === 90 || rot === 270);
  $("keypad").hidden = false;
  paintKeypad();
  setTimeout(function () { try { $("kp-done").focus({ preventScroll: true }); } catch (e) {} }, 20);
}
function keypadValue() { return keypadBuf === "" ? null : parseInt(keypadBuf, 10); }
function keypadPress(k) {
  if (keypadSeat === null) return;
  if (k === "ok") { keypadDone(); return; }
  if (k === "back") { keypadBuf = keypadBuf.slice(0, -1); keypadFresh = false; }
  else {
    if (keypadFresh) { keypadBuf = ""; keypadFresh = false; }
    if (keypadBuf.length < 3) keypadBuf = (keypadBuf === "0" ? "" : keypadBuf) + k;
  }
  buzz(4);
  paintKeypad();
}
function paintKeypad() {
  var i = keypadSeat, b = boundsFor(i), v = keypadValue(), total = handTotal();
  $("kp-display").textContent = v === null ? "?" : String(v);
  var bad = v !== null && v > b.max, hint;
  if (bad) hint = "Too many: only " + b.max + " of " + total + " left for " + state.players[i];
  else if (v === total) hint = "All " + total + " is shooting the moon";
  else hint = "0 to " + b.max + (b.max < total ? " (" + (total - b.max) + " already given out)" : "");
  $("kp-hint").textContent = hint;
  $("kp-hint").className = "kp-hint" + (bad ? " bad" : "");
  $("kp-done").disabled = bad;
  $("kp-display").classList.toggle("bad", bad);
}
function keypadDone() {
  var i = keypadSeat, v = keypadValue();
  if (i === null) return;
  if (v !== null && v > boundsFor(i).max) { sfx("error"); return; }
  closeKeypad();
  if (v === null) { if (isInt(entry.pts[i])) askClear(i); return; }
  setPts(i, v);
}
function closeKeypad() {
  $("keypad").hidden = true;
  var i = keypadSeat;
  keypadSeat = null;
  if (i !== null && $("card-" + i)) { try { $("card-" + i).focus({ preventScroll: true }); } catch (e) {} }
}
$("kp-done").addEventListener("click", keypadDone);
$("kp-close").addEventListener("click", closeKeypad);
$("kp-clear").addEventListener("click", function () { var i = keypadSeat; closeKeypad(); askClear(i); });
$("kp-undo").addEventListener("click", function () { var i = keypadSeat; closeKeypad(); undoPts(i); });
$("keypad").addEventListener("click", function (e) { if (e.target === $("keypad")) closeKeypad(); });
document.addEventListener("keydown", function (e) {
  if (keypadSeat === null) return;
  if (/^[0-9]$/.test(e.key)) { e.preventDefault(); keypadPress(e.key); }
  else if (e.key === "Backspace") { e.preventDefault(); keypadPress("back"); }
  else if (e.key === "Enter") { e.preventDefault(); keypadDone(); }
  else if (e.key === "Escape") { e.preventDefault(); closeKeypad(); }
}, true);
