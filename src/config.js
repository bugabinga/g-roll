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
