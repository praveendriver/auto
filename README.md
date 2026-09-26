# Riksha

Top-down vertical-scrolling auto-rickshaw runner. Swipe to change lane, hold to
brake, pick up passengers from the kerb. **The whole game is: how many can you
fit before it tips.** More passengers means more fare per metre and worse
handling — lane changes get slower and the auto wobbles harder.

All the art is vector shapes drawn in code and baked into textures at startup
([`src/art.ts`](src/art.ts)) — no image files, nothing to load or license, and
every colour is a number. The tarmac, verges, the auto, every vehicle and
hazard, the people, the signs, and the roadside scenery (trees, shops,
lampposts, chai stalls, hoardings) all come from there. It's a deliberate
middle step: good enough that strangers see a game rather than a diagram,
cheap enough that nothing is lost when a real sprite sheet replaces it.

## It's live

**https://praveendriver.github.io/auto/**

Hosted on GitHub Pages from https://github.com/praveendriver/auto — free, no
card, no expiry. Every push to `main` rebuilds and redeploys automatically
via `.github/workflows/deploy.yml`; nothing to run by hand.

```bash
git add -A && git commit -m "..." && git push    # that's the deploy
```

Watch it with `gh run watch`. The build takes about a minute.

Pages serves a project site from `/auto/`, so `vite.config.ts` sets
`base: '/auto/'`. Any host that serves from the root wants
`BASE_PATH=/ npm run build` instead.

**Want a cleaner URL for testers?** `auto-game.netlify.app` reads better than
`praveendriver.github.io/auto` when you're sending it cold. One login, then
`npx netlify-cli deploy --prod --dir=dist`. A custom domain (~₹800/year)
points at GitHub Pages just as easily.

**What testers get:** a start screen, then the game. On Android, Chrome's
"Add to Home screen" gives it an icon and opens full-screen like an app. The
crash screen has a *send my stats* link that opens WhatsApp with their
lifetime numbers.

## Analytics

[`src/analytics.ts`](src/analytics.ts) sends game events to **PostHog, EU
region**. With no key set it's a silent no-op — the game builds and runs
identically.

**On India residency:** we tried. DPDP uses a negative list rather than a
localisation mandate and no country is on it, so this is legal; and every
India-resident analytics product (CleverTap, Mixpanel's India residency,
MoEngage) turns out to be enterprise sales-gated — none is self-serve. EU is
the closest self-serve equivalent. The only genuinely India-resident,
self-serve route is self-hosting Umami or Matomo on a Mumbai/Bangalore VPS,
which is worth revisiting at real scale or before taking payments (RBI
localisation is a different and much stricter regime).

**Setup:**

1. Free account at https://eu.posthog.com — **the EU URL, not the US one**;
   the region is fixed per project and `VITE_POSTHOG_HOST` must match it or
   events silently go nowhere.
2. Project settings → copy the **Project API key** (`phc_…`).
3. Project settings → turn on **Discard client IP data**. City, region and
   country are still derived at ingest; the IP itself is dropped.
4. Store it and redeploy:
   ```bash
   gh secret set VITE_POSTHOG_KEY --repo praveendriver/auto --body phc_…
   gh workflow run deploy --repo praveendriver/auto
   ```
   For local runs, put the same value in `.env` (gitignored).

**Events:** `app_open` (with `returning`), `run_start`, `pickup`, `drop` (tip,
combo, ride length), `missed_stop`, `rider_fell`, `mission_done`, `route_done`,
`run_end` (fare, seconds, km, what killed them, max aboard, missions, route),
`share_click`, `stats_send`, and the sound toggles. Every event also carries
`runs_before` and `best_fare`.

**Three things to build on day one:** a Retention insight on `run_start`; a
funnel `app_open → run_start → pickup → drop` (where strangers fall off); and
a `run_end` trend broken down by `killer` (whether one hazard does all the
killing).

Each player is an anonymous install id, never a name. The *send my stats*
WhatsApp message carries the first 8 characters of it, so a tester's message
can be matched to their PostHog person.

**Swapping vendors** means rewriting this one file — we've now done it twice
in an hour. Every `track()` call goes through `EventName`; nothing else
changes.

## Run

```bash
npm install
npm run dev        # http://localhost:5174
```

Phone: swipe left/right, hold to brake. Desktop: arrows or A/D, hold S or ↓.

## What's in a run

| Thing | Behaviour |
|---|---|
| **Cow** | Static in a lane. Never moves. Crash. |
| **Bus** | Drifts sideways across lanes. Crash. |
| **Scooter** | Wrong side, comes at you faster than the road. Crash. |
| **Pothole** | Lose one passenger. |
| **Speed breaker** | Full width. Brake over it or lose one passenger. |
| **Cop** | ₹50 challan off the meter. Not a crash. |
| **Water** *(from 0.25 km)* | Monsoon puddle, two lanes wide. Not a crash — but you crawl through it and everyone aboard gets soaked, halving their tips. |
| **Baraat** *(from 0.5 km)* | Wedding procession, two lanes wide, going your way — so it approaches slowly. Find the free lane early. |
| **Truck** *(from 1 km)* | Wrong side, wide, fast. |
| **Passenger** | Waves `AUTO!` from the kerb, with an orange box in the kerb lane. Drive through the box to board. Max 6. |
| **Stop** | Green sign + green box in a kerb lane. Be in that lane when you reach it to drop the rider and collect a tip. |

Fare only accrues with passengers aboard, so an empty auto earns nothing —
that's the incentive to fill it. The run ends on the first crash. Best fare is
kept in `localStorage`.

## Riders and stops

Every rider boards with a name and a destination (*Aunty → TEMPLE*, *Uncle →
STATION*) some distance ahead. The HUD shows the nearest one: `TEMPLE 120m ←`.
When it's close, a green stop sign appears on that kerb.

- **Hit the stop** in the right lane: rider gets off, you collect a tip that
  scales with the ride length. Seat freed.
- **Miss it:** they stay aboard, **angry** — still taking a seat, still
  weighing you down, no longer paying into the meter — and ask again ~90m on.
  The seat dots at bottom-left turn red for them.
- **Pothole or unbraked breaker:** a random rider falls out, and everyone left
  is jostled, which halves their tips.

So the game isn't "hoard six forever" — angry riders make that a losing
position. It's seat turnover: fill up, hit your stops, fill up again. With six
aboard you'll have stops arriving on both kerbs in quick succession, across
traffic. That's what full is supposed to feel like.

## Why it shouldn't get boring once you're good

Three things push back on mastery, all cheap:

- **Speed never settles.** The ramp has a quadratic term and a ceiling that's
  effectively out of reach. A cap you can master turns every later run into
  the same run; this one gets away from you.
- **Hazards unlock by distance.** Water at 0.25 km, the baraat at 0.5, the
  truck at 1 km, each announced on first sighting. Driving further means
  meeting things the shorter run never showed you.
- **Combo.** Consecutive clean drops multiply the tip — ×1.35, ×1.7, ×2.05, up
  to ×3. A miss or a bump breaks it. This is where a good player plays
  *differently*, not just longer: the skilled run is the one chasing the chain.

And a layer around the run:

- **Missions.** Three per run from a pool of fifteen — *Carry 6 at once*,
  *3 clean drops in a row*, *Dodge 15 cows*. Each pays ₹60 the moment it's
  done, completed ones don't come back until the pool is exhausted, and the
  crash screen shows what you were chasing. A run where you're trying to carry
  six plays nothing like one where you're chasing a combo — that's the
  variation, and it's by intention rather than by noise.

## Real roads

The road you drive is a real one. `src/routes/mg-road.json` is MG Road,
Bangalore — 2.26 km, its actual curvature, and four landmarks at their true
distances — pulled from OpenStreetMap once, at dev time, by
[`scripts/extract_road.py`](scripts/extract_road.py). **Nothing in the game
talks to OSM or any map service.** Players load a small JSON file.

```bash
python3 scripts/extract_road.py \
  --slug mg-road --title "MG Road" --city Bangalore \
  --name "Mahatma Gandhi Road|M\.? ?G\.? Road" --bbox 12.965,77.590,12.985,77.625 \
  --landmark "Trinity Circle=Trinity Circle" --landmark "Brigade Road=^Brigade Road"
```

The script finds every OSM way matching the name inside the bounding box,
stitches the segments that share endpoints into one path, resamples it every
25 m, and turns the heading changes into a smoothed curvature profile in
[-1, 1]. Landmarks are looked up by name and projected onto the nearest point
of the route, so their distances are real. Add a road: run the script, import
the JSON in `src/routes/index.ts`. Pick one to play with `?route=slug`.

**In the game** this is a ribbon, not a map: the road leans into the real
bends (the camera shifts, the HUD doesn't — collision is untouched), landmark
signs appear on the kerb where they actually are, and the header shows how far
along the road you are. Finish it and you get ₹200 and *BEYOND MG ROAD*. There
are no junctions and no turns, on purpose — a runner can't do them, and Outrun
proved you don't need them.

**Licence.** OSM data is ODbL. The game credits *roads © OpenStreetMap
contributors* on the crash screen, and the extracted route files are polylines
that can be shared under the same licence. The game itself is a produced work
and is not share-alike. That's the whole obligation.

## Typography

Three faces, self-hosted in `public/fonts/` (~120 KB, latin + latin-ext):

- **Honk** — the wordmark, and nothing else. A COLRv1 *chromatic* font: it
  paints its own colours, so any `color` set alongside it is ignored, and a
  stroke fights the glyph's own outlines rather than sitting behind them.
  Both are therefore omitted. Its `MORF` axis defaults to 15, which is the
  instance we want — lucky, because `ctx.font` is a shorthand with no slot for
  `font-variation-settings`, so canvas couldn't apply a different one anyway.

- **Geist Pixel** — HUD, numbers, buttons. A true pixel face, so it belongs
  next to the pixel art. Never faux-bolded; that breaks the grid.
- **DM Sans** — instruction prose and anything that's a sentence.

Both are declared in `index.html` and named in one place,
[`src/fonts.ts`](src/fonts.ts).

**Two gotchas worth knowing before touching this:**

*Phaser rasterises text to the canvas when the object is created.* A font that
arrives late is never picked up — the text just silently stays in the fallback
face. So `main.ts` awaits `readyFonts()` before booting, with a 2s ceiling so a
bad connection can't leave anyone on a blank screen.

*`latin-ext` is not optional.* The rupee sign (U+20B9) lives there, not in
`latin`, and it's on every screen. A browser only fetches a `@font-face` when a
character in its `unicode-range` is actually requested, so `readyFonts()` asks
for the glyph explicitly — `document.fonts.load(font, 'A₹←→')`. Drop that
second argument and ₹ silently falls back to a system font.

Self-hosted rather than Google's CDN: two fewer connections on a 4G handshake,
no third-party request carrying the player's IP, same CDN as the game.

## Reading the screen

- **Heads in the cab** — one per rider. Peach while riding, **red with `!!`**
  once they've missed a stop.
- **Seat strip** along the bottom — destination and a face per seat. `:)`
  orange, `>:(` red. Empty seats are dim.
- **`3 / 6 · meter ON`** — green while anyone aboard is paying, grey when the
  meter's off. The fare counter greys out with it.
- **`TEMPLE 120m ←`** — nearest stop and which kerb.
- **`1/3 missions  ×1.7`** top-right — missions done this run, and the live
  combo multiplier when you're on a chain.

## Sound

Everything is synthesised in [`src/audio.ts`](src/audio.ts) with Web Audio —
no files. The engine is a two-stroke putter whose pitch follows speed and drops
when you brake, so the mode is audible without looking. Cues: rising two-note
on boarding, register ka-ching on a tipped drop, a sagging womp on a missed
stop, a thud on a bump, a quiet tick every ₹10 the meter earns.

**Music** is an original loop sequenced live — four bars of I–V–vi–IV at
112bpm with a triangle bass, off-beat chord stabs, a pentatonic hook, and a
light kick/hat/snare. It ducks under the big cues (a tipped drop, the crash) so
they read. `MUSIC ON/OFF` toggles it separately from the effects.

There is deliberately no licensed track. A real song in a game needs a sync
licence, which is expensive and — for anything on a store — a takedown risk
the moment someone notices. If you ever want real music, the routes are
royalty-free libraries (Pixabay Music, Incompetech / Kevin MacLeod under CC-BY)
or commissioning a loop, in that order of cost. Drop the file in `public/`
and swap the sequencer for a `this.sound.add()` in Phaser; the ducking and
toggle already exist.

Browsers block audio until a gesture, so everything starts on the first swipe
or key. `SOUND ON/OFF` at the top toggles the effects and remembers the choice.

## Tuning

**Everything that affects feel is in [`src/config.ts`](src/config.ts).** Speed
ramp, spawn cadence, fare rate, how much each passenger slows a lane change,
obstacle weights. Change numbers there; leave the scene alone.

The values that decide whether overloading is fun are `LANE_TWEEN_PER_PAX`
and `WOBBLE_PER_PAX` against `FARE_PER_PX`. If six aboard doesn't feel
dangerous, raise the first two. If it isn't worth the risk, raise the third.

For stops: `DROP_MIN_PX` / `DROP_MAX_PX` set how far riders go (10px = 1m),
`MISS_RETRY_PX` how soon an angry rider asks again, `TIP_BASE` / `TIP_PER_KM`
what a clean drop is worth. If you're missing most stops, the first thing to
try is a longer `DROP_MIN_PX` so they don't stack up.

## Verification notes

- A scripted pilot that dodges the nearest hazard but never brakes for traffic
  survives 10–45s (median ~22s). That's the expected band for a runner's first
  runs; humans plan further ahead and brake, so real runs should be longer.
- Spawning never builds a three-lane wall: if two lanes already hold a crash
  obstacle near the top, the next spawn is forced to something passable.
- In dev, `window.__game` exposes the Phaser instance so the loop can be
  stepped by hand. Phaser's tweens run on `Date.now()`, not the loop delta, so
  stub `Date.now` with a clock you advance per step if you need them to move
  during scripted runs.

## Not yet

A commissioned sprite sheet (the code-drawn art is the spec for it), more roads (the city map as a level select — *14 of 40 Bangalore
roads driven* — is the retention hook this unlocks), decorations, a *daily*
mission set, any monetisation.
