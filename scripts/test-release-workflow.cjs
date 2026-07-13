const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { version } = require("../package.json");

const workflow = readFileSync(`.github/workflows/release-${version}.yml`, "utf8");

assert.match(workflow, /^concurrency:\s+group: release-/m, "release workflow serializes runs for the same tag");

for (const file of readdirSync(".github/workflows").filter((name) => /^release-\d+\.\d+\.\d+\.yml$/.test(name))) {
  const targetVersion = file.match(/^release-(\d+\.\d+\.\d+)\.yml$/)[1];
  const source = readFileSync(`.github/workflows/${file}`, "utf8");
  const escapedVersion = targetVersion.replace(/\./g, "\\.");
  const expectedTagPattern = `^v${escapedVersion}(?:-rc\\.[0-9]+)?$`;
  assert.ok(
    source.includes(`-notmatch '${expectedTagPattern}'`),
    `${file} validates its own tag instead of a copied release version`
  );
}

const createDraft = workflow.indexOf("- name: Create draft GitHub release");
const verifyDraft = workflow.indexOf("- name: Re-download and verify draft release bytes and attestations");
const publishVerified = workflow.indexOf("- name: Publish verified GitHub release");

assert.ok(createDraft >= 0, "release workflow creates a draft release");
assert.ok(verifyDraft > createDraft, "draft assets are verified after upload");
assert.ok(publishVerified > verifyDraft, "release is published only after verification");

const createSection = workflow.slice(createDraft, verifyDraft);
const verifySection = workflow.slice(verifyDraft, publishVerified);
const publishSection = workflow.slice(publishVerified);

assert.match(createSection, /gh release create[^\r\n]+--draft\b/, "release creation remains draft-only");
assert.match(createSection, /--verify-tag\b/, "release creation verifies the tag");
assert.match(createSection, /Matching published release already exists/, "an existing published release blocks draft creation");
assert.match(createSection, /gh api --method DELETE[^\r\n]+\$staleDraft\.id/, "reruns remove only stale matching drafts");
assert.match(createSection, /RELEASE_ID=/, "the exact draft release id is persisted");
assert.doesNotMatch(verifySection, /gh release download \$env:RELEASE_TAG/, "verification never resolves assets by an ambiguous tag");
assert.match(verifySection, /releases\/\$env:RELEASE_ID/, "verification loads the exact draft release by id");
assert.match(verifySection, /Invoke-WebRequest -Uri \$asset\.url/, "verification downloads each asset from the exact release response");
assert.match(verifySection, /\$setup\.Count -ne 1/, "exactly one Setup artifact is required");
assert.match(verifySection, /\$portable\.Count -ne 1/, "exactly one portable artifact is required");
assert.match(verifySection, /\$sbom\.Count -ne 1/, "exactly one SBOM is required");
assert.match(verifySection, /\$checksums\.Count -ne 1/, "exactly one checksum manifest is required");
assert.match(verifySection, /Unexpected release asset set/, "unexpected downloaded assets fail verification");
assert.match(verifySection, /Unexpected checksum coverage/, "checksum coverage must match the expected assets");
assert.match(
  verifySection,
  /\$assets \| ForEach-Object \{\s+gh attestation verify \$_\.FullName/s,
  "every downloaded release asset is attestation-verified"
);
assert.match(
  publishSection,
  /gh api --method PATCH[^\r\n]+releases\/\$env:RELEASE_ID[^\r\n]+-F draft=false/,
  "the verified draft is published by exact release id"
);
assert.doesNotMatch(publishSection, /gh release edit \$env:RELEASE_TAG/, "publishing never resolves a release by tag");

const nativeFailureGuards = workflow.match(/\$PSNativeCommandUseErrorActionPreference = \$true/g) || [];
assert.equal(nativeFailureGuards.length, 3, "every gh release step treats native command failures as fatal");

console.log("Release workflow contract tests passed");
