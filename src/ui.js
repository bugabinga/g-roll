// ============================================================================
//  UI — the menu, the Altar of Curses, the running HUD, and the death screen.
//  Pure DOM over the canvas. Reads the save bank; emits high-level intents.
// ============================================================================

import { Save } from './save.js';
import { CURSES, curseById, debuffById } from './config.js';

const $ = (id) => document.getElementById(id);
const gem = '<span class="gem-ico">◆</span>';

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

    $('go-again').onclick = () => this.h.onBegin();
    $('go-altar').onclick = () => this.showAltar();
    $('go-menu').onclick = () => this.showMenu();
  }

  // -- screen switching ------------------------------------------------------
  _hideAll() {
    for (const s of ['menu', 'altar', 'gameover', 'choice']) $('screen-' + s).classList.remove('show');
    $('hud').classList.remove('show');
  }

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
    let mult = 1, cost = 0;
    const chips = ids.map((id) => {
      const c = curseById(id); if (!c) return '';
      mult *= c.mult; cost += c.cost;
      return `<span class="curse-chip">${c.name}</span>`;
    }).join('');
    box.innerHTML = `${chips}<div class="curse-sum">Invocation ${gem}${cost} · Glory ×${mult.toFixed(2)}</div>`;
  }

  _renderAltar() {
    const list = $('altar-list');
    list.innerHTML = '';
    for (const c of CURSES) {
      const on = this.selected.has(c.id);
      const el = document.createElement('div');
      el.className = 'curse' + (on ? ' on' : '');
      el.innerHTML = `
        <div class="curse-head">
          <span class="curse-name">${c.name}</span>
          <span class="curse-mult">×${c.mult.toFixed(2)}</span>
        </div>
        <p class="curse-desc">${c.desc}</p>
        <div class="curse-foot">
          <span class="curse-cost">${gem} ${c.cost} to invoke</span>
          <span class="curse-toggle">${on ? 'INVOKED' : 'invoke'}</span>
        </div>`;
      el.onclick = () => {
        if (this.selected.has(c.id)) this.selected.delete(c.id);
        else this.selected.add(c.id);
        this._renderAltar();
      };
      list.appendChild(el);
    }
    // totals
    let mult = 1, cost = 0;
    for (const id of this.selected) { const c = curseById(id); if (c) { mult *= c.mult; cost += c.cost; } }
    const afford = Save.canAfford(cost);
    $('altar-total').innerHTML =
      `Total invocation: <b class="${afford ? '' : 'bad'}">${gem} ${cost}</b> · Glory <b>×${mult.toFixed(2)}</b>`;
    $('altar-bank').innerHTML = `Bank: ${gem} ${Save.bank}`;
    $('altar-confirm').disabled = !afford;
    $('altar-confirm').textContent = afford ? 'Seal the pact' : 'Not enough gems';
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
    $('screen-gameover').classList.add('show');
    this.refreshBank();
  }
}
