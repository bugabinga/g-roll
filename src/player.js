// ============================================================================
//  The Roller — a hooded, hollowed soul fleeing down the corridor.
//  Built procedurally: cloak, hood, faint soul-light. Handles lane / jump / roll.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { LANES, CONFIG } from './config.js';
import { Save } from './save.js';
import { glowSprite } from './particles.js';

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

    // soft bloom around the soul-core (tinted per body in _selectVariant)
    this.coreGlow = glowSprite(0xffa23a, 0.95);
    this.coreGlow.position.set(0, 1.1, 0.25);
    g.add(this.coreGlow);

    // All cosmetic bodies (owned + locked). Identical silhouette height, rig and
    // collision — NO gameplay difference between any of them.
    this.variants = SKINS.map((s) => s.build());
    for (const v of this.variants) { v.group.visible = false; g.add(v.group); }

    this._selectVariant();
  }

  // Roll a body for this run: equal chance among the ones you OWN (default +
  // whatever you've bought in the Wardrobe). Purely cosmetic.
  _selectVariant() {
    const owned = SKINS.map((s, i) => (s.defaultOwned || Save.isSkinOwned(s.id)) ? i : -1).filter((i) => i >= 0);
    const pool = owned.length ? owned : [0];
    const idx = pool[Math.floor(Math.random() * pool.length)];
    this.variantIndex = idx;
    this.variantName = SKINS[idx].name;
    for (let i = 0; i < this.variants.length; i++) this.variants[i].group.visible = (i === idx);
    const v = this.variants[idx];
    this.legL = v.legL; this.legR = v.legR;
    this.armL = v.armL; this.armR = v.armR;
    this.core = v.core; this.halo = v.halo; this.cape = v.cape; this.head = v.head;
    this.soul.color.setHex(v.soulColor);
    if (v.core) {
      this.soul.position.set(v.core.position.x, v.core.position.y, v.core.position.z + 0.05);
      this.coreGlow.position.set(v.core.position.x, v.core.position.y, v.core.position.z + 0.06);
      this.coreGlow.material.color.setHex(v.soulColor);
    }
    // gather this body's eyes so they can be hidden while running (it faces the
    // camera, and glowing eyes made it read as running backwards)
    this.eyes = [];
    v.group.traverse((o) => { if (o.userData && o.userData.eye) this.eyes.push(o); });
    return idx;
  }

  // Pre-run showcase: the figure faces the camera in a ready stance and slowly
  // turns so you can see the body. `prep` (0..1) fades the sway as the run nears.
  introUpdate(dt, prep = 0) {
    const g = this.group;
    const lerp = THREE.MathUtils.lerp;
    this._introT += dt;
    const t = this._introT;
    g.position.x = 0;
    g.scale.set(1, 1, 1);
    g.rotation.x = 0; g.rotation.z = 0;
    g.rotation.y = Math.sin(t * 0.9) * 0.55 * (1 - prep);   // showcase turn, settles to forward
    g.position.y = Math.sin(t * 2.2) * 0.03;                // breathing
    if (this.eyes) for (const e of this.eyes) e.visible = true;   // eyes on for the reveal

    this.legL.rotation.x = lerp(this.legL.rotation.x, 0.12, 0.12);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -0.12, 0.12);
    this.armL.rotation.x = lerp(this.armL.rotation.x, 0.16, 0.12);
    this.armR.rotation.x = lerp(this.armR.rotation.x, 0.16, 0.12);
    this.armL.rotation.z = lerp(this.armL.rotation.z, 0.32, 0.12);
    this.armR.rotation.z = lerp(this.armR.rotation.z, -0.32, 0.12);
    if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, -0.3, 0.1);

    this.core.scale.setScalar(0.85 + Math.sin(t * 3) * 0.15);
    if (this.halo) this.halo.scale.setScalar(1 + Math.sin(t * 2) * 0.22);
    this.soul.intensity = 3.4 + Math.sin(t * 3) * 0.7;
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
    const lerp = THREE.MathUtils.lerp;
    this._runCycle += dt * 15;                     // brisker cadence
    const s = Math.sin(this._runCycle);
    const grounded = !this.airborne;

    // lane position + lean into a lane change
    g.position.x = this.x;
    const laneLean = (this.targetX - this.x) * -0.42;
    g.rotation.z = lerp(g.rotation.z, laneLean, 0.2);

    // running BOUNCE — visual only. Collision reads this.y (see get bottom/top),
    // so the bob never changes gameplay. Two bounces per stride = a real gallop.
    const bob = grounded ? Math.abs(Math.sin(this._runCycle)) * 0.09 : 0;
    g.position.y = this.y + bob;

    if (this.airborne) {
      // leap: trailing leg kicks back, lead knee drives up, arms thrown wide
      this.legL.rotation.x = lerp(this.legL.rotation.x, 1.3, 0.3);
      this.legR.rotation.x = lerp(this.legR.rotation.x, -0.5, 0.3);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.5, 0.3);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.5, 0.3);
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.5, 0.3);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.5, 0.3);
      if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, -1.3, 0.25);
    } else if (!this.rolling) {
      // sprint: long driving stride, arms pumping in opposition + carried in
      const amp = 1.28;
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      this.armL.rotation.x = -s * amp * 0.95;
      this.armR.rotation.x =  s * amp * 0.95;
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.2, 0.3);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.2, 0.3);
      if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, -0.55 + s * 0.2, 0.3);
    }

    // roll squash: tuck low & spin forward
    const targetScaleY = this.rolling ? ROLL_HEIGHT / STAND_HEIGHT : 1;
    g.scale.y = lerp(g.scale.y, targetScaleY, 0.35);
    if (this.rolling) {
      g.rotation.x = lerp(g.rotation.x, -Math.PI * 1.7, 0.35);
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0.6, 0.4);
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0.6, 0.4);
    } else {
      // lean into the sprint on the ground; upright in the air
      g.rotation.x = lerp(g.rotation.x, grounded ? -0.12 : 0, 0.25);
    }

    // soul-core pulse + light flicker (its glow is what makes the figure pop)
    const pulse = 0.85 + Math.sin(this._runCycle * 0.7) * 0.15 + Math.random() * 0.1;
    this.core.scale.setScalar(pulse);
    if (this.halo) this.halo.scale.setScalar(1 + Math.sin(this._runCycle) * 0.2);
    if (this.coreGlow) this.coreGlow.scale.setScalar(0.9 + Math.sin(this._runCycle * 1.3) * 0.18 + Math.random() * 0.08);
    this.soul.intensity = 2.8 + Math.sin(this._runCycle * 1.3) * 0.6 + Math.random() * 0.3;

    // hide the eyes while running so the figure doesn't look like it faces you
    if (this.eyes) for (const e of this.eyes) e.visible = false;
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
    this._introT = 0;
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
  for (const sx of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), glow); eye.position.set(sx, 1.6, 0.2); eye.userData.eye = true; g.add(eye); }

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
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), glowR); eye.position.set(sx, 1.62, 0.17); eye.userData.eye = true; g.add(eye);
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
  for (const sx of [-0.09, 0.09]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), emberGlow); eye.position.set(sx, 1.66, 0.2); eye.userData.eye = true; g.add(eye); }

  return { group: g, legL, legR, armL, armR, head, core, halo, cape: null, soulColor: 0xff5a1e };
}

// simple limb helpers shared by the shop bodies
function robeLeg(g, sx, mat, footMat) {
  const p = pivot(g, sx * 0.16, 0.72, 0);
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.42, 3, 6), mat); leg.position.y = -0.3; p.add(leg);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.3), footMat); foot.position.set(0, -0.62, 0.05); p.add(foot);
  return p;
}
function simpleArm(g, sx, mat, handMat, y = 1.3, spread = 0.34) {
  const p = pivot(g, sx * spread, y, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.44, 3, 6), mat); arm.position.y = -0.26; p.add(arm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), handMat); hand.position.y = -0.5; p.add(hand);
  return p;
}
function coreOrb(g, hex, glowHex, x = 0, y = 1.1, z = 0.22, r = 0.13) {
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshBasicMaterial({ color: hex }));
  core.position.set(x, y, z); g.add(core);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 1.6, 0), new THREE.MeshBasicMaterial({ color: glowHex, transparent: true, opacity: 0.4 }));
  halo.position.copy(core.position); g.add(halo);
  return { core, halo };
}

// (4) The Plague Warden — beaked, robed, trailing a green rot.
function buildPlague() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0x14201a, roughness: 1 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2b241a, roughness: 0.9 });
  const green = new THREE.MeshBasicMaterial({ color: 0x6cff5a });
  const legL = robeLeg(g, -1, robe, leather), legR = robeLeg(g, 1, robe, leather);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.46, 1.0, 8), robe); body.position.y = 1.0; g.add(body);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.18, 8), leather); collar.position.y = 1.45; g.add(collar);
  const { core, halo } = coreOrb(g, 0xaaffa0, 0x6cff5a, 0, 1.02, 0.32, 0.11);

  const armL = simpleArm(g, -1, robe, leather, 1.3, 0.32), armR = simpleArm(g, 1, robe, leather, 1.3, 0.32);

  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 8), leather); headM.position.y = 1.63; g.add(headM);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), leather); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.58, 0.34); g.add(beak);
  for (const sx of [-0.09, 0.09]) { const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), green); lens.position.set(sx, 1.66, 0.14); lens.userData.eye = true; g.add(lens); }
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 12), robe); brim.position.y = 1.78; g.add(brim);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.26, 10), robe); hat.position.y = 1.92; g.add(hat);

  return { group: g, legL, legR, armL, armR, head: headM, core, halo, cape: null, soulColor: 0x6cff5a };
}

// (5) The Ashen Seraph — a broken halo and wings of ash.
function buildSeraph() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.9 });
  const ash = new THREE.MeshStandardMaterial({ color: 0x6b6456, roughness: 1, side: THREE.DoubleSide });
  const goldGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const legL = robeLeg(g, -1, robe, ash), legR = robeLeg(g, 1, robe, ash);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 1.0, 8), robe); body.position.y = 1.0; g.add(body);
  const { core, halo } = coreOrb(g, 0xfff4d0, 0xffe9a8, 0, 1.06, 0.26, 0.12);

  const armL = simpleArm(g, -1, robe, robe, 1.3, 0.33), armR = simpleArm(g, 1, robe, robe, 1.3, 0.33);

  // swept wings behind the shoulders
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0, 1, 3), ash);
    wing.position.set(sx * 0.42, 1.2, -0.16); wing.rotation.set(0.2, sx * 0.9, sx * -0.3); g.add(wing);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 9), robe); head.position.y = 1.64; g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.02), goldGlow); eye.position.set(0, 1.66, 0.19); eye.userData.eye = true; g.add(eye);
  // broken halo ring, tilted
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 14, Math.PI * 1.5), goldGlow);
  ring.position.set(0, 1.95, -0.02); ring.rotation.x = 0.5; g.add(ring);

  return { group: g, legL, legR, armL, armR, head, core, halo, cape: null, soulColor: 0xffe9a8 };
}

// (6) The Void Stalker — a spiked shard of hungry dark, violet core.
function buildStalker() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0b16, roughness: 0.6, metalness: 0.3 });
  const violet = new THREE.MeshBasicMaterial({ color: 0xa855ff });
  const violetFaint = new THREE.MeshBasicMaterial({ color: 0x7a35d0, transparent: true, opacity: 0.5 });
  const legL = robeLeg(g, -1, dark, dark), legR = robeLeg(g, 1, dark, dark);

  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), dark); torso.position.y = 1.06; torso.scale.set(0.9, 1.1, 0.85); g.add(torso);
  // jagged spikes bristling from the torso
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), dark);
    sp.position.set(Math.cos(a) * 0.34, 1.06 + Math.sin(a) * 0.3, 0.1); sp.rotation.z = -a + Math.PI / 2; g.add(sp);
  }
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.43, 0), violetFaint); shell.position.copy(torso.position); shell.scale.copy(torso.scale); g.add(shell);
  const { core, halo } = coreOrb(g, 0xd8b0ff, 0xa855ff, 0, 1.06, 0.2, 0.12);

  const armL = simpleArm(g, -1, dark, dark, 1.3, 0.36), armR = simpleArm(g, 1, dark, dark, 1.3, 0.36);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), dark); head.position.y = 1.62; g.add(head);
  for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), dark); horn.position.set(sx * 0.12, 1.82, -0.04); horn.rotation.z = sx * -0.5; g.add(horn); }
  for (const sx of [-0.08, 0.08]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 6), violet); eye.position.set(sx, 1.63, 0.17); eye.userData.eye = true; g.add(eye); }

  return { group: g, legL, legR, armL, armR, head, core, halo, cape: null, soulColor: 0xa855ff };
}

// (7) The Frostbound Lich — crowned in eternal frost, icy blue soul.
function buildLich() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0x16222b, roughness: 0.9 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc7d3d6, roughness: 0.7 });
  const ice = new THREE.MeshStandardMaterial({ color: 0x2a6a80, emissive: 0x59d6ff, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.85 });
  const iceGlow = new THREE.MeshBasicMaterial({ color: 0x9fe9ff });
  const legL = robeLeg(g, -1, robe, robe), legR = robeLeg(g, 1, robe, robe);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.46, 1.0, 8), robe); body.position.y = 1.0; g.add(body);
  const { core, halo } = coreOrb(g, 0x9fe9ff, 0x59d6ff, 0, 1.05, 0.28, 0.12);
  // frost shards on the shoulders
  for (const sx of [-1, 1]) { const shard = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 4), ice); shard.position.set(sx * 0.34, 1.5, 0); shard.rotation.z = sx * -0.3; g.add(shard); }

  const armL = simpleArm(g, -1, robe, bone, 1.32, 0.34), armR = simpleArm(g, 1, robe, bone, 1.32, 0.34);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 9), bone); skull.position.y = 1.62; g.add(skull);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.18), bone); jaw.position.set(0, 1.5, 0.02); g.add(jaw);
  for (const sx of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), iceGlow); eye.position.set(sx, 1.63, 0.15); eye.userData.eye = true; g.add(eye); }
  // jagged ice crown
  for (let i = -2; i <= 2; i++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2 + Math.abs(i) * -0.03 + 0.16, 4), ice); spike.position.set(i * 0.09, 1.82, 0); g.add(spike); }

  return { group: g, legL, legR, armL, armR, head: skull, core, halo, cape: null, soulColor: 0x59d6ff };
}

// (8) The Reaper — hooded death with a scythe and a cold green soul.
function buildReaper() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0x0c0f0c, roughness: 1 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xb9b09a, roughness: 0.8 });
  const green = new THREE.MeshBasicMaterial({ color: 0x66ff88 });
  const legL = robeLeg(g, -1, robe, robe), legR = robeLeg(g, 1, robe, robe);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.5, 1.05, 8), robe); body.position.y = 1.0; g.add(body);
  const { core, halo } = coreOrb(g, 0xbfffca, 0x66ff88, 0, 1.05, 0.24, 0.11);
  const armL = simpleArm(g, -1, robe, bone, 1.3, 0.34), armR = simpleArm(g, 1, robe, bone, 1.3, 0.34);
  // hooded skull
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.72), robe); hood.position.y = 1.62; hood.rotation.x = -0.1; g.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: 0x040604 })); face.position.set(0, 1.58, 0.05); g.add(face);
  for (const sx of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033, 6, 6), green); eye.position.set(sx, 1.6, 0.17); eye.userData.eye = true; g.add(eye); }
  // scythe held to one side
  const scythe = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), bone); scythe.add(shaft);
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 4, 10, Math.PI * 0.9), bone); blade.position.set(0.32, 1.1, 0); blade.rotation.z = -0.6; scythe.add(blade);
  scythe.position.set(0.62, 1.1, 0.1); scythe.rotation.z = 0.12; g.add(scythe);
  return { group: g, legL, legR, armL, armR, head: hood, core, halo, cape: null, soulColor: 0x66ff88 };
}

// (9) The Banshee — a translucent, keening spirit lit from within.
function buildBanshee() {
  const g = new THREE.Group();
  const spirit = new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.55, roughness: 0.4, emissive: 0x2a5a70, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const wisp = new THREE.MeshStandardMaterial({ color: 0xafe6ff, transparent: true, opacity: 0.4, roughness: 0.5 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x8ff4ff });
  const legL = robeLeg(g, -1, wisp, wisp), legR = robeLeg(g, 1, wisp, wisp);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.5, 1.15, 8), spirit); body.position.y = 1.0; g.add(body);
  const shroud = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 8, 1, true), wisp); shroud.position.y = 0.7; g.add(shroud);
  const { core, halo } = coreOrb(g, 0xe0ffff, 0x8ff4ff, 0, 1.06, 0.2, 0.13);
  const armL = simpleArm(g, -1, spirit, spirit, 1.3, 0.32), armR = simpleArm(g, 1, spirit, spirit, 1.3, 0.32);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 9), spirit); head.position.y = 1.62; g.add(head);
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 8, 1, true), wisp); hair.position.y = 1.6; g.add(hair);
  for (const sx of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), cyan); eye.position.set(sx, 1.63, 0.17); eye.userData.eye = true; g.add(eye); }
  return { group: g, legL, legR, armL, armR, head, core, halo, cape: null, soulColor: 0x8ff4ff };
}

// (10) The Goliath — a hulking stone golem seamed with molten light.
function buildGoliath() {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1, metalness: 0.05 });
  const crackMat = () => new THREE.MeshBasicMaterial({ color: 0xff7a1e, wireframe: true, transparent: true, opacity: 0.55 });
  const orange = new THREE.MeshBasicMaterial({ color: 0xffae4a });
  const mkLeg = (sx) => { const p = pivot(g, sx * 0.22, 0.72, 0); const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.3), rock); leg.position.y = -0.3; p.add(leg); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.42), rock); foot.position.set(0, -0.6, 0.05); p.add(foot); return p; };
  const legL = mkLeg(-1), legR = mkLeg(1);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.95, 0.66), rock); torso.position.y = 1.15; g.add(torso);
  const tc = new THREE.Mesh(new THREE.BoxGeometry(0.93, 0.98, 0.69), crackMat()); tc.position.y = 1.15; g.add(tc);
  const { core, halo } = coreOrb(g, 0xffd08a, 0xff7a1e, 0, 1.12, 0.34, 0.14);
  const mkArm = (sx) => { const p = pivot(g, sx * 0.56, 1.4, 0); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.28), rock); arm.position.y = -0.32; p.add(arm); const crk = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.62, 0.31), crackMat()); crk.position.y = -0.32; p.add(crk); const fist = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), rock); fist.position.y = -0.68; p.add(fist); return p; };
  const armL = mkArm(-1), armR = mkArm(1);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.38), rock); head.position.y = 1.78; g.add(head);
  for (const sx of [-0.1, 0.1]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.03), orange); eye.position.set(sx, 1.8, 0.2); eye.userData.eye = true; g.add(eye); }
  return { group: g, legL, legR, armL, armR, head, core, halo, cape: null, soulColor: 0xff7a1e };
}

// ============================================================================
//  Skin registry. The first three are free (owned by default); the rest are
//  bought in the Wardrobe with gems. Every run rolls one at random, equal odds,
//  from the set you own. All are cosmetic — identical hitbox and physics.
// ============================================================================
export const SKINS = [
  { id: 'knight',   name: 'The Hollow Knight',   cost: 0,   defaultOwned: true,  color: '#ffa23a', blurb: 'Armoured wraith, an amber soul burning in its chest.', build: buildKnight },
  { id: 'revenant', name: 'The Bone Revenant',   cost: 0,   defaultOwned: true,  color: '#ff2a2a', blurb: 'A skeleton wreathed in crimson soul-fire.',            build: buildRevenant },
  { id: 'wretch',   name: 'The Ember Wretch',    cost: 0,   defaultOwned: true,  color: '#ff5a1e', blurb: 'Cracked and molten, seething with glowing lava.',      build: buildWretch },
  { id: 'plague',   name: 'The Plague Warden',   cost: 450,  defaultOwned: false, color: '#6cff5a', blurb: 'Beaked and robed; a green rot trails its steps.',      build: buildPlague },
  { id: 'seraph',   name: 'The Ashen Seraph',    cost: 1100, defaultOwned: false, color: '#ffe9a8', blurb: 'A broken halo and wings of ash. Fallen, still radiant.', build: buildSeraph },
  { id: 'stalker',  name: 'The Void Stalker',    cost: 2000, defaultOwned: false, color: '#a855ff', blurb: 'A spiked shard of hungry dark, lit by a violet core.', build: buildStalker },
  { id: 'lich',     name: 'The Frostbound Lich', cost: 3400, defaultOwned: false, color: '#59d6ff', blurb: 'Crowned in eternal frost, its soul a shard of ice.',    build: buildLich },
  { id: 'reaper',   name: 'The Reaper',          cost: 1600, defaultOwned: false, color: '#66ff88', blurb: 'Hooded death itself, scythe in hand, soul cold and green.', build: buildReaper },
  { id: 'banshee',  name: 'The Banshee',         cost: 2600, defaultOwned: false, color: '#8ff4ff', blurb: 'A translucent, keening spirit lit from within.',        build: buildBanshee },
  { id: 'goliath',  name: 'The Goliath',         cost: 4800, defaultOwned: false, color: '#ff7a1e', blurb: 'A hulking stone golem seamed with molten light.',       build: buildGoliath },
];
