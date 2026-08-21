const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/release.yml", "utf8");
const verifier = readFileSync("scripts/verify-github-release.ps1", "utf8");
// Release orchestration is intentionally centralized; version-specific workflow
// copies would drift away from the exact-asset verification contract.
const versionSpecificWorkflows = readdirSync(".github/workflows")
  .filter((name) => /^release-\d+\.\d+\.\d+\.yml$/.test(name));

assert.deepEqual(
  versionSpecificWorkflows,
  [],
  "one tag-driven release workflow replaces version-specific copies"
);
assert.match(workflow, /^concurrency:\s+group: release-/m, "release runs for one tag are serialized");
assert.match(workflow, /- "v\*\.\*\.\*"/, "stable and RC version tags enter the generic release workflow");
assert.match(
  workflow,
  /\^v\$escapedVersion\(\?:-rc\\\.\[0-9\]\+\)\?\$/,
  "the checked-out package version strictly validates the requested tag"
);
assert.match(workflow, /docs\/releases\/v\$version\.\$_\.md/, "all six release-note locales are derived from package.json");
assert.match(workflow, /if: needs\.resolve\.outputs\.published != 'true'/, "an already-published release is an idempotent no-op");
assert.match(workflow, /ExpectedState published/, "an existing published release is verified before the no-op succeeds");
assert.match(workflow, /published=\$\(\$published\.ToString\(\)\.ToLowerInvariant\(\)\)/, "published state is passed between jobs");
assert.match(
  workflow,
  /REQUIRE_PUBLISHED_RELEASE_NOTES:\s*["']1["']/,
  "tag release quality gates reject candidate wording before publication"
);
assert.match(workflow, /Enforce production dependency advisory policy[\s\S]+npm run dependency-audit:gate/, "release blocks unapproved production high and critical advisories");
assert.match(workflow, /Prepare packaged runtime SBOM input[\s\S]+npm run sbom:prepare/, "release prepares a scanner-compatible copy of final packaged bytes");
assert.match(workflow, /path: dist-desktop\/sbom-runtime/, "release SBOM scans the normalized packaged runtime instead of the source tree");
assert.match(workflow, /config: security\/syft-release\.yaml/, "release enables the JavaScript package cataloger for the normalized runtime closure");
assert.match(workflow, /syft-version: v1\.51\.0/, "release pins the locally validated Syft version");
assert.match(workflow, /Inspect packaged runtime SPDX SBOM[\s\S]+npm run sbom:inspect/, "release inspects the packaged runtime SBOM before checksums and publication");

const createDraft = workflow.indexOf("- name: Create draft GitHub release");
const verifyDraft = workflow.indexOf("- name: Re-download and verify exact draft release");
const publishVerified = workflow.indexOf("- name: Publish verified GitHub release");
const normalizeAssets = workflow.indexOf("- name: Normalize release asset filenames");
const generateChecksums = workflow.indexOf("- name: Generate SHA256SUMS");

// Ordering is part of the safety contract: unverified assets must never become
// public, even if each individual workflow step still exists.
assert.ok(createDraft >= 0, "release workflow creates a draft release");
assert.ok(verifyDraft > createDraft, "draft assets are verified after upload");
assert.ok(publishVerified > verifyDraft, "release is published only after exact draft verification");
assert.ok(normalizeAssets >= 0 && normalizeAssets < generateChecksums, "executable names are normalized before checksums");

const createSection = workflow.slice(createDraft, verifyDraft);
const verifySection = workflow.slice(verifyDraft, publishVerified);
const publishSection = workflow.slice(publishVerified);

assert.match(createSection, /gh release create[^\r\n]+--draft\b/, "release creation remains draft-only");
assert.match(createSection, /--verify-tag\b/, "release creation verifies the tag");
assert.match(createSection, /gh api --method DELETE[^\r\n]+\$\(\$_\.id\)/, "reruns remove only stale matching drafts");
assert.match(createSection, /RELEASE_ID=/, "the exact draft release id is persisted");
assert.match(createSection, /for \(\$attempt = 1; \$attempt -le 10; \$attempt\+\+\)/, "draft discovery uses a finite retry loop");
assert.match(createSection, /Start-Sleep -Seconds 2/, "draft discovery tolerates GitHub API propagation delay");
assert.match(createSection, /\$null -eq \$draft/, "draft discovery fails closed after bounded retries");
assert.match(verifySection, /verify-github-release\.ps1/, "draft verification uses the shared exact-release verifier");
assert.match(verifySection, /ExpectedState draft/, "draft verification rejects an unexpectedly published release");
assert.match(
  publishSection,
  /gh api --method PATCH[^\r\n]+repos\/\$env:GITHUB_REPOSITORY\/releases\/\$env:RELEASE_ID/,
  "the verified draft is published by exact release id"
);

assert.match(verifier, /releases\/\$ReleaseId/, "verification resolves a release by exact numeric id");
assert.match(verifier, /Invoke-WebRequest -Uri \$asset\.url/, "verification downloads exact asset API URLs");
assert.match(verifier, /\$setup\.Count -ne 1/, "exactly one Setup artifact is required");
assert.match(verifier, /\$portable\.Count -ne 1/, "exactly one portable artifact is required");
assert.match(verifier, /\$sbom\.Count -ne 1/, "exactly one SBOM is required");
assert.match(verifier, /\$checksums\.Count -ne 1/, "exactly one checksum manifest is required");
assert.match(verifier, /Unexpected release asset set/, "unexpected downloaded assets fail verification");
assert.match(verifier, /Lyrics\.Card\.Generator\.Setup\.\$version\.exe/, "the exact versioned Setup filename is required");
assert.match(verifier, /Lyrics\.Card\.Generator-\$version-portable\.exe/, "the exact versioned portable filename is required");
assert.match(verifier, /lyrics-card-generator-\$version\.spdx\.json/, "the exact versioned SBOM filename is required");
assert.match(verifier, /prerelease state does not match tag/, "stable and RC tags enforce matching prerelease state");
assert.match(verifier, /Unexpected checksum coverage/, "checksum coverage must match the expected assets");
assert.match(verifier, /gh attestation verify \$_\.FullName/, "every downloaded release asset is attestation-verified");

const nativeFailureGuards = workflow.match(/\$PSNativeCommandUseErrorActionPreference = \$true/g) || [];
assert.equal(nativeFailureGuards.length, 3, "each inline gh section treats native command failures as fatal");

console.log("Generic idempotent release workflow contract tests passed");
