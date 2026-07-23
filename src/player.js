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

    // Inner RIG carries the body + soul and owns FACING (rotation.y). The outer
    // group is left free for travel-plane motion — lane slide, forward lean,
    // roll tumble, bounce — so the way the body faces never fights the animation.
    // (Bodies are modelled facing +z; running faces −z, so we see their back.)
    this.rig = new THREE.Group();
    g.add(this.rig);

    // One shared soul-light (keeps the scene's light count fixed no matter which
    // body is worn) — its colour/position is set per variant in _selectVariant.
    this.soul = new THREE.PointLight(0xffa23a, 3.2, 6, 2);
    this.soul.position.set(0, 1.15, 0.2);
    this.rig.add(this.soul);

    // soft bloom around the soul-core (tinted per body in _selectVariant)
    this.coreGlow = glowSprite(0xffa23a, 0.95);
    this.coreGlow.position.set(0, 1.1, 0.25);
    this.rig.add(this.coreGlow);

    // All cosmetic bodies (owned + locked). Identical silhouette height, rig and
    // collision — NO gameplay difference between any of them.
    this.variants = SKINS.map((s) => s.build());
    for (const v of this.variants) { v.group.visible = false; this.rig.add(v.group); }

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
    const rig = this.rig;
    const lerp = THREE.MathUtils.lerp;
    this._introT += dt;
    const t = this._introT;
    g.position.x = 0;
    g.scale.set(1, 1, 1);
    g.rotation.x = 0; g.rotation.z = 0;
    // Face the camera and sway to show off the body (rig.y ≈ 0), then, as the run
    // begins (prep 0→1), turn a full 180° to face into the corridor and run away.
    const e = prep * prep * (3 - 2 * prep);
    const sway = Math.sin(t * 0.9) * 0.5 * (1 - prep);
    rig.rotation.y = lerp(sway, Math.PI, e);
    g.position.y = Math.sin(t * 2.2) * 0.035;               // breathing bob
    if (this.eyes) for (const eye of this.eyes) eye.visible = true;

    // relaxed, slightly bouncy ready stance
    this.legL.rotation.x = lerp(this.legL.rotation.x, 0.1, 0.12);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -0.1, 0.12);
    this.armL.rotation.x = lerp(this.armL.rotation.x, 0.14, 0.12);
    this.armR.rotation.x = lerp(this.armR.rotation.x, 0.14, 0.12);
    this.armL.rotation.z = lerp(this.armL.rotation.z, 0.3, 0.12);
    this.armR.rotation.z = lerp(this.armR.rotation.z, -0.3, 0.12);
    if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, 0.2, 0.1);

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
    const rig = this.rig;
    const lerp = THREE.MathUtils.lerp;
    this._runCycle += dt * 15.5;                    // brisk, springy cadence
    const t = this._runCycle;
    const s = Math.sin(t);
    const grounded = !this.airborne;

    // FACE the way we run — into the corridor (−z). The intro turns them around;
    // here we just keep settling to it so we always see the runner's back.
    rig.rotation.y = lerp(rig.rotation.y, Math.PI, 0.25);

    // lane slide + a lean INTO the lane change — on the OUTER group so it is
    // independent of which way the body faces.
    g.position.x = this.x;
    const laneLean = (this.targetX - this.x) * -0.5;
    g.rotation.z = lerp(g.rotation.z, laneLean, 0.22);

    // ---- Disney BOUNCE: a big, springy two-per-stride hop with squash & stretch.
    //      Purely visual — collision reads this.y + fixed heights, never these
    //      scales/offsets — so the cartoon bounce never changes the hitbox.
    const hop = Math.abs(Math.sin(t));               // 0 = foot plant, 1 = apex
    g.position.y = this.y + (grounded ? hop * 0.18 : 0);

    if (this.airborne) {
      // big cartoony leap: knees tuck, arms fly up, the body stretches skyward
      this.legL.rotation.x = lerp(this.legL.rotation.x, 1.5, 0.3);
      this.legR.rotation.x = lerp(this.legR.rotation.x, -0.7, 0.3);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.9, 0.3);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.9, 0.3);
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.55, 0.3);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.55, 0.3);
      if (!this.rolling) this._squash(1.16, 0.9);              // stretch tall in the air
      if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, 1.5, 0.25);
    } else if (!this.rolling) {
      // sprint: long driving stride; arms pump with a touch of follow-through lag
      const amp = 1.5;
      this.legL.rotation.x = s * amp;
      this.legR.rotation.x = -s * amp;
      const sa = Math.sin(t - 0.55);                          // arms lag the legs (overlap)
      this.armL.rotation.x = sa * amp * 1.05;
      this.armR.rotation.x = -sa * amp * 1.05;
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.24, 0.3);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.24, 0.3);
      // squash wide at the plant, stretch tall at the apex
      const st = hop - 0.5;
      this._squash(1 + st * 0.22, 1 - st * 0.13);
      if (this.cape) this.cape.rotation.x = lerp(this.cape.rotation.x, 0.55 + s * 0.28, 0.3);
    }

    // roll: tuck into a low ball and tumble forward (travel-plane X on outer group)
    if (this.rolling) {
      this._squash(ROLL_HEIGHT / STAND_HEIGHT, 1.18);
      g.rotation.x = lerp(g.rotation.x, -Math.PI * 1.8, 0.35);
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0.7, 0.4);
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0.7, 0.4);
    } else {
      // lean into the sprint on the ground (top toward −z); nearly upright airborne
      g.rotation.x = lerp(g.rotation.x, grounded ? -0.14 : -0.04, 0.22);
    }

    // secondary motion: a gentle head tilt/bob that lags the stride (overlap)
    if (this.head) this.head.rotation.z = Math.sin(t + 0.7) * 0.05;

    // soul-core pulse + light flicker (its glow is what makes the figure pop)
    const pulse = 0.85 + Math.sin(t * 0.7) * 0.15 + Math.random() * 0.1;
    this.core.scale.setScalar(pulse);
    if (this.halo) this.halo.scale.setScalar(1 + Math.sin(t) * 0.2);
    if (this.coreGlow) this.coreGlow.scale.setScalar(0.9 + Math.sin(t * 1.3) * 0.18 + Math.random() * 0.08);
    this.soul.intensity = 2.8 + Math.sin(t * 1.3) * 0.6 + Math.random() * 0.3;
  }

  // squash & stretch the whole body toward (scaleY, scaleXZ), volume-ish preserved.
  // Visual only — the collision volume is fixed (see get bottom/top).
  _squash(sy, sxz) {
    const g = this.group, lerp = THREE.MathUtils.lerp;
    g.scale.y = lerp(g.scale.y, sy, 0.4);
    g.scale.x = lerp(g.scale.x, sxz, 0.4);
    g.scale.z = lerp(g.scale.z, sxz, 0.4);
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
    if (this.rig) this.rig.rotation.set(0, 0, 0);   // start the intro facing the camera
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

// A curvy humanoid base shared by every body: rounded head-space, tapered chest
// and waist, real shoulders, and smoothly-curved capsule limbs with hands/feet.
// Returns the animation rig; each skin adds its own head, eyes, core & flourishes.
function humanBase(bodyMat, limbMat, opts = {}) {
  const g = new THREE.Group();
  const s = opts.bulk || 1;               // overall thickness (Goliath is bulkier)
  const mkLeg = (sx) => {
    const p = pivot(g, sx * 0.15 * s, 0.8, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * s, 0.32, 5, 9), limbMat); thigh.position.y = -0.24; p.add(thigh);
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * s, 0.3, 5, 9), limbMat); calf.position.y = -0.54; p.add(calf);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), limbMat); foot.position.set(0, -0.74, 0.06); foot.scale.set(0.85 * s, 0.55, 1.5); p.add(foot);
    return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), bodyMat); pelvis.position.y = 0.9; pelvis.scale.set(1.05 * s, 0.72, 0.82 * s); g.add(pelvis);
  const waist = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 12), bodyMat); waist.position.y = 1.1; waist.scale.set(0.98 * s, 0.95, 0.8 * s); g.add(waist);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), bodyMat); chest.position.y = 1.36; chest.scale.set(1.08 * s, 0.92, 0.74 * s); g.add(chest);
  for (const sx of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 10, 9), bodyMat); sh.position.set(sx * 0.32 * s, 1.46, 0); g.add(sh); }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), limbMat); neck.position.y = 1.55; g.add(neck);

  const mkArm = (sx) => {
    const p = pivot(g, sx * 0.34 * s, 1.46, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.092 * s, 0.28, 5, 9), limbMat); upper.position.y = -0.2; p.add(upper);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.08 * s, 0.26, 5, 9), limbMat); fore.position.y = -0.48; p.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), limbMat); hand.position.y = -0.66; hand.scale.set(0.85, 1.1, 0.65); p.add(hand);
    return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  return { group: g, legL, legR, armL, armR, chest, headY: 1.68 };
}

// two glowing eyes (tagged so they can be hidden while running); returns them
function addEyes(g, mat, y, z, r = 0.035, spread = 0.07) {
  const eyes = [];
  for (const sx of [-spread, spread]) { const e = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), mat); e.position.set(sx, y, z); e.userData.eye = true; g.add(e); eyes.push(e); }
  return eyes;
}
// a hood shell over the head
function hoodMesh(g, mat, y = 1.66) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.72), mat); h.position.y = y; h.rotation.x = -0.1; g.add(h); return h; }

// Plate LEG ARMOUR (greaves): armoured cuisse, knee cop, greave and sabaton
// clamped onto the humanBase leg pivots so they swing with the run. Fixes the
// "armoured torso, bare legs" look on the plate skins.
function greaves(legL, legR, plate, trim = plate) {
  for (const leg of [legL, legR]) {
    const cuisse = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.135, 0.34, 8), plate); cuisse.position.y = -0.24; leg.add(cuisse);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 7), trim); knee.position.y = -0.4; leg.add(knee);
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.105, 0.32, 8), plate); greave.position.y = -0.55; leg.add(greave);
    const sabaton = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.34), trim); sabaton.position.set(0, -0.74, 0.05); leg.add(sabaton);
  }
}

// (1) The Hollow Knight — armoured wraith, amber soul, tattered cape.
function buildKnight() {
  const armor = new THREE.MeshStandardMaterial({ color: 0x1b1b24, roughness: 0.5, metalness: 0.55 });
  const trim  = new THREE.MeshStandardMaterial({ color: 0x2c2c3a, roughness: 0.4, metalness: 0.7 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a0d0d, roughness: 1.0 });
  const glow  = new THREE.MeshBasicMaterial({ color: 0xffb340 });
  const base = humanBase(armor, armor); const g = base.group;
  greaves(base.legL, base.legR, armor, trim);   // full-plate legs to match the cuirass

  const { core, halo } = coreOrb(g, 0xffe08a, 0xff7a1e, 0, 1.36, 0.26, 0.12);
  for (const sx of [-1, 1]) {
    const pa = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 7, 0, Math.PI*2, 0, Math.PI*0.6), trim); pa.position.set(sx * 0.34, 1.5, 0); g.add(pa);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), trim); spike.position.set(sx * 0.34, 1.66, 0); g.add(spike);
  }
  const hood = hoodMesh(g, cloth, 1.7);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 9), new THREE.MeshBasicMaterial({ color: 0x050505 })); face.position.set(0, 1.66, 0.05); g.add(face);
  addEyes(g, glow, 1.68, 0.18);

  // cape hangs from the BACK (−z) so it trails behind the runner
  const capePivot = pivot(g, 0, 1.46, -0.16);
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.15, 1, 4), new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 1, side: THREE.DoubleSide })); cape.position.set(0, -0.55, -0.02); capePivot.add(cape);

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head: hood, core, halo, cape: capePivot, soulColor: 0xffa23a };
}

// (2) The Bone Revenant — a skeleton: skull, ribcage, crimson soul-fire.
function buildRevenant() {
  const bone = new THREE.MeshStandardMaterial({ color: 0xcabfa2, roughness: 0.7, metalness: 0.05 });
  const glowR = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const base = humanBase(bone, bone); const g = base.group;

  // ribcage over the chest to read as a skeleton
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.21 - i * 0.02, 0.02, 4, 10, Math.PI * 1.15), bone);
    rib.position.set(0, 1.22 + i * 0.09, 0.06); rib.rotation.x = Math.PI / 2; rib.rotation.z = -Math.PI * 0.07; g.add(rib);
  }
  const { core, halo } = coreOrb(g, 0xff6a6a, 0xff1a1a, 0, 1.3, 0.14, 0.1);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bone); skull.position.y = 1.68; g.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bone); jaw.position.set(0, 1.56, 0.04); jaw.scale.set(1, 0.6, 1); g.add(jaw);
  for (const sx of [-0.07, 0.07]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshBasicMaterial({ color: 0x120000 })); socket.position.set(sx, 1.69, 0.14); g.add(socket);
  }
  addEyes(g, glowR, 1.69, 0.18, 0.028);

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head: skull, core, halo, cape: null, soulColor: 0xff2a2a };
}

// (3) The Ember Wretch — a cracked, molten horror, glowing lava seams, horns.
function buildWretch() {
  const char = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.85, metalness: 0.1 });
  const emberGlow = new THREE.MeshBasicMaterial({ color: 0xff5a1e });
  const base = humanBase(char, char, { bulk: 1.08 }); const g = base.group;

  // molten crack overlay on the chest
  const tc = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff6a12, wireframe: true, transparent: true, opacity: 0.5 }));
  tc.position.set(0, 1.36, 0); tc.scale.set(1.1, 0.92, 0.78); g.add(tc);
  const { core, halo } = coreOrb(g, 0xffb14a, 0xff5a1e, 0, 1.36, 0.24, 0.14);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), char); head.position.y = 1.7; head.scale.set(1, 1.05, 1); g.add(head);
  for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), char); horn.position.set(sx * 0.14, 1.9, -0.02); horn.rotation.z = sx * -0.4; g.add(horn); }
  addEyes(g, emberGlow, 1.72, 0.2, 0.04, 0.09);

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0xff5a1e };
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
  const robe = new THREE.MeshStandardMaterial({ color: 0x14201a, roughness: 1 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2b241a, roughness: 0.9 });
  const green = new THREE.MeshBasicMaterial({ color: 0x6cff5a });
  const base = humanBase(robe, leather); const g = base.group;

  const { core, halo } = coreOrb(g, 0xaaffa0, 0x6cff5a, 0, 1.34, 0.28, 0.11);
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), leather); headM.position.y = 1.68; g.add(headM);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), leather); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.64, 0.36); g.add(beak);
  addEyes(g, green, 1.72, 0.12, 0.055, 0.09);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 14), robe); brim.position.y = 1.84; g.add(brim);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 10), robe); hat.position.y = 1.98; g.add(hat);

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head: headM, core, halo, cape: null, soulColor: 0x6cff5a };
}

// (5) The Ashen Seraph — a broken halo and wings of ash.
function buildSeraph() {
  const robe = new THREE.MeshStandardMaterial({ color: 0xb9b2a0, roughness: 0.9 });
  const ash = new THREE.MeshStandardMaterial({ color: 0x6b6456, roughness: 1, side: THREE.DoubleSide });
  const goldGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const base = humanBase(robe, robe); const g = base.group;

  const { core, halo } = coreOrb(g, 0xfff4d0, 0xffe9a8, 0, 1.36, 0.26, 0.12);
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.1, 1, 3), ash);
    wing.position.set(sx * 0.42, 1.34, -0.18); wing.rotation.set(0.2, sx * 0.9, sx * -0.3); g.add(wing);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), robe); head.position.y = 1.68; g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.02), goldGlow); eye.position.set(0, 1.7, 0.2); eye.userData.eye = true; g.add(eye);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 6, 14, Math.PI * 1.5), goldGlow);
  ring.position.set(0, 2.0, -0.02); ring.rotation.x = 0.5; g.add(ring);

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0xffe9a8 };
}

// (6) The Void Stalker — a spiked shard of hungry dark, violet core.
function buildStalker() {
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0b16, roughness: 0.6, metalness: 0.3 });
  const violet = new THREE.MeshBasicMaterial({ color: 0xa855ff });
  const base = humanBase(dark, dark); const g = base.group;

  // jagged spikes bristling from the back/shoulders
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.34, 4), dark);
    sp.position.set(Math.cos(a) * 0.3, 1.36 + Math.sin(a) * 0.22, -0.1); sp.rotation.z = -a + Math.PI / 2; g.add(sp);
  }
  const { core, halo } = coreOrb(g, 0xd8b0ff, 0xa855ff, 0, 1.36, 0.24, 0.13);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), dark); head.position.y = 1.68; g.add(head);
  for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 4), dark); horn.position.set(sx * 0.12, 1.88, -0.04); horn.rotation.z = sx * -0.5; g.add(horn); }
  addEyes(g, violet, 1.7, 0.17, 0.038, 0.08);

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0xa855ff };
}

// (7) The Frostbound Lich — crowned in eternal frost, icy blue soul.
function buildLich() {
  const robe = new THREE.MeshStandardMaterial({ color: 0x16222b, roughness: 0.9 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc7d3d6, roughness: 0.7 });
  const ice = new THREE.MeshStandardMaterial({ color: 0x2a6a80, emissive: 0x59d6ff, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.85 });
  const iceGlow = new THREE.MeshBasicMaterial({ color: 0x9fe9ff });
  const base = humanBase(robe, bone); const g = base.group;

  const { core, halo } = coreOrb(g, 0x9fe9ff, 0x59d6ff, 0, 1.36, 0.28, 0.12);
  for (const sx of [-1, 1]) { const shard = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 4), ice); shard.position.set(sx * 0.34, 1.58, 0); shard.rotation.z = sx * -0.3; g.add(shard); }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bone); skull.position.y = 1.68; g.add(skull);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bone); jaw.position.set(0, 1.57, 0.03); jaw.scale.set(1, 0.6, 1); g.add(jaw);
  addEyes(g, iceGlow, 1.69, 0.15, 0.03);
  for (let i = -2; i <= 2; i++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.34 - Math.abs(i) * 0.03, 4), ice); spike.position.set(i * 0.09, 1.9, 0); g.add(spike); }

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head: skull, core, halo, cape: null, soulColor: 0x59d6ff };
}

// (8) The Reaper — hooded death with a scythe and a cold green soul.
function buildReaper() {
  const robe = new THREE.MeshStandardMaterial({ color: 0x0c0f0c, roughness: 1 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xb9b09a, roughness: 0.8 });
  const green = new THREE.MeshBasicMaterial({ color: 0x66ff88 });
  const base = humanBase(robe, robe); const g = base.group;

  const { core, halo } = coreOrb(g, 0xbfffca, 0x66ff88, 0, 1.34, 0.26, 0.11);
  const hood = hoodMesh(g, robe, 1.7);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 9), new THREE.MeshBasicMaterial({ color: 0x040604 })); face.position.set(0, 1.66, 0.05); g.add(face);
  addEyes(g, green, 1.68, 0.17, 0.033);
  const scythe = new THREE.Group();
  scythe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), bone));
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 4, 10, Math.PI * 0.9), bone); blade.position.set(0.32, 1.1, 0); blade.rotation.z = -0.6; scythe.add(blade);
  scythe.position.set(0.66, 1.1, 0.1); scythe.rotation.z = 0.12; g.add(scythe);
  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head: hood, core, halo, cape: null, soulColor: 0x66ff88 };
}

// (9) The Banshee — a translucent, keening spirit lit from within.
function buildBanshee() {
  const spirit = new THREE.MeshStandardMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.6, roughness: 0.4, emissive: 0x2a5a70, emissiveIntensity: 0.6, side: THREE.DoubleSide });
  const wisp = new THREE.MeshStandardMaterial({ color: 0xafe6ff, transparent: true, opacity: 0.4, roughness: 0.5 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x8ff4ff });
  const base = humanBase(spirit, spirit); const g = base.group;

  const shroud = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 8, 1, true), wisp); shroud.position.y = 0.72; g.add(shroud);
  const { core, halo } = coreOrb(g, 0xe0ffff, 0x8ff4ff, 0, 1.34, 0.22, 0.13);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), spirit); head.position.y = 1.68; g.add(head);
  const hair = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 8, 1, true), wisp); hair.position.y = 1.66; g.add(hair);
  addEyes(g, cyan, 1.7, 0.17, 0.035);
  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0x8ff4ff };
}

// (10) The Goliath — a hulking stone golem seamed with molten light.
function buildGoliath() {
  const rock = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1, metalness: 0.05 });
  const orange = new THREE.MeshBasicMaterial({ color: 0xffae4a });
  const base = humanBase(rock, rock, { bulk: 1.35 }); const g = base.group;

  const tc = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1e, wireframe: true, transparent: true, opacity: 0.55 }));
  tc.position.set(0, 1.36, 0); tc.scale.set(1.5, 0.95, 1.05); g.add(tc);
  const { core, halo } = coreOrb(g, 0xffd08a, 0xff7a1e, 0, 1.36, 0.32, 0.15);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 9), rock); head.position.y = 1.72; head.scale.set(1.1, 1, 1); g.add(head);
  for (const sx of [-0.1, 0.1]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.03), orange); eye.position.set(sx, 1.74, 0.22); eye.userData.eye = true; g.add(eye); }
  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0xff7a1e };
}

// (11) The Gilded Sovereign — MYTHIC. Only found in the lootbox (1-in-100).
function buildSovereign() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xcaa23a, roughness: 0.25, metalness: 0.95 });
  const goldLit = new THREE.MeshStandardMaterial({ color: 0xe8c65a, emissive: 0xffcf4a, emissiveIntensity: 0.5, roughness: 0.2, metalness: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const base = humanBase(gold, goldLit); const g = base.group;
  greaves(base.legL, base.legR, gold, goldLit);   // gilded greaves to match the cuirass

  const { core, halo } = coreOrb(g, 0xfff6cc, 0xffd24a, 0, 1.36, 0.28, 0.15);
  // pauldrons + radiant wings
  for (const sx of [-1, 1]) {
    const pa = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI*2, 0, Math.PI*0.6), goldLit); pa.position.set(sx * 0.34, 1.5, 0); g.add(pa);
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.2, 1, 3), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffd24a, emissiveIntensity: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    wing.position.set(sx * 0.44, 1.36, -0.2); wing.rotation.set(0.15, sx * 1.0, sx * -0.35); g.add(wing);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), gold); head.position.y = 1.68; g.add(head);
  const faceplate = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), goldLit); faceplate.position.set(0, 1.68, 0.05); faceplate.scale.set(1, 1, 0.6); g.add(faceplate);
  addEyes(g, glow, 1.7, 0.19, 0.03);
  // crown of spikes
  for (let i = -3; i <= 3; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24 - Math.abs(i) * 0.02, 5), goldLit); sp.position.set(i * 0.07, 1.9, 0); g.add(sp); }
  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0xffd24a };
}

// (12) The Orc Warlord — MYTHIC. Iron-shouldered, bare-legged for the charge.
//      Won only from the key-locked War-Cache (a 1-in-10 pull).
function buildWarlord() {
  const iron    = new THREE.MeshStandardMaterial({ color: 0x33302b, roughness: 0.5, metalness: 0.62 });
  const skin    = new THREE.MeshStandardMaterial({ color: 0x51702f, roughness: 0.92 });   // orc green — bare arms & legs
  const leather = new THREE.MeshStandardMaterial({ color: 0x281a10, roughness: 1 });
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe4dcc0, roughness: 0.55 });
  const rage    = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
  // body = iron cuirass, limbs = green skin → an armoured torso over bare muscle
  const base = humanBase(iron, skin, { bulk: 1.32 }); const g = base.group;

  const { core, halo } = coreOrb(g, 0xffb47a, 0xff6a2a, 0, 1.36, 0.24, 0.1);

  // huge spiked pauldrons
  for (const sx of [-1, 1]) {
    const pa = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), iron); pa.position.set(sx * 0.42, 1.5, 0); g.add(pa);
    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), iron); spk.position.set(sx * 0.46, 1.66, 0); spk.rotation.z = sx * -0.32; g.add(spk);
  }
  // leather war-kilt over the hips — NO leg armour below it (bare orc legs)
  const kilt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.42, 10, 1, true), leather); kilt.position.y = 0.8; g.add(kilt);

  // brutish head: heavy brow, under-bite jaw, two upward tusks
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin); head.position.y = 1.72; head.scale.set(1.06, 1, 1); g.add(head);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.12), skin); brow.position.set(0, 1.77, 0.17); g.add(brow);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin); jaw.position.set(0, 1.62, 0.06); jaw.scale.set(1.06, 0.64, 1); g.add(jaw);
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), tuskMat); t.position.set(sx * 0.1, 1.66, 0.2); t.rotation.x = 0.35; g.add(t); }
  addEyes(g, rage, 1.73, 0.18, 0.036, 0.09);
  // bristling black mohawk
  for (let i = -2; i <= 2; i++) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28 - Math.abs(i) * 0.03, 4), leather); h.position.set(0, 1.93, -i * 0.06); h.rotation.x = -i * 0.22; g.add(h); }

  return { group: g, legL: base.legL, legR: base.legR, armL: base.armL, armR: base.armR, head, core, halo, cape: null, soulColor: 0xff6a2a };
}

// ============================================================================
//  Skin registry. The first three are free (owned by default); the rest are
//  bought in the Wardrobe with gems. Every run rolls one at random, equal odds,
//  from the set you own. All are cosmetic — identical hitbox and physics.
// ============================================================================
export const SKINS = [
  { id: 'knight',   name: 'The Hollow Knight',   cost: 0,   defaultOwned: true,  color: '#ffa23a', blurb: 'Armoured wraith, an amber soul burning in its chest.', build: buildKnight,
    story: "Once the cathedral's sworn protector, the Hollow Knight kept its vigil long after the last prayer died. The body inside the plate rotted to nothing centuries ago — only the amber soul rattling in its breastplate still remembers why it runs." },
  { id: 'revenant', name: 'The Bone Revenant',   cost: 0,   defaultOwned: true,  color: '#ff2a2a', blurb: 'A skeleton wreathed in crimson soul-fire.',            build: buildRevenant,
    story: "Stripped of flesh by the corridor's hunger, the Bone Revenant refused to lie still. Its crimson soul-fire is pure spite — the raw will to keep moving when there is nothing left to move it." },
  { id: 'wretch',   name: 'The Ember Wretch',    cost: 0,   defaultOwned: true,  color: '#ff5a1e', blurb: 'Cracked and molten, seething with glowing lava.',      build: buildWretch,
    story: "Dragged half-formed from the foundry-pits, the Ember Wretch is a body of cooling slag that never quite set. Every stride cracks it open; every crack leaks the fire that keeps it walking." },
  { id: 'plague',   name: 'The Plague Warden',   cost: 450,  defaultOwned: false, color: '#6cff5a', blurb: 'Beaked and robed; a green rot trails its steps.',      build: buildPlague,
    story: "The Plague Warden walked the fever-wards until the wards walked back. Sealed forever inside its beaked mask, it trails a green rot the dead mistake for incense — and follows the living out of habit." },
  { id: 'seraph',   name: 'The Ashen Seraph',    cost: 1100, defaultOwned: false, color: '#ffe9a8', blurb: 'A broken halo and wings of ash. Fallen, still radiant.', build: buildSeraph,
    story: "The Ashen Seraph fell a very long way to reach this floor, and its wings burned to cinder on the descent. It still shines — not from grace, but from the heat of the fall that never cooled." },
  { id: 'stalker',  name: 'The Void Stalker',    cost: 2000, defaultOwned: false, color: '#a855ff', blurb: 'A spiked shard of hungry dark, lit by a violet core.', build: buildStalker,
    story: "The Void Stalker is a splinter of the dark between the stars, given legs and an appetite. Where it looks, colour drains; where it steps, the corridor forgets it was ever lit." },
  { id: 'lich',     name: 'The Frostbound Lich', cost: 3400, defaultOwned: false, color: '#59d6ff', blurb: 'Crowned in eternal frost, its soul a shard of ice.',    build: buildLich,
    story: "The Frostbound Lich froze its own heart to outlast death — and outlast it, it did. Every breath sheets the walls in ice, and its soul is the one blue shard it never allowed to melt." },
  { id: 'reaper',   name: 'The Reaper',          cost: 1600, defaultOwned: false, color: '#66ff88', blurb: 'Hooded death itself, scythe in hand, soul cold and green.', build: buildReaper,
    story: "The Reaper does not run to escape the corridor — it runs to keep pace with those who flee. Scythe in hand, it has all the time there is, and it spends that time chasing yours." },
  { id: 'banshee',  name: 'The Banshee',         cost: 2600, defaultOwned: false, color: '#8ff4ff', blurb: 'A translucent, keening spirit lit from within.',        build: buildBanshee,
    story: "The Banshee's scream shattered the abbey bells before it finally shattered her. Now translucent and keening, she pours down the corridor like grief that learned how to sprint." },
  { id: 'goliath',  name: 'The Goliath',         cost: 4800, defaultOwned: false, color: '#ff7a1e', blurb: 'A hulking stone golem seamed with molten light.',       build: buildGoliath,
    story: "Carved to guard a tomb that no longer exists, the Goliath simply kept moving when the mountain around it fell. Molten light bleeds through its seams like a furnace that forgot how to die." },
  { id: 'sovereign', name: 'The Gilded Sovereign', cost: 0, defaultOwned: false, lootboxOnly: true, mythic: true, color: '#ffd24a', blurb: 'MYTHIC. Radiant, crowned, winged in gold. Found only in the gem lootbox — a 1-in-100 fortune.', build: buildSovereign,
    story: "MYTHIC. Crowned before the first curse was ever spoken, the Gilded Sovereign ruled the descent and never once abdicated. To wear it is to wear the corridor's own vanity — radiant, winged, and utterly without mercy." },
  { id: 'warlord',  name: 'The Orc Warlord',     cost: 0,   defaultOwned: false, lootboxOnly: true, keyOnly: true, mythic: true, color: '#ff6a2a', blurb: 'MYTHIC. Iron-shouldered, bare-legged, tusked for war. Won only from the key-locked War-Cache.', build: buildWarlord,
    story: "MYTHIC. Chieftain of the war-camps that once besieged the cathedral, the Orc Warlord broke the gates — and then broke the silence that followed. Iron-shouldered for the wall and bare-legged for the charge, it runs the corridor like a raid that will never end. It answers only to a stolen key." },
];
