const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const workflow = readFileSync(".github/workflows/release-5.2.0.yml", "utf8");

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
assert.match(verifySection, /gh release download \$env:RELEASE_TAG --dir published/, "verification uses downloaded release assets");
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
assert.match(publishSection, /gh release edit \$env:RELEASE_TAG --draft=false/, "verified draft is explicitly published");

const nativeFailureGuards = workflow.match(/\$PSNativeCommandUseErrorActionPreference = \$true/g) || [];
assert.equal(nativeFailureGuards.length, 3, "every gh release step treats native command failures as fatal");

console.log("Release workflow contract tests passed");
