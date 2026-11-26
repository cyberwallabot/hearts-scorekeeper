/* Storage: IndexedDB ("hearts-table" with stores games + kv), localStorage fallback if IDB is unavailable. */
(function (root) {
  "use strict";
  var DB_NAME = "hearts-table";
  var DB_VERSION = 1;
  var FALLBACK_KEY = "hearts-table-fallback-v1";
  var db = null;
  var mode = "none";
  var chain = Promise.resolve();
  var mem = { kv: {}, games: {} };

  function req(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function openIdb() {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) { rej(new Error("no indexedDB")); return; }
      var r;
      try { r = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains("games")) {
          var s = d.createObjectStore("games", { keyPath: "id" });
          s.createIndex("finishedAt", "finishedAt");
        }
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error("blocked")); };
    });
  }
  function loadFallback() {
    try { var p = JSON.parse(root.localStorage.getItem(FALLBACK_KEY) || "null"); if (p && p.kv && p.games) mem = p; } catch (e) {}
  }
  function saveFallback() {
    try { root.localStorage.setItem(FALLBACK_KEY, JSON.stringify(mem)); } catch (e) {}
  }
  function store(name, rw) {
    return db.transaction(name, rw ? "readwrite" : "readonly").objectStore(name);
  }
  function done(tx) {
    return new Promise(function (res, rej) {
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
      tx.onabort = function () { rej(tx.error); };
    });
  }
  // Writes are serialised so a quick refresh never sees them out of order.
  function queue(fn) {
    chain = chain.then(fn, fn).catch(function (e) { if (root.console) console.warn("hearts db", e); });
    return chain;
  }
  function copy(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  var DB = {
    open: function () {
      return openIdb().then(function (d) {
        db = d; mode = "indexeddb";
        db.onversionchange = function () { db.close(); };
      }, function () { mode = "localStorage"; loadFallback(); });
    },
    mode: function () { return mode; },
    flush: function () { return chain; },
    kvGet: function (k) {
      if (mode !== "indexeddb") return Promise.resolve(copy(mem.kv[k]));
      return req(store("kv").get(k));
    },
    kvSet: function (k, v) {
      return queue(function () {
        if (mode !== "indexeddb") { mem.kv[k] = copy(v); saveFallback(); return; }
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(v, k);
        return done(tx);
      });
    },
    kvDel: function (k) {
      return queue(function () {
        if (mode !== "indexeddb") { delete mem.kv[k]; saveFallback(); return; }
        var tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").delete(k);
        return done(tx);
      });
    },
    gamesAll: function () {
      var p = mode !== "indexeddb"
        ? Promise.resolve(Object.keys(mem.games).map(function (k) { return copy(mem.games[k]); }))
        : chain.then(function () { return req(store("games").getAll()); });
      return p.then(function (list) {
        return (list || []).sort(function (a, b) { return (b.finishedAt || 0) - (a.finishedAt || 0); });
      });
    },
    gameGet: function (id) {
      if (mode !== "indexeddb") return Promise.resolve(copy(mem.games[id]));
      return chain.then(function () { return req(store("games").get(id)); });
    },
    gamePut: function (g) { return DB.gamesPut([g]); },
    gamesPut: function (list) {
      return queue(function () {
        if (mode !== "indexeddb") { list.forEach(function (g) { mem.games[g.id] = copy(g); }); saveFallback(); return; }
        var tx = db.transaction("games", "readwrite");
        var s = tx.objectStore("games");
        list.forEach(function (g) { s.put(g); });
        return done(tx);
      });
    },
    gameDel: function (id) {
      return queue(function () {
        if (mode !== "indexeddb") { delete mem.games[id]; saveFallback(); return; }
        var tx = db.transaction("games", "readwrite");
        tx.objectStore("games").delete(id);
        return done(tx);
      });
    }
  };
  root.HeartsDB = DB;
})(typeof window !== "undefined" ? window : this);
