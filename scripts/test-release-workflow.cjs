const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const verifier = readFileSync("scripts/verify-github-release.ps1", "utf8");
const sourceVerifier = readFileSync("scripts/verify-release-source.mjs", "utf8");
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
assert.match(authorizeJob, /published=\$\(\$published\.ToString\(\)\.ToLowerInvariant\(\)\)/, "published state is passed between jobs");

assert.match(buildJob, /needs: authorize/, "asset construction cannot start before source authorization");
assert.match(buildJob, /if: needs\.authorize\.outputs\.published != 'true'/, "an already-published release skips rebuilding");
assert.match(buildJob, /contents: read/, "the build phase has read-only repository access");
assert.match(buildJob, /attestations: write[\s\S]+id-token: write/, "only the build phase can create provenance attestations");
assert.doesNotMatch(buildJob, /contents: write/, "the long-running build phase cannot mutate Releases");
assert.match(buildJob, /EXPECTED_RELEASE_SHA: \$\{\{ needs\.authorize\.outputs\.release_sha \}\}/, "the build checkout is pinned to the authorized SHA");
assert.match(buildJob, /Run release quality gates[\s\S]+npm run electron-runtime:coverage/, "release still blocks on measured Electron runtime coverage");
assert.equal((buildJob.match(/npm run electron-runtime:coverage/g) || []).length, 1, "release executes Electron runtime coverage once");
assert.match(buildJob, /REQUIRE_PUBLISHED_RELEASE_NOTES:\s*["']1["']/, "release quality gates reject candidate wording");
assert.match(buildJob, /Enforce production dependency advisory policy[\s\S]+npm run dependency-audit:gate/, "release blocks unapproved production advisories");
assert.match(buildJob, /Run release quality gates[\s\S]+npm run font-license:test/, "release verifies font license distribution");
assert.match(buildJob, /Run release quality gates[\s\S]+npm run sbom:test/, "release runs adversarial SPDX inventory fixtures");
const packagedAssets = buildJob.indexOf("npm run desktop:packaged-assets-test");
assert.ok(packagedAssets >= 0 && packagedAssets < buildJob.indexOf("Run deterministic packaged interaction regression"), "packaged assets are verified before desktop interactions");
const finalArtifactSmoke = buildJob.indexOf("npm run desktop:final-artifact-smoke");
const normalizedAssets = buildJob.indexOf("Normalize release asset filenames");
const desktopRuntimeAudit = buildJob.indexOf("npm run desktop-runtime-audit:gate");
const prepareSbom = buildJob.indexOf("npm run sbom:prepare");
const generateSbom = buildJob.indexOf("anchore/sbom-action@");
const finalizeSbom = buildJob.indexOf("npm run sbom:finalize");
const inspectSbom = buildJob.indexOf("npm run sbom:inspect");
assert.ok(finalArtifactSmoke >= 0 && finalArtifactSmoke < normalizedAssets, "final Setup and portable bytes are smoked before normalization");
assert.ok(normalizedAssets < desktopRuntimeAudit, "desktop runtime audit binds normalized downloadable asset bytes");
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

const createSection = workflow.slice(createDraft, verifyDraft);
const verifySection = workflow.slice(verifyDraft, finalAuthorization);
const publishSection = workflow.slice(publishVerified);
assert.match(createSection, /gh release create[^\r\n]+--draft\b/, "release creation remains draft-only");
assert.match(createSection, /--verify-tag\b/, "release creation verifies that the remote tag still exists");
assert.match(createSection, /gh api --method DELETE[^\r\n]+\$\(\$_\.id\)/, "reruns remove only stale matching drafts");
assert.match(createSection, /RELEASE_ID=/, "the exact draft release id is persisted");
assert.match(createSection, /for \(\$attempt = 1; \$attempt -le 10; \$attempt\+\+\)/, "draft discovery uses a finite retry loop");
assert.match(createSection, /Start-Sleep -Seconds 2/, "draft discovery tolerates GitHub API propagation delay");
assert.match(createSection, /\$null -eq \$draft/, "draft discovery fails closed after bounded retries");
assert.match(verifySection, /verify-github-release\.ps1/, "draft verification uses the shared exact-release verifier");
assert.match(verifySection, /ExpectedState draft/, "draft verification rejects an unexpectedly published release");
assert.match(publishSection, /gh api --method PATCH[^\r\n]+repos\/\$env:GITHUB_REPOSITORY\/releases\/\$env:RELEASE_ID/, "the verified draft is published by exact release id");

assert.deepEqual(sourcePolicy.requiredChecks, [
  "verify",
  "render-boundary-regression",
  "web-lite-smoke",
  "web-lite-cross-browser-smoke (firefox)",
  "web-lite-cross-browser-smoke (webkit)",
  "security/locale/a11y gates",
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
assert.match(verifier, /gh attestation verify \$_\.FullName/, "every downloaded release asset is attestation-verified");

const nativeFailureGuards = workflow.match(/\$PSNativeCommandUseErrorActionPreference = \$true/g) || [];
assert.equal(nativeFailureGuards.length, 4, "each inline native-command mutation or metadata section treats failures as fatal");

console.log("Reviewed-main exact-CI release workflow contract tests passed");
