import browser from "webextension-polyfill";
import {
  ALARM_NAME,
  BOOKMARKS_URL,
  LOGIN_URL,
  SETTINGS_KEY,
  unreadTopicUrl,
} from "./lib/constants";
import { buildTarget } from "./lib/browser-target";
import { parseBookmarks } from "./lib/html-parser";
import { UnauthorizedError } from "./lib/parser";
import { playNotificationSound } from "./lib/sound";
import {
  getSettings,
  getSnapshot,
  getState,
  saveState,
  updateState,
} from "./lib/storage";
import type {
  ExtensionState,
  RuntimeRequest,
  RuntimeResponse,
  Topic,
} from "./lib/types";

const MAX_REMEMBERED_TOPICS = 1000;
let activeCheck: Promise<void> | null = null;

const nativeRuntime = (
  globalThis as unknown as {
    chrome?: {
      runtime?: {
        onMessage: {
          addListener(
            listener: (
              message: unknown,
              sender: unknown,
              sendResponse: (response: RuntimeResponse) => void,
            ) => boolean,
          ): void;
        };
      };
    };
  }
).chrome?.runtime;

if (nativeRuntime) {
  nativeRuntime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRuntimeRequest(message)) return false;
    handleRequest(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  });
} else {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isRuntimeRequest(message)) return undefined;
    return handleRequest(message).catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  });
}

browser.runtime.onInstalled.addListener(() => {
  void initialize();
});

browser.runtime.onStartup.addListener(() => {
  void initialize();
});

browser.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void runCheck(false);
});

browser.commands?.onCommand?.addListener((command) => {
  if (command === "open-all") void openAllTopics();
});

browser.notifications?.onClicked?.addListener((notificationId) => {
  const match = /^topic-(\d+)$/.exec(notificationId);
  if (match) void openTopic(match[1]);
  void browser.notifications.clear(notificationId);
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[SETTINGS_KEY]) void ensureAlarm();
});

void ensureAlarm();
void updateBadge();

async function initialize(): Promise<void> {
  await ensureAlarm();
  await runCheck(true);
}

async function ensureAlarm(): Promise<void> {
  const settings = await getSettings();
  await browser.alarms.create(ALARM_NAME, {
    delayInMinutes: settings.intervalMinutes,
    periodInMinutes: settings.intervalMinutes,
  });
}

function isRuntimeRequest(message: unknown): message is RuntimeRequest {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }
  return [
    "get-snapshot",
    "refresh",
    "open-topic",
    "mark-topic-read",
    "open-all",
    "mark-all-read",
    "open-login",
    "open-bookmarks",
    "test-notification",
    "test-sound",
  ].includes(String(message.type));
}

async function handleRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  switch (request.type) {
    case "get-snapshot":
      return { ok: true, snapshot: await getSnapshot() };
    case "refresh":
      await runCheck(true);
      return { ok: true, snapshot: await getSnapshot() };
    case "open-topic":
      await openTopic(request.topicId);
      return { ok: true };
    case "mark-topic-read":
      await markTopicRead(request.topicId);
      return { ok: true };
    case "open-all":
      await openAllTopics();
      return { ok: true };
    case "mark-all-read":
      await markAllTopicsRead();
      return { ok: true };
    case "open-login":
      await browser.tabs.create({ url: LOGIN_URL, active: true });
      return { ok: true };
    case "open-bookmarks":
      await browser.tabs.create({ url: BOOKMARKS_URL, active: true });
      return { ok: true };
    case "test-notification":
      await createNotification("test", "Onliner Notifier", "Уведомления работают");
      return { ok: true };
    case "test-sound":
      await playNotificationSound();
      return { ok: true };
  }
}

async function runCheck(force: boolean): Promise<void> {
  if (activeCheck) return activeCheck;
  activeCheck = performCheck(force).finally(() => {
    activeCheck = null;
  });
  return activeCheck;
}

async function requestOnlinerText(
  url: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; url: string; body: string }> {
  if (buildTarget !== "safari") {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal,
      headers: { Accept: "text/html" },
    });
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      body: await response.text(),
    };
  }

  return readOnlinerInTab(url, signal);
}

async function readOnlinerInTab(
  url: string,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; url: string; body: string }> {
  const tab = await browser.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error("Safari не открыл страницу Onliner");

  try {
    await waitForTabLoad(tab.id, signal);
    const result = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/ui/page-reader.js"],
    });
    const page = result[0]?.result as { html: string; url: string } | undefined;
    if (!page?.html) throw new Error("Safari не прочитал страницу Onliner");

    return {
      ok: true,
      status: 200,
      url: page.url,
      body: page.html,
    };
  } finally {
    await browser.tabs.remove(tab.id).catch(() => undefined);
  }
}

async function waitForTabLoad(tabId: number, signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (signal.aborted) throw new DOMException("Запрос отменён", "AbortError");
    const tab = await browser.tabs.get(tabId);
    if (tab.status === "complete") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new DOMException("Таймаут загрузки Onliner", "TimeoutError");
}

async function performCheck(force: boolean): Promise<void> {
  const previous = await getState();
  if (!force && previous.nextRetryAt > Date.now()) return;

  await updateState({ status: "checking", errorMessage: null });
  await updateBadge();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await requestOnlinerText(BOOKMARKS_URL, controller.signal);
    if (!response.ok) {
      throw new Error(`Onliner вернул HTTP ${response.status}`);
    }

    const parsed = await parseBookmarks(
      response.body,
      response.url || BOOKMARKS_URL,
    );
    const current = await getState();
    const shouldNotify = current.initialized;
    const changedTopics = parsed.topics.filter(
      (topic) => current.seen[topic.id] !== topic.signature,
    );
    const seen = { ...current.seen };

    for (const topic of parsed.topics) seen[topic.id] = topic.signature;
    pruneSeenTopics(seen, parsed.topics);

    const now = Date.now();
    await saveState({
      status: "ok",
      initialized: true,
      user: parsed.user,
      topics: parsed.topics,
      seen,
      lastCheckedAt: now,
      lastSuccessAt: now,
      consecutiveErrors: 0,
      nextRetryAt: 0,
      errorMessage: null,
    });

    const settings = await getSettings();
    if (shouldNotify && changedTopics.length) {
      if (settings.notificationsEnabled) {
        for (const topic of changedTopics) {
          try {
            await createNotification(
              `topic-${topic.id}`,
              topic.title,
              [topic.lastAuthor, topic.lastPostLabel]
                .filter(Boolean)
                .join(" • ") || "Новое сообщение",
            );
          } catch (error) {
            console.warn("Не удалось показать уведомление", error);
          }
        }
      }

      if (settings.soundEnabled) {
        try {
          await playNotificationSound();
        } catch (error) {
          console.warn("Не удалось воспроизвести звук", error);
        }
      }
    }
  } catch (error) {
    await saveErrorState(error);
  } finally {
    clearTimeout(timeout);
    await updateBadge();
  }
}

async function saveErrorState(error: unknown): Promise<void> {
  const current = await getState();
  const settings = await getSettings();
  const unauthorized =
    error instanceof UnauthorizedError || (error instanceof Error && error.name === "UnauthorizedError");
  const offline =
    error instanceof TypeError ||
    (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
  const consecutiveErrors = current.consecutiveErrors + 1;
  const retryMultiplier = Math.min(2 ** Math.max(0, consecutiveErrors - 1), 30);
  const nextRetryAt =
    Date.now() + settings.intervalMinutes * 60_000 * retryMultiplier;
  const errorMessage = error instanceof Error ? error.message : String(error);

  const patch: Partial<ExtensionState> = {
    status: unauthorized ? "unauthorized" : offline ? "offline" : "error",
    lastCheckedAt: Date.now(),
    consecutiveErrors,
    nextRetryAt,
    errorMessage,
  };

  if (unauthorized) {
    patch.initialized = false;
    patch.user = null;
    patch.topics = [];
  }

  await updateState(patch);
}

function pruneSeenTopics(seen: Record<string, string>, currentTopics: Topic[]): void {
  const keys = Object.keys(seen);
  if (keys.length <= MAX_REMEMBERED_TOPICS) return;

  const currentIds = new Set(currentTopics.map((topic) => topic.id));
  for (const key of keys) {
    if (Object.keys(seen).length <= MAX_REMEMBERED_TOPICS) break;
    if (!currentIds.has(key)) delete seen[key];
  }
}

async function createNotification(
  id: string,
  title: string,
  message: string,
): Promise<void> {
  const iconUrl = browser.runtime.getURL("icons/icon_80.png");
  if (browser.notifications?.create) {
    await browser.notifications.create(id, {
      type: "basic",
      iconUrl,
      title,
      message,
    });
    return;
  }

  if (buildTarget === "safari" && typeof Notification !== "undefined") {
    if (Notification.permission !== "granted") {
      throw new Error("Разрешите уведомления на странице настроек расширения");
    }

    const notification = new Notification(title, {
      body: message,
      icon: iconUrl,
      tag: id,
    });
    const match = /^topic-(\d+)$/.exec(id);
    notification.onclick = () => {
      if (match) void openTopic(match[1]);
      notification.close();
    };
    return;
  }

  throw new Error("Уведомления не поддерживаются этим браузером");
}

async function openTopic(topicId: string): Promise<void> {
  if (!/^\d+$/.test(topicId)) throw new Error("Некорректный идентификатор темы");

  const [settings, state] = await Promise.all([getSettings(), getState()]);
  const topic = state.topics.find((item) => item.id === topicId);
  const url = topic?.unreadUrl ?? unreadTopicUrl(topicId);

  if (settings.openInCurrentTab) {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab?.id !== undefined) {
      await browser.tabs.update(activeTab.id, { url });
    } else {
      await browser.tabs.create({ url, active: true });
    }
  } else {
    await browser.tabs.create({ url, active: true });
  }

  await removeLocalTopics([topicId]);
}

async function openAllTopics(): Promise<void> {
  const [settings, state] = await Promise.all([getSettings(), getState()]);
  const topics = settings.openLimit
    ? state.topics.slice(0, settings.openLimit)
    : state.topics;

  for (const topic of topics) {
    await browser.tabs.create({ url: topic.unreadUrl, active: false });
  }
  await removeLocalTopics(topics.map((topic) => topic.id));
}

async function markTopicRead(topicId: string): Promise<void> {
  if (!/^\d+$/.test(topicId)) throw new Error("Некорректный идентификатор темы");
  await requestMarkRead(unreadTopicUrl(topicId));
  await removeLocalTopics([topicId]);
}

async function markAllTopicsRead(): Promise<void> {
  const state = await getState();
  for (const topic of state.topics) {
    await requestMarkRead(topic.unreadUrl);
    await removeLocalTopics([topic.id]);
  }
}

async function requestMarkRead(url: string): Promise<void> {
  const response = await requestOnlinerText(url, new AbortController().signal);
  if (!response.ok || new URL(response.url).pathname.includes("/login")) {
    throw new Error("Не удалось отметить тему прочитанной");
  }
}

async function removeLocalTopics(topicIds: string[]): Promise<void> {
  if (!topicIds.length) {
    await updateBadge();
    return;
  }

  const ids = new Set(topicIds);
  const state = await getState();
  await saveState({
    ...state,
    topics: state.topics.filter((topic) => !ids.has(topic.id)),
  });
  await updateBadge();
}

async function updateBadge(): Promise<void> {
  const state = await getState();
  const count = state.topics.length;
  const hasError = ["unauthorized", "offline", "error"].includes(state.status);
  const text = state.status === "checking"
    ? "…"
    : hasError
      ? "!"
      : count > 999
        ? "999+"
        : count
          ? String(count)
          : "";
  const color = hasError ? "#757575" : "#b51f2e";
  const titles: Record<ExtensionState["status"], string> = {
    idle: "Onliner Notifier",
    checking: "Проверяем закладки Onliner…",
    ok: count ? `Непрочитанных тем: ${count}` : "Непрочитанных тем нет",
    unauthorized: "Требуется вход в Onliner",
    offline: "Onliner недоступен",
    error: state.errorMessage ?? "Ошибка проверки Onliner",
  };

  await browser.action.setBadgeBackgroundColor({ color });
  await browser.action.setBadgeText({ text });
  await browser.action.setTitle({ title: titles[state.status] });
}
