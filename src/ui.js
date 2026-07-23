// ============================================================================
//  UI — the menu, the Altar of Curses, the running HUD, and the death screen.
//  Pure DOM over the canvas. Reads the save bank; emits high-level intents.
// ============================================================================

import { Save } from './save.js';
import { CURSES, curseById, debuffById } from './config.js';
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
    for (const s of ['menu', 'altar', 'gameover', 'choice', 'intro', 'shop', 'settings']) $('screen-' + s).classList.remove('show');
    $('hud').classList.remove('show');
  }

  showSettings() {
    this._hideAll();
    $('set-sound').textContent = Save.muted ? '♪ muted' : '♪ sound';
    $('set-sound').classList.toggle('off', Save.muted);
    this._renderModes();
    $('screen-settings').classList.add('show');
    this.h.onSettings && this.h.onSettings();
  }

  _renderModes() {
    const MODES = [
      { id: 'night', name: 'Night', desc: 'The dread dark, torch-lit. The way it was meant to be played.' },
      { id: 'day', name: 'Day', desc: 'A wan grey daylight. Everything else plays normally.' },
      { id: 'bloodmoon', name: 'Bloodmoon', tag: '2× SPEED · 2× COINS', desc: 'The sky drowns in blood. Twice as fast, twice the runes — for the fearless.' },
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

  showIntro(name) {
    this._hideAll();
    $('intro-name').textContent = name;
    $('screen-intro').classList.add('show');
  }

  hideIntro() { $('screen-intro').classList.remove('show'); }

  showMenu() {
    this._hideAll();
    this.refreshBank();
    this._renderMenuCurses();
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

  showShop() {
    this._hideAll();
    if (this.selectedSkin == null) this.selectedSkin = 0;
    this._renderShop();
    this._selectSkin(this.selectedSkin);
    $('screen-shop').classList.add('show');
    this.h.onShop && this.h.onShop();
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
  }

  _openLootbox() {
    const COST = 500;
    const res = $('lootbox-result');
    if (!Save.spendGems(COST)) {
      res.textContent = 'Not enough gems.'; res.className = 'lootbox-result show dupe';
      return;
    }
    const pool = SKINS.filter((s) => !s.defaultOwned && !s.mythic);   // the buyable bodies
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
    this._renderShop();
    this._selectSkin(idx);                    // reveal the winning body in the turntable
    this.refreshBank();
    res.textContent = msg;
    res.className = 'lootbox-result show ' + tone;
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

  // -- death -----------------------------------------------------------------
  showGameOver(data) {
    this._hideAll();
    $('go-score').textContent = Math.floor(data.score).toLocaleString();
    $('go-dist').textContent = Math.floor(data.distance).toLocaleString() + ' m';
    $('go-gems').innerHTML = `${gem} ${Math.floor(data.gemsCollected)} collected`;
    $('go-bank').innerHTML = `Bank now ${gem} ${Save.bank}`;
    $('go-mult').textContent = '×' + data.mult.toFixed(2);
    $('go-record').style.display = data.newBest ? 'block' : 'none';
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
