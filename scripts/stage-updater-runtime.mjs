import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDesktopRuntimeAuditInput } from "./desktop-runtime-dependency-policy.mjs";

export async function stageUpdaterRuntime(projectRoot, destination) {
  const rootPackage = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
  const rootLock = JSON.parse(await readFile(path.join(projectRoot, "package-lock.json"), "utf8"));
  const generated = createDesktopRuntimeAuditInput({ rootPackage, rootLock, policy: {
    schemaVersion: 1, exceptions: [], runtimeRoots: [{ name: "electron-updater", manifestSection: "dependencies" }]
  } });
  await mkdir(destination, { recursive: true });
  for (const entry of generated.inventory.closure) {
    const source = path.resolve(projectRoot, entry.lockPath);
    const target = path.resolve(destination, entry.lockPath);
    assert.ok(source.startsWith(`${projectRoot}${path.sep}node_modules${path.sep}`));
    assert.ok(target.startsWith(`${destination}${path.sep}node_modules${path.sep}`));
    const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
    assert.equal(manifest.version, entry.version, `${entry.name} differs from the lockfile`);
    await cp(source, target, { recursive: true, filter: (file) =>
      file === source || !path.relative(source, file).split(path.sep).includes("node_modules")
    });
  }
  await writeFile(path.join(destination, "package.json"), JSON.stringify(generated.packageJson, null, 2) + "\n");
  await writeFile(path.join(destination, "package-lock.json"), JSON.stringify(generated.packageLock, null, 2) + "\n");
  console.log(`Staged ${generated.inventory.closure.length} updater runtime packages from the audited lockfile.`);
}
