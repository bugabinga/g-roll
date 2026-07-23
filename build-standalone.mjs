// Bundles G-ROLL into a single self-contained HTML page (Three.js + all modules
// + CSS inlined). Produces dist/standalone.html (full page, for local testing)
// and dist/artifact.html (body-only, for publishing as an Artifact).
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

// --- Three.js: turn the single `export { ... }` into a window global ---------
let three = await read('./vendor/three.module.js');
const exportCount = (three.match(/^export /gm) || []).length;
if (exportCount !== 1) throw new Error(`expected 1 export in three, found ${exportCount}`);
three = three.replace('export {', 'const __THREE_NS = {') + '\nwindow.__THREE_NS = __THREE_NS;\n';

// --- game modules, in dependency order --------------------------------------
const order = [
  'config.js', 'save.js', 'input.js', 'audio.js', 'particles.js',
  'player.js', 'preview.js', 'world.js', 'spawner.js', 'ui.js', 'main.js',
];
let game = 'const THREE = window.__THREE_NS;\n';
for (const f of order) {
  let src = await read('./src/' + f);
  src = src.replace(/^\s*import\s.*;?\s*$/gm, '');   // drop import lines
  src = src.replace(/^export\s+/gm, '');             // drop export keywords
  game += `\n/* ===== ${f} ===== */\n` + src + '\n';
}

const css = await read('./css/style.css');

// --- shared body markup (kept in sync with index.html) ----------------------
const body = `
<canvas id="game"></canvas>
<div id="vignette"></div>
<div id="death-flash"><div class="df-text">YOU DIED</div></div>
<div id="screen-intro">
  <div class="intro-inner">
    <div class="intro-eyebrow">YOU RISE AS</div>
    <div id="intro-name" class="intro-name">The Hollow Knight</div>
    <div class="intro-ready" id="intro-ready">Steel yourself…</div>
  </div>
</div>

<div id="hud">
  <div class="hud-top">
    <div class="hud-score-wrap">
      <div id="hud-score" class="hud-score">0</div>
      <div class="hud-score-label">glory <span id="hud-mult" class="hud-mult">×1.00</span></div>
    </div>
    <div class="hud-gems-wrap">
      <div id="hud-gems" class="hud-gems"><span class="gem-ico">◆</span> 0</div>
      <div id="hud-yield" class="hud-yield"></div>
    </div>
  </div>
  <div id="hud-debuffs" class="hud-debuffs"></div>
  <div class="hud-speed-track"><div id="hud-speed" class="hud-speed-fill"></div></div>
  <div class="hud-hint">← → lane &nbsp;·&nbsp; ↑ / space leap &nbsp;·&nbsp; ↓ roll</div>
</div>

<div id="screen-menu" class="screen">
  <div class="panel center">
    <h1 class="title">G&#8202;·&#8202;ROLL</h1>
    <p class="tagline">A cursed corridor. One life. No mercy bought with coin.</p>
    <div class="bank" id="bank-amt"><span class="gem-ico">◆</span> 0</div>
    <div id="menu-active-curses" class="active-curses"></div>
    <div class="btn-row">
      <button id="btn-begin" class="btn btn-primary">Begin the Descent</button>
      <button id="btn-altar" class="btn">Altar of Curses</button>
      <button id="btn-shop" class="btn">Wardrobe</button>
      <button id="btn-settings" class="btn">Settings</button>
    </div>
    <div class="menu-stats">
      <div><span class="stat-k">highest glory</span><span id="menu-high" class="stat-v">0</span></div>
      <div><span class="stat-k">deepest run</span><span id="menu-dist" class="stat-v">0 m</span></div>
    </div>
    <div class="menu-foot">
      <button id="btn-mute" class="btn btn-ghost">♪ sound</button>
      <span class="controls-note">← → move&nbsp;&nbsp;↑ leap&nbsp;&nbsp;↓ roll&nbsp;&nbsp;· swipe on touch</span>
    </div>
  </div>
</div>

<div id="screen-altar" class="screen">
  <div class="panel">
    <h2 class="subtitle">Altar of Curses</h2>
    <p class="altar-preamble">
      Power cannot be bought here. Only suffering. Spend your gems to invite the
      curses below — each makes the descent crueler and multiplies your glory.
      This is the whole economy: no upgrades, no skins, no mercy. Only skill answers a curse.
    </p>
    <div id="altar-bank" class="altar-bank"></div>
    <div id="altar-list" class="altar-list"></div>
    <div id="altar-total" class="altar-total"></div>
    <div class="btn-row">
      <button id="altar-confirm" class="btn btn-primary">Seal the pact</button>
      <button id="altar-back" class="btn">Back</button>
    </div>
  </div>
</div>

<div id="screen-settings" class="screen">
  <div class="panel">
    <h2 class="subtitle">Settings</h2>
    <div class="set-label">Atmosphere</div>
    <div id="mode-grid" class="mode-grid"></div>
    <div class="set-label" style="margin-top:18px">Sound</div>
    <div class="btn-row" style="justify-content:flex-start">
      <button id="set-sound" class="btn btn-ghost">♪ sound</button>
    </div>
    <div class="btn-row"><button id="settings-back" class="btn">Back</button></div>
  </div>
</div>

<div id="screen-shop" class="screen">
  <div class="panel">
    <h2 class="subtitle">The Wardrobe</h2>
    <div class="skin-stage">
      <canvas id="skin-preview" class="skin-preview"></canvas>
      <div id="skin-preview-name" class="skin-preview-name"></div>
    </div>
    <p class="altar-preamble">
      Buy new bodies with gems. Every body you own joins your rotation — each run
      rolls one at equal odds. All are cosmetic; none is stronger than another.
    </p>
    <div id="shop-bank" class="altar-bank"></div>
    <div class="lootbox">
      <div class="lootbox-title">✦ Mystery Lootbox</div>
      <div class="lootbox-desc">A random locked body — with a <b>1-in-100</b> shot at the MYTHIC Gilded Sovereign.</div>
      <button id="lootbox-open" class="btn btn-primary">Open — <span class="gem-ico">◆</span> 500</button>
      <div id="lootbox-result" class="lootbox-result"></div>
    </div>
    <div id="shop-list" class="shop-list"></div>
    <div class="btn-row"><button id="shop-back" class="btn">Back</button></div>
  </div>
</div>

<div id="screen-choice" class="screen">
  <div class="panel center">
    <div class="choice-eyebrow">ONE MINUTE SURVIVED</div>
    <h2 class="subtitle">The Corridor Demands Tribute</h2>
    <p class="choice-sub">Take a wound to keep descending. The crueler the wound, the richer every rune becomes.</p>
    <div id="choice-list" class="choice-list"></div>
  </div>
</div>

<div id="screen-gameover" class="screen">
  <div class="panel center">
    <div class="died">YOU DIED</div>
    <div id="go-record" class="record">NEW GLORY RECORD</div>
    <div id="go-motivate" class="motivate"></div>
    <div class="go-score" id="go-score">0</div>
    <div class="go-mult">glory <span id="go-mult">×1.00</span></div>
    <div class="go-line" id="go-dist">0 m</div>
    <div class="go-line" id="go-gems"><span class="gem-ico">◆</span> 0 collected</div>
    <div class="go-line go-bank" id="go-bank"></div>
    <div class="btn-row">
      <button id="go-again" class="btn btn-primary">Descend Again</button>
      <button id="go-altar" class="btn">Altar</button>
      <button id="go-menu" class="btn btn-ghost">Menu</button>
    </div>
  </div>
</div>

<div id="fatal"><div><h2>The descent could not begin.</h2>
  <p>Your browser may not support WebGL.</p><pre></pre></div></div>`;

const scripts = `
<script type="module">
${three}
</script>
<script type="module">
try {
${game}
} catch (err) {
  console.error(err);
  const el = document.getElementById('fatal');
  if (el) { el.style.display = 'flex'; const p = el.querySelector('pre'); if (p) p.textContent = String(err && err.stack || err); }
}
</script>`;

await mkdir(new URL('./dist/', import.meta.url), { recursive: true });

// full standalone page (for local testing / download)
const full = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<meta name="theme-color" content="#05060a" />
<title>G-ROLL — a descent</title>
<style>
html,body{margin:0}
${css}
</style>
</head><body>
${body}
${scripts}
</body></html>`;
await writeFile(new URL('./dist/standalone.html', import.meta.url), full);

// artifact body-only (no doctype/html/head/body — the platform provides those)
const artifact = `<style>\n${css}\n</style>\n${body}\n${scripts}\n`;
await writeFile(new URL('./dist/artifact.html', import.meta.url), artifact);

console.log('built dist/standalone.html and dist/artifact.html');
