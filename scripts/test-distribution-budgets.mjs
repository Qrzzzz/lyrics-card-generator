import assert from "node:assert/strict";
import { enforceBudget, checkDistributionResources } from "./lib/distribution-budgets.mjs";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, writeFile, truncate, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

assert.equal(enforceBudget("fixture", 100, 100).remaining, 0);
assert.throws(() => enforceBudget("large dependency", 101, 100), /exceeds budget/);
assert.throws(() => enforceBudget("invalid measurement", NaN, 100), /exceeds budget/);
const report = await checkDistributionResources(fileURLToPath(new URL("../", import.meta.url)));
for (const [name, measurement] of Object.entries(report)) {
  assert.throws(() => enforceBudget(name, measurement.bytes + measurement.limit, measurement.limit), /exceeds budget/);
}
const fixture = await mkdtemp(path.join(tmpdir(), "lyrics-resource-budget-"));
try {
  await mkdir(path.join(fixture, "public", "fonts"), { recursive: true });
  const oversized = path.join(fixture, "public", "fonts", "oversized-fixture.otf");
  await writeFile(oversized, "");
  await truncate(oversized, report["public/fonts"].limit + 1);
  await assert.rejects(checkDistributionResources(fixture), /exceeds budget/, "an actual oversized resource fails the build owner's gate");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
console.log("Distribution budgets passed; oversized resource mutations rejected.");
