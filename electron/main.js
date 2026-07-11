const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { getBackgroundImageMime, safeBackgroundPathForUserData } = require("./background-images");
const { normalizeFontOptions } = require("./font-options");
const {
  buildChatCompletionsRequestBody: buildProviderChatCompletionsRequestBody,
  getChatCompletionMessage,
  getChatCompletionsUrl: resolveProviderChatCompletionsUrl,
  readProviderError: readNormalizedProviderError,
  readProviderResponseBody
} = require("./provider-response");
const { normalizeStoredPreferences } = require("./user-preferences");

const HOST = "127.0.0.1";
const APP_ID = "com.lyriccard.generator";
const START_TIMEOUT_MS = 45000;
const WINDOW_BACKGROUND_COLOR = "#20242D";

app.commandLine.appendSwitch(
  "enable-features",
  "OverlayScrollbar,OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter"
);

let mainWindow = null;
let nextServerProcess = null;
let localAppUrl = null;
let normalWindowBounds = null;
let windowMaximized = false;
let windowRestoring = false;
let lastEmittedWindowState = null;
let appPreferencesWriteQueue = Promise.resolve();
const aiTranslationRequests = new Map();

const DEFAULT_AI_SETTINGS = {
  baseUrl: "https://api.openai.com/v1",
  model: "",
  temperature: 0.7,
  defaultStyle: "recommended",
  reasoningEnabled: false
};
const TRANSLATION_STYLES = new Set(["lyrical", "faithful", "spoken", "imagistic", "restrained", "recommended"]);

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("Unable to allocate a local port."));
      });
    });
  });
}

function waitForHttpReady(url, timeoutMs = START_TIMEOUT_MS) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for local Next service at ${url}`));
          return;
        }

        setTimeout(check, 300);
      });

      request.setTimeout(3000, () => {
        request.destroy();
      });
    };

    check();
  });
}

function getPackagedServerDirectory() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server");
  }

  return path.join(app.getAppPath(), "dist-desktop", "server");
}

function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.ico");
  }

  return path.join(app.getAppPath(), "build", "icon.ico");
}

async function startPackagedNextServer() {
  const serverDirectory = getPackagedServerDirectory();
  const serverEntry = path.join(serverDirectory, "server.js");
  const standaloneNodeModules = path.join(serverDirectory, "_node_modules");
  const port = await getAvailablePort();
  const url = `http://${HOST}:${port}`;

  nextServerProcess = spawn(process.execPath, [serverEntry], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: HOST,
      NODE_PATH: process.env.NODE_PATH
        ? `${standaloneNodeModules}${path.delimiter}${process.env.NODE_PATH}`
        : standaloneNodeModules,
      NODE_ENV: "production",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  nextServerProcess.stdout?.on("data", (chunk) => {
    console.log(`[next] ${chunk.toString().trimEnd()}`);
  });

  nextServerProcess.stderr?.on("data", (chunk) => {
    console.error(`[next] ${chunk.toString().trimEnd()}`);
  });

  nextServerProcess.once("exit", (code, signal) => {
    if (nextServerProcess) {
      console.error(`[next] exited code=${code} signal=${signal}`);
    }
  });

  await waitForHttpReady(url);
  return url;
}

function isAllowedLocalNavigation(targetUrl) {
  if (!localAppUrl) {
    return false;
  }

  try {
    const target = new URL(targetUrl);
    const local = new URL(localAppUrl);
    return target.origin === local.origin;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Lyrics Card Generator",
    width: 1280,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    frame: false,
    roundedCorners: true,
    thickFrame: true,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    transparent: false,
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  normalWindowBounds = mainWindow.getBounds();
  windowMaximized = false;
  lastEmittedWindowState = null;

  const rememberNormalBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (windowRestoring) return;
    if (windowMaximized) return;
    if (mainWindow.isMaximized() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
    normalWindowBounds = mainWindow.getBounds();
    windowMaximized = false;
  };

  const rememberAndMaybeEmitWindowState = () => {
    rememberNormalBounds();
    emitWindowState();
  };

  mainWindow.on("move", rememberAndMaybeEmitWindowState);
  mainWindow.on("resize", rememberAndMaybeEmitWindowState);
  mainWindow.on("maximize", () => {
    windowMaximized = true;
    emitWindowState();
  });
  mainWindow.on("unmaximize", () => {
    windowMaximized = false;
    emitWindowState();
  });
  mainWindow.on("restore", () => {
    windowMaximized = mainWindow?.isMaximized() ?? false;
    emitWindowState();
  });
  mainWindow.on("enter-full-screen", emitWindowState);
  mainWindow.on("leave-full-screen", emitWindowState);

  void readAppPreferences()
    .then((preferences) => {
      applyWindowMaterial(resolveEffectiveUiThemeId(preferences?.userSettings));
    })
    .catch(() => {
      applyWindowMaterial(undefined);
    });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedLocalNavigation(url)) {
      return { action: "allow" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedLocalNavigation(url)) {
      return;
    }

    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.loadURL(localAppUrl);
}

function getWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { maximized: false };
  }

  return { maximized: windowMaximized || mainWindow.isMaximized() };
}

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const nextState = getWindowState();
  if (lastEmittedWindowState?.maximized === nextState.maximized) {
    return;
  }

  lastEmittedWindowState = nextState;
  mainWindow.webContents.send("lyrics-card:window-state-changed", nextState);
}

function isAcrylicTheme(theme) {
  return theme === "dark-acrylic" || theme === "light-acrylic";
}

function resolveEffectiveUiThemeId(settings) {
  if (!settings || typeof settings !== "object") {
    return undefined;
  }

  let mode = "album-dynamic";
  if (settings.uiThemeMode === "dark" || settings.uiThemeMode === "light" || settings.uiThemeMode === "album-dynamic") {
    mode = settings.uiThemeMode;
  } else if (settings.uiTheme === "dark" || settings.uiTheme === "dark-acrylic" || settings.uiTheme === "dark-pink") {
    mode = "dark";
  } else if (settings.uiTheme === "light" || settings.uiTheme === "light-acrylic" || settings.uiTheme === "light-blue") {
    mode = "light";
  }

  if (mode === "album-dynamic") {
    return "album-dynamic";
  }

  const acrylic = typeof settings.uiAcrylicEnabled === "boolean"
    ? settings.uiAcrylicEnabled
    : isAcrylicTheme(settings.uiTheme);

  if (mode === "dark" && acrylic) return "dark-acrylic";
  if (mode === "light" && acrylic) return "light-acrylic";
  return mode;
}

function applyWindowMaterial(theme) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: false, applied: "none", reason: "window-unavailable" };
  }

  const acrylic = isAcrylicTheme(theme);
  const backgroundColor = acrylic ? "#00000000" : WINDOW_BACKGROUND_COLOR;

  try {
    if (process.platform === "win32" && typeof mainWindow.setBackgroundMaterial === "function") {
      mainWindow.setBackgroundMaterial(acrylic ? "acrylic" : "none");
      mainWindow.setBackgroundColor(backgroundColor);
      return { ok: true, applied: acrylic ? "acrylic" : "none", reason: "" };
    }

    mainWindow.setBackgroundColor(backgroundColor);
    return { ok: false, applied: "transparent-fallback", reason: "unsupported-platform-or-api" };
  } catch (error) {
    mainWindow.setBackgroundColor(backgroundColor);
    return {
      ok: false,
      applied: "transparent-fallback",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function stopNextServer() {
  if (!nextServerProcess || nextServerProcess.killed) {
    return;
  }

  const pid = nextServerProcess.pid;
  nextServerProcess = null;

  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited.
  }
}

async function boot() {
  try {
    localAppUrl = process.env.ELECTRON_DEV_SERVER_URL || (await startPackagedNextServer());
    if (process.env.ELECTRON_DEV_SERVER_URL) {
      await waitForHttpReady(localAppUrl);
    }
    createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Lyrics Card Generator", `Unable to start the local desktop service.\n\n${message}`);
    app.quit();
  }
}

app.setAppUserModelId(APP_ID);
Menu.setApplicationMenu(null);
registerDesktopIpc();
app.whenReady().then(boot);

app.on("before-quit", stopNextServer);

app.on("window-all-closed", () => {
  stopNextServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && localAppUrl) {
    createWindow();
  }
});

function registerDesktopIpc() {
  ipcMain.handle("lyrics-card:set-window-material", (_event, theme) => applyWindowMaterial(theme));
  ipcMain.handle("lyrics-card:window-minimize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.minimize();
    return true;
  });
  ipcMain.handle("lyrics-card:window-toggle-maximize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false };
    const isCurrentlyMaximized = windowMaximized || mainWindow.isMaximized();

    if (isCurrentlyMaximized) {
      const restoreBounds = normalWindowBounds;
      windowRestoring = true;
      windowMaximized = false;
      mainWindow.restore();
      mainWindow.unmaximize();
      if (restoreBounds) {
        mainWindow.setBounds(restoreBounds, true);
      }
      mainWindow.focus();
      setTimeout(() => {
        windowRestoring = false;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (!mainWindow.isMaximized() && !mainWindow.isMinimized() && !mainWindow.isFullScreen()) {
          normalWindowBounds = mainWindow.getBounds();
        }
        emitWindowState();
      }, 0);
      emitWindowState();
      return getWindowState();
    } else {
      normalWindowBounds = mainWindow.getBounds();
      windowMaximized = true;
      mainWindow.maximize();
      emitWindowState();
      return getWindowState();
    }
  });
  ipcMain.handle("lyrics-card:window-close", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.close();
    return true;
  });
  ipcMain.handle("lyrics-card:window-state", () => {
    return getWindowState();
  });

  ipcMain.handle("lyrics-card:app-preferences-load", () => readAppPreferences());
  ipcMain.handle("lyrics-card:app-preferences-save", async (_event, input) => {
    const preferences = normalizeStoredPreferences(input);
    if (!preferences) return false;
    await enqueueAppPreferencesWrite(preferences);
    return true;
  });

  ipcMain.handle("lyrics-card:list-system-fonts", async () => {
    if (process.platform !== "win32") {
      return [];
    }

    return listWindowsFontOptions();
  });

  ipcMain.handle("lyrics-card:pick-font", async () => {
    const fonts = process.platform === "win32" ? await listWindowsFontOptions() : [];
    return fonts[0]?.family || null;
  });

  ipcMain.handle("lyrics-card:open-external", async (_event, targetUrl) => {
    if (typeof targetUrl !== "string") {
      return false;
    }

    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return false;
      }

      await shell.openExternal(parsed.toString());
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("lyrics-card:background-save", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const extension = path.extname(source).toLowerCase();
    const imageId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    const directory = path.join(app.getPath("userData"), "backgrounds");
    await fs.mkdir(directory, { recursive: true });
    await fs.copyFile(source, path.join(directory, imageId));
    return { imageId, imageUrl: await readBackgroundDataUrl(imageId) };
  });

  ipcMain.handle("lyrics-card:background-read", (_event, imageId) => readBackgroundDataUrl(imageId));
  ipcMain.handle("lyrics-card:background-remove", async (_event, imageId) => {
    const target = safeBackgroundPath(imageId);
    if (!target) return false;
    await fs.rm(target, { force: true });
    return true;
  });

  ipcMain.handle("lyrics-card:ai-settings-load", async () => {
    const settings = await readAISettings();
    return toAISettingsSummary(settings);
  });

  ipcMain.handle("lyrics-card:ai-settings-save", async (_event, input) => {
    const current = await readAISettings();
    const normalized = normalizeAISettings(input);
    let encryptedApiKey = current.encryptedApiKey || "";
    const nextApiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";

    if (nextApiKey) {
      ensureSecureStorageAvailable();
      encryptedApiKey = safeStorage.encryptString(nextApiKey).toString("base64");
    }

    const stored = { ...normalized, encryptedApiKey };
    await writeAISettings(stored);
    return toAISettingsSummary(stored);
  });

  ipcMain.handle("lyrics-card:ai-settings-api-key-clear", async () => {
    const current = await readAISettings();
    const stored = { ...normalizeAISettings(current), encryptedApiKey: "" };
    await writeAISettings(stored);
    return toAISettingsSummary(stored);
  });

  ipcMain.handle("lyrics-card:ai-translate", async (event, requestId, request) => {
    if (!isValidAIRequestId(requestId) || typeof request?.prompt !== "string" || !request.prompt.trim()) {
      throw new Error("AI 翻译请求无效。");
    }

    const settings = await readAISettings();
    const apiKey = decryptStoredApiKey(settings.encryptedApiKey);
    validateAISettings(settings, apiKey);
    const controller = new AbortController();
    aiTranslationRequests.set(requestId, controller);

    try {
      return await streamAITranslationInMain({
        settings,
        apiKey,
        prompt: request.prompt,
        reasoning: Boolean(request.reasoning),
        signal: controller.signal,
        onStatus: (phase) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "status", phase });
          }
        },
        onReasoningDelta: (delta) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "reasoning", delta });
          }
        },
        onDelta: (delta) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "content", delta });
          }
        }
      });
    } finally {
      aiTranslationRequests.delete(requestId);
    }
  });

  ipcMain.on("lyrics-card:ai-translate-cancel", (_event, requestId) => {
    if (isValidAIRequestId(requestId)) {
      aiTranslationRequests.get(requestId)?.abort();
    }
  });
}

function safeBackgroundPath(imageId) {
  return safeBackgroundPathForUserData(app.getPath("userData"), imageId);
}

async function readBackgroundDataUrl(imageId) {
  const target = safeBackgroundPath(imageId);
  if (!target) return undefined;
  try {
    const data = await fs.readFile(target);
    const mime = getBackgroundImageMime(target);
    if (!mime) return undefined;
    return `data:${mime};base64,${data.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function getAISettingsPath() {
  return path.join(app.getPath("userData"), "ai-settings.json");
}

function getAppPreferencesPath() {
  return path.join(app.getPath("userData"), "app-preferences.json");
}

async function writeAppPreferences(preferences) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getAppPreferencesPath(), JSON.stringify(preferences, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.chmod(getAppPreferencesPath(), 0o600).catch(() => undefined);
}

function enqueueAppPreferencesWrite(preferences) {
  const operation = appPreferencesWriteQueue
    .catch(() => undefined)
    .then(() => writeAppPreferences(preferences));
  appPreferencesWriteQueue = operation;
  return operation;
}

async function readAppPreferences() {
  try {
    const parsed = JSON.parse(await fs.readFile(getAppPreferencesPath(), "utf8"));
    return normalizeStoredPreferences(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("[app-preferences] unable to read preferences", error instanceof Error ? error.message : "unknown error");
    }
    return null;
  }
}

async function writeAISettings(settings) {
  const stored = {
    ...normalizeAISettings(settings),
    encryptedApiKey: typeof settings?.encryptedApiKey === "string" ? settings.encryptedApiKey : ""
  };
  const settingsPath = getAISettingsPath();
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.chmod(settingsPath, 0o600).catch(() => undefined);
}

async function readAISettings() {
  try {
    const raw = await fs.readFile(getAISettingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...normalizeAISettings(parsed),
      encryptedApiKey: typeof parsed.encryptedApiKey === "string" ? parsed.encryptedApiKey : ""
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("[ai-settings] unable to read settings", error instanceof Error ? error.message : "unknown error");
    }
    return { ...DEFAULT_AI_SETTINGS, encryptedApiKey: "" };
  }
}

function normalizeAISettings(input) {
  const temperature = Number(input?.temperature);
  return {
    baseUrl: typeof input?.baseUrl === "string" && input.baseUrl.trim()
      ? input.baseUrl.trim()
      : DEFAULT_AI_SETTINGS.baseUrl,
    model: typeof input?.model === "string" ? input.model.trim() : "",
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : DEFAULT_AI_SETTINGS.temperature,
    defaultStyle: TRANSLATION_STYLES.has(input?.defaultStyle) ? input.defaultStyle : DEFAULT_AI_SETTINGS.defaultStyle,
    reasoningEnabled: Boolean(input?.reasoningEnabled)
  };
}

function toAISettingsSummary(settings) {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    defaultStyle: settings.defaultStyle,
    reasoningEnabled: settings.reasoningEnabled,
    hasApiKey: Boolean(settings.encryptedApiKey)
  };
}

function decryptStoredApiKey(encryptedApiKey) {
  if (!encryptedApiKey) {
    return "";
  }
  ensureSecureStorageAvailable();
  try {
    return safeStorage.decryptString(Buffer.from(encryptedApiKey, "base64"));
  } catch {
    throw new Error("无法读取已保存的 API Key，请在设置中重新输入。");
  }
}

function ensureSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储暂不可用，无法安全处理 API Key。");
  }
  if (
    process.platform === "linux"
    && typeof safeStorage.getSelectedStorageBackend === "function"
    && safeStorage.getSelectedStorageBackend() === "basic_text"
  ) {
    throw new Error("系统未提供安全的密钥存储后端，已拒绝保存 API Key。");
  }
}

function validateAISettings(settings, apiKey) {
  if (!apiKey.trim()) {
    throw new Error("未配置 API Key，请先前往设置页配置。");
  }
  if (!settings.model.trim()) {
    throw new Error("未配置模型，请先前往设置页填写模型名称。");
  }
  resolveProviderChatCompletionsUrl(settings.baseUrl);
}

async function streamAITranslationInMain({ settings, apiKey, prompt, reasoning, signal, onStatus, onReasoningDelta, onDelta }) {
  const endpoint = resolveProviderChatCompletionsUrl(settings.baseUrl);
  const requestBody = buildProviderChatCompletionsRequestBody({
    baseUrl: settings.baseUrl,
    model: settings.model,
    prompt,
    reasoning,
    temperature: settings.temperature
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI 翻译已取消。");
    }
    throw new Error("网络请求失败，请检查 Base URL、网络连接和接口可用性。");
  }

  if (!response.ok) {
    throw new Error(await readNormalizedProviderError(response));
  }
  onStatus("connected");

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const body = await readProviderResponseBody(response);
    const { content, reasoningContent } = getChatCompletionMessage(body);
    if (reasoningContent) {
      onStatus("reasoning");
      onReasoningDelta(reasoningContent);
    }
    if (!content) {
      throw new Error("AI 返回为空，请重试或更换模型。");
    }
    onStatus("translating");
    onDelta(content);
    return content;
  }

  if (!response.body) {
    throw new Error("AI 返回为空，请重试或更换模型。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedContent = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";

    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith("data:")) {
          continue;
        }
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }
        try {
          const data = JSON.parse(payload);
          const reasoningDelta = data?.choices?.[0]?.delta?.reasoning_content;
          if (reasoningDelta) {
            onStatus("reasoning");
            onReasoningDelta(reasoningDelta);
          }
          const delta = data?.choices?.[0]?.delta?.content;
          if (delta) {
            receivedContent += delta;
            onStatus("translating");
            onDelta(delta);
          }
        } catch {
          // Ignore malformed or provider-specific SSE metadata lines.
        }
      }
    }

    if (done) {
      break;
    }
  }

  if (!receivedContent.trim()) {
    throw new Error("AI 返回为空，请重试或更换模型。");
  }
  return receivedContent;
}

function isValidAIRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
}

async function listWindowsFontOptions() {
  const script = [
    "$ErrorActionPreference = 'Stop';",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new();",
    "Add-Type -AssemblyName System.Drawing;",
    "$paths = @(",
    "  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',",
    "  'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'",
    ");",
    "$fontOptions = [Collections.Generic.List[object]]::new();",
    "foreach ($path in $paths) {",
    "  if (Test-Path $path) {",
    "    $item = Get-ItemProperty -Path $path;",
    "    foreach ($property in ($item.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' })) {",
    "      $label = $property.Name -replace '\\s*\\((TrueType|OpenType|Type 1|Raster|All res)\\)\\s*$', '';",
    "      foreach ($fileValue in @($property.Value)) {",
    "        try {",
    "          $fontPath = if ([IO.Path]::IsPathRooted([string]$fileValue)) { [string]$fileValue } else { Join-Path $env:WINDIR ('Fonts\\' + $fileValue) };",
    "          if (-not (Test-Path -LiteralPath $fontPath)) { continue };",
    "          $privateFonts = [Drawing.Text.PrivateFontCollection]::new();",
    "          try {",
    "            $privateFonts.AddFontFile($fontPath);",
    "            $weight = if ($label -match '(?i)(Extra|Ultra)[ -]*Light|特细|超细') { 200 } elseif ($label -match '(?i)(Extra|Ultra)[ -]*Bold|特粗|超粗') { 800 } elseif ($label -match '(?i)(Semi|Demi)[ -]*Bold|中粗') { 600 } elseif ($label -match '(?i)\\b(Heavy|Black)\\b') { 900 } elseif ($label -match '(?i)\\bBold\\b|粗体') { 700 } elseif ($label -match '(?i)\\bMedium\\b|中等') { 500 } elseif ($label -match '(?i)\\bLight\\b|细体') { 300 } else { 400 };",
    "            $fontStyle = if ($label -match '(?i)\\b(Italic|Oblique)\\b|斜体|倾斜') { 'italic' } else { 'normal' };",
    "            foreach ($family in $privateFonts.Families) {",
    "              $fontOptions.Add([pscustomobject]@{ label = $label.Trim(); family = $family.GetName(0x0409).Trim(); fontWeight = $weight; fontStyle = $fontStyle });",
    "            }",
    "          } finally { $privateFonts.Dispose() }",
    "        } catch { continue }",
    "      }",
    "    }",
    "  }",
    "}",
    "$installedFonts = [Drawing.Text.InstalledFontCollection]::new();",
    "foreach ($family in $installedFonts.Families) {",
    "  $englishFamily = $family.GetName(0x0409).Trim();",
    "  $fontOptions.Add([pscustomobject]@{ label = $englishFamily; family = $englishFamily; fontWeight = 400; fontStyle = 'normal' });",
    "}",
    "$fontOptions | ConvertTo-Json -Compress -Depth 3"
  ].join(" ");

  try {
    const output = await runProcess("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ]);
    const parsed = JSON.parse(output || "[]");
    return normalizeFontOptions(Array.isArray(parsed) ? parsed : [parsed]);
  } catch (error) {
    console.error("[fonts] unable to list Windows fonts", error);
    return normalizeFontOptions([
      "Arial",
      "Calibri",
      "Microsoft YaHei",
      "Microsoft JhengHei",
      "Segoe UI",
      "SimSun",
      "SimHei"
    ]);
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}
