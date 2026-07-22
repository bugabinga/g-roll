// ============================================================================
//  Input — keyboard + touch swipe, distilled into four intents.
//  Actions are buffered so a press slightly early still lands.
// ============================================================================

import { CONFIG } from './config.js';

export class Input {
  constructor() {
    this.left = false;   // consumed one-shot intents
    this.right = false;
    this.jump = false;
    this.roll = false;

    // buffer timestamps (seconds since bind) so we can honour early presses
    this._buf = { left: -1, right: -1, jump: -1, roll: -1 };
    this._t = 0;
    this.enabled = false;

    this._touchStart = null;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': this._press('left'); e.preventDefault(); break;
        case 'ArrowRight': case 'KeyD': this._press('right'); e.preventDefault(); break;
        case 'ArrowUp': case 'KeyW': case 'Space': this._press('jump'); e.preventDefault(); break;
        case 'ArrowDown': case 'KeyS': this._press('roll'); e.preventDefault(); break;
      }
    });

    const el = document.body;
    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      const t = e.changedTouches[0];
      this._touchStart = { x: t.clientX, y: t.clientY, t: this._t };
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      if (!this.enabled || !this._touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - this._touchStart.x;
      const dy = t.clientY - this._touchStart.y;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      const THRESH = 24;
      if (adx < THRESH && ady < THRESH) {
        this._press('jump'); // tap = jump
      } else if (adx > ady) {
        this._press(dx > 0 ? 'right' : 'left');
      } else {
        this._press(dy > 0 ? 'roll' : 'jump');
      }
      this._touchStart = null;
    }, { passive: true });
  }

  _press(name) {
    this._buf[name] = this._t;
  }

  // Advance internal clock; call once per frame before reading intents.
  update(dt) {
    this._t += dt;
    this.left = this._consume('left');
    this.right = this._consume('right');
    this.jump = this._consume('jump');
    this.roll = this._consume('roll');
  }

  _consume(name) {
    const ts = this._buf[name];
    if (ts >= 0 && this._t - ts <= CONFIG.inputBuffer) {
      this._buf[name] = -1;
      return true;
    }
    if (ts >= 0 && this._t - ts > CONFIG.inputBuffer) this._buf[name] = -1;
    return false;
  }

  clear() {
    this._buf = { left: -1, right: -1, jump: -1, roll: -1 };
    this.left = this.right = this.jump = this.roll = false;
  }
}
