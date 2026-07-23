// ============================================================================
//  G-ROLL — configuration & tunables
//  A skill runner in a cursed cathedral. No pay-to-win. Only the roll saves you.
// ============================================================================

export const LANES = [-2.4, 0, 2.4];        // world-x of the three lanes
export const LANE_COUNT = LANES.length;

export const CONFIG = {
  // --- pacing -------------------------------------------------------------
  startSpeed: 15,          // world units / second at the start of a run
  maxSpeed: 42,            // hard ceiling
  accel: 0.30,             // speed gained per second survived
  laneChangeTime: 0.11,    // seconds to snap between lanes
  gravity: -58,            // jump gravity
  jumpVelocity: 18.5,      // initial jump impulse
  rollTime: 0.62,          // seconds spent in a dodge-roll (low profile)
  rollCooldown: 0.3,       // forced stand time after a roll — no infinite sliding

  // --- world --------------------------------------------------------------
  segmentLength: 20,       // length of one recycled floor segment
  segmentCount: 9,         // how many floor segments are pooled
  spawnAhead: 150,         // how far ahead (z) entities spawn
  despawnBehind: 14,       // how far behind the camera before recycle

  // --- difficulty ---------------------------------------------------------
  baseObstacleGap: 19,     // metres between obstacle rows at start
  minObstacleGap: 11,      // tightest spacing at top speed
  gemChance: 0.62,         // chance a slot spawns a gem arc

  // --- scoring ------------------------------------------------------------
  distanceToScore: 1.0,    // score per metre (before multiplier)

  // --- feel ---------------------------------------------------------------
  cameraShakeDeath: 1.0,
  coyoteTime: 0.09,        // grace after leaving ground where a jump still lands
  inputBuffer: 0.14,       // pre-press an action just before landing
};

// ----------------------------------------------------------------------------
//  CURSES — the heart of the economy.
//  You do not buy power. You spend gems to invite suffering, and suffering
//  multiplies your glory. Every curse stacks multiplicatively.
// ----------------------------------------------------------------------------
export const CURSES = [
  {
    id: 'frenzy',
    name: 'Frenzy of the Hollow',
    desc: 'The corridor drags you faster. Base speed +35%, acceleration bites harder.',
    cost: 40,
    mult: 1.5,
    apply: (s) => { s.startSpeed *= 1.35; s.accel *= 1.4; s.maxSpeed *= 1.2; },
  },
  {
    id: 'fogblind',
    name: 'Fogblind',
    desc: 'The mist closes in. You will see obstacles far too late.',
    cost: 30,
    mult: 1.35,
    apply: (s) => { s.fogDensity = 0.055; s.viewCut = true; },
  },
  {
    id: 'onslaught',
    name: 'Endless Onslaught',
    desc: 'The dead crowd the halls. Obstacles pack tighter together.',
    cost: 50,
    mult: 1.45,
    apply: (s) => { s.baseObstacleGap *= 0.72; s.minObstacleGap *= 0.78; },
  },
  {
    id: 'famine',
    name: 'Famine of Runes',
    desc: 'Gems grow scarce. Greatly reduced pickups — pray your bank holds.',
    cost: 20,
    mult: 1.25,
    apply: (s) => { s.gemChance *= 0.35; },
  },
  {
    id: 'bloodlust',
    name: 'Bloodlust',
    desc: 'The beasts charge with fury. Moving hazards move faster and reach further.',
    cost: 45,
    mult: 1.4,
    apply: (s) => { s.hazardFury = true; },
  },
  {
    id: 'vertigo',
    name: 'Vertigo',
    desc: 'The world will not hold still. The camera sways and lurches with dread.',
    cost: 25,
    mult: 1.3,
    apply: (s) => { s.vertigo = true; },
  },
];

export function curseById(id) {
  return CURSES.find((c) => c.id === id);
}

// ----------------------------------------------------------------------------
//  WOUNDS — in-run debuffs. Every minute survived, the corridor stops and makes
//  you take one. The crueller the wound (higher tier), the more each rune is
//  worth for the rest of the run. gemBonus adds to your live gem yield.
//  apply(game) mutates the live run/world/spawner.
// ----------------------------------------------------------------------------
export const DEBUFFS = [
  {
    id: 'quicken', name: 'Quicken', tier: 2, gemBonus: 1.1,
    desc: 'The floor drags hard. A violent surge of speed.',
    apply: (g) => { g.run.settings.startSpeed += 10; g.run.settings.maxSpeed += 11; },
  },
  {
    id: 'frenzy', name: 'Frenzy', tier: 3, gemBonus: 1.9,
    desc: 'Blinding pace and ever-quickening dread. Speed and acceleration soar.',
    apply: (g) => { g.run.settings.startSpeed += 14; g.run.settings.maxSpeed += 15; g.run.settings.accel += 0.22; },
  },
  {
    id: 'onrush', name: 'Onrush', tier: 3, gemBonus: 1.75,
    desc: 'The dead swarm. Obstacles crush together into a gauntlet.',
    apply: (g) => {
      const o = g.spawner.opts;
      o.baseGap = Math.max(7.5, (o.baseGap ?? 19) * 0.65);
      o.minGap = Math.max(5.5, (o.minGap ?? 11) * 0.7);
    },
  },
  {
    id: 'gloom', name: 'Gloom', tier: 2, gemBonus: 0.9,
    desc: 'The mist smothers you. Obstacles lunge out of the dark far too late.',
    apply: (g) => { g.world.setFogDensity(Math.min(0.075, g.world.fog.density + 0.022)); },
  },
  {
    id: 'bloodhunt', name: 'Bloodhunt', tier: 3, gemBonus: 1.5,
    desc: 'The beasts are ravenous — faster, further, relentless — and everything hurries.',
    apply: (g) => { g.spawner.opts.hazardFury = true; g.run.settings.startSpeed += 4; g.run.settings.maxSpeed += 6; },
  },
  {
    id: 'vertigo', name: 'Vertigo', tier: 2, gemBonus: 1.0,
    desc: 'The world pitches and heaves. The camera lurches with sickening dread.',
    apply: (g) => { g.world.setVertigo(true); },
  },
];

export function debuffById(id) {
  return DEBUFFS.find((d) => d.id === id);
}
