# G·ROLL

**A skill-based endless runner in a cursed cathedral.** No pay-to-win. No ads. No
upgrades. No skins. No mercy bought with coin. Just a beautiful, brutal corridor
and your own reflexes — a *Subway Surfers*-shaped game rebuilt for players who
actually want to *git gud*.

Built from scratch with **Three.js**. Runs in any modern browser. Nothing to
install, no build step, no account.

---

## Run it

```bash
npm start          # serves at http://localhost:8080
# or any static server, e.g.:  python3 -m http.server 8080
```

Then open **http://localhost:8080** and descend.

> It must be served over HTTP (not opened as a `file://` path) because the game
> uses native ES modules and an import map.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Change lane | `←` `→` / `A` `D` | swipe left / right |
| Leap | `↑` / `W` / `Space` | swipe up / tap |
| Dodge-roll | `↓` / `S` | swipe down |

- **Leap** clears low bone-spikes, pits, and gem arcs.
- **Roll** ducks under hanging cages and overhangs — and it's the *only* thing
  that gets you under them. Rolling in the air slams you down fast.
- **Full slabs and charging beasts** can't be jumped or rolled — you *must* be in
  another lane. Every obstacle row is hand-curated to always be survivable, so a
  death is always your mistake, never the game's.

---

## The economy: no pay-to-win, by design

You collect **gems** (crimson runes), not coins. And gems buy you exactly one
thing:

### The Altar of Curses

You **spend gems to make the game harder**. Each curse deepens the suffering and
multiplies your **glory** (score). That's the entire economy — the *opposite* of
pay-to-win. You don't buy your way to an easier win; you burn your hoard to prove
you don't need one.

| Curse | Effect | Glory |
|---|---|---|
| **Frenzy of the Hollow** | Base speed +35%, harsher acceleration | ×1.50 |
| **Fogblind** | Thick mist — you see obstacles far too late | ×1.35 |
| **Endless Onslaught** | Obstacles pack much tighter together | ×1.45 |
| **Famine of Runes** | Gem pickups become scarce | ×1.25 |
| **Bloodlust** | Charging beasts move faster and reach further | ×1.40 |
| **Vertigo** | The camera sways and lurches with dread | ×1.30 |

Multipliers **stack multiplicatively**. Court every curse and your glory soars —
if your skill can survive the descent you invited.

Gems and your best glory persist locally (`localStorage`). No servers, ever.

---

## The look

Gothic, gory, *Elden-Ring*-flavoured horror: heavy fog, flickering torchlight, a
dead god-tree looming on an unreachable horizon, bone-spikes and hanging corpse-
cages and rune-marked sarcophagi, an eyeless charging beast for the "train," and
a chunky **blood burst** the moment you die. Fully procedural — every prop, the
whole soundtrack, and all the SFX are generated in code. No art or audio assets.

Sound is a synthesized dread-drone with a heartbeat that quickens as you speed
up, plus procedural stingers for gems, leaps, rolls, and death. Toggle it from
the menu.

---

## Project layout

```
index.html             # shell + import map + UI markup
css/style.css          # gothic UI styling
serve.mjs              # zero-dependency static server (npm start)
vendor/three.module.js # Three.js r160 (vendored, MIT)
src/
  main.js              # orchestrator: renderer, loop, state machine, scoring
  config.js            # tunables + curse definitions
  world.js             # scene, fog, lights, recycled corridor segments
  player.js            # the Roller — lane / jump / roll physics + rig
  spawner.js           # curated obstacle rows, gems, pooling, collision
  particles.js         # ambient embers + blood burst
  input.js             # keyboard + touch, buffered intents
  audio.js             # fully procedural WebAudio
  ui.js                # menu / altar / HUD / death screens
  save.js              # localStorage bank + high score
```

## License

MIT. Three.js is bundled under its own MIT license.
