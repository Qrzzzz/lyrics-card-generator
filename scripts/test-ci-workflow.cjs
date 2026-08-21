const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const interactionTest = readFileSync("scripts/test-desktop-settings-interactions.mjs", "utf8");

// Assert workflow intent as source contracts so renamed or reordered CI steps do
// not silently weaken the packaged regression gate.
assert.match(workflow, /^\s{2}desktop-packaged-regression:/m, "the Windows job describes the full packaged regression scope");
assert.doesNotMatch(workflow, /^\s{2}desktop-final-artifact-smoke:/m, "the final-artifact command is not misrepresented as the whole job");
assert.ok(
  workflow.indexOf("Run packaged desktop interaction regression") < workflow.indexOf("Run Setup and portable final-artifact smoke"),
  "interaction and final-artifact checks remain distinct steps"
);
assert.match(
  workflow,
  /Run Setup and portable final-artifact smoke[\s\S]+always\(\) && steps\.desktop_build\.outcome == 'success'/,
  "final artifact smoke still runs when an earlier interaction assertion fails"
);
assert.match(workflow, /Run opt-in desktop visual and frame-timing diagnostics[\s\S]+continue-on-error: true/, "runner-sensitive diagnostics are explicitly non-blocking");
assert.match(workflow, /playwright-report\/desktop-final-artifacts\/\*\*/, "final-artifact failure evidence is retained");
assert.match(workflow, /Enforce production dependency advisory policy[\s\S]+npm run dependency-audit:gate/, "CI blocks unapproved production high and critical advisories");
assert.match(workflow, /Verify font license distribution contracts[\s\S]+npm run font-license:test/, "CI verifies Source Han license distribution");
const packagedAssets = workflow.indexOf("npm run desktop:packaged-assets-test");
assert.ok(
  packagedAssets >= 0 && packagedAssets < workflow.indexOf("Run packaged desktop interaction regression"),
  "staged and packaged font license assets are verified before desktop interactions"
);
assert.equal(
  packageJson.scripts["desktop:visual-diagnostic"],
  "node scripts/test-desktop-settings-interactions.mjs --visual-diagnostics",
  "visual diagnostics have an explicit opt-in command"
);
assert.match(interactionTest, /const runVisualDiagnostics = process\.argv\.includes\("--visual-diagnostics"\)/, "desktop test parses the diagnostic opt-in");
assert.match(interactionTest, /if \(runVisualDiagnostics\) await assertTitlebarScrollPerformance\(\)/, "frame timing is excluded from the deterministic gate");
assert.equal(
  (interactionTest.match(/if \(runVisualDiagnostics\) await analyzeTitlebarVisualEffect\(/g) || []).length,
  4,
  "all four pixel-comparison themes are excluded from the deterministic gate"
);

console.log("CI workflow separation contract tests passed");
