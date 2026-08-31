import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");
const nextStaticDir = path.join(projectRoot, ".next", "static");
const publicDir = path.join(projectRoot, "public");
const outputRoot = path.join(projectRoot, "dist-desktop");
const appOutputDir = path.join(outputRoot, "app");
const serverOutputDir = path.join(outputRoot, "server");
const electronOutputDir = path.join(appOutputDir, "electron");
const desktopProductName = "Lyrics Card Generator";
const desktopAppId = "com.lyriccard.generator";
const serverResourceFilter = [
  "**/*",
  "!**/.next/cache/**",
  "!**/_node_modules/.cache/**",
  "!**/*.map",
  "!**/*.d.ts",
  "!**/*.md",
  "!**/*.markdown",
  "!**/test/**",
  "!**/tests/**",
  "!**/__tests__/**",
  "!**/example/**",
  "!**/examples/**",
  "!**/docs/**"
];

function assertExists(targetPath, label) {
  if (!existsSync(targetPath)) {
    throw new Error(`${label} not found at ${targetPath}. Run npm run build before preparing Electron output.`);
  }
}

assertExists(standaloneDir, "Next standalone output");
assertExists(nextStaticDir, "Next static assets");
assertExists(publicDir, "Public assets");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(serverOutputDir, { recursive: true });
await mkdir(electronOutputDir, { recursive: true });

await cp(standaloneDir, serverOutputDir, { recursive: true });
if (existsSync(path.join(serverOutputDir, "node_modules"))) {
  // Keep the standalone server dependency tree out of electron-builder's app
  // dependency traversal; the desktop launcher restores lookup through NODE_PATH.
  await rename(path.join(serverOutputDir, "node_modules"), path.join(serverOutputDir, "_node_modules"));
}
await cp(nextStaticDir, path.join(serverOutputDir, ".next", "static"), { recursive: true });
await cp(publicDir, path.join(serverOutputDir, "public"), { recursive: true });
await cp(path.join(projectRoot, "electron", "packaged-next-server.js"), path.join(serverOutputDir, "desktop-server-launcher.cjs"));
await cleanServerOutput();
await prepareMinimalElectronApp();

console.log(`Prepared Electron Next server at ${path.relative(projectRoot, serverOutputDir)}`);
console.log(`Prepared minimal Electron app at ${path.relative(projectRoot, appOutputDir)}`);

async function prepareMinimalElectronApp() {
  const rootPackage = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const electronVersion = await getElectronVersion(rootPackage);
  const localElectronDist = getLocalElectronDist();
  // Generate a packaging-only manifest so the shipped shell contains neither
  // development scripts nor the root project's full dependency graph.
  const desktopPackage = {
    name: rootPackage.name,
    version: rootPackage.version,
    private: true,
    main: "electron/main.js",
    productName: desktopProductName,
    build: {
      appId: desktopAppId,
      productName: desktopProductName,
      electronVersion,
      ...(localElectronDist ? { electronDist: localElectronDist } : {}),
      asar: true,
      npmRebuild: false,
      icon: "../../build/icon.ico",
      directories: {
        output: "../../release"
      },
      files: [
        "electron/main.js",
        "electron/clipboard-image.js",
        "electron/ai-stream.js",
        "electron/resource-budgets.json",
        "electron/ai-request-registry.js",
        "electron/ai-prompt-settings.js",
        "electron/ai-settings-store.js",
        "electron/background-images.js",
        "electron/font-directory-service.js",
        "electron/font-options.js",
        "electron/import-history.js",
        "electron/provider-response.js",
        "electron/preload.js",
        "electron/ipc-security.js",
        "electron/local-app-url.js",
        "electron/local-server-origin.js",
        "electron/manual-save-ipc.js",
        "electron/packaged-server-readiness.js",
        "electron/single-instance-ownership.js",
        "electron/startup-trace.js",
        "electron/startup-orchestration.js",
        "electron/url-policy.js",
        "electron/user-preferences.js",
        "package.json"
      ],
      extraResources: [
        {
          from: "../server",
          to: "server",
          filter: serverResourceFilter
        },
        {
          from: "../../build/icon.ico",
          to: "icon.ico"
        }
      ],
      win: {
        icon: "../../build/icon.ico",
        target: [
          {
            target: "nsis",
            arch: ["x64"]
          }
        ]
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        installerIcon: "../../build/icon.ico",
        uninstallerIcon: "../../build/icon.ico",
        artifactName: "Lyrics.Card.Generator.Setup.${version}.${ext}"
      }
    }
  };

  await cp(path.join(projectRoot, "electron", "main.js"), path.join(electronOutputDir, "main.js"));
  await cp(path.join(projectRoot, "electron", "clipboard-image.js"), path.join(electronOutputDir, "clipboard-image.js"));
  await cp(path.join(projectRoot, "electron", "ai-stream.js"), path.join(electronOutputDir, "ai-stream.js"));
  await cp(
    path.join(projectRoot, "electron", "resource-budgets.json"),
    path.join(electronOutputDir, "resource-budgets.json")
  );
  await cp(path.join(projectRoot, "electron", "ai-request-registry.js"), path.join(electronOutputDir, "ai-request-registry.js"));
  await cp(path.join(projectRoot, "electron", "ai-prompt-settings.js"), path.join(electronOutputDir, "ai-prompt-settings.js"));
  await cp(path.join(projectRoot, "electron", "ai-settings-store.js"), path.join(electronOutputDir, "ai-settings-store.js"));
  await cp(path.join(projectRoot, "electron", "background-images.js"), path.join(electronOutputDir, "background-images.js"));
  await cp(
    path.join(projectRoot, "electron", "font-directory-service.js"),
    path.join(electronOutputDir, "font-directory-service.js")
  );
  await cp(path.join(projectRoot, "electron", "font-options.js"), path.join(electronOutputDir, "font-options.js"));
  await cp(path.join(projectRoot, "electron", "import-history.js"), path.join(electronOutputDir, "import-history.js"));
  await cp(path.join(projectRoot, "electron", "provider-response.js"), path.join(electronOutputDir, "provider-response.js"));
  await cp(path.join(projectRoot, "electron", "preload.js"), path.join(electronOutputDir, "preload.js"));
  await cp(path.join(projectRoot, "electron", "ipc-security.js"), path.join(electronOutputDir, "ipc-security.js"));
  await cp(path.join(projectRoot, "electron", "local-app-url.js"), path.join(electronOutputDir, "local-app-url.js"));
  await cp(path.join(projectRoot, "electron", "local-server-origin.js"), path.join(electronOutputDir, "local-server-origin.js"));
  await cp(path.join(projectRoot, "electron", "manual-save-ipc.js"), path.join(electronOutputDir, "manual-save-ipc.js"));
  await cp(
    path.join(projectRoot, "electron", "packaged-server-readiness.js"),
    path.join(electronOutputDir, "packaged-server-readiness.js")
  );
  await cp(
    path.join(projectRoot, "electron", "single-instance-ownership.js"),
    path.join(electronOutputDir, "single-instance-ownership.js")
  );
  await cp(path.join(projectRoot, "electron", "startup-trace.js"), path.join(electronOutputDir, "startup-trace.js"));
  await cp(path.join(projectRoot, "electron", "startup-orchestration.js"), path.join(electronOutputDir, "startup-orchestration.js"));
  await cp(path.join(projectRoot, "electron", "url-policy.js"), path.join(electronOutputDir, "url-policy.js"));
  await cp(path.join(projectRoot, "electron", "user-preferences.js"), path.join(electronOutputDir, "user-preferences.js"));
  await writeFile(path.join(appOutputDir, "package.json"), `${JSON.stringify(desktopPackage, null, 2)}\n`);
}

async function getElectronVersion(rootPackage) {
  const installedPackagePath = path.join(projectRoot, "node_modules", "electron", "package.json");

  if (existsSync(installedPackagePath)) {
    const installedPackage = JSON.parse(await readFile(installedPackagePath, "utf8"));
    if (typeof installedPackage.version === "string" && installedPackage.version) {
      return installedPackage.version;
    }
  }

  const declaredVersion = rootPackage.devDependencies?.electron ?? rootPackage.dependencies?.electron;
  if (typeof declaredVersion === "string") {
    return declaredVersion.replace(/^[^\d]*/, "");
  }

  throw new Error("Unable to determine the Electron version for desktop packaging.");
}

function getLocalElectronDist() {
  const electronDist = path.join(projectRoot, "node_modules", "electron", "dist");
  const electronExecutable = process.platform === "win32" ? "electron.exe" : "electron";

  if (!existsSync(path.join(electronDist, electronExecutable))) {
    return "";
  }

  return path.relative(appOutputDir, electronDist).split(path.sep).join("/");
}

async function cleanServerOutput() {
  // Remove only artifacts excluded from runtime resolution. The standalone
  // dependency closure itself remains authoritative and is never re-derived here.
  const cleanupResults = [];

  cleanupResults.push(await removePath(path.join(serverOutputDir, ".next", "cache"), ".next cache"));
  cleanupResults.push(await removePath(path.join(serverOutputDir, "_node_modules", ".cache"), "dependency cache"));
  cleanupResults.push(
    await removeMatchingFiles(serverOutputDir, (filePath) => filePath.endsWith(".map"), "source maps")
  );
  cleanupResults.push(
    await removeMatchingFiles(serverOutputDir, (filePath) => filePath.endsWith(".d.ts"), "TypeScript declarations")
  );
  cleanupResults.push(
    await removeMatchingFiles(
      path.join(serverOutputDir, "_node_modules"),
      (filePath) => {
        const lowerPath = filePath.toLowerCase();
        const baseName = path.basename(lowerPath);
        return (
          baseName.endsWith(".md") ||
          baseName.endsWith(".markdown") ||
          lowerPath.includes(`${path.sep}test${path.sep}`) ||
          lowerPath.includes(`${path.sep}tests${path.sep}`) ||
          lowerPath.includes(`${path.sep}__tests__${path.sep}`) ||
          lowerPath.includes(`${path.sep}example${path.sep}`) ||
          lowerPath.includes(`${path.sep}examples${path.sep}`) ||
          lowerPath.includes(`${path.sep}docs${path.sep}`)
        );
      },
      "dependency docs, examples, and tests"
    )
  );

  const effectiveResults = cleanupResults.filter(Boolean);
  if (effectiveResults.length === 0) {
    console.log("Desktop server cleanup: no removable runtime-excluded files found.");
    return;
  }

  console.log("Desktop server cleanup:");
  for (const result of effectiveResults) {
    console.log(`- ${result.label}: removed ${result.count} item(s), saved ${formatBytes(result.bytes)}`);
  }
}

async function removePath(targetPath, label) {
  if (!existsSync(targetPath)) {
    return null;
  }

  const bytes = await getSize(targetPath);
  await rm(targetPath, { recursive: true, force: true });
  return { label, count: 1, bytes };
}

async function removeMatchingFiles(rootDir, predicate, label) {
  if (!existsSync(rootDir)) {
    return null;
  }

  const matches = [];
  await collectMatchingFiles(rootDir, predicate, matches);

  let bytes = 0;
  for (const filePath of matches) {
    bytes += await getSize(filePath);
    await rm(filePath, { force: true });
  }

  return matches.length > 0 ? { label, count: matches.length, bytes } : null;
}

async function collectMatchingFiles(targetPath, predicate, matches) {
  let info;

  try {
    info = await lstat(targetPath);
  } catch {
    return;
  }

  if (info.isSymbolicLink()) {
    // Do not cross dependency links while pruning or measuring the staged tree.
    return;
  }

  if (info.isFile()) {
    if (predicate(targetPath)) {
      matches.push(targetPath);
    }
    return;
  }

  if (!info.isDirectory()) {
    return;
  }

  const entries = await readdir(targetPath);
  for (const entry of entries) {
    await collectMatchingFiles(path.join(targetPath, entry), predicate, matches);
  }
}

async function getSize(targetPath) {
  let info;

  try {
    info = await lstat(targetPath);
  } catch {
    return 0;
  }

  if (info.isFile()) {
    return info.size;
  }

  if (!info.isDirectory() || info.isSymbolicLink()) {
    return 0;
  }

  let total = 0;
  const entries = await readdir(targetPath);
  for (const entry of entries) {
    total += await getSize(path.join(targetPath, entry));
  }
  return total;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}
