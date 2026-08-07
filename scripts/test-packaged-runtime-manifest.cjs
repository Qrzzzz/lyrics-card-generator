const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const projectRoot = path.resolve(__dirname, "..");
const stagedAppRoot = path.join(projectRoot, "dist-desktop", "app");
const stagedServerRoot = path.join(projectRoot, "dist-desktop", "server");
const packagedResourcesRoot = path.join(projectRoot, "release", "win-unpacked", "resources");
const packagedAsarPath = path.join(packagedResourcesRoot, "app.asar");
const packagedServerRoot = path.join(packagedResourcesRoot, "server");

for (const requiredPath of [stagedAppRoot, stagedServerRoot, packagedAsarPath, packagedServerRoot]) {
  assert.ok(fs.existsSync(requiredPath), `Required packaged runtime path is missing: ${requiredPath}`);
}

const asarPaths = new Set(
  asar.listPackage(packagedAsarPath).map((entry) => entry.replaceAll("\\", "/").replace(/^\//, ""))
);
const stagedElectronRoot = path.join(stagedAppRoot, "electron");
const stagedElectronFiles = listFiles(stagedElectronRoot).filter((entry) => entry.endsWith(".js"));

for (const relativePath of stagedElectronFiles) {
  const asarPath = `electron/${relativePath}`;
  assert.ok(asarPaths.has(asarPath), `ASAR is missing ${asarPath}`);
  const stagedBytes = fs.readFileSync(path.join(stagedElectronRoot, relativePath));
  const sourceBytes = fs.readFileSync(path.join(projectRoot, "electron", relativePath));
  const packagedBytes = asar.extractFile(packagedAsarPath, asarPath);
  assert.deepEqual(stagedBytes, sourceBytes, `${relativePath} changed while preparing the desktop app`);
  assert.deepEqual(packagedBytes, sourceBytes, `${relativePath} differs inside app.asar`);
}

const stagedPackage = JSON.parse(fs.readFileSync(path.join(stagedAppRoot, "package.json"), "utf8"));
const packagedPackage = JSON.parse(asar.extractFile(packagedAsarPath, "package.json").toString("utf8"));
for (const key of ["name", "version", "private", "main", "productName"]) {
  assert.deepEqual(packagedPackage[key], stagedPackage[key], `The packaged manifest changed ${key}`);
}
assert.deepEqual(
  Object.keys(packagedPackage).sort(),
  ["main", "name", "private", "productName", "version"],
  "The runtime ASAR manifest should contain only launch-critical metadata"
);

const launcherSource = fs.readFileSync(path.join(projectRoot, "electron", "packaged-next-server.js"));
const stagedLauncher = fs.readFileSync(path.join(stagedServerRoot, "desktop-server-launcher.cjs"));
const packagedLauncher = fs.readFileSync(path.join(packagedServerRoot, "desktop-server-launcher.cjs"));
assert.deepEqual(stagedLauncher, launcherSource, "The staged Next launcher differs from its source");
assert.deepEqual(packagedLauncher, launcherSource, "The packaged Next launcher differs from its source");

const stagedServerManifest = createManifest(stagedServerRoot);
const packagedServerManifest = createManifest(packagedServerRoot);
assert.deepEqual(packagedServerManifest.entries, stagedServerManifest.entries, "Packaged server resources differ from staging");

const sourceIcon = fs.readFileSync(path.join(projectRoot, "build", "icon.ico"));
const packagedIcon = fs.readFileSync(path.join(packagedResourcesRoot, "icon.ico"));
assert.deepEqual(packagedIcon, sourceIcon, "Packaged Windows icon differs from the source icon");

console.log(
  JSON.stringify(
    {
      ok: true,
      asarElectronFiles: stagedElectronFiles.length,
      serverFiles: stagedServerManifest.entries.length,
      serverBytes: stagedServerManifest.bytes,
      serverManifestSha256: sha256(Buffer.from(JSON.stringify(stagedServerManifest.entries))),
      launcherSha256: sha256(launcherSource),
      iconSha256: sha256(sourceIcon)
    },
    null,
    2
  )
);

function createManifest(root) {
  const entries = listFiles(root).map((relativePath) => {
    const bytes = fs.readFileSync(path.join(root, relativePath));
    return [relativePath, bytes.length, sha256(bytes)];
  });
  return {
    entries,
    bytes: entries.reduce((total, entry) => total + entry[1], 0)
  };
}

function listFiles(root) {
  const files = [];
  walk(root, "", files);
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function walk(root, relativeDirectory, files) {
  const directory = path.join(root, relativeDirectory);
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      walk(root, relativePath, files);
      continue;
    }
    assert.ok(entry.isFile(), `Unexpected non-file runtime entry: ${relativePath}`);
    files.push(relativePath.split(path.sep).join("/"));
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
