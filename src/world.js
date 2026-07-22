// ============================================================================
//  The World — a cursed cathedral corridor that scrolls forever toward you.
//  Fog, torchlight, gothic pillars and arches, a dead god-tree on the horizon.
//  Floor + decor are pooled into recycled segments for an endless hall.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { CONFIG, LANES } from './config.js';

const SEG = CONFIG.segmentLength;
const COUNT = CONFIG.segmentCount;
const HALL_W = 7.0;

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.fog = new THREE.FogExp2(0x07070c, 0.028);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.camera.position.set(0, 4.3, 8.4);
    this.camera.lookAt(0, 1.4, -6);
    this._camBaseY = 4.3;

    this._buildLights();
    this._buildSegments();
    this._buildHorizon();

    this.speed = 0;
    this.shake = 0;
    this._vertigo = false;
    this._t = 0;
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x2b3750, 0.7));
    const moon = new THREE.DirectionalLight(0x8899cc, 0.4);
    moon.position.set(-8, 20, -6);
    this.scene.add(moon);
    // a cold key light from ahead to rim the obstacles
    const key = new THREE.DirectionalLight(0xff7733, 0.3);
    key.position.set(2, 8, -30);
    this.scene.add(key);

    // warm spotlight fixed over the action zone — the world scrolls beneath it,
    // so the player and the obstacles about to reach them stay readable.
    const stage = new THREE.SpotLight(0xffb066, 60, 26, Math.PI * 0.32, 0.5, 1.4);
    stage.position.set(0, 9, 6);
    stage.target.position.set(0, 1, -6);
    this.scene.add(stage);
    this.scene.add(stage.target);
    // a soft fill so near-field obstacles read even between torches
    const fill = new THREE.PointLight(0xffd9a8, 8, 20, 2);
    fill.position.set(0, 5, 2);
    this.scene.add(fill);
  }

  _buildSegments() {
    this.segments = [];
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0e12, roughness: 0.98, metalness: 0.02 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x171921, roughness: 0.95 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 0.9 });
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x220505, emissive: 0x8a1010, emissiveIntensity: 0.7, roughness: 0.6 });

    for (let i = 0; i < COUNT; i++) {
      const seg = new THREE.Group();

      // floor slab
      const floor = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.4, SEG), floorMat);
      floor.position.y = -0.2;
      floor.receiveShadow = true;
      seg.add(floor);

      // faint rune lines between lanes (readability + atmosphere)
      for (const lx of [(LANES[0]+LANES[1])/2, (LANES[1]+LANES[2])/2]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, SEG*0.96), runeMat);
        line.position.set(lx, 0.01, 0);
        seg.add(line);
      }

      // side gutters / walls
      for (const sx of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.2, SEG), stoneMat);
        wall.position.set(sx * (HALL_W/2 + 0.4), 1.4, 0);
        seg.add(wall);

        // a pillar mid-segment
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 6.2, 8), pillarMat);
        pillar.position.set(sx * (HALL_W/2 + 0.9), 3, 0);
        pillar.castShadow = true;
        seg.add(pillar);

        // torch bracket + light
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa33a });
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), flameMat);
        flame.position.set(sx * (HALL_W/2 + 0.2), 3.2, 0);
        seg.add(flame);
        seg.userData[`flame${sx}`] = flame;
      }

      // arch overhead every other segment
      if (i % 2 === 0) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(HALL_W/2 + 0.7, 0.28, 6, 12, Math.PI), pillarMat);
        arch.rotation.z = Math.PI;
        arch.position.set(0, 4.4, 0);
        arch.scale.y = 0.8;
        seg.add(arch);
      }

      // one torch light per segment (perf-friendly)
      const torch = new THREE.PointLight(0xff7a2a, 6.5, 16, 2);
      torch.position.set((i % 2 ? -1 : 1) * (HALL_W/2 + 0.1), 3.2, 0);
      seg.add(torch);
      seg.userData.torch = torch;

      seg.position.z = -i * SEG;
      this.scene.add(seg);
      this.segments.push(seg);
    }
    this._frontZ = -(COUNT - 1) * SEG; // z of the furthest segment edge
  }

  _buildHorizon() {
    // a dead god-tree far ahead — the unreachable landmark (Elden Ring nod)
    const grp = new THREE.Group();
    const barkMat = new THREE.MeshBasicMaterial({ color: 0x1a1408 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 5, 60, 7), barkMat);
    trunk.position.y = 22;
    grp.add(trunk);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 34; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 18 + Math.random()*20, 5), barkMat);
      const a = Math.random() * Math.PI * 2;
      b.position.set(Math.cos(a)*10, 42 + Math.random()*22, Math.sin(a)*6);
      b.rotation.set((Math.random()-0.5), a, (Math.random()-0.5));
      grp.add(b);
      if (Math.random() < 0.6) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random()*3, 6, 6), glowMat);
        leaf.position.copy(b.position);
        leaf.position.y += 8;
        grp.add(leaf);
      }
    }
    grp.position.set(-4, -2, -150);
    grp.scale.set(1.4, 1.4, 1.4);
    this.horizon = grp;
    this.scene.add(grp);
  }

  setSpeed(s) { this.speed = s; }
  setFogDensity(d) { this.fog.density = d; }
  setVertigo(v) { this._vertigo = v; }
  addShake(a) { this.shake = Math.min(1.4, this.shake + a); }

  update(dt) {
    this._t += dt;

    // scroll & recycle segments
    for (const seg of this.segments) {
      seg.position.z += this.speed * dt;
      if (seg.position.z > this.camera.position.z + SEG * 0.6) {
        seg.position.z -= COUNT * SEG;
      }
      // flicker torch
      const torch = seg.userData.torch;
      if (torch) torch.intensity = 5.5 + Math.sin(this._t * 9 + seg.position.z) * 1.6 + Math.random() * 1.2;
      for (const sx of [-1, 1]) {
        const fl = seg.userData[`flame${sx}`];
        if (fl) fl.scale.setScalar(0.85 + Math.random() * 0.4);
      }
    }

    // keep the horizon landmark hovering far ahead
    this.horizon.position.z = this.camera.position.z - 150;

    // camera shake / vertigo
    let ox = 0, oy = 0, oz = 0, roll = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake;
      ox = (Math.random()-0.5) * s * 0.9;
      oy = (Math.random()-0.5) * s * 0.9;
      roll = (Math.random()-0.5) * s * 0.12;
    }
    if (this._vertigo) {
      ox += Math.sin(this._t * 1.3) * 0.5;
      oy += Math.cos(this._t * 0.9) * 0.25;
      roll += Math.sin(this._t * 0.7) * 0.05;
    }
    this.camera.position.x = ox;
    this.camera.position.y = this._camBaseY + oy;
    this.camera.rotation.z = roll;
    this.camera.lookAt(ox * 0.4, 1.4, -6);
    if (roll) this.camera.rotation.z += roll;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
