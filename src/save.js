// ============================================================================
//  Persistence — the gem bank, the high score, and which curses you court.
//  Everything lives in localStorage. No accounts, no servers, no monetisation.
// ============================================================================

import { generateDailyQuests } from './config.js';

const KEY = 'g-roll.save.v1';

const DEFAULT = {
  bank: 0,          // gems hoarded across all runs
  highScore: 0,
  bestDistance: 0,
  runs: 0,
  unlocked: [],     // curse ids permanently unlocked (paid for once)
  activeCurses: [], // curse ids toggled on for the next run (subset of unlocked)
  skins: [],        // character/skin ids bought in the Wardrobe (defaults are always owned)
  keys: 0,          // war-keys — earned by beating your record, spent on the War-Cache
  quests: null,     // { day:'YYYY-MM-DD', list:[...] } — regenerated each new day
  mode: 'night',    // atmosphere: 'night' | 'day' | 'bloodmoon'
  ground: 'stone',  // floor skin: 'stone' | 'milkyway' | 'lava' | 'frost'
  muted: false,
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT, ...parsed };
    // migrate old saves: anything previously active is grandfathered as unlocked
    merged.unlocked = [...new Set([...(merged.unlocked || []), ...(merged.activeCurses || [])])];
    return merged;
  } catch {
    return { ...DEFAULT };
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable (private mode) — game still runs, just forgets */
  }
}

export const Save = {
  get bank() { return state.bank; },
  get highScore() { return state.highScore; },
  get bestDistance() { return state.bestDistance; },
  get runs() { return state.runs; },
  get muted() { return state.muted; },
  get mode() { return state.mode || 'night'; },
  setMode(m) { state.mode = m; persist(); },
  get ground() { return state.ground || 'stone'; },
  setGround(t) { state.ground = t; persist(); },
  get activeCurses() { return [...state.activeCurses]; },
  get unlockedCurses() { return [...state.unlocked]; },
  isUnlocked(id) { return state.unlocked.includes(id); },

  // --- Wardrobe (skins) --- defaults are always owned; these are the bought ones.
  get ownedSkins() { return [...state.skins]; },
  isSkinOwned(id) { return state.skins.includes(id); },
  buySkin(id, cost) {
    if (state.skins.includes(id)) return true;
    if (state.bank < cost) return false;
    state.bank -= cost;
    state.skins.push(id);
    persist();
    return true;
  },
  grantSkin(id) {   // lootbox award — no cost
    if (!state.skins.includes(id)) { state.skins.push(id); persist(); }
  },

  // --- War-keys --- earned by beating your record; spent to open the War-Cache.
  get keys() { return state.keys || 0; },
  earnKeys(n = 1) { state.keys = (state.keys || 0) + n; persist(); return state.keys; },
  spendKey() { if ((state.keys || 0) < 1) return false; state.keys -= 1; persist(); return true; },

  // --- Daily quests --- five bounties a day; a fresh set rolls each new date.
  _questDay() { return new Date().toISOString().slice(0, 10); },   // 'YYYY-MM-DD' (UTC)
  _ensureQuests() {
    const today = this._questDay();
    if (!state.quests || state.quests.day !== today || !Array.isArray(state.quests.list) || state.quests.list.length !== 5) {
      state.quests = { day: today, list: generateDailyQuests() };
      persist();
    }
  },
  get quests() { this._ensureQuests(); return state.quests.list.map((q) => ({ ...q })); },
  rerollQuests(cost = 100) {
    this._ensureQuests();
    if (state.bank < cost) return false;
    state.bank -= cost;
    state.quests.list = generateDailyQuests();
    persist();
    return true;
  },
  // Feed a finished run's stats; advance every unclaimed quest.
  progressQuests(stats) {
    this._ensureQuests();
    for (const q of state.quests.list) {
      if (q.claimed) continue;
      const v = stats[q.stat] || 0;
      q.progress = q.mode === 'sum'
        ? Math.min(q.target, q.progress + v)
        : Math.min(q.target, Math.max(q.progress, v));
    }
    persist();
  },
  claimQuest(i) {
    this._ensureQuests();
    const q = state.quests.list[i];
    if (!q || q.claimed || q.progress < q.target) return 0;
    q.claimed = true;
    state.bank = Math.round(state.bank + q.reward);
    persist();
    return q.reward;
  },
  // count of quests ready to claim — for a menu badge
  questsClaimable() {
    this._ensureQuests();
    return state.quests.list.filter((q) => !q.claimed && q.progress >= q.target).length;
  },

  // Pay once to unlock a curse forever. After that it's free to toggle on/off.
  unlockCurse(id, cost) {
    if (state.unlocked.includes(id)) return true;
    if (state.bank < cost) return false;
    state.bank -= cost;
    state.unlocked.push(id);
    persist();
    return true;
  },

  addGems(n) {
    state.bank = Math.max(0, Math.round(state.bank + n));
    persist();
    return state.bank;
  },

  spendGems(n) {
    if (state.bank < n) return false;
    state.bank -= n;
    persist();
    return true;
  },

  canAfford(n) { return state.bank >= n; },

  setActiveCurses(ids) {
    // only unlocked curses may be active
    state.activeCurses = [...ids].filter((id) => state.unlocked.includes(id));
    persist();
  },

  toggleMute() {
    state.muted = !state.muted;
    persist();
    return state.muted;
  },

  recordRun(score, distance) {
    state.runs += 1;
    if (score > state.highScore) state.highScore = score;
    if (distance > state.bestDistance) state.bestDistance = Math.floor(distance);
    persist();
    return { newBest: score >= state.highScore };
  },

  reset() {
    state = { ...DEFAULT };
    persist();
  },
};
