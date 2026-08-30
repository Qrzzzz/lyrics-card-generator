const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
const benchmarkWorkflow = readFileSync(".github/workflows/background-composition-benchmark.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const interactionTest = readFileSync("scripts/test-desktop-settings-interactions.mjs", "utf8");
const backgroundCompositionBenchmark = readFileSync("tests/web-lite/web-lite.smoke.spec.ts", "utf8");
const crossBrowserConfig = readFileSync("playwright.web-lite-cross-browser.config.ts", "utf8");
const crossBrowserSmoke = readFileSync("tests/web-lite-cross-browser/web-lite.cross-browser.smoke.spec.ts", "utf8");
const browserSupport = readFileSync("docs/web-lite-browser-support.md", "utf8");
const releaseSourcePolicy = JSON.parse(readFileSync("security/release-source-policy.json", "utf8"));

// Assert workflow intent as source contracts so renamed or reordered CI steps do
// not silently weaken the packaged regression gate.
assert.match(workflow, /^\s{2}push:/m, "CI retains its continuous main-push trigger");
assert.match(workflow, /^\s{2}pull_request:/m, "CI retains its continuous pull-request trigger");
assert.match(workflow, /^\s{2}desktop-packaged-regression:/m, "the Windows job describes the full packaged regression scope");
assert.doesNotMatch(workflow, /^\s{2}desktop-final-artifact-smoke:/m, "the final-artifact command is not misrepresented as the whole job");
for (const checkName of ["verify", "render-boundary-regression", "web-lite-smoke", "security/locale/a11y gates", "desktop-packaged-regression"]) {
  assert.match(workflow, new RegExp(`name: ${checkName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${checkName} has a stable GitHub check name`);
}
assert.match(
  workflow,
  /name: web-lite-cross-browser-smoke \(\$\{\{ matrix\.browser \}\}\)/,
  "Firefox and WebKit checks have stable matrix-qualified names"
);
assert.match(
  workflow,
  /desktop-packaged-regression:[\s\S]+if: github\.event_name == 'push' \|\| github\.event_name == 'pull_request'/,
  "packaged desktop validation runs on the final main-push SHA as well as the PR"
);
assert.deepEqual(
  releaseSourcePolicy.requiredChecks,
  [
    "verify",
    "render-boundary-regression",
    "web-lite-smoke",
    "web-lite-cross-browser-smoke (firefox)",
    "web-lite-cross-browser-smoke (webkit)",
    "security/locale/a11y gates",
    "desktop-packaged-regression"
  ],
  "release authorization consumes every independent release-blocking CI check"
);
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
assert.match(
  workflow,
  /Electron runtime risk-boundary coverage thresholds[\s\S]+npm run electron-runtime:coverage/,
  "CI measures the high-risk Electron runtime in a dedicated blocking gate"
);
assert.equal(
  (workflow.match(/npm run electron-runtime:coverage/g) || []).length,
  1,
  "CI executes the Electron runtime coverage suite once"
);
for (const scriptName of ["stability:test", "core:test", "startup-assets:test"]) {
  assert.doesNotMatch(
    packageJson.scripts[scriptName],
    /test-electron-(?:ai-request-lifecycle|security-contract|packaged-server-startup|local-server-origin)|test-import-history\.cjs/,
    `${scriptName} leaves measured Electron runtime execution to its coverage gate`
  );
}
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

const chromiumJobStart = workflow.indexOf("\n  web-lite-smoke:");
const crossBrowserJobStart = workflow.indexOf("\n  web-lite-cross-browser-smoke:", chromiumJobStart);
const crossBrowserJobEnd = workflow.indexOf("\n  security-locale-a11y-gates:", crossBrowserJobStart);
assert.ok(
  chromiumJobStart >= 0 && crossBrowserJobStart > chromiumJobStart && crossBrowserJobEnd > crossBrowserJobStart,
  "CI keeps the full Chromium and minimal cross-browser jobs separate"
);
const chromiumJob = workflow.slice(chromiumJobStart, crossBrowserJobStart);
const crossBrowserJob = workflow.slice(crossBrowserJobStart, crossBrowserJobEnd);
assert.match(chromiumJob, /npx playwright install --with-deps chromium/, "the existing full Web Lite job installs Chromium");
assert.match(chromiumJob, /npm run web-lite:smoke/, "the existing full Chromium Web Lite suite remains continuous");
assert.doesNotMatch(chromiumJob, /firefox|webkit/i, "the full suite is not tripled across browser engines");
assert.match(crossBrowserJob, /timeout-minutes: 15/, "the cross-browser job has a bounded timeout");
assert.match(crossBrowserJob, /fail-fast: false/, "one browser failure does not suppress the other browser result");
assert.match(crossBrowserJob, /browser:\r?\n\s+- firefox\r?\n\s+- webkit/, "Firefox and WebKit are the exact compatibility matrix");
assert.match(crossBrowserJob, /npx playwright install --with-deps \$\{\{ matrix\.browser \}\}/, "each matrix leg installs only its browser");
const artifactCheck = crossBrowserJob.indexOf("npm run web-lite:check");
const artifactStage = crossBrowserJob.indexOf("npm run pages:prepare");
const browserCommand = crossBrowserJob.indexOf("npm run web-lite:cross-browser-smoke");
assert.ok(
  artifactCheck >= 0 && artifactCheck < artifactStage && artifactStage < browserCommand,
  "cross-browser smoke uses the verified production Pages artifact"
);
assert.match(crossBrowserJob, /WEB_LITE_BROWSER: \$\{\{ matrix\.browser \}\}/, "report directories bind to the browser matrix leg");
assert.match(crossBrowserJob, /Upload \$\{\{ matrix\.browser \}\} Web Lite diagnostics[\s\S]+if: always\(\)/, "per-browser evidence survives failures");
assert.match(crossBrowserJob, /playwright-report\/web-lite-cross-browser\/\$\{\{ matrix\.browser \}\}\/\*\*/, "per-browser HTML reports are retained");
assert.match(crossBrowserJob, /test-results\/web-lite-cross-browser\/\$\{\{ matrix\.browser \}\}\/\*\*/, "per-browser traces, screenshots, and video are retained");
assert.doesNotMatch(crossBrowserJob, /continue-on-error:/, "Firefox and WebKit failures remain release-blocking");
for (const action of ["actions/checkout", "actions/setup-node", "actions/upload-artifact"]) {
  assert.match(crossBrowserJob, new RegExp(`${action.replace("/", "\\/")}@[0-9a-f]{40}`), `${action} remains commit-pinned`);
}
assert.equal(
  packageJson.scripts["web-lite:cross-browser-smoke"],
  "playwright test --config=playwright.web-lite-cross-browser.config.ts",
  "the cross-browser subset has one explicit command"
);
assert.match(crossBrowserConfig, /\["firefox", "webkit"\]/, "the Playwright config defines only Firefox and WebKit");
assert.match(crossBrowserConfig, /trace: "retain-on-failure"/, "cross-browser traces survive failures");
assert.match(crossBrowserConfig, /video: "retain-on-failure"/, "cross-browser videos survive failures");
for (const criticalPath of [
  "web-lite-editor-surface",
  "Lyric Text",
  "lyric-card-preview",
  "SourceHanSansSC-Heavy.otf",
  "SourceHanSerifSC-Heavy.otf",
  "web-lite-local-cover-input",
  "complete-export-button",
  "waitForEvent(\"download\")"
]) {
  assert.ok(crossBrowserSmoke.includes(criticalPath), `cross-browser smoke retains ${criticalPath}`);
}
for (const supportedFamily of ["Google Chrome and Microsoft Edge", "Mozilla Firefox", "Apple Safari on macOS"]) {
  assert.ok(browserSupport.includes(supportedFamily), `browser support policy retains ${supportedFamily}`);
}
assert.match(browserSupport, /Playwright `1\.61\.1`/, "the policy binds automation to the locked Playwright version");
for (const lockedEngine of ["Chromium `149.0.7827.55`", "Firefox `151.0`", "WebKit `26.5`"]) {
  assert.ok(browserSupport.includes(lockedEngine), `browser support policy records ${lockedEngine}`);
}
assert.match(browserSupport, /Mobile browsers[\s\S]+best effort/, "the non-blocking mobile boundary is explicit");

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
