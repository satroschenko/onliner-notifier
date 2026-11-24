import { unreadTopicUrl } from "./constants";
import type { ParsedBookmarks, Topic, User } from "./types";

const MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

export class BookmarksParseError extends Error {
  constructor(message = "Не удалось разобрать страницу закладок Onliner") {
    super(message);
    this.name = "BookmarksParseError";
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Требуется вход в Onliner");
    this.name = "UnauthorizedError";
  }
}

export function parseBookmarksHtml(
  html: string,
  responseUrl: string,
): ParsedBookmarks {
  const sanitizedHtml = html.replace(
    /\s+on[a-z][a-z0-9_-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );
  const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");
  return parseBookmarksDocument(document, responseUrl);
}

export function parseBookmarksDocument(
  document: Document,
  responseUrl: string,
): ParsedBookmarks {
  if (isLoginPage(document, responseUrl)) {
    throw new UnauthorizedError();
  }

  const user = parseUser(document);
  if (!user) {
    throw new BookmarksParseError(
      "Onliner изменил разметку страницы: пользователь не найден",
    );
  }

  const topics: Topic[] = [];
  const unreadMarkers = document.querySelectorAll(".i-postnew");

  for (const marker of unreadMarkers) {
    const row = marker.closest("li") ?? marker.parentElement;
    if (!row) continue;

    const topic = parseTopic(row);
    if (topic) topics.push(topic);
  }

  topics.sort((left, right) => {
    if (left.lastPostAt !== right.lastPostAt) {
      return right.lastPostAt - left.lastPostAt;
    }
    return left.title.localeCompare(right.title, "ru");
  });

  return { user, topics };
}

function isLoginPage(document: Document, responseUrl: string): boolean {
  let pathname = "";
  try {
    pathname = new URL(responseUrl).pathname;
  } catch {
    pathname = responseUrl;
  }

  return (
    pathname.includes("/login") ||
    Boolean(
      document.querySelector(
        'form[action*="/login"], input[name="login"][type="password"]',
      ),
    )
  );
}

function parseUser(document: Document): User | null {
  const currentUserScript = Array.from(
    document.querySelectorAll("script"),
  ).find((script) =>
    script.textContent?.includes("MODELS.currentUser.setData"),
  );
  const source = currentUserScript?.textContent ?? "";
  const id = /"id"\s*:\s*(\d+)/.exec(source)?.[1];
  const rawNickname = /"nickname"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(source)?.[1];

  if (!id || !rawNickname) return null;

  try {
    return { id, nickname: JSON.parse(`"${rawNickname}"`) as string };
  } catch {
    return { id, nickname: rawNickname };
  }
}

function parseTopic(row: Element): Topic | null {
  const id = row.querySelector("input")?.getAttribute("value")?.trim() ?? "";
  const titleElement = row.querySelector(".topictitle");
  const title = titleElement?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const lastLink = row.querySelector("a.link-getlast");

  if (!/^\d+$/.test(id) || !title || !lastLink) return null;

  const postsCount = Number.parseInt(
    row.querySelector("strong.total-msg")?.textContent?.replace(/\D/g, "") ?? "0",
    10,
  );
  const lastPostLabel =
    lastLink.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const lastPostAt = parseDate(lastLink.getAttribute("title") ?? "");
  const lastAuthor = parseAuthor(row.querySelector("div.b-lt-author"));
  const lastLinkHref = lastLink.getAttribute("href") ?? "";
  const signature = [
    lastPostAt,
    postsCount,
    lastLinkHref,
    lastAuthor,
  ].join(":");

  return {
    id,
    title,
    postsCount: Number.isFinite(postsCount) ? postsCount : 0,
    lastAuthor,
    lastPostAt,
    lastPostLabel,
    signature,
    unreadUrl: unreadTopicUrl(id),
  };
}

function parseAuthor(element: Element | null): string {
  if (!element) return "";
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("a").forEach((link) => link.remove());
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function parseDate(value: string): number {
  const match = value
    .trim()
    .match(/(\d{1,2})\s+([а-я]+)\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/i);
  if (!match) return 0;

  const month = MONTHS[match[2].toLowerCase()];
  if (month === undefined) return 0;

  const date = new Date(
    Number(match[3]),
    month,
    Number(match[1]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  );
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
