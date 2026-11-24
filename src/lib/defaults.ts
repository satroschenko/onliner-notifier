import type { ExtensionState, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: 10,
  notificationsEnabled: true,
  soundEnabled: false,
  openInCurrentTab: false,
  openLimit: 10,
};

export const DEFAULT_STATE: ExtensionState = {
  status: "idle",
  initialized: false,
  user: null,
  topics: [],
  seen: {},
  lastCheckedAt: null,
  lastSuccessAt: null,
  consecutiveErrors: 0,
  nextRetryAt: 0,
  errorMessage: null,
};
