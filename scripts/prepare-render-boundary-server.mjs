import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await Promise.all([
  cp(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"), {
    recursive: true,
    force: true
  }),
  cp(path.join(projectRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"), {
    recursive: true,
    force: true
  })
]);
