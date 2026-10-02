import { readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// List-only entry point. Original acceptance evidence is never removed here.
const root = fileURLToPath(new URL("../output/", import.meta.url));
const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
  if (error.code === "ENOENT") return [];
  throw error;
});
for (const entry of entries) {
  const target = path.resolve(root, entry.name);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Output path escaped its root.");
  const info = await lstat(target);
  console.log(JSON.stringify({ path: target, kind: info.isSymbolicLink() ? "symlink-preserve" : info.isDirectory() ? "directory-review" : "file-review", modified: info.mtime.toISOString() }));
}
