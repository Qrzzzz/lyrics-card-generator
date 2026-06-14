import { cp, mkdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");
const nextStaticDir = path.join(projectRoot, ".next", "static");
const publicDir = path.join(projectRoot, "public");
const outputRoot = path.join(projectRoot, "dist-desktop");
const serverOutputDir = path.join(outputRoot, "server");

function assertExists(targetPath, label) {
  if (!existsSync(targetPath)) {
    throw new Error(`${label} not found at ${targetPath}. Run npm run build before preparing Electron output.`);
  }
}

assertExists(standaloneDir, "Next standalone output");
assertExists(nextStaticDir, "Next static assets");
assertExists(publicDir, "Public assets");

await rm(serverOutputDir, { recursive: true, force: true });
await mkdir(serverOutputDir, { recursive: true });

await cp(standaloneDir, serverOutputDir, { recursive: true });
if (existsSync(path.join(serverOutputDir, "node_modules"))) {
  await rename(path.join(serverOutputDir, "node_modules"), path.join(serverOutputDir, "_node_modules"));
}
await cp(nextStaticDir, path.join(serverOutputDir, ".next", "static"), { recursive: true });
await cp(publicDir, path.join(serverOutputDir, "public"), { recursive: true });

console.log(`Prepared Electron Next server at ${path.relative(projectRoot, serverOutputDir)}`);
