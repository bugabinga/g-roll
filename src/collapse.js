// ============================================================================
//  The Collapse — the CORRIDOR ITSELF shearing apart at your heels: the floor
//  breaks off and tilts into a void, pillars topple, masonry tumbles through a
//  dust plume lit by dying embers. It hunts you at the start of a run, but a
//  clean runner OUTRUNS it — it recedes and fades away so it never distracts
//  from the core game — surging back only on a mistake, and burying you on death.
//  Cinematic pressure only (never itself lethal). No new lights.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { glowSprite } from './particles.js';

const COL_W = 7.0;

// soft, dark, normal-blended dust puff (occludes, unlike the additive glows)
let _dustTex = null;
function dustTexture() {
  if (_dustTex) return _dustTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(40,34,30,0.95)');
  g.addColorStop(0.5, 'rgba(28,23,21,0.55)');
  g.addColorStop(1, 'rgba(16,13,12,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _dustTex = new THREE.CanvasTexture(c);
  return _dustTex;
}
function dustPuff(size) {
  const m = new THREE.SpriteMaterial({ map: dustTexture(), transparent: true, depthWrite: false, opacity: 0.8 });
  const s = new THREE.Sprite(m); s.scale.set(size, size, size);
  return s;
}

export class Collapse {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // materials matched to the corridor so it reads as THAT architecture breaking
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b1d27, roughness: 0.7, metalness: 0.3 });
    const stone    = new THREE.MeshStandardMaterial({ color: 0x24222b, roughness: 1 });
    const pillarM  = new THREE.MeshStandardMaterial({ color: 0x2c303c, roughness: 0.85, metalness: 0.18 });
    const voidMat  = new THREE.MeshBasicMaterial({ color: 0x040407 });

    // the FLOOR shears off and tilts down into the pit — the world giving way
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(COL_W, 0.4, 3.4), floorMat);
    shelf.position.set(0, 0.05, 1.5); shelf.rotation.x = -0.62;
    this.group.add(shelf);
    // a second cracked slab, offset, dropping further
    const shelf2 = new THREE.Mesh(new THREE.BoxGeometry(COL_W * 0.6, 0.35, 2.2), floorMat);
    shelf2.position.set(COL_W * 0.18, -0.7, 0.4); shelf2.rotation.set(-1.0, 0.3, 0.15);
    this.group.add(shelf2);
    // the void the corridor falls into (low, so it never walls the frame)
    const pit = new THREE.Mesh(new THREE.BoxGeometry(COL_W + 3, 3, 2.2), voidMat);
    pit.position.set(0, -1.9, -0.3); this.group.add(pit);

    // toppling pillar stumps from the colonnade
    this.stumps = [];
    for (const sx of [-1, 1]) {
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 2.6 + Math.random() * 1.4, 8), pillarM);
      stump.position.set(sx * (COL_W / 2 - 0.2), 0.4, -0.3);
      stump.rotation.z = sx * (0.55 + Math.random() * 0.4); stump.rotation.x = (Math.random() - 0.5) * 0.4;
      this.group.add(stump); this.stumps.push(stump);
    }

    // jagged broken floor tiles + masonry (kept low)
    for (let i = 0; i < 8; i++) {
      const w = 1.1 + Math.random() * 1.7, h = 0.5 + Math.random() * 1.3;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.8 + Math.random()), i % 2 ? stone : pillarM);
      b.position.set((Math.random() - 0.5) * (COL_W + 1), h / 2 - 0.35, (Math.random() - 0.5) * 1.8);
      b.rotation.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.7);
      this.group.add(b);
    }
    // tumbling debris chunks
    this.debris = [];
    for (let i = 0; i < 9; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.3 + Math.random() * 0.45, 0.3 + Math.random() * 0.45, 0.3 + Math.random() * 0.45), stone);
      d.userData = { vy: -(1.5 + Math.random() * 2.5), sx: (Math.random() - 0.5) * 5, spin: (Math.random() - 0.5) * 7, top: 2 + Math.random() * 3 };
      d.position.set((Math.random() - 0.5) * COL_W, Math.random() * 3.5, (Math.random() - 0.5) * 1.2);
      this.group.add(d); this.debris.push(d);
    }
    // rolling dust plume
    this.dust = [];
    for (let i = 0; i < 6; i++) { const p = dustPuff(3 + Math.random() * 2.5); p.position.set((Math.random() - 0.5) * COL_W, 1.2 + Math.random() * 2.6, 0.3); this.group.add(p); this.dust.push(p); }
    // dying embers glinting in the fall
    this.embers = [];
    for (let i = 0; i < 5; i++) { const e = glowSprite(0xff5a1e, 1.0 + Math.random() * 0.8); e.position.set((Math.random() - 0.5) * COL_W, 0.5 + Math.random() * 2, 0.5); this.group.add(e); this.embers.push(e); }

    this.far = 5.5;      // z when outrun (receded, faded to nothing)
    this.near = 3.4;     // z when it's right at your heels (low in the frame)
    this.proximity = 0;
    this.lunge = 0;
    this.introScale = 1;
    this._t = 0;
    this.reset();
  }

  reset() {
    this.proximity = 0; this.lunge = 0; this.introScale = 1; this._t = 0;
    this.group.visible = true;
    this.group.position.set(0, 0, this.far);
    this.group.scale.set(0.001, 0.001, 1);
  }

  setProximity(p) { this.proximity = THREE.MathUtils.clamp(p, 0, 1); }
  addLunge(a = 1) { this.lunge = Math.min(1.6, this.lunge + a); }
  crush() { this.proximity = 1; this.lunge = 1.6; }        // death: flood forward
  hide() { this.group.visible = false; }

  // on-screen "closeness" (0..1) so the HUD veil can match it
  closeness() { return THREE.MathUtils.clamp(this.proximity + this.lunge * 0.45, 0, 1); }

  update(dt) {
    if (!this.group.visible) return 0;
    this._t += dt;
    this.lunge = Math.max(0, this.lunge - dt * 2.4);
    const p = this.closeness();
    const z = THREE.MathUtils.lerp(this.far, this.near, p);
    this.group.position.z += (z - this.group.position.z) * Math.min(1, dt * 6);
    // FADE: once you've outrun it (low closeness) it shrinks away to nothing, so
    // it stops distracting from the core game until a mistake calls it back.
    const fade = THREE.MathUtils.smoothstep(p, 0.02, 0.16);
    const s = (0.75 + p * 0.3) * (this.introScale || 1) * fade;
    this.group.scale.set(Math.max(0.001, s), Math.max(0.001, s), 1);

    for (const d of this.debris) {
      d.position.y += d.userData.vy * dt * 2.2;
      d.position.x += d.userData.sx * dt * 0.3;
      d.rotation.x += d.userData.spin * dt; d.rotation.z += d.userData.spin * 0.7 * dt;
      if (d.position.y < -1) { d.position.y = d.userData.top; d.position.x = (Math.random() - 0.5) * COL_W; }
    }
    for (let i = 0; i < this.dust.length; i++) {
      const q = this.dust[i]; const sc = 4 + Math.sin(this._t * 1.3 + i) * 1.3;
      q.scale.set(sc, sc, sc); q.material.opacity = (0.4 + Math.sin(this._t * 0.9 + i) * 0.2) * (0.5 + p * 0.5) * fade;
    }
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i]; e.material.opacity = (0.4 + Math.random() * 0.5) * (0.4 + p * 0.6) * fade;
      e.scale.setScalar(1.1 + Math.sin(this._t * 4 + i) * 0.4);
    }
    return p;
  }
}
