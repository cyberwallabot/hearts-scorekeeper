/* Hearts moon animations. Pure SVG + Web Animations, no assets, works offline.
   HeartsMoon.play({container, name, rot, variant, timeScale, onDone}) -> {skip()} */
(function (root) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  var VARIANTS = [
    { id: "explode",   title: "The moon went boom" },
    { id: "playdead",  title: "The moon is totally dead. Probably." },
    { id: "cheese",    title: "Swiss cheese moon, burger landing" },
    { id: "deflate",   title: "The moon lost its air" },
    { id: "egg",       title: "The moon hatched a chick" },
    { id: "ko",        title: "The moon got knocked out" },
    { id: "melt",      title: "The moon is melting" },
    { id: "shatter",   title: "The moon shattered like glass" },
    { id: "disco",     title: "The moon became a disco ball" },
    { id: "flee",      title: "The moon ran away" },
    { id: "pizza",     title: "The moon is pizza night" },
    { id: "flag",      title: "The moon surrenders" },
    { id: "pinata",    title: "The moon was a piñata" },
    { id: "spinout",   title: "The moon went down the drain" }
  ];

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    var k;
    if (attrs) for (k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // A positioned wrapper (attribute transform) with an inner group we can animate.
  function place(parent, x, y, rot) {
    var o = el("g", { transform: "translate(" + x + "," + y + ")" + (rot ? " rotate(" + rot + ")" : "") }, parent);
    return el("g", {}, o);
  }

  function T(x, y, r, sx, sy) {
    x = x || 0; y = y || 0; r = r || 0;
    if (sx == null) sx = 1;
    if (sy == null) sy = sx;
    return "translate(" + x + "px," + y + "px) rotate(" + r + "deg) scale(" + sx + "," + sy + ")";
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function pt(r, a) {
    var t = a * Math.PI / 180;
    return (r * Math.cos(t)).toFixed(1) + " " + (r * Math.sin(t)).toFixed(1);
  }
  function wedgePath(r0, r1, a0, a1) {
    if (r0 <= 0) return "M0 0 L" + pt(r1, a0) + " A" + r1 + " " + r1 + " 0 0 1 " + pt(r1, a1) + " Z";
    return "M" + pt(r0, a0) + " L" + pt(r1, a0) + " A" + r1 + " " + r1 + " 0 0 1 " + pt(r1, a1) +
      " L" + pt(r0, a1) + " A" + r0 + " " + r0 + " 0 0 0 " + pt(r0, a0) + " Z";
  }
  function starPoints(r, n, inner) {
    var pts = [];
    var i, a;
    for (i = 0; i < n * 2; i++) {
      a = -Math.PI / 2 + i * Math.PI / n;
      pts.push((Math.cos(a) * (i % 2 ? r * inner : r)).toFixed(1) + "," + (Math.sin(a) * (i % 2 ? r * inner : r)).toFixed(1));
    }
    return pts.join(" ");
  }

  var OUT = "#3b3a2f";

  /* ------------------------------------------------------------------ */

  function play(opts) {
    var host = opts.container;
    var TS = opts.timeScale || 1;
    var rot = opts.rot || 0;
    var cancelled = false;
    var finished = false;
    var anims = [];
    var timers = [];
    var pending = [];
    var c = {};

    host.innerHTML = "";
    host.hidden = false;

    var sky = document.createElement("div");
    sky.className = "moon-sky";
    host.appendChild(sky);

    var svg = el("svg", { viewBox: "0 0 400 560", preserveAspectRatio: "xMidYMid meet", "class": "moon-svg" });
    host.appendChild(svg);

    var cap = document.createElement("div");
    cap.className = "moon-cap";
    cap.style.setProperty("--rot", rot + "deg");
    cap.setAttribute("data-rot", String(rot));
    var capin = document.createElement("div");
    capin.className = "capin";
    var b = document.createElement("b");
    b.textContent = opts.name + " shot the moon!";
    var sm = document.createElement("span");
    var vInfo = VARIANTS.filter(function (v) { return v.id === opts.variant; })[0] || VARIANTS[0];
    sm.textContent = vInfo.title;
    capin.appendChild(b);
    capin.appendChild(sm);
    cap.appendChild(capin);
    host.appendChild(cap);

    var hint = document.createElement("div");
    hint.className = "moon-hint";
    hint.textContent = "tap to skip";
    host.appendChild(hint);

    host.setAttribute("data-variant", vInfo.id);

    function wait(ms) {
      return new Promise(function (res) {
        if (cancelled) return res();
        timers.push(setTimeout(res, ms * TS));
        pending.push(res);
      });
    }
    function A(node, frames, ms, easing, delay, iterations) {
      var a;
      if (cancelled || !node || !node.animate) return Promise.resolve();
      a = node.animate(frames, {
        duration: Math.max(1, ms * TS),
        delay: (delay || 0) * TS,
        fill: "both",
        easing: easing || "ease-out",
        iterations: iterations || 1
      });
      anims.push(a);
      return a.finished.then(function () {}, function () {});
    }
    // Endless loops are not awaited.
    function loop(node, frames, ms, easing, delay, dir) {
      var a;
      if (cancelled || !node || !node.animate) return;
      a = node.animate(frames, {
        duration: Math.max(1, ms * TS), delay: (delay || 0) * TS,
        fill: "both", easing: easing || "ease-in-out", iterations: Infinity, direction: dir || "alternate"
      });
      anims.push(a);
    }

    function finish() {
      if (finished) return;
      finished = true;
      cancelled = true;
      timers.forEach(clearTimeout);
      pending.forEach(function (r) { r(); });
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
      host.hidden = true;
      host.innerHTML = "";
      if (opts.onDone) opts.onDone();
    }

    /* ---------- defs ---------- */
    var defs = el("defs", {}, svg);
    var mg = el("radialGradient", { id: "mg", cx: "38%", cy: "34%", r: "78%" }, defs);
    el("stop", { offset: "0%", "stop-color": "#fffbe9" }, mg);
    el("stop", { offset: "65%", "stop-color": "#f2e9c5" }, mg);
    el("stop", { offset: "100%", "stop-color": "#d8cd9f" }, mg);
    var tiles = el("pattern", { id: "tiles", width: "26", height: "26", patternUnits: "userSpaceOnUse" }, defs);
    el("rect", { width: 13, height: 13, fill: "#eef3fb" }, tiles);
    el("rect", { x: 13, width: 13, height: 13, fill: "#a9b8d0" }, tiles);
    el("rect", { y: 13, width: 13, height: 13, fill: "#c9d4e6" }, tiles);
    el("rect", { x: 13, y: 13, width: 13, height: 13, fill: "#e4ebf6" }, tiles);
    var stripes = el("pattern", { id: "stripes", width: "40", height: "36", patternUnits: "userSpaceOnUse" }, defs);
    el("rect", { width: 40, height: 12, fill: "#ff4f81" }, stripes);
    el("rect", { y: 12, width: 40, height: 12, fill: "#ffd23f" }, stripes);
    el("rect", { y: 24, width: 40, height: 12, fill: "#2ec4b6" }, stripes);
    var clipMoon = el("clipPath", { id: "clipMoon" }, defs);
    el("circle", { r: 90 }, clipMoon);
    var clipTop = el("clipPath", { id: "clipTop" }, defs);
    el("path", { d: "M-130 -140 L130 -140 L130 0 L96 -22 L64 10 L32 -22 L0 10 L-32 -22 L-64 10 L-96 -22 L-130 0 Z" }, clipTop);
    var clipBot = el("clipPath", { id: "clipBot" }, defs);
    el("path", { d: "M-130 0 L-96 -22 L-64 10 L-32 -22 L0 10 L32 -22 L64 10 L96 -22 L130 0 L130 140 L-130 140 Z" }, clipBot);

    /* ---------- scene ---------- */
    var world = el("g", {}, svg);
    var moonPos = el("g", { transform: "translate(200,210)" }, world);
    var m = el("g", {}, moonPos);
    el("circle", { r: 90, fill: "url(#mg)", stroke: OUT, "stroke-width": 4 }, m);
    var craters = el("g", {}, m);
    [[-42, -52, 17], [36, -58, 10], [52, 28, 19], [-56, 40, 11], [4, 70, 9], [-8, -78, 6]].forEach(function (cr) {
      el("circle", { cx: cr[0], cy: cr[1], r: cr[2], fill: "rgba(150,140,98,.32)" }, craters);
    });
    var skin = el("g", {}, m);
    var face = el("g", {}, m);
    el("ellipse", { cx: -54, cy: 20, rx: 14, ry: 8, fill: "rgba(255,120,140,.45)" }, face);
    el("ellipse", { cx: 54, cy: 20, rx: 14, ry: 8, fill: "rgba(255,120,140,.45)" }, face);

    var eyes = {};
    function eyeBall(g, cx, rx, ry, pr, look) {
      el("ellipse", { cx: cx, cy: -18, rx: rx, ry: ry, fill: "#fff", stroke: OUT, "stroke-width": 3 }, g);
      return el("circle", { cx: cx + (look || 0), cy: -16, r: pr, fill: "#1b1a17" }, g);
    }
    eyes.normal = el("g", {}, face); eyeBall(eyes.normal, -32, 15, 17, 7); eyeBall(eyes.normal, 32, 15, 17, 7);
    eyes.wide = el("g", {}, face); eyeBall(eyes.wide, -32, 19, 22, 5); eyeBall(eyes.wide, 32, 19, 22, 5);
    eyes.x = el("g", { fill: "none", stroke: "#1b1a17", "stroke-width": 6, "stroke-linecap": "round" }, face);
    el("path", { d: "M-46 -32 L-20 -6 M-20 -32 L-46 -6 M20 -32 L46 -6 M46 -32 L20 -6" }, eyes.x);
    eyes.peek = el("g", {}, face);
    el("path", { d: "M-46 -32 L-20 -6 M-20 -32 L-46 -6", fill: "none", stroke: "#1b1a17", "stroke-width": 6, "stroke-linecap": "round" }, eyes.peek);
    c.peekPupil = eyeBall(eyes.peek, 32, 17, 19, 7, 0);
    eyes.spiral = el("g", { fill: "none", stroke: "#1b1a17", "stroke-width": 3.5, "stroke-linecap": "round" }, face);
    [-32, 32].forEach(function (cx) {
      var d = "M" + cx + " -18";
      var i, a, r;
      for (i = 1; i <= 40; i++) { a = i * 0.45; r = i * 0.5; d += " L" + (cx + Math.cos(a) * r).toFixed(1) + " " + (-18 + Math.sin(a) * r).toFixed(1); }
      el("path", { d: d }, eyes.spiral);
    });
    eyes.happy = el("g", { fill: "none", stroke: "#1b1a17", "stroke-width": 6, "stroke-linecap": "round" }, face);
    el("path", { d: "M-48 -10 Q-32 -36 -16 -10 M16 -10 Q32 -36 48 -10" }, eyes.happy);

    var mouths = {};
    mouths.smile = el("path", { d: "M-30 26 Q0 58 30 26", fill: "none", stroke: "#1b1a17", "stroke-width": 5, "stroke-linecap": "round" }, face);
    mouths.o = el("ellipse", { cx: 0, cy: 38, rx: 12, ry: 16, fill: "#3a1218", stroke: "#1b1a17", "stroke-width": 3 }, face);
    mouths.flat = el("path", { d: "M-22 38 L22 38", stroke: "#1b1a17", "stroke-width": 5, "stroke-linecap": "round" }, face);
    mouths.frown = el("path", { d: "M-28 50 Q0 22 28 50", fill: "none", stroke: "#1b1a17", "stroke-width": 5, "stroke-linecap": "round" }, face);
    mouths.tongue = el("g", {}, face);
    el("path", { d: "M-8 36 L-8 58 Q0 70 8 58 L8 36 Z", fill: "#ff7f93", stroke: "#1b1a17", "stroke-width": 3 }, mouths.tongue);
    el("path", { d: "M-28 30 Q0 50 28 30", fill: "none", stroke: "#1b1a17", "stroke-width": 5, "stroke-linecap": "round" }, mouths.tongue);
    mouths.open = el("g", {}, face);
    el("path", { d: "M-32 24 Q0 22 32 24 Q28 66 0 66 Q-28 66 -32 24 Z", fill: "#5b1f26", stroke: "#1b1a17", "stroke-width": 4, "stroke-linejoin": "round" }, mouths.open);
    el("ellipse", { cx: 0, cy: 56, rx: 14, ry: 8, fill: "#ff7f93" }, mouths.open);

    function setFace(e, mo) {
      var k;
      for (k in eyes) eyes[k].style.display = (k === e) ? "" : "none";
      for (k in mouths) mouths[k].style.display = (k === mo) ? "" : "none";
    }
    setFace("normal", "smile");

    /* gun, pivot (70,450), aiming at the moon */
    var gunOuter = el("g", { transform: "translate(70,450) rotate(-61.5)" }, world);
    var gun = el("g", {}, gunOuter);
    el("path", { d: "M-6 10 L16 10 L8 46 L-14 46 Z", fill: "#8a4b2a", stroke: "#1d2329", "stroke-width": 3, "stroke-linejoin": "round" }, gun);
    el("rect", { x: -12, y: -13, width: 66, height: 26, rx: 7, fill: "#5f7080", stroke: "#1d2329", "stroke-width": 3 }, gun);
    el("rect", { x: 50, y: -9, width: 36, height: 18, rx: 4, fill: "#3f4a55", stroke: "#1d2329", "stroke-width": 3 }, gun);
    el("rect", { x: 82, y: -11, width: 9, height: 22, rx: 3, fill: "#ff8a3d", stroke: "#1d2329", "stroke-width": 3 }, gun);
    el("path", { d: "M10 13 Q22 30 30 13", fill: "none", stroke: "#1d2329", "stroke-width": 3 }, gun);
    el("circle", { cx: 14, cy: 0, r: 5, fill: "#ffd23f", stroke: "#1d2329", "stroke-width": 2 }, gun);
    gun.style.opacity = "0";

    /* ---------- helpers for variants ---------- */
    c.A = A; c.wait = wait; c.loop = loop; c.el = el; c.place = place; c.T = T;
    c.world = world; c.moonPos = moonPos; c.m = m; c.skin = skin; c.face = setFace; c.eyes = eyes;
    c.svg = svg; c.sky = sky; c.rnd = rnd; c.pick = pick; c.TS = TS;
    c.hideMoon = function () { m.style.display = "none"; };
    c.behindMoon = function (node) { moonPos.insertBefore(node, m); return node; };

    c.label = function (str, x, y, size, fill, r) {
      var inner = place(world, x, y, r || 0);
      var t = el("text", {
        "text-anchor": "middle", "font-size": size, "font-weight": 900,
        "font-family": "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
        fill: fill || "#fff", stroke: "#1b1a17", "stroke-width": Math.max(4, size / 6),
        "paint-order": "stroke", "stroke-linejoin": "round"
      }, inner);
      t.textContent = str;
      A(inner, [
        { transform: T(0, 0, 0, 0), opacity: 0 },
        { transform: T(0, 0, 0, 1.3), opacity: 1, offset: 0.6 },
        { transform: T(0, 0, 0, 1), opacity: 1 }
      ], 320, "ease-out");
      return inner;
    };
    c.puff = function (x, y, n, color, spread, parent) {
      var i, g, k;
      for (i = 0; i < n; i++) {
        g = place(parent || world, x, y);
        el("circle", { r: rnd(10, 24), fill: color || "#e9e4d4", opacity: 0.92 }, g);
        k = spread || 90;
        A(g, [{ transform: T(0, 0, 0, 0.3), opacity: 0.95 }, { transform: T(rnd(-k, k), rnd(-k, k * 0.4), 0, rnd(1.3, 2)), opacity: 0 }], rnd(600, 1000), "ease-out");
      }
    };
    c.spark = function (x, y, n, colors, dist, parent) {
      var i, g, a, d;
      for (i = 0; i < n; i++) {
        g = place(parent || world, x, y);
        el("polygon", { points: starPoints(rnd(5, 10), 4, 0.4), fill: pick(colors || ["#ffd23f", "#ff7a3d", "#fff"]), stroke: "#1b1a17", "stroke-width": 1.5 }, g);
        a = rnd(0, Math.PI * 2); d = rnd((dist || 120) * 0.5, dist || 120);
        A(g, [{ transform: T(0, 0, 0, 0.4), opacity: 1 }, { transform: T(Math.cos(a) * d, Math.sin(a) * d, rnd(-180, 180), 1), opacity: 0 }], rnd(500, 900), "ease-out");
      }
    };
    c.star = function (parent, x, y, r, fill) {
      var g = place(parent, x, y);
      el("polygon", { points: starPoints(r, 5, 0.5), fill: fill || "#ffd23f", stroke: "#8a5a00", "stroke-width": 2, "stroke-linejoin": "round" }, g);
      return g;
    };
    c.shards = function (radii, wedges, fillFn) {
      var out = [];
      var step = 360 / wedges;
      var off = rnd(0, step);
      var ri, w, r0, r1, a0, a1, inner;
      for (ri = 0; ri < radii.length; ri++) {
        r0 = ri === 0 ? 0 : radii[ri - 1]; r1 = radii[ri];
        for (w = 0; w < wedges; w++) {
          a0 = off + w * step; a1 = a0 + step;
          inner = place(moonPos, 0, 0);
          el("path", { d: wedgePath(r0, r1, a0, a1), fill: fillFn(ri, w), stroke: OUT, "stroke-width": 2.5, "stroke-linejoin": "round" }, inner);
          out.push({ g: inner, a: (a0 + a1) / 2, ri: ri, w: w });
        }
      }
      return out;
    };
    c.swirlEyes = function () { setFace("spiral", "o"); };

    var ctrl = {
      skip: function () { cancelled = true; finish(); },
      id: vInfo.id
    };

    /* ---------- shared prelude: the gun shoots the moon ---------- */
    function prelude() {
      var flashG, bt, bullet, hitStar;
      A(gun, [{ transform: T(-150, 0, 0, 1), opacity: 0 }, { transform: T(0, 0, 0, 1), opacity: 1 }], 340);
      A(cap, [{ opacity: 0 }, { opacity: 1 }], 400, "ease-out", 150);
      return wait(260).then(function () {
        setFace("wide", "flat");
        A(m, [{ transform: T(0, 0, 0, 1) }, { transform: T(0, -10, 0, 1.04) }, { transform: T(0, 0, 0, 1) }], 300);
        return wait(300);
      }).then(function () {
        return A(gun, [{ transform: T(0, 0, 0, 1) }, { transform: T(0, 0, -2.5, 1) }, { transform: T(0, 0, 2.5, 1) }, { transform: T(0, 0, 0, 1) }], 200, "linear");
      }).then(function () {
        flashG = place(world, 113, 371);
        el("polygon", { points: starPoints(30, 8, 0.45), fill: "#ffe36e", stroke: "#ff7a3d", "stroke-width": 3 }, flashG);
        A(flashG, [{ transform: T(0, 0, 0, 0.2), opacity: 1 }, { transform: T(0, 0, 25, 1.2), opacity: 1, offset: 0.4 }, { transform: T(0, 0, 40, 0.1), opacity: 0 }], 200, "ease-out");
        A(gun, [{ transform: T(0, 0, 0, 1) }, { transform: T(-18, 0, -9, 1) }, { transform: T(0, 0, 0, 1) }], 260);
        A(world, [{ transform: T(0, 0) }, { transform: T(-5, 3) }, { transform: T(5, -4) }, { transform: T(-3, 2) }, { transform: T(0, 0) }], 240, "linear", 120);
        bt = c.label("BANG!", 150, 330, 38, "#ffd23f", -18);
        bullet = place(world, 113, 371);
        el("circle", { r: 7, fill: "#ffd23f", stroke: "#1b1a17", "stroke-width": 2.5 }, bullet);
        el("path", { d: "M0 0 L-26 46", stroke: "rgba(255,255,255,.7)", "stroke-width": 4, "stroke-linecap": "round" }, bullet);
        return A(bullet, [{ transform: T(0, 0), opacity: 1 }, { transform: T(44, -82), opacity: 1 }], 140, "linear").then(function () {
          bullet.style.display = "none";
          setFace("wide", "o");
          hitStar = place(world, 157, 289);
          el("polygon", { points: starPoints(22, 7, 0.45), fill: "#fff", stroke: "#ff7a3d", "stroke-width": 3 }, hitStar);
          A(hitStar, [{ transform: T(0, 0, 0, 0.2), opacity: 1 }, { transform: T(0, 0, 30, 1.2), opacity: 1, offset: 0.4 }, { transform: T(0, 0, 60, 0.2), opacity: 0 }], 360);
          A(m, [{ transform: T(0, 0, 0, 1) }, { transform: T(14, -26, 10, 0.9, 1.07) }, { transform: T(0, 0, 0, 1) }], 380);
          A(gun, [{ opacity: 1 }, { opacity: 0 }], 400, "ease-in", 500);
          A(bt, [{ opacity: 1 }, { opacity: 0 }], 300, "ease-in", 400);
          return wait(400);
        });
      });
    }

    var run = (V[vInfo.id] || V.explode);
    prelude().then(function () {
      return run(c);
    }).then(function () {
      return wait(900);
    }).then(function () {
      if (!cancelled) {
        return A(host, [{ opacity: 1 }, { opacity: 0 }], 350, "ease-in");
      }
    }).then(function () {
      host.style.opacity = "";
      finish();
    });

    host.style.opacity = "";
    return ctrl;
  }

  /* ------------------------------------------------------------------ */
  var V = {};

  V.explode = function (c) {
    var m = c.m, i;
    c.face("wide", "open");
    return c.A(m, [
      { transform: c.T(0, 0, 0, 1) }, { transform: c.T(0, 0, -4, 1.08) }, { transform: c.T(0, 0, 4, 1.14) },
      { transform: c.T(0, 0, -5, 1.2) }, { transform: c.T(0, 0, 5, 1.26) }
    ], 640, "linear").then(function () {
      var fills = ["#f8f1d6", "#ece2bb", "#ddd2a3"];
      var frags = c.shards([30, 60, 90], 8, function (ri) { return fills[ri]; });
      c.hideMoon();
      var ring = c.place(c.moonPos, 0, 0);
      c.el("circle", { r: 60, fill: "none", stroke: "#fff", "stroke-width": 14 }, ring);
      c.A(ring, [{ transform: c.T(0, 0, 0, 0.3), opacity: 1 }, { transform: c.T(0, 0, 0, 4.2), opacity: 0 }], 700, "ease-out");
      var flash = c.place(c.moonPos, 0, 0);
      c.el("circle", { r: 120, fill: "#fff6c8" }, flash);
      c.A(flash, [{ transform: c.T(0, 0, 0, 0.4), opacity: 1 }, { transform: c.T(0, 0, 0, 2.2), opacity: 0 }], 520, "ease-out");
      c.puff(200, 210, 10, "#d8d2c4", 150);
      c.spark(200, 210, 14, null, 240);
      c.label("BOOM!", 200, 100, 64, "#ff5a3c", -6);
      frags.forEach(function (f) {
        var d = 150 + f.ri * 90 + c.rnd(0, 60);
        var rad = f.a * Math.PI / 180;
        c.A(f.g, [
          { transform: c.T(0, 0, 0, 1), opacity: 1 },
          { transform: c.T(Math.cos(rad) * d, Math.sin(rad) * d + 30, c.rnd(-280, 280), 1), opacity: 0 }
        ], 1300, "cubic-bezier(.1,.7,.3,1)", f.ri * 40);
      });
      return c.wait(1300);
    });
  };

  V.playdead = function (c) {
    var m = c.m;
    c.face("x", "tongue");
    return c.A(m, [{ transform: c.T(0, 0, 0) }, { transform: c.T(0, 0, -9) }, { transform: c.T(0, 0, 9) }, { transform: c.T(0, 0, -6) }, { transform: c.T(0, 0, 0) }], 520, "linear").then(function () {
      return c.A(m, [{ transform: c.T(0, 0, 0) }, { transform: c.T(10, -14, 12) }, { transform: c.T(46, 170, 104) }], 620, "cubic-bezier(.5,0,1,.6)");
    }).then(function () {
      c.puff(250, 470, 5, "#cfc8b4", 70);
      return c.A(m, [{ transform: c.T(46, 170, 104) }, { transform: c.T(54, 138, 112) }, { transform: c.T(60, 170, 122) }], 380, "ease-out");
    }).then(function () {
      c.label("...", 200, 120, 60, "#fff", 0);
      return c.wait(900);
    }).then(function () {
      c.face("peek", "tongue");
      return c.wait(500);
    }).then(function () {
      return c.A(c.peekPupil, [{ transform: c.T(0, 0) }, { transform: c.T(-9, 0) }, { transform: c.T(9, 0) }, { transform: c.T(0, 0) }], 700, "ease-in-out");
    }).then(function () {
      c.label("psst... still here", 200, 250, 30, "#ffd23f", 0);
      return c.wait(700);
    }).then(function () {
      c.face("x", "tongue");
      return c.wait(500);
    });
  };

  V.cheese = function (c) {
    var m = c.m, i;
    c.face("wide", "o");
    var cheese = c.el("circle", { r: 89, fill: "#f8d24a", stroke: "#b8860b", "stroke-width": 3, opacity: 0 }, c.skin);
    c.A(cheese, [{ opacity: 0 }, { opacity: 1 }], 320);
    var holes = [[-40, -40, 15], [30, -58, 10], [48, -8, 17], [-8, -2, 12], [-52, 26, 12], [14, 42, 16], [56, 52, 9], [-26, 62, 9], [-4, -70, 8]];
    var hg = c.el("g", {}, c.skin);
    return c.wait(200).then(function () {
      holes.forEach(function (h, k) {
        var g = c.place(hg, h[0], h[1]);
        c.el("ellipse", { rx: h[2], ry: h[2] * 0.85, fill: "#e0a21a", stroke: "#a8740d", "stroke-width": 2 }, g);
        c.el("ellipse", { cx: 2, cy: 2, rx: h[2] * 0.6, ry: h[2] * 0.5, fill: "#b9780f" }, g);
        c.A(g, [{ transform: c.T(0, 0, 0, 0) }, { transform: c.T(0, 0, 0, 1.3) }, { transform: c.T(0, 0, 0, 1) }], 240, "ease-out", k * 90);
      });
      var burger = c.place(c.world, 200, 480);
      c.el("rect", { x: -108, y: -24, width: 216, height: 24, rx: 12, fill: "#e8a24a", stroke: OUT, "stroke-width": 3 }, burger);
      c.el("rect", { x: -114, y: -52, width: 228, height: 28, rx: 14, fill: "#6b3b1f", stroke: OUT, "stroke-width": 3 }, burger);
      c.el("path", { d: "M-116 -60 q16 -14 32 0 t32 0 t32 0 t32 0 t32 0 t32 0 t32 0", fill: "none", stroke: "#4fae3f", "stroke-width": 14, "stroke-linecap": "round" }, burger);
      c.el("rect", { x: -100, y: -70, width: 200, height: 10, rx: 5, fill: "#e0442f" }, burger);
      c.A(burger, [{ transform: c.T(0, 220, 0, 1), opacity: 0 }, { transform: c.T(0, 0, 0, 1), opacity: 1 }], 700, "cubic-bezier(.2,1.2,.4,1)", 700);
      return c.wait(1500).then(function () {
        c.face("wide", "frown");
        return c.A(m, [
          { transform: c.T(0, 0, 0, 1) }, { transform: c.T(0, 90, 6, 0.9) },
          { transform: c.T(0, 142, 0, 0.82, 0.82) }, { transform: c.T(0, 150, 0, 1, 0.55) }, { transform: c.T(0, 134, 0, 0.84, 0.86) }
        ], 760, "cubic-bezier(.5,0,.8,.6)");
      }).then(function () {
        c.face("happy", "open");
        c.puff(200, 440, 6, "#fff3b8", 100);
        c.label("Cheese!", 200, 110, 54, "#ffd23f", -5);
        return c.wait(900);
      });
    });
  };

  V.deflate = function (c) {
    var m = c.m;
    var balloon = c.el("circle", { r: 89, fill: "#ff5f86", stroke: "#a31c44", "stroke-width": 3, opacity: 0 }, c.skin);
    c.el("ellipse", { cx: -34, cy: -42, rx: 20, ry: 12, fill: "rgba(255,255,255,.6)", transform: "rotate(-35 -34 -42)" }, c.skin);
    var knot = c.el("path", { d: "M-9 104 L0 88 L9 104 Z", fill: "#a31c44" }, m);
    var string = c.el("path", { d: "M0 104 q-14 26 0 52 t0 52", fill: "none", stroke: "#1b1a17", "stroke-width": 3 }, m);
    c.A(balloon, [{ opacity: 0 }, { opacity: 1 }], 300);
    c.face("wide", "o");
    var pts = [[0, 0, 0, 1], [120, -60, 40, 0.88], [-140, -10, -70, 0.74], [110, 110, 100, 0.6], [-90, 120, -120, 0.48], [50, 205, 220, 0.34], [0, 218, 330, 0.26]];
    return c.wait(300).then(function () {
      c.label("PSSSSSS", 200, 90, 46, "#fff", -4);
      pts.forEach(function (p, k) {
        if (k > 0) c.puff(200 + p[0], 210 + p[1], 2, "#fff", 40);
      });
      var frames = pts.map(function (p, k) {
        return { transform: c.T(p[0], p[1], p[2], p[3], k === pts.length - 1 ? 0.14 : p[3]), offset: k / (pts.length - 1) };
      });
      return c.A(m, frames, 2000, "linear");
    }).then(function () {
      c.label("pfft", 200, 470, 30, "#fff", 0);
      return c.wait(500);
    });
  };

  V.egg = function (c) {
    var m = c.m;
    var shell = c.el("circle", { r: 89, fill: "#fbf6e8", stroke: "#bfae88", "stroke-width": 3, opacity: 0 }, c.skin);
    c.A(shell, [{ opacity: 0 }, { opacity: 1 }], 350);
    c.face("wide", "flat");
    return c.A(m, [{ transform: c.T(0, 0, 0, 1, 1) }, { transform: c.T(0, 8, 0, 0.9, 1.14) }], 450, "ease-out").then(function () {
      var crack = c.el("path", { d: "M-84 0 L-60 -18 L-40 10 L-20 -14 L0 12 L22 -16 L44 10 L64 -16 L86 0", fill: "none", stroke: "#3b3a2f", "stroke-width": 4, "stroke-linejoin": "round", "stroke-dasharray": "320", "stroke-dashoffset": "320" }, c.m);
      c.A(crack, [{ strokeDashoffset: 320 }, { strokeDashoffset: 0 }], 700, "linear");
      return c.A(m, [
        { transform: c.T(0, 8, 0, 0.9, 1.14) }, { transform: c.T(0, 8, -10, 0.9, 1.14) }, { transform: c.T(0, 8, 10, 0.9, 1.14) },
        { transform: c.T(0, 8, -12, 0.9, 1.14) }, { transform: c.T(0, 8, 12, 0.9, 1.14) }, { transform: c.T(0, 8, 0, 0.9, 1.14) }
      ], 800, "linear");
    }).then(function () {
      c.hideMoon();
      var egg = c.place(c.moonPos, 0, 8);
      var chick = c.place(egg, 0, -2);
      c.el("circle", { r: 50, fill: "#ffe14d", stroke: "#b88a00", "stroke-width": 3 }, chick);
      c.el("circle", { cx: -16, cy: -8, r: 6, fill: "#1b1a17" }, chick);
      c.el("circle", { cx: 16, cy: -8, r: 6, fill: "#1b1a17" }, chick);
      c.el("circle", { cx: -14, cy: -10, r: 2, fill: "#fff" }, chick);
      c.el("circle", { cx: 18, cy: -10, r: 2, fill: "#fff" }, chick);
      c.el("path", { d: "M-9 6 L9 6 L0 20 Z", fill: "#ff8a1f", stroke: "#a85100", "stroke-width": 2, "stroke-linejoin": "round" }, chick);
      c.el("path", { d: "M-50 4 q-16 14 -2 26 q8 -8 10 -22 Z M50 4 q16 14 2 26 q-8 -8 -10 -22 Z", fill: "#ffd23f", stroke: "#b88a00", "stroke-width": 2 }, chick);
      c.el("path", { d: "M-6 -50 q-4 -16 6 -14 q-2 8 4 14 M4 -50 q4 -14 10 -8", fill: "none", stroke: "#b88a00", "stroke-width": 3, "stroke-linecap": "round" }, chick);
      var bot = c.place(egg, 0, 0);
      c.el("ellipse", { rx: 81, ry: 102, fill: "#fbf6e8", stroke: "#bfae88", "stroke-width": 3, "clip-path": "url(#clipBot)" }, bot);
      var top = c.place(egg, 0, 0);
      c.el("ellipse", { rx: 81, ry: 102, fill: "#fbf6e8", stroke: "#bfae88", "stroke-width": 3, "clip-path": "url(#clipTop)" }, top);
      c.A(chick, [{ transform: c.T(0, 70, 0, 0.5), opacity: 0 }, { transform: c.T(0, -6, 0, 1), opacity: 1 }], 520, "cubic-bezier(.2,1.4,.4,1)", 80);
      c.A(top, [{ transform: c.T(0, 0, 0, 1), opacity: 1 }, { transform: c.T(-70, -170, -60, 1), opacity: 1, offset: 0.55 }, { transform: c.T(-130, 150, -150, 1), opacity: 0 }], 1100, "ease-in");
      c.puff(200, 190, 6, "#fff", 80);
      c.spark(200, 200, 8, ["#fff", "#ffe14d"], 130);
      return c.wait(500).then(function () {
        c.label("peep!", 290, 120, 44, "#ffe14d", 8);
        return c.A(chick, [
          { transform: c.T(0, -6, 0, 1) }, { transform: c.T(0, -34, 0, 1, 1.08) }, { transform: c.T(0, -6, 0, 1.06, 0.92) },
          { transform: c.T(0, -30, 0, 1, 1.06) }, { transform: c.T(0, -6, 0, 1) }
        ], 900, "ease-in-out");
      });
    });
  };

  V.ko = function (c) {
    var m = c.m;
    c.face("spiral", "o");
    var orbit = c.place(m, 0, -102);
    var i, j;
    for (i = 0; i < 5; i++) {
      var sg = c.star(orbit, 0, 0, 13, "#ffd23f");
      var fr = [];
      for (j = 0; j <= 20; j++) {
        var an = (i * 72 + j * 18) * Math.PI / 180;
        var depth = 0.75 + 0.25 * Math.sin(an);
        fr.push({ transform: c.T(Math.cos(an) * 66, Math.sin(an) * 20, j * 18, depth), offset: j / 20 });
      }
      c.loop(sg, fr, 1500, "linear", 0, "normal");
    }
    var glove = c.place(c.world, 420, 215);
    c.el("circle", { r: 40, fill: "#e5322d", stroke: "#7d1511", "stroke-width": 4 }, glove);
    c.el("rect", { x: 30, y: -24, width: 40, height: 48, rx: 8, fill: "#fff", stroke: "#7d1511", "stroke-width": 4 }, glove);
    c.el("path", { d: "M-24 -14 q10 -16 28 -6", fill: "none", stroke: "rgba(255,255,255,.7)", "stroke-width": 6, "stroke-linecap": "round" }, glove);
    return c.A(glove, [{ transform: c.T(60, 0, 0, 1), opacity: 0 }, { transform: c.T(-96, 0, 0, 1), opacity: 1, offset: 0.7 }, { transform: c.T(-118, 0, 0, 1), opacity: 1 }], 260, "ease-in").then(function () {
      c.A(c.world, [{ transform: c.T(0, 0) }, { transform: c.T(-8, 2) }, { transform: c.T(8, -3) }, { transform: c.T(0, 0) }], 220, "linear");
      c.spark(300, 215, 10, ["#fff", "#ffd23f", "#ff5a3c"], 110);
      c.label("POW!", 330, 150, 46, "#ff5a3c", 10);
      c.A(glove, [{ transform: c.T(-118, 0, 0, 1), opacity: 1 }, { transform: c.T(70, 0, 0, 1), opacity: 0 }], 500, "ease-in", 220);
      return c.A(m, [
        { transform: c.T(0, 0, 0, 1) }, { transform: c.T(-60, -10, -30, 1, 1) }, { transform: c.T(-30, 30, -50, 1) },
        { transform: c.T(-70, 160, -100, 1) }
      ], 900, "cubic-bezier(.3,.2,.6,1)");
    }).then(function () {
      return c.A(m, [{ transform: c.T(-70, 160, -100, 1) }, { transform: c.T(-80, 130, -108, 1) }, { transform: c.T(-70, 160, -100, 1) }], 300);
    }).then(function () {
      c.label("K.O.!", 200, 180, 96, "#ffd23f", -6);
      var n = 0;
      function count() {
        n += 1;
        if (n > 5) return c.wait(300);
        c.label(String(n), 200, 300, 44, "#fff", 0);
        return c.wait(380).then(count);
      }
      return count();
    });
  };

  V.melt = function (c) {
    var m = c.m;
    var cone = c.place(c.world, 200, 296);
    c.el("path", { d: "M-62 0 L62 0 L0 190 Z", fill: "#e0a458", stroke: OUT, "stroke-width": 4, "stroke-linejoin": "round" }, cone);
    c.el("path", { d: "M-40 0 L18 130 M-14 0 L34 100 M14 0 L-18 130 M38 0 L-34 100", fill: "none", stroke: "#b8792a", "stroke-width": 3 }, cone);
    c.A(cone, [{ transform: c.T(0, 260, 0, 1), opacity: 0 }, { transform: c.T(0, 0, 0, 1), opacity: 1 }], 520, "ease-out");
    var pink = c.el("circle", { r: 89, fill: "#ffa6c4", stroke: "#c2587f", "stroke-width": 3, opacity: 0 }, c.skin);
    c.A(pink, [{ opacity: 0 }, { opacity: 1 }], 500);
    var cherry = c.place(m, 0, -92);
    c.el("circle", { cx: 0, cy: -8, r: 17, fill: "#d1203a", stroke: "#6e0f1f", "stroke-width": 3 }, cherry);
    c.el("path", { d: "M2 -22 q8 -22 24 -26", fill: "none", stroke: "#4a7a2a", "stroke-width": 4, "stroke-linecap": "round" }, cherry);
    c.A(cherry, [{ transform: c.T(0, -80, 0, 1), opacity: 0 }, { transform: c.T(0, 0, 0, 1), opacity: 1 }], 400, "ease-in", 500);
    c.face("wide", "smile");
    return c.A(m, [{ transform: c.T(0, 0, 0, 1) }, { transform: c.T(0, 4, 0, 1) }], 1000, "linear").then(function () {
      c.label("hot out here...", 200, 80, 34, "#fff", 0);
      c.face("wide", "frown");
      var drips = [[-70, 296, 90], [-34, 300, 150], [8, 302, 110], [44, 298, 170], [74, 292, 100]];
      drips.forEach(function (d, k) {
        var g = c.place(c.world, 200 + d[0] * 0.9, d[1] - 10);
        c.el("rect", { x: -9, y: 0, width: 18, height: d[2], rx: 9, fill: "#ffa6c4", stroke: "#c2587f", "stroke-width": 3 }, g);
        c.el("circle", { cx: 0, cy: d[2], r: 13, fill: "#ffa6c4", stroke: "#c2587f", "stroke-width": 3 }, g);
        c.A(g, [{ transform: c.T(0, 0, 0, 1, 0.05), opacity: 1 }, { transform: c.T(0, 0, 0, 1, 1), opacity: 1 }], 900 + k * 120, "ease-in", k * 120);
      });
      var puddle = c.place(c.world, 200, 492);
      c.el("ellipse", { rx: 150, ry: 26, fill: "#ffa6c4", stroke: "#c2587f", "stroke-width": 3 }, puddle);
      c.A(puddle, [{ transform: c.T(0, 0, 0, 0.05, 0.05), opacity: 0 }, { transform: c.T(0, 0, 0, 1, 1), opacity: 1 }], 1500, "ease-in", 700);
      c.A(cone, [{ transform: c.T(0, 0, 0, 1) }, { transform: c.T(10, 20, 14, 1) }, { transform: c.T(60, 160, 40, 1), opacity: 1 }], 1400, "ease-in", 900);
      c.A(cherry, [{ transform: c.T(0, 0, 0, 1) }, { transform: c.T(90, 330, 200, 1) }], 1300, "ease-in", 900);
      return c.A(m, [
        { transform: c.T(0, 0, 0, 1, 1) }, { transform: c.T(0, 36, 0, 1.12, 0.62) }, { transform: c.T(0, 120, 0, 1.4, 0.4) }, { transform: c.T(0, 214, 0, 1.7, 0.22) }
      ], 1800, "ease-in");
    }).then(function () {
      c.label("sluuurp", 200, 430, 32, "#fff", 0);
      return c.wait(400);
    });
  };

  V.shatter = function (c) {
    var m = c.m;
    var glass = c.el("circle", { r: 89, fill: "rgba(150,215,255,.62)", stroke: "#d6f1ff", "stroke-width": 4, opacity: 0 }, c.skin);
    c.el("path", { d: "M-60 -30 A68 68 0 0 1 -20 -62", fill: "none", stroke: "rgba(255,255,255,.9)", "stroke-width": 7, "stroke-linecap": "round" }, c.skin);
    c.A(glass, [{ opacity: 0 }, { opacity: 1 }], 350);
    c.face("wide", "o");
    var cg = c.el("g", { "clip-path": "url(#clipMoon)" }, m);
    var ends = [[-140, -60], [-110, 90], [-40, 150], [60, 140], [140, 40], [130, -90], [30, -140], [-60, -130], [-150, 20]];
    var paths = ends.map(function (e) {
      var p = c.el("path", { d: "M-43 79 L" + e[0] + " " + e[1] + " M" + (e[0] * 0.5 - 20) + " " + (e[1] * 0.5 + 30) + " l12 -18", fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", "stroke-dasharray": "260", "stroke-dashoffset": "260" }, cg);
      return p;
    });
    return c.wait(350).then(function () {
      paths.forEach(function (p, k) { c.A(p, [{ strokeDashoffset: 260 }, { strokeDashoffset: 0 }], 360, "ease-out", k * 40); });
      return c.wait(900);
    }).then(function () {
      c.A(m, [{ transform: c.T(0, 0, 0, 1) }, { transform: c.T(3, 0, 1, 1) }, { transform: c.T(-3, 0, -1, 1) }, { transform: c.T(3, 0, 1, 1) }], 260, "linear");
      return c.wait(260);
    }).then(function () {
      var frags = c.shards([34, 62, 90], 9, function (ri, w) { return ["rgba(190,232,255,.85)", "rgba(150,215,255,.78)", "rgba(120,195,245,.82)"][(ri + w) % 3]; });
      c.hideMoon();
      c.label("CRASH!", 200, 100, 60, "#bdeaff", -5);
      c.spark(200, 210, 14, ["#fff", "#bdeaff"], 200);
      frags.forEach(function (f) {
        var rad = f.a * Math.PI / 180;
        c.A(f.g, [
          { transform: c.T(0, 0, 0, 1), opacity: 1 },
          { transform: c.T(Math.cos(rad) * (30 + f.ri * 24), Math.sin(rad) * (20 + f.ri * 14) + 10, c.rnd(-20, 20), 1), opacity: 1, offset: 0.22 },
          { transform: c.T(Math.cos(rad) * (60 + f.ri * 40), 330 + c.rnd(0, 120), c.rnd(-260, 260), 1), opacity: 0 }
        ], 1500, "cubic-bezier(.3,.1,.9,.8)", f.ri * 30 + c.rnd(0, 120));
      });
      return c.wait(1500);
    });
  };

  V.disco = function (c) {
    var m = c.m;
    var beams = c.place(c.moonPos, 0, 0);
    c.behindMoon(beams.parentNode);
    var cols = ["#ff4f9a", "#35d0ff", "#ffe14d", "#7dff6a", "#b86bff", "#ff8a3d"];
    cols.forEach(function (col, k) {
      var a = k * 60;
      c.el("path", { d: "M0 0 L" + (Math.cos((a - 8) * Math.PI / 180) * 420).toFixed(0) + " " + (Math.sin((a - 8) * Math.PI / 180) * 420).toFixed(0) + " L" + (Math.cos((a + 8) * Math.PI / 180) * 420).toFixed(0) + " " + (Math.sin((a + 8) * Math.PI / 180) * 420).toFixed(0) + " Z", fill: col, opacity: 0.38 }, beams);
    });
    var wire = c.el("path", { d: "M0 -90 L0 -330", stroke: "#9aa3b2", "stroke-width": 4 }, c.moonPos);
    c.behindMoon(wire);
    c.A(beams, [{ opacity: 0 }, { opacity: 1 }], 500);
    c.loop(beams, [{ transform: c.T(0, 0, 0) }, { transform: c.T(0, 0, 90) }], 2200, "linear");
    var clipG = c.el("g", { "clip-path": "url(#clipMoon)" }, c.skin);
    var tilesG = c.el("g", {}, clipG);
    var tr = c.el("rect", { x: -160, y: -160, width: 320, height: 320, fill: "url(#tiles)" }, tilesG);
    c.A(tilesG, [{ opacity: 0 }, { opacity: 1 }], 500);
    c.loop(tilesG, [{ transform: c.T(0, 0, -25) }, { transform: c.T(0, 0, 25) }], 1100, "ease-in-out");
    c.el("ellipse", { cx: -30, cy: -44, rx: 34, ry: 18, fill: "rgba(255,255,255,.55)", transform: "rotate(-30 -30 -44)" }, c.skin);
    c.face("happy", "open");
    var dim = c.sky;
    c.A(dim, [{ filter: "brightness(1)" }, { filter: "brightness(.45)" }], 600);
    var k;
    for (k = 0; k < 12; k++) {
      var sp = c.place(c.moonPos, c.rnd(-150, 150), c.rnd(-150, 150));
      c.el("polygon", { points: starPoints(c.rnd(8, 15), 4, 0.25), fill: "#fff" }, sp);
      c.loop(sp, [{ transform: c.T(0, 0, 0, 0.1), opacity: 0.2 }, { transform: c.T(0, 0, 45, 1.2), opacity: 1 }], c.rnd(260, 520), "ease-in-out", c.rnd(0, 400));
    }
    [[-140, -40], [150, -10], [-120, 120], [135, 100]].forEach(function (p, i) {
      var nt = c.place(c.moonPos, p[0], p[1]);
      c.el("ellipse", { cx: 0, cy: 0, rx: 9, ry: 7, fill: "#fff", transform: "rotate(-20)" }, nt);
      c.el("path", { d: "M8 -2 L8 -34 q10 4 14 14", fill: "none", stroke: "#fff", "stroke-width": 4, "stroke-linecap": "round" }, nt);
      c.A(nt, [{ transform: c.T(0, 20, 0, 0.6), opacity: 0 }, { transform: c.T(0, -30, 10, 1), opacity: 1, offset: 0.4 }, { transform: c.T(0, -90, -10, 1), opacity: 0 }], 1300, "ease-out", i * 350, 2);
    });
    c.label("DANCE!", 200, 80, 56, "#ffe14d", -4);
    c.loop(m, [{ transform: c.T(0, -16, -6, 1.02, 0.98) }, { transform: c.T(0, 4, 6, 0.98, 1.02) }], 340, "ease-in-out");
    return c.wait(2800);
  };

  V.flee = function (c) {
    var m = c.m;
    c.face("wide", "o");
    var holes = c.el("g", {}, c.skin);
    [[-40, 10, 7], [-14, -42, 6], [30, -20, 7], [48, 34, 6], [-50, 52, 6], [8, 62, 7]].forEach(function (h) {
      c.el("circle", { cx: h[0], cy: h[1], r: h[2] + 3, fill: "#d8cd9f", stroke: OUT, "stroke-width": 2 }, holes);
      c.el("circle", { cx: h[0], cy: h[1], r: h[2], fill: "#1b1a17" }, holes);
    });
    var legs = [];
    [-30, 30].forEach(function (x) {
      var l = c.place(m, x, 84);
      c.el("path", { d: "M0 0 L0 38", stroke: OUT, "stroke-width": 9, "stroke-linecap": "round" }, l);
      c.el("ellipse", { cx: 8, cy: 42, rx: 16, ry: 8, fill: "#e5322d", stroke: "#7d1511", "stroke-width": 3 }, l);
      c.A(l, [{ transform: c.T(0, 0, 0, 0, 0) }, { transform: c.T(0, 0, 0, 1, 1) }], 240, "ease-out");
      legs.push(l);
    });
    var sw = c.place(m, 74, -60);
    c.el("path", { d: "M0 -14 q-12 18 0 26 q12 -8 0 -26", fill: "#7fd2ff", stroke: "#2a7aa8", "stroke-width": 2.5 }, sw);
    c.loop(sw, [{ transform: c.T(0, -6, 0, 1), opacity: 1 }, { transform: c.T(10, 26, 0, 0.8), opacity: 0.2 }], 380, "ease-in");
    c.label("EEEEEK!", 200, 90, 50, "#ffd23f", -5);
    return c.wait(450).then(function () {
      return c.A(m, [{ transform: c.T(0, 0, 0, 1) }, { transform: c.T(0, 120, 0, 1, 1), offset: 1 }], 380, "ease-in");
    }).then(function () {
      var pts = [];
      var n = 12, i;
      for (i = 0; i <= n; i++) pts.push({ transform: c.T(i * 46, 120 - (i % 2 ? 26 : 0), (i % 2 ? 6 : -4), 1, 1), offset: i / n });
      for (i = 0; i < 7; i++) c.puff(150 + i * 70, 480, 2, "#d8cfb2", 40);
      legs.forEach(function (l, k) {
        c.loop(l, [{ transform: c.T(0, 0, 38, 1) }, { transform: c.T(0, 0, -38, 1) }], 130, "ease-in-out", k * 130);
      });
      return c.A(m, pts, 1500, "linear");
    });
  };

  V.pizza = function (c) {
    var m = c.m;
    c.face("wide", "o");
    return c.A(m, [{ transform: c.T(0, 0, 0, 1) }, { transform: c.T(0, -20, 180, 1.08) }, { transform: c.T(0, 0, 360, 0.001) }], 600, "ease-in").then(function () {
      c.hideMoon();
      var pizza = c.place(c.moonPos, 0, 0);
      var slices = [];
      var i;
      for (i = 0; i < 8; i++) {
        var a0 = i * 45, a1 = a0 + 45;
        var s = c.place(pizza, 0, 0);
        c.el("path", { d: wedgePath(0, 90, a0, a1), fill: "#e0a458", stroke: OUT, "stroke-width": 3, "stroke-linejoin": "round" }, s);
        c.el("path", { d: wedgePath(0, 76, a0 + 1, a1 - 1), fill: "#ffd45e" }, s);
        var mid = (a0 + a1) / 2 * Math.PI / 180;
        c.el("circle", { cx: Math.cos(mid) * 48, cy: Math.sin(mid) * 48, r: 11, fill: "#d1403b", stroke: "#7b1b17", "stroke-width": 2 }, s);
        c.el("circle", { cx: Math.cos(mid + 0.12) * 66, cy: Math.sin(mid + 0.12) * 66, r: 5, fill: "#4fae3f" }, s);
        slices.push({ g: s, a: mid });
      }
      c.A(pizza, [{ transform: c.T(0, 0, -360, 0.1), opacity: 0 }, { transform: c.T(0, -60, -180, 1.1), opacity: 1, offset: 0.55 }, { transform: c.T(0, 0, 0, 1), opacity: 1 }], 900, "ease-out");
      c.label("Pizza night!", 200, 90, 50, "#ffd23f", -4);
      return c.wait(1200).then(function () {
        var order = [0, 4, 2, 6, 1, 5];
        order.forEach(function (idx, k) {
          var f = slices[idx];
          c.A(f.g, [
            { transform: c.T(0, 0, 0, 1), opacity: 1 },
            { transform: c.T(Math.cos(f.a) * 40, Math.sin(f.a) * 40 - 20, 0, 1.08), opacity: 1, offset: 0.35 },
            { transform: c.T(Math.cos(f.a) * 190, Math.sin(f.a) * 190 - 40, c.rnd(-40, 40), 0.8), opacity: 0 }
          ], 650, "ease-in", k * 300);
          c.puff(200 + Math.cos(f.a) * 110, 210 + Math.sin(f.a) * 110, 1, "#fff", 30);
        });
        return c.wait(2100);
      }).then(function () {
        c.label("yum!", 200, 400, 46, "#fff", 0);
        return c.wait(300);
      });
    });
  };

  V.flag = function (c) {
    var m = c.m;
    c.face("wide", "frown");
    var arm = c.place(m, 86, 12);
    c.el("path", { d: "M0 0 L44 -48", stroke: OUT, "stroke-width": 14, "stroke-linecap": "round" }, arm);
    c.el("path", { d: "M0 0 L44 -48", stroke: "#f2e9c5", "stroke-width": 8, "stroke-linecap": "round" }, arm);
    c.el("circle", { cx: 46, cy: -50, r: 11, fill: "#f2e9c5", stroke: OUT, "stroke-width": 3 }, arm);
    var pole = c.place(arm, 46, -50);
    c.el("path", { d: "M0 10 L0 -120", stroke: "#8a5a2b", "stroke-width": 6, "stroke-linecap": "round" }, pole);
    var cloth = c.place(pole, 0, -116);
    c.el("path", { d: "M0 0 q24 -12 48 0 t48 0 v46 q-24 12 -48 0 t-48 0 z", fill: "#fff", stroke: OUT, "stroke-width": 3, "stroke-linejoin": "round" }, cloth);
    c.A(arm, [{ transform: c.T(0, 30, 0, 0.1), opacity: 0 }, { transform: c.T(0, 0, 0, 1), opacity: 1 }], 480, "cubic-bezier(.2,1.4,.4,1)");
    c.loop(pole, [{ transform: c.T(0, 0, -14) }, { transform: c.T(0, 0, 14) }], 320, "ease-in-out", 400);
    c.loop(cloth, [{ transform: c.T(0, 0, -6, 1, 1) }, { transform: c.T(0, 0, 8, 0.86, 1.04) }], 180, "ease-in-out", 400);
    var sweat = c.place(m, -70, -50);
    c.el("path", { d: "M0 -14 q-12 18 0 26 q12 -8 0 -26", fill: "#7fd2ff", stroke: "#2a7aa8", "stroke-width": 2.5 }, sweat);
    c.loop(sweat, [{ transform: c.T(0, -6, 0, 1), opacity: 1 }, { transform: c.T(-8, 30, 0, 0.8), opacity: 0.2 }], 420, "ease-in");
    c.loop(m, [{ transform: c.T(0, 0, -2, 1) }, { transform: c.T(0, 4, 2, 1) }], 600, "ease-in-out");
    var bub = c.place(c.world, 118, 140);
    c.el("path", { d: "M-84 -24 h168 a14 14 0 0 1 14 14 v26 a14 14 0 0 1 -14 14 h-110 l-24 22 l6 -22 h-40 a14 14 0 0 1 -14 -14 v-26 a14 14 0 0 1 14 -14 z", fill: "#fff", stroke: OUT, "stroke-width": 3, transform: "translate(0,0) scale(.9)" }, bub);
    var t = c.el("text", { "text-anchor": "middle", y: 12, "font-size": 24, "font-weight": 900, "font-family": "system-ui,-apple-system,sans-serif", fill: "#1b1a17" }, bub);
    t.textContent = "I give up!";
    c.A(bub, [{ transform: c.T(0, 20, 0, 0), opacity: 0 }, { transform: c.T(0, 0, 0, 1.15), opacity: 1, offset: 0.7 }, { transform: c.T(0, 0, 0, 1), opacity: 1 }], 420, "ease-out", 600);
    return c.wait(2800);
  };

  V.pinata = function (c) {
    var m = c.m;
    var sw = c.place(c.moonPos, 0, -330);
    var inner = c.el("g", { transform: "translate(0,330)" }, sw);
    var rope = c.el("path", { d: "M0 -90 L0 -330", stroke: "#8a5a2b", "stroke-width": 5 }, inner);
    inner.appendChild(m);
    var clipG = c.el("g", { "clip-path": "url(#clipMoon)" }, c.skin);
    c.el("rect", { x: -100, y: -100, width: 200, height: 200, fill: "url(#stripes)", opacity: 0.95 }, clipG);
    var fringe = c.el("path", { d: "M-84 -10 q8 14 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0", fill: "none", stroke: "#ffd23f", "stroke-width": 7, "stroke-linecap": "round" }, c.skin);
    c.face("wide", "smile");
    var swingFrames = [-16, 16, -13, 13, -9, 9, -4, 0].map(function (a, k, arr) { return { transform: c.T(0, 0, a, 1), offset: k / (arr.length - 1) }; });
    return c.A(sw, swingFrames, 1500, "ease-in-out").then(function () {
      c.hideMoon();
      rope.style.display = "none";
      var cols = ["#ff4f81", "#ffd23f", "#2ec4b6", "#7dff6a", "#b86bff", "#ff8a3d"];
      var frags = c.shards([48, 90], 6, function (ri, w) { return cols[(w + ri * 2) % cols.length]; });
      var base = c.moonPos;
      frags.forEach(function (f) {
        var rad = f.a * Math.PI / 180;
        c.A(f.g, [
          { transform: c.T(0, 0, 0, 1), opacity: 1 },
          { transform: c.T(Math.cos(rad) * 90, Math.sin(rad) * 80 - 30, c.rnd(-120, 120), 1), opacity: 1, offset: 0.35 },
          { transform: c.T(Math.cos(rad) * 140, 360, c.rnd(-300, 300), 1), opacity: 0 }
        ], 1500, "ease-in");
      });
      var i;
      for (i = 0; i < 40; i++) {
        var g = c.place(c.moonPos, 0, 0);
        var col = c.pick(cols.concat(["#fff"]));
        if (i % 3 === 0) c.el("rect", { x: -7, y: -4, width: 14, height: 8, rx: 3, fill: col, stroke: "#1b1a17", "stroke-width": 1.5 }, g);
        else if (i % 3 === 1) c.el("circle", { r: 6, fill: col, stroke: "#1b1a17", "stroke-width": 1.5 }, g);
        else c.el("polygon", { points: "0,-8 7,0 0,8 -7,0", fill: col, stroke: "#1b1a17", "stroke-width": 1.5 }, g);
        var dx = c.rnd(-170, 170);
        c.A(g, [
          { transform: c.T(0, 0, 0, 1), opacity: 1 },
          { transform: c.T(dx * 0.6, c.rnd(-150, -60), c.rnd(-180, 180), 1), opacity: 1, offset: 0.35 },
          { transform: c.T(dx, c.rnd(230, 330), c.rnd(-400, 400), 1), opacity: 1 }
        ], c.rnd(1400, 2000), "cubic-bezier(.2,.6,.5,1)", c.rnd(0, 150));
      }
      c.puff(200, 210, 6, "#ffe6f0", 150);
      c.spark(200, 210, 12, cols, 220);
      c.label("CANDY!", 200, 90, 64, "#ffd23f", -5);
      return c.wait(2100);
    });
  };

  V.spinout = function (c) {
    var m = c.m;
    c.face("spiral", "o");
    var n = 30, frames = [], i, t, ang, rad;
    for (i = 0; i <= n; i++) {
      t = i / n;
      ang = t * 720 * Math.PI / 180;
      rad = 150 * (1 - t);
      frames.push({
        transform: c.T(Math.cos(ang) * rad - 150 * (1 - t) * 0 , Math.sin(ang) * rad * 0.7 + 150 * t, t * 1440, Math.max(0.01, 1 - t * 0.98)),
        offset: t
      });
    }
    for (i = 1; i <= 16; i++) {
      t = i / 18;
      ang = t * 720 * Math.PI / 180;
      rad = 150 * (1 - t);
      var s = c.star(c.moonPos, Math.cos(ang) * rad, Math.sin(ang) * rad * 0.7 + 150 * t, 12 * (1 - t) + 4, c.pick(["#ffd23f", "#fff", "#ff8ad1"]));
      c.A(s, [{ transform: c.T(0, 0, 0, 0), opacity: 0 }, { transform: c.T(0, 0, 90, 1), opacity: 1, offset: 0.3 }, { transform: c.T(0, 0, 200, 0), opacity: 0 }], 600, "ease-out", t * 1900);
    }
    c.label("WHEEEE!", 200, 90, 54, "#ff8ad1", -4);
    return c.A(m, frames, 2100, "ease-in").then(function () {
      c.puff(200, 360, 6, "#fff", 80);
      c.spark(200, 360, 12, ["#ffd23f", "#fff", "#ff8ad1"], 150);
      c.label("poof!", 200, 440, 46, "#fff", 0);
      return c.wait(500);
    });
  };

  root.HeartsMoon = { VARIANTS: VARIANTS, play: play };
})(typeof window !== "undefined" ? window : this);
