// ============================================================================
//  The Collapse — the cathedral caves in at your heels. A churning wall of
//  falling masonry, dust and dying embers hunts the camera from behind. It is
//  never itself lethal (cinematic pressure only): its closeness is driven by a
//  "dread" value — clean running holds it back, mistakes let it surge, and on
//  death it floods forward to bury you. No new lights; pooled meshes + sprites.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { glowSprite } from './particles.js';

const HALL_W = 7.0;

// soft, dark, normal-blended dust puff (the additive glow sprites brighten —
// dust must OCCLUDE, so it gets its own smoky texture)
let _dustTex = null;
function dustTexture() {
  if (_dustTex) return _dustTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(38,32,28,0.95)');
  g.addColorStop(0.5, 'rgba(26,22,20,0.55)');
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

    const stone  = new THREE.MeshStandardMaterial({ color: 0x14141b, roughness: 1 });
    const stone2 = new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: 1 });

    // a low, jagged heap of caved-in rubble — kept SHORT and low so even when it
    // surges close it stays at the bottom of the frame and never masks the runner
    for (let i = 0; i < 8; i++) {
      const w = 1.3 + Math.random() * 2.0, h = 0.9 + Math.random() * 1.6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.0 + Math.random()), i % 2 ? stone : stone2);
      b.position.set((Math.random() - 0.5) * (HALL_W + 1), h / 2 - 0.6, (Math.random() - 0.5) * 1.4);
      b.rotation.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5);
      this.group.add(b);
    }
    // a dark shadow band low behind the rubble to read as a bottomless cave-in
    const back = new THREE.Mesh(new THREE.BoxGeometry(HALL_W + 6, 3.2, 0.8), new THREE.MeshBasicMaterial({ color: 0x05050a }));
    back.position.set(0, 0.4, -1.1); this.group.add(back);

    // tumbling debris chunks (kept low)
    this.debris = [];
    for (let i = 0; i < 9; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.3 + Math.random() * 0.45, 0.3 + Math.random() * 0.45, 0.3 + Math.random() * 0.45), stone2);
      d.userData = { vy: -(1.5 + Math.random() * 2.5), sx: (Math.random() - 0.5) * 5, spin: (Math.random() - 0.5) * 7, top: 2 + Math.random() * 3 };
      d.position.set((Math.random() - 0.5) * HALL_W, Math.random() * 3.5, (Math.random() - 0.5) * 1.2);
      this.group.add(d); this.debris.push(d);
    }
    // rolling dust plume
    this.dust = [];
    for (let i = 0; i < 6; i++) { const p = dustPuff(3 + Math.random() * 2.5); p.position.set((Math.random() - 0.5) * HALL_W, 1.0 + Math.random() * 2.6, 0.3); this.group.add(p); this.dust.push(p); }
    // dying embers glinting in the fall
    this.embers = [];
    for (let i = 0; i < 5; i++) { const e = glowSprite(0xff5a1e, 1.0 + Math.random() * 0.8); e.position.set((Math.random() - 0.5) * HALL_W, 0.4 + Math.random() * 2, 0.5); this.group.add(e); this.embers.push(e); }

    this.group.position.y = -0.4;   // sit the heap low in the corridor
    this.far = 0.5;      // z when calm (distant, small, high up the corridor)
    this.near = 4.0;     // z when it's right at your heels (still below the runner)
    this.proximity = 0.12;
    this.lunge = 0;
    this._t = 0;
    this.reset();
  }

  reset() {
    this.proximity = 0.12; this.lunge = 0; this._t = 0;
    this.group.visible = true;
    this.group.position.set(0, -0.4, this.far);
    this.group.scale.set(1, 1, 1);
  }

  setProximity(p) { this.proximity = THREE.MathUtils.clamp(p, 0, 1); }
  addLunge(a = 1) { this.lunge = Math.min(1.6, this.lunge + a); }
  crush() { this.proximity = 1; this.lunge = 1.6; }        // death: flood forward
  hide() { this.group.visible = false; }

  // returns the on-screen "closeness" (0..1) so the HUD veil can match it
  closeness() { return THREE.MathUtils.clamp(this.proximity + this.lunge * 0.45, 0, 1); }

  update(dt) {
    if (!this.group.visible) return 0;
    this._t += dt;
    this.lunge = Math.max(0, this.lunge - dt * 2.4);
    const p = this.closeness();
    const z = THREE.MathUtils.lerp(this.far, this.near, p);
    this.group.position.z += (z - this.group.position.z) * Math.min(1, dt * 6);
    const s = 1 + p * 0.18;                                // loom a little bigger as it nears
    this.group.scale.set(s, s, 1);

    for (const d of this.debris) {
      d.position.y += d.userData.vy * dt * 2.2;
      d.position.x += d.userData.sx * dt * 0.3;
      d.rotation.x += d.userData.spin * dt; d.rotation.z += d.userData.spin * 0.7 * dt;
      if (d.position.y < -1) { d.position.y = d.userData.top; d.position.x = (Math.random() - 0.5) * HALL_W; }
    }
    for (let i = 0; i < this.dust.length; i++) {
      const q = this.dust[i]; const sc = 4 + Math.sin(this._t * 1.3 + i) * 1.3;
      q.scale.set(sc, sc, sc); q.material.opacity = (0.4 + Math.sin(this._t * 0.9 + i) * 0.2) * (0.6 + p * 0.5);
    }
    for (let i = 0; i < this.embers.length; i++) {
      const e = this.embers[i]; e.material.opacity = (0.4 + Math.random() * 0.5) * (0.5 + p * 0.6);
      e.scale.setScalar(1.1 + Math.sin(this._t * 4 + i) * 0.4);
    }
    return p;
  }
}
