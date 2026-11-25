import browser from "webextension-polyfill";
import { STATE_KEY } from "../lib/constants";
import type {
  RuntimeRequest,
  RuntimeResponse,
  Snapshot,
  Topic,
} from "../lib/types";
import "./popup.css";

const elements = {
  status: requiredElement("status"),
  settings: requiredElement<HTMLButtonElement>("settings"),
  error: requiredElement("error"),
  unauthorized: requiredElement("unauthorized"),
  content: requiredElement("content"),
  login: requiredElement<HTMLButtonElement>("login"),
  username: requiredElement("username"),
  lastCheck: requiredElement("last-check"),
  refresh: requiredElement<HTMLButtonElement>("refresh"),
  openAll: requiredElement<HTMLButtonElement>("open-all"),
  markAllRead: requiredElement<HTMLButtonElement>("mark-all-read"),
  topics: requiredElement("topics"),
  bookmarks: requiredElement<HTMLButtonElement>("bookmarks"),
};

let busy = false;

elements.settings.addEventListener("click", () => {
  void browser.runtime.openOptionsPage();
});
elements.refresh.addEventListener("click", () => void execute({ type: "refresh" }));
elements.login.addEventListener("click", () => void execute({ type: "open-login" }));
elements.bookmarks.addEventListener("click", () =>
  void execute({ type: "open-bookmarks" }),
);
elements.openAll.addEventListener("click", () => void execute({ type: "open-all" }));
elements.markAllRead.addEventListener("click", () => {
  if (window.confirm("Отметить все показанные темы прочитанными?")) {
    void execute({ type: "mark-all-read" });
  }
});
elements.topics.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]");
  const topicId = button?.dataset.topicId;
  if (!button || !topicId) return;

  if (button.dataset.action === "open") {
    void execute({ type: "open-topic", topicId });
  } else if (button.dataset.action === "read") {
    void execute({ type: "mark-topic-read", topicId });
  }
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STATE_KEY]) void loadSnapshot();
});

void loadSnapshot();

async function loadSnapshot(): Promise<void> {
  const response = await send({ type: "get-snapshot" });
  if (response.ok && response.snapshot) {
    render(response.snapshot);
  } else if (!response.ok) {
    showError(response.error);
  }
}

async function execute(request: RuntimeRequest): Promise<void> {
  if (busy) return;
  setBusy(true);
  showError(null);

  try {
    const response = await send(request);
    if (!response.ok) {
      showError(response.error);
      return;
    }
    if (response.snapshot) {
      render(response.snapshot);
    } else {
      await loadSnapshot();
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

async function send(request: RuntimeRequest): Promise<RuntimeResponse> {
  const response = (await browser.runtime.sendMessage(request)) as
    | RuntimeResponse
    | undefined;
  if (!response || typeof response.ok !== "boolean") {
    return {
      ok: false,
      error: "Фоновый процесс расширения не ответил. Перезапустите браузер и попробуйте снова.",
    };
  }
  return response;
}

function render(nextSnapshot: Snapshot): void {
  const { state } = nextSnapshot;
  const unauthorized = state.status === "unauthorized";

  elements.unauthorized.hidden = !unauthorized;
  elements.content.hidden = unauthorized;
  elements.username.textContent = state.user?.nickname ?? "Onliner";
  elements.status.textContent = statusText(nextSnapshot);
  elements.lastCheck.textContent = state.lastSuccessAt
    ? `Обновлено ${formatTime(state.lastSuccessAt)}`
    : "Ещё не проверялось";

  if (state.errorMessage && !unauthorized) showError(state.errorMessage);

  elements.topics.replaceChildren();
  if (!state.topics.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = state.status === "checking"
      ? "Проверяем закладки…"
      : "Непрочитанных тем нет";
    elements.topics.append(empty);
  } else {
    for (const topic of state.topics) elements.topics.append(createTopicRow(topic));
  }
}

function createTopicRow(topic: Topic): HTMLElement {
  const row = document.createElement("article");
  row.className = "topic";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "topic-open";
  openButton.dataset.action = "open";
  openButton.dataset.topicId = topic.id;

  const title = document.createElement("span");
  title.className = "topic-title";
  title.textContent = topic.title;

  const meta = document.createElement("span");
  meta.className = "topic-meta";
  meta.textContent = [topic.lastAuthor, topic.lastPostLabel]
    .filter(Boolean)
    .join(" • ");

  openButton.append(title, meta);

  const readButton = document.createElement("button");
  readButton.type = "button";
  readButton.className = "topic-read";
  readButton.dataset.action = "read";
  readButton.dataset.topicId = topic.id;
  readButton.textContent = "Прочитано";
  readButton.title = "Отметить тему прочитанной";

  row.append(openButton, readButton);
  return row;
}

function statusText({ state }: Snapshot): string {
  const count = state.topics.length;
  switch (state.status) {
    case "checking":
      return "Проверяем новые сообщения…";
    case "ok":
      return count
        ? `Непрочитанных тем: ${count}`
        : "Новых сообщений нет";
    case "unauthorized":
      return "Требуется вход";
    case "offline":
      return "Нет соединения с Onliner";
    case "error":
      return "Ошибка проверки";
    case "idle":
      return "Ожидает проверки";
  }
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function showError(message: string | null): void {
  elements.error.hidden = !message;
  elements.error.textContent = message ?? "";
}

function setBusy(value: boolean): void {
  busy = value;
  document.body.classList.toggle("is-busy", value);
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = value;
  });
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Элемент #${id} не найден`);
  return element as T;
}
