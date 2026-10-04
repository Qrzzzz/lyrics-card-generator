import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderCurrentExceptions, verifyDependencyDocs } from "./lib/dependency-docs-contract.mjs";

const document = await readFile(new URL("../docs/security/dependency-advisory-policy.md", import.meta.url), "utf8");
const policy = JSON.parse(await readFile(new URL("../security/npm-audit-exceptions.json", import.meta.url), "utf8"));
verifyDependencyDocs(document, policy);
const changed = { exceptions: [{ advisory: "GHSA-example", package: "fixture", owner: "reviewer", expires: "2026-12-01", trackingIssue: "fixture-issue" }] };
assert.throws(() => verifyDependencyDocs(document, changed), /stale/);
const changedDoc = document.replace(/(<!-- current-exceptions:start -->)[\s\S]*?(<!-- current-exceptions:end -->)/, `$1\n${renderCurrentExceptions(changed)}\n$2`);
verifyDependencyDocs(changedDoc, changed);
assert.throws(() => verifyDependencyDocs(changedDoc, { exceptions: [] }), /stale/);
console.log("Dependency documentation contract passed (addition and removal mutations rejected).");
