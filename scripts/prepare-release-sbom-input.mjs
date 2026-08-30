import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { cp, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { validateReleaseEvidence } from "./release-sbom-policy.mjs";

const projectRoot = process.cwd();
const packagedRoot = path.join(projectRoot, "release", "win-unpacked");
const sbomRoot = path.join(projectRoot, "dist-desktop", "sbom-runtime");
const packagedModules = path.join(packagedRoot, "resources", "server", "_node_modules");
const normalizedModules = path.join(sbomRoot, "resources", "server", "node_modules");
const copiedModules = path.join(sbomRoot, "resources", "server", "_node_modules");
const auditDirectory = path.join(projectRoot, "dist-desktop", "desktop-runtime-audit");
const inventory = JSON.parse(await readFile(path.join(auditDirectory, "runtime-inventory.json"), "utf8"));
const auditPackageText = await readFile(path.join(auditDirectory, "package.json"), "utf8");
const auditLockText = await readFile(path.join(auditDirectory, "package-lock.json"), "utf8");
const auditReportText = await readFile(path.join(auditDirectory, "npm-audit.json"), "utf8");

await assertDirectory(packagedRoot, "packaged Windows runtime");
await assertDirectory(packagedModules, "packaged standalone dependency closure");
validateReleaseEvidence({ inventory, auditPackageText, auditLockText, auditReportText });
await verifyRuntimeEvidence(inventory);
await rm(sbomRoot, { recursive: true, force: true });
await cp(packagedRoot, sbomRoot, { recursive: true });
await rename(copiedModules, normalizedModules);

const packagedManifest = await createManifest(packagedRoot, (relativePath) =>
  relativePath.replace(/^resources\/server\/_node_modules\//u, "resources/server/node_modules/")
);
const normalizedManifest = await createManifest(sbomRoot);
assert.deepEqual(
  normalizedManifest.entries,
  packagedManifest.entries,
  "SBOM input must be a byte-identical packaged runtime with only _node_modules normalized"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      files: normalizedManifest.entries.length,
      bytes: normalizedManifest.bytes,
      manifestSha256: crypto.createHash("sha256").update(JSON.stringify(normalizedManifest.entries)).digest("hex"),
      electron: inventory.desktopRuntime.version,
      productionRuntime: Object.fromEntries(
        inventory.productionRuntime.packages.map((entry) => [entry.name, entry.version])
      )
    },
    null,
    2
  )
);

async function verifyRuntimeEvidence(runtimeInventory) {
  const runtime = runtimeInventory.desktopRuntime;
  const packagedExecutable = path.join(projectRoot, ...runtime.packagedExecutable.relativePath.split("/"));
  assert.equal(await hashFile(packagedExecutable), runtime.packagedExecutable.sha256, "packaged Electron executable changed after runtime audit");
  const probe = spawnSync(packagedExecutable, ["-p", "process.versions.electron"], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    timeout: 90_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (probe.error) throw probe.error;
  assert.equal(probe.status, 0, `packaged Electron version probe failed: ${probe.stderr || probe.stdout}`);
  assert.equal(probe.stdout.trim(), runtime.version, "packaged Electron version changed after runtime audit");

  for (const artifact of runtime.finalArtifacts) {
    const artifactPath = path.join(projectRoot, "release", artifact.fileName);
    assert.equal(await hashFile(artifactPath), artifact.sha256, `${artifact.fileName} changed after final-artifact smoke`);
  }
  for (const packagedDependency of runtimeInventory.productionRuntime.packages) {
    const manifestPath = path.join(projectRoot, ...packagedDependency.relativeManifestPath.split("/"));
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assert.equal(manifest.name, packagedDependency.name, `${packagedDependency.name} packaged manifest identity changed`);
    assert.equal(manifest.version, packagedDependency.version, `${packagedDependency.name} packaged version changed`);
    assert.equal(
      crypto.createHash("sha256").update(manifestBytes).digest("hex"),
      packagedDependency.manifestSha256,
      `${packagedDependency.name} packaged manifest bytes changed`
    );
  }
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function assertDirectory(targetPath, label) {
  const info = await stat(targetPath).catch(() => null);
  assert.ok(info?.isDirectory(), `${label} is missing: ${targetPath}`);
}

async function createManifest(root, normalizePath = (relativePath) => relativePath) {
  const entries = [];
  await walk(root, "", entries, normalizePath);
  entries.sort((left, right) => left[0].localeCompare(right[0], "en"));
  return {
    entries,
    bytes: entries.reduce((total, entry) => total + entry[1], 0)
  };
}

async function walk(root, relativeDirectory, entries, normalizePath) {
  const directory = path.join(root, relativeDirectory);
  const children = await readdir(directory, { withFileTypes: true });
  for (const child of children) {
    const relativePath = path.join(relativeDirectory, child.name);
    if (child.isDirectory()) {
      await walk(root, relativePath, entries, normalizePath);
      continue;
    }
    assert.ok(child.isFile(), `Unexpected non-file SBOM input entry: ${relativePath}`);
    const bytes = await readFile(path.join(root, relativePath));
    entries.push([
      normalizePath(relativePath.split(path.sep).join("/")),
      bytes.length,
      crypto.createHash("sha256").update(bytes).digest("hex")
    ]);
  }
}
