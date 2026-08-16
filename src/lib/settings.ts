// Layout preferences persisted to localStorage and applied as CSS variable
// overrides on :root. Color scheme and palette belong to the embedding host;
// Chatworks components use a neutral system-color baseline.

const PREFIX = "gc.settings.";

export type SettingKey = "sidebar-width" | "content-max-width" | "font-size";

const DEFAULTS: Record<SettingKey, string> = {
  "sidebar-width": "260px",
  "content-max-width": "820px",
  "font-size": "0.84rem",
};

const CSS_VAR: Record<SettingKey, string> = {
  "sidebar-width": "--sidebar-width",
  "content-max-width": "--content-max-width",
  "font-size": "--text-base",
};

type Listener = () => void;
const listeners: Listener[] = [];

export function onChange(fn: Listener) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify() {
  for (const fn of listeners) fn();
}

export function get(key: SettingKey): string {
  try {
    return localStorage.getItem(PREFIX + key) || DEFAULTS[key];
  } catch {
    return DEFAULTS[key];
  }
}

export function set(key: SettingKey, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage disabled */
  }
  document.documentElement.style.setProperty(CSS_VAR[key], value);
  notify();
}

export function reset(key: SettingKey) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage disabled */
  }
  document.documentElement.style.removeProperty(CSS_VAR[key]);
  notify();
}

/** Apply saved layout settings. Color scheme is managed by the host document. */
export function applyAll() {
  for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
    const val = get(key);
    if (val !== DEFAULTS[key]) {
      document.documentElement.style.setProperty(CSS_VAR[key], val);
    }
  }
}

export function allKeys(): SettingKey[] {
  return Object.keys(DEFAULTS) as SettingKey[];
}

export function defaultFor(key: SettingKey): string {
  return DEFAULTS[key];
}
