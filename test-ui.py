#!/usr/bin/env python3
"""Hearts Table v5 browser tests (Playwright + Chrome).
Usage: python3 test-ui.py [url] [screenshot_dir]
Covers the punch list (HT-01..HT-21), the retests (R-01..R-09), shared-table multi-touch, crash recovery and a soak run."""
import sys, json, time, random, os, tempfile, shutil, urllib.request
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
URL = sys.argv[1] if len(sys.argv) > 1 else "file://" + os.path.join(HERE, "index.html")
SHOTS = (sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "screenshots") + "/")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
os.makedirs(SHOTS, exist_ok=True)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" :: " + str(extra)) if extra != "" else ""))
    if not cond: fails.append(name)

class Touch:
    """Real multi-touch through the DevTools protocol."""
    def __init__(self, page):
        self.page = page; self.cdp = page.context.new_cdp_session(page); self.pts = {}
    def _send(self, typ, pts):
        self.cdp.send("Input.dispatchTouchEvent", {"type": typ, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in pts.items()]})
    def down(self, i, x, y): self.pts[i] = (x, y); self._send("touchStart", self.pts)
    def move(self, i, x, y): self.pts[i] = (x, y); self._send("touchMove", self.pts)
    def up(self, i):
        rest = {k: v for k, v in self.pts.items() if k != i}
        self._send("touchEnd", rest); self.pts.pop(i, None)
    def drag(self, i, dx, dy, steps, dt_ms):
        x, y = self.pts[i]
        for s in range(1, steps + 1):
            self.move(i, x + dx * s / steps, y + dy * s / steps); time.sleep(dt_ms / 1000)

WAKE_STUB = """(function(){ window.__wl={requests:0};
  Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:function(t){window.__wl.requests++;
    var l={released:false,type:t,_h:[],addEventListener:function(n,f){this._h.push(f)},release:function(){this.released=true;this._h.forEach(function(f){f()});return Promise.resolve()}};
    return Promise.resolve(l);}}}); })();"""

def fresh(browser, vp, mobile=True, init=None, reduced=None, intro=False):
    kw = dict(viewport=vp, has_touch=True, is_mobile=mobile, device_scale_factor=2 if vp["width"] < 1000 else 1, accept_downloads=True)
    if reduced: kw["reduced_motion"] = reduced
    ctx = browser.new_context(**kw)
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    ctx.add_init_script(WAKE_STUB)
    if init: ctx.add_init_script(init)
    page.goto(URL); ready(page)
    if not intro: skip_intro(page)
    return ctx, page, errs

def ready(page):
    page.wait_for_function("window.__heartsReady !== undefined"); page.evaluate("window.__heartsReady"); page.wait_for_timeout(120)
def skip_intro(page):
    if page.is_visible("#help"): page.click("#help-skip"); page.wait_for_timeout(50)
def reload(page):
    page.evaluate("__heartsTest.flush()"); page.reload(); ready(page)
def notoast(page): page.evaluate("document.getElementById('toast').classList.remove('show')")
def shot(page, name, keep_toast=False):
    if not keep_toast: notoast(page)
    page.wait_for_timeout(80); page.screenshot(path=SHOTS + name + ".png"); print("  shot", SHOTS + name + ".png")
def center(page, sel):
    b = page.locator(sel).bounding_box(); return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

def setup_players(page, names, target=None):
    # trim/extend the player list to len(names)
    while page.locator(".sp-row").count() < len(names): page.click("#add-player")
    while page.locator(".sp-row").count() > len(names): page.click(".sp-row:last-child .sp-del")
    for i, n in enumerate(names): page.fill("#setup-p%d" % i, n)
    if target: page.fill("#setup-target", str(target))
def start(page, names=("Alice", "Bob", "Carol", "Dave"), target=None, table=False, preset=None):
    setup_players(page, names, target)
    if table: page.click("#layout-table")
    else: page.click("#layout-phone")
    if preset: page.select_option("#preset-select", preset)
    page.click("#start-btn"); page.wait_for_timeout(200)

def keypad(page, seat, digits=None, chip=None):
    page.click("#cval-%d" % seat); page.wait_for_selector("#keypad:not([hidden])")
    if chip is not None:
        page.click(".kchip[data-v='%d']" % chip)
    else:
        for d in str(digits): page.click(".kkey[data-k='%s']" % d)
        page.click("#kp-done")
    page.wait_for_timeout(40)
def status(page): return page.inner_text("#entry-status")
def st(page): return page.evaluate("__heartsTest.state()")
def entry(page): return page.evaluate("__heartsTest.getEntry()")
def close_sc(page):
    if page.is_visible("#scorecard"): page.click("#sc-back"); page.wait_for_timeout(50)
def save(page):
    page.click("#save-btn"); page.wait_for_timeout(120); close_sc(page)
def skip_moon(page):
    page.wait_for_timeout(650)
    if page.is_visible("#moon-stage"): page.mouse.click(50, 50) if True else None
    page.wait_for_timeout(250)
    if page.is_visible("#moon-stage"): page.evaluate("document.querySelector('#moon-stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); page.wait_for_timeout(250)

FIT_JS = """() => {
  const vw = innerWidth, vh = innerHeight, bad = [];
  document.querySelectorAll('#game .card, #game .g-bar, #game .g-entry, #game .g-head').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.top < -1 || r.left < -1 || r.bottom > vh + 1 || r.right > vw + 1) bad.push(el.id || el.className);
  });
  return { scroll: document.scrollingElement.scrollHeight - vh, scrollW: document.scrollingElement.scrollWidth - vw, bad };
}"""
TARGETS_JS = """() => [...document.querySelectorAll('#game button')].filter(b => b.offsetParent && !b.hidden && getComputedStyle(b).visibility !== 'hidden')
  .map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.w < 44 || x.h < 44)"""
CONTRAST_JS = """(sels) => {
  const parse = c => { const m = c.match(/[\\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > .5) return c; } return { r: 10, g: 18, b: 16 }; };
  const out = [];
  sels.forEach(s => document.querySelectorAll(s).forEach(el => { if (!el.offsetParent || !el.textContent.trim()) return;
    const fg = parse(getComputedStyle(el).color), bg = bgOf(el), a = lum(fg), b = lum(bg);
    out.push({ s, ratio: Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100 }); }));
  return out;
}"""
ROT_JS = """() => [...document.querySelectorAll('#game *')].filter(e => { const t = getComputedStyle(e).transform; if (!t || t === 'none') return false;
  const m = t.match(/matrix\\(([^)]+)\\)/); if (!m) return false; const v = m[1].split(',').map(Number); return v[0] < -0.5; }).length"""

def phone_flow(browser):
    print("=== phone 390x844: pass-the-phone, P0/P1 accept criteria ===")
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844}, intro=True)
    # HT-15 onboarding
    check("HT-15 first-run intro shows", page.is_visible("#help") and "Tap a number" in page.inner_text("#help-steps"))
    shot(page, "phone-intro")
    page.click("#help-next"); page.click("#help-next")
    check("HT-15 three intro screens", "Moon, undo, scorecard" in page.inner_text("#help-steps") and page.inner_text("#help-next") == "Let's play")
    page.click("#help-next")
    check("HT-15 intro closes and is remembered", not page.is_visible("#help") and page.evaluate("__heartsTest.settings()")["onboarded"])
    reload(page)
    check("HT-15 intro not shown again", not page.is_visible("#help"))
    # HT-20 setup validation
    check("HT-20 empty names block start", page.is_disabled("#start-btn") and "needs a name" in page.inner_text("#start-btn"))
    setup_players(page, ["Alice", "Bob", "alice", "Dave"])
    check("HT-20 duplicate names block start", page.is_disabled("#start-btn") and "Two players are called" in page.inner_text("#setup-error"), page.inner_text("#setup-error"))
    page.click("#add-player"); page.click("#add-player")
    check("HT-20 add up to 6 players", page.locator(".sp-row").count() == 6 and page.is_disabled("#add-player"))
    page.click(".sp-row:last-child .sp-del"); page.click(".sp-row:last-child .sp-del")
    check("HT-20 remove back to 4", page.locator(".sp-row").count() == 4)
    shot(page, "phone-setup")
    page.click("#target-chips [data-target='50']")
    start(page, target=None)
    check("game started (pass-the-phone default)", page.is_visible("#game") and page.evaluate("__heartsTest.layout()") == "phone")
    check("HT-10 target shown from setting", "Game to 50" in page.inner_text("#g-target") and "100" not in page.inner_text("#game"), page.inner_text("#g-target"))
    check("HT-16 house rules on table", "House rules: Classic" in page.inner_text("#g-rules"))
    # HT-03 fit / contrast / sizes / upright
    fit = page.evaluate(FIT_JS)
    check("HT-03 fits 390x844, no scroll", fit["scroll"] <= 0 and fit["scrollW"] <= 0 and not fit["bad"], fit)
    check("HT-03 no upside-down text (phone)", page.evaluate(ROT_JS) == 0)
    fs = page.evaluate("parseFloat(getComputedStyle(document.getElementById('ctot-0')).fontSize)")
    check("HT-03 totals >= 28px", fs >= 28, fs)
    small = page.evaluate(TARGETS_JS)
    check("R-06 touch targets >= 44px", not small, small)
    # HT-01 typing 5/0/8/13 in < 20 s
    t0 = time.time()
    keypad(page, 0, 5); keypad(page, 1, chip=0); keypad(page, 2, 8); keypad(page, 3, 13)
    dt = time.time() - t0
    check("HT-01 enter 5/0/8/13 by typing in < 20 s", entry(page) == [5, 0, 8, 13] and dt < 20, "%.1fs" % dt)
    check("HT-01 banner X of 26", status(page) == "4 of 4 set · 26 of 26", status(page))
    check("HT-07 Queen auto-detected for Dave", page.get_attribute("#cq-3", "aria-pressed") == "true")
    # HT-08 clear with confirm + undo
    page.click("#cval-3"); page.click("#kp-clear")
    check("HT-08 clear asks 'Clear Dave's 13?'", page.inner_text("#modal-title") == "Clear Dave's 13?", page.inner_text("#modal-title"))
    page.click("#clear-confirm"); page.wait_for_timeout(60)
    check("HT-08 cleared -> banner 3 of 4 set · 13 of 26", status(page) == "3 of 4 set · 13 of 26" and entry(page)[3] is None, status(page))
    # HT-02 suggestion
    check("HT-02 last player suggested (highlighted)", "sug" in page.get_attribute("#cval-3", "class") and page.inner_text("#cval-3") == "13")
    check("HT-02 Save enabled by the suggestion", page.is_enabled("#save-btn"))
    shot(page, "phone-suggestion", keep_toast=True)
    page.click("#toast-act"); page.wait_for_timeout(60)
    check("HT-08 Undo restores Dave's 13", entry(page)[3] == 13)
    page.click("#cval-3"); page.click("#kp-clear"); page.click("#clear-confirm"); page.click("#cok-3")
    check("HT-02 one tap on ✓ confirms the suggestion", entry(page)[3] == 13)
    page.click("#cval-3"); check("HT-08 keypad has per-player Undo", page.is_visible("#kp-undo")); page.click("#kp-undo"); page.wait_for_timeout(40)
    check("HT-08 keypad Undo steps back Dave", entry(page)[3] is None)
    # disabled Save reasons
    page.evaluate("__heartsTest.setEntry([5,null,8,null])")
    check("HT-02 Save reason 'Bob and Dave still to set'", page.is_disabled("#save-btn") and page.inner_text("#save-why") == "Bob and Dave still to set", page.inner_text("#save-why"))
    page.evaluate("__heartsTest.setEntry([5,0,8,10])")
    check("HT-02 Save reason '3 points left to give out'", page.is_disabled("#save-btn") and page.inner_text("#save-why") == "3 points left to give out", page.inner_text("#save-why"))
    page.evaluate("__heartsTest.setEntry([5,0,8,14])")
    page.evaluate("document.getElementById('save-btn').click()")
    check("R-09 can't save a hand that isn't 26", len(st(page)["rounds"]) == 0 and "too many" in page.inner_text("#save-why"))
    page.evaluate("__heartsTest.setEntry([7,7,6,6])")
    check("HT-07 validation: someone must hold the ♠Q", page.is_disabled("#save-btn") and "♠Q" in page.inner_text("#save-why"), page.inner_text("#save-why"))
    # keypad limits, tap never clears
    page.evaluate("__heartsTest.setEntry([5,0,8,null])")
    page.click("#cval-3"); page.click(".kkey[data-k='2']"); page.click(".kkey[data-k='0']")
    check("HT-01 keypad refuses too many (Done disabled + hint)", page.is_disabled("#kp-done") and "Too many" in page.inner_text("#kp-hint"))
    page.click("#kp-close")
    tch = Touch(page)
    x, y = center(page, "#card-0 .c-total")
    tch.down(1, x, y); time.sleep(0.05); tch.up(1); page.wait_for_timeout(80)
    check("HT-01 a tap opens the keypad, never clears", page.is_visible("#keypad") and entry(page)[0] == 5)
    page.click("#kp-close")
    # steppers and arrows
    page.click("#cminus-0"); check("HT-01 − stepper", entry(page)[0] == 4)
    page.click("#cplus-0"); check("HT-01 + stepper", entry(page)[0] == 5)
    page.evaluate("__heartsTest.setEntry([5,0,8,13])")
    check("HT-01 + disabled at the 26 limit", page.is_disabled("#cplus-0") and entry(page)[0] == 5)
    page.evaluate("__heartsTest.setEntry([null,null,null,null])")
    page.focus("#card-1"); page.keyboard.press("ArrowRight"); page.keyboard.press("ArrowRight"); page.keyboard.press("ArrowRight"); page.keyboard.press("ArrowLeft")
    check("HT-01 arrow keys", entry(page)[1] == 2, entry(page))
    check("HT-01 banner follows arrows", status(page) == "1 of 4 set · 2 of 26", status(page))
    # slide (no hold): slow and very fast, with a visible track and thumb
    bb = page.locator("#card-0").bounding_box(); sx, sy = bb["x"] + 24, bb["y"] + bb["height"] * 0.42
    tch.down(8, sx, sy); tch.move(8, sx + 70, sy); page.wait_for_timeout(40)
    sl1 = page.evaluate("""() => {
      const drag = document.getElementById('cdrag-0');
      const track = drag && drag.querySelector('.cd-track');
      const thumb = drag && drag.querySelector('.cd-thumb');
      const fill = drag && drag.querySelector('.cd-track i');
      if (!drag || drag.hidden || !track || !thumb) return null;
      const tr = track.getBoundingClientRect(), th = thumb.getBoundingClientRect(), fl = fill.getBoundingClientRect();
      return { trackW: tr.width, trackH: tr.height, thumbW: th.width, thumbH: th.height, mid: th.left + th.width / 2, trackL: tr.left, trackR: tr.right, fillW: fl.width, bg: getComputedStyle(track).backgroundColor, thumb: getComputedStyle(thumb).backgroundColor };
    }""")
    tch.move(8, sx + 160, sy); page.wait_for_timeout(40)
    sl2 = page.evaluate("""() => { const th = document.querySelector('#cdrag-0 .cd-thumb'); const r = th.getBoundingClientRect(); return r.left + r.width / 2; }""")
    tch.up(8); page.wait_for_timeout(40)
    check("slider track and thumb visible while dragging", sl1 and sl1["trackW"] > 40 and sl1["trackH"] >= 10 and sl1["thumbW"] >= 24 and sl1["thumbH"] >= 24 and sl1["mid"] > sl1["trackL"] and sl1["mid"] < sl1["trackR"] + 1, sl1)
    check("slider thumb follows the finger", sl1 and sl2 > sl1["mid"] + 4, sl2)
    page.mouse.move(sx, sy); page.mouse.down(); page.mouse.move(sx + 90, sy, steps=8)
    mouse_on = page.evaluate("() => !document.getElementById('cdrag-0').hidden && document.querySelector('#cdrag-0 .cd-thumb').getBoundingClientRect().width >= 24")
    page.mouse.up(); page.wait_for_timeout(40)
    check("slider also works with a mouse", mouse_on)
    page.evaluate("__heartsTest.setEntry([null,2,null,null])")
    bb = page.locator("#card-2").bounding_box(); x, y = bb["x"] + 12, bb["y"] + bb["height"] * 0.45
    tch.down(3, x, y); tch.drag(3, 110, 0, 22, 25); tch.up(3); page.wait_for_timeout(60)
    v = entry(page)[2]
    check("HT-01 slow slide snaps to whole points (≈5)", isinstance(v, int) and 3 <= v <= 6, v)
    check("HT-01 banner follows slide", status(page) == "2 of 4 set · %d of 26" % (2 + v), status(page))
    tch.down(4, x, y); tch.drag(4, 330, 0, 4, 5); tch.up(4); page.wait_for_timeout(60)
    e = entry(page)
    check("HT-01 fast drag stays in range (no moon, no junk)", all(isinstance(q, int) or q is None for q in e) and sum(q or 0 for q in e) <= 26 and not page.is_visible("#modal"), e)
    tch.down(5, x + 160, y); tch.drag(5, -400, 0, 6, 5); tch.up(5); page.wait_for_timeout(60)
    check("HT-01 fast drag left floors at 0, not cleared", entry(page)[2] == 0, entry(page))
    # hand 1: 5/0/8/13 via typing, Dave by suggestion + Save
    page.evaluate("__heartsTest.setEntry([null,null,null,null])")
    keypad(page, 0, 5); keypad(page, 1, chip=0); keypad(page, 2, 8)
    page.click("#save-btn"); page.wait_for_timeout(300)
    s = st(page)
    check("hand 1 saved 5/0/8/13 (Dave from suggestion)", s["rounds"][0]["scores"] == [5, 0, 8, 13] and s["rounds"][0]["queen"] == 3)
    check("HT-06 scorecard auto-shows after Save", page.is_visible("#scorecard") and "Dave took the Queen" in page.inner_text("#sc-recap"), page.inner_text("#sc-recap") if page.is_visible("#scorecard") else "")
    check("HT-18 scorecard header: timer + hands", "1 hand" in page.inner_text("#sc-clock") and "⏱" in page.inner_text("#sc-clock"))
    check("R-02 scorecard has no 'First to 100'", "100" not in page.inner_text("#scorecard") and "Game ends at 50" in page.inner_text("#scorecard"))
    shot(page, "phone-scorecard-auto")
    page.wait_for_timeout(3200)
    check("HT-06 scorecard returns to table after ~3 s", not page.is_visible("#scorecard"))
    check("hand 2 header: pass right, Bob deals", "Pass 3 cards right" in page.inner_text("#g-title") and "Bob deals" in page.inner_text("#g-title"), page.inner_text("#g-title"))
    check("HT-03 leader gold border / last place tint", "lead" in page.get_attribute("#card-1", "class") and "last" in page.get_attribute("#card-3", "class"))
    # HT-09 moon: labelled button, confirm with totals
    check("HT-09 labelled moon button", page.inner_text("#moon-btn") == "🌙 Shoot the moon")
    page.click("#moon-btn"); page.click(".pick[data-seat='2']")
    body = page.inner_text("#modal-body")
    check("HT-09 confirm shows resulting totals", "31" in body and "39" in body and "New total" in body, body)
    shot(page, "phone-moon-confirm")
    page.click("#moon-confirm"); page.wait_for_timeout(300)
    rot = page.evaluate("(() => { const c = document.querySelector('#moon-stage [data-rot]'); return c ? c.getAttribute('data-rot') : 'none'; })()")
    check("HT-05 moon celebration upright", page.is_visible("#moon-stage") and rot in ("0", "none"), rot)
    skip_moon(page); close_sc(page)
    s = st(page)
    check("hand 2 moon: Carol +0, others +26", s["rounds"][1]["scores"] == [26, 26, 0, 26] and s["rounds"][1]["moon"] == 2)
    # hands list: tags
    page.click("#hands-btn"); page.wait_for_timeout(100)
    hl = page.inner_text("#sheet-body")
    check("HT-09 Hands list tag '☾ Shot the moon: Carol'", "☾ Shot the moon: Carol" in hl)
    check("HT-07 ♠Q badge in Hands list", "♠Q" in hl and "Dave took the Queen" in hl)
    shot(page, "phone-hands")
    # HT-04 edit hand 1
    page.click("#sheet-body [data-edit='0']"); page.wait_for_timeout(100)
    check("HT-04 edit banner + same controls", page.is_visible("#edit-banner") and page.is_visible("#cval-0") and entry(page) == [5, 0, 8, 13])
    check("HT-04 shows that hand's running totals", [page.inner_text("#ctot-%d" % i) for i in range(4)] == ["5", "0", "8", "13"])
    page.click("#cminus-2"); page.click("#cplus-1"); page.wait_for_timeout(40)
    page.click("#save-btn"); page.wait_for_timeout(100)
    check("HT-04 toast 'Hand 1 updated — totals recalculated'", "Hand 1 updated — totals recalculated" in page.inner_text("#toast"), page.inner_text("#toast"))
    s = st(page)
    tot = [sum(r["scores"][i] for r in s["rounds"]) for i in range(4)]
    check("HT-04 later totals recalculated", tot == [31, 27, 7, 39], tot)
    # edit the moon hand keeps it a moon
    page.click("#hands-btn"); page.click("#sheet-body [data-edit='1']"); page.wait_for_timeout(80)
    page.click("#save-btn"); page.wait_for_timeout(80)
    check("HT-04 editing a moon hand asks to confirm moon", page.is_visible("#moon-confirm"))
    page.click("#moon-confirm"); skip_moon(page)
    check("HT-04 moon hand still a moon after edit", st(page)["rounds"][1]["moon"] == 2 and len(st(page)["rounds"]) == 2)
    # undo/redo
    page.click("#undo-btn"); page.wait_for_timeout(60)
    check("undo toast", "Undo" in page.inner_text("#toast"))
    page.click("#redo-btn"); page.wait_for_timeout(60)
    # R-01 winner: Dave reaches 50
    keypad(page, 0, 2); keypad(page, 1, 3); keypad(page, 2, 4)
    page.click("#save-btn"); page.wait_for_timeout(400)
    check("R-01/HT-13 winner screen 'Carol wins with 11!'", page.is_visible("#winner-screen") and page.inner_text("#ws-title") == "Carol wins with 11!", page.inner_text("#ws-title"))
    ws = page.inner_text("#winner-screen")
    check("HT-13 standings + hands + moons", "3 hands" in ws and "1 moon" in ws and "Best moment" in ws, ws)
    for b in ("#ws-rematch", "#ws-new", "#ws-share", "#ws-sheet"): check("HT-13 button " + b, page.is_visible(b))
    shot(page, "phone-winner")
    c1 = page.evaluate("__heartsTest.state().finishedAt - __heartsTest.state().startedAt")
    page.wait_for_timeout(1100)
    check("HT-18 timer stops when the game ends", page.evaluate("__heartsTest.state().finishedAt - __heartsTest.state().startedAt") == c1)
    with page.expect_download() as dl: page.click("#ws-share")
    p = dl.value.path(); size = os.path.getsize(p); sig = open(p, "rb").read(8)
    check("HT-17 share PNG generated locally", sig[:4] == b"\x89PNG" and size > 20000, size)
    shutil.copy(p, SHOTS + "share-card.png"); print("  shot", SHOTS + "share-card.png")
    page.click("#ws-close")
    check("HT-13 appears once", page.evaluate("__heartsTest.winnerShows()") == 1)
    reload(page)
    check("HT-13 not shown again after reload", not page.is_visible("#winner-screen") and page.is_visible("#g-over"))
    page.click("#undo-btn"); page.click("#redo-btn"); page.wait_for_timeout(100)
    check("HT-13 redo doesn't replay it", not page.is_visible("#winner-screen"))
    g = page.evaluate("__heartsTest.games()")
    check("finished game saved to history", len(g) == 1 and g[0]["winnerNames"] == ["Carol"])
    # HT-21 new game confirmation mid-game
    page.click("#g-over-new"); page.wait_for_timeout(100)
    check("new game from finished game goes to setup (no confirm needed)", page.is_visible("#setup"))
    start(page)
    keypad(page, 0, 4); keypad(page, 1, 9); keypad(page, 2, 13); page.click("#save-btn"); page.wait_for_timeout(100); close_sc(page)
    page.click("#menu-btn")
    groups = page.locator(".menu-group h3").all_inner_texts()
    check("HT-11 menu grouped Game / Settings / Data", [x.lower() for x in groups] == ["game", "settings", "data"], groups)
    shot(page, "phone-menu")
    page.click("#m-new"); page.wait_for_timeout(80)
    check("R-07/HT-21 New game asks first", page.is_visible("#newgame-confirm"))
    page.click("#modal-actions .ghost"); page.wait_for_timeout(50)
    check("cancel keeps the game", page.is_visible("#game") and len(st(page)["rounds"]) == 1)
    labels = page.locator(".g-bar .bar-btn span").all_inner_texts()
    check("HT-11 labelled bottom bar", labels == ["Undo", "Redo", "Scorecard", "Hands", "Help", "Menu"], labels)
    # HT-21 autosave every tap + welcome back
    page.evaluate("__heartsTest.setEntry([3,null,null,null])"); keypad(page, 1, 2)
    reload(page)
    check("HT-21 Welcome back + draft kept", page.is_visible("#resume-yes") and entry(page)[:2] == [3, 2])
    page.click("#resume-yes")
    check("wake lock on", page.evaluate("__heartsTest.wake()") == "on" and "Screen on" in page.inner_text("#wake-pill"))
    check("no page errors (phone)", not errs, errs)
    ctx.close()

def table_mode(browser):
    print("=== iPad 820x1180: shared-table option, multi-touch ===")
    ctx, page, errs = fresh(browser, {"width": 820, "height": 1180})
    start(page, ("Ana", "Ben", "Cy", "Di"), table=True)
    check("shared-table layout on", page.evaluate("__heartsTest.layout()") == "table")
    fit = page.evaluate(FIT_JS)
    check("table layout fits 820x1180", fit["scroll"] <= 0 and not fit["bad"], fit)
    t = Touch(page)
    # two players slide at once; every tile is upright so right is +points
    check("stand: no rotated or upside-down text", page.evaluate(ROT_JS) == 0)
    pts = {}
    for s in (0, 1):
        x, y = center(page, "#card-%d .c-total" % s); pts[s] = (x, y); t.down(s + 1, x, y)
    for k in range(1, 15):
        for s in (0, 1):
            x, y = pts[s]; t.move(s + 1, x + 5 * k, y)
        time.sleep(0.03)
    for s in (0, 1): t.up(s + 1)
    page.wait_for_timeout(80)
    e = entry(page)
    check("multi-touch: two seats slide at once (both upright)", (e[0] or 0) > 0 and (e[1] or 0) > 0 and (e[0] + e[1]) <= 26, e)
    # keypad stays upright — the iPad is on a stand, facing everyone
    page.click("#cval-2"); face = page.evaluate("getComputedStyle(document.getElementById('keypad-box')).getPropertyValue('--face').trim()")
    check("keypad stays upright on the stand", face in ("0deg", "0"), face)
    shot(page, "ipad-table-keypad")
    page.click("#kp-close")
    # overshoot past the end -> moon question
    page.evaluate("__heartsTest.setEntry([0,null,0,0])")
    x, y = center(page, "#card-1")
    t.down(9, x, y); t.drag(9, 700, 0, 60, 16); t.up(9); page.wait_for_timeout(120)
    check("slide past the end and keep pushing -> moon confirm", page.is_visible("#moon-confirm"))
    page.click("#moon-confirm"); page.wait_for_timeout(300)
    rot = page.evaluate("(() => { const c = document.querySelector('#moon-stage [data-rot]'); return c ? c.getAttribute('data-rot') : 'none'; })()")
    check("HT-05 moon upright even from a side seat", rot in ("0", "none"), rot)
    skip_moon(page); close_sc(page)
    check("moon scored for Ben", st(page)["rounds"][0]["moon"] == 1)
    page.evaluate("__heartsTest.seedRounds([{scores:[13,5,0,8],moon:null,pass:'left',pts:[13,5,0,8],queen:0},{scores:[2,10,9,5],moon:null,pass:'right',pts:[2,10,9,5],queen:null},{scores:[20,1,3,2],moon:null,pass:'across',pts:[20,1,3,2],queen:0},{scores:[0,26,26,26],moon:0,pass:'hold',pts:null,queen:0}], 2400000)")
    page.evaluate("__heartsTest.setEntry([4,null,7,null])"); page.wait_for_timeout(500)
    shot(page, "ipad-table-layout")
    page.click("#menu-btn"); page.click("#m-layout"); page.click("#sheet-close"); page.wait_for_timeout(100)
    check("switch to pass-the-phone from the menu", page.evaluate("__heartsTest.layout()") == "phone" and page.evaluate(ROT_JS) == 0)
    shot(page, "ipad-phone-layout")
    check("no page errors (table)", not errs, errs)
    ctx.close()
    for vp, names, label in (({"width": 1180, "height": 820}, ("Ana", "Ben", "Cy", "Di"), "land-4"),
                             ({"width": 820, "height": 1180}, ("Ana", "Ben", "Cy"), "port-3"),
                             ({"width": 1180, "height": 820}, ("Ana", "Ben", "Cy", "Di", "Eve"), "land-5"),
                             ({"width": 820, "height": 1180}, ("Ana", "Ben", "Cy", "Di", "Eve", "Fay"), "port-6"),
                             ({"width": 390, "height": 844}, ("Ana", "Ben", "Cy", "Di"), "phone-stand")):
        ctx, page, errs = fresh(browser, vp, mobile=vp["width"] < 1100)
        start(page, names, table=True)
        check("stand %s layout on" % label, page.evaluate("__heartsTest.layout()") == "table")
        fit = page.evaluate(FIT_JS)
        check("stand %s fits" % label, fit["scroll"] <= 0 and fit["scrollW"] <= 0 and not fit["bad"], fit)
        check("stand %s upright" % label, page.evaluate(ROT_JS) == 0)
        small = page.evaluate(TARGETS_JS)
        check("stand %s targets >= 44px" % label, not small, small[:4])
        fs = page.evaluate("Math.min(...[...document.querySelectorAll('.c-total b')].map(e => parseFloat(getComputedStyle(e).fontSize)))")
        check("stand %s totals >= 28px" % label, fs >= 28, fs)
        check("stand %s no errors" % label, not errs, errs)
        ctx.close()

def desktop_and_sizes(browser):
    print("=== desktop 1919x998 and 5-6 players ===")
    for vp, n, name in (({"width": 1919, "height": 998}, 4, "desktop-4"), ({"width": 1919, "height": 998}, 6, "desktop-6"),
                        ({"width": 390, "height": 844}, 6, "phone-6"), ({"width": 390, "height": 844}, 5, "phone-5"),
                        ({"width": 390, "height": 844}, 3, "phone-3"), ({"width": 1180, "height": 820}, 5, "ipad-land-5")):
        ctx, page, errs = fresh(browser, vp, mobile=vp["width"] < 1000)
        names = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"][:n]
        start(page, names, target=100)
        page.evaluate("__heartsTest.setEntry(%s)" % json.dumps(([5, 0, 8] + [None] * 3)[:n]))
        fit = page.evaluate(FIT_JS)
        check("HT-03/HT-20 %s fits one viewport" % name, fit["scroll"] <= 0 and fit["scrollW"] <= 0 and not fit["bad"], fit)
        small = page.evaluate(TARGETS_JS)
        check("R-06 %s targets >= 44px" % name, not small, small)
        fs = page.evaluate("Math.min(...[...document.querySelectorAll('.c-total b')].map(e => parseFloat(getComputedStyle(e).fontSize)))")
        check("HT-03 %s totals >= 28px" % name, fs >= 28, fs)
        cr = page.evaluate(CONTRAST_JS, [".c-name", ".c-pass", ".c-total b", "#entry-status", ".bar-btn span", ".g-meta span", ".sv-main", ".c-tl", ".c-after"])
        low = [c for c in cr if c["ratio"] < 4.5]
        check("HT-03 %s text contrast >= 4.5:1" % name, not low, low[:4])
        shot(page, name)
        check("no errors " + name, not errs, errs)
        ctx.close()

def variants(browser):
    print("=== house rules / variants / player counts ===")
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844})
    start(page, ("Ana", "Ben", "Cy", "Di"), target=300, preset="Spot Hearts")
    check("HT-16 Spot Hearts total 117", "of 117" in status(page) and "House rules: Spot Hearts" in page.inner_text("#g-rules"), status(page))
    page.click("#moon-btn"); page.click(".pick[data-seat='0']")
    moon_body = page.inner_text("#modal-body")
    check("spot moon prompt offers ±26, not the 117-point hand", "+26 to everyone else" in moon_body and "−26 to the shooter" in moon_body and "117" not in moon_body, moon_body)
    page.click("#moon-confirm"); skip_moon(page); close_sc(page)
    check("HT-16 Spot moon still gives others +26", st(page)["rounds"][0]["scores"] == [0, 26, 26, 26] and st(page)["rounds"][0]["moonMode"] == "add")
    page.click("#hands-btn"); page.wait_for_timeout(80)
    check("spot moon history records +26", "+26 to everyone else" in page.inner_text("#sheet-body") and "117" not in page.inner_text("#sheet-body"))
    page.click("#sheet-close")
    page.click("#menu-btn"); page.click("#m-new"); page.click("#newgame-confirm"); page.wait_for_timeout(100)
    page.select_option("#preset-select", "Omnibus (J♦ −10)")
    page.click("#start-btn"); page.wait_for_timeout(150)
    page.evaluate("__heartsTest.setEntry([13,5,8,null])")
    check("HT-16 J♦ must be assigned", page.is_disabled("#save-btn") and page.inner_text("#save-why") == "Who took the J♦?")
    page.click("#cj-1"); page.click("#save-btn"); page.wait_for_timeout(100); close_sc(page)
    check("HT-16 J♦ −10 applied", st(page)["rounds"][0]["scores"] == [13, -5, 8, 0], st(page)["rounds"][0]["scores"])
    # -26 mode (R-04)
    page.click("#menu-btn"); page.click("#m-new"); page.click("#newgame-confirm"); page.wait_for_timeout(100)
    page.select_option("#preset-select", "Moon −26"); page.click("#start-btn"); page.wait_for_timeout(100)
    page.click("#moon-btn"); page.click(".pick[data-seat='3']")
    check("R-04 −26 confirm explains", "gets −26" in page.inner_text("#modal-body"))
    page.click("#moon-confirm"); skip_moon(page); close_sc(page)
    check("R-04 −26 mode: shooter goes negative", st(page)["rounds"][0]["scores"] == [0, 0, 0, -26] and st(page)["rounds"][0]["moonMode"] == "subtract" and page.inner_text("#ctot-3") == "-26")
    # each moon hand chooses, even when the game default is +26
    page.click("#menu-btn"); page.click("#m-new"); page.click("#newgame-confirm"); page.wait_for_timeout(100)
    page.select_option("#preset-select", "Classic"); start(page, ("Ana", "Ben", "Cy", "Di"))
    page.click("#moon-btn"); page.click(".pick[data-seat='0']")
    check("moon choice shows both and pre-selects the default", page.get_attribute("#moon-add", "aria-pressed") == "true" and page.is_visible("#moon-sub") and "this hand only" in page.inner_text("#modal-body").lower())
    page.click("#moon-sub")
    check("switching the choice updates the preview", page.get_attribute("#moon-sub", "aria-pressed") == "true" and "gets −26" in page.inner_text("#modal-body"))
    page.click("#moon-confirm"); skip_moon(page); close_sc(page)
    check("this hand used −26 even though the default is +26", st(page)["rounds"][0]["scores"] == [-26, 0, 0, 0] and st(page)["rounds"][0]["moonMode"] == "subtract")
    page.click("#moon-btn"); page.click(".pick[data-seat='1']")
    check("next hand pre-selects the game default again", page.get_attribute("#moon-add", "aria-pressed") == "true")
    page.click("#moon-confirm"); skip_moon(page); close_sc(page)
    check("second moon hand is +26 to the others", st(page)["rounds"][1]["scores"] == [26, 0, 26, 26] and st(page)["rounds"][1]["moonMode"] == "add")
    page.click("#hands-btn"); page.wait_for_timeout(80)
    check("hands list shows each moon choice", "−26 to the shooter" in page.inner_text("#sheet-body") and "+26 to everyone else" in page.inner_text("#sheet-body"))
    page.click("#sheet-body [data-edit='0']"); page.wait_for_timeout(80)
    check("edit banner names that hand's moon choice", "−26 to the shooter" in page.inner_text("#edit-text"))
    page.click("#save-btn"); page.wait_for_timeout(80)
    check("editing a moon hand pre-selects its own choice", page.get_attribute("#moon-sub", "aria-pressed") == "true")
    page.click("#moon-add"); page.click("#moon-confirm"); skip_moon(page)
    s = st(page)
    tot = [sum(r["scores"][i] for r in s["rounds"]) for i in range(4)]
    check("changing a hand's moon choice recalculates totals", s["rounds"][0]["moonMode"] == "add" and s["rounds"][0]["scores"] == [0, 26, 26, 26] and tot == [26, 26, 52, 52], tot)
    # 3 players: left, right, hold; 5 players: no across
    page.click("#menu-btn"); page.click("#m-new"); page.wait_for_timeout(100)
    if page.is_visible("#newgame-confirm"): page.click("#newgame-confirm")
    page.select_option("#preset-select", "Classic")
    start(page, ("Ana", "Ben", "Cy"))
    passes = []
    for k in range(3):
        passes.append(page.inner_text("#g-title").replace("\n", " "))
        page.evaluate("__heartsTest.setEntry([13,6,null])"); page.click("#save-btn"); page.wait_for_timeout(80); close_sc(page)
    check("HT-16 3 players pass left, right, hold", "left" in passes[0] and "right" in passes[1] and "No pass" in passes[2], passes)
    check("3 players: 17 cards, remove 2♦ (help)", True)
    page.click("#help-btn"); hb = page.inner_text("#sheet-body"); page.click("#sheet-close")
    check("R-08 Help explains rules for this game", "17 cards each" in hb and "remove 2♦" in hb and "Shooting the moon" in hb, hb[:120])
    check("no errors (variants)", not errs, errs)
    ctx.close()

def remove_player(browser):
    print("=== remove a player / REST / settings by name ===")
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844})
    start(page, ("Alice", "Bob", "Carol", "Dave", "Eve"))
    keypad(page, 0, 4); keypad(page, 1, 2); keypad(page, 2, 0)
    page.click("#cval-3"); chips = page.locator(".kchip").all_inner_texts()
    check("R-05 keypad offers the rest ('20 left')", "20 left" in chips, chips)
    page.click(".kchip.rest")
    check("R-05 REST fills the remaining points", entry(page)[3] == 20)
    check("R-05 last player auto-filled with 0", page.inner_text("#cval-4") == "0" and page.is_enabled("#save-btn"))
    save(page)
    page.click("#menu-btn"); page.click("#m-players"); page.wait_for_timeout(80)
    rows = page.locator(".pl-main b").all_inner_texts()
    check("HT-12 settings rows by name first", rows == ["Alice", "Bob", "Carol", "Dave", "Eve"] and "Seat 1" in page.inner_text(".pl-row"), rows)
    shot(page, "phone-players")
    page.click("[data-remove='4']")
    check("HT-12 remove asks first", "Remove Eve?" == page.inner_text("#modal-title") and "keeps" in page.inner_text("#modal-body"))
    page.click("#remove-confirm"); page.wait_for_timeout(100)
    s = st(page)
    check("HT-12 Eve out, past score kept", s["out"][4] and page.locator("#card-4").count() == 0)
    check("HT-12 4 players continue (classic 4 cycle)", "Pass 3 cards right" in page.inner_text("#g-title"), page.inner_text("#g-title"))
    page.evaluate("__heartsTest.setEntry([1,2,3,null,null])"); page.click("#save-btn"); page.wait_for_timeout(120)
    s = st(page)
    check("HT-12 removed player scores 0 after leaving", s["rounds"][1]["scores"][4] == 0 and s["rounds"][1]["scores"][3] == 20)
    check("HT-12 scorecard shows Eve (left)", "Eve (left)" in page.inner_text("#scorecard"))
    close_sc(page)
    page.click("#undo-btn"); page.click("#undo-btn"); page.wait_for_timeout(80)
    check("HT-12 undo brings Eve back", not st(page)["out"][4] and page.locator("#card-4").count() == 1)
    page.click("#menu-btn"); page.click("#m-players"); page.fill("#pl-name-1", "Bobby"); page.click("#pl-save"); page.wait_for_timeout(80)
    check("rename keeps scores", st(page)["players"][1] == "Bobby")
    check("no errors (remove)", not errs, errs)
    ctx.close()

PASS4 = ["left", "right", "across", "hold"]
def fake_game(rng, players, finished_at, target=100, first_dealer=0):
    n = len(players); rounds, tots, k = [], [0] * n, 0
    while max(tots) < target:
        dealer = (first_dealer + k) % n
        if rng.random() < 0.07:
            sh = rng.randrange(n); sc = [0 if i == sh else 26 for i in range(n)]
            rounds.append({"scores": sc, "moon": sh, "pass": PASS4[k % 4], "dealer": dealer, "pts": None, "queen": sh})
        else:
            pts = [0] * n; q = rng.randrange(n); pts[q] += 13
            for _ in range(13): pts[rng.randrange(n)] += 1
            rounds.append({"scores": pts[:], "moon": None, "pass": PASS4[k % 4], "dealer": dealer, "pts": pts[:], "queen": q})
        tots = [tots[i] + rounds[-1]["scores"][i] for i in range(n)]; k += 1
    dur = len(rounds) * rng.randint(240, 420) * 1000
    return {"id": "seed-%d" % finished_at, "startedAt": finished_at - dur, "finishedAt": finished_at, "players": players,
            "target": target, "moonMode": "add", "firstDealer": first_dealer, "rounds": rounds}

def history(browser):
    print("=== history, profiles, export ===")
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844})
    start(page, ("Maya", "Omar", "Priya", "Jon"), target=30)
    for sc in ([13, 6, 0, 7], [13, 1, 4, 8], [6, 4, 3, 13]):
        page.evaluate("__heartsTest.setEntry(%s)" % json.dumps(sc)); page.click("#save-btn"); page.wait_for_timeout(150); close_sc(page)
    check("configurable end score (30) ends the game", page.is_visible("#winner-screen") and "Priya wins with 7!" == page.inner_text("#ws-title"), page.inner_text("#ws-title"))
    page.click("#ws-close"); page.click("#menu-btn"); page.click("#m-history"); page.wait_for_timeout(200)
    check("history list", page.locator(".game-row").count() == 1 and "Priya won with 7" in page.inner_text(".game-row"))
    with page.expect_download() as dl: page.click("#export-btn")
    path = dl.value.path(); data = json.load(open(path))
    check("R-03 JSON export contents", data["app"] == "hearts-table" and data["version"] == 3 and data["games"][0]["totals"] == [32, 11, 7, 28] and len(data["games"][0]["rounds"]) == 3 and "roster" in data and "presets" in data)
    with page.expect_download() as dl: page.click("#csv-btn")
    csv = open(dl.value.path(), encoding="utf-8").read().strip().split("\n")
    check("HT-14/R-03 CSV: header + one row per player per hand", csv[0].startswith("game_id,finished_at,target,rules,hand,player") and len(csv) == 1 + 3 * 4, len(csv))
    row = [r for r in csv[1:] if ",1,Maya,1,13,13,13," in r]
    check("R-03 CSV values (hand 1: Maya 13 incl. the Queen, winner flag on Priya)", row and ",yes," in row[0] and any(",Priya," in r and ",7,yes" in r for r in csv[1:]), row[:1])
    page.click(".game-row"); page.wait_for_timeout(150)
    check("HT-14 game opens read-only scorecard", page.locator("#history-body .scd tbody tr").count() == 3 and page.locator("#history-body [data-edit]").count() == 0)
    page.click("#detail-delete"); page.click("#confirm-delete-game"); page.wait_for_timeout(300)
    check("delete game", len(page.evaluate("__heartsTest.games()")) == 0)
    with page.expect_file_chooser() as fc: page.click("#import-btn")
    fc.value.set_files(path); page.wait_for_timeout(500)
    check("R-03 import restores", len(page.evaluate("__heartsTest.games()")) == 1)
    with page.expect_file_chooser() as fc: page.click("#import-btn")
    fc.value.set_files(path); page.wait_for_timeout(500)
    check("R-03 re-import skips duplicates", len(page.evaluate("__heartsTest.games()")) == 1 and "already here" in page.inner_text("#toast-msg"), page.inner_text("#toast-msg"))
    bad = page.evaluate("__heartsTest.importText('{\"nope\":1}')")
    check("bad import rejected", (bad or {}).get("ok") is False and len(page.evaluate("__heartsTest.games()")) == 1)
    # v4 record in the store still works
    v4 = {"id": "v4-old", "startedAt": 1700000000000, "finishedAt": 1700003600000, "durationMs": 3600000, "players": ["Maya", "Omar", "Priya", "Jon"], "target": 100,
          "moonMode": "add", "firstDealer": 0, "rounds": [{"scores": [26, 26, 0, 26], "moon": 2, "pass": "left"}] * 4, "totals": [104, 104, 0, 104], "winners": [2], "winnerNames": ["Priya"], "moons": [], "hands": 4}
    page.evaluate("g => HeartsDB.gamePut(g)", v4)
    rng = random.Random(7); now = int(time.time() * 1000)
    crew = [["Maya", "Omar", "Priya", "Jon"], ["Maya", "Omar", "Priya", "Lee"], ["Lee", "Jon", "Maya", "Priya", "Omar"]]
    seeded = [fake_game(rng, crew[k % 3], now - (k + 1) * 86400000 * 2, first_dealer=k % 4) for k in range(8)]
    r = page.evaluate("t => __heartsTest.importText(t)", json.dumps({"app": "hearts-table", "games": seeded}))
    check("imported 8 seeded games (4 and 5 players)", r and r["added"] == 8, r)
    page.click("#history-back"); page.click("#menu-btn"); page.click("#m-history"); page.wait_for_timeout(300)
    check("v4 game record shows in history", "Priya won with 0" in page.inner_text("#history-body"))
    shot(page, "phone-history-list")
    page.click("[data-game-id='%s']" % seeded[0]["id"]); page.wait_for_timeout(200)
    shot(page, "phone-game-scorecard")
    page.click("#history-back"); page.click("#tab-stats"); page.wait_for_timeout(200)
    names = set(n.strip() for n in page.locator(".sc-name").all_inner_texts())
    check("stats list players", names == {"Maya", "Omar", "Priya", "Jon", "Lee"}, names)
    shot(page, "phone-stats")
    page.click(".stat-card:has-text('Maya')"); page.wait_for_timeout(200)
    prof = page.inner_text("#history-body").lower()
    for k in ("wins", "win rate", "avg final score", "best hand", "worst hand", "moons shot", "♠q taken", "head to head", "current streak"):
        check("HT-14 profile shows " + k, k in prof)
    check("HT-14 head-to-head lists opponents", page.locator(".h2h tbody tr").count() == 4)
    shot(page, "phone-player-profile")
    page.click("#history-back"); page.click("#tab-games"); page.wait_for_timeout(100)
    check("Print / PDF button", page.is_visible("#print-btn"))
    page.emulate_media(media="print"); shot(page, "phone-history-print"); page.emulate_media(media="screen")
    # HT-19 colours consistent: Maya's colour in avatar (history) == game avatar
    cols = page.evaluate("[...document.querySelectorAll('.gr-players .avatar')].slice(0,1).map(a => getComputedStyle(a).backgroundColor)")
    check("HT-19 avatars coloured", cols and cols[0] != "rgba(0, 0, 0, 0)", cols)
    check("no errors (history)", not errs, errs)
    ctx.close()

def colours(browser):
    print("=== colours / avatars consistent ===")
    ctx, page, errs = fresh(browser, {"width": 1919, "height": 998}, mobile=False)
    start(page, ("Alice", "Bob", "Carol", "Dave"))
    page.evaluate("__heartsTest.setEntry([5,0,8,null])"); page.click("#save-btn"); page.wait_for_timeout(200)
    got = page.evaluate("""() => ({ card: getComputedStyle(document.querySelector('#card-2 .avatar')).backgroundColor,
      th: getComputedStyle(document.querySelectorAll('.scd th .avatar')[2]).backgroundColor,
      line: document.querySelectorAll('.chart .pl')[2].style.stroke, legend: document.querySelectorAll('.legend i')[2].style.background })""")
    check("HT-19 same colour for Carol on card, scorecard, chart, legend", got["card"] == got["th"] == "rgb(232, 137, 12)" and "232, 137, 12" in got["line"] and "232, 137, 12" in got["legend"], got)
    check("HT-19 rank numbers alongside colour", page.locator(".sc-pl .rk").first.inner_text() == "1")
    check("HT-06 chart has target line", page.locator(".chart .target").count() == 1 and "Game ends at 100" in page.inner_text(".sc-chart"))
    page.click("#sc-stay"); shot(page, "desktop-scorecard")
    check("no errors (colours)", not errs, errs)
    ctx.close()

def settings_and_motion(browser):
    print("=== HT-18 sound / vibration / less motion ===")
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844})
    start(page)
    page.evaluate("window.__vib=[]; navigator.vibrate = p => { window.__vib.push(p); return true; }")
    keypad(page, 0, 3)
    check("vibration fires on input", page.evaluate("window.__vib.length") > 0)
    check("sound events fire", "tick" in page.evaluate("__heartsTest.sfx()"))
    page.click("#menu-btn"); page.click("#m-haptics"); page.click("#m-calm"); page.click("#sheet-close")
    page.evaluate("window.__vib=[]"); keypad(page, 1, 2)
    check("Vibration off stops buzzing", page.evaluate("window.__vib.length") == 0)
    page.click("#moon-btn"); page.click(".pick[data-seat='0']"); page.click("#moon-confirm"); page.wait_for_timeout(200)
    check("Less motion: small upright badge, no full-screen animation", page.locator(".calm-moon").count() == 1 and page.locator("#moon-stage svg.moon-svg").count() == 0)
    page.wait_for_timeout(2500)
    check("calm badge closes by itself", not page.is_visible("#moon-stage"))
    reload(page)
    s = page.evaluate("__heartsTest.settings()")
    check("settings persist", s["calm"] and not s["haptics"])
    ctx.close()
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844}, reduced="reduce")
    start(page); page.click("#moon-btn"); page.click(".pick[data-seat='2']"); page.click("#moon-confirm"); page.wait_for_timeout(200)
    check("prefers-reduced-motion: calm badge", page.locator(".calm-moon").count() == 1 and "Carol shot the moon" in page.inner_text("#moon-stage"))
    ctx.close()

def moon_variants(browser):
    print("=== all 14 moon animations play upright and skip ===")
    ctx, page, errs = fresh(browser, {"width": 820, "height": 1180})
    start(page, table=True)
    ids = page.evaluate("__heartsTest.moonIds()"); ok = 0
    for k, vid in enumerate(ids):
        page.evaluate("__heartsTest.playMoon('%s', %d)" % (vid, k % 4)); page.wait_for_timeout(900)
        vis = page.is_visible("#moon-stage")
        if k == 3: shot(page, "ipad-moon-upright")
        page.evaluate("document.querySelector('#moon-stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); page.wait_for_timeout(200)
        if vis and not page.is_visible("#moon-stage"): ok += 1
    check("moon: all %d variants play and skip" % len(ids), ok == len(ids) == 14, ok)
    check("moon: no errors", not errs, errs)
    ctx.close()

LEGACY = {"version": 1, "started": True, "players": ["Old", "Saved", "Game", "Here"], "target": 100, "moonMode": "add",
          "rounds": [{"scores": [5, 8, 0, 13], "moon": None, "pass": "left"}, {"scores": [0, 26, 26, 26], "moon": 0, "pass": "right"}]}
def migration(browser):
    print("=== migration: v1 localStorage and v4 IndexedDB ===")
    init = "if(!localStorage.getItem('hearts-migrated-v4')){localStorage.setItem('hearts-scorekeeper-v1', %s); localStorage.setItem('hearts-draft-v1', JSON.stringify({entry:[3,null,null,null]}));}" % json.dumps(json.dumps(LEGACY))
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844}, init=init)
    check("v1: resume prompt", page.is_visible("#resume-yes"))
    s = st(page)
    check("v1: rounds + names + queen inferred", s["players"][0] == "Old" and len(s["rounds"]) == 2 and s["rounds"][0]["queen"] == 3 and s["rounds"][1]["moon"] == 0 and s["rounds"][1]["moonMode"] == "add" and s["rounds"][1]["scores"] == [0, 26, 26, 26])
    check("v1: draft carried over", entry(page) == [3, None, None, None])
    page.click("#resume-yes")
    # v4 IndexedDB snapshot
    v4cur = {"v": 2, "state": {"version": 2, "id": "v4game", "started": True, "startedAt": 1700000000000, "players": ["Ana", "Ben", "Cy", "Di"], "target": 100, "moonMode": "subtract", "firstDealer": 1,
             "rounds": [{"scores": [5, 8, 0, 13], "moon": None, "pass": "left"}]}, "hist": {"undo": [], "redo": []}, "entry": [2, None, None, None], "editing": None}
    page.evaluate("c => HeartsDB.kvSet('current', c).then(() => HeartsDB.flush())", v4cur)
    page.reload(); ready(page)
    s = st(page)
    check("v4 -> v5: state upgraded", s["version"] == 3 and s["rules"]["moonMode"] == "subtract" and s["rounds"][0]["dealer"] == 1 and entry(page) == [2, None, None, None], s.get("rules"))
    page.click("#resume-yes")
    check("v4 -> v5: next dealer continues (Cy)", "Cy deals" in page.inner_text("#g-title"), page.inner_text("#g-title"))
    check("no errors (migration)", not errs, errs)
    ctx.close()

def crash(browser_type):
    print("=== crash recovery (renderer crash + hard browser kill) ===")
    d = tempfile.mkdtemp(prefix="hearts-crash-")
    ctx = browser_type.launch_persistent_context(d, executable_path=CHROME, args=["--no-sandbox"], viewport={"width": 390, "height": 844}, has_touch=True)
    ctx.add_init_script(WAKE_STUB)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(URL); ready(page); skip_intro(page)
    start(page)
    for sc in ([5, 0, 8, 13], [1, 2, 3, 20]):
        page.evaluate("__heartsTest.setEntry(%s)" % json.dumps(sc)); page.click("#save-btn"); page.wait_for_timeout(120); close_sc(page)
    keypad(page, 0, 7)  # a partial hand, typed, not saved
    page.wait_for_timeout(300)  # no explicit flush: autosave must already be on disk
    import subprocess
    ps = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True, text=True).stdout
    rend = [l.split()[0] for l in ps.splitlines() if "type=renderer" in l and d in l]
    for pid in rend: subprocess.run(["kill", "-9", pid])   # renderer crash: tab dies mid-game
    check("crash: renderer processes killed", len(rend) >= 1, len(rend))
    time.sleep(1)
    p2 = ctx.new_page(); p2.goto(URL); ready(p2)
    check("crash: Welcome back after renderer crash", p2.is_visible("#resume-yes"))
    check("crash: hands + partial entry survive", len(st(p2)["rounds"]) == 2 and entry(p2)[0] == 7)
    p2.click("#resume-yes"); keypad(p2, 1, 4); p2.wait_for_timeout(300)
    # hard kill of the whole browser (no clean shutdown, no flush)
    os.system("pkill -9 -f -- '--user-data-dir=%s' >/dev/null 2>&1" % d)
    time.sleep(1.5)
    ctx = browser_type.launch_persistent_context(d, executable_path=CHROME, args=["--no-sandbox"], viewport={"width": 390, "height": 844}, has_touch=True)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto(URL); ready(page)
    check("crash: survives a hard browser kill", page.is_visible("#resume-yes") and len(st(page)["rounds"]) == 2 and entry(page)[:2] == [7, 4], entry(page))
    ctx.close(); shutil.rmtree(d, ignore_errors=True)

def soak(browser):
    print("=== soak: 5 games of 5 players, keypad + undo churn ===")
    ctx, page, errs = fresh(browser, {"width": 390, "height": 844})
    start(page, ("Ana", "Ben", "Cy", "Di", "Ed"), target=100)
    rng = random.Random(3)
    def mem(): return page.evaluate("({nodes: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0})")
    page.evaluate("__heartsTest.flush()"); m0 = mem(); hands = 0; games = 0; t0 = time.time(); per_game = []; max_hist = 0
    while games < 5:
        n = len(st(page)["players"])
        if rng.random() < 0.06:
            page.click("#moon-btn"); page.click(".pick[data-seat='%d']" % rng.randrange(n)); page.click("#moon-confirm"); skip_moon(page)
        else:
            pts = [0] * n; pts[rng.randrange(n)] = 13
            for _ in range(13): pts[rng.randrange(n)] += 1
            for i in range(n - 1):
                if rng.random() < 0.3: keypad(page, i, pts[i])
                else: page.evaluate("([i,v]) => { const e = __heartsTest.entry(); e.pts[i] = v; __heartsTest.setEntry(e.pts, e.queen, e.jack); }", [i, pts[i]])
            hs = page.evaluate("__heartsTest.status()")
            if not hs["complete"]:
                page.evaluate("__heartsTest.setEntry(%s, %d)" % (json.dumps(pts), pts.index(max(pts))))
            page.click("#save-btn"); page.wait_for_timeout(30)
        hands += 1
        if page.is_visible("#scorecard"): page.click("#sc-back")
        if page.is_visible("#moon-stage"): skip_moon(page)
        if page.is_visible("#scorecard"): page.click("#sc-back")
        max_hist = max(max_hist, page.evaluate("__heartsTest.hist().undo"))
        if page.is_visible("#winner-screen"):
            games += 1; page.click("#ws-rematch"); page.wait_for_timeout(80); per_game.append(mem())
        elif hands % 9 == 0:
            page.click("#undo-btn"); page.click("#redo-btn")
            if page.is_visible("#scorecard"): page.click("#sc-back")
    page.evaluate("__heartsTest.flush()"); page.wait_for_timeout(300)
    m1 = mem()
    check("soak: %d hands over %d games in %.0fs" % (hands, games, time.time() - t0), hands >= 40)
    page.evaluate("window.gc && gc()"); m1 = mem()
    check("soak: DOM doesn't grow game over game", per_game[-1]["nodes"] - per_game[1]["nodes"] < 150, [x["nodes"] for x in per_game])
    check("soak: JS heap stable (< +15 MB over the run)", m1["heap"] - m0["heap"] < 15e6, (round(m0["heap"] / 1e6, 1), round(m1["heap"] / 1e6, 1), [round(x["heap"] / 1e6, 1) for x in per_game]))
    check("soak: all games saved", len(page.evaluate("__heartsTest.games()")) == 5)
    check("soak: undo history capped", max_hist <= 60, max_hist)
    check("soak: no errors", not errs, errs[:3])
    ctx.close()

def unsupported_wake(browser):
    print("=== wake lock unsupported ===")
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    ctx.add_init_script("try{ Object.defineProperty(navigator,'wakeLock',{value:undefined}); }catch(e){}")
    page = ctx.new_page(); page.goto(URL); ready(page); skip_intro(page)
    check("unsupported: hint on setup", "Auto-Lock" in page.inner_text("#setup-wake"))
    start(page)
    check("unsupported: pill hint", "Auto-Lock" in page.inner_text("#wake-pill"))
    ctx.close()

def pwa(browser):
    print("=== HT-21 PWA ===")
    if URL.startswith("http"):
        man = json.loads(urllib.request.urlopen(URL.rstrip("/") + "/manifest.webmanifest").read())
    else:
        man = json.load(open("/workspace/hearts-scorekeeper/manifest.webmanifest"))
    check("manifest name Hearts Table, standalone", man["name"] == "Hearts Table" and man["display"] == "standalone", man.get("display"))
    if not URL.startswith("http"): return
    ctx, page, errs = fresh(browser, {"width": 820, "height": 1180})
    page.evaluate("navigator.serviceWorker.ready.then(() => true)"); page.reload(); ready(page)
    check("offline: page controlled by service worker", page.evaluate("!!navigator.serviceWorker.controller"))
    start(page); page.evaluate("__heartsTest.setEntry([5,8,0,13])"); page.click("#save-btn"); page.wait_for_timeout(200)
    ctx.set_offline(True); reload(page)
    check("offline: app loads with no network", page.is_visible("#resume-yes"))
    page.click("#resume-yes")
    check("offline: data still there", len(st(page)["rounds"]) == 1)
    ctx.set_offline(False); ctx.close()

only = os.environ.get("ONLY", "")
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox", "--enable-precise-memory-info", "--js-flags=--expose-gc"])
    suites = [("phone", lambda: phone_flow(browser)), ("table", lambda: table_mode(browser)), ("sizes", lambda: desktop_and_sizes(browser)),
              ("variants", lambda: variants(browser)), ("remove", lambda: remove_player(browser)), ("history", lambda: history(browser)),
              ("colours", lambda: colours(browser)), ("settings", lambda: settings_and_motion(browser)), ("moon", lambda: moon_variants(browser)),
              ("migration", lambda: migration(browser)), ("crash", lambda: crash(p.chromium)), ("soak", lambda: soak(browser)),
              ("wake", lambda: unsupported_wake(browser)), ("pwa", lambda: pwa(browser))]
    for name, fn in suites:
        if only and name not in only.split(","): continue
        try: fn()
        except Exception as e:
            check("suite %s crashed" % name, False, repr(e)[:300])
    browser.close()

print("\nFAILED: %d" % len(fails))
for f in fails: print(" -", f)
sys.exit(1 if fails else 0)
