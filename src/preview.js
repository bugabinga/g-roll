// ============================================================================
//  SkinPreview — a small live 3D turntable for the Wardrobe. Its own tiny
//  renderer + scene so it never disturbs the game. Builds one copy of every
//  body (via the SKINS registry) and spins the selected one.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { SKINS } from './player.js';

export class SkinPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(0, 1.02, 4.5);
    this.camera.lookAt(0, 0.96, 0);

    this.scene.add(new THREE.AmbientLight(0x8494c0, 1.4));
    const key = new THREE.DirectionalLight(0xfff2e2, 1.9); key.position.set(2.5, 4, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7a3a, 1.3); rim.position.set(-3, 2, -3); this.scene.add(rim);
    const fill = new THREE.PointLight(0x88aaff, 7, 14, 2); fill.position.set(-2, 1.2, 3); this.scene.add(fill);

    // a faint pedestal ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.025, 6, 36), new THREE.MeshBasicMaterial({ color: 0x6a5628 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.015; this.scene.add(ring);

    this.models = SKINS.map((s) => { const g = s.build().group; g.visible = false; this.scene.add(g); return g; });
    this.current = 0;
    this._t = 0;
    this._w = this._h = 0;
  }

  show(idx) {
    this.current = idx;
    this.models.forEach((g, i) => { g.visible = (i === idx); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); });
  }

  update(dt) {
    this._t += dt;
    const g = this.models[this.current];
    if (g) { g.rotation.y = this._t * 0.6; g.position.y = Math.sin(this._t * 1.6) * 0.02; }
    this._resize();
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = this.canvas.clientWidth || 210, h = this.canvas.clientHeight || 210;
    if (this._w !== w || this._h !== h) {
      this._w = w; this._h = h;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
}
