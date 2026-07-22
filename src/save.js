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
  activeCurses: [], // curse ids selected for the next run
  muted: false,
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed };
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
  get activeCurses() { return [...state.activeCurses]; },

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
    state.activeCurses = [...ids];
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
