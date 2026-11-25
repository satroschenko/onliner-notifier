import browser from "webextension-polyfill";
import { getSettings, saveSettings } from "../lib/storage";
import type { RuntimeResponse, Settings } from "../lib/types";
import "./options.css";

const form = document.getElementById("settings-form") as HTMLFormElement;
const interval = document.getElementById("interval") as HTMLInputElement;
const openLimit = document.getElementById("open-limit") as HTMLInputElement;
const notifications = document.getElementById("notifications") as HTMLInputElement;
const sound = document.getElementById("sound") as HTMLInputElement;
const currentTab = document.getElementById("current-tab") as HTMLInputElement;
const saveStatus = document.getElementById("save-status") as HTMLElement;
const testNotification = document.getElementById(
  "test-notification",
) as HTMLButtonElement;
const testSound = document.getElementById("test-sound") as HTMLButtonElement;

void loadSettings();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitSettings();
});

testNotification.addEventListener("click", () => {
  void sendTestNotification();
});

testSound.addEventListener("click", () => {
  void sendTestSound();
});

async function loadSettings(): Promise<void> {
  const settings = await getSettings();
  interval.value = String(settings.intervalMinutes);
  openLimit.value = String(settings.openLimit);
  notifications.checked = settings.notificationsEnabled;
  sound.checked = settings.soundEnabled;
  currentTab.checked = settings.openInCurrentTab;
}

async function submitSettings(): Promise<void> {
  if (!form.reportValidity()) return;

  const settings: Settings = {
    intervalMinutes: Number(interval.value),
    notificationsEnabled: notifications.checked,
    soundEnabled: sound.checked,
    openInCurrentTab: currentTab.checked,
    openLimit: Number(openLimit.value),
  };

  await saveSettings(settings);
  saveStatus.textContent = "Настройки сохранены";
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 2500);
}

async function sendTestNotification(): Promise<void> {
  testNotification.disabled = true;
  try {
    const response = (await browser.runtime.sendMessage({
      type: "test-notification",
    })) as RuntimeResponse | undefined;
    saveStatus.textContent = response?.ok
      ? "Тестовое уведомление отправлено"
      : response?.error ?? "Фоновый процесс расширения не ответил";
  } catch (error) {
    saveStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    testNotification.disabled = false;
  }
}


async function sendTestSound(): Promise<void> {
  testSound.disabled = true;
  try {
    const response = (await browser.runtime.sendMessage({
      type: "test-sound",
    })) as RuntimeResponse | undefined;
    saveStatus.textContent = response?.ok
      ? "Звук воспроизводится"
      : response?.error ?? "Фоновый процесс расширения не ответил";
  } catch (error) {
    saveStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    testSound.disabled = false;
  }
}
