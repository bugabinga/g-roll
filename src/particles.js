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
      const dark = Math.random() < 0.5;
      this.col[i*3]   = dark ? 0.35 : 0.7;   // crimson, some near-black
      this.col[i*3+1] = dark ? 0.0 : 0.03;
      this.col[i*3+2] = 0.02;
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
