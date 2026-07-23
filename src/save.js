// ============================================================================
//  Persistence — the gem bank, the high score, and which curses you court.
//  Everything lives in localStorage. No accounts, no servers, no monetisation.
// ============================================================================

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
