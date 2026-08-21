import assert from "node:assert/strict";
import crypto from "node:crypto";
import { cp, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const packagedRoot = path.join(projectRoot, "release", "win-unpacked");
const sbomRoot = path.join(projectRoot, "dist-desktop", "sbom-runtime");
const packagedModules = path.join(packagedRoot, "resources", "server", "_node_modules");
const normalizedModules = path.join(sbomRoot, "resources", "server", "node_modules");
const copiedModules = path.join(sbomRoot, "resources", "server", "_node_modules");

await assertDirectory(packagedRoot, "packaged Windows runtime");
await assertDirectory(packagedModules, "packaged standalone dependency closure");
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
      manifestSha256: crypto.createHash("sha256").update(JSON.stringify(normalizedManifest.entries)).digest("hex")
    },
    null,
    2
  )
);

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
