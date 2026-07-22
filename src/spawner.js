// ============================================================================
//  Spawner — the procession of the dead. Obstacles and gem-runes stream out of
//  the fog. Rows are curated so every one is survivable with skill; nothing is
//  ever a coin-flip. Meshes are pooled per type to keep it smooth.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { CONFIG, LANES } from './config.js';

const PLAYER_HALF_DEPTH = 0.55;

// vertical geometry contract shared with the player's collision volume
const LOW_TOP = 1.15;    // must clear with a jump (bottom above this)
const HIGH_BOT = 1.25;   // must duck under with a roll (top below this)

// ---------------------------------------------------------------------------
//  Mesh factories (procedural gothic props)
// ---------------------------------------------------------------------------
const MATS = {
  bone:   new THREE.MeshStandardMaterial({ color: 0xcac3b0, roughness: 0.85 }),
  stone:  new THREE.MeshStandardMaterial({ color: 0x2a2c36, roughness: 0.95 }),
  darkStone: new THREE.MeshStandardMaterial({ color: 0x14151b, roughness: 1.0 }),
  iron:   new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.6, metalness: 0.5 }),
  flesh:  new THREE.MeshStandardMaterial({ color: 0x3d1010, roughness: 1.0 }),
  gold:   new THREE.MeshStandardMaterial({ color: 0x7a1414, emissive: 0xff2a2a, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4 }),
  eye:    new THREE.MeshBasicMaterial({ color: 0xff3010 }),
  pit:    new THREE.MeshBasicMaterial({ color: 0x000000 }),
};

function makeLow() {          // bone spikes / tombstone — JUMP
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.5), MATS.stone);
  base.position.y = 0.5; g.add(base);
  for (let i = -1; i <= 1; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5), MATS.bone);
    spike.position.set(i * 0.5, 1.1, 0);
    g.add(spike);
  }
  g.userData.type = 'low'; g.userData.depth = 0.9;
  return g;
}

function makeHigh() {         // overhead gate with hanging teeth — ROLL UNDER
  const g = new THREE.Group();
  // side posts frame the opening so it clearly reads as a gate
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.4, 0.34), MATS.stone);
    post.position.set(sx * 0.98, 1.7, 0); g.add(post);
  }
  // heavy lintel: the low ceiling you must duck beneath (bottom at HIGH_BOT)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 0.62), MATS.darkStone);
  lintel.position.y = HIGH_BOT + 0.9; g.add(lintel);
  // a warning band on the underside so the gap reads at speed
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.66),
    new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: 0xff2a2a, emissiveIntensity: 1.2, roughness: 0.5 }));
  band.position.y = HIGH_BOT + 0.02; g.add(band);
  // hanging teeth pointing down — "do not stand"
  for (let i = -2; i <= 2; i++) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 5), MATS.bone);
    tooth.position.set(i * 0.42, HIGH_BOT + 0.15, 0.12); tooth.rotation.x = Math.PI; g.add(tooth);
  }
  g.userData.type = 'high'; g.userData.depth = 0.9;
  return g;
}

function makePad() {          // springboard rune — JUMP PAD (launches you up)
  const g = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: 0x39ff9a });
  const glowDim = new THREE.MeshStandardMaterial({ color: 0x0a3a24, emissive: 0x28e07a, emissiveIntensity: 1.6, roughness: 0.4 });
  // low ramp plate flush with the floor
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 1.9), glowDim);
  plate.position.y = 0.09; g.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 6, 16), glow);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  // upward chevrons that say "leap here"
  for (let i = 0; i < 3; i++) {
    const chev = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 4), glow);
    chev.position.set(0, 0.24, 0.5 - i * 0.5); g.add(chev);
  }
  g.userData.type = 'pad'; g.userData.depth = 1.9;
  g.userData.spin = ring;
  return g;
}

function makeBlock() {        // sarcophagus / slab — CHANGE LANE
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.5, 1.0), MATS.stone);
  slab.position.y = 1.25; slab.castShadow = true; g.add(slab);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.3, 1.15), MATS.darkStone);
  lid.position.y = 2.5; g.add(lid);
  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.05), MATS.gold);
  rune.position.set(0, 1.4, 0.53); g.add(rune);
  g.userData.type = 'block'; g.userData.depth = 1.0;
  return g;
}

function makeGap() {          // pit — JUMP
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 3.0), MATS.pit);
  hole.position.y = -0.26; g.add(hole);
  // jagged edges
  for (const z of [-1.4, 1.4]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.2), MATS.stone);
    edge.position.set(0, 0.05, z); g.add(edge);
  }
  g.userData.type = 'gap'; g.userData.depth = 3.0;
  return g;
}

function makeBeast() {        // charging horror — the "train". CHANGE LANE
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 4.0, 4, 8), MATS.flesh);
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.0; g.add(body);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 4.2), MATS.darkStone);
  spine.position.y = 1.7; g.add(spine);
  // maw + eyes up front (facing +z, toward player)
  const maw = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 7), MATS.flesh);
  maw.rotation.x = -Math.PI / 2; maw.position.set(0, 1.0, 2.6); g.add(maw);
  for (const sx of [-0.35, 0.35]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), MATS.eye);
    eye.position.set(sx, 1.5, 2.3); g.add(eye);
  }
  // no PointLight — unlit MeshBasicMaterial eyes read as glowing for free
  g.userData.type = 'beast'; g.userData.depth = 5.2;
  return g;
}

const FACTORY = { low: makeLow, high: makeHigh, block: makeBlock, gap: makeGap, beast: makeBeast, pad: makePad };

function makeGem() {
  // A faceted rune. The bright core (unlit MeshBasic) + a translucent standard
  // shell make it glow without needing a per-gem PointLight (huge perf win).
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    new THREE.MeshBasicMaterial({ color: 0xff4d4d })
  );
  g.add(core);
  const shell = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38, 0),
    new THREE.MeshStandardMaterial({
      color: 0xb31111, emissive: 0xff1a1a, emissiveIntensity: 2.2,
      roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.5,
    })
  );
  g.add(shell);
  g.userData.core = core;
  return g;
}

// curated, always-solvable row patterns  (n=null, otherwise a type key)
const n = null;
const ROWS = {
  easy: [
    ['low', n, n], [n, 'low', n], [n, n, 'low'],
    ['high', n, n], [n, 'high', n], [n, n, 'high'],
    ['block', n, n], [n, n, 'block'],
    ['low', 'low', 'low'], ['high', 'high', 'high'],
  ],
  mid: [
    ['low', n, 'low'], ['high', n, 'high'], ['block', n, 'block'],
    [n, 'gap', n], ['gap', n, n], [n, n, 'gap'],
    ['block', 'block', n], [n, 'block', 'block'],
    ['beast', n, n], [n, n, 'beast'],
    ['low', n, 'high'], ['high', n, 'low'],
  ],
  hard: [
    ['gap', 'gap', 'gap'], ['low', 'low', 'low'], ['high', 'high', 'high'],
    ['block', 'low', 'low'], ['low', 'block', 'low'], ['low', 'low', 'block'],
    ['block', 'high', 'high'], ['high', 'block', 'high'],
    [n, 'beast', n], ['beast', n, 'block'], ['block', n, 'beast'],
    ['gap', 'block', 'gap'], ['high', 'gap', 'high'],
  ],
};

// ---------------------------------------------------------------------------
export class Spawner {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.pools = { low: [], high: [], block: [], gap: [], beast: [], pad: [] };
    this.active = [];       // obstacles
    this.gems = [];
    this.gemPool = [];
    this.opts = opts;       // { gemChance, baseGap, minGap, hazardFury }
    this.reset();
  }

  reset() {
    for (const o of this.active) this._release(o);
    this.active.length = 0;
    for (const g of this.gems) { g.mesh.visible = false; this.gemPool.push(g); }
    this.gems.length = 0;
    this.spawnAcc = 30;     // distance travelled until the next row spawns
    this.rowCount = 0;
    this._padReserve = null; // keeps a lane clear + gemmed after a jump pad
    this._t = 0;
  }

  _acquire(type) {
    const pool = this.pools[type];
    let m = pool.pop();
    if (!m) { m = FACTORY[type](); this.scene.add(m); }
    m.visible = true;
    return m;
  }

  _release(o) {
    o.mesh.visible = false;
    this.pools[o.type].push(o.mesh);
  }

  _acquireGem() {
    let m = this.gemPool.pop();
    if (!m) { m = makeGem(); this.scene.add(m); }
    m.visible = true;
    return m;
  }

  _difficulty(speed) {
    return THREE.MathUtils.clamp((speed - CONFIG.startSpeed) / (CONFIG.maxSpeed - CONFIG.startSpeed), 0, 1);
  }

  _gap(speed) {
    const base = this.opts.baseGap ?? CONFIG.baseObstacleGap;
    const min = this.opts.minGap ?? CONFIG.minObstacleGap;
    return THREE.MathUtils.lerp(base, min, this._difficulty(speed));
  }

  _pickRow(diff) {
    // blend from easy → hard as difficulty climbs
    const r = Math.random();
    let table;
    if (diff < 0.3) table = r < 0.85 ? ROWS.easy : ROWS.mid;
    else if (diff < 0.65) table = r < 0.5 ? ROWS.easy : (r < 0.9 ? ROWS.mid : ROWS.hard);
    else table = r < 0.25 ? ROWS.easy : (r < 0.6 ? ROWS.mid : ROWS.hard);
    return table[(Math.random() * table.length) | 0];
  }

  update(dt, speed, player) {
    this._t += dt;
    const fury = this.opts.hazardFury ? 1.6 : 1.0;

    // scroll obstacles toward the camera; beasts charge extra fast
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      let v = speed;
      if (o.type === 'beast') v = speed + (6 + this._difficulty(speed) * 8) * fury;
      o.z += v * dt;
      o.mesh.position.z = o.z;
      if (o.type === 'beast') {
        o.mesh.position.y = Math.sin(this._t * 8 + i) * 0.06; // lurching gait
      } else if (o.type === 'pad' && o.mesh.userData.spin) {
        o.mesh.userData.spin.rotation.z += dt * 3;            // spinning rune ring
      }
      if (o.z > CONFIG.despawnBehind) {
        this._release(o);
        this.active.splice(i, 1);
      }
    }

    // spin & scroll gems
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.z += speed * dt;
      g.mesh.position.z = g.z;
      g.mesh.rotation.y += dt * 3;
      g.mesh.rotation.x += dt * 1.5;
      if (g.z > CONFIG.despawnBehind) {
        g.mesh.visible = false; this.gemPool.push(g.mesh);
        this.gems.splice(i, 1);
      }
    }

    // spawn new rows as the world advances (rows are spaced by `gap` metres)
    this.spawnAcc -= speed * dt;
    while (this.spawnAcc <= 0) {
      this._spawnRow(-CONFIG.spawnAhead, speed);
      this.spawnAcc += this._gap(speed);
    }
  }

  _spawnRow(z, speed) {
    const diff = this._difficulty(speed);
    this.rowCount++;
    this._lastRowZ = z;

    // --- jump-pad breather row: a springboard in one lane, rest clear. The next
    //     couple of rows keep that lane open (+ gems) so the launch is rewarded
    //     and never flings you into an unavoidable gate.
    if (this.rowCount > 4 && !this._padReserve && Math.random() < 0.10) {
      const lane = (Math.random() * 3) | 0;
      const mesh = this._acquire('pad');
      mesh.position.set(LANES[lane], 0, z);
      this.active.push({ type: 'pad', lane, z, depth: mesh.userData.depth, mesh });
      this._padReserve = { lane, rows: 2 };
      return;
    }

    // first few rows are gentle warmups
    let pattern;
    if (this.rowCount <= 3) {
      const warm = ROWS.easy.slice(0, 6);
      pattern = warm[(Math.random() * warm.length) | 0];
    } else {
      pattern = this._pickRow(diff);
    }

    // honour a pad reservation: keep the landing lane clear for the leap arc
    if (this._padReserve) {
      pattern = pattern.slice();
      pattern[this._padReserve.lane] = null;
    }

    const safeLanes = [];
    for (let lane = 0; lane < 3; lane++) {
      const type = pattern[lane];
      if (!type) { safeLanes.push(lane); continue; }
      const mesh = this._acquire(type);
      mesh.position.set(LANES[lane], 0, z);
      this.active.push({ type, lane, z, depth: mesh.userData.depth, mesh });
    }

    // gem arc in the reserved lane so the pad launch scoops up runes mid-air
    if (this._padReserve) {
      this._spawnGemLine(this._padReserve.lane, z, true);
      if (--this._padReserve.rows <= 0) this._padReserve = null;
    }

    // gems: reward the clean line. Place an arc in a safe (or jumpable) lane.
    const chance = this.opts.gemChance ?? CONFIG.gemChance;
    if (Math.random() < chance) {
      // prefer a lane that is empty, else a 'low'/'gap' lane (collected mid-jump)
      let lane = safeLanes.length ? safeLanes[(Math.random()*safeLanes.length)|0] : -1;
      let arc = false;
      if (lane === -1) {
        for (let l = 0; l < 3; l++) if (pattern[l] === 'low' || pattern[l] === 'gap') { lane = l; arc = true; break; }
      } else {
        arc = Math.random() < 0.4;
      }
      if (lane !== -1) this._spawnGemLine(lane, z, arc);
    }
  }

  _spawnGemLine(lane, z, arc) {
    const count = 4 + ((Math.random() * 3) | 0);
    for (let i = 0; i < count; i++) {
      const gz = z + i * 1.6;
      let y = 1.0;
      if (arc) {
        const t = i / (count - 1);
        y = 1.0 + Math.sin(t * Math.PI) * 2.2;   // arc peaks ~3.2 → needs a jump
      }
      const m = this._acquireGem();
      m.position.set(LANES[lane], y, gz);
      this.gems.push({ lane, z: gz, y, mesh: m });
    }
  }

  // -------------------------------------------------------------------------
  //  Collision — returns 'dead' if the player struck something fatal.
  //  Calls onGem for each rune collected this frame.
  // -------------------------------------------------------------------------
  collide(player, onGem, onPad) {
    // gems first (generous)
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      if (g.lane !== player.laneIndex) continue;
      if (Math.abs(g.z) > 1.0 + PLAYER_HALF_DEPTH) continue;
      const reach = player.bottom - 0.4 < g.y && g.y < player.top + 0.4;
      if (reach) {
        g.mesh.visible = false; this.gemPool.push(g.mesh);
        this.gems.splice(i, 1);
        onGem && onGem(g.mesh.position.clone());
      }
    }

    // obstacles + jump pads
    for (const o of this.active) {
      if (o.lane !== player.laneIndex) continue;
      const overlap = Math.abs(o.z) < (o.depth / 2 + PLAYER_HALF_DEPTH);
      if (!overlap) continue;
      if (o.type === 'pad') {
        // launch once, only if you cross it on foot (not already airborne)
        if (!o.used && !player.airborne && player.bottom < 0.35) {
          o.used = true;
          onPad && onPad(o.mesh.position.clone());
        }
        continue;
      }
      if (this._fatal(o, player)) return o;
    }
    return null;
  }

  _fatal(o, p) {
    switch (o.type) {
      case 'low':   return p.bottom < LOW_TOP - 0.1;        // didn't jump high enough
      case 'high':  return p.top > HIGH_BOT + 0.05;         // didn't roll low enough
      case 'gap':   return p.bottom < 0.35;                 // on the ground over the pit
      case 'block': return true;                            // must have avoided the lane
      case 'beast': return true;                            // must have avoided the lane
      default: return false;
    }
  }
}
