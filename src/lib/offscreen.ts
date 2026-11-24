import browser from "webextension-polyfill";

export interface OffscreenApi {
  hasDocument?(): Promise<boolean>;
  createDocument(parameters: {
    url: string;
    reasons: string[];
    justification: string;
  }): Promise<void>;
  closeDocument(): Promise<void>;
}

let creatingOffscreenDocument: Promise<void> | null = null;

export function getOffscreenApi(): OffscreenApi | undefined {
  return (
    globalThis as unknown as { chrome?: { offscreen?: OffscreenApi } }
  ).chrome?.offscreen;
}

export async function hasOffscreenDocument(
  offscreen: OffscreenApi,
): Promise<boolean> {
  if (offscreen.hasDocument) return offscreen.hasDocument();

  const runtime = (
    globalThis as unknown as {
      chrome: {
        runtime: {
          getContexts(filter: {
            contextTypes: string[];
            documentUrls: string[];
          }): Promise<unknown[]>;
        };
      };
    }
  ).chrome.runtime;
  const contexts = await runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [browser.runtime.getURL("src/ui/offscreen.html")],
  });
  return contexts.length > 0;
}

export async function ensureOffscreenDocument(
  offscreen: OffscreenApi,
): Promise<void> {
  if (await hasOffscreenDocument(offscreen)) return;
  if (creatingOffscreenDocument) return creatingOffscreenDocument;

  creatingOffscreenDocument = offscreen
    .createDocument({
      url: browser.runtime.getURL("src/ui/offscreen.html"),
      reasons: ["DOM_PARSER", "AUDIO_PLAYBACK"],
      justification: "Разбор HTML закладок Onliner и воспроизведение уведомлений",
    })
    .finally(() => {
      creatingOffscreenDocument = null;
    });

  return creatingOffscreenDocument;
}
