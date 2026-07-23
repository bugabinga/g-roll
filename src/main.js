// ============================================================================
//  G-ROLL — main orchestrator.
//  Boots the renderer, owns the state machine (menu ▸ altar ▸ playing ▸ dead),
//  drives the fixed loop, applies curses, tallies glory, and stages the death.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { CONFIG, CURSES, curseById, DEBUFFS, CHALLENGES } from './config.js';
import { Save } from './save.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Spawner } from './spawner.js';
import { Embers, Blood, Sparks } from './particles.js';
import { SkinPreview } from './preview.js';
import { UI } from './ui.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    // Mobile GPUs choke on high pixel ratios — cap hard. Phones report 2–3x;
    // rendering at 1.5x is the single biggest perf win with little visible cost.
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.72;

    this.world = new World();
    this.player = new Player(this.world.scene);
    this.embers = new Embers(this.world.scene);
    this.blood = new Blood(this.world.scene);
    this.sparks = new Sparks(this.world.scene);
    this.spawner = new Spawner(this.world.scene, {});

    this.input = new Input();
    this.audio = new Audio(Save.muted);

    this.ui = new UI({
      onBegin: () => this.beginRun(),
      onAltar: () => { this.state = 'altar'; },
      onShop: () => { this.state = 'shop'; },
      onSettings: () => { this.state = 'settings'; },
      onGround: (t) => { this.world.setGround(t); },   // live preview in settings
      onMenu: () => { this.state = 'menu'; },
      onMute: () => { const m = Save.toggleMute(); this.audio.setMuted(m); return m; },
    });

    // live 3D turntable for the Wardrobe (own tiny renderer; degrade gracefully)
    try {
      this.preview = new SkinPreview(document.getElementById('skin-preview'));
      this.ui.setPreview(this.preview);
    } catch (e) { this.preview = null; console.warn('skin preview unavailable', e); }

    this.state = 'menu';
    this.run = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.world.setGround(Save.ground);
    this.player.hide();
    this.ui.showMenu();

    this._last = performance.now();
    requestAnimationFrame((t) => this._frame(t));
  }

  // -- run lifecycle ---------------------------------------------------------
  beginRun() {
    this.audio.resume();
    // clear any leftover death FX
    this.canvas.classList.remove('dead-fx');
    const flash = document.getElementById('death-flash');
    if (flash) flash.classList.remove('show');

    // Curses are unlocked once at the altar, then free to wear every run.
    const active = Save.activeCurses;

    // Build per-run settings from CONFIG, then let each curse warp them.
    const s = {
      startSpeed: CONFIG.startSpeed, maxSpeed: CONFIG.maxSpeed, accel: CONFIG.accel,
      baseObstacleGap: CONFIG.baseObstacleGap, minObstacleGap: CONFIG.minObstacleGap,
      gemChance: CONFIG.gemChance,
      fogDensity: 0.016, viewCut: false, hazardFury: false, vertigo: false,
      dim: false, beastHeavy: false,
    };
    let mult = 1;
    for (const id of active) { const c = curseById(id); if (c) { c.apply(s); mult *= c.mult; } }

    // mode chosen in Settings: day / night / bloodmoon / challenge
    const chosen = Save.mode;
    let visual = chosen, gemYield = 1, fortune = null;
    if (chosen === 'challenge') {
      // roll a random fortune — lucky or unlucky
      fortune = CHALLENGES[(Math.random() * CHALLENGES.length) | 0];
      const ctx = { gemYield: 1, visual: ['night', 'day', 'bloodmoon'][(Math.random() * 3) | 0] };
      fortune.apply(s, ctx);
      visual = ctx.visual; gemYield = ctx.gemYield;
    } else if (chosen === 'bloodmoon') {
      // 2x faster — but widen the gaps so it stays survivable
      s.startSpeed *= 2; s.maxSpeed *= 2;
      s.baseObstacleGap *= 1.8; s.minObstacleGap *= 1.8;
      gemYield = 2;
    }
    this.world.setMode(visual);
    this.world.setGround(Save.ground);
    if (visual === 'day') s.fogDensity *= 0.72;
    this._runGemYield = gemYield;
    this._fortune = fortune;

    // Push settings into the systems.
    this.world.setFogDensity(s.fogDensity);
    this.world.setVertigo(s.vertigo);
    this.renderer.toneMappingExposure = s.dim ? 1.02 : 1.72;   // Starless Night dims the world
    this.spawner.opts = {
      gemChance: s.gemChance, baseGap: s.baseObstacleGap,
      minGap: s.minObstacleGap, hazardFury: s.hazardFury, beastHeavy: s.beastHeavy,
    };

    this.run = {
      settings: s, mult, elapsed: 0, speed: s.startSpeed,
      distance: 0, score: 0, bonus: 0, gems: 0, curses: active.slice(),
      dieTimer: 0,
      gemYield: this._runGemYield,   // Bloodmoon / fortunes scale every rune's worth
      fortune: this._fortune,        // the rolled Challenge fortune (null otherwise)
      nextChoiceAt: 40,       // seconds of play until the next forced wound
      debuffs: [],            // ids of wounds taken this run
    };

    this.player.reset();          // rolls this run's character
    this.spawner.reset();
    this.blood.reset();
    this.sparks.reset();
    this.input.clear();
    this.input.enabled = false;   // the intro is non-interactive

    this.audio.startDrone();
    this.run.introT = 0;
    this.ui.showIntro(this.player.variantName, this._fortune);
    this.state = 'intro';
  }

  // ~3s pre-run showcase: a hero shot of your character, then the camera pulls
  // back into gameplay and control is handed over.
  _updateIntro(dt) {
    const r = this.run;
    r.introT += dt;
    const INTRO = 3.2;
    const t = Math.min(1, r.introT / INTRO);
    const prep = t < 0.68 ? 0 : (t - 0.68) / 0.32;   // ease into the run in the last third

    this.world.setSpeed(2.5);
    this.world.update(dt);                             // sets its own camera; we override below
    this.embers.update(dt, 2.5, this.world.camera.position.z);
    this.blood.update(dt);
    this.sparks.update(dt);
    this.player.introUpdate(dt, prep);

    // camera: close hero shot, gently orbiting, then lerp back to the game view
    const cam = this.world.camera;
    const orbit = Math.sin(r.introT * 0.9) * 0.7;
    const e = prep * prep * (3 - 2 * prep);
    cam.position.set(
      THREE.MathUtils.lerp(orbit, 0, e),
      THREE.MathUtils.lerp(1.75, this.world._camBaseY, e),
      THREE.MathUtils.lerp(3.9, 8.4, e),
    );
    cam.rotation.z = 0;
    const lx = THREE.MathUtils.lerp(orbit * 0.4, 0, e);
    const ly = THREE.MathUtils.lerp(1.25, 1.4, e);
    const lz = THREE.MathUtils.lerp(0, -6, e);
    cam.lookAt(lx, ly, lz);

    if (r.introT >= INTRO) this._startRunning();
  }

  _startRunning() {
    this.player.group.rotation.y = 0;    // face forward for the run
    this.input.clear();
    this.input.enabled = true;
    this.ui.hideIntro();
    this.ui.showHUD();
    this.state = 'playing';
  }

  // -- forced wound choice (every minute) -----------------------------------
  openChoice() {
    if (this.state !== 'playing') return;
    this.state = 'choosing';
    this.input.enabled = false;
    this.audio.toll();
    // offer 3 distinct wounds, favouring ones not yet taken so choices feel fresh
    const taken = new Set(this.run.debuffs);
    const pool = DEBUFFS.slice().sort(() => Math.random() - 0.5);
    pool.sort((a, b) => (taken.has(a.id) ? 1 : 0) - (taken.has(b.id) ? 1 : 0));
    const picks = pool.slice(0, 3);
    this.ui.showChoice(picks, (d) => this.chooseDebuff(d));
  }

  chooseDebuff(d) {
    if (this.state !== 'choosing') return;
    d.apply(this);
    this.run.gemYield += d.gemBonus;
    this.run.debuffs.push(d.id);
    this.run.nextChoiceAt += 40;
    this.ui.hideChoice();
    this.audio.roll();          // a wet, resigned whoosh as the wound takes hold
    this.world.addShake(0.4);
    this.input.clear();
    this.input.enabled = true;
    this.state = 'playing';
  }

  die(cause) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.run.dieTimer = 2.2;

    // GTA-style death moment: desaturate the world and slam up "YOU DIED"
    this.canvas.classList.add('dead-fx');
    const flash = document.getElementById('death-flash');
    if (flash) { flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show'); }
    this.player.alive = false;
    this.input.enabled = false;
    const p = this.player.group.position;
    this.blood.burst(p.x, p.y + 1.0, p.z);
    if (cause && cause.type === 'bomb') {
      this.sparks.burst(p.x, p.y + 0.8, p.z, 1.6);   // fiery blast
      this.audio.explosion();
    }
    this.world.addShake(cause && cause.type === 'bomb' ? 1.3 : CONFIG.cameraShakeDeath);
    this.audio.death();
    this.audio.stopDrone();
    // banking happens once, at the transition to the death screen
  }

  finishRun() {
    const r = this.run;
    // clear the death FX and hand off to the stats screen
    this.canvas.classList.remove('dead-fx');
    const flash = document.getElementById('death-flash');
    if (flash) flash.classList.remove('show');
    Save.addGems(r.gems);
    const { newBest } = Save.recordRun(Math.floor(r.score), r.distance);
    if (newBest && r.score > 0) this.audio.toll();
    this.player.hide();
    this.state = 'dead';
    this.ui.showGameOver({
      score: r.score, distance: r.distance, gemsCollected: r.gems,
      mult: r.mult, newBest: newBest && r.score > 0,
    });
  }

  // -- the loop --------------------------------------------------------------
  _frame(now) {
    // Schedule the next frame FIRST so a thrown error can never kill the loop
    // (a silent freeze is far worse than one dropped frame).
    requestAnimationFrame((t) => this._frame(t));

    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05;      // clamp after tab-switch / stutter

    try {
      if (this.state === 'playing') this._updatePlay(dt);
      else if (this.state === 'intro') this._updateIntro(dt);
      else if (this.state === 'dying') this._updateDying(dt);
      else if (this.state === 'choosing') { /* frozen: render the paused scene only */ }
      else this._updateIdle(dt);

      this.renderer.render(this.world.scene, this.world.camera);
      if (this.state === 'shop' && this.preview) this.preview.update(dt);
    } catch (err) {
      console.error('[g-roll] frame error:', err);
    }
  }

  _updatePlay(dt) {
    const r = this.run;
    r.elapsed += dt;
    r.speed = Math.min(r.settings.maxSpeed, r.settings.startSpeed + r.settings.accel * r.elapsed);
    // Warm-up grace: the first few seconds are empty road — no gems, no score —
    // so you never bank points before you've had a single obstacle to dodge.
    const warming = r.elapsed < CONFIG.scoreGrace;
    this.spawner.noGems = warming;
    if (!warming) {
      r.distance += r.speed * dt * 0.5;               // metres (0.5 = feel tuning)
      r.score = r.distance * CONFIG.distanceToScore * r.mult + r.bonus;
    }

    // input → intents
    this.input.update(dt);
    if (this.input.left) this.player.moveLane(-1);
    if (this.input.right) this.player.moveLane(1);
    if (this.input.jump && this.player.jump()) this.audio.jump();
    if (this.input.roll && this.player.roll()) this.audio.roll();

    this.player.update(dt);
    this.world.setSpeed(r.speed);
    this.world.update(dt);
    this.spawner.update(dt, r.speed, this.player);
    this.embers.update(dt, r.speed, this.world.camera.position.z);
    this.blood.update(dt);
    this.sparks.update(dt);

    // collisions
    const hit = this.spawner.collide(this.player,
      (pos) => {                      // onGem — worth more the more wounds you carry
        r.gems += r.gemYield;
        this.audio.gem();
        this.ui.flashGem();
      },
      (pos) => {                      // onPad — springboard launch
        this.player.launch();
        this.audio.jump();
        this.world.addShake(0.25);
      },
      (pos) => {                      // onBomb — landed on top of an explosive
        r.bonus += 75 * r.mult;
        if (this.player.vy < 0) this.player.vy = CONFIG.jumpVelocity * 0.6; // little bounce
        this.audio.bombBounce();
        this.sparks.burst(pos.x, pos.y + 0.6, pos.z, 0.6);
        this.world.addShake(0.2);
      });
    if (hit) { this.die(hit); return; }

    // heartbeat quickens with speed; music escalates with time survived
    const speedPct = (r.speed - r.settings.startSpeed) / (r.settings.maxSpeed - r.settings.startSpeed);
    const clampedSpeed = THREE.MathUtils.clamp(speedPct, 0, 1);
    this.audio.updateHeart(dt, clampedSpeed);
    const musicIntensity = Math.max(Math.min(1, r.elapsed / 90), clampedSpeed * 0.75);
    this.audio.updateMusic(dt, musicIntensity);

    this.ui.updateHUD({
      score: r.score, gems: r.gems, mult: r.mult,
      speedPct: THREE.MathUtils.clamp(speedPct, 0, 1),
      gemYield: r.gemYield, debuffs: r.debuffs,
    });

    // every minute survived, the corridor stops and demands a wound
    if (r.elapsed >= r.nextChoiceAt) this.openChoice();
  }

  _updateDying(dt) {
    const r = this.run;
    r.dieTimer -= dt;
    const slow = 0.22;                               // slow-mo the world
    this.world.setSpeed(r.speed * slow);
    this.world.update(dt);
    this.spawner.update(dt * slow, r.speed, this.player);
    this.embers.update(dt, r.speed * slow, this.world.camera.position.z);
    this.blood.update(dt);
    this.sparks.update(dt);
    if (r.dieTimer <= 0) this.finishRun();
  }

  _updateIdle(dt) {
    // gentle life on the menus: drift the world slowly so it never feels dead
    this.world.setSpeed(4);
    this.world.update(dt);
    this.embers.update(dt, 4, this.world.camera.position.z);
    this.blood.update(dt);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.world.resize(w, h);
  }
}

// boot once the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.__groll = new Game();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('fatal');
    if (el) { el.style.display = 'flex'; el.querySelector('pre').textContent = String(err && err.stack || err); }
  }
});
