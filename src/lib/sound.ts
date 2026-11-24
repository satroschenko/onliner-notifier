import browser from "webextension-polyfill";
import { buildTarget } from "./browser-target";
import { ensureOffscreenDocument, getOffscreenApi } from "./offscreen";
import type { OffscreenSoundRequest } from "./types";

let activeAudio: HTMLAudioElement | null = null;

export async function playNotificationSound(): Promise<void> {
  if (buildTarget === "safari") {
    await browser.runtime.sendNativeMessage("onliner-notifier", {
      type: "play-sound",
    });
    return;
  }

  if (typeof Audio !== "undefined") {
    if (activeAudio) activeAudio.pause();

    const audio = new Audio(browser.runtime.getURL("sound/beep.wav"));
    activeAudio = audio;
    audio.onended = () => {
      if (activeAudio === audio) activeAudio = null;
    };

    try {
      await audio.play();
    } catch (error) {
      if (activeAudio === audio) activeAudio = null;
      throw error;
    }
    return;
  }

  const offscreen = getOffscreenApi();
  if (!offscreen) throw new Error("Воспроизведение звука не поддерживается браузером");

  await ensureOffscreenDocument(offscreen);
  const request: OffscreenSoundRequest = {
    scope: "offscreen",
    type: "play-sound",
  };
  const response = (await browser.runtime.sendMessage(request)) as {
    ok: boolean;
    error?: { message: string };
  };
  if (!response?.ok) {
    throw new Error(response?.error?.message ?? "Не удалось воспроизвести звук");
  }
}
