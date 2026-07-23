// ============================================================================
//  Spawner — the procession of the dead. Obstacles and gem-runes stream out of
//  the fog. Rows are curated so every one is survivable with skill; nothing is
//  ever a coin-flip. Meshes are pooled per type to keep it smooth.
// ============================================================================

import * as THREE from '../vendor/three.module.js';
import { CONFIG, LANES } from './config.js';
import { glowSprite } from './particles.js';

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

// Action colour-code so every hazard reads at a glance, even in the dark:
//   AMBER = leap over · CRIMSON = roll under · CYAN = dodge to another lane
const ACTION = { jump: 0xffb020, roll: 0xff3030, dodge: 0x35d6ff };
const glow = (hex) => new THREE.MeshBasicMaterial({ color: hex });                 // unlit, always visible
const glowFaint = (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.5 });

function makeLow() {          // bone spikes / tombstone — JUMP (amber)
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.5), MATS.stone);
  base.position.y = 0.5; g.add(base);
  for (let i = -1; i <= 1; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 5), MATS.bone);
    spike.position.set(i * 0.5, 1.1, 0); g.add(spike);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), glow(ACTION.jump));
    tip.position.set(i * 0.5, 1.5, 0); g.add(tip);
  }
  // bright amber cap-line along the top edge = "leap this"
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.11, 0.12), glow(ACTION.jump));
  bar.position.set(0, 1.02, 0.27); g.add(bar);
  const wash = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.05), glowFaint(ACTION.jump));
  wash.position.set(0, 0.7, 0.27); g.add(wash);
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
  // bright crimson band on the underside so the low gap reads at speed = "roll"
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.12, 0.68), glow(ACTION.roll));
  band.position.y = HIGH_BOT + 0.02; g.add(band);
  const wash = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 0.05), glowFaint(ACTION.roll));
  wash.position.set(0, HIGH_BOT + 0.5, 0.34); g.add(wash);
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

function makeBlock() {        // sarcophagus / slab — CHANGE LANE (cyan)
  const g = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.5, 1.0), MATS.stone);
  slab.position.y = 1.25; g.add(slab);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.3, 1.15), MATS.darkStone);
  lid.position.y = 2.5; g.add(lid);
  // cyan frame on the front face = "solid wall, go around"
  const fm = glow(ACTION.dodge);
  for (const sy of [0.15, 2.35]) { const h = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.08), fm); h.position.set(0, sy, 0.52); g.add(h); }
  for (const sx of [-0.85, 0.85]) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.08), fm); v.position.set(sx, 1.25, 0.52); g.add(v); }
  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.05), fm);
  rune.position.set(0, 1.3, 0.53); g.add(rune);
  g.userData.type = 'block'; g.userData.depth = 1.0;
  return g;
}

function makeGap() {          // pit — JUMP (amber)
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 3.0), MATS.pit);
  hole.position.y = -0.26; g.add(hole);
  // jagged edges with an amber lip line = "leap the gap"
  for (const z of [-1.4, 1.4]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, 0.2), MATS.stone);
    edge.position.set(0, 0.05, z); g.add(edge);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.08, 0.1), glow(ACTION.jump));
    lip.position.set(0, 0.2, z); g.add(lip);
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

function makeBomb() {          // explosive — JUMP ON TOP for bonus, walk in = death
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.45, metalness: 0.75 })
  );
  body.position.y = 0.6; g.add(body);
  // glowing molten cracks
  const cracks = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.575, 1),
    new THREE.MeshBasicMaterial({ color: 0xff3a00, wireframe: true, transparent: true, opacity: 0.55 })
  );
  cracks.position.y = 0.6; g.add(cracks); g.userData.cracks = cracks;
  // fuse + sparking tip
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 5),
    new THREE.MeshStandardMaterial({ color: 0x201d16, roughness: 1 }));
  fuse.position.set(0, 1.16, 0); fuse.rotation.z = 0.35; g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
  spark.position.set(0.08, 1.33, 0); g.add(spark); g.userData.spark = spark;
  g.userData.type = 'bomb'; g.userData.depth = 1.0; g.userData.topY = 1.16;
  return g;
}

const PLAT = { H: 1.5, L: 12, RAMP: 3 };
function makePlatform() {       // a train — run up the ramp onto the upper layer
  const g = new THREE.Group();
  const { H, L, RAMP } = PLAT;
  const bodyLen = L - 2 * RAMP;
  const side = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.55, metalness: 0.55 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x3a4252, roughness: 0.45, metalness: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.92, H, bodyLen), side);
  body.position.set(0, H / 2, 0); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.14, bodyLen), topMat);
  top.position.set(0, H + 0.07, 0); g.add(top);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, bodyLen * 0.92),
    new THREE.MeshStandardMaterial({ color: 0x240505, emissive: 0xff2a2a, emissiveIntensity: 1.1, roughness: 0.5 }));
  strip.position.set(0, H + 0.15, 0); g.add(strip);

  const slopeLen = Math.hypot(RAMP, H);
  const angle = Math.atan2(H, RAMP);
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x333c4c, roughness: 0.5, metalness: 0.55 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.2, slopeLen), rampMat);
  front.position.set(0, H / 2, bodyLen / 2 + RAMP / 2); front.rotation.x = -angle; g.add(front);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.2, slopeLen), rampMat);
  back.position.set(0, H / 2, -(bodyLen / 2 + RAMP / 2)); back.rotation.x = angle; g.add(back);

  g.userData.type = 'platform'; g.userData.depth = L;
  return g;
}

// Full-width hazards that span ALL lanes (lane = -1). No lane change escapes them.
const ROPE_W = 6.8, ROPE_HALF = 3.3;
function makeRopeLow() {       // taut tripwire across the whole track — JUMP (amber)
  const g = new THREE.Group();
  const y = 0.95;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, ROPE_W, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a10, roughness: 1 }));
  rope.rotation.z = Math.PI / 2; rope.position.y = y; g.add(rope);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, ROPE_W, 6), glowFaint(ACTION.jump));
  halo.rotation.z = Math.PI / 2; halo.position.y = y; g.add(halo);
  const core = new THREE.Mesh(new THREE.BoxGeometry(ROPE_W, 0.06, 0.06), glow(ACTION.jump)); core.position.y = y; g.add(core);
  for (const sx of [-ROPE_HALF, ROPE_HALF]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), MATS.stone); post.position.set(sx, 0.72, 0); g.add(post); }
  for (let i = -3; i <= 3; i++) { const fr = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 4), glow(ACTION.jump)); fr.position.set(i * 0.9, y - 0.2, 0); fr.rotation.x = Math.PI; g.add(fr); }
  g.userData.type = 'ropeLow'; g.userData.depth = 0.7;
  return g;
}
function makeRopeHigh() {      // hanging rope of teeth across the track — ROLL (crimson)
  const g = new THREE.Group();
  const y = HIGH_BOT + 0.6;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, ROPE_W, 6), new THREE.MeshStandardMaterial({ color: 0x2a0d0d, roughness: 1 }));
  rope.rotation.z = Math.PI / 2; rope.position.y = y; g.add(rope);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, ROPE_W, 6), glowFaint(ACTION.roll));
  halo.rotation.z = Math.PI / 2; halo.position.y = y; g.add(halo);
  // bright crimson line at the duck-height edge
  const core = new THREE.Mesh(new THREE.BoxGeometry(ROPE_W, 0.07, 0.07), glow(ACTION.roll)); core.position.y = HIGH_BOT + 0.04; g.add(core);
  for (let i = -3; i <= 3; i++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 5), MATS.bone); tooth.position.set(i * 0.9, HIGH_BOT + 0.16, 0); tooth.rotation.x = Math.PI; g.add(tooth); }
  for (const sx of [-ROPE_HALF, ROPE_HALF]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), MATS.stone); post.position.set(sx, 1.7, 0); g.add(post); }
  g.userData.type = 'ropeHigh'; g.userData.depth = 0.7;
  return g;
}

function makeSawblade() {     // spinning saw in a lane — DODGE (cyan)
  const g = new THREE.Group();
  const spinner = new THREE.Group(); spinner.position.set(0, 1.15, 0); g.add(spinner);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 20), MATS.iron);
  disc.rotation.x = Math.PI / 2; spinner.add(disc);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 3), MATS.bone);
    tooth.position.set(Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0); tooth.rotation.z = a - Math.PI / 2; spinner.add(tooth);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), glow(ACTION.dodge)); spinner.add(hub);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 5, 18), glow(ACTION.dodge)); ring.position.z = 0.07; spinner.add(ring);
  g.userData.type = 'sawblade'; g.userData.depth = 0.55; g.userData.spin = spinner;
  return g;
}

function makePyre() {          // flaming brazier — JUMP (amber)
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.42, 10), MATS.iron); bowl.position.y = 0.55; g.add(bowl);
  for (const a of [0, 2.1, 4.2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), MATS.iron); leg.position.set(Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3); g.add(leg); }
  const flames = new THREE.Group(); flames.position.set(0, 0.78, 0); g.add(flames);
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 5), glow(ACTION.jump)); f.position.set((Math.random() - 0.5) * 0.4, Math.random() * 0.15, (Math.random() - 0.5) * 0.4); flames.add(f); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.1), glow(ACTION.jump)); bar.position.set(0, 0.98, 0.34); g.add(bar);
  g.userData.type = 'pyre'; g.userData.depth = 0.7; g.userData.flames = flames;
  return g;
}

function makeCage() {          // hanging corpse-cage — ROLL UNDER (crimson)
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 4), MATS.iron); chain.position.y = HIGH_BOT + 1.45; g.add(chain);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.35, 8, 1, true), MATS.iron); cage.position.y = HIGH_BOT + 0.7; g.add(cage);
  for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.35, 0.04), MATS.iron); const a = (i / 5) * Math.PI * 2; bar.position.set(Math.cos(a) * 0.48, HIGH_BOT + 0.7, Math.sin(a) * 0.48); g.add(bar); }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), MATS.bone); skull.position.y = HIGH_BOT + 0.45; g.add(skull);
  const line = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.5), glow(ACTION.roll)); line.position.y = HIGH_BOT + 0.02; g.add(line);
  g.userData.type = 'cage'; g.userData.depth = 0.9;
  return g;
}

function makeMenhir() {        // tall rune-stone — DODGE (cyan)
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 3.0, 6), MATS.stone); stone.position.y = 1.5; stone.rotation.y = 0.4; g.add(stone);
  const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), MATS.darkStone); cap.position.y = 3.0; g.add(cap);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.06), glow(ACTION.dodge)); r.position.set(0, 0.7 + i * 0.75, 0.45); g.add(r); }
  g.userData.type = 'menhir'; g.userData.depth = 0.9;
  return g;
}

const FACTORY = {
  low: makeLow, high: makeHigh, block: makeBlock, gap: makeGap,
  beast: makeBeast, pad: makePad, bomb: makeBomb, platform: makePlatform,
  ropeLow: makeRopeLow, ropeHigh: makeRopeHigh,
  sawblade: makeSawblade, pyre: makePyre, cage: makeCage, menhir: makeMenhir,
};

function makeGem() {
  // A cut RUBY — a proper brilliant-cut red gemstone (crown + girdle + pavilion)
  // with chunky flat-shaded facets, bright emissive fill, white facet-edge lines
  // and a sparkle, echoing a pixel-art ruby. No per-gem light (glow via sprites).
  const g = new THREE.Group();
  const ruby = new THREE.MeshStandardMaterial({
    color: 0xd11a2a, emissive: 0xff1830, emissiveIntensity: 1.7,
    roughness: 0.16, metalness: 0.35, flatShading: true,
  });
  const R = 0.34;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(R, 0.2, 6), ruby); crown.position.y = 0.11; g.add(crown);
  const girdle = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.05, 6), ruby); g.add(girdle);
  const pavilion = new THREE.Mesh(new THREE.ConeGeometry(R, 0.42, 6), ruby); pavilion.position.y = -0.235; pavilion.rotation.x = Math.PI; g.add(pavilion);

  // bright inner core (unlit) so the stone glows from within
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshBasicMaterial({ color: 0xff6b6b })); g.add(core);
  // white facet-edge highlights (the pixel gem's sparkle lines)
  const edges = new THREE.Mesh(new THREE.ConeGeometry(R + 0.006, 0.2, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd6d6, wireframe: true, transparent: true, opacity: 0.5 }));
  edges.position.y = 0.11; g.add(edges);
  const sparkle = glowSprite(0xffffff, 0.55); sparkle.position.set(0.09, 0.15, 0.13); g.add(sparkle);
  g.add(glowSprite(0xff3040, 1.7));    // soft red bloom halo
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
    ['pyre', n, n], [n, n, 'pyre'], [n, 'cage', n],   // early variety
    ['sawblade', n, n], [n, n, 'menhir'], [n, 'bomb', n],
  ],
  mid: [
    ['low', n, 'low'], ['high', n, 'high'], ['block', n, 'block'],
    [n, 'gap', n], ['gap', n, n], [n, n, 'gap'],
    ['block', 'block', n], [n, 'block', 'block'],
    ['beast', n, n], [n, n, 'beast'],
    ['low', n, 'high'], ['high', n, 'low'],
    ['bomb', n, n], [n, 'bomb', n], [n, n, 'bomb'],   // jump on for bonus
    ['sawblade', n, n], [n, n, 'sawblade'], [n, 'cage', n],
    ['pyre', n, 'pyre'], ['menhir', n, n], [n, n, 'menhir'],
  ],
  hard: [
    ['gap', 'gap', 'gap'], ['low', 'low', 'low'], ['high', 'high', 'high'],
    ['block', 'low', 'low'], ['low', 'block', 'low'], ['low', 'low', 'block'],
    ['block', 'high', 'high'], ['high', 'block', 'high'],
    [n, 'beast', n], ['beast', n, 'block'], ['block', n, 'beast'],
    ['gap', 'block', 'gap'], ['high', 'gap', 'high'],
    ['bomb', n, 'bomb'], ['block', 'bomb', 'block'], ['bomb', 'low', 'bomb'],
    ['sawblade', n, 'sawblade'], ['menhir', 'pyre', 'menhir'], ['cage', 'cage', n],
    ['pyre', 'menhir', 'pyre'], ['sawblade', 'cage', n], [n, 'sawblade', 'pyre'],
    ['cage', 'bomb', 'cage'], ['menhir', 'gap', 'menhir'],
  ],
};

// ---------------------------------------------------------------------------
export class Spawner {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.pools = { low: [], high: [], block: [], gap: [], beast: [], pad: [], bomb: [], platform: [], ropeLow: [], ropeHigh: [], sawblade: [], pyre: [], cage: [], menhir: [] };
    this.active = [];       // obstacles
    this.gems = [];
    this.gemPool = [];
    this.opts = opts;       // { gemChance, baseGap, minGap, hazardFury }
    this.reset();
  }

  reset() {
    for (const o of this.active) this._release(o);
    this.active.length = 0;
    for (const g of this.gems) { g.mesh.visible = false; this.gemPool.push(g.mesh); }
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
    const fury = this.opts.hazardFury ? 2.0 : 1.0;

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
      } else if (o.type === 'bomb') {
        const sp = o.mesh.userData.spark; if (sp) sp.scale.setScalar(0.7 + Math.random() * 0.7);
        const cr = o.mesh.userData.cracks; if (cr) cr.material.opacity = 0.4 + Math.sin(this._t * 6 + o.z) * 0.2;
        o.mesh.rotation.y += dt * 0.6;
      } else if (o.type === 'sawblade' && o.mesh.userData.spin) {
        o.mesh.userData.spin.rotation.z -= dt * 11;                 // whirring blade
      } else if (o.type === 'pyre' && o.mesh.userData.flames) {
        o.mesh.userData.flames.children.forEach((f) => { f.scale.y = 0.7 + Math.random() * 0.7; f.scale.x = 0.85 + Math.random() * 0.3; });
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

    // --- second-layer train: run up the front ramp onto the upper deck, ride it
    //     (gems reward the climb), then down the back ramp. Other lanes stay open.
    if (this.rowCount > 6 && !this._padReserve && Math.random() < 0.09) {
      const lane = (Math.random() * 3) | 0;
      const mesh = this._acquire('platform');
      mesh.position.set(LANES[lane], 0, z);
      this.active.push({ type: 'platform', lane, z, depth: mesh.userData.depth, mesh });
      this._spawnGemLine(lane, z - PLAT.L / 2 + PLAT.RAMP + 1, false, PLAT.H + 0.8);
      this._padReserve = { lane, rows: 2 };
      return;
    }

    // --- Ravening Horde curse: beasts hunt far more often (a beast in one lane).
    if (this.opts.beastHeavy && this.rowCount > 3 && !this._padReserve && Math.random() < 0.24) {
      const lane = (Math.random() * 3) | 0;
      const mesh = this._acquire('beast');
      mesh.position.set(LANES[lane], 0, z);
      this.active.push({ type: 'beast', lane, z, depth: mesh.userData.depth, mesh });
      return;
    }

    // (Full-width rope hazards removed — the band spanning the whole road read as
    //  an ugly ribbon. Lane-based hazards carry the difficulty instead.)

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

  _spawnGemLine(lane, z, arc, baseY = 1.0) {
    if (this.noGems) return;    // warm-up grace: no runes on the empty opening road
    const count = 4 + ((Math.random() * 3) | 0);
    for (let i = 0; i < count; i++) {
      const gz = z + i * 1.6;
      let y = baseY;
      if (arc) {
        const t = i / (count - 1);
        y = baseY + Math.sin(t * Math.PI) * 2.2;   // arc peaks → needs a jump
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
  collide(player, onGem, onPad, onBomb) {
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

    // ground height from platforms (the upper layer) — resolved first
    let groundH = 0, onAnyPlatform = false, platformDeath = null;
    for (const o of this.active) {
      if (o.type !== 'platform' || o.lane !== player.laneIndex) continue;
      const local = -o.z;                          // player position within the train
      const half = PLAT.L / 2, inner = half - PLAT.RAMP;
      if (Math.abs(local) > half + PLAYER_HALF_DEPTH) continue;
      onAnyPlatform = true;
      if (local > inner) {                          // front ramp: always rideable
        groundH = Math.max(groundH, PLAT.H * (half - local) / PLAT.RAMP);
        player._mounted = true;
      } else if (local < -inner) {                  // back ramp
        if (player._mounted || player.y > PLAT.H - 0.5) { player._mounted = true; groundH = Math.max(groundH, PLAT.H * (local + half) / PLAT.RAMP); }
        else platformDeath = o;                     // ran into the back at ground level
      } else {                                       // flat top / body
        if (player._mounted || player.y > PLAT.H - 0.5) { player._mounted = true; groundH = Math.max(groundH, PLAT.H); }
        else platformDeath = o;                     // hit the side of the train
      }
    }
    if (!onAnyPlatform) player._mounted = false;
    player.groundY = groundH;
    if (platformDeath) return platformDeath;

    // obstacles + pads + bombs (lane -1 = full width, hits in any lane)
    for (const o of this.active) {
      if (o.type === 'platform') continue;
      if (o.lane !== -1 && o.lane !== player.laneIndex) continue;
      const overlap = Math.abs(o.z) < (o.depth / 2 + PLAYER_HALF_DEPTH);
      if (!overlap) continue;
      if (o.type === 'pad') {
        if (!o.used && !player.airborne && player.bottom < groundH + 0.35) {
          o.used = true; onPad && onPad(o.mesh.position.clone());
        }
        continue;
      }
      if (o.type === 'bomb') {
        const top = o.mesh.userData.topY ?? 1.16;
        if (player.bottom >= top - 0.05) {          // clearing / landing on top → safe
          if (!o.used && player.airborne) { o.used = true; onBomb && onBomb(o.mesh.position.clone()); }
        } else {
          return o;                                  // walked straight into it → boom
        }
        continue;
      }
      if (this._fatal(o, player)) return o;
    }
    return null;
  }

  _fatal(o, p) {
    switch (o.type) {
      case 'low':
      case 'pyre':
      case 'ropeLow':  return p.bottom < LOW_TOP - 0.1;     // didn't jump high enough
      case 'high':
      case 'cage':
      case 'ropeHigh': return p.top > HIGH_BOT + 0.05;      // didn't roll low enough
      case 'gap':   return p.bottom < 0.35;                 // on the ground over the pit
      case 'block':
      case 'beast':
      case 'sawblade':
      case 'menhir': return true;                           // must have avoided the lane
      default: return false;
    }
  }
}
