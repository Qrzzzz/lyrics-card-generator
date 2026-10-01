import { mkdir, readFile, writeFile } from "node:fs/promises";
import { checkDistributionResources, enforceBudget, treeBytes } from "./lib/distribution-budgets.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const report = await checkDistributionResources(root);
if (process.argv.includes("--desktop-stage") || process.argv.includes("--packaged")) {
  const policy = JSON.parse(await readFile(new URL("../security/distribution-budgets.json", import.meta.url), "utf8"));
  for (const [name, limit] of Object.entries(policy.desktopStage)) {
    report[`desktop/${name}`] = enforceBudget(name, await treeBytes(path.join(root, "dist-desktop", name)), limit);
  }
  if (process.argv.includes("--packaged")) {
    report["desktop/packaged-runtime"] = enforceBudget("packaged-runtime", await treeBytes(path.join(root, "release", "win-unpacked")), policy.packagedRuntime);
  }
}
await mkdir(path.join(root, "output", "resource-budgets"), { recursive: true });
await writeFile(path.join(root, "output", "resource-budgets", "distribution.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
