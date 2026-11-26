# Hearts Table

A scorekeeper for the card game Hearts, for 3 to 6 players. It is one offline-capable web page, and scores never leave the device.

**Live:** https://starry-quasar-yqh9.here.now/

## Features

- **Pass-the-phone layout (default):** every player gets an upright card showing their total, rank, who deals and whom they pass to. It fits one screen on phones (390×844) and desktops (1919×998), for 3 to 6 players.
- **Shared-table layout (option, 4 players):** lay the device flat and each edge faces its player. Several players can slide their scores at the same time.
- **Fast, safe score entry:**
  - Tap a number to get a keypad, with quick chips for 0, 1, 2, 5, 13 and "N left".
  - −/+ steppers, arrow keys, or slide sideways across a card. The slide needs no hold and snaps to whole points.
  - A tap never clears a value. Clear always asks first and can be undone, and each player has their own Undo.
- **Auto-fill:** the last player gets the remaining points as a highlighted suggestion; one tap confirms it.
- **Save rules:** Save is only possible when the hand adds up (26, or 117 with Spot Hearts). When it can't save, it says why, e.g. "Dave still to set" or "3 points left to give out".
- **Queen and Jack:** the Queen of Spades holder is detected automatically. With the Jack-of-Diamonds variant you mark who took it. Each hand gets a recap such as "Dave took 8 hearts + the Queen".
- **Shooting the moon:**
  - Use the labelled 🌙 button, type 26, or slide past the end.
  - The confirmation shows the resulting totals first.
  - 14 celebration animations, always upright, with a calm badge when Less motion is on.
- **Scorecard:** every hand with running totals, rank, dealer, pass direction, moon and ♠Q tags, plus a line chart with the end-score line. It shows for 3 seconds after each hand, and its header has a timer and a hand count.
- **Fixing mistakes:**
  - Undo and Redo work on whole hands.
  - Any hand can be edited with the same controls; it shows that hand's totals, and later totals are recalculated.
  - Hands can be deleted.
  - A player can be removed mid-game: their past scores stay, and they're skipped from then on.
- **Winner screen:** "Carol wins with 11!", with standings, best moment, Rematch, New game and Scorecard. Share results makes a PNG on the device.
- **History (IndexedDB):**
  - finished games, each opening as a read-only scorecard;
  - player profiles with wins, win rate, averages, best and worst hands, moons, Queens, streaks and head to head;
  - export as a JSON backup (with import) or as CSV, and Print/PDF.
- **House rules:** presets for Classic, Moon −26, Spot Hearts, Omnibus (J♦ −10) and No hold hands, and you can save your own. Passing follows the player count.
- **PWA:**
  - installable and works offline (service worker);
  - keeps the screen awake (Wake Lock);
  - saves after every tap, survives crashes, and greets you with "Welcome back".
- No analytics, no CDN, no accounts.

## Layout

```
src/template.html     page skeleton (placeholders filled by build.py)
src/style*.css        styles
src/rules.js          pure game rules: 3–6 players, variants, standings, records, stats, CSV
hearts-logic.js       slide/jog maths and v4 helpers
src/db.js             IndexedDB storage with a localStorage fallback
src/moon.js           moon animations
src/app/*.js          the app, in parts joined in name order
build.py              builds index.html and publish/
sw.js, manifest.webmanifest, icons
test-logic.js, test-rules.js   unit tests (Node)
test-ui.py            browser tests (Playwright + Chrome)
```

## Build and test

```sh
python3 build.py                  # writes index.html and publish/
node test-logic.js && node test-rules.js
pip install playwright            # uses /usr/bin/google-chrome, or set CHROME=/path/to/chrome
python3 test-ui.py                # file:// build; screenshots to ./screenshots/
python3 test-ui.py https://starry-quasar-yqh9.here.now/ /tmp/shots/   # live, including offline tests
ONLY=phone,crash,soak python3 test-ui.py   # run some suites only
```

The browser suites cover:

- phone, tablet and desktop fit;
- touch-target size and contrast;
- keypad, steppers, slide and arrow keys;
- multi-touch in shared-table mode;
- moon, edit, undo and remove player;
- the variants;
- history, export and import;
- migration from older saves;
- a renderer crash and a hard browser kill;
- a soak run of many games;
- offline use.

Serve `publish/` from any static host to deploy.

## License

MIT, see [LICENSE](LICENSE).
