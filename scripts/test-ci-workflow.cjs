const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const benchmarkWorkflow = readFileSync(".github/workflows/background-composition-benchmark.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const interactionTest = readFileSync("scripts/test-desktop-settings-interactions.mjs", "utf8");
const backgroundCompositionBenchmark = readFileSync("tests/web-lite/web-lite.smoke.spec.ts", "utf8");

// Assert workflow intent as source contracts so renamed or reordered CI steps do
// not silently weaken the packaged regression gate.
assert.match(workflow, /^\s{2}push:/m, "CI retains its continuous main-push trigger");
assert.match(workflow, /^\s{2}pull_request:/m, "CI retains its continuous pull-request trigger");
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

const renderBoundaryJobStart = workflow.indexOf("\n  render-boundary-regression:");
const renderBoundaryJobEnd = workflow.indexOf("\n  web-lite-smoke:", renderBoundaryJobStart);
assert.ok(renderBoundaryJobStart >= 0 && renderBoundaryJobEnd > renderBoundaryJobStart, "CI has an independent render-boundary job");
const renderBoundaryJob = workflow.slice(renderBoundaryJobStart, renderBoundaryJobEnd);
assert.match(renderBoundaryJob, /timeout-minutes: 25/, "the deterministic browser job has a bounded timeout");
assert.match(renderBoundaryJob, /npm run render-boundaries:test/, "CI runs the production render-boundary command");
assert.match(renderBoundaryJob, /Upload render-boundary diagnostics[\s\S]+if: always\(\)/, "render-boundary evidence survives failures");
assert.match(renderBoundaryJob, /test-results\/render-boundaries\/\*\*/, "render-boundary traces and screenshots are retained");
assert.match(renderBoundaryJob, /artifacts\/render-boundaries\/command\.log/, "render-boundary build and test output is retained");
assert.doesNotMatch(renderBoundaryJob, /continue-on-error:/, "render-boundary failures remain blocking");
assert.match(
  packageJson.scripts["render-boundaries:test"],
  /^next build && node scripts\/prepare-render-boundary-server\.mjs && node scripts\/run-render-boundary-tests\.mjs$/,
  "render-boundary CI exercises the production Next.js build and standalone server"
);

assert.match(benchmarkWorkflow, /^\s{2}schedule:/m, "the heavy benchmark has a scheduled trigger");
assert.match(benchmarkWorkflow, /^\s{2}workflow_dispatch:/m, "the heavy benchmark can be run on demand");
assert.match(benchmarkWorkflow, /cron: "17 3 \* \* 1"/, "the heavy benchmark runs weekly at a stable offset");
assert.match(benchmarkWorkflow, /timeout-minutes: 30/, "the scheduled benchmark job has a bounded timeout");
assert.match(benchmarkWorkflow, /RUN_BACKGROUND_COMPOSITION_BENCHMARK: "1"/, "the opt-in large-canvas case is enabled");
assert.match(benchmarkWorkflow, /BACKGROUND_COMPOSITION_MAX_EXPORT_MS: "60000"/, "the export duration threshold is explicit");
assert.match(benchmarkWorkflow, /BACKGROUND_COMPOSITION_MIN_LOGICAL_HEIGHT: "3000"/, "the large-canvas threshold is explicit");
assert.match(benchmarkWorkflow, /BACKGROUND_COMPOSITION_TEST_TIMEOUT_MS: "180000"/, "the browser test timeout is explicit");
const productionBuild = benchmarkWorkflow.indexOf("npm run web-lite:build");
const benchmarkCommand = benchmarkWorkflow.indexOf("npm run background-composition:benchmark");
assert.ok(productionBuild >= 0 && productionBuild < benchmarkCommand, "the benchmark uses the production Web Lite build path");
assert.match(benchmarkWorkflow, /Upload benchmark metrics and diagnostics[\s\S]+if: always\(\)/, "benchmark evidence survives failures");
assert.match(benchmarkWorkflow, /artifacts\/background-composition\/\*\*/, "benchmark metrics, image, and command logs are retained");
assert.match(benchmarkWorkflow, /test-results\/web-lite\/\*\*/, "benchmark traces and screenshots are retained");
assert.doesNotMatch(benchmarkWorkflow, /continue-on-error:/, "benchmark failures remain blocking");
assert.doesNotMatch(workflow, /npm run background-composition:benchmark/, "the heavy benchmark stays out of continuous fast feedback");
assert.match(
  packageJson.scripts["background-composition:benchmark"],
  /RUN_BACKGROUND_COMPOSITION_BENCHMARK=1[\s\S]+@background-composition-benchmark/,
  "the scheduled command cannot silently skip the opt-in benchmark"
);
for (const variable of [
  "BACKGROUND_COMPOSITION_MAX_EXPORT_MS",
  "BACKGROUND_COMPOSITION_MIN_LOGICAL_HEIGHT",
  "BACKGROUND_COMPOSITION_TEST_TIMEOUT_MS",
  "BACKGROUND_COMPOSITION_BENCHMARK_OUTPUT_DIR"
]) {
  assert.match(backgroundCompositionBenchmark, new RegExp(variable), `${variable} remains connected to the browser benchmark`);
}

console.log("CI and scheduled render regression workflow contract tests passed");
