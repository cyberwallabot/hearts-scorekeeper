/* Part 4: history, read-only scorecards, player profiles, export / import / print. */
var historyView = { tab: "games", detail: null, player: null };

function openHistory(tab, detailId) {
  historyView = { tab: tab || "games", detail: detailId || null, player: null };
  closeSheet(); closeScorecard();
  $("history").hidden = false;
  $("history").scrollTop = 0;
  return renderHistory();
}
function closeHistory() {
  $("history").hidden = true;
  if (!state) renderSetup();
}
$("history-back").addEventListener("click", function () {
  if (historyView.detail || historyView.player) { historyView.detail = null; historyView.player = null; renderHistory(); }
  else closeHistory();
});
$("tab-games").addEventListener("click", function () { historyView = { tab: "games", detail: null, player: null }; renderHistory(); });
$("tab-stats").addEventListener("click", function () { historyView = { tab: "stats", detail: null, player: null }; renderHistory(); });

function loadGames() {
  return DB.gamesAll().then(function (games) {
    return games.filter(R.validRecord).map(R.normalizeRecord).sort(function (a, b) { return b.finishedAt - a.finishedAt; });
  });
}
function recordState(g) {
  return R.sanitizeState({ id: g.id, started: true, startedAt: g.startedAt, finishedAt: g.finishedAt, players: g.players, colors: g.colors, out: g.out,
    target: g.target, rules: g.rules, moonMode: g.moonMode, firstDealer: g.firstDealer, rounds: g.rounds });
}
function renderHistory() {
  var body = $("history-body");
  $("tab-games").setAttribute("aria-selected", historyView.tab === "games" ? "true" : "false");
  $("tab-stats").setAttribute("aria-selected", historyView.tab === "stats" ? "true" : "false");
  $("history-mode").textContent = DB.mode() === "indexeddb" ? "Saved on this device" : "Saved locally";
  return loadGames().then(function (games) {
    gamesCount = games.length;
    if (historyView.detail) {
      var g = games.filter(function (x) { return x.id === historyView.detail; })[0];
      if (g) { $("history-title").textContent = "Game scorecard"; renderDetail(body, g); return; }
      historyView.detail = null;
    }
    if (historyView.player) {
      var s = R.computeStats(games).filter(function (x) { return x.key === historyView.player; })[0];
      if (s) { $("history-title").textContent = s.name; renderProfile(body, s, games); return; }
      historyView.player = null;
    }
    $("history-title").textContent = "History";
    if (historyView.tab === "stats") renderStats(body, games); else renderGames(body, games);
  });
}

function renderGames(body, games) {
  var html;
  if (!games.length) {
    html = '<div class="empty-card"><svg class="ic"><use href="#ic-trophy"/></svg><p>No finished games yet.</p><p class="muted">When someone reaches the end score, the game lands here with every hand.</p></div>';
  } else {
    html = '<div class="game-list">' + games.map(function (g) {
      var st = recordState(g), act = R.activeSeats(st);
      var order = act.slice().sort(function (a, b) { return g.totals[a] - g.totals[b] || a - b; });
      var who = g.winnerNames.length > 1 ? R.listNames(g.winnerNames) + " tied" : g.winnerNames[0] + " won";
      return '<button type="button" class="game-row" data-game-id="' + esc(g.id) + '">' +
        '<div class="gr-top"><span class="gr-date">' + esc(fmtDate(g.finishedAt)) + '</span><span class="gr-meta">' + plural(g.hands, "hand") + " · " + R.formatDuration(g.durationMs) +
        (g.moons.length ? " · ☾" + g.moons.length : "") + " · " + esc(st.rules.name) + "</span></div>" +
        '<div class="gr-win"><svg class="ic"><use href="#ic-trophy"/></svg>' + esc(who) + " with " + g.totals[g.winners[0]] + "</div>" +
        '<div class="gr-players">' + order.map(function (i) {
          return '<span class="' + (g.winners.indexOf(i) !== -1 ? "w" : "") + '">' + avatar(st, i) + esc(g.players[i]) + " <b>" + g.totals[i] + "</b></span>";
        }).join("") + "</div></button>";
    }).join("") + "</div>";
  }
  html += '<div class="backup"><div class="field-label">Backup and export</div><div class="row-actions wrap">' +
    '<button type="button" class="ghost" id="export-btn"' + (games.length ? "" : " disabled") + '>Export backup (JSON)</button>' +
    '<button type="button" class="ghost" id="csv-btn"' + (games.length ? "" : " disabled") + '>Export CSV (spreadsheet)</button>' +
    '<button type="button" class="ghost" id="import-btn">Import backup</button>' +
    '<button type="button" class="ghost" id="print-btn"' + (games.length ? "" : " disabled") + '>Print / PDF</button></div>' +
    '<p class="muted small">Everything is stored in this browser (IndexedDB) and never leaves the device. The JSON backup restores games, player names and house rules on any device; the CSV has one row per player per hand.</p></div>';
  body.innerHTML = html;
  body.querySelectorAll("[data-game-id]").forEach(function (b) {
    b.addEventListener("click", function () { historyView.detail = b.getAttribute("data-game-id"); $("history").scrollTop = 0; renderHistory(); });
  });
  $("export-btn").addEventListener("click", function () { exportBackup(games); });
  $("csv-btn").addEventListener("click", function () { exportCsv(games); });
  $("import-btn").addEventListener("click", function () { $("import-file").value = ""; $("import-file").click(); });
  $("print-btn").addEventListener("click", function () { window.print(); });
}

function renderDetail(body, g) {
  var st = recordState(g);
  var who = g.winnerNames.length > 1 ? R.listNames(g.winnerNames) + " tied with " + g.totals[g.winners[0]] : g.winnerNames[0] + " won with " + g.totals[g.winners[0]];
  body.innerHTML =
    '<div class="detail-head"><div class="dh-win"><svg class="ic"><use href="#ic-trophy"/></svg>' + esc(who) + "</div>" +
    '<div class="dh-meta">' + esc(fmtDate(g.finishedAt)) + " · " + plural(g.hands, "hand") + " · " + R.formatDuration(g.durationMs) + " · game to " + g.target + "</div>" +
    (g.moons.length ? '<div class="dh-moons">☾ ' + g.moons.map(function (m) {
      var how = m.moonMode === "subtract" ? "− to the shooter" : "+ to everyone else";
      return esc(m.name) + " (hand " + (m.round + 1) + ", " + how + ")";
    }).join(", ") + "</div>" : "") + "</div>" +
    scorecardHtml(st, { readOnly: true }) +
    '<div class="row-actions"><button type="button" class="primary" id="detail-rematch">Play again with these players</button><button type="button" class="ghost" id="detail-share">Share image</button></div>' +
    '<div class="row-actions"><button type="button" class="danger" id="detail-delete">Delete this game</button></div>';
  $("detail-share").addEventListener("click", function () { shareResults(st); });
  $("detail-rematch").addEventListener("click", function () {
    var act = R.activeSeats(st);
    var go = function () { closeHistory(); startGame(act.map(function (i) { return g.players[i]; }), g.target, st.rules, ((g.firstDealer || 0) + 1) % act.length); };
    if (state && state.rounds.length && !isOver()) confirmLeave(go); else go();
  });
  $("detail-delete").addEventListener("click", function () {
    openModal("Delete this game?", "<p>" + esc(fmtDate(g.finishedAt)) + ", " + esc(who) + ". This can't be undone (export a backup first if unsure).</p>", [
      { label: "Cancel", className: "ghost", onClick: closeModal },
      { label: "Delete game", className: "danger", id: "confirm-delete-game", onClick: function () {
        closeModal();
        DB.gameDel(g.id).then(function () {
          if (lastOverId === g.id) lastOverId = "deleted:" + g.id;
          historyView.detail = null;
          toast("Game deleted");
          renderHistory();
        });
      } }
    ]);
  });
}

function statColor(name, games) {
  var k = R.nameKey(name);
  for (var a = 0; a < games.length; a++) {
    var i = games[a].players.map(R.nameKey).indexOf(k);
    if (i !== -1) return R.COLORS[(games[a].colors ? games[a].colors[i] : i) % R.COLORS.length];
  }
  return R.COLORS[0];
}
function statAvatar(name, games) { return '<span class="avatar" style="--pc:' + statColor(name, games) + '" aria-hidden="true">' + esc(initialOf(name)) + "</span>"; }

function renderStats(body, games) {
  if (!games.length) {
    body.innerHTML = '<div class="empty-card"><svg class="ic"><use href="#ic-trophy"/></svg><p>No stats yet.</p><p class="muted">Finish a game to see wins, averages, moons and Queens.</p></div>';
    return;
  }
  var stats = R.computeStats(games);
  var hands = games.reduce(function (a, g) { return a + g.hands; }, 0);
  var moons = games.reduce(function (a, g) { return a + g.moons.length; }, 0);
  var time = games.reduce(function (a, g) { return a + (g.durationMs || 0); }, 0);
  body.innerHTML = '<div class="stat-summary"><div><b>' + games.length + "</b><span>games</span></div><div><b>" + hands + "</b><span>hands</span></div><div><b>" + moons +
    "</b><span>moons</span></div><div><b>" + R.formatDuration(time) + "</b><span>played</span></div></div>" +
    '<p class="muted small">Tap a player for their profile and head-to-head record.</p><div class="stat-list">' + stats.map(function (s, k) {
      return '<button type="button" class="stat-card' + (k === 0 && s.wins ? " top" : "") + '" data-player="' + esc(s.key) + '">' +
        '<div class="sc-head">' + statAvatar(s.name, games) + '<span class="sc-name">' + esc(s.name) + '</span><span class="sc-pct">' + s.winPct + "% wins</span></div>" +
        '<div class="sc-bar"><i style="width:' + s.winPct + '%"></i></div>' +
        '<div class="sc-grid"><div><b>' + s.wins + "/" + s.played + "</b><span>won</span></div><div><b>" + s.avgScore + "</b><span>avg score</span></div><div><b>" + s.moons +
        "</b><span>moons</span></div><div><b>" + s.queens + "</b><span>♠Q taken</span></div></div></button>";
    }).join("") + "</div>";
  body.querySelectorAll("[data-player]").forEach(function (b) {
    b.addEventListener("click", function () { historyView.player = b.getAttribute("data-player"); $("history").scrollTop = 0; renderHistory(); });
  });
}
function renderProfile(body, s, games) {
  var cell = function (v, l) { return "<div><b>" + v + "</b><span>" + l + "</span></div>"; };
  var mine = games.filter(function (g) { return g.players.map(R.nameKey).indexOf(s.key) !== -1; });
  body.innerHTML = '<div class="profile-head">' + statAvatar(s.name, games).replace('class="avatar"', 'class="avatar big"') + "<div><h3>" + esc(s.name) + "</h3><p class=\"muted\">" +
    plural(s.played, "game") + " · " + s.winPct + "% win rate" + (s.streak > 1 ? " · on a " + s.streak + "-game win streak" : "") + "</p></div></div>" +
    '<div class="sc-grid big">' + cell(s.wins, "wins") + cell(s.winPct + "%", "win rate") + cell(s.avgScore, "avg final score") + cell(s.best === null ? "–" : s.best, "best game") +
    cell(s.worst === null ? "–" : s.worst, "worst game") + cell(s.bestHand === null ? "–" : s.bestHand, "best hand") + cell(s.worstHand === null ? "–" : s.worstHand, "worst hand") +
    cell(s.moons, "moons shot") + cell(s.queens, "♠Q taken") + cell(s.jacks, "J♦ taken") + cell(s.streak, "current streak") + cell(s.bestStreak, "best streak") + cell(s.hands, "hands played") + "</div>" +
    '<h4 class="sub-h">Head to head</h4>' + (s.h2h.length ? '<table class="h2h"><thead><tr><th>Against</th><th>Games</th><th>Finished ahead</th><th>Behind</th></tr></thead><tbody>' +
      s.h2h.map(function (h) { return "<tr><td>" + statAvatar(h.name, games) + " " + esc(h.name) + "</td><td>" + h.games + "</td><td>" + h.ahead + "</td><td>" + h.behind + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">No opponents yet.</p>') +
    '<h4 class="sub-h">Games</h4><div class="game-list">' + mine.map(function (g) {
      var i = g.players.map(R.nameKey).indexOf(s.key), won = g.winners.indexOf(i) !== -1;
      return '<button type="button" class="game-row small" data-game-id="' + esc(g.id) + '"><div class="gr-top"><span class="gr-date">' + esc(fmtDate(g.finishedAt)) + '</span><span class="gr-meta">' +
        (won ? "Won" : "Lost") + " · " + g.totals[i] + " points</span></div></button>";
    }).join("") + "</div>";
  body.querySelectorAll("[data-game-id]").forEach(function (b) {
    b.addEventListener("click", function () { historyView.player = null; historyView.detail = b.getAttribute("data-game-id"); $("history").scrollTop = 0; renderHistory(); });
  });
}

function exportBackup(games) {
  var data = { app: "hearts-table", version: 3, exportedAt: new Date().toISOString(), games: games, roster: roster, presets: presets };
  download("hearts-history-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data, null, 1), "application/json");
  toast("Exported " + plural(games.length, "game"));
}
function exportCsv(games) {
  download("hearts-hands-" + new Date().toISOString().slice(0, 10) + ".csv", R.toCsv(games), "text/csv");
  toast("Exported " + plural(games.length, "game") + " as CSV");
}
function importText(text) {
  var obj;
  try { obj = JSON.parse(text); } catch (e) { toast("That file isn't a Hearts backup."); return Promise.resolve({ ok: false }); }
  var p = R.parseBackup(obj);
  if (!p.ok) { toast(p.error); return Promise.resolve(p); }
  return DB.gamesAll().then(function (existing) {
    var m = R.mergeGames(existing, p.games);
    roster = R.updateRoster(roster, p.roster.concat([].concat.apply([], m.added.map(function (g) { return g.players; }))));
    saveRoster();
    p.presets.forEach(function (pr) { if (pr.name !== "Classic" && !presets.some(function (x) { return x.name === pr.name; })) presets.push(pr); });
    savePresets();
    return DB.gamesPut(m.added).then(function () {
      gamesCount = existing.length + m.added.length;
      toast("Imported " + plural(m.added.length, "game") + (m.skipped ? " (" + m.skipped + " already here)" : "") + (p.invalid ? ", skipped " + p.invalid + " damaged" : ""));
      if (!$("history").hidden) renderHistory();
      return { ok: true, added: m.added.length, skipped: m.skipped, invalid: p.invalid };
    });
  });
}
$("import-file").addEventListener("change", function () {
  var f = this.files && this.files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () { importText(String(rd.result)); };
  rd.readAsText(f);
});
