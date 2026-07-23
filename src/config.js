// ============================================================================
//  G-ROLL — configuration & tunables
//  A skill runner in a cursed cathedral. No pay-to-win. Only the roll saves you.
// ============================================================================

export const LANES = [-2.4, 0, 2.4];        // world-x of the three lanes
export const LANE_COUNT = LANES.length;

export const CONFIG = {
  // --- pacing -------------------------------------------------------------
  startSpeed: 16,          // world units / second at the start of a run
  maxSpeed: 52,            // hard ceiling (much faster top end = harder late game)
  accel: 0.42,             // speed gained per second survived (ramps up quicker)
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
  baseObstacleGap: 29,     // metres between obstacle rows at start (roomy, Subway-Surfers feel)
  minObstacleGap: 18,      // tightest spacing at top speed (kept dodge-able)
  scoreGrace: 5,           // seconds at the start with no score/gems (you're just warming up)
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
    cost: 150,
    mult: 1.5,
    apply: (s) => { s.startSpeed *= 1.35; s.accel *= 1.4; s.maxSpeed *= 1.2; },
  },
  {
    id: 'fogblind',
    name: 'Fogblind',
    desc: 'The mist closes in. You will see obstacles far too late.',
    cost: 120,
    mult: 1.35,
    apply: (s) => { s.fogDensity = 0.055; s.viewCut = true; },
  },
  {
    id: 'onslaught',
    name: 'Endless Onslaught',
    desc: 'The dead crowd the halls. Obstacles pack tighter together.',
    cost: 180,
    mult: 1.45,
    apply: (s) => { s.baseObstacleGap *= 0.72; s.minObstacleGap *= 0.78; },
  },
  {
    id: 'famine',
    name: 'Famine of Runes',
    desc: 'Gems grow scarce. Greatly reduced pickups — pray your bank holds.',
    cost: 80,
    mult: 1.25,
    apply: (s) => { s.gemChance *= 0.35; },
  },
  {
    id: 'bloodlust',
    name: 'Bloodlust',
    desc: 'The beasts charge with fury. Moving hazards move faster and reach further.',
    cost: 160,
    mult: 1.4,
    apply: (s) => { s.hazardFury = true; },
  },
  {
    id: 'vertigo',
    name: 'Vertigo',
    desc: 'The world will not hold still. The camera sways and lurches with dread.',
    cost: 100,
    mult: 1.3,
    apply: (s) => { s.vertigo = true; },
  },
  {
    id: 'tempest',
    name: 'Tempest',
    desc: 'A screaming gale at your back. Speed and acceleration surge to a blur.',
    cost: 260,
    mult: 1.75,
    apply: (s) => { s.startSpeed *= 1.5; s.maxSpeed *= 1.35; s.accel *= 1.35; },
  },
  {
    id: 'swarm',
    name: 'The Swarm',
    desc: 'The halls choke with the dead. Obstacles crush into a relentless gauntlet.',
    cost: 230,
    mult: 1.6,
    apply: (s) => { s.baseObstacleGap *= 0.6; s.minObstacleGap *= 0.66; },
  },
  {
    id: 'starless',
    name: 'Starless Night',
    desc: 'A smothering dark. Choking fog and dimmed torches — you run near blind.',
    cost: 170,
    mult: 1.5,
    apply: (s) => { s.fogDensity = 0.064; s.dim = true; },
  },
  {
    id: 'ravening',
    name: 'Ravening Horde',
    desc: 'The beasts multiply and hunt in packs — faster, hungrier, everywhere.',
    cost: 210,
    mult: 1.55,
    apply: (s) => { s.hazardFury = true; s.beastHeavy = true; },
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

// ----------------------------------------------------------------------------
//  CHALLENGE FORTUNES — in Challenge mode, each run rolls one of these at the
//  start. You might be blessed (more gems) or cursed (faster, foggier). Every
//  fortune that speeds you up also widens the gaps so it stays dodge-able.
//  apply(s, ctx): s = run settings, ctx = { gemYield, visual }.
// ----------------------------------------------------------------------------
export const CHALLENGES = [
  { id: 'twin',     name: 'Twin Runes',    tone: 'good',  desc: 'Fortune smiles — DOUBLE gems this run!', apply: (s, ctx) => { ctx.gemYield = 2; } },
  { id: 'blessed',  name: 'Blessed',       tone: 'good',  desc: 'Every rune worth ×1.5.',                 apply: (s, ctx) => { ctx.gemYield = 1.5; } },
  { id: 'frenzied', name: 'Frenzied',      tone: 'bad',   desc: 'A cursed pace — nearly DOUBLE speed.',   apply: (s) => { s.startSpeed *= 1.9; s.maxSpeed *= 1.7; s.baseObstacleGap *= 1.7; s.minObstacleGap *= 1.7; } },
  { id: 'swarmed',  name: 'Swarmed',       tone: 'bad',   desc: 'The dead crowd in — a tighter gauntlet.', apply: (s) => { s.baseObstacleGap *= 0.82; s.minObstacleGap *= 0.85; } },
  { id: 'fogbound', name: 'Fogbound',      tone: 'bad',   desc: 'A smothering mist swallows the road.',   apply: (s) => { s.fogDensity = 0.055; } },
  { id: 'bloodpact', name: 'Bloodpact',    tone: 'mixed', desc: 'The blood moon rises — ×2 speed AND ×2 gems.', apply: (s, ctx) => { s.startSpeed *= 2; s.maxSpeed *= 1.9; s.baseObstacleGap *= 1.9; s.minObstacleGap *= 1.9; ctx.gemYield = 2; ctx.visual = 'bloodmoon'; } },
  { id: 'featherlight', name: 'Featherlight', tone: 'good', desc: 'A gentle, roomy run — and ×1.5 gems.', apply: (s, ctx) => { s.baseObstacleGap *= 1.25; s.minObstacleGap *= 1.25; ctx.gemYield = 1.5; } },
];

// ----------------------------------------------------------------------------
//  DAILY QUESTS — five new bounties every day (Subway-Surfers style). Each rolls
//  a rarity; rarer quests are harder but pay far more gems. There is a 1-in-100
//  shot per slot at an EXOTIC quest — brutal, but a huge payout. Reroll all five
//  for 100 gems if the draw displeases you.
// ----------------------------------------------------------------------------
export const QUEST_RARITIES = [
  { id: 'common',    name: 'Common',    color: '#b9b1a1', weight: 50, mult: 1,   reward: 45 },
  { id: 'rare',      name: 'Rare',      color: '#57a9ff', weight: 26, mult: 2,   reward: 120 },
  { id: 'epic',      name: 'Epic',      color: '#b45cff', weight: 14, mult: 3.5, reward: 280 },
  { id: 'legendary', name: 'Legendary', color: '#ffb43a', weight: 7,  mult: 6,   reward: 650 },
  { id: 'mythic',    name: 'Mythic',    color: '#ff4d4d', weight: 3,  mult: 10,  reward: 1500 },
  { id: 'exotic',    name: 'Exotic',    color: '#37f5c8', weight: 0,  mult: 18,  reward: 4200 },   // 1-in-100 per slot
];
export function questRarityById(id) { return QUEST_RARITIES.find((r) => r.id === id); }

// Each template tracks one stat. mode 'sum' = accrues across the day's runs;
// 'max' = the best any single run reaches. base is the Common target.
export const QUEST_TEMPLATES = [
  { id: 'gems',     stat: 'gems',     mode: 'sum', base: 60,  label: (n) => `Collect ${n} crimson runes` },
  { id: 'distance', stat: 'distance', mode: 'sum', base: 800, label: (n) => `Run ${n} metres` },
  { id: 'runs',     stat: 'runs',     mode: 'sum', base: 4,   label: (n) => `Complete ${n} descents` },
  { id: 'jumps',    stat: 'jumps',    mode: 'sum', base: 40,  label: (n) => `Leap ${n} times` },
  { id: 'rolls',    stat: 'rolls',    mode: 'sum', base: 40,  label: (n) => `Roll ${n} times` },
  { id: 'wounds',   stat: 'wounds',   mode: 'sum', base: 3,   label: (n) => `Take ${n} wounds at the altar` },
  { id: 'scoreRun', stat: 'scoreRun', mode: 'max', base: 500, label: (n) => `Reach ${n} glory in one run` },
  { id: 'gemsRun',  stat: 'gemsRun',  mode: 'max', base: 35,  label: (n) => `Collect ${n} runes in one run` },
  { id: 'survive',  stat: 'survive',  mode: 'max', base: 60,  label: (n) => `Survive ${n}s in a single run` },
];
export function questTemplateById(id) { return QUEST_TEMPLATES.find((t) => t.id === id); }

function niceRound(n) {
  if (n <= 20) return Math.max(1, Math.round(n));
  if (n <= 100) return Math.round(n / 5) * 5;
  if (n <= 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}

export function rollQuestRarity() {
  if (Math.random() < 0.01) return questRarityById('exotic');   // 1-in-100 exotic
  const pool = QUEST_RARITIES.filter((r) => r.weight > 0);
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let x = Math.random() * total;
  for (const r of pool) { x -= r.weight; if (x <= 0) return r; }
  return pool[0];
}

// Five distinct quest templates, each with its own rolled rarity.
export function generateDailyQuests() {
  const tpls = QUEST_TEMPLATES.slice().sort(() => Math.random() - 0.5).slice(0, 5);
  return tpls.map((t) => {
    const rr = rollQuestRarity();
    return {
      tpl: t.id, stat: t.stat, mode: t.mode, rarity: rr.id,
      target: niceRound(t.base * rr.mult), reward: rr.reward,
      progress: 0, claimed: false,
    };
  });
}
