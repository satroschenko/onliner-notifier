export type BuildTarget = "chrome" | "firefox";

export interface Settings {
  intervalMinutes: number;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  openInCurrentTab: boolean;
  openLimit: number;
}

export interface User {
  id: string;
  nickname: string;
}

export interface Topic {
  id: string;
  title: string;
  postsCount: number;
  lastAuthor: string;
  lastPostAt: number;
  lastPostLabel: string;
  signature: string;
  unreadUrl: string;
}

export type ExtensionStatus =
  | "idle"
  | "checking"
  | "ok"
  | "unauthorized"
  | "offline"
  | "error";

export interface ExtensionState {
  status: ExtensionStatus;
  initialized: boolean;
  user: User | null;
  topics: Topic[];
  seen: Record<string, string>;
  lastCheckedAt: number | null;
  lastSuccessAt: number | null;
  consecutiveErrors: number;
  nextRetryAt: number;
  errorMessage: string | null;
}

export interface Snapshot {
  settings: Settings;
  state: ExtensionState;
}

export interface ParsedBookmarks {
  user: User;
  topics: Topic[];
}

export type RuntimeRequest =
  | { type: "get-snapshot" }
  | { type: "refresh" }
  | { type: "open-topic"; topicId: string }
  | { type: "mark-topic-read"; topicId: string }
  | { type: "open-all" }
  | { type: "mark-all-read" }
  | { type: "open-login" }
  | { type: "open-bookmarks" }
  | { type: "test-notification" }
  | { type: "test-sound" };

export type RuntimeResponse =
  | { ok: true; snapshot?: Snapshot }
  | { ok: false; error: string };

export interface OffscreenSoundRequest {
  scope: "offscreen";
  type: "play-sound";
}

export interface OffscreenParseRequest {
  scope: "offscreen";
  type: "parse-bookmarks";
  html: string;
  responseUrl: string;
}
