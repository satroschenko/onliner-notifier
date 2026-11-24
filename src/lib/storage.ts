import browser from "webextension-polyfill";
import { DEFAULT_SETTINGS, DEFAULT_STATE } from "./defaults";
import { SETTINGS_KEY, STATE_KEY } from "./constants";
import type { ExtensionState, Settings, Snapshot } from "./types";

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY] as Partial<Settings> | undefined;

  return {
    intervalMinutes: clampInteger(
      value?.intervalMinutes,
      DEFAULT_SETTINGS.intervalMinutes,
      1,
      60,
    ),
    notificationsEnabled:
      typeof value?.notificationsEnabled === "boolean"
        ? value.notificationsEnabled
        : DEFAULT_SETTINGS.notificationsEnabled,
    soundEnabled:
      typeof value?.soundEnabled === "boolean"
        ? value.soundEnabled
        : DEFAULT_SETTINGS.soundEnabled,
    openInCurrentTab:
      typeof value?.openInCurrentTab === "boolean"
        ? value.openInCurrentTab
        : DEFAULT_SETTINGS.openInCurrentTab,
    openLimit: clampInteger(value?.openLimit, DEFAULT_SETTINGS.openLimit, 0, 100),
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getState(): Promise<ExtensionState> {
  const stored = await browser.storage.local.get(STATE_KEY);
  const value = stored[STATE_KEY] as Partial<ExtensionState> | undefined;

  return {
    ...DEFAULT_STATE,
    ...value,
    user: value?.user ?? null,
    topics: Array.isArray(value?.topics) ? value.topics : [],
    seen:
      value?.seen && typeof value.seen === "object" && !Array.isArray(value.seen)
        ? value.seen
        : {},
  };
}

export async function saveState(state: ExtensionState): Promise<void> {
  await browser.storage.local.set({ [STATE_KEY]: state });
}

export async function updateState(
  patch: Partial<ExtensionState>,
): Promise<ExtensionState> {
  const state = { ...(await getState()), ...patch };
  await saveState(state);
  return state;
}

export async function getSnapshot(): Promise<Snapshot> {
  const [settings, state] = await Promise.all([getSettings(), getState()]);
  return { settings, state };
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
