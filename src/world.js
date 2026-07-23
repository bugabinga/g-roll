// ============================================================================
//  The World — a cursed cathedral corridor that scrolls forever toward you.
//  Fog, torchlight, gothic pillars and arches, a dead god-tree on the horizon.
//  Floor + decor are pooled into recycled segments for an endless hall.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { CONFIG, LANES } from './config.js';
import { glowSprite } from './particles.js';

const SEG = CONFIG.segmentLength;
const COUNT = CONFIG.segmentCount;
const HALL_W = 7.0;

export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.fog = new THREE.FogExp2(0x0d0d16, 0.015);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    this.camera.position.set(0, 4.3, 8.4);
    this.camera.lookAt(0, 1.4, -6);
    this._camBaseY = 4.3;

    this._buildLights();
    this._buildSky();
    this._buildStars();
    this._buildSegments();
    this._buildHorizon();
    this.setDayMode(false);

    this.speed = 0;
    this.shake = 0;
    this._vertigo = false;
    this._t = 0;
  }

  _buildLights() {
    // Cheap, uniform fill (ambient + hemisphere cost almost nothing and brighten
    // the whole scene) does the heavy lifting so we need very few punctual lights.
    this.ambient = new THREE.AmbientLight(0x586688, 1.45);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x8090c0, 0x4a1c1c, 1.25);
    this.scene.add(this.hemi);

    this.sky = new THREE.DirectionalLight(0x9fb0e0, 0.7);   // moon (night) / sun (day)
    this.sky.position.set(-8, 20, -6);
    this.scene.add(this.sky);
    this.key = new THREE.DirectionalLight(0xff8a44, 0.6);
    this.key.position.set(2, 8, -24);
    this.scene.add(this.key);

    // Warm spotlight fixed over the action zone — the world scrolls beneath it,
    // so the player and the obstacles about to reach them stay readable.
    const stage = new THREE.SpotLight(0xffc27a, 120, 34, Math.PI * 0.34, 0.5, 1.2);
    stage.position.set(0, 10, 7);
    stage.target.position.set(0, 1, -8);
    this.scene.add(stage);
    this.scene.add(stage.target);

    // A couple of flickering torch lights fixed near the action for warmth +
    // life. Fixed (not per-segment) keeps the punctual-light count tiny.
    this.torchLights = [];
    for (const sx of [-1, 1]) {
      const t = new THREE.PointLight(0xff7a2a, 22, 22, 2);
      t.position.set(sx * 4.2, 3.4, -2);
      this.scene.add(t);
      this.torchLights.push(t);
    }
  }

  _buildSegments() {
    this.segments = [];
    // wet flagstone: lower roughness + a little metalness so torch/emissive glints
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1b1d27, roughness: 0.62, metalness: 0.38 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x262a37, roughness: 0.85, metalness: 0.15 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x2c303c, roughness: 0.8, metalness: 0.2 });
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x2a0606, emissive: 0xb01414, emissiveIntensity: 1.1, roughness: 0.5 });
    const statueMat = new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.9, metalness: 0.1 });

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

        // torch bracket + flame + soft bloom
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc65a });
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), flameMat);
        flame.position.set(sx * (HALL_W/2 + 0.2), 3.2, 0);
        seg.add(flame);
        const bloom = glowSprite(0xff8a30, 2.6);
        bloom.position.copy(flame.position);
        seg.add(bloom);
        seg.userData[`flame${sx}`] = flame;

        // a gothic statue standing sentinel beyond the wall (every other segment)
        if (i % 2 === 1) {
          const st = new THREE.Group();
          const ped = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), statueMat); ped.position.y = 0.3; st.add(ped);
          const robe = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.9, 7), statueMat); robe.position.y = 1.55; st.add(robe);
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), statueMat); head.position.y = 2.55; st.add(head);
          for (const ax of [-1, 1]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 4), statueMat); wing.position.set(ax * 0.4, 1.7, -0.1); wing.rotation.z = ax * 0.5; st.add(wing); }
          st.position.set(sx * (HALL_W / 2 + 1.9), 0, 0); st.rotation.y = sx > 0 ? -0.5 : 0.5;
          seg.add(st);
        }
      }

      // NOTE: no per-segment PointLight — those are the main mobile perf killer.
      // The fixed action-zone torches in _buildLights supply the flicker instead.

      // arch overhead every other segment
      if (i % 2 === 0) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(HALL_W/2 + 0.7, 0.28, 6, 12, Math.PI), pillarMat);
        arch.rotation.z = Math.PI;
        arch.position.set(0, 4.4, 0);
        arch.scale.y = 0.8;
        seg.add(arch);
      }

      seg.position.z = -i * SEG;
      this.scene.add(seg);
      this.segments.push(seg);
    }
    this._frontZ = -(COUNT - 1) * SEG; // z of the furthest segment edge
  }

  _makeSkyDome(topHex, midHex, horizonHex) {
    const geo = new THREE.SphereGeometry(300, 24, 16);
    const top = new THREE.Color(topHex), mid = new THREE.Color(midHex), horizon = new THREE.Color(horizonHex);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = THREE.MathUtils.clamp((pos.getY(i) / 300 + 0.15) / 1.15, 0, 1);
      if (h < 0.4) c.copy(horizon).lerp(mid, h / 0.4);
      else c.copy(mid).lerp(top, (h - 0.4) / 0.6);
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  }

  _buildSky() {
    // two gradient domes — a dread night and a pallid, overcast day — toggled per run
    this.nightSky = this._makeSkyDome(0x0a0a1c, 0x0d0d16, 0x1c0a12);
    this.daySky = this._makeSkyDome(0x3a5a86, 0x5b769c, 0x9a8a86);
    this.scene.add(this.nightSky);
    this.scene.add(this.daySky);

    this._buildCelestial();
  }

  _buildCelestial() {
    // moon (night) and a pale sun (day)
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xdfe4f0, fog: false }));
    this.moon.position.set(-40, 70, -200); this.moon.lookAt(0, 0, 0);
    const moonGlow = glowSprite(0xbfd0ff, 42); moonGlow.position.copy(this.moon.position); this.scene.add(moonGlow); this.moonGlow = moonGlow;
    this.scene.add(this.moon);

    this.sun = new THREE.Mesh(new THREE.CircleGeometry(11, 24), new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false }));
    this.sun.position.set(46, 78, -200); this.sun.lookAt(0, 0, 0);
    const sunGlow = glowSprite(0xffd08a, 70); sunGlow.position.copy(this.sun.position); this.scene.add(sunGlow); this.sunGlow = sunGlow;
    this.scene.add(this.sun);

    // planets floating in the far sky (present in both modes, low + huge)
    this.planets = new THREE.Group();
    const defs = [
      { r: 16, x: -95, y: 52, z: -260, col: 0x8a5a3a, ring: true,  rc: 0xd8b48a },
      { r: 11, x: 80,  y: 88, z: -280, col: 0x9a3a3a, ring: false },
      { r: 22, x: 30,  y: 40, z: -300, col: 0x3a4a6a, ring: false },
    ];
    for (const d of defs) {
      const planet = new THREE.Mesh(new THREE.SphereGeometry(d.r, 20, 16),
        new THREE.MeshStandardMaterial({ color: d.col, roughness: 1, metalness: 0.1, emissive: d.col, emissiveIntensity: 0.15, fog: false }));
      planet.position.set(d.x, d.y, d.z);
      this.planets.add(planet);
      if (d.ring) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 1.4, d.r * 2.1, 40),
          new THREE.MeshBasicMaterial({ color: d.rc, side: THREE.DoubleSide, transparent: true, opacity: 0.5, fog: false }));
        ring.position.copy(planet.position); ring.rotation.set(1.2, 0.3, 0);
        this.planets.add(ring);
      }
    }
    this.scene.add(this.planets);
  }

  // 1-in-5 runs are lit by a wan grey daylight instead of the dread night.
  setDayMode(day) {
    this.dayMode = day;
    this.nightSky.visible = !day;
    this.daySky.visible = day;
    this.moon.visible = !day; this.moonGlow.visible = !day;
    this.sun.visible = day; this.sunGlow.visible = day;
    if (this.stars) this.stars.material.opacity = day ? 0.12 : 0.9;
    this.scene.background = new THREE.Color(day ? 0x5b769c : 0x05060a);

    // lighting: bright, cool, flat by day; dim, warm, moody by night
    this.ambient.color.setHex(day ? 0xb8c6e0 : 0x586688);
    this.ambient.intensity = day ? 2.1 : 1.45;
    this.hemi.color.setHex(day ? 0xcdd8ee : 0x8090c0);
    this.hemi.groundColor.setHex(day ? 0x6a6258 : 0x4a1c1c);
    this.hemi.intensity = day ? 1.7 : 1.25;
    this.sky.color.setHex(day ? 0xfff4dc : 0x9fb0e0);
    this.sky.intensity = day ? 1.5 : 0.7;
    this.key.intensity = day ? 0.25 : 0.6;
    this.fog.color.setHex(day ? 0xa9bcd6 : 0x0d0d16);
  }

  _buildStars() {
    // A static night sky filling the open dark above the corridor. The camera is
    // fixed in z (the world scrolls beneath it), so the stars never need to move.
    const count = 520;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i*3+0] = (Math.random() - 0.5) * 240;
      pos[i*3+1] = 8 + Math.random() * 120;               // above the walls
      pos[i*3+2] = -20 - Math.random() * 300;             // ahead, into the dark
      const t = Math.random();
      if (t < 0.72)      { col[i*3]=0.85; col[i*3+1]=0.88; col[i*3+2]=1.0; } // white-blue
      else if (t < 0.9)  { col[i*3]=1.0;  col[i*3+1]=0.95; col[i*3+2]=0.8; } // warm
      else               { col[i*3]=1.0;  col[i*3+1]=0.55; col[i*3+2]=0.3; } // ember-red
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.7, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _buildHorizon() {
    // a dead god-tree far ahead — the unreachable landmark (Elden Ring nod)
    const grp = new THREE.Group();
    const barkMat = new THREE.MeshBasicMaterial({ color: 0x1a1408 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 5, 60, 7), barkMat);
    trunk.position.y = 22;
    grp.add(trunk);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 16; i++) {
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
      for (const sx of [-1, 1]) {
        const fl = seg.userData[`flame${sx}`];
        if (fl) fl.scale.setScalar(0.85 + Math.random() * 0.4);
      }
    }

    // flicker the fixed action-zone torch lights
    if (this.torchLights) {
      for (let i = 0; i < this.torchLights.length; i++) {
        this.torchLights[i].intensity = 18 + Math.sin(this._t * 11 + i * 2) * 5 + Math.random() * 4;
      }
    }

    // keep the horizon landmark hovering far ahead
    this.horizon.position.z = this.camera.position.z - 150;

    // gentle star twinkle (one cheap global shimmer)
    if (this.stars) this.stars.material.opacity = 0.75 + Math.sin(this._t * 2.2) * 0.15;

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
      ox += Math.sin(this._t * 1.6) * 0.95 + Math.sin(this._t * 3.1) * 0.3;
      oy += Math.cos(this._t * 1.1) * 0.5;
      roll += Math.sin(this._t * 0.8) * 0.11;
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
