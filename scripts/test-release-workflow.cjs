const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const verifier = readFileSync("scripts/verify-github-release.ps1", "utf8");
const sourceVerifier = readFileSync("scripts/verify-release-source.mjs", "utf8");
const releaseStateResolver = readFileSync("scripts/resolve-github-release.mjs", "utf8");
const powershellSyntaxTest = readFileSync("scripts/test-release-powershell-syntax.cjs", "utf8");
const sourcePolicy = JSON.parse(readFileSync("security/release-source-policy.json", "utf8"));
const sourcePolicyDocs = readFileSync("docs/release-source-policy.md", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const desktopRuntimePolicy = JSON.parse(readFileSync("security/desktop-runtime-audit.json", "utf8"));
const versionSpecificWorkflows = readdirSync(".github/workflows")
  .filter((name) => /^release-\d+\.\d+\.\d+\.yml$/.test(name));

assert.deepEqual(versionSpecificWorkflows, [], "one tag-driven release workflow replaces version-specific copies");
assert.match(workflow, /^concurrency:\s+group: release-/m, "release runs for one tag are serialized");
assert.match(workflow, /- "v\*\.\*\.\*"/, "stable and RC version tags enter the generic release workflow");
assert.match(workflow, /RELEASE_TAG: \$\{\{ inputs\.tag \|\| github\.ref_name \}\}/, "workflow_dispatch and tag pushes share the exact tag resolver input");
assert.match(workflow, /^permissions: \{\}$/m, "the workflow has no ambient write permission");
assert.match(
  workflow,
  /\^v\$escapedVersion\(\?:-rc\\\.\[0-9\]\+\)\?\$/,
  "the checked-out package version strictly validates the requested tag"
);
assert.match(workflow, /git rev-parse "\$tagRef\^\{commit\}"/, "annotated and lightweight tags are peeled to commits");
assert.equal(
  (workflow.match(/ref: refs\/tags\/\$\{\{ env\.RELEASE_TAG \}\}/g) || []).length,
  3,
  "authorization, build, and publication check out an explicit tag ref"
);
assert.equal(
  (workflow.match(/persist-credentials: false/g) || []).length,
  3,
  "checkout never leaves a repository write credential behind"
);
assert.match(workflow, /docs\/releases\/v\$version\.\$_\.md/, "all six release-note locales are derived from package.json");

const authorizeStart = workflow.indexOf("\n  authorize:");
const buildStart = workflow.indexOf("\n  build:", authorizeStart);
const publishStart = workflow.indexOf("\n  publish:", buildStart);
assert.ok(authorizeStart >= 0 && buildStart > authorizeStart && publishStart > buildStart, "release phases are split into authorize, build, and publish jobs");
const authorizeJob = workflow.slice(authorizeStart, buildStart);
const buildJob = workflow.slice(buildStart, publishStart);
const publishJob = workflow.slice(publishStart);

assert.match(authorizeJob, /actions: read/, "source authorization can inspect exact workflow runs");
assert.match(authorizeJob, /contents: read/, "source authorization can inspect refs and existing Releases");
assert.match(authorizeJob, /pull-requests: read/, "source authorization can inspect merge and review evidence");
assert.doesNotMatch(authorizeJob, /(?:contents|actions|pull-requests): write/, "source authorization cannot mutate repository state");
assert.match(authorizeJob, /Authorize reviewed main ancestry and exact CI[\s\S]+verify-release-source\.mjs/, "the read-only helper runs before release state resolution");
assert.ok(
  authorizeJob.indexOf("Authorize reviewed main ancestry and exact CI") < authorizeJob.indexOf("Resolve and verify existing release state"),
  "even an already-published no-op must pass source authorization first"
);
assert.match(authorizeJob, /ExpectedState published/, "an existing published release is verified before the no-op succeeds");
assert.match(authorizeJob, /resolve-github-release\.mjs[\s\S]+--github-output \$env:GITHUB_OUTPUT/, "the exact paginated state is passed between jobs");

assert.match(buildJob, /needs: authorize/, "asset construction cannot start before source authorization");
assert.match(buildJob, /if: needs\.authorize\.outputs\.published != 'true'/, "an already-published release skips rebuilding");
assert.match(buildJob, /contents: read/, "the build phase has read-only repository access");
assert.match(buildJob, /attestations: write[\s\S]+id-token: write/, "only the build phase can create provenance attestations");
assert.doesNotMatch(buildJob, /contents: write/, "the long-running build phase cannot mutate Releases");
assert.match(buildJob, /EXPECTED_RELEASE_SHA: \$\{\{ needs\.authorize\.outputs\.release_sha \}\}/, "the build checkout is pinned to the authorized SHA");
for (const command of ["web-lite:check", "font-license:test", "lint", "stability:test", "coverage", "electron-runtime:coverage", "core:test", "desktop:interaction-test", "build", "typecheck", "dependency-audit:gate", "dependency-audit:test", "desktop-runtime-audit:gate", "desktop-runtime-audit:test", "sbom:test"]) {
  assert.ok(!buildJob.includes(`npm run ${command}\n`) && !buildJob.includes(`npm run ${command}\r\n`), `release consumes exact-SHA CI evidence instead of repeating ${command}`);
}
assert.equal((buildJob.match(/run: npm run desktop:build/g) || []).length, 1, "release has one production desktop build");
assert.match(packageJson.scripts["desktop:build"], /npm run typecheck && npm run build && npm run desktop:prepare/, "release still typechecks and builds the actual artifact");
assert.match(readFileSync(".github/workflows/ci.yml", "utf8"), /npm run electron-runtime:coverage/, "required verify check owns measured runtime coverage");
assert.match(packageJson.scripts["desktop:build"], /electron-builder --publish never --projectDir dist-desktop\/app$/, "artifact construction cannot implicitly publish through electron-builder");
assert.match(buildJob, /REQUIRE_PUBLISHED_RELEASE_NOTES:\s*["']1["']/, "release quality gates reject candidate wording");
assert.match(buildJob, /Enforce production dependency advisory policy[\s\S]+npm run dependency-audit:check/, "release performs fresh production advisory checks without rerunning fixtures");
assert.match(buildJob, /Validate release-only policy[\s\S]+npx tsx scripts\/test-release-consistency\.ts/, "release checks publication wording without rerunning core");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
assert.match(ciWorkflow, /npm run sbom:test/, "required CI owns adversarial SPDX inventory fixtures");
assert.match(ciWorkflow, /npm run dependency-audit:gate/, "required CI owns audit fixtures and the current production audit");
assert.match(packageJson.scripts["dependency-audit:gate"], /npm run dependency-audit:test/, "the CI audit gate includes policy fixtures");
assert.match(packageJson.scripts["dependency-audit:test"], /npm run desktop-runtime-audit:test/, "CI also covers desktop audit fixtures");
const packagedAssets = buildJob.indexOf("npm run desktop:packaged-assets-test");
assert.ok(packagedAssets >= 0 && packagedAssets < buildJob.indexOf("npm run desktop:final-artifact-smoke"), "packaged assets including licenses are verified before final-byte smoke");
const finalArtifactSmoke = buildJob.indexOf("npm run desktop:final-artifact-smoke");
const normalizedAssets = buildJob.indexOf("Normalize release asset filenames");
const prepareDesktopRuntimeAudit = buildJob.indexOf("npm run desktop-runtime-audit:prepare");
const desktopRuntimeAudit = buildJob.indexOf("npm run desktop-runtime-audit:check");
const prepareSbom = buildJob.indexOf("npm run sbom:prepare");
const generateSbom = buildJob.indexOf("anchore/sbom-action@");
const finalizeSbom = buildJob.indexOf("npm run sbom:finalize");
const inspectSbom = buildJob.indexOf("npm run sbom:inspect");
assert.ok(finalArtifactSmoke >= 0 && finalArtifactSmoke < normalizedAssets, "final Setup bytes are smoked before normalization");
assert.ok(normalizedAssets < prepareDesktopRuntimeAudit && prepareDesktopRuntimeAudit < desktopRuntimeAudit, "desktop runtime audit freshly derives the normalized downloadable asset closure");
const runtimeAuditStep = buildJob.slice(buildJob.indexOf("- name: Audit packaged Electron runtime dependency closure"), buildJob.indexOf("- name: Prepare packaged runtime SBOM input"));
assert.match(runtimeAuditStep, /\$PSNativeCommandUseErrorActionPreference = \$true/, "failure to prepare the runtime audit cannot be masked by a later command");
assert.ok(desktopRuntimeAudit < prepareSbom, "the Electron npm closure is audited before SBOM input preparation");
assert.ok(prepareSbom < generateSbom && generateSbom < finalizeSbom && finalizeSbom < inspectSbom, "Syft output is enriched and then adversarially inspected");
assert.match(buildJob, /name: lyrics-card-generator-\$\{\{ env\.RELEASE_TAG \}\}-\$\{\{ needs\.authorize\.outputs\.release_sha \}\}-tested/, "the transferred bundle name is bound to tag and SHA");

assert.equal(packageJson.dependencies.electron, undefined, "Electron does not pollute the Next production dependency graph");
assert.match(packageJson.devDependencies.electron, /^\d+\.\d+\.\d+$/, "Electron remains exactly pinned as build tooling and packaged runtime");
assert.deepEqual(desktopRuntimePolicy, {
  schemaVersion: 1,
  runtimeRoots: [{ name: "electron", manifestSection: "devDependencies" }],
  exceptions: []
}, "the desktop audit policy has one explicit, exception-free Electron runtime root");

assert.match(publishJob, /needs:[\s\S]+- authorize[\s\S]+- build/, "publication needs both authorization and tested assets");
assert.match(publishJob, /contents: write/, "only the publication phase can mutate Release state");
assert.match(publishJob, /actions: read/, "publication can download only the tested workflow artifact");
assert.equal((workflow.match(/verify-release-source\.mjs/g) || []).length, 3, "source is reauthorized before mutation and immediately before publication");
assert.match(publishJob, /actions\/download-artifact@[0-9a-f]{40}/, "tested assets are downloaded through a commit-pinned action");
assert.doesNotMatch(workflow, /branches\/[^\s"']+\/protection|repos\/[^\s"']+\/rulesets/, "the workflow does not mutate remote branch or tag rules");

const createDraft = workflow.indexOf("- name: Create draft GitHub release");
const verifyDraft = workflow.indexOf("- name: Re-download and verify exact draft release");
const finalAuthorization = workflow.indexOf("- name: Reauthorize source immediately before publication");
const publishVerified = workflow.indexOf("- name: Publish verified GitHub release");
const normalizeAssets = workflow.indexOf("- name: Normalize release asset filenames");
const generateChecksums = workflow.indexOf("- name: Generate SHA256SUMS");
assert.ok(createDraft >= 0, "release workflow creates a draft release");
assert.ok(verifyDraft > createDraft, "draft assets are verified after upload");
assert.ok(finalAuthorization > verifyDraft, "tag, ancestry, review, and CI are checked again after draft verification");
assert.ok(publishVerified > finalAuthorization, "publication follows the final source authorization");
assert.ok(normalizeAssets >= 0 && normalizeAssets < generateChecksums, "executable names are normalized before checksums");
assert.match(buildJob, /Expected exactly one Setup executable/, "release build rejects portable or extra executables");
assert.match(buildJob, /Unexpected checksum subject set/, "checksum generation requires exactly Setup and the SPDX SBOM");
assert.equal((buildJob.match(/release\/Lyrics\.Card\.Generator\.Setup\.\$\{\{ needs\.authorize\.outputs\.version \}\}\.exe/g) || []).length, 2, "attestation and transfer use the exact Setup asset path");
assert.equal((buildJob.match(/release\/lyrics-card-generator-\$\{\{ needs\.authorize\.outputs\.version \}\}\.spdx\.json/g) || []).length, 5, "SBOM generation, finalization, inspection, attestation, and transfer bind the exact versioned path");
assert.doesNotMatch(buildJob, /release\/\*\.exe|release\/\*\.spdx\.json/, "release asset provenance and transfer do not use broad globs");

const createSection = workflow.slice(createDraft, verifyDraft);
const verifySection = workflow.slice(verifyDraft, finalAuthorization);
const publishSection = workflow.slice(publishVerified);
assert.match(createSection, /gh release create[^\r\n]+--draft\b/, "release creation remains draft-only");
assert.match(createSection, /\$setupAsset release\/SHA256SUMS \$sbomAsset/, "draft creation uploads exactly Setup, SHA256SUMS, and the SPDX SBOM");
assert.doesNotMatch(createSection, /release\/\*\.exe|portable/i, "draft creation cannot upload a portable or wildcard executable");
assert.match(createSection, /--verify-tag\b/, "release creation verifies that the remote tag still exists");
assert.match(createSection, /--target \$env:EXPECTED_RELEASE_SHA\b/, "new drafts are explicitly targeted at the authorized SHA");
assert.doesNotMatch(createSection, /--method DELETE|gh release delete/, "reruns never delete a draft or published Release");
assert.match(createSection, /state -eq 'draft'[\s\S]+Reusing exact draft release/, "an exact pre-existing draft is reused without replacement");
assert.match(createSection, /RELEASE_ID=/, "the exact draft release id is persisted");
assert.match(createSection, /for \(\$attempt = 1; \$attempt -le 10; \$attempt\+\+\)/, "draft discovery uses a finite retry loop");
assert.match(createSection, /Start-Sleep -Seconds 2/, "draft discovery tolerates GitHub API propagation delay");
assert.match(createSection, /\$null -eq \$draft/, "draft discovery fails closed after bounded retries");
assert.match(createSection, /\$createExitCode -ne 0[\s\S]+no exact release became visible/, "duplicate-create and API failures are re-resolved and fail closed when no exact draft exists");
assert.match(verifySection, /verify-github-release\.ps1/, "draft verification uses the shared exact-release verifier");
assert.match(verifySection, /ExpectedState draft/, "draft verification rejects an unexpectedly published release");
assert.match(verifySection, /ExpectedAssetDirectory release/, "a reused or concurrently-created draft must byte-match this run's tested bundle");
assert.match(publishSection, /gh api --method PATCH[^\r\n]+repos\/\$env:GITHUB_REPOSITORY\/releases\/\$env:RELEASE_ID/, "the verified draft is published by exact release id");

assert.doesNotMatch(workflow, /releases\?per_page=100/, "release state never depends on an unpaginated first page");
assert.equal((workflow.match(/resolve-github-release\.mjs/g) || []).length, 2, "authorization and publication use the same exact release resolver");
assert.match(releaseStateResolver, /MAX_RELEASE_PAGES = 10_000/, "release pagination has an auditable fail-closed bound beyond 100 pages");
assert.match(releaseStateResolver, /parseNextLink/, "the resolver follows validated GitHub pagination links");
assert.match(releaseStateResolver, /pageItems\.length === 0/, "the resolver terminates on an explicit empty page");
assert.match(releaseStateResolver, /matching\.length > 1[\s\S]+release_conflict/, "same-tag draft or published collisions fail closed");
assert.match(releaseStateResolver, /remoteTagSha !== normalizedExpectedSha/, "release state is independently bound to the authorized tag SHA");

assert.deepEqual(sourcePolicy.requiredChecks, [
  "verify",
  "render-boundary-regression",
  "web-lite-smoke",
  "web-lite-cross-browser-smoke",
  "desktop-packaged-regression"
]);
assert.equal(sourcePolicy.baseBranch, "main");
assert.equal(sourcePolicy.ciWorkflowPath, ".github/workflows/ci.yml");
assert.equal(sourcePolicy.requiredApprovals, 0, "the single-collaborator repository does not require an impossible independent approval");
assert.deepEqual(sourcePolicy.trustedReviewers, [], "reviewers must be added through an explicit future allowlist");
assert.ok(!sourcePolicy.requiredChecks.some((name) => /release/i.test(name)), "Release workflow checks never depend on themselves");
assert.match(sourceVerifier, /compare\/\$\{releaseSha\}\.\.\.\$\{mainSha\}/, "authorization proves main ancestry through the exact remote SHAs");
assert.match(sourceVerifier, /merge_commit_sha/, "the final main commit is associated with its merged pull request");
assert.match(sourceVerifier, /pullRequest\.head\?\.sha/, "review approval is bound to the PR's final head even when squash or rebase changes the main SHA");
assert.match(sourceVerifier, /collaborators\/\$\{encodeURIComponent\(reviewer\.login\)\}\/permission/, "future approvals require a current effective repository-permission lookup");
assert.match(sourceVerifier, /REVIEWER_WRITE_PERMISSIONS\.has\(permission\)/, "only current repository writers can count as trusted reviewers");
assert.match(sourceVerifier, /head_sha: releaseSha/, "CI workflow lookup is bound to the exact final release SHA");
assert.match(sourceVerifier, /event: "push"/, "only the final main-push CI run can authorize publication");
assert.match(sourceVerifier, /job\.status !== "completed" \|\| job\.conclusion !== "success"/, "missing, pending, skipped, neutral, and failed checks fail closed");
assert.match(powershellSyntaxTest, /Parser\]::ParseInput/, "every inline release PowerShell block has a parser-backed syntax test");
assert.match(sourcePolicyDocs, /Protect `main`:[\s\S]+require pull requests/, "remote main protection is documented without being mutated by the workflow");
assert.match(sourcePolicyDocs, /Protect `v\*\.\*\.\*` tags:[\s\S]+creation, update, and deletion/, "remote tag immutability rules are documented");
assert.match(sourcePolicyDocs, /squash and rebase merges[\s\S]+different PR head/, "review and final-SHA binding is documented for the repository's merge strategies");
assert.match(sourcePolicyDocs, /current repository policy deliberately sets `requiredApprovals` to `0`/, "documentation states the current zero-approval policy");
assert.match(sourcePolicyDocs, /Codex[\s\S]+is not a GitHub[\s\S]+approval/, "offline Codex acceptance is not presented as GitHub review evidence");

assert.match(verifier, /releases\/\$ReleaseId/, "verification resolves a release by exact numeric id");
assert.match(verifier, /Invoke-WebRequest -Uri \$asset\.url/, "verification downloads exact asset API URLs");
assert.match(verifier, /Unexpected release asset set/, "unexpected downloaded assets fail verification");
assert.match(verifier, /Unexpected checksum coverage/, "checksum coverage must match expected assets");
assert.doesNotMatch(verifier, /-portable\.exe|Expected exactly one portable/, "the shared verifier rejects the retired portable asset contract");
assert.match(verifier, /gh attestation verify \$_\.FullName/, "every downloaded release asset is attestation-verified");
assert.match(verifier, /Draft asset does not match the tested bundle/, "reused drafts must match the newly tested artifact bytes");

for (const stepName of [
  "Validate tag metadata and bind local commit",
  "Resolve and verify existing release state",
  "Validate release-only policy",
  "Audit packaged Electron runtime dependency closure",
  "Create draft GitHub release",
  "Publish verified GitHub release"
]) {
  const step = workflow.split(/\n\s+- name: /).find((section) => section.startsWith(`${stepName}\n`) || section.startsWith(`${stepName}\r\n`));
  assert.ok(step, `${stepName} exists`);
  assert.match(step, /\$PSNativeCommandUseErrorActionPreference = \$true/, `${stepName} propagates native command failures`);
}
assert.match(buildJob, /Validate release-only policy[\s\S]+\$PSNativeCommandUseErrorActionPreference = \$true\s+npx tsx scripts\/test-release-consistency\.ts/, "a failed publication-wording check fails the release step");

console.log("Reviewed-main exact-CI release workflow contract tests passed");
