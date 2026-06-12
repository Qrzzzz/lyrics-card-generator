import { rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const projectRoot = process.cwd();
const nextCachePath = resolve(projectRoot, ".next");

if (basename(nextCachePath) !== ".next" || dirname(nextCachePath) !== projectRoot) {
  throw new Error(`Refusing to remove unexpected path: ${nextCachePath}`);
}

rmSync(nextCachePath, { recursive: true, force: true });
console.log(`Removed Next.js cache: ${nextCachePath}`);
