import { build } from "vite";
import { copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedTarget = process.argv[2] ?? "all";
const targets = requestedTarget === "all"
  ? ["chrome", "firefox", "safari"]
  : [requestedTarget];

if (!targets.every((target) => ["chrome", "firefox", "safari"].includes(target))) {
  throw new Error(`Неизвестная цель сборки: ${requestedTarget}`);
}

for (const target of targets) {
  const outDir = path.join(root, "dist", target);
  const define = { __TARGET__: JSON.stringify(target) };

  await build({
    root,
    configFile: false,
    publicDir: "public",
    define,
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(root, "src/background.ts"),
        output: {
          format: "iife",
          name: "OnlinerNotifierBackground",
          entryFileNames: "background.js",
          inlineDynamicImports: true,
        },
      },
    },
  });

  await build({
    root,
    configFile: false,
    publicDir: false,
    define,
    build: {
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: {
          popup: path.join(root, "src/ui/popup.html"),
          options: path.join(root, "src/ui/options.html"),
          offscreen: path.join(root, "src/ui/offscreen.html"),
        },
      },
    },
  });

  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(createManifest(target), null, 2)}\n`,
  );
  await copyFile(path.join(root, "LICENSE"), path.join(outDir, "LICENSE"));
  console.log(`Готово: dist/${target}`);
}

function createManifest(target) {
  const manifest = {
    manifest_version: 3,
    name: "Onliner Notifier",
    short_name: "Onliner",
    version: "1.0.1",
    description: "Уведомления о новых сообщениях в закладках форума Onliner.",
    permissions: ["alarms", "notifications", "storage", "tabs"],
    host_permissions: [
      "https://profile.onliner.by/*",
      "https://forum.onliner.by/*",
    ],
    action: {
      default_title: "Onliner Notifier",
      default_popup: "src/ui/popup.html",
      default_icon: {
        16: "icons/icon_16.png",
        48: "icons/icon_48.png",
        128: "icons/icon_128.png",
      },
    },
    options_ui: {
      page: "src/ui/options.html",
      open_in_tab: true,
    },
    commands: {
      "open-all": {
        suggested_key: {
          default: "Ctrl+Shift+O",
          mac: "Command+Shift+O",
        },
        description: "Открыть непрочитанные темы",
      },
    },
    icons: {
      16: "icons/icon_16.png",
      48: "icons/icon_48.png",
      128: "icons/icon_128.png",
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  };

  if (target === "chrome") {
    manifest.minimum_chrome_version = "116";
    manifest.permissions.push("offscreen");
    manifest.background = {
      service_worker: "background.js",
    };
  } else {
    manifest.background = {
      scripts: ["background.js"],
    };
  }

  if (target === "firefox") {
    manifest.background.persistent = false;
    manifest.browser_specific_settings = {
      gecko: {
        id: "onliner-notifier@local",
        strict_min_version: "109.0",
      },
    };
  }

  if (target === "safari") {
    manifest.permissions = manifest.permissions.filter(
      (permission) => permission !== "notifications",
    );
    delete manifest.options_ui.open_in_tab;
  }

  return manifest;
}
