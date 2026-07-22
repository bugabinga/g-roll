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

    // --- cloak (tapered body) ---
    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0x14110f, roughness: 0.95, metalness: 0.0,
    });
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.55, 8, 1, true), cloakMat);
    cloak.position.y = 0.78;
    cloak.castShadow = true;
    g.add(cloak);
    this.cloak = cloak;

    // torso underlayer (bloodied wrappings)
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a1414, roughness: 1.0 })
    );
    torso.position.y = 0.95;
    g.add(torso);

    // --- hood + head ---
    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI*2, 0, Math.PI*0.62),
      cloakMat
    );
    hood.position.y = 1.72;
    hood.rotation.x = -0.15;
    hood.castShadow = true;
    g.add(hood);
    this.hood = hood;

    // the void where a face should be, with two faint soul-lights
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });
    for (const sx of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
      eye.position.set(sx, 1.66, 0.24);
      g.add(eye);
    }
    const soul = new THREE.PointLight(0xff6a2a, 2.2, 4.5, 2);
    soul.position.set(0, 1.6, 0.2);
    g.add(soul);
    this.soul = soul;

    // --- arms hint ---
    const armMat = cloakMat;
    for (const sx of [-0.5, 0.5]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 3, 6), armMat);
      arm.position.set(sx, 1.05, 0);
      arm.rotation.z = sx * 0.35;
      g.add(arm);
      if (sx < 0) this.armL = arm; else this.armR = arm;
    }
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

    // run bob
    this._runCycle += dt * 12;
    const bob = this.airborne ? 0 : Math.abs(Math.sin(this._runCycle)) * 0.06;
    this.cloak.position.y = 0.78 + bob;
    if (this.armL) { this.armL.rotation.x = Math.sin(this._runCycle) * 0.8; this.armR.rotation.x = -Math.sin(this._runCycle) * 0.8; }

    // roll squash: tuck the whole figure low & spin forward
    const targetScaleY = this.rolling ? ROLL_HEIGHT / STAND_HEIGHT : 1;
    g.scale.y = THREE.MathUtils.lerp(g.scale.y, targetScaleY, 0.35);
    if (this.rolling) {
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -Math.PI * 1.6, 0.35);
    } else {
      g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, 0.3);
    }

    // soul-light flicker
    this.soul.intensity = 2.0 + Math.sin(performance.now() * 0.02) * 0.5 + Math.random() * 0.3;
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
  }

  hide() { this.group.visible = false; }
}
