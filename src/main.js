// ============================================================================
//  G-ROLL — main orchestrator.
//  Boots the renderer, owns the state machine (menu ▸ altar ▸ playing ▸ dead),
//  drives the fixed loop, applies curses, tallies glory, and stages the death.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { CONFIG, CURSES, curseById } from './config.js';
import { Save } from './save.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Spawner } from './spawner.js';
import { Embers, Blood } from './particles.js';
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
    this.spawner = new Spawner(this.world.scene, {});

    this.input = new Input();
    this.audio = new Audio(Save.muted);

    this.ui = new UI({
      onBegin: () => this.beginRun(),
      onAltar: () => { this.state = 'altar'; },
      onMenu: () => { this.state = 'menu'; },
      onMute: () => { const m = Save.toggleMute(); this.audio.setMuted(m); return m; },
    });

    this.state = 'menu';
    this.run = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());

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

    // Resolve curses & pay the toll in gems.
    const wanted = Save.activeCurses;
    let cost = 0;
    for (const id of wanted) { const c = curseById(id); if (c) cost += c.cost; }
    let active = wanted;
    if (cost > 0 && !Save.spendGems(cost)) {
      active = [];                 // couldn't afford — descend unburdened
      Save.setActiveCurses([]);
    }

    // Build per-run settings from CONFIG, then let each curse warp them.
    const s = {
      startSpeed: CONFIG.startSpeed, maxSpeed: CONFIG.maxSpeed, accel: CONFIG.accel,
      baseObstacleGap: CONFIG.baseObstacleGap, minObstacleGap: CONFIG.minObstacleGap,
      gemChance: CONFIG.gemChance,
      fogDensity: 0.028, viewCut: false, hazardFury: false, vertigo: false,
    };
    let mult = 1;
    for (const id of active) { const c = curseById(id); if (c) { c.apply(s); mult *= c.mult; } }

    // Push settings into the systems.
    this.world.setFogDensity(s.fogDensity);
    this.world.setVertigo(s.vertigo);
    this.spawner.opts = {
      gemChance: s.gemChance, baseGap: s.baseObstacleGap,
      minGap: s.minObstacleGap, hazardFury: s.hazardFury,
    };

    this.run = {
      settings: s, mult, elapsed: 0, speed: s.startSpeed,
      distance: 0, score: 0, gems: 0, curses: active.slice(),
      dieTimer: 0,
    };

    this.player.reset();
    this.spawner.reset();
    this.blood.reset();
    this.input.clear();
    this.input.enabled = true;

    this.audio.startDrone();
    this.ui.showHUD();
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
    this.world.addShake(CONFIG.cameraShakeDeath);
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
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.05) dt = 0.05;      // clamp after tab-switch / stutter

    if (this.state === 'playing') this._updatePlay(dt);
    else if (this.state === 'dying') this._updateDying(dt);
    else this._updateIdle(dt);

    this.renderer.render(this.world.scene, this.world.camera);
    requestAnimationFrame((t) => this._frame(t));
  }

  _updatePlay(dt) {
    const r = this.run;
    r.elapsed += dt;
    r.speed = Math.min(r.settings.maxSpeed, r.settings.startSpeed + r.settings.accel * r.elapsed);
    r.distance += r.speed * dt * 0.5;                 // metres (0.5 = feel tuning)
    r.score = r.distance * CONFIG.distanceToScore * r.mult;

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

    // collisions
    const hit = this.spawner.collide(this.player,
      (pos) => {                      // onGem
        r.gems += 1;
        this.audio.gem();
        this.ui.flashGem();
      },
      (pos) => {                      // onPad — springboard launch
        this.player.launch();
        this.audio.jump();
        this.world.addShake(0.25);
      });
    if (hit) { this.die(hit); return; }

    // heartbeat quickens with speed
    const speedPct = (r.speed - r.settings.startSpeed) / (r.settings.maxSpeed - r.settings.startSpeed);
    this.audio.updateHeart(dt, THREE.MathUtils.clamp(speedPct, 0, 1));

    this.ui.updateHUD({ score: r.score, gems: r.gems, mult: r.mult, speedPct: THREE.MathUtils.clamp(speedPct, 0, 1) });
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
