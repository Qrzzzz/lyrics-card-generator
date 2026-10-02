import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export function enforceBudget(name, bytes, limit) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit) {
    throw new Error(`${name}: ${bytes} bytes exceeds budget ${limit}. Review the resource change and its budget rationale.`);
  }
  return { bytes, limit, remaining: limit - bytes };
}

export async function treeBytes(root) {
  const info = await lstat(root);
  if (info.isSymbolicLink()) throw new Error(`Distribution must not contain symlinks: ${root}`);
  if (info.isFile()) return info.size;
  const entries = await readdir(root);
  const sizes = await Promise.all(entries.map((entry) => treeBytes(path.join(root, entry))));
  return sizes.reduce((sum, bytes) => sum + bytes, 0);
}

export async function checkDistributionResources(root) {
  const policy = JSON.parse(await readFile(new URL("../../security/distribution-budgets.json", import.meta.url), "utf8"));
  const report = {};
  for (const [name, limit] of Object.entries(policy.source)) {
    report[name] = enforceBudget(name, await treeBytes(path.join(root, name)), limit);
  }
  return report;
}
