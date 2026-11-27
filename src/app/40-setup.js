/* Part 5: setup, menu, settings, players, help + first-run intro, wake lock, start-up. */
var BUILTIN_PRESETS = [
  { name: "Classic", moonMode: "add", spot: false, jack: false, passMode: "classic" },
  { name: "Moon −26", moonMode: "subtract", spot: false, jack: false, passMode: "classic" },
  { name: "Spot Hearts", moonMode: "add", spot: true, jack: false, passMode: "classic" },
  { name: "Omnibus (J♦ −10)", moonMode: "add", spot: false, jack: true, passMode: "classic" },
  { name: "No hold hands", moonMode: "add", spot: false, jack: false, passMode: "nohold" }
];
function allPresets() { return BUILTIN_PRESETS.concat(presets); }
function sameRules(a, b) { return a.moonMode === b.moonMode && a.spot === b.spot && a.jack === b.jack && a.passMode === b.passMode; }
function nameRules(r) {
  var hit = allPresets().filter(function (p) { return sameRules(p, r); })[0];
  r.name = hit ? hit.name : "Custom";
  return r;
}
function draft() {
  if (!setupDraft || !Array.isArray(setupDraft.players)) setupDraft = { players: ["", "", "", ""], target: 100, rules: R.defaultRules(), firstDealer: 0 };
  setupDraft.players = setupDraft.players.slice(0, 6).map(function (p) { return R.isPlaceholder(p) ? "" : String(p || ""); });
  while (setupDraft.players.length < 3) setupDraft.players.push("");
  setupDraft.rules = R.sanitizeRules(setupDraft.rules);
  if (!isInt(setupDraft.target) || setupDraft.target < 1) setupDraft.target = 100;
  if (!isInt(setupDraft.firstDealer) || setupDraft.firstDealer >= setupDraft.players.length) setupDraft.firstDealer = 0;
  return setupDraft;
}
function setupProblems(d) {
  var keys = d.players.map(R.nameKey), probs = [];
  d.players.forEach(function (p, i) { if (!p.trim()) probs.push("Player " + (i + 1) + " needs a name"); });
  keys.forEach(function (k, i) { if (k && keys.indexOf(k) !== i) probs.push("Two players are called " + d.players[i].trim()); });
  return probs;
}

function renderSetup() {
  var d = draft();
  var box = $("setup-players");
  var keys = d.players.map(R.nameKey);
  box.innerHTML = d.players.map(function (p, i) {
    var dup = keys[i] && keys.indexOf(keys[i]) !== i;
    return '<div class="sp-row' + (dup ? " bad" : "") + '"><span class="avatar" style="--pc:' + R.COLORS[i] + '" aria-hidden="true">' + esc(p.trim() ? initialOf(p) : String(i + 1)) + "</span>" +
      '<input type="text" id="setup-p' + i + '" maxlength="20" autocomplete="off" autocapitalize="words" enterkeyhint="next" list="roster-list" placeholder="Player ' + (i + 1) + ' name" aria-label="Player ' + (i + 1) + ' name" value="' + esc(p) + '">' +
      '<span class="sp-seat">' + esc(SEAT_WORD[i]) + (d.players.length === 4 && settings.layout === "table" ? " · " + TABLE_SEATS[i].label : "") + "</span>" +
      '<button type="button" class="ghost small sp-del" data-del="' + i + '" aria-label="Remove player ' + (i + 1) + '"' + (d.players.length <= 3 ? " disabled" : "") + ">×</button></div>";
  }).join("");
  $("player-count-note").textContent = d.players.length + " players · " + R.cardsInfo(d.players.length).each + " cards each" + (R.cardsInfo(d.players.length).removed ? ", remove " + R.cardsInfo(d.players.length).removed : "");
  $("add-player").disabled = d.players.length >= 6;
  $("add-player").textContent = d.players.length >= 6 ? "6 players is the most" : "+ Add player";
  box.querySelectorAll("input").forEach(function (inp, i) {
    inp.addEventListener("input", function () { d.players[i] = inp.value; paintSetupState(); });
    inp.addEventListener("change", function () { paintRoster(); });
    inp.addEventListener("focus", function () { lastFocusedSeat = i; });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var nx = $("setup-p" + (i + 1)); if (nx) nx.focus(); else inp.blur(); } });
  });
  box.querySelectorAll("[data-del]").forEach(function (b) {
    b.addEventListener("click", function () { var i = Number(b.getAttribute("data-del")); d.players.splice(i, 1); if (d.firstDealer >= d.players.length) d.firstDealer = 0; persist(); renderSetup(); });
  });
  paintRoster();
  // target
  $("target-chips").querySelectorAll("[data-target]").forEach(function (b) { b.setAttribute("aria-pressed", Number(b.getAttribute("data-target")) === d.target ? "true" : "false"); });
  $("setup-target").value = d.target;
  // dealer
  $("setup-dealer").innerHTML = d.players.map(function (p, i) { return '<option value="' + i + '">' + esc(p.trim() || "Player " + (i + 1)) + "</option>"; }).join("");
  $("setup-dealer").value = String(d.firstDealer);
  // layout
  var canTable = d.players.length === 4;
  $("layout-phone").setAttribute("aria-pressed", settings.layout !== "table" || !canTable ? "true" : "false");
  $("layout-table").setAttribute("aria-pressed", settings.layout === "table" && canTable ? "true" : "false");
  $("layout-table").disabled = !canTable;
  // rules
  var r = d.rules;
  $("preset-select").innerHTML = allPresets().map(function (p) { return '<option value="' + esc(p.name) + '">' + esc(p.name) + "</option>"; }).join("") +
    (r.name === "Custom" ? '<option value="Custom">Custom</option>' : "");
  $("preset-select").value = r.name;
  $("mode-add").setAttribute("aria-pressed", r.moonMode === "add" ? "true" : "false");
  $("mode-sub").setAttribute("aria-pressed", r.moonMode === "subtract" ? "true" : "false");
  var tot = R.pointsTotal(r);
  $("mode-add").firstChild.textContent = "+" + tot + " to everyone else";
  $("mode-sub").firstChild.textContent = "−" + tot + " to the shooter";
  $("rule-spot").setAttribute("aria-pressed", r.spot ? "true" : "false");
  $("rule-jack").setAttribute("aria-pressed", r.jack ? "true" : "false");
  $("rule-pass").value = r.passMode;
  $("setup-history-count").textContent = gamesCount ? String(gamesCount) : "";
  paintSetupState();
  paintWake();
}
var lastFocusedSeat = null;
function paintRoster() {
  var d = draft();
  var used = d.players.map(R.nameKey);
  $("roster-wrap").hidden = roster.length === 0;
  $("roster").innerHTML = roster.slice(0, 16).map(function (n) {
    return '<button type="button" class="chip-btn' + (used.indexOf(R.nameKey(n)) !== -1 ? " used" : "") + '" data-name="' + esc(n) + '">' + esc(n) + "</button>";
  }).join("");
  $("roster-list").innerHTML = roster.map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
  $("roster").querySelectorAll("[data-name]").forEach(function (b) { b.addEventListener("click", function () { fillSeat(b.getAttribute("data-name")); }); });
}
function paintSetupState() {
  var d = draft(), probs = setupProblems(d);
  var keys = d.players.map(R.nameKey);
  $("setup-players").querySelectorAll(".sp-row").forEach(function (row, i) {
    row.classList.toggle("bad", !!keys[i] && keys.indexOf(keys[i]) !== i);
    var av = row.querySelector(".avatar"); av.textContent = d.players[i].trim() ? initialOf(d.players[i]) : String(i + 1);
  });
  $("setup-error").textContent = probs[0] || "";
  $("start-btn").disabled = probs.length > 0;
  $("start-btn").textContent = probs.length ? "Start game · " + probs[0] : "Start game";
  var opts = $("setup-dealer").options;
  d.players.forEach(function (p, i) { if (opts[i]) opts[i].textContent = p.trim() || "Player " + (i + 1); });
}
function fillSeat(name) {
  var d = draft(), keys = d.players.map(R.nameKey), at = keys.indexOf(R.nameKey(name));
  if (at !== -1) { d.players[at] = ""; renderSetup(); return; }
  var seat = d.players.map(function (p) { return p.trim(); }).indexOf("");
  if (seat === -1) {
    if (d.players.length < 6) { d.players.push(name); renderSetup(); buzz(8); return; }
    seat = lastFocusedSeat != null ? lastFocusedSeat : d.players.length - 1;
  }
  d.players[seat] = name;
  buzz(8);
  renderSetup();
}
$("add-player").addEventListener("click", function () {
  var d = draft();
  if (d.players.length >= 6) return;
  d.players.push("");
  renderSetup();
  var inp = $("setup-p" + (d.players.length - 1)); if (inp) inp.focus();
});
$("target-chips").querySelectorAll("[data-target]").forEach(function (b) {
  b.addEventListener("click", function () { draft().target = Number(b.getAttribute("data-target")); renderSetup(); });
});
$("setup-target").addEventListener("input", function () {
  var v = parseInt(this.value, 10);
  if (v >= 10 && v <= 1000) { draft().target = v; $("target-chips").querySelectorAll("[data-target]").forEach(function (b) { b.setAttribute("aria-pressed", Number(b.getAttribute("data-target")) === v ? "true" : "false"); }); }
});
$("setup-dealer").addEventListener("change", function () { draft().firstDealer = parseInt(this.value, 10) || 0; });
$("layout-phone").addEventListener("click", function () { settings.layout = "phone"; saveSettings(); renderSetup(); });
$("layout-table").addEventListener("click", function () { settings.layout = "table"; saveSettings(); renderSetup(); });
function setRule(k, v) { var r = draft().rules; r[k] = v; nameRules(r); renderSetup(); }
$("mode-add").addEventListener("click", function () { setRule("moonMode", "add"); });
$("mode-sub").addEventListener("click", function () { setRule("moonMode", "subtract"); });
$("rule-spot").addEventListener("click", function () { setRule("spot", !draft().rules.spot); });
$("rule-jack").addEventListener("click", function () { setRule("jack", !draft().rules.jack); });
$("rule-pass").addEventListener("change", function () { setRule("passMode", this.value); });
$("preset-select").addEventListener("change", function () {
  var p = allPresets().filter(function (x) { return x.name === $("preset-select").value; })[0];
  if (p) { draft().rules = R.sanitizeRules(p); renderSetup(); }
});
$("save-preset").addEventListener("click", function () {
  openModal("Save house rules", '<label class="field"><span>Name</span><input type="text" id="preset-name" maxlength="30" value="' + esc(draft().rules.name === "Custom" ? "Our rules" : draft().rules.name) + '"></label><p class="muted small">' +
    esc(R.rulesSummary(draft().rules)) + "</p>", [
    { label: "Cancel", className: "ghost", onClick: closeModal },
    { label: "Save preset", className: "primary", id: "preset-save", onClick: function () {
      var nm = ($("preset-name").value || "").trim().slice(0, 30);
      if (!nm || BUILTIN_PRESETS.some(function (p) { return p.name.toLowerCase() === nm.toLowerCase(); })) { toast("Pick a new name for these rules."); return; }
      var r = R.sanitizeRules(draft().rules); r.name = nm;
      presets = presets.filter(function (p) { return p.name !== nm; }).concat([r]).slice(-12);
      savePresets();
      draft().rules = clone(r);
      closeModal(); renderSetup(); toast("Saved “" + nm + "”");
    } }
  ]);
  faceModal(0);
});
$("start-btn").addEventListener("click", function () {
  var d = draft(), probs = setupProblems(d);
  if (probs.length) { toast(probs[0]); sfx("error"); return; }
  var t = parseInt($("setup-target").value, 10);
  if (t >= 10 && t <= 1000) d.target = t;
  startGame(d.players.map(function (p) { return p.trim(); }), d.target, d.rules, d.firstDealer);
});
$("setup-history").addEventListener("click", function () { openHistory("games"); });
$("setup-help").addEventListener("click", function () { showHelp(); });

function startGame(players, target, rules, firstDealer) {
  endAllDrags();
  state = R.newGame({ players: players, target: target, rules: R.sanitizeRules(rules), firstDealer: firstDealer });
  hist = { undo: [], redo: [] };
  entry = R.blankEntry(players.length); entryUndo = emptyUndo(players.length);
  editing = null; editStash = null; celebrated = false; lastTotals = null;
  setupDraft = { players: players.slice(), target: target, rules: clone(state.rules), firstDealer: firstDealer };
  roster = R.updateRoster(roster, players); saveRoster();
  persist();
  render();
  acquireWake();
}
function rematch() {
  if (!state) return;
  var act = R.activeSeats(state);
  var names = act.map(function (i) { return state.players[i]; });
  var k = act.indexOf(state.firstDealer);
  startGame(names, state.target, state.rules, ((k === -1 ? 0 : k) + 1) % names.length);
}
function confirmLeave(go) {
  openModal("Start a new game?", "<p>This game isn't finished, so it won't be saved to history. You can't undo this.</p>", [
    { label: "Keep playing", className: "ghost", onClick: closeModal },
    { label: "New game", className: "danger", id: "newgame-confirm", onClick: function () { closeModal(); go(); } }
  ]);
  faceModal(0);
}
function askNewGame() {
  closeSheet();
  if (state && state.rounds.length && !isOver()) confirmLeave(goToSetup); else goToSetup();
}
function goToSetup() {
  endAllDrags(); hideWinnerScreen(); closeScorecard(); closeSheet(); closeKeypad();
  if (state) {
    var act = R.activeSeats(state);
    setupDraft = { players: act.map(function (i) { return state.players[i]; }), target: state.target, rules: clone(state.rules), firstDealer: 0 };
  }
  state = null;
  hist = { undo: [], redo: [] };
  editing = null; editStash = null; celebrated = false;
  persist();
  render();
}

/* ---------- menu ---------- */
function menuItem(id, title, desc, cls) {
  return '<button type="button" class="menu-item ' + (cls || "") + '" id="' + id + '"><b>' + title + "</b><span>" + desc + "</span></button>";
}
function toggleRow(id, title, desc, on) {
  return '<button type="button" class="toggle wide" id="' + id + '" aria-pressed="' + (on ? "true" : "false") + '"><span><b>' + title + "</b><small>" + desc + "</small></span><i></i></button>";
}
function showMenu() {
  openSheet("Menu", function (body) {
    var canTable = state && state.players.length === 4 && R.activeSeats(state).length === 4;
    body.innerHTML =
      '<div class="menu-group"><h3>Game</h3>' +
        menuItem("m-new", "New game", "Back to setup. Asks first if this game isn't finished.") +
        menuItem("m-players", "Players and seats", "Rename, remove a player who leaves, change the end score.") +
        menuItem("m-hands", "Hands", "Every hand so far. Edit or delete any of them.") +
        menuItem("m-sheet", "Scorecard", "Table of every hand with running totals and a chart.") + "</div>" +
      '<div class="menu-group"><h3>Settings</h3><div class="toggles">' +
        toggleRow("m-sound", "Sound", "Clicks, save chime, moon fanfare", settings.sound) +
        toggleRow("m-haptics", "Vibration", "Buzz on taps (phones that support it)", settings.haptics) +
        toggleRow("m-calm", "Less motion", "Small upright badge instead of the full-screen moon show; no confetti", settings.calm) +
        toggleRow("m-auto", "Show scorecard after each hand", "For 3 seconds, then back to the table", settings.autoSheet) +
        toggleRow("m-timer", "Game timer", "Clock and hands counter in the header", settings.timer) +
        toggleRow("m-layout", "Shared table layout", canTable ? "Lay the device flat; each side faces its player (4 players)" : "Needs exactly 4 players in the game", settings.layout === "table" && canTable) +
      "</div>" + menuItem("m-wake", "Keep the screen on", wakeSupported() ? "Status: " + (wake.status === "on" ? "on while this page is open" : "tap to turn on") : "Not supported here; see how to set Auto-Lock") + "</div>" +
      '<div class="menu-group"><h3>Data</h3>' +
        menuItem("m-history", "History and player stats", plural(gamesCount, "finished game") + " on this device. Profiles, head to head, CSV and JSON export.") +
        menuItem("m-help", "Help and rules", "How scoring works here, and replay the intro.") + "</div>";
    $("m-new").addEventListener("click", askNewGame);
    $("m-players").addEventListener("click", showPlayers);
    $("m-hands").addEventListener("click", showHands);
    $("m-sheet").addEventListener("click", function () { openScorecard(); });
    var tog = function (id, key, after) {
      $(id).addEventListener("click", function () {
        settings[key] = !settings[key];
        $(id).setAttribute("aria-pressed", settings[key] ? "true" : "false");
        saveSettings(); if (after) after(); buzz(8);
      });
    };
    tog("m-sound", "sound", function () { if (settings.sound) sfx("save"); });
    tog("m-haptics", "haptics");
    tog("m-calm", "calm");
    tog("m-auto", "autoSheet");
    tog("m-timer", "timer", paintClock);
    $("m-layout").disabled = !canTable;
    $("m-layout").addEventListener("click", function () {
      settings.layout = settings.layout === "table" ? "phone" : "table";
      $("m-layout").setAttribute("aria-pressed", settings.layout === "table" ? "true" : "false");
      saveSettings(); built.key = ""; paintAll();
    });
    $("m-wake").addEventListener("click", function () { closeSheet(); showWakeInfo(); });
    $("m-history").addEventListener("click", function () { openHistory("games"); });
    $("m-help").addEventListener("click", function () { showHelp(); });
  });
}
function showHelpMenu() { showHelp(); }

/* ---------- players (rename / remove / target) ---------- */
function showPlayers() {
  if (!state) return;
  openSheet("Players and seats", function (body) {
    var act = R.activeSeats(state), tots = R.totals(state.rounds, state.players.length), mode = layoutMode();
    body.innerHTML = '<p class="muted small">Seats go clockwise in play order. ' + (mode === "table" ? "Shared table: seat 1 is the bottom edge." : "") + "</p>" +
      state.players.map(function (p, i) {
        var out = state.out[i];
        return '<div class="pl-row' + (out ? " out" : "") + '">' + avatar(state, i) +
          '<div class="pl-main"><b>' + esc(p) + "</b><span>" + esc(SEAT_WORD[i] + (mode === "table" ? " — " + TABLE_SEATS[i].label + " edge" : "")) + " · " + tots[i] + " points" + (out ? " · left the game" : "") + "</span>" +
          '<input type="text" maxlength="20" id="pl-name-' + i + '" aria-label="Rename ' + esc(p) + '" value="' + esc(p) + '"></div>' +
          (out ? '<button type="button" class="ghost small" data-back="' + i + '">Bring back</button>'
               : '<button type="button" class="danger small" data-remove="' + i + '"' + (act.length <= 3 ? " disabled title=\"Hearts needs at least 3 players\"" : "") + ">Remove</button>") + "</div>";
      }).join("") +
      '<label class="field"><span>Game ends when someone reaches</span><input type="number" id="pl-target" min="10" max="1000" inputmode="numeric" value="' + state.target + '"></label>' +
      '<div class="row-actions"><button type="button" class="primary" id="pl-save">Save changes</button></div>' +
      '<p class="muted small">Removing a player keeps their past hands on the scorecard; from the next hand they score 0, are skipped for dealing and passing, and can\'t win. Hearts needs at least 3 players.</p>';
    body.querySelectorAll("[data-remove]").forEach(function (b) { b.addEventListener("click", function () { askRemove(Number(b.getAttribute("data-remove"))); }); });
    body.querySelectorAll("[data-back]").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = Number(b.getAttribute("data-back"));
        change(function () { state.out[i] = false; });
        toast(state.players[i] + " is back in", { label: "Undo", run: undo }); showPlayers();
      });
    });
    $("pl-save").addEventListener("click", function () {
      var names = state.players.map(function (p, i) { return R.normName($("pl-name-" + i).value, p); });
      var keys = names.map(R.nameKey);
      if (keys.some(function (k, i) { return keys.indexOf(k) !== i; })) { toast("Each player needs a different name."); sfx("error"); return; }
      var t = parseInt($("pl-target").value, 10);
      if (!(t >= 10 && t <= 1000)) { toast("End score must be 10 to 1000."); return; }
      var same = names.join("\n") === state.players.join("\n") && t === state.target;
      if (same) { closeSheet(); return; }
      change(function () { state.players = names; state.target = t; });
      roster = R.updateRoster(roster, names); saveRoster();
      closeSheet(); toast("Players updated");
    });
  });
}
function askRemove(i) {
  var act = R.activeSeats(state);
  if (act.length <= 3) { toast("Hearts needs at least 3 players."); return; }
  var tots = R.totals(state.rounds, state.players.length);
  openModal("Remove " + state.players[i] + "?", "<p>" + esc(state.players[i]) + " keeps " + tots[i] + " points from past hands on the scorecard but stops playing: no more scores, skipped for dealing and passing, and can't win.</p><p>" +
    (act.length - 1) + " players continue (" + R.cardsInfo(act.length - 1).each + " cards each" + (R.cardsInfo(act.length - 1).removed ? ", remove " + R.cardsInfo(act.length - 1).removed : "") + "). You can undo this.</p>", [
    { label: "Cancel", className: "ghost", onClick: closeModal },
    { label: "Remove " + state.players[i], className: "danger", id: "remove-confirm", onClick: function () {
      closeModal(); closeSheet();
      change(function () { state.out[i] = true; });
      entry.pts[i] = null; if (entry.queen === i) entry.queen = null; if (entry.jack === i) entry.jack = null;
      persist(); paintAll();
      toast(state.players[i] + " removed — past scores kept", { label: "Undo", run: undo });
    } }
  ]);
  faceModal(0);
}
// Whole-state change with undo (players, target).
function change(mutate) {
  var wasOver = isOver();
  hist = R.historyRecord(hist, clone(state));
  mutate();
  syncFinished();
  if (!wasOver && isOver() && !celebrated) { celebrated = true; persist(); paintAll(); showWinnerScreen(); return; }
  persist(); paintAll();
}

/* ---------- help + first-run intro ---------- */
var INTRO = [
  { t: "Tap a number to type it", b: "Each player has a card. Tap the “?” for a keypad with quick chips (0, 1, 2, 5, 13). Drag the score slider, use − and +, or slide sideways across the card. A tap never clears anything." },
  { t: "The last player fills itself", b: "When everyone but one is set, the rest of the points go to the last player as a highlighted suggestion. Tap ✓ (or just Save). Save tells you exactly what's missing." },
  { t: "Moon, undo, scorecard", b: "Shot the moon? Tap “🌙 Shoot the moon” and choose, for that hand only, whether everyone else takes the points or the shooter loses them. Undo, Redo, Scorecard, Hands, Help and Menu sit in the bar at the bottom. Everything saves on every tap." }
];
var introStep = 0, introDone = null;
function showOnboarding(then) {
  introStep = 0; introDone = then || null;
  $("help").hidden = false;
  paintIntro();
}
function paintIntro() {
  var s = INTRO[introStep];
  $("help-steps").innerHTML = '<div class="intro-art a' + introStep + '" aria-hidden="true">' + ["⌨️", "✓", "🌙"][introStep] + "</div><h2 id=\"help-title\">" + esc(s.t) + "</h2><p>" + esc(s.b) + "</p>";
  $("help-dots").innerHTML = INTRO.map(function (x, k) { return '<i class="' + (k === introStep ? "on" : "") + '"></i>'; }).join("");
  $("help-prev").disabled = introStep === 0;
  $("help-next").textContent = introStep === INTRO.length - 1 ? "Let's play" : "Next";
}
function finishIntro() {
  $("help").hidden = true;
  settings.onboarded = true; saveSettings();
  var f = introDone; introDone = null;
  if (f) f();
}
$("help-next").addEventListener("click", function () { if (introStep < INTRO.length - 1) { introStep++; paintIntro(); } else finishIntro(); });
$("help-prev").addEventListener("click", function () { if (introStep > 0) { introStep--; paintIntro(); } });
$("help-skip").addEventListener("click", finishIntro);

function showHelp() {
  var r = state ? state.rules : draft().rules, n = state ? R.activeSeats(state).length : draft().players.length, tot = R.pointsTotal(r);
  openSheet("Help and rules", function (body) {
    body.innerHTML =
      '<div class="help-sec"><h3>Entering a hand</h3><ul>' +
        "<li><b>Tap</b> a player's number to type it on the keypad, or use a quick chip. Arrow keys and digits work on a keyboard.</li>" +
        "<li><b>− / +</b> nudge by one. <b>Drag the score slider</b> (the track and thumb under the number), or slide sideways across the card. It snaps to whole points.</li>" +
        "<li><b>The rest:</b> when only one player is left, they get the remaining points automatically (shown highlighted). Tap ✓ to confirm, or just Save. The keypad also has an “N left” chip.</li>" +
        "<li><b>Save</b> needs exactly " + tot + " points. If it's greyed out it says why, e.g. “Dave still to set” or “3 points left to give out”.</li>" +
        "<li><b>Clear</b> lives in the keypad and always asks first; the toast offers Undo. The keypad's Undo steps back that player's last value.</li></ul></div>" +
      '<div class="help-sec"><h3>Scoring</h3><ul>' +
        "<li>Each heart is 1 point" + (r.spot ? " (Spot Hearts: ♥2–♥10 face value, J 11, Q 12, K 13, A 14)" : "") + ", the Queen of Spades (♠Q) is 13: " + tot + " points a hand. Lowest total wins when anyone reaches the end score.</li>" +
        "<li>The ♠Q holder is spotted automatically when only one player has 13+; otherwise tap ♠Q? on the right card. It shows on the scorecard and in each hand's recap.</li>" +
        (r.jack ? "<li>J♦ (Omnibus): tap J♦ on whoever took it; they get −10.</li>" : "") +
        "<li><b>Shooting the moon</b> (all " + tot + "): tap 🌙 Shoot the moon, or type " + tot + ", or slide past the end and keep pushing. Each hand asks: everyone else +" + tot + ", or −" + tot + " for the shooter" +
          (r.moonMode === "subtract" ? " (this game starts on −" + tot + ")" : " (this game starts on +" + tot + ")") + ". The confirm shows the new totals first. Editing that hand lets you change the choice.</li></ul></div>" +
      '<div class="help-sec"><h3>Passing and dealing</h3><ul><li>' + n + " players: " + R.passCycle(n, r.passMode).map(function (p) { return R.PASS_LABEL[p]; }).join(", ") + ", then repeat. Pass 3 cards. " +
        R.cardsInfo(n).each + " cards each" + (R.cardsInfo(n).removed ? " (remove " + R.cardsInfo(n).removed + ")" : "") + ".</li><li>The deal moves one seat clockwise each hand; the card shows who deals and whom you pass to.</li></ul></div>" +
      '<div class="help-sec"><h3>Fixing mistakes</h3><ul><li>Undo / Redo in the bottom bar step through whole hands and player changes.</li><li>Hands → Edit reopens any hand with the same controls and shows that hand\'s totals; later totals are recalculated.</li></ul></div>' +
      '<div class="help-sec"><h3>Your data</h3><ul><li>Games are saved on this device after every tap (IndexedDB); nothing is sent anywhere. Close the tab and you\'ll get “Welcome back”.</li><li>History → Export backup (JSON) or CSV. Add to Home Screen to use it offline like an app.</li></ul></div>' +
      '<div class="row-actions"><button type="button" class="primary" id="help-replay">Replay the intro</button></div>';
    $("help-replay").addEventListener("click", function () { closeSheet(); showOnboarding(); });
  });
}

/* ---------- resume ---------- */
function showResume() {
  var n = state.players.length, tots = R.totals(state.rounds, n), act = R.activeSeats(state), lead = R.leaders(tots, act);
  var who = state.rounds.length ? R.listNames(lead.map(function (k) { return esc(state.players[k]); })) + (lead.length > 1 ? " are tied at " : " leads with ") + tots[lead[0]] : "No hands saved yet";
  openModal("Welcome back", "<p>Game in progress: hand " + (ctx().index + 1) + ". " + who + ".</p>" +
    '<ul class="resume-list">' + act.map(function (i) { return "<li>" + avatar(state, i) + "<span>" + esc(state.players[i]) + "</span><b>" + tots[i] + "</b></li>"; }).join("") + "</ul>", [
    { label: "New game", className: "ghost", id: "resume-new", onClick: function () { closeModal(); confirmLeave(goToSetup); } },
    { label: "Resume game", className: "primary", id: "resume-yes", onClick: function () { closeModal(); acquireWake(); } }
  ]);
  faceModal(0);
}

/* ---------- screen wake lock ---------- */
var WAKE_HELP =
  "<p>Keep the screen on so the scores never go dark.</p>" +
  "<p><b>On iPhone and iPad:</b> Settings, Display &amp; Brightness, Auto-Lock, Never. For a full-screen app, tap Share, then Add to Home Screen, and open it from the icon. It works offline after the first visit.</p>" +
  "<p>Safari 16.4 and newer can also keep the screen awake by itself while this page stays open.</p>";
function wakeSupported() { return !!(navigator.wakeLock && typeof navigator.wakeLock.request === "function"); }
function paintWake() {
  var pill = $("wake-pill");
  if (pill) {
    var cls = "wake", text;
    if (!wakeSupported()) { cls += " warn"; text = "Set Auto-Lock"; }
    else if (wake.status === "on") { cls += " on"; text = "Screen on"; }
    else if (wake.status === "blocked") { cls += " warn"; text = "Tap: keep on"; }
    else text = "Screen…";
    pill.className = cls;
    pill.querySelector("span").textContent = text;
    pill.setAttribute("aria-label", wake.status === "on" ? "Screen stays on" : "Keep the screen on");
  }
  $("setup-wake").textContent = wakeSupported()
    ? "The screen stays awake while this page is open. Works offline once loaded."
    : "This browser can't keep the screen awake. On iPhone or iPad: Settings, Display & Brightness, Auto-Lock, Never.";
}
function acquireWake() {
  if (!wakeSupported()) { wake.status = "unsupported"; paintWake(); return Promise.resolve(); }
  if (document.visibilityState !== "visible") return Promise.resolve();
  if (wake.lock && wake.lock.released === false) return Promise.resolve();
  return navigator.wakeLock.request("screen").then(function (lock) {
    wake.lock = lock; wake.status = "on";
    lock.addEventListener("release", function () { wake.status = "released"; paintWake(); });
    paintWake();
  }).catch(function () { wake.status = "blocked"; paintWake(); });
}
function showWakeInfo() {
  openModal("Keep the screen on", WAKE_HELP, [
    { label: "Try again", className: "ghost", onClick: function () { acquireWake(); closeModal(); } },
    { label: "Done", className: "primary", onClick: closeModal }
  ]);
  faceModal(0);
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible") acquireWake(); else DB.flush();
});
window.addEventListener("pagehide", function () { DB.flush(); });
document.addEventListener("pointerdown", function () { if (wake.status !== "on") acquireWake(); }, true);

/* ---------- keys, render, start-up ---------- */
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    if (moonCtl) moonCtl.skip();
    else if ($("modal").classList.contains("show")) closeModal();
    else if (!$("help").hidden) finishIntro();
    else if ($("sheet").classList.contains("show")) closeSheet();
    else if (!$("scorecard").hidden) closeScorecard();
    else if (!$("winner-screen").hidden) hideWinnerScreen();
    else if (!$("history").hidden) closeHistory();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && state && !(e.target.closest && e.target.closest("input"))) {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  }
});
function render() {
  $("setup").hidden = !!state;
  $("game").hidden = !state;
  if (!state) { closeScorecard(); renderSetup(); return; }
  built.key = "";
  paintAll();
}
window.addEventListener("resize", function () { if (state) sizeSeats(); });
window.addEventListener("orientationchange", function () { setTimeout(function () { if (state) sizeSeats(); }, 250); });
if (window.ResizeObserver) new ResizeObserver(function () { if (state) sizeSeats(); }).observe(document.body);
document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
document.addEventListener("selectstart", function (e) { if (!(e.target && e.target.closest && e.target.closest("input"))) e.preventDefault(); });
document.addEventListener("pointerdown", function () { if (settings.sound) ac(); }, { once: true, capture: true });

window.__heartsTest = {
  state: function () { return state ? clone(state) : null; },
  entry: function () { return clone(entry); },
  getEntry: function () { return entry.pts.slice(); },
  setEntry: function (pts, queen, jack) { entry = { pts: pts.slice(), queen: queen == null ? null : queen, jack: jack == null ? null : jack }; persist(); paintAll(); },
  status: function () { return state ? status() : null; },
  hist: function () { return { undo: hist.undo.length, redo: hist.redo.length }; },
  moonIds: function () { return M.VARIANTS.map(function (v) { return v.id; }); },
  playMoon: function (id, i) { return startMoonAnimation(i || 0, id); },
  bag: function () { return clone(moonBag); },
  wake: function () { return wake.status; },
  flush: function () { return DB.flush().then(function () { return true; }); },
  games: function () { return DB.gamesAll(); },
  current: function () { return DB.kvGet("current"); },
  dbMode: function () { return DB.mode(); },
  roster: function () { return roster.slice(); },
  presets: function () { return clone(presets); },
  settings: function () { return clone(settings); },
  layout: function () { return built.mode; },
  importText: importText,
  sfx: function () { return sfxLog.slice(); },
  winnerShows: function () { return winnerShows; },
  lastDownload: function () {
    var d = window.__heartsLastDownload;
    if (!d) return Promise.resolve(null);
    return (d.blob.text ? d.blob.text() : Promise.resolve("")).then(function (t) { return { name: d.name, size: d.size, type: d.type, text: d.type.indexOf("image") === 0 ? "" : t }; });
  },
  shareBlobSize: function () { return new Promise(function (res) { shareCanvas(state).toBlob(function (b) { res(b ? b.size : 0); }, "image/png"); }); },
  seedRounds: function (rounds, startedAgoMs) {
    change(function () {
      state.rounds = rounds.map(function (r, k) { return R.sanitizeState({ players: state.players, rounds: [r], started: true }).rounds[0] || r; });
      if (startedAgoMs) state.startedAt = Date.now() - startedAgoMs;
    });
    return DB.flush().then(function () { return true; });
  }
};

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
DB.open().then(loadAll).catch(function (e) { if (window.console) console.warn("hearts load", e); }).then(function () {
  render();
  acquireWake();
  var resume = function () { if (state && !isOver() && (state.rounds.length > 0 || entry.pts.some(isInt))) showResume(); };
  if (!settings.onboarded) showOnboarding(resume); else resume();
  readyResolve(true);
});
