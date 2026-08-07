const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { getBackgroundImageMime, safeBackgroundPathForUserData } = require("./background-images");
const { normalizePromptLibrary } = require("./ai-prompt-settings");
const { createWindowsFontDirectoryService } = require("./font-directory-service");
const {
  buildChatCompletionsRequestBody: buildProviderChatCompletionsRequestBody,
  getChatCompletionMessage,
  getChatCompletionsUrl: resolveProviderChatCompletionsUrl,
  readProviderError: readNormalizedProviderError,
  readProviderResponseBody
} = require("./provider-response");
const { normalizeStoredPreferences } = require("./user-preferences");
const { AIRequestRegistry } = require("./ai-request-registry");
const { assertTrustedIpcEvent } = require("./ipc-security");
const {
  ImportHistoryStore,
  normalizeImportHistoryLimit,
  readValidatedImportFile,
  toPublicImportHistoryRecord,
  validateImportFileDescriptor
} = require("./import-history");
const { resolveLocalAppUrl } = require("./local-app-url");
const {
  LOOPBACK_HOST,
  findAvailableLoopbackPort,
  getOriginStatePath,
  isPortUnavailableError,
  selectLoopbackPort,
  writeCachedLoopbackPort
} = require("./local-server-origin");
const { createManualSaveIpcHandlers } = require("./manual-save-ipc");
const {
  STARTUP_SECRET_ENV,
  createPackagedServerStartupSecret,
  isChildProcessAlive,
  waitForPackagedServerReady
} = require("./packaged-server-readiness");
const { acquireSingleInstanceOwnership } = require("./single-instance-ownership");
const { createStartupTrace } = require("./startup-trace");
const { prepareDesktopStartup } = require("./startup-orchestration");
const { isAllowedLocalNavigation, parseAllowedExternalUrl } = require("./url-policy");

const HOST = LOOPBACK_HOST;
const APP_ID = "com.lyriccard.generator";
const START_TIMEOUT_MS = 45000;
const WINDOW_BACKGROUND_COLOR = "#20242D";
const IMPORT_FILE_REGISTRATION_TTL_MS = 30 * 60 * 1000;
const startupTrace = createStartupTrace();
startupTrace.mark("module-loaded");

if (process.env.LYRICS_CARD_TEST_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.LYRICS_CARD_TEST_USER_DATA));
}

let mainWindow = null;
let nextServerProcess = null;
let localAppUrl = null;
let appBooting = false;
let normalWindowBounds = null;
let windowMaximized = false;
let windowRestoring = false;
let lastEmittedWindowState = null;
let appPreferencesWriteQueue = Promise.resolve();
let importHistoryMutationQueue = Promise.resolve();
// Window closure is a renderer-confirmed handshake so pending persistence can drain first.
let allowWindowClose = false;
const aiTranslationRequests = new AIRequestRegistry();
// Renderer-supplied paths become sender-bound, expiring, one-use capabilities before later mutations.
const importFileRegistrations = new Map();
const importHistoryRelocations = new Map();
const importHistoryOperations = new Set();
let importHistoryStore = null;
let systemFontDirectoryService = null;
// Ownership is decided before IPC registration, service startup, or BrowserWindow creation.
const singleInstanceOwnership = acquireSingleInstanceOwnership({
  app,
  getMainWindow: () => mainWindow,
  isWindowClosing: () => allowWindowClose
});
startupTrace.mark("single-instance-ownership", { hasLock: singleInstanceOwnership.hasLock });

const DEFAULT_AI_SETTINGS = {
  baseUrl: "https://api.openai.com/v1",
  model: "",
  temperature: 0.7,
  defaultStyle: "recommended",
  reasoningEnabled: false,
  promptLibrary: {
    localeOverrides: {},
    hiddenStyleIds: [],
    customPresets: []
  }
};
const TRANSLATION_STYLES = new Set(["lyrical", "faithful", "spoken", "imagistic", "restrained", "recommended"]);

function waitForDevelopmentServer(url, timeoutMs = START_TIMEOUT_MS) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
          resolve();
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for local development service at ${url}`));
          return;
        }
        setTimeout(check, 300);
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

async function startPackagedNextServer(onProcessLaunchStarted = () => undefined) {
  startupTrace.mark("next-port-selection-start");
  const userDataPath = app.getPath("userData");
  const originStatePath = getOriginStatePath(userDataPath);
  const selection = await selectLoopbackPort({
    stateFilePath: originStatePath,
    profileSeed: userDataPath
  });
  startupTrace.mark("next-port-selected", { port: selection.port, source: selection.source });

  try {
    return await startAndCachePackagedNextServer(
      selection.port,
      selection.source,
      originStatePath,
      onProcessLaunchStarted
    );
  } catch (error) {
    if (!isPortUnavailableError(error)) throw error;
    // The availability probe is advisory. If another process wins the bind race,
    // authenticated readiness still fails closed before an ephemeral fallback is tried.
    const fallbackPort = await findAvailableLoopbackPort({ host: HOST, port: 0 });
    startupTrace.mark("next-port-race-fallback", { port: fallbackPort });
    return startAndCachePackagedNextServer(
      fallbackPort,
      "race-fallback",
      originStatePath,
      onProcessLaunchStarted
    );
  }
}

async function startAndCachePackagedNextServer(port, source, originStatePath, onProcessLaunchStarted) {
  const url = await startPackagedNextServerOnPort(port, source, onProcessLaunchStarted);
  // Persist only the non-sensitive port, and only after this launch's HMAC proof succeeds.
  // The atomic metadata write is not a renderer-readiness prerequisite.
  void writeCachedLoopbackPort(originStatePath, port)
    .then(() => startupTrace.mark("next-port-cached", { port }))
    .catch((error) => {
      console.error("[next] unable to persist the cache origin", error instanceof Error ? error.message : String(error));
      startupTrace.mark("next-port-cache-failed", { port });
    });
  return url;
}

async function startPackagedNextServerOnPort(port, source, onProcessLaunchStarted) {
  const serverDirectory = getPackagedServerDirectory();
  const serverEntry = path.join(serverDirectory, "server.js");
  const serverLauncher = path.join(serverDirectory, "desktop-server-launcher.cjs");
  const standaloneNodeModules = path.join(serverDirectory, "_node_modules");
  const url = `http://${HOST}:${port}`;
  const startupSecret = createPackagedServerStartupSecret();
  let startupOutput = "";
  startupTrace.mark("next-process-spawn-start", { port, source });

  // The per-launch secret is inherited only by this child and authenticates readiness on the released port.
  const spawnedServer = spawn(process.execPath, [serverLauncher, serverEntry], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: HOST,
      NODE_PATH: process.env.NODE_PATH
        ? `${standaloneNodeModules}${path.delimiter}${process.env.NODE_PATH}`
        : standaloneNodeModules,
      NODE_ENV: "production",
      PORT: String(port),
      [STARTUP_SECRET_ENV]: startupSecret
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true
  });

  nextServerProcess = spawnedServer;
  onProcessLaunchStarted();
  spawnedServer.once("spawn", () => startupTrace.mark("next-process-spawned", { pid: spawnedServer.pid, port }));

  spawnedServer.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    startupOutput = `${startupOutput}${text}`.slice(-12_000);
    console.log(`[next] ${text.trimEnd()}`);
  });

  spawnedServer.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    startupOutput = `${startupOutput}${text}`.slice(-12_000);
    console.error(`[next] ${text.trimEnd()}`);
  });

  spawnedServer.once("exit", (code, signal) => handleNextServerExit(spawnedServer, code, signal));

  try {
    await waitForPackagedServerReady({
      url,
      child: spawnedServer,
      startupSecret,
      timeoutMs: START_TIMEOUT_MS
    });
    startupTrace.mark("next-authenticated-ready", { pid: spawnedServer.pid, port });
    if (nextServerProcess !== spawnedServer || !isChildProcessAlive(spawnedServer)) {
      throw new Error("Bundled Next service exited before the renderer could be trusted.");
    }
    return url;
  } catch (error) {
    await waitForChildExitBriefly(spawnedServer);
    if (/\bEADDRINUSE\b/.test(startupOutput) && error && typeof error === "object") {
      error.code = "EADDRINUSE";
    }
    if (nextServerProcess === spawnedServer) await stopNextServer();
    throw error;
  }
}

async function waitForChildExitBriefly(child, timeoutMs = 300) {
  if (!isChildProcessAlive(child)) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    child.once("exit", finish);
  });
}

function createWindow(targetUrl = localAppUrl) {
  startupTrace.mark("window-create-start");
  allowWindowClose = false;
  // Keep renderer privileges behind the preload bridge; the window remains hidden until its first safe paint.
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
  const createdWindow = mainWindow;
  startupTrace.mark("window-created");
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
    // Ignore readiness from a window that was replaced or destroyed during asynchronous startup.
    if (mainWindow !== createdWindow || createdWindow.isDestroyed()) return;
    createdWindow.show();
    startupTrace.mark("window-visible");
    singleInstanceOwnership.markWindowReady(createdWindow);
  });
  mainWindow.webContents.once("dom-ready", () => startupTrace.mark("renderer-dom-ready"));
  mainWindow.webContents.once("did-finish-load", () => startupTrace.mark("renderer-load-finished"));
  const desktopSession = mainWindow.webContents.session;
  // The desktop renderer does not require browser permission grants or device access.
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  desktopSession.setPermissionCheckHandler(() => false);
  if (typeof desktopSession.setDevicePermissionHandler === "function") {
    desktopSession.setDevicePermissionHandler(() => false);
  }

  mainWindow.on("close", (event) => {
    if (allowWindowClose) return;
    // Give the renderer a chance to persist its latest document and acknowledge close explicitly.
    event.preventDefault();
    requestRendererClose();
  });
  mainWindow.on("closed", () => {
    singleInstanceOwnership.markWindowClosed(createdWindow);
    importFileRegistrations.clear();
    importHistoryRelocations.clear();
    if (mainWindow === createdWindow) mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Same-origin app navigation stays internal; only allowlisted HTTPS destinations leave the app.
    if (isAllowedLocalNavigation(url, localAppUrl)) {
      return { action: "allow" };
    }
    const external = parseAllowedExternalUrl(url);
    if (external) void shell.openExternal(external.toString());
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isAllowedLocalNavigation(url, localAppUrl)) {
      return;
    }

    event.preventDefault();
    const external = parseAllowedExternalUrl(url);
    if (external) void shell.openExternal(external.toString());
  });

  if (targetUrl) loadMainWindow(createdWindow, targetUrl);
  return createdWindow;
}

function loadMainWindow(window, targetUrl) {
  if (!window || window.isDestroyed() || window !== mainWindow) {
    throw new Error("The startup window is unavailable before renderer navigation.");
  }
  startupTrace.mark("window-load-url");
  void window.loadURL(targetUrl);
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
  if (!nextServerProcess) {
    return Promise.resolve();
  }

  const serverProcess = nextServerProcess;
  // Clear ownership before termination so the child's exit callback is treated as intentional shutdown.
  nextServerProcess = null;
  return terminateNextServerProcess(serverProcess);
}

async function terminateNextServerProcess(serverProcess) {
  if (!isChildProcessAlive(serverProcess)) {
    return;
  }

  const pid = serverProcess.pid;

  if (!pid) {
    return;
  }

  if (serverProcess.connected) {
    try {
      serverProcess.send({ type: "lyrics-card:shutdown-server" }, () => undefined);
    } catch {
      // The IPC channel may close between the connected check and send.
    }
    await waitForChildExitBriefly(serverProcess, 1_000);
    if (!isChildProcessAlive(serverProcess)) return;
  }

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, 5_000);
      killer.once("error", finish);
      killer.once("exit", finish);
    });
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Process may have already exited.
  }
}

function disposeSystemFontDirectoryService() {
  systemFontDirectoryService?.dispose();
  systemFontDirectoryService = null;
}

function handleNextServerExit(serverProcess, code, signal) {
  // Ignore stale or deliberately stopped children; only the active service owns renderer viability.
  if (nextServerProcess !== serverProcess) return;
  console.error(`[next] exited code=${code} signal=${signal}`);
  nextServerProcess = null;
  // During startup the readiness promise owns failure and optional safe fallback.
  if (!localAppUrl) return;

  localAppUrl = null;
  allowWindowClose = true;
  singleInstanceOwnership.markQuitting();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.quit();
}

async function boot() {
  startupTrace.mark("app-ready-boot-start");
  appBooting = true;
  let serverLaunchStarted = false;
  let resolveServerLaunchStarted;
  const serverLaunchStartedPromise = new Promise((resolve) => {
    resolveServerLaunchStarted = resolve;
  });
  const markServerLaunchStarted = () => {
    if (serverLaunchStarted) return;
    serverLaunchStarted = true;
    resolveServerLaunchStarted();
  };
  try {
    const { resolvedAppUrl, window: startupWindow } = await prepareDesktopStartup({
      initializeHistory: async () => {
        startupTrace.mark("history-initialize-start");
        await importHistoryStore.initialize().catch((error) => {
          console.error("[import-history] unable to initialize history", error instanceof Error ? error.message : "unknown error");
        });
        startupTrace.mark("history-initialize-end");
      },
      resolveAppUrl: () => resolveLocalAppUrl({
        isPackaged: app.isPackaged,
        devServerUrl: process.env.ELECTRON_DEV_SERVER_URL,
        startLocalServer: () => startPackagedNextServer(markServerLaunchStarted).finally(markServerLaunchStarted)
      }),
      waitForDevelopmentServer,
      waitForBackgroundStart: () => (app.isPackaged ? serverLaunchStartedPromise : Promise.resolve()),
      createHiddenWindow: () => createWindow(null)
    });
    // Authenticated readiness is valid only while the same owned child remains alive.
    if (!resolvedAppUrl.waitForReady && !isChildProcessAlive(nextServerProcess)) {
      throw new Error("Bundled Next service exited before the renderer could be trusted.");
    }
    localAppUrl = resolvedAppUrl.url;
    loadMainWindow(startupWindow, localAppUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    startupTrace.mark("boot-failed");
    localAppUrl = null;
    allowWindowClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    await stopNextServer();
    dialog.showErrorBox("Lyrics Card Generator", `Unable to start the local desktop service.\n\n${message}`);
    singleInstanceOwnership.markQuitting();
    app.quit();
  } finally {
    appBooting = false;
  }
}

function initializePrimaryInstance() {
  startupTrace.mark("primary-initialize-start");
  importHistoryStore = new ImportHistoryStore({
    filePath: path.join(app.getPath("userData"), "app-data", "import-history.json")
  });
  systemFontDirectoryService = createWindowsFontDirectoryService({
    onError: (error) => console.error("[fonts] unable to list Windows fonts", error)
  });
  app.commandLine.appendSwitch(
    "enable-features",
    "OverlayScrollbar,OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter"
  );
  app.setAppUserModelId(APP_ID);
  Menu.setApplicationMenu(null);
  registerDesktopIpc();
  startupTrace.mark("primary-initialize-end");
  app.whenReady().then(boot);

  app.on("before-quit", (event) => {
    if (appBooting && mainWindow && !mainWindow.isDestroyed()) {
      // No renderer has been trusted yet, so the normal persistence handshake is unavailable.
      allowWindowClose = true;
      mainWindow.destroy();
    } else if (mainWindow && !mainWindow.isDestroyed() && !allowWindowClose) {
      // Route operating-system quit through the same renderer persistence handshake as the close button.
      event.preventDefault();
      requestRendererClose();
      return;
    }
    singleInstanceOwnership.markQuitting();
    disposeSystemFontDirectoryService();
    void stopNextServer();
  });

  app.on("will-quit", disposeSystemFontDirectoryService);

  app.on("window-all-closed", () => {
    void stopNextServer();
    if (process.platform !== "darwin") {
      singleInstanceOwnership.markQuitting();
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && localAppUrl) {
      createWindow();
    }
  });
}

if (singleInstanceOwnership.hasLock) {
  initializePrimaryInstance();
}

function registerDesktopIpc() {
  // Every desktop channel shares one top-frame, current-window, same-origin trust boundary.
  const handle = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcEvent(event, mainWindow, localAppUrl);
    return handler(event, ...args);
  });
  handle("lyrics-card:set-window-material", (_event, theme) => applyWindowMaterial(theme));
  handle("lyrics-card:window-minimize", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    mainWindow.minimize();
    return true;
  });
  handle("lyrics-card:window-toggle-maximize", () => {
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
  handle("lyrics-card:window-close", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    requestRendererClose();
    return true;
  });
  handle("lyrics-card:window-close-confirm", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    // Drain preferences first, then all history work, before allowing the native close event through.
    await appPreferencesWriteQueue;
    await flushImportHistoryOperations();
    allowWindowClose = true;
    mainWindow.close();
    return true;
  });
  handle("lyrics-card:window-state", () => {
    return getWindowState();
  });

  handle("lyrics-card:app-preferences-load", () => readAppPreferences());
  handle("lyrics-card:app-preferences-save", (_event, input, options) => trackImportHistoryMutation(async () => {
    const preferences = normalizeStoredPreferences(input);
    if (!preferences) return false;
    const limit = normalizeImportHistoryLimit(preferences.userSettings?.importHistoryLimit);
    // Limit trimming and preference persistence share the history queue and rollback contract.
    await importHistoryStore.applyLimitTransaction(
      limit,
      options?.importHistoryTrimConfirmation,
      async () => {
        const persisted = await enqueueAppPreferencesWrite(preferences);
        if (
          persisted?.revision !== preferences.revision ||
          persisted?.updatedAt !== preferences.updatedAt
        ) {
          const error = new Error("stale_app_preferences");
          error.code = "stale_app_preferences";
          throw error;
        }
        return persisted;
      }
    );
    return true;
  }));

  handle("lyrics-card:list-system-fonts", async () => {
    if (process.platform !== "win32") {
      return [];
    }

    return systemFontDirectoryService.list();
  });

  handle("lyrics-card:pick-font", async () => {
    const fonts = process.platform === "win32" ? await systemFontDirectoryService.list() : [];
    return fonts[0]?.family || null;
  });

  handle("lyrics-card:open-external", async (_event, targetUrl) => {
    const parsed = parseAllowedExternalUrl(targetUrl);
    if (!parsed) return false;
    await shell.openExternal(parsed.toString());
    return true;
  });

  handle("lyrics-card:background-save", async () => {
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

  handle("lyrics-card:background-read", (_event, imageId) => readBackgroundDataUrl(imageId));
  handle("lyrics-card:background-remove", async (_event, imageId) => {
    const target = safeBackgroundPath(imageId);
    if (!target) return false;
    await fs.rm(target, { force: true });
    return true;
  });

  handle("lyrics-card:import-file-register", async (event, input) => {
    const kind = input?.kind === "local-audio" || input?.kind === "manual-cover" ? input.kind : "";
    const filePath = typeof input?.path === "string" ? input.path : "";
    if (!kind || !filePath || !path.isAbsolute(filePath)) return null;
    try {
      // Renderer metadata is only a consistency hint; main re-stats and validates the native file itself.
      const stat = await fs.stat(filePath);
      const validated = validateImportFileDescriptor(kind, filePath, stat);
      if (!validated.ok) return null;
      const rendererSize = Number(input?.size);
      if (Number.isSafeInteger(rendererSize) && rendererSize >= 0 && rendererSize !== validated.size) return null;
      pruneImportFileRegistrations();
      const token = crypto.randomUUID();
      // Bind the capability to its sender so another renderer cannot claim the registered path.
      importFileRegistrations.set(token, {
        kind,
        senderId: event.sender.id,
        expiresAt: Date.now() + IMPORT_FILE_REGISTRATION_TTL_MS,
        path: validated.path,
        fileName: path.basename(validated.path),
        size: validated.size,
        mtimeMs: validated.mtimeMs
      });
      return { token };
    } catch {
      return null;
    }
  });

  handle("lyrics-card:import-history-list", async (_event, input) => {
    return importHistoryStore.list({
      offset: input?.offset,
      limit: input?.limit,
      query: input?.query,
      source: input?.source
    });
  });

  handle("lyrics-card:import-history-stats", () => importHistoryStore.stats());

  handle("lyrics-card:import-history-record", (event, input) => trackImportHistoryMutation(async () => {
    try {
      let candidate = input;
      if (input?.kind === "local-audio" || input?.kind === "manual-cover") {
        // Consuming the capability once prevents replaying a previously approved native path.
        const file = takeImportFileRegistration(event.sender.id, input?.fileToken, input.kind);
        if (!file) return { ok: false, code: "file_reference_expired" };
        candidate = { ...input, file };
      }
      const limit = await readImportHistoryLimit();
      const record = await importHistoryStore.upsert(candidate, limit);
      return { ok: true, record };
    } catch (error) {
      console.error("[import-history] unable to save record", error instanceof Error ? error.message : "unknown error");
      return { ok: false, code: importHistoryErrorCode(error) };
    }
  }));

  const manualSaveHandlers = createManualSaveIpcHandlers({
    trackMutation: trackImportHistoryMutation,
    readLimit: readImportHistoryLimit,
    store: importHistoryStore,
    errorCode: importHistoryErrorCode
  });
  handle("lyrics-card:manual-save-create", manualSaveHandlers.create);
  handle("lyrics-card:manual-save-update", manualSaveHandlers.update);

  handle("lyrics-card:import-history-remove", (_event, recordId) => trackImportHistoryMutation(
    () => importHistoryStore.remove(recordId)
  ));

  handle("lyrics-card:import-history-clear", () => trackImportHistoryMutation(
    () => importHistoryStore.clear()
  ));

  handle("lyrics-card:import-history-replay", async (_event, recordId) => {
    const record = await importHistoryStore.get(recordId);
    if (!record) return { ok: false, code: "not_found" };
    return createImportHistoryReplayPayload(record);
  });

  handle("lyrics-card:import-history-relocate", async (event, recordId) => {
    const record = await importHistoryStore.get(recordId);
    if (!record || (record.kind !== "local-audio" && record.kind !== "manual-cover")) {
      return { ok: false, code: "not_found" };
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: record.kind === "local-audio"
        ? [{ name: "Audio", extensions: ["mp3", "flac"] }]
        : [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, code: "cancelled" };
    const filePath = result.filePaths[0];
    const prepared = await readValidatedImportFile(record.kind, filePath);
    if (!prepared.ok) return { ...prepared, canRelocate: true };

    pruneImportHistoryRelocations();
    const relocationToken = crypto.randomUUID();
    // Keep relocation provisional until the renderer successfully parses and commits the document.
    importHistoryRelocations.set(relocationToken, {
      senderId: event.sender.id,
      recordId: record.id,
      expiresAt: Date.now() + IMPORT_FILE_REGISTRATION_TTL_MS,
      file: {
        path: prepared.path,
        fileName: path.basename(prepared.path),
        size: prepared.size,
        mtimeMs: prepared.mtimeMs
      }
    });
    const replay = await createImportHistoryReplayPayload(record, prepared);
    return replay.ok ? { ...replay, relocationToken } : replay;
  });

  handle("lyrics-card:import-history-replay-commit", (event, recordId, relocationToken) => trackImportHistoryMutation(async () => {
    try {
      // Only this post-renderer-commit step may persist a replacement path and refresh recency.
      const file = relocationToken === undefined
        ? undefined
        : takeImportHistoryRelocation(event.sender.id, recordId, relocationToken);
      if (relocationToken !== undefined && !file) {
        return { ok: false, code: "file_reference_expired" };
      }
      const committed = await importHistoryStore.commitReplay(recordId, {
          limit: await readImportHistoryLimit(),
          file
        });
      return committed ? { ok: true } : { ok: false, code: "not_found" };
    } catch (error) {
      console.error("[import-history] unable to commit replay", error instanceof Error ? error.message : "unknown error");
      return { ok: false, code: importHistoryErrorCode(error) };
    }
  }));

  handle("lyrics-card:ai-settings-load", async () => {
    const settings = await readAISettings();
    return toAISettingsSummary(settings);
  });

  handle("lyrics-card:ai-settings-save", async (_event, input) => {
    const current = await readAISettings();
    const normalized = normalizeAISettings(input);
    let encryptedApiKey = current.encryptedApiKey || "";
    const nextApiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";

    if (nextApiKey) {
      // Never persist plaintext credentials; unsupported or plaintext-only OS backends are rejected below.
      ensureSecureStorageAvailable();
      encryptedApiKey = safeStorage.encryptString(nextApiKey).toString("base64");
    }

    const stored = { ...normalized, encryptedApiKey };
    await writeAISettings(stored);
    return toAISettingsSummary(stored);
  });

  handle("lyrics-card:ai-settings-api-key-clear", async () => {
    const current = await readAISettings();
    const stored = { ...normalizeAISettings(current), encryptedApiKey: "" };
    await writeAISettings(stored);
    return toAISettingsSummary(stored);
  });

  handle("lyrics-card:ai-translate", async (event, requestId, request) => {
    if (!isValidAIRequestId(requestId) || typeof request?.prompt !== "string" || !request.prompt.trim()) {
      throw createAIError("invalid_request");
    }

    const sender = event.sender;
    // Registry ownership ties cancellation and streamed output to this exact renderer and request generation.
    const controller = aiTranslationRequests.begin(sender, requestId);

    try {
      const settings = await readAISettings();
      if (controller.signal.aborted) throw controller.signal.reason;
      const apiKey = decryptStoredApiKey(settings.encryptedApiKey);
      validateAISettings(settings, apiKey);
      return await streamAITranslationInMain({
        settings,
        apiKey,
        prompt: request.prompt,
        reasoning: Boolean(request.reasoning),
        signal: controller.signal,
        // Each callback rechecks ownership so replaced, cancelled, or destroyed senders receive no stale chunks.
        onStatus: (phase) => {
          if (aiTranslationRequests.isActive(sender, requestId, controller)) {
            sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "status", phase });
          }
        },
        onReasoningDelta: (delta) => {
          if (aiTranslationRequests.isActive(sender, requestId, controller)) {
            sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "reasoning", delta });
          }
        },
        onDelta: (delta) => {
          if (aiTranslationRequests.isActive(sender, requestId, controller)) {
            sender.send("lyrics-card:ai-translate-chunk", { requestId, kind: "content", delta });
          }
        }
      });
    } finally {
      aiTranslationRequests.finish(sender, requestId, controller);
    }
  });

  handle("lyrics-card:ai-translate-cancel", (event, requestId) => {
    if (!isValidAIRequestId(requestId)) return { cancelled: false, active: false };
    return aiTranslationRequests.cancel(event.sender, requestId);
  });
}

function trackImportHistoryMutation(operation) {
  // Preference reads occur inside this chain, preserving order across create, update, clear, trim, and remove.
  const pending = importHistoryMutationQueue.then(operation, operation);
  importHistoryMutationQueue = pending.then(() => undefined, () => undefined);
  return trackImportHistoryPromise(pending);
}

function trackImportHistoryPromise(pending) {
  importHistoryOperations.add(pending);
  void pending
    .finally(() => importHistoryOperations.delete(pending))
    .catch(() => undefined);
  return pending;
}

async function flushImportHistoryOperations() {
  // Loop because a settling operation may expose additional tracked work before shutdown completes.
  while (importHistoryOperations.size > 0) {
    await Promise.allSettled([...importHistoryOperations]);
  }
  await importHistoryMutationQueue;
  await importHistoryStore.flush();
}

const IMPORT_HISTORY_DOMAIN_ERROR_CODES = new Set([
  "corrupt_backup_failed",
  "history_confirmation_stale",
  "history_migration_failed",
  "invalid_file",
  "invalid_kind",
  "invalid_record",
  "invalid_snapshot",
  "not_found"
]);

function importHistoryErrorCode(error) {
  return IMPORT_HISTORY_DOMAIN_ERROR_CODES.has(error?.code)
    ? error.code
    : "history_write_failed";
}

function pruneImportFileRegistrations() {
  const now = Date.now();
  for (const [token, registration] of importFileRegistrations) {
    if (registration.expiresAt <= now) importFileRegistrations.delete(token);
  }
}

function pruneImportHistoryRelocations() {
  const now = Date.now();
  for (const [token, relocation] of importHistoryRelocations) {
    if (relocation.expiresAt <= now) importHistoryRelocations.delete(token);
  }
}

function takeImportFileRegistration(senderId, token, kind) {
  pruneImportFileRegistrations();
  if (typeof token !== "string") return null;
  const registration = importFileRegistrations.get(token);
  if (!registration || registration.senderId !== senderId || registration.kind !== kind) return null;
  // Delete before returning so even a later mutation failure cannot reuse the capability.
  importFileRegistrations.delete(token);
  return {
    path: registration.path,
    fileName: registration.fileName,
    size: registration.size,
    mtimeMs: registration.mtimeMs
  };
}

function takeImportHistoryRelocation(senderId, recordId, token) {
  pruneImportHistoryRelocations();
  if (typeof token !== "string" || typeof recordId !== "string") return null;
  const relocation = importHistoryRelocations.get(token);
  if (!relocation || relocation.senderId !== senderId || relocation.recordId !== recordId) return null;
  // Relocation tokens are bound to both sender and record and are consumed exactly once.
  importHistoryRelocations.delete(token);
  return relocation.file;
}

async function readImportHistoryLimit() {
  const preferences = await readAppPreferences();
  return normalizeImportHistoryLimit(preferences?.userSettings?.importHistoryLimit);
}

async function createImportHistoryReplayPayload(record, preparedFile) {
  if (record.kind === "link") {
    return {
      ok: true,
      kind: "link",
      record: toPublicImportHistoryRecord(record),
      url: record.source.inputUrl || record.source.normalizedUrl || record.source.finalUrl
    };
  }
  if (record.kind === "search") {
    return {
      ok: true,
      kind: "search",
      record: toPublicImportHistoryRecord(record),
      query: record.source.query,
      platform: record.source.platform,
      songId: record.source.songId,
      pageUrl: record.source.pageUrl || ""
    };
  }
  if (record.kind === "manual-save") {
    return {
      ok: true,
      kind: "manual-save",
      record: toPublicImportHistoryRecord(record),
      snapshot: record.snapshot
    };
  }

  try {
    const validated = preparedFile ?? await readValidatedImportFile(record.kind, record.source.path);
    if (!validated.ok) return { ok: false, code: validated.code, canRelocate: true };
    const changed = validated.size !== record.source.size || Math.abs(validated.mtimeMs - record.source.mtimeMs) > 1;
    const file = {
      // Bytes are returned for this replay only; history persists metadata and path, never file contents.
      bytes: validated.bytes,
      fileName: path.basename(validated.path),
      size: validated.size,
      mtimeMs: validated.mtimeMs,
      mimeType: mimeTypeForHistoryFile(validated.extension),
      changed
    };
    if (record.kind === "manual-cover") {
      return {
        ok: true,
        kind: "manual-cover",
        record: toPublicImportHistoryRecord(record),
        file,
        snapshot: record.snapshot
      };
    }
    return {
      ok: true,
      kind: "local-audio",
      record: toPublicImportHistoryRecord(record),
      file
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.code === "ENOENT" ? "file_missing" : "file_invalid",
      canRelocate: true
    };
  }
}

function mimeTypeForHistoryFile(extension) {
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".flac") return "audio/flac";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
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
  try {
    const current = normalizeStoredPreferences(JSON.parse(await fs.readFile(getAppPreferencesPath(), "utf8")));
    // A delayed writer must not overwrite a newer revision already present on disk.
    if (current && (
      current.revision > preferences.revision ||
      (current.revision === preferences.revision && current.updatedAt > preferences.updatedAt)
    )) {
      return current;
    }
  } catch {
    // Missing, corrupt, or legacy files are replaced atomically below.
  }
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const target = getAppPreferencesPath();
  const temporary = `${target}.tmp`;
  // Publish complete preference documents atomically and keep their permissions user-only.
  await fs.writeFile(temporary, JSON.stringify(preferences, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, target);
  await fs.chmod(getAppPreferencesPath(), 0o600).catch(() => undefined);
  return preferences;
}

function requestRendererClose() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return false;
  mainWindow.webContents.send("lyrics-card:window-close-requested");
  return true;
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
  const promptLibrary = normalizePromptLibrary(input?.promptLibrary);
  const requestedDefault = typeof input?.defaultStyle === "string" ? input.defaultStyle : "";
  const defaultBuiltInAvailable = TRANSLATION_STYLES.has(requestedDefault)
    && (requestedDefault === "recommended" || !promptLibrary.hiddenStyleIds.includes(requestedDefault));
  const defaultCustomAvailable = promptLibrary.customPresets.some((preset) => preset.id === requestedDefault);
  return {
    baseUrl: typeof input?.baseUrl === "string" && input.baseUrl.trim()
      ? input.baseUrl.trim()
      : DEFAULT_AI_SETTINGS.baseUrl,
    model: typeof input?.model === "string" ? input.model.trim() : "",
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : DEFAULT_AI_SETTINGS.temperature,
    defaultStyle: defaultBuiltInAvailable || defaultCustomAvailable ? requestedDefault : DEFAULT_AI_SETTINGS.defaultStyle,
    reasoningEnabled: Boolean(input?.reasoningEnabled),
    promptLibrary
  };
}

function toAISettingsSummary(settings) {
  return {
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    defaultStyle: settings.defaultStyle,
    reasoningEnabled: settings.reasoningEnabled,
    promptLibrary: settings.promptLibrary,
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
    throw createAIError("api_key_read_failed");
  }
}

function ensureSecureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw createAIError("secure_storage_unavailable");
  }
  if (
    process.platform === "linux"
    && typeof safeStorage.getSelectedStorageBackend === "function"
    && safeStorage.getSelectedStorageBackend() === "basic_text"
  ) {
    // Electron's Linux basic_text backend is obfuscation, not acceptable credential encryption.
    throw createAIError("secure_storage_unavailable");
  }
}

function validateAISettings(settings, apiKey) {
  if (!apiKey.trim()) {
    throw createAIError("missing_api_key");
  }
  if (!settings.model.trim()) {
    throw createAIError("missing_model");
  }
  if (!settings.baseUrl?.trim()) throw createAIError("missing_base_url");
  try {
    resolveProviderChatCompletionsUrl(settings.baseUrl);
  } catch {
    throw createAIError("invalid_base_url");
  }
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
      throw createAIError("cancelled");
    }
    throw createAIError("network");
  }

  if (!response.ok) {
    throw createAIError("provider_error", await readNormalizedProviderError(response));
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
      throw createAIError("empty_response");
    }
    onStatus("translating");
    onDelta(content);
    return content;
  }

  if (!response.body) {
    throw createAIError("empty_stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // Retain the incomplete tail because both UTF-8 code points and SSE events may span chunks.
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
    throw createAIError("empty_response");
  }
  return receivedContent;
}

function isValidAIRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
}

function createAIError(code, diagnostic) {
  return new Error(`AI_ERROR:${code}${diagnostic ? `:${String(diagnostic).slice(0, 500)}` : ""}`);
}
