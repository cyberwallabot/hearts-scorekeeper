/* Hearts Table v5 app, part 1: state, storage, migration, feedback, small UI helpers. */
var L = window.HeartsLogic, R = window.HeartsRules, M = window.HeartsMoon, DB = window.HeartsDB;
var LEGACY_KEYS = { state: "hearts-scorekeeper-v1", draft: "hearts-draft-v1", bag: "hearts-moon-bag-v1" };
var TABLE_SEATS = [ // shared-table mode, 4 players: bottom, left, top, right (clockwise)
  { pos: "bottom", rot: 0, label: "Bottom" }, { pos: "left", rot: 90, label: "Left" },
  { pos: "top", rot: 180, label: "Top" }, { pos: "right", rot: 270, label: "Right" }
];
var SEAT_WORD = ["Seat 1", "Seat 2", "Seat 3", "Seat 4", "Seat 5", "Seat 6"];
var PHONE_TUNE = { unit: 22, maxGain: 2.2 };   // pass-the-phone slide: 22 px per point, gentle acceleration
var TABLE_TUNE = null;                         // shared table keeps the original feel

var state = null;            // current game (rules v3 state) or null on the setup screen
var hist = { undo: [], redo: [] };
var entry = R.blankEntry(4);
var entryUndo = [];          // per-seat stack of earlier values for the current hand
var editing = null;          // index of the hand being edited
var celebrated = false;      // winner screen already shown for this finish
var settings = { sound: true, haptics: true, calm: false, layout: "auto", autoSheet: true, onboarded: false, timer: true };
var roster = [], presets = [];
var moonBag = { bag: [], last: null };
var gamesCount = 0, lastOverId = null;
var setupDraft = null;
var moonBusy = false, moonCtl = null, moonStartedAt = 0, pendingWinner = false;
var toastTimer = 0, toastAction = null;
var wake = { lock: null, status: "idle" };
var readyResolve;
window.__heartsReady = new Promise(function (res) { readyResolve = res; });

function $(id) { return document.getElementById(id); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}
function isInt(n) { return R.isInt(n); }
function ordinal(n) { return n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"); }
function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
function calm() { return settings.calm || RM.matches; }
function colorOf(st, i) { return R.COLORS[(st.colors && isInt(st.colors[i]) ? st.colors[i] : i) % R.COLORS.length]; }
function initialOf(name) { var m = String(name || "?").trim().match(/[\p{L}\p{N}]/u); return m ? m[0].toUpperCase() : "?"; }
function avatar(st, i, cls) {
  return '<span class="avatar' + (cls ? " " + cls : "") + '" style="--pc:' + colorOf(st, i) + '" aria-hidden="true">' + esc(initialOf(st.players[i])) + "</span>";
}
function fmtDate(ts) {
  try { return new Date(ts).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch (e) { return new Date(ts).toString(); }
}
function fmtDay(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return ""; }
}

/* ---------- feedback ---------- */
function buzz(p) {
  if (!settings.haptics || !navigator.vibrate) return;
  try { navigator.vibrate(p); } catch (e) {}
}
var audio = null, lastTick = 0;
function ac() {
  if (!audio) {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { audio = new C(); } catch (e) { return null; }
  }
  if (audio.state === "suspended") { try { audio.resume(); } catch (e) {} }
  return audio;
}
function tone(a, f, t0, dur, type, vol, f2) {
  var t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(a, t0, dur, vol) {
  var n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0), i;
  for (i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4);
  var src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 1800;
  src.buffer = buf; g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(a.currentTime + t0);
}
var sfxLog = [];
function sfx(name) {
  sfxLog.push(name); if (sfxLog.length > 50) sfxLog.shift();
  if (!settings.sound) return;
  var a = ac();
  if (!a) return;
  try {
    if (name === "tick") {
      var now = Date.now();
      if (now - lastTick < 35) return;
      lastTick = now;
      tone(a, 1500, 0, 0.03, "square", 0.018);
    } else if (name === "save") { tone(a, 660, 0, 0.12, "triangle", 0.12); tone(a, 990, 0.09, 0.18, "triangle", 0.12); }
    else if (name === "undo") { tone(a, 520, 0, 0.12, "sine", 0.1, 340); }
    else if (name === "clear") { tone(a, 420, 0, 0.06, "sine", 0.07); }
    else if (name === "error") { tone(a, 200, 0, 0.16, "sawtooth", 0.05); }
    else if (name === "bang") { noise(a, 0, 0.45, 0.5); tone(a, 140, 0, 0.3, "sine", 0.3, 50); }
    else if (name === "win") { [523, 659, 784, 1047].forEach(function (f, k) { tone(a, f, k * 0.13, 0.32, "triangle", 0.13); }); tone(a, 1319, 0.6, 0.6, "triangle", 0.1); }
  } catch (e) {}
}

/* ---------- persistence ---------- */
function snapshot() {
  return { v: 3, state: state, hist: hist, entry: entry, entryUndo: entryUndo, editing: editing, celebrated: celebrated, setup: setupDraft, savedAt: Date.now() };
}
function persist() { return DB.kvSet("current", snapshot()); }
function saveSettings() { return DB.kvSet("settings", settings); }
function saveRoster() { return DB.kvSet("roster", roster); }
function savePresets() { return DB.kvSet("presets", presets); }

function isOver() { return !!(state && state.started && R.isOver(state)); }

// Finished games are mirrored into the games store; undoing the last hand takes them back out.
function syncFinished() {
  if (!state) return;
  if (isOver()) {
    if (!state.finishedAt) state.finishedAt = Date.now();
    DB.gamePut(R.buildRecord(state, state.finishedAt));
    if (lastOverId !== state.id) gamesCount++;
    lastOverId = state.id;
    roster = R.updateRoster(roster, state.players);
    saveRoster();
  } else {
    if (state.finishedAt) delete state.finishedAt;
    celebrated = false;
    if (lastOverId === state.id) { DB.gameDel(state.id); gamesCount = Math.max(0, gamesCount - 1); lastOverId = null; }
  }
}

function validEntry(e, n) {
  if (!e || typeof e !== "object") return null;
  var pts = Array.isArray(e) ? e : e.pts; // v4 stored a bare array of 4
  if (!Array.isArray(pts) || pts.length !== n || !pts.every(function (v) { return v === null || (isInt(v) && v >= 0 && v <= 117); })) return null;
  return { pts: pts.slice(), queen: isInt(e.queen) && e.queen < n ? e.queen : null, jack: isInt(e.jack) && e.jack < n ? e.jack : null };
}

function migrateLegacy() {
  var raw = null, draft = null, bag = null;
  try {
    raw = localStorage.getItem(LEGACY_KEYS.state);
    draft = localStorage.getItem(LEGACY_KEYS.draft);
    bag = localStorage.getItem(LEGACY_KEYS.bag);
  } catch (e) { return Promise.resolve(null); }
  if (!raw && !bag) return Promise.resolve(null);
  var cur = null, writes = [];
  try {
    var st = raw ? R.sanitizeState(JSON.parse(raw)) : null;
    if (st) {
      var en = R.blankEntry(st.players.length);
      try { var d = JSON.parse(draft || "null"); en = (d && validEntry(d.entry, st.players.length)) || en; } catch (e) {}
      cur = { v: 3, state: st, hist: { undo: [], redo: [] }, entry: en, editing: null, savedAt: Date.now(), migrated: true };
      if (st.started && R.isOver(st)) {
        st.finishedAt = Date.now();
        cur.celebrated = true;
        writes.push(DB.gamePut(R.buildRecord(st, st.finishedAt)));
      }
      writes.push(DB.kvSet("current", cur));
    }
  } catch (e) {}
  try { var b = JSON.parse(bag || "null"); if (b && Array.isArray(b.bag)) { moonBag = { bag: b.bag, last: b.last || null }; writes.push(DB.kvSet("moonBag", moonBag)); } } catch (e) {}
  return Promise.all(writes).then(function () {
    try { Object.keys(LEGACY_KEYS).forEach(function (k) { localStorage.removeItem(LEGACY_KEYS[k]); }); localStorage.setItem("hearts-migrated-v4", "1"); } catch (e) {}
    return cur;
  });
}

function loadAll() {
  return Promise.all([DB.kvGet("current"), DB.kvGet("settings"), DB.kvGet("roster"), DB.kvGet("moonBag"), DB.gamesAll(), DB.kvGet("presets")]).then(function (r) {
    var s = r[1];
    if (s && typeof s === "object") {
      settings.sound = s.sound !== false; settings.haptics = s.haptics !== false; settings.calm = !!s.calm;
      settings.layout = ["auto", "phone", "table"].indexOf(s.layout) !== -1 ? s.layout : "auto";
      settings.autoSheet = s.autoSheet !== false; settings.timer = s.timer !== false;
      settings.onboarded = !!s.onboarded;
    }
    if (Array.isArray(r[2])) roster = R.updateRoster(r[2], []);
    if (r[3] && Array.isArray(r[3].bag)) moonBag = r[3];
    if (Array.isArray(r[5])) presets = r[5].map(function (p) { return R.sanitizeRules(p); }).filter(function (p) { return p.name !== "Classic"; }).slice(0, 12);
    gamesCount = r[4].length;
    roster = R.updateRoster(roster, [].concat.apply([], r[4].slice(0, 12).map(function (g) { return g.players || []; })));
    return r[0] ? r[0] : migrateLegacy();
  }).then(function (cur) {
    if (!cur) return;
    if (cur.setup && typeof cur.setup === "object") setupDraft = cur.setup;
    if (!cur.state) return;
    var st = R.sanitizeState(cur.state);
    if (!st) return;
    if (!st.started) { if (!setupDraft) setupDraft = { players: st.players, target: st.target, rules: st.rules, firstDealer: st.firstDealer }; return; }
    state = st;
    var n = st.players.length;
    if (cur.hist && Array.isArray(cur.hist.undo) && Array.isArray(cur.hist.redo)) {
      var ok = function (x) { var y = R.sanitizeState(x); return y && y.started ? y : null; };
      hist = { undo: cur.hist.undo.map(ok).filter(Boolean), redo: cur.hist.redo.map(ok).filter(Boolean) };
    }
    entry = validEntry(cur.entry, n) || R.blankEntry(n);
    entryUndo = Array.isArray(cur.entryUndo) && cur.entryUndo.length === n ? cur.entryUndo.map(function (a) { return Array.isArray(a) ? a.filter(function (v) { return v === null || isInt(v); }).slice(-20) : []; }) : emptyUndo(n);
    if (isInt(cur.editing) && cur.editing >= 0 && cur.editing < st.rounds.length) editing = cur.editing;
    celebrated = cur.v === 3 ? !!cur.celebrated : R.isOver(st);
    if (isOver()) lastOverId = state.id;
  });
}
function emptyUndo(n) { var a = []; while (a.length < n) a.push([]); return a; }

/* ---------- toast / modal / sheet ---------- */
function toast(msg, action) {
  var el = $("toast"), btn = $("toast-act");
  $("toast-msg").textContent = msg;
  toastAction = action || null;
  btn.hidden = !action;
  if (action) btn.textContent = action.label;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); toastAction = null; }, action ? 5000 : 2600);
}
$("toast-act").addEventListener("click", function () {
  var a = toastAction; toastAction = null;
  $("toast").classList.remove("show");
  if (a) a.run();
});
var modalOnClose = null;
function closeModal() {
  $("modal").classList.remove("show");
  $("modal-body").innerHTML = "";
  $("modal-actions").innerHTML = "";
  var f = modalOnClose; modalOnClose = null;
  if (f) f();
}
function openModal(title, bodyHtml, buttons, onClose) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = bodyHtml;
  var actions = $("modal-actions");
  actions.innerHTML = "";
  modalOnClose = onClose || null;
  buttons.forEach(function (b) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = b.className || "ghost";
    if (b.id) btn.id = b.id;
    btn.textContent = b.label;
    btn.addEventListener("click", function () { b.onClick(); });
    actions.appendChild(btn);
  });
  $("modal").classList.add("show");
  var focusBtn = actions.querySelector(".primary") || actions.querySelector("button");
  if (focusBtn) setTimeout(function () { try { focusBtn.focus({ preventScroll: true }); } catch (e) {} }, 30);
}
$("modal").addEventListener("click", function (e) { if (e.target === $("modal")) closeModal(); });
function openSheet(title, build) {
  $("sheet-title").textContent = title;
  var body = $("sheet-body");
  body.innerHTML = "";
  build(body);
  $("sheet").classList.add("show");
  $("sheet").setAttribute("aria-hidden", "false");
  $("sheet").scrollTop = 0;
}
function closeSheet() {
  $("sheet").classList.remove("show");
  $("sheet").setAttribute("aria-hidden", "true");
}
$("sheet-close").addEventListener("click", closeSheet);
function download(name, text, type) {
  var blob = text instanceof Blob ? text : new Blob([text], { type: type || "text/plain" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  window.__heartsLastDownload = { name: name, size: blob.size, type: blob.type, blob: blob };
}
