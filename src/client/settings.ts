import { MAX_BOOST, MIN_BOOST, STORAGE_KEY } from "./constants";

/**
 * Per-browser boost settings, stored next to Sharkord's own volume settings
 * in localStorage. Keys use the same format as Sharkord's volume keys:
 * `user-{id}`, `userscreen-{id}` and `external-{pluginId}-{key}`.
 */
type TSettings = {
  /** boost in percent per volume key, only stored when above 100 */
  boosts: Record<string, number>;
  /** run boosted audio through a limiter so it does not clip */
  limiter: boolean;
};

const DEFAULT_SETTINGS: TSettings = { boosts: {}, limiter: true };

const clampBoost = (value: number) =>
  Math.min(MAX_BOOST, Math.max(MIN_BOOST, Math.round(value)));

const load = (): TSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<TSettings>;
    const boosts: Record<string, number> = {};

    for (const [key, value] of Object.entries(parsed.boosts ?? {})) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;

      const boost = clampBoost(value);

      if (boost > MIN_BOOST) boosts[key] = boost;
    }

    return {
      boosts,
      limiter:
        typeof parsed.limiter === "boolean"
          ? parsed.limiter
          : DEFAULT_SETTINGS.limiter,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

let state: TSettings = load();
const listeners = new Set<() => void>();

const commit = (next: TSettings) => {
  state = next;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked, the value still applies for this session
  }

  listeners.forEach((listener) => listener());
};

const getSettings = () => state;

const subscribeSettings = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getBoost = (key: string) => state.boosts[key] ?? MIN_BOOST;

const setBoost = (key: string, value: number) => {
  const boost = clampBoost(value);

  if (getBoost(key) === boost) return;

  const boosts = { ...state.boosts };

  if (boost > MIN_BOOST) {
    boosts[key] = boost;
  } else {
    delete boosts[key];
  }

  commit({ ...state, boosts });
};

const resetAllBoosts = () => commit({ ...state, boosts: {} });

const setLimiter = (limiter: boolean) => commit({ ...state, limiter });

// keep several open tabs in sync
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;

  state = load();
  listeners.forEach((listener) => listener());
});

export {
  getBoost,
  getSettings,
  resetAllBoosts,
  setBoost,
  setLimiter,
  subscribeSettings,
};
export type { TSettings };
