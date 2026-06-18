const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const HOST = "127.0.0.1";
const APP_ID = "com.lyriccard.generator";
const START_TIMEOUT_MS = 45000;

let mainWindow = null;
let nextServerProcess = null;
let localAppUrl = null;

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
    backgroundColor: "#111216",
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
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
  ipcMain.handle("lyrics-card:list-system-fonts", async () => {
    if (process.platform !== "win32") {
      return [];
    }

    return listWindowsFontFamilies();
  });

  ipcMain.handle("lyrics-card:pick-font", async () => {
    const fonts = process.platform === "win32" ? await listWindowsFontFamilies() : [];
    return fonts[0] || null;
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
}

async function listWindowsFontFamilies() {
  const script = [
    "$paths = @(",
    "  'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',",
    "  'HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'",
    ");",
    "$families = foreach ($path in $paths) {",
    "  if (Test-Path $path) {",
    "    $item = Get-ItemProperty -Path $path;",
    "    $item.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {",
    "      $_.Name -replace '\\s*\\((TrueType|OpenType|Type 1|Raster|All res)\\)\\s*$', '' -replace '\\s*&\\s*', ', '",
    "    }",
    "  }",
    "};",
    "$families | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Sort-Object -Unique | ConvertTo-Json -Compress"
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
    return normalizeFontFamilies(Array.isArray(parsed) ? parsed : [parsed]);
  } catch (error) {
    console.error("[fonts] unable to list Windows fonts", error);
    return ["Arial", "Calibri", "Microsoft YaHei", "Microsoft JhengHei", "Segoe UI", "SimSun", "SimHei"];
  }
}

function normalizeFontFamilies(values) {
  const ignored = new Set(["", "desktop.ini"]);
  return [...new Set(values.map((value) => String(value).trim()).filter((value) => !ignored.has(value.toLowerCase())))]
    .sort((left, right) => left.localeCompare(right));
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
