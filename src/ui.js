// ============================================================================
//  UI — the menu, the Altar of Curses, the running HUD, and the death screen.
//  Pure DOM over the canvas. Reads the save bank; emits high-level intents.
// ============================================================================

import { Save } from './save.js';
import { CURSES, curseById, debuffById, questTemplateById, questRarityById, LEGENDS } from './config.js';
import { SKINS } from './player.js';

const $ = (id) => document.getElementById(id);
const gem = '<span class="gem-ico">◆</span>';

// shown when you shatter your own record — a jolt of motivation to go again
const MOTIVATIONS = [
  'Further than you have ever gone. The dark learns your name.',
  'A new legend, carved in ash and blood. Do not stop now.',
  'You surpassed yourself. Somewhere deeper still, glory waits.',
  'Unmatched. Let the corridor fear the roll.',
  'Your finest descent — and proof there is more in you yet.',
  'The dead bow. Rise, and go further.',
  'This is what mastery feels like. Chase it again.',
  'You bent the gauntlet to your will. Now break it.',
];

export class UI {
  constructor(handlers) {
    this.h = handlers;         // { onBegin, onAltar, onMenu, onMute }
    this.selected = new Set(Save.activeCurses);
    this._wire();
    this.refreshBank();
  }

  _wire() {
    $('btn-begin').onclick = () => this.h.onBegin();
    $('btn-altar').onclick = () => this.showAltar();
    $('btn-mute').onclick = () => {
      const m = this.h.onMute();
      $('btn-mute').textContent = m ? '♪ muted' : '♪ sound';
      $('btn-mute').classList.toggle('off', m);
    };
    $('btn-mute').textContent = Save.muted ? '♪ muted' : '♪ sound';
    $('btn-mute').classList.toggle('off', Save.muted);

    $('altar-back').onclick = () => this.showMenu();
    $('altar-confirm').onclick = () => { this._commitCurses(); this.showMenu(); };

    $('btn-shop').onclick = () => this.showShop();
    $('shop-back').onclick = () => this.showMenu();
    $('lootbox-open').onclick = () => this._openLootbox();
    $('keybox-open').onclick = () => this._openKeyBox();

    $('btn-codex').onclick = () => this.showCodex();
    $('codex-back').onclick = () => this.showMenu();

    $('btn-quests').onclick = () => this.showQuests();
    $('quests-back').onclick = () => this.showMenu();
    $('quests-reroll').onclick = () => {
      if (Save.rerollQuests(100)) { this._renderQuests(); this.refreshBank(); }
    };

    $('btn-settings').onclick = () => this.showSettings();
    $('settings-back').onclick = () => this.showMenu();
    $('set-sound').onclick = () => {
      const m = this.h.onMute();
      $('set-sound').textContent = m ? '♪ muted' : '♪ sound';
      $('set-sound').classList.toggle('off', m);
    };

    $('go-again').onclick = () => this.h.onBegin();
    $('go-altar').onclick = () => this.showAltar();
    $('go-menu').onclick = () => this.showMenu();
  }

  // -- screen switching ------------------------------------------------------
  _hideAll() {
    for (const s of ['menu', 'altar', 'gameover', 'choice', 'intro', 'shop', 'settings', 'codex', 'quests']) $('screen-' + s).classList.remove('show');
    $('hud').classList.remove('show');
  }

  showSettings() {
    this._hideAll();
    $('set-sound').textContent = Save.muted ? '♪ muted' : '♪ sound';
    $('set-sound').classList.toggle('off', Save.muted);
    this._renderModes();
    this._renderGrounds();
    $('screen-settings').classList.add('show');
    this.h.onSettings && this.h.onSettings();
  }

  _renderGrounds() {
    const GROUNDS = [
      { id: 'stone', name: 'Cathedral Stone', desc: 'Wet flagstone, torch-lit. The old road.' },
      { id: 'milkyway', name: 'The Milky Way', desc: 'Run across a river of stars and nebulae.' },
      { id: 'lava', name: 'Molten Rift', desc: 'Cracked black rock, seamed with fire.' },
      { id: 'frost', name: 'Frozen Waste', desc: 'A sheet of cracked, glittering ice.' },
    ];
    const grid = $('ground-grid');
    grid.innerHTML = '';
    for (const gnd of GROUNDS) {
      const el = document.createElement('button');
      el.className = 'mode-btn' + (Save.ground === gnd.id ? ' on' : '');
      el.innerHTML = `<div class="mode-name">${gnd.name}</div><div class="mode-desc">${gnd.desc}</div>`;
      el.onclick = () => { Save.setGround(gnd.id); this.h.onGround && this.h.onGround(gnd.id); this._renderGrounds(); };
      grid.appendChild(el);
    }
  }

  _renderModes() {
    const MODES = [
      { id: 'night', name: 'Night', desc: 'The dread dark, torch-lit. The way it was meant to be played.' },
      { id: 'day', name: 'Day', desc: 'A wan grey daylight. Everything else plays normally.' },
      { id: 'bloodmoon', name: 'Bloodmoon', tag: '2× SPEED · 2× COINS', desc: 'The sky drowns in blood. Twice as fast, twice the runes — for the fearless.' },
      { id: 'challenge', name: 'Challenge', tag: 'RNG FORTUNE', desc: 'Fate rolls the dice each run. You might be blessed with double runes — or cursed with brutal speed.' },
    ];
    const grid = $('mode-grid');
    grid.innerHTML = '';
    for (const m of MODES) {
      const el = document.createElement('button');
      el.className = 'mode-btn' + (Save.mode === m.id ? ' on' : '');
      el.dataset.mode = m.id;
      el.innerHTML = `<div class="mode-name">${m.name}${m.tag ? `<span class="tag">${m.tag}</span>` : ''}</div><div class="mode-desc">${m.desc}</div>`;
      el.onclick = () => { Save.setMode(m.id); this._renderModes(); };
      grid.appendChild(el);
    }
  }

  showIntro(name, fortune) {
    this._hideAll();
    $('intro-name').textContent = name;
    const fEl = $('intro-fortune');
    if (fEl) {
      if (fortune) {
        fEl.textContent = `${fortune.name} — ${fortune.desc}`;
        fEl.className = 'intro-fortune show ' + (fortune.tone || 'mixed');
      } else {
        fEl.textContent = '';
        fEl.className = 'intro-fortune';
      }
    }
    $('screen-intro').classList.add('show');
  }

  hideIntro() { $('screen-intro').classList.remove('show'); }

  showMenu() {
    this._hideAll();
    this.refreshBank();
    this._renderMenuCurses();
    // badge the Quests button when bounties are ready to claim
    const claim = Save.questsClaimable();
    const qb = $('btn-quests');
    if (qb) { qb.classList.toggle('has-claim', claim > 0); qb.dataset.claim = claim; }
    $('screen-menu').classList.add('show');
    this.h.onMenu && this.h.onMenu();
  }

  showAltar() {
    this._hideAll();
    this.selected = new Set(Save.activeCurses);
    this._renderAltar();
    $('screen-altar').classList.add('show');
    this.h.onAltar && this.h.onAltar();
  }

  setPreview(preview) { this.preview = preview; }

  // -- Codex: a bestiary of every body and its story ------------------------
  showCodex() {
    this._hideAll();
    this._renderCodex();
    $('screen-codex').classList.add('show');
    this.h.onCodex && this.h.onCodex();
  }

  _renderCodex() {
    const list = $('codex-list');
    list.innerHTML = '';
    let owned = 0;
    for (const s of SKINS) {
      const have = s.defaultOwned || Save.isSkinOwned(s.id);
      if (have) owned++;
      const el = document.createElement('div');
      el.className = 'codex-entry' + (have ? '' : ' locked') + (s.mythic ? ' mythic' : '');
      el.innerHTML = `
        <div class="codex-orb" style="--c:${s.color}"></div>
        <div class="codex-body">
          <div class="codex-head">
            <span class="codex-name">${s.name}</span>
            ${s.mythic ? '<span class="codex-tag myth">✦ mythic</span>'
              : s.defaultOwned ? '<span class="codex-tag free">free</span>'
              : '<span class="codex-tag">' + gem + ' ' + s.cost + '</span>'}
            <span class="codex-state">${have ? '✦ owned' : 'undiscovered'}</span>
          </div>
          <p class="codex-story">${s.story || s.blurb}</p>
        </div>`;
      list.appendChild(el);
    }

    // --- Legends of the Descent: world/Collapse lore, unlocked by depth reached
    const best = Save.bestDistance;
    let known = 0;
    const head = document.createElement('div');
    head.className = 'codex-section-head';
    head.innerHTML = 'Legends of the Descent';
    list.appendChild(head);
    for (const lg of LEGENDS) {
      const unlocked = best >= lg.need;
      if (unlocked) known++;
      const el = document.createElement('div');
      el.className = 'codex-legend' + (unlocked ? '' : ' locked');
      el.innerHTML = unlocked
        ? `<div class="codex-head"><span class="codex-name">${lg.name}</span><span class="codex-state">✦ known</span></div>
           <p class="codex-story">${lg.text}</p>`
        : `<div class="codex-head"><span class="codex-name">???</span><span class="codex-state">reach ${lg.need.toLocaleString()} m</span></div>
           <p class="codex-story locked-text">A truth that only the deep descent will uncover.</p>`;
      list.appendChild(el);
    }
    $('codex-count').textContent = `${owned} / ${SKINS.length} souls bound · ${known} / ${LEGENDS.length} legends`;
  }

  // -- Daily Quests ---------------------------------------------------------
  showQuests() {
    this._hideAll();
    this._renderQuests();
    $('screen-quests').classList.add('show');
    this.h.onQuests && this.h.onQuests();
  }

  _renderQuests() {
    const list = $('quests-list');
    list.innerHTML = '';
    const quests = Save.quests;
    quests.forEach((q, i) => {
      const rr = questRarityById(q.rarity) || {};
      const tpl = questTemplateById(q.tpl) || {};
      const label = tpl.label ? tpl.label(q.target) : q.tpl;
      const done = q.progress >= q.target;
      const pct = Math.min(100, (q.progress / q.target) * 100);
      const el = document.createElement('div');
      el.className = 'quest r-' + q.rarity + (q.claimed ? ' claimed' : '') + (done && !q.claimed ? ' ready' : '');
      el.style.setProperty('--rc', rr.color || '#b9b1a1');
      el.innerHTML = `
        <div class="quest-top">
          <span class="quest-rar">${rr.name || ''}</span>
          <span class="quest-reward">${gem} ${q.reward}</span>
        </div>
        <div class="quest-label">${label}</div>
        <div class="quest-bar"><div class="quest-fill" style="width:${pct}%"></div></div>
        <div class="quest-foot">
          <span class="quest-prog">${Math.min(q.progress, q.target).toLocaleString()} / ${q.target.toLocaleString()}</span>
          ${q.claimed
            ? '<span class="quest-claimed">✦ claimed</span>'
            : (done ? '<button class="quest-claim">Claim</button>' : '<span class="quest-todo">in progress</span>')}
        </div>`;
      if (done && !q.claimed) {
        el.querySelector('.quest-claim').onclick = () => {
          const won = Save.claimQuest(i);
          if (won > 0) { this.audio && this.audio.gem && this.audio.gem(); this._renderQuests(); this.refreshBank(); }
        };
      }
      list.appendChild(el);
    });
    const canReroll = Save.canAfford(100);
    $('quests-reroll').classList.toggle('cant', !canReroll);
    $('quests-reroll').innerHTML = `Reroll all — ${gem} 100`;
    $('quests-bank').innerHTML = `Bank: ${gem} ${Save.bank}`;
  }

  showShop() {
    this._hideAll();
    if (this.selectedSkin == null) this.selectedSkin = 0;
    this._renderShop();
    this._selectSkin(this.selectedSkin);
    $('screen-shop').classList.add('show');
    this.h.onShop && this.h.onShop();
  }

  _updateKeys() {
    const n = Save.keys;
    const btn = $('keybox-open');
    $('keybox-count').textContent = n;
    btn.disabled = n < 1;
    btn.classList.toggle('cant', n < 1);
  }

  _selectSkin(idx) {
    this.selectedSkin = idx;
    if (this.preview) this.preview.show(idx);
    $('skin-preview-name').textContent = SKINS[idx].name;
    for (const card of $('shop-list').children) card.classList.toggle('selected', Number(card.dataset.skinIdx) === idx);
  }

  _renderShop() {
    const list = $('shop-list');
    list.innerHTML = '';
    SKINS.forEach((s, idx) => {
      if (s.lootboxOnly && !Save.isSkinOwned(s.id)) return;   // mythic hides until won
      const owned = s.defaultOwned || Save.isSkinOwned(s.id);
      const canBuy = Save.canAfford(s.cost);
      const el = document.createElement('div');
      el.dataset.skinIdx = idx;
      el.className = 'skin' + (owned ? ' owned' : '') + (idx === this.selectedSkin ? ' selected' : '');
      el.innerHTML = `
        <div class="skin-orb" style="--c:${s.color}"></div>
        <div class="skin-body">
          <div class="skin-name">${s.name}</div>
          <div class="skin-blurb">${s.blurb}</div>
        </div>
        <div class="skin-action">
          ${owned
            ? (s.defaultOwned ? `<span class="skin-owned-tag">free</span>` : `<span class="skin-owned-tag">✦ owned</span>`)
            : `<button class="skin-buy${canBuy ? '' : ' cant'}">${gem} ${s.cost}</button>`}
        </div>`;
      el.onclick = () => this._selectSkin(idx);       // click card → preview it
      if (!owned) {
        const btn = el.querySelector('.skin-buy');
        btn.onclick = (e) => {
          e.stopPropagation();
          if (Save.buySkin(s.id, s.cost)) { this._renderShop(); this._selectSkin(idx); this.refreshBank(); }
        };
      }
      list.appendChild(el);
    });
    $('shop-bank').innerHTML = `Bank: ${gem} ${Save.bank}`;
    this._updateKeys();
  }

  _openLootbox() {
    const COST = 500;
    const res = $('lootbox-result');
    if (this._chestOpening) return;
    if (!Save.spendGems(COST)) {
      res.textContent = 'Not enough gems.'; res.className = 'lootbox-result show dupe';
      return;
    }
    // roll + grant immediately; the chest animation is purely a reveal
    const pool = SKINS.filter((s) => !s.defaultOwned && !s.mythic);
    let wonId, msg, tone;
    if (Math.random() < 0.01) {                                       // 1-in-100 jackpot
      wonId = 'sovereign'; tone = 'mythic';
      if (Save.isSkinOwned('sovereign')) { Save.addGems(1200); msg = '✦ MYTHIC DUPLICATE — +◆1200 ✦'; }
      else { Save.grantSkin('sovereign'); msg = '✦ MYTHIC! The Gilded Sovereign! ✦'; }
    } else {
      const pick = pool[(Math.random() * pool.length) | 0];
      wonId = pick.id;
      if (Save.isSkinOwned(pick.id)) { Save.addGems(250); msg = `Duplicate — ${pick.name}. +◆250`; tone = 'dupe'; }
      else { Save.grantSkin(pick.id); msg = `You unboxed ${pick.name}!`; tone = 'win'; }
    }
    const idx = SKINS.findIndex((s) => s.id === wonId);

    this._playChest(tone, () => {
      this._renderShop();
      this._selectSkin(idx);                  // spin the winning body up in the turntable
      this.refreshBank();
      res.textContent = msg;
      res.className = 'lootbox-result show ' + tone;
    });
  }

  // The War-Cache: opened with a War-Key. 1-in-10 pull for the MYTHIC Orc Warlord.
  _openKeyBox() {
    const res = $('keybox-result');
    if (this._chestOpening) return;
    if (!Save.spendKey()) {
      res.textContent = 'No War-Keys. Beat your record to earn them.';
      res.className = 'lootbox-result show dupe';
      return;
    }
    let msg, tone;
    if (Math.random() < 0.1) {                                        // 1-in-10 orc
      if (Save.isSkinOwned('warlord')) { Save.addGems(800); msg = 'The Warlord roars again — +◆800'; tone = 'dupe'; }
      else { Save.grantSkin('warlord'); msg = '✦ THE ORC WARLORD IS YOURS! ✦'; tone = 'mythic'; }
    } else {
      const g = 120 + ((Math.random() * 90) | 0);
      Save.addGems(g);
      msg = `The cache holds only plunder — ${gem} +${g}.`;
      tone = 'dupe';
    }
    const idx = SKINS.findIndex((s) => s.id === 'warlord');

    this._playChest(tone, () => {
      this._renderShop();
      if (Save.isSkinOwned('warlord')) this._selectSkin(idx);
      this._updateKeys();
      this.refreshBank();
      res.textContent = msg;
      res.className = 'lootbox-result show ' + tone;
    });
  }

  _playChest(tone, onDone) {
    const anim = $('lootbox-anim');
    const chest = anim.querySelector('.chest');
    this._chestOpening = true;
    anim.className = tone === 'mythic' ? 'show mythic' : 'show';
    chest.className = 'chest shaking';
    void chest.offsetWidth;                    // restart animations

    let done = false, lastTap = 0;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(t1); clearTimeout(t2);
      anim.classList.remove('show'); anim.onclick = null;
      this._chestOpening = false;
      onDone();
    };
    const t1 = setTimeout(() => { chest.className = 'chest open'; }, 850);
    const t2 = setTimeout(finish, 1750);
    // double-tap / double-click anywhere to skip
    anim.onclick = () => { const now = Date.now(); if (now - lastTap < 350) finish(); lastTap = now; };
  }

  showHUD() {
    this._hideAll();
    $('hud').classList.add('show');
  }

  // -- data ------------------------------------------------------------------
  refreshBank() {
    $('bank-amt').innerHTML = `${gem} ${Save.bank}`;
    $('menu-high').textContent = Save.highScore.toLocaleString();
    $('menu-dist').textContent = Save.bestDistance.toLocaleString() + ' m';
  }

  _renderMenuCurses() {
    const ids = Save.activeCurses;
    const box = $('menu-active-curses');
    if (!ids.length) {
      box.innerHTML = `<span class="muted">No curses. The unburdened path — glory ×1.0</span>`;
      return;
    }
    let mult = 1;
    const chips = ids.map((id) => {
      const c = curseById(id); if (!c) return '';
      mult *= c.mult;
      return `<span class="curse-chip">${c.name}</span>`;
    }).join('');
    box.innerHTML = `${chips}<div class="curse-sum">Glory ×${mult.toFixed(2)}</div>`;
  }

  _renderAltar() {
    const list = $('altar-list');
    list.innerHTML = '';
    for (const c of CURSES) {
      const unlocked = Save.isUnlocked(c.id);
      const on = unlocked && this.selected.has(c.id);
      const canBuy = Save.canAfford(c.cost);
      const el = document.createElement('div');
      el.className = 'curse' + (on ? ' on' : '') + (unlocked ? '' : ' locked');
      el.innerHTML = `
        <div class="curse-head">
          <span class="curse-name">${c.name}</span>
          <span class="curse-mult">×${c.mult.toFixed(2)}</span>
        </div>
        <p class="curse-desc">${c.desc}</p>
        <div class="curse-foot">
          ${unlocked
            ? `<span class="curse-cost owned">✦ unlocked</span><span class="curse-toggle">${on ? 'INVOKED' : 'invoke'}</span>`
            : `<span class="curse-cost">${gem} ${c.cost} to unlock</span><span class="curse-toggle unlock${canBuy ? '' : ' cant'}">unlock</span>`}
        </div>`;
      el.onclick = () => {
        if (Save.isUnlocked(c.id)) {
          if (this.selected.has(c.id)) this.selected.delete(c.id);
          else this.selected.add(c.id);
        } else if (Save.unlockCurse(c.id, c.cost)) {
          this.selected.add(c.id);          // unlock + invoke straight away
          this.refreshBank();
        }
        this._renderAltar();
      };
      list.appendChild(el);
    }
    // totals — just the glory you'll wear (no per-run cost anymore)
    let mult = 1;
    for (const id of this.selected) { const c = curseById(id); if (c) mult *= c.mult; }
    $('altar-total').innerHTML = `The descent will demand <b>×${mult.toFixed(2)}</b> glory of you`;
    $('altar-bank').innerHTML = `Bank: ${gem} ${Save.bank}`;
    $('altar-confirm').disabled = false;
    $('altar-confirm').textContent = 'Seal the pact';
  }

  _commitCurses() {
    Save.setActiveCurses([...this.selected]);
  }

  // -- wound choice (fires every minute) ------------------------------------
  showChoice(debuffs, onPick) {
    const list = $('choice-list');
    list.innerHTML = '';
    for (const d of debuffs) {
      const card = document.createElement('button');
      card.className = 'choice-card';
      card.type = 'button';
      card.innerHTML = `
        <div class="choice-head">
          <span class="choice-name">${d.name}</span>
          <span class="choice-skulls" data-tier="${d.tier}">${'☠'.repeat(d.tier)}</span>
        </div>
        <p class="choice-desc">${d.desc}</p>
        <span class="choice-reward">+${d.gemBonus.toFixed(1)} ${gem} per rune</span>`;
      card.onclick = () => onPick(d);
      list.appendChild(card);
    }
    $('screen-choice').classList.add('show');
  }

  hideChoice() { $('screen-choice').classList.remove('show'); }

  // -- HUD -------------------------------------------------------------------
  updateHUD({ score, gems, mult, speedPct, gemYield, debuffs }) {
    $('hud-score').textContent = Math.floor(score).toLocaleString();
    $('hud-gems').innerHTML = `${gem} ${Math.floor(gems)}`;
    $('hud-mult').textContent = '×' + mult.toFixed(2);
    $('hud-speed').style.width = (speedPct * 100).toFixed(0) + '%';

    $('hud-yield').innerHTML = (gemYield && gemYield > 1) ? `${gem} ×${gemYield.toFixed(1)} / rune` : '';

    // rebuild wound chips only when the set changes (avoid per-frame DOM churn)
    const n = debuffs ? debuffs.length : 0;
    if (n !== this._woundCount) {
      this._woundCount = n;
      const box = $('hud-debuffs');
      box.innerHTML = (debuffs || []).map((id) => {
        const d = debuffById(id);
        return d ? `<span class="wound">${'☠'} ${d.name}</span>` : '';
      }).join('');
    }
  }

  flashGem() {
    const g = $('hud-gems');
    g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop');
  }

  // The Collapse: drive the creeping dread veil + the HUD "collapse" gauge (0..1).
  setCollapse(near) {
    const veil = $('collapse-veil');
    if (veil) veil.style.opacity = (near * 0.72).toFixed(3);
    const bar = $('hud-collapse-fill');
    if (bar) bar.style.width = (Math.min(1, near) * 100).toFixed(0) + '%';
    const wrap = $('hud-collapse');
    if (wrap) wrap.classList.toggle('danger', near > 0.8);
  }

  // A brief lore beat as you outrun the cave-in (the collapse mini-story).
  flashLore(text) {
    const el = $('lore-flash');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // -- death -----------------------------------------------------------------
  showGameOver(data) {
    this._hideAll();
    $('go-score').textContent = Math.floor(data.score).toLocaleString();
    $('go-dist').textContent = Math.floor(data.distance).toLocaleString() + ' m';
    $('go-gems').innerHTML = `${gem} ${Math.floor(data.gemsCollected)} collected`;
    $('go-bank').innerHTML = `Bank now ${gem} ${Save.bank}`;
    $('go-mult').textContent = '×' + data.mult.toFixed(2);
    $('go-record').style.display = data.newBest ? 'block' : 'none';
    const keyEl = $('go-key');
    if (keyEl) keyEl.style.display = data.keyEarned ? 'block' : 'none';
    const mot = $('go-motivate');
    if (data.newBest) {
      mot.textContent = MOTIVATIONS[(Math.random() * MOTIVATIONS.length) | 0];
      mot.classList.add('show');
    } else {
      mot.classList.remove('show');
    }
    $('screen-gameover').classList.add('show');
    this.refreshBank();
  }
}
