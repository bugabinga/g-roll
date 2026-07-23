// ============================================================================
//  Particle systems — drifting ash/embers for atmosphere, and a visceral
//  blood burst on death. Built as pooled Points for cheap draw calls.
// ============================================================================

import * as THREE from '../vendor/three.module.js';

// ---- shared soft-glow sprite (cheap fake bloom around bright emissives) -----
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
export function glowSprite(colorHex, size = 1) {
  const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: colorHex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, size);
  return s;
}

// ---- floating ash & embers -------------------------------------------------
export class Embers {
  constructor(scene) {
    this.count = 170;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.count * 3);
    const spd = new Float32Array(this.count);
    const col = new Float32Array(this.count * 3);
    this.range = { x: 16, y: 14, z: 120 };
    for (let i = 0; i < this.count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * this.range.x;
      pos[i * 3 + 1] = Math.random() * this.range.y;
      pos[i * 3 + 2] = -Math.random() * this.range.z;
      spd[i] = 0.4 + Math.random() * 1.4;
      // mostly ash-grey, some ember-orange
      const ember = Math.random() < 0.22;
      if (ember) { col[i*3]=1.0; col[i*3+1]=0.45; col[i*3+2]=0.12; }
      else { const g = 0.35 + Math.random()*0.25; col[i*3]=g; col[i*3+1]=g; col[i*3+2]=g*0.95; }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.spd = spd;
    const mat = new THREE.PointsMaterial({
      size: 0.11, vertexColors: true, transparent: true, opacity: 0.75,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }

  update(dt, speed, camZ) {
    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const iy = i * 3 + 1;
      pos[iy] += Math.sin((pos[i*3] + performance.now()*0.0005)) * dt * 0.3;
      pos[i*3+1] -= this.spd[i] * dt * 0.4;          // slow fall
      pos[i*3+2] += speed * dt * 0.35;               // drift toward camera
      if (pos[i*3+1] < 0) pos[iy] = this.range.y;
      if (pos[i*3+2] > camZ + 6) {
        pos[i*3+2] -= this.range.z;
        pos[i*3+0] = (Math.random() - 0.5) * this.range.x;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ---- blood burst -----------------------------------------------------------
export class Blood {
  constructor(scene) {
    this.max = 240;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.col = new Float32Array(this.max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.22, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.active = 0;
  }

  burst(x, y, z) {
    this.points.visible = true;
    this.active = this.max;
    for (let i = 0; i < this.max; i++) {
      this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = z;
      const a = Math.random() * Math.PI * 2;
      const p = Math.random() * Math.PI;
      const s = 3 + Math.random() * 12;
      this.vel[i*3]   = Math.sin(p)*Math.cos(a)*s;
      this.vel[i*3+1] = Math.abs(Math.cos(p))*s*0.9 + 3;
      this.vel[i*3+2] = Math.sin(p)*Math.sin(a)*s;
      this.life[i] = 0.7 + Math.random() * 0.9;
      const dark = Math.random() < 0.4;
      this.col[i*3]   = dark ? 0.5 : 1.0;    // vivid comic crimson, some darker
      this.col[i*3+1] = dark ? 0.0 : 0.06;
      this.col[i*3+2] = 0.03;
    }
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt) {
    if (this.active <= 0) { this.points.visible = false; return; }
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i*3+1] += -22 * dt; // gravity
      this.pos[i*3]   += this.vel[i*3]   * dt;
      this.pos[i*3+1] += this.vel[i*3+1] * dt;
      this.pos[i*3+2] += this.vel[i*3+2] * dt;
      if (this.pos[i*3+1] < 0.02) { this.pos[i*3+1] = 0.02; this.vel[i*3+1] *= -0.28; this.vel[i*3]*=0.6; this.vel[i*3+2]*=0.6; }
      if (this.life[i] > 0) alive++;
    }
    this.active = alive;
    this.geo.attributes.position.needsUpdate = true;
  }

  reset() { this.active = 0; this.points.visible = false; for (let i=0;i<this.max;i++) this.life[i]=0; }
}

// ---- GIBS — a comic death: the body bursts into flying limbs & chunks --------
//  Chunky low-detail pieces (head, torso, arms, legs, gore bits, the soul orb)
//  launch outward with spin + gravity, bounce off the floor, then fade. Plus a
//  few growing blood splats on the ground. Cartoon-gory, never hyperreal.
export class Gibs {
  constructor(scene) {
    this.scene = scene;
    this.pieces = [];
    const flesh  = new THREE.MeshStandardMaterial({ color: 0xa81b1b, roughness: 0.9, emissive: 0x2a0303, emissiveIntensity: 0.6 });
    const flesh2 = new THREE.MeshStandardMaterial({ color: 0x7a1010, roughness: 1, emissive: 0x1e0202, emissiveIntensity: 0.5 });
    const bone   = new THREE.MeshStandardMaterial({ color: 0xe4dcc2, roughness: 0.7 });
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m); this.pieces.push(m); return m; };
    this.head = mk(new THREE.SphereGeometry(0.24, 10, 8), bone);                 // head
    mk(new THREE.BoxGeometry(0.5, 0.62, 0.4), flesh);                            // torso
    mk(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), flesh);                      // arm
    mk(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), flesh);                      // arm
    mk(new THREE.CapsuleGeometry(0.12, 0.48, 4, 8), flesh2);                     // leg
    mk(new THREE.CapsuleGeometry(0.12, 0.48, 4, 8), flesh2);                     // leg
    for (let i = 0; i < 8; i++) mk(new THREE.IcosahedronGeometry(0.09 + Math.random() * 0.09, 0), i % 2 ? flesh : flesh2);  // gore bits

    // the soul orb flies free, tinted per body
    this.soul = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xffa23a }));
    this.soul.visible = false; scene.add(this.soul); this.pieces.push(this.soul);
    this.soulGlow = glowSprite(0xffa23a, 1.5); this.soulGlow.visible = false; scene.add(this.soulGlow);

    // flat blood splats that bloom on the ground
    this.splats = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14),
        new THREE.MeshBasicMaterial({ color: 0x4a0707, transparent: true, opacity: 0, depthWrite: false }));
      s.rotation.x = -Math.PI / 2; s.position.y = 0.02; s.visible = false; scene.add(s); this.splats.push(s);
    }
    this.active = false; this._t = 0;
  }

  burst(x, y, z, soulColor = 0xffa23a, power = 1) {
    this.active = true; this._t = 0;
    this.soul.material.color.setHex(soulColor);
    this.soulGlow.material.color.setHex(soulColor);
    for (const p of this.pieces) {
      p.visible = true;
      p.position.set(x + (Math.random() - 0.5) * 0.3, y + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.3);
      p.scale.setScalar(1);
      const a = Math.random() * Math.PI * 2;
      const spd = (5 + Math.random() * 9) * power;
      const d = p.userData;
      d.vx = Math.cos(a) * spd;
      d.vy = 5 + Math.random() * 8;                    // launch UP for the splat arc
      d.vz = Math.sin(a) * spd * 0.6 + 2.5;            // bias toward the camera
      d.avx = (Math.random() - 0.5) * 20; d.avy = (Math.random() - 0.5) * 20; d.avz = (Math.random() - 0.5) * 20;
      d.life = d.maxLife = 1.5 + Math.random() * 0.8;
    }
    this.soulGlow.visible = true;
    for (const s of this.splats) {
      s.visible = true; s.material.opacity = 0;
      s.position.set(x + (Math.random() - 0.5) * 2.6, 0.02, z + (Math.random() - 0.5) * 1.8);
      s.scale.setScalar(0.2 + Math.random() * 0.4);
      s.userData.grow = 1.4 + Math.random() * 1.6;
    }
  }

  update(dt) {
    if (!this.active) return;
    this._t += dt;
    let alive = 0;
    for (const p of this.pieces) {
      if (!p.visible) continue;
      const d = p.userData;
      d.life -= dt;
      if (d.life <= 0) { p.visible = false; continue; }
      d.vy += -26 * dt;                                // gravity
      p.position.x += d.vx * dt; p.position.y += d.vy * dt; p.position.z += d.vz * dt;
      p.rotation.x += d.avx * dt; p.rotation.y += d.avy * dt; p.rotation.z += d.avz * dt;
      if (p.position.y < 0.12) {                       // floor bounce
        p.position.y = 0.12; d.vy *= -0.32; d.vx *= 0.7; d.vz *= 0.7; d.avx *= 0.5; d.avz *= 0.5;
      }
      const f = d.life / d.maxLife;
      if (f < 0.35) p.scale.setScalar(Math.max(0.01, f / 0.35));    // shrink away at the end
      alive++;
    }
    if (this.soul.visible) { this.soulGlow.position.copy(this.soul.position); this.soulGlow.scale.setScalar(1.5 * this.soul.scale.x); }
    for (const s of this.splats) {
      if (!s.visible) continue;
      s.scale.setScalar(Math.min(s.userData.grow, s.scale.x + dt * 2.4));
      if (this._t < 0.4) s.material.opacity = Math.min(0.72, s.material.opacity + dt * 2);
      else s.material.opacity = Math.max(0, s.material.opacity - dt * 0.35);
    }
    if (alive === 0 && this._t > 0.5) { this.active = false; this.hide(); }
  }

  hide() {
    for (const p of this.pieces) p.visible = false;
    this.soulGlow.visible = false;
    for (const s of this.splats) s.visible = false;
  }
  reset() { this.active = false; this.hide(); }
}

// ---- fiery sparks (explosions / bounces) -----------------------------------
export class Sparks {
  constructor(scene) {
    this.max = 220;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.col = new Float32Array(this.max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.28, vertexColors: true, transparent: true, opacity: 1.0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.active = 0;
    this._head = 0;
  }

  burst(x, y, z, power = 1) {
    this.points.visible = true;
    const n = Math.floor(60 * power);
    for (let k = 0; k < n; k++) {
      const i = this._head; this._head = (this._head + 1) % this.max;
      this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = z;
      const a = Math.random() * Math.PI * 2, p = Math.random() * Math.PI;
      const s = (3 + Math.random() * 10) * power;
      this.vel[i*3]   = Math.sin(p)*Math.cos(a)*s;
      this.vel[i*3+1] = Math.abs(Math.cos(p))*s + 2;
      this.vel[i*3+2] = Math.sin(p)*Math.sin(a)*s;
      this.life[i] = 0.4 + Math.random() * 0.6;
      const hot = Math.random();
      this.col[i*3]   = 1.0;
      this.col[i*3+1] = 0.4 + hot * 0.55;    // yellow-orange
      this.col[i*3+2] = hot * 0.25;
    }
    this.active = this.max;
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt) {
    if (this.active <= 0) { this.points.visible = false; return; }
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i*3+1] += -18 * dt;
      this.pos[i*3]   += this.vel[i*3]   * dt;
      this.pos[i*3+1] += this.vel[i*3+1] * dt;
      this.pos[i*3+2] += this.vel[i*3+2] * dt;
      if (this.life[i] > 0) alive++;
    }
    this.active = alive;
    this.geo.attributes.position.needsUpdate = true;
  }

  reset() { this.active = 0; this.points.visible = false; for (let i=0;i<this.max;i++) this.life[i]=0; }
}
