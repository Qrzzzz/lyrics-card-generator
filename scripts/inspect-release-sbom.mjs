import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sbomPath = process.argv[2];
if (!sbomPath) {
  throw new Error("Usage: npm run sbom:inspect -- <release SPDX JSON path>");
}

const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
assert.match(sbom.spdxVersion ?? "", /^SPDX-2\./u, "release SBOM must be SPDX 2.x JSON");
assert.ok(Array.isArray(sbom.packages) && sbom.packages.length > 0, "release SBOM must contain packages");

const npmPurls = new Set(
  sbom.packages.flatMap((entry) =>
    (entry.externalRefs ?? [])
      .filter((reference) => reference.referenceType === "purl" && reference.referenceLocator.startsWith("pkg:npm/"))
      .map((reference) => reference.referenceLocator)
  )
);
for (const runtimePackage of ["next", "sharp"]) {
  assert.ok(hasNpmPackage(npmPurls, runtimePackage), `release SBOM is missing packaged runtime dependency ${runtimePackage}`);
}
for (const buildOnlyPackage of ["electron-builder", "eslint", "@playwright/test", "tailwindcss"]) {
  assert.ok(!hasNpmPackage(npmPurls, buildOnlyPackage), `release SBOM unexpectedly contains build/dev dependency ${buildOnlyPackage}`);
}

const policy = JSON.parse(readFileSync("security/npm-audit-exceptions.json", "utf8"));
for (const exception of policy.exceptions) {
  assert.ok(
    hasNpmPackage(npmPurls, exception.package),
    `approved production exception ${exception.advisory} does not match packaged SBOM package ${exception.package}`
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      spdxVersion: sbom.spdxVersion,
      packages: sbom.packages.length,
      npmPackages: npmPurls.size,
      runtimePackages: ["next", "sharp"].filter((name) => hasNpmPackage(npmPurls, name)),
      approvedExceptionPackages: policy.exceptions.map((entry) => entry.package)
    },
    null,
    2
  )
);

function hasNpmPackage(purls, packageName) {
  const encodedName = packageName.startsWith("@")
    ? `%40${packageName.slice(1)}`
    : packageName;
  const prefix = `pkg:npm/${encodedName}@`;
  return [...purls].some((purl) => purl.startsWith(prefix));
}
