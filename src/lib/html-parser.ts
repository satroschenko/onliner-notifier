import browser from "webextension-polyfill";
import {
  BookmarksParseError,
  parseBookmarksHtml,
  UnauthorizedError,
} from "./parser";
import {
  ensureOffscreenDocument,
  getOffscreenApi,
  hasOffscreenDocument,
} from "./offscreen";
import type { OffscreenParseRequest, ParsedBookmarks } from "./types";

interface OffscreenParseResponse {
  ok: boolean;
  result?: ParsedBookmarks;
  error?: { name: string; message: string };
}

export async function parseBookmarks(
  html: string,
  responseUrl: string,
): Promise<ParsedBookmarks> {
  if (typeof DOMParser !== "undefined") {
    return parseBookmarksHtml(html, responseUrl);
  }

  const offscreen = getOffscreenApi();
  if (!offscreen) {
    throw new BookmarksParseError(
      "Браузер не поддерживает разбор HTML в фоновом процессе. Обновите браузер или используйте сборку, предназначенную для него.",
    );
  }
  await ensureOffscreenDocument(offscreen);

  try {
    const request: OffscreenParseRequest = {
      scope: "offscreen",
      type: "parse-bookmarks",
      html,
      responseUrl,
    };
    const response = (await browser.runtime.sendMessage(
      request,
    )) as OffscreenParseResponse;

    if (!response?.ok || !response.result) {
      const error = response?.error;
      if (error?.name === "UnauthorizedError") throw new UnauthorizedError();
      throw new BookmarksParseError(
        error?.message ?? "Не удалось разобрать ответ Onliner",
      );
    }

    return response.result;
  } finally {
    if (await hasOffscreenDocument(offscreen)) await offscreen.closeDocument();
  }
}
