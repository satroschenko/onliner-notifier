import browser from "webextension-polyfill";
import { parseBookmarksHtml } from "../lib/parser";
import type {
  OffscreenParseRequest,
  OffscreenSoundRequest,
} from "../lib/types";

let activeAudio: HTMLAudioElement | null = null;

browser.runtime.onMessage.addListener((message: unknown) => {
  const request = message as Partial<OffscreenParseRequest> &
    Partial<OffscreenSoundRequest>;
  if (request.scope !== "offscreen") return undefined;

  if (request.type === "play-sound") return playSound();

  if (
    request.type !== "parse-bookmarks" ||
    typeof request.html !== "string" ||
    typeof request.responseUrl !== "string"
  ) {
    return undefined;
  }

  try {
    const result = parseBookmarksHtml(request.html, request.responseUrl);
    return Promise.resolve({ ok: true, result });
  } catch (error) {
    return Promise.resolve({
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

async function playSound(): Promise<{ ok: boolean; error?: { message: string } }> {
  try {
    if (activeAudio) activeAudio.pause();

    const audio = new Audio(browser.runtime.getURL("sound/beep.wav"));
    activeAudio = audio;
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
    };
    await audio.play();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
