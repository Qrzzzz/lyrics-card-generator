import assert from "node:assert/strict";
import { evaluateProductionAudit } from "./production-audit-policy.mjs";

const advisory = {
  source: 1124066,
  name: "sharp",
  dependency: "sharp",
  title: "sharp inherited vulnerabilities in libvips",
  url: "https://github.com/advisories/GHSA-f88m-g3jw-g9cj",
  severity: "high",
  range: "<0.35.0"
};
const audit = {
  auditReportVersion: 2,
  vulnerabilities: {
    next: { severity: "high", via: ["sharp"] },
    sharp: { severity: "high", via: [advisory] }
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 } }
};
const exception = {
  advisory: "GHSA-f88m-g3jw-g9cj",
  source: 1124066,
  package: "sharp",
  severity: "high",
  affectedRange: "<0.35.0",
  expires: "2026-11-20",
  owner: "@Qrzzzz",
  trackingIssue: "https://github.com/Qrzzzz/lyrics-card-generator/issues/117",
  reason: "A compatible patch is unavailable without a framework major upgrade.",
  reachability: "The dependency is packaged, while its application call path is disabled and absent."
};
const policy = { schemaVersion: 1, exceptions: [exception] };

assert.equal(evaluateProductionAudit(audit, policy, "2026-08-22").ok, true, "the reviewed advisory passes");

const newAdvisoryAudit = structuredClone(audit);
newAdvisoryAudit.vulnerabilities.undici = {
  severity: "critical",
  via: [{ ...advisory, source: 9999999, dependency: "undici", name: "undici", severity: "critical", url: "https://github.com/advisories/GHSA-2345-6789-cfgh" }]
};
assert.match(
  evaluateProductionAudit(newAdvisoryAudit, policy, "2026-08-22").errors.join("\n"),
  /Unapproved critical production advisory/u,
  "a new critical advisory fails closed"
);

assert.match(
  evaluateProductionAudit(audit, policy, "2026-11-21").errors.join("\n"),
  /expired on 2026-11-20/u,
  "an expired exception fails closed"
);

const cleanAudit = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }
};
assert.match(
  evaluateProductionAudit(cleanAudit, policy, "2026-08-22").errors.join("\n"),
  /Stale exception/u,
  "a cleared advisory requires removal of its exception"
);

const undocumented = structuredClone(policy);
undocumented.exceptions[0].reason = "No fix.";
assert.match(
  evaluateProductionAudit(audit, undocumented, "2026-08-22").errors.join("\n"),
  /reason must explain/u,
  "an exception without a substantive reason fails"
);

console.log("Production dependency audit policy tests passed");
