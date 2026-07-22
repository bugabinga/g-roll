// ============================================================================
//  The Roller — a hooded, hollowed soul fleeing down the corridor.
//  Built procedurally: cloak, hood, faint soul-light. Handles lane / jump / roll.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { LANES, CONFIG } from './config.js';

export const STAND_HEIGHT = 1.8;
export const ROLL_HEIGHT = 0.78;

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.laneIndex = 1;
    this.x = LANES[1];
    this.targetX = LANES[1];
    this.y = 0;            // feet height above floor
    this.vy = 0;
    this.airborne = false;
    this.rolling = false;
    this.rollTimer = 0;
    this._laneT = 0;
    this._laneFrom = LANES[1];
    this._runCycle = 0;
    this._coyote = 0;
    this.alive = true;

    this._build();
    this.group.position.set(this.x, 0, 0);
    scene.add(this.group);
  }

  _build() {
    const g = this.group;

    // --- materials: charcoal armour, crimson cloth, molten-gold soul glow ---
    const armor = new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.5, metalness: 0.55 });
    const trim  = new THREE.MeshStandardMaterial({ color: 0x2c2c3a, roughness: 0.4, metalness: 0.7 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a0d0d, roughness: 1.0 });
    const glow  = new THREE.MeshBasicMaterial({ color: 0xffb340 });          // unlit = free glow
    const glowHot = new THREE.MeshBasicMaterial({ color: 0xffe08a });

    const pivot = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };

    // --- legs (pivot at the hip so they swing when running) ---
    const mkLeg = (sx) => {
      const p = pivot(sx * 0.17, 0.74, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 4, 7), armor);
      thigh.position.y = -0.3; p.add(thigh);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), trim);
      boot.position.set(0, -0.64, 0.05); p.add(boot);
      return p;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    // --- torso: armoured chest with a molten soul-core ---
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.62, 8), armor);
    torso.position.y = 1.06; g.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 8), cloth);
    belt.position.y = 0.78; g.add(belt);

    // the soul-core (glows, and is the character's only light — 1 total)
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), glowHot);
    core.position.set(0, 1.12, 0.24); g.add(core);
    this.core = core;
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.35 }));
    halo.position.copy(core.position); g.add(halo); this.halo = halo;
    const soul = new THREE.PointLight(0xffa23a, 3.2, 6, 2);
    soul.position.set(0, 1.15, 0.2); g.add(soul);
    this.soul = soul;

    // --- pauldrons (knightly shoulders) ---
    for (const sx of [-1, 1]) {
      const pa = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI*2, 0, Math.PI*0.6), trim);
      pa.position.set(sx * 0.34, 1.34, 0); g.add(pa);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), trim);
      spike.position.set(sx * 0.34, 1.5, 0); g.add(spike);
    }

    // --- arms (pivot at shoulder, swing opposite the legs) ---
    const mkArm = (sx) => {
      const p = pivot(sx * 0.36, 1.3, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.44, 4, 7), armor);
      arm.position.y = -0.26; p.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), cloth);
      hand.position.y = -0.5; p.add(hand);
      return p;
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    // --- hooded head with ember eyes ---
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI*2, 0, Math.PI*0.7), cloth);
    hood.position.y = 1.62; hood.rotation.x = -0.12; g.add(hood);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    face.position.set(0, 1.58, 0.06); g.add(face);
    for (const sx of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), glow);
      eye.position.set(sx, 1.6, 0.2); g.add(eye);
    }
    this.head = hood;

    // --- tattered cape trailing behind (toward the camera as you run) ---
    const capePivot = pivot(0, 1.34, 0.14);
    const capeGeo = new THREE.PlaneGeometry(0.62, 1.05, 1, 4);
    const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    cape.position.set(0, -0.5, 0.02);
    capePivot.add(cape);
    this.cape = capePivot;
    this._capeGeo = capeGeo;
  }

  // -------------------------------------------------------------------------
  moveLane(dir) {
    if (!this.alive) return;
    const next = Math.min(LANES.length - 1, Math.max(0, this.laneIndex + dir));
    if (next === this.laneIndex) return;
    this.laneIndex = next;
    this._laneFrom = this.x;
    this.targetX = LANES[next];
    this._laneT = 0;
  }

  jump() {
    if (!this.alive) return;
    const grounded = !this.airborne || this._coyote > 0;
    if (!grounded) return;
    this.vy = CONFIG.jumpVelocity;
    this.airborne = true;
    this._coyote = 0;
    this.rolling = false;
    this.rollTimer = 0;
    return true;
  }

  launch() {
    // hurled skyward by a jump pad — bigger than a normal leap, ignores grounding
    if (!this.alive) return;
    this.vy = CONFIG.jumpVelocity * 1.45;
    this.airborne = true;
    this._coyote = 0;
    this.rolling = false;
    this.rollTimer = 0;
    return true;
  }

  roll() {
    if (!this.alive) return;
    // a roll can be initiated on the ground; in the air it slams you down fast
    if (this.airborne) { this.vy = -CONFIG.jumpVelocity * 1.4; }
    this.rolling = true;
    this.rollTimer = CONFIG.rollTime;
    return true;
  }

  update(dt) {
    // lane interpolation
    if (this._laneT < 1) {
      this._laneT = Math.min(1, this._laneT + dt / CONFIG.laneChangeTime);
      const t = this._laneT;
      const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; // easeInOut
      this.x = this._laneFrom + (this.targetX - this._laneFrom) * e;
    } else {
      this.x = this.targetX;
    }

    // vertical physics
    if (this.airborne) {
      this.vy += CONFIG.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.airborne = false; this._coyote = CONFIG.coyoteTime;
      }
    } else {
      this._coyote = Math.max(0, this._coyote - dt);
    }

    // roll timer
    if (this.rolling) {
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) { this.rolling = false; }
    }

    this._animate(dt);
  }

  _animate(dt) {
    const g = this.group;
    g.position.x = this.x;
    g.position.y = this.y;

    // lean into the lane change
    const lean = (this.targetX - this.x) * -0.35;
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, lean, 0.2);

    this._runCycle += dt * 13;
    const s = Math.sin(this._runCycle);
    const lerp = THREE.MathUtils.lerp;

    if (this.airborne) {
      // leap pose: legs tucked, arms thrown back, cape flared out
      this.legL.rotation.x = lerp(this.legL.rotation.x, 1.15, 0.3);
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0.7, 0.3);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.2, 0.3);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.2, 0.3);
      this.cape.rotation.x = lerp(this.cape.rotation.x, -1.1, 0.25);
    } else if (!this.rolling) {
      // sprint: legs and arms swing in opposition
      const amp = 0.95;
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      this.armL.rotation.x = -s * amp * 0.8;
      this.armR.rotation.x = s * amp * 0.8;
      this.cape.rotation.x = lerp(this.cape.rotation.x, -0.5 + s * 0.12, 0.3);
    }

    // roll squash: tuck the whole figure low & spin forward
    const targetScaleY = this.rolling ? ROLL_HEIGHT / STAND_HEIGHT : 1;
    g.scale.y = lerp(g.scale.y, targetScaleY, 0.35);
    if (this.rolling) {
      g.rotation.x = lerp(g.rotation.x, -Math.PI * 1.6, 0.35);
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0.6, 0.4);
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0.6, 0.4);
    } else {
      g.rotation.x = lerp(g.rotation.x, 0, 0.3);
    }

    // soul-core pulse + light flicker (its glow is what makes the figure pop)
    const pulse = 0.85 + Math.sin(this._runCycle * 0.7) * 0.15 + Math.random() * 0.1;
    this.core.scale.setScalar(pulse);
    if (this.halo) this.halo.scale.setScalar(1 + Math.sin(this._runCycle) * 0.18);
    this.soul.intensity = 2.8 + Math.sin(this._runCycle * 1.3) * 0.6 + Math.random() * 0.3;
  }

  // vertical extents of the collision volume in world space
  get bottom() { return this.y; }
  get top() { return this.y + (this.rolling ? ROLL_HEIGHT : STAND_HEIGHT); }

  reset() {
    this.laneIndex = 1;
    this.x = this.targetX = this._laneFrom = LANES[1];
    this.y = this.vy = 0;
    this.airborne = false; this.rolling = false; this.rollTimer = 0;
    this._laneT = 1; this._coyote = 0; this.alive = true;
    this.group.visible = true;
    this.group.scale.set(1, 1, 1);
    this.group.rotation.set(0, 0, 0);
    this.group.position.set(this.x, 0, 0);
    for (const p of [this.legL, this.legR, this.armL, this.armR, this.cape]) {
      if (p) p.rotation.set(0, 0, 0);
    }
  }

  hide() { this.group.visible = false; }
}
