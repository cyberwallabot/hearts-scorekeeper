#!/usr/bin/env python3
"""Assemble src/ pieces into one self-contained index.html and the publish/ folder."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
src = root / "src"
tpl = (src / "template.html").read_text()


def app_js():
    """The app is split into parts under src/app/, joined in name order inside one closure."""
    parts = sorted((src / "app").glob("*.js"))
    body = "\n".join("/* ---- %s ---- */\n%s" % (p.name, p.read_text()) for p in parts)
    return "(function () {\n\"use strict\";\n" + body + "\n})();\n"


html = (tpl.replace("/*CSS*/", (src / "style.css").read_text())
           .replace("/*CSS2*/", (src / "style2.css").read_text())
           .replace("/*CSS3*/", (src / "style3.css").read_text())
           .replace("/*RULES*/", (src / "rules.js").read_text())
           .replace("/*LOGIC*/", (root / "hearts-logic.js").read_text())
           .replace("/*DB*/", (src / "db.js").read_text())
           .replace("/*MOON*/", (src / "moon.js").read_text())
           .replace("/*APP*/", app_js()))
(root / "index.html").write_text(html)
pub = root / "publish"
pub.mkdir(exist_ok=True)
(pub / "index.html").write_text(html)
for name in ("manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "sw.js"):
    f = root / name
    if f.exists():
        shutil.copy2(f, pub / name)
print("built index.html", len(html), "bytes;", "publish/:", sorted(p.name for p in pub.iterdir()))
