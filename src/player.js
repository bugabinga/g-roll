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
    this.groundY = 0;      // current floor height under the player (ramps raise it)
    this.airborne = false;
    this.rolling = false;
    this.rollTimer = 0;
    this.rollCooldown = 0;
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

    // One shared soul-light (keeps the scene's light count fixed no matter which
    // body is worn) — its colour/position is set per variant in _selectVariant.
    this.soul = new THREE.PointLight(0xffa23a, 3.2, 6, 2);
    this.soul.position.set(0, 1.15, 0.2);
    g.add(this.soul);

    // Three purely-cosmetic bodies. Identical silhouette height, identical rig,
    // identical collision — NO gameplay difference between them.
    this.variants = [buildKnight(), buildRevenant(), buildWretch()];
    for (const v of this.variants) { v.group.visible = false; g.add(v.group); }

    this._selectVariant();
  }

  // Roll a body for this run: exactly 1-in-3 each, cosmetic only.
  _selectVariant() {
    const idx = Math.floor(Math.random() * this.variants.length);
    this.variantIndex = idx;
    for (let i = 0; i < this.variants.length; i++) this.variants[i].group.visible = (i === idx);
    const v = this.variants[idx];
    this.legL = v.legL; this.legR = v.legR;
    this.armL = v.armL; this.armR = v.armR;
    this.core = v.core; this.halo = v.halo; this.cape = v.cape; this.head = v.head;
    this.soul.color.setHex(v.soulColor);
    if (v.core) this.soul.position.set(v.core.position.x, v.core.position.y, v.core.position.z + 0.05);
    return idx;
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
    // can't chain rolls: must finish the current one and stand briefly first.
    // (blocks holding/spamming "down" to slide under everything forever)
    if (this.rolling || this.rollCooldown > 0) return false;
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

    // vertical physics (groundY tracks ramps / platform tops)
    if (this.airborne) {
      this.vy += CONFIG.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= this.groundY) {
        this.y = this.groundY; this.vy = 0; this.airborne = false; this._coyote = CONFIG.coyoteTime;
      }
    } else {
      if (this.groundY < this.y - 0.02) {
        this.airborne = true; this.vy = 0;      // ran off an edge → fall
      } else {
        this.y = this.groundY;                  // glued to the (possibly rising) ground
      }
      this._coyote = Math.max(0, this._coyote - dt);
    }

    // roll timer + cooldown (forces a standing gap between rolls).
    // The timer is FROZEN while airborne: a mid-air roll stays a tucked dive and
    // the full ground-roll plays out once you actually land.
    if (this.rolling) {
      if (!this.airborne) {
        this.rollTimer -= dt;
        if (this.rollTimer <= 0) { this.rolling = false; this.rollCooldown = CONFIG.rollCooldown; }
      }
    } else if (this.rollCooldown > 0) {
      this.rollCooldown = Math.max(0, this.rollCooldown - dt);
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
      if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, -1.1, 0.25);
    } else if (!this.rolling) {
      // sprint: legs and arms swing in opposition
      const amp = 0.95;
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      this.armL.rotation.x = -s * amp * 0.8;
      this.armR.rotation.x = s * amp * 0.8;
      if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, -0.5 + s * 0.12, 0.3);
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
    this.groundY = 0;
    this.airborne = false; this.rolling = false; this.rollTimer = 0; this.rollCooldown = 0;
    this._laneT = 1; this._coyote = 0; this.alive = true;
    this._selectVariant();                 // roll a fresh body (1-in-3, cosmetic)
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

// ============================================================================
//  Three cosmetic bodies. Each returns the same rig shape:
//  { group, legL, legR, armL, armR, head, core, halo, cape|null, soulColor }
//  All ~1.8 tall with limbs to the floor — collision is identical regardless.
// ============================================================================
function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }

// (1) The Hollow Knight — armoured wraith, amber soul, tattered cape.
function buildKnight() {
  const g = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.5, metalness: 0.55 });
  const trim  = new THREE.MeshStandardMaterial({ color: 0x2c2c3a, roughness: 0.4, metalness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a0d0d, roughness: 1.0 });
  const glow  = new THREE.MeshBasicMaterial({ color: 0xffb340 });
  const glowHot = new THREE.MeshBasicMaterial({ color: 0xffe08a });

  const mkLeg = (sx) => {
    const p = pivot(g, sx * 0.17, 0.74, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.42, 4, 7), armor); thigh.position.y = -0.3; p.add(thigh);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), trim); boot.position.set(0, -0.64, 0.05); p.add(boot);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.62, 8), armor); torso.position.y = 1.06; g.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 8), cloth); belt.position.y = 0.78; g.add(belt);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), glowHot); core.position.set(0, 1.12, 0.24); g.add(core);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.35 })); halo.position.copy(core.position); g.add(halo);

  for (const sx of [-1, 1]) {
    const pa = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI*2, 0, Math.PI*0.6), trim); pa.position.set(sx * 0.34, 1.34, 0); g.add(pa);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), trim); spike.position.set(sx * 0.34, 1.5, 0); g.add(spike);
  }

  const mkArm = (sx) => {
    const p = pivot(g, sx * 0.36, 1.3, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.44, 4, 7), armor); arm.position.y = -0.26; p.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), cloth); hand.position.y = -0.5; p.add(hand);
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI*2, 0, Math.PI*0.7), cloth); hood.position.y = 1.62; hood.rotation.x = -0.12; g.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0x050505 })); face.position.set(0, 1.58, 0.06); g.add(face);
  for (const sx of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), glow); eye.position.set(sx, 1.6, 0.2); g.add(eye); }

  const capePivot = pivot(g, 0, 1.34, 0.14);
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.05, 1, 4), new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 1, side: THREE.DoubleSide })); cape.position.set(0, -0.5, 0.02); capePivot.add(cape);

  return { group: g, legL, legR, armL, armR, head: hood, core, halo, cape: capePivot, soulColor: 0xffa23a };
}

// (2) The Bone Revenant — a skeleton: skull, ribcage, crimson soul-fire.
function buildRevenant() {
  const g = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: 0xcabfa2, roughness: 0.7, metalness: 0.05 });
  const darkBone = new THREE.MeshStandardMaterial({ color: 0x8a8069, roughness: 0.85 });
  const glowR = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

  const mkLeg = (sx) => {
    const p = pivot(g, sx * 0.15, 0.72, 0);
    const femur = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.4, 3, 6), bone); femur.position.y = -0.28; p.add(femur);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.32, 3, 6), bone); shin.position.y = -0.56; p.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), darkBone); foot.position.set(0, -0.72, 0.05); p.add(foot);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), bone); pelvis.position.y = 0.8; g.add(pelvis);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), bone); spine.position.y = 1.12; g.add(spine);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.016, 0.022, 4, 8, Math.PI * 1.1), bone);
    rib.position.set(0, 0.93 + i * 0.11, 0); rib.rotation.x = Math.PI / 2; rib.rotation.z = -Math.PI * 0.05; g.add(rib);
  }

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), glowR); core.position.set(0, 1.04, 0.05); g.add(core);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.3 })); halo.position.copy(core.position); g.add(halo);

  const mkArm = (sx) => {
    const p = pivot(g, sx * 0.25, 1.3, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.32, 3, 6), bone); upper.position.y = -0.22; p.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.28, 3, 6), bone); fore.position.y = -0.46; p.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), darkBone); hand.position.y = -0.62; p.add(hand);
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  for (const sx of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.088, 6, 6), bone); sh.position.set(sx * 0.25, 1.3, 0); g.add(sh); }

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 9), bone); skull.position.y = 1.6; g.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.2), bone); jaw.position.set(0, 1.47, 0.02); g.add(jaw);
  for (const sx of [-0.07, 0.07]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 7), new THREE.MeshBasicMaterial({ color: 0x120000 })); socket.position.set(sx, 1.62, 0.13); g.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), glowR); eye.position.set(sx, 1.62, 0.17); g.add(eye);
  }

  return { group: g, legL, legR, armL, armR, head: skull, core, halo, cape: null, soulColor: 0xff2a2a };
}

// (3) The Ember Wretch — a cracked, molten horror, glowing lava seams, horns.
function buildWretch() {
  const g = new THREE.Group();
  const char = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.85, metalness: 0.1 });
  const emberGlow = new THREE.MeshBasicMaterial({ color: 0xff5a1e });
  const crackMat = () => new THREE.MeshBasicMaterial({ color: 0xff6a12, wireframe: true, transparent: true, opacity: 0.5 });

  const mkLeg = (sx) => {
    const p = pivot(g, sx * 0.18, 0.74, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.44, 4, 7), char); leg.position.y = -0.32; p.add(leg);
    const crack = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.44, 3, 6), crackMat()); crack.position.y = -0.32; p.add(crack);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.34), char); foot.position.set(0, -0.6, 0.05); p.add(foot);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), char); torso.position.y = 1.08; torso.scale.set(0.85, 1.0, 0.8); g.add(torso);
  const torsoCrack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), crackMat()); torsoCrack.position.copy(torso.position); torsoCrack.scale.copy(torso.scale); g.add(torsoCrack);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0xffb14a })); core.position.set(0, 1.05, 0.22); g.add(core);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xff5a1e, transparent: true, opacity: 0.4 })); halo.position.copy(core.position); g.add(halo);

  const mkArm = (sx) => {
    const p = pivot(g, sx * 0.38, 1.32, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.46, 4, 7), char); arm.position.y = -0.27; p.add(arm);
    const crack = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.46, 3, 6), crackMat()); crack.position.y = -0.27; p.add(crack);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), char); claw.position.y = -0.56; claw.rotation.x = Math.PI; p.add(claw);
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), char); head.position.y = 1.64; g.add(head);
  for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), char); horn.position.set(sx * 0.14, 1.83, -0.02); horn.rotation.z = sx * -0.4; g.add(horn); }
  for (const sx of [-0.09, 0.09]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), emberGlow); eye.position.set(sx, 1.66, 0.2); g.add(eye); }

  return { group: g, legL, legR, armL, armR, head, core, halo, cape: null, soulColor: 0xff5a1e };
}
