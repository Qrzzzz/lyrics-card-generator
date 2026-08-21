# Dependency advisory policy

This repository treats an npm package severity as a triage signal, not proof that the product exposes the advisory's trigger. The gate still fails closed for every new high or critical finding in the production dependency tree.

## Three dependency scopes

1. `npm audit --omit=dev` evaluates packages in the root lockfile's production dependency closure. `npm run dependency-audit:gate` runs a fresh registry audit and accepts a high or critical advisory only when `security/npm-audit-exceptions.json` contains the same GHSA and npm source ID, package, severity, owner, reason, reachability review, tracking issue, and an unexpired date.
2. A full `npm audit` also covers build and development tooling. It is recorded during dependency work, but a tooling finding is not described as a packaged runtime exploit without separate reachability evidence.
3. The release SPDX SBOM is generated after the tested desktop package is built. `npm run sbom:prepare` makes a byte-for-byte verified copy of `release/win-unpacked` and changes only the standalone dependency directory name from `_node_modules` to `node_modules`, because Syft otherwise skips that npm closure. The workflow pins Syft 1.51.0 and scans this temporary `dist-desktop/sbom-runtime` view with the JavaScript installed-package cataloger explicitly enabled. `npm run sbom:inspect -- <file>` requires the Next/Sharp npm purls, rejects representative build-only npm purls, and confirms that every production exception names a package actually present in the packaged runtime. The SBOM remains authoritative when a package marked dev at the root is nevertheless copied into the actual standalone closure.

The policy file is not a global ignore list. The evaluator rejects new unapproved high/critical advisories, expired exceptions, stale exceptions after an advisory is fixed, malformed or undocumented entries, and package/severity mismatches. A registry or JSON failure also fails the gate rather than being interpreted as a clean audit.

## Current exception

`GHSA-f88m-g3jw-g9cj` covers inherited libvips vulnerabilities in `sharp <0.35.0`. Next 15.5.23 declares optional `sharp ^0.34.3`; npm's supported remediation is a breaking Next 16 upgrade. Forcing Sharp 0.35 outside Next 15's declared range is not an acceptable patch-only repair.

Sharp is present in the packaged standalone runtime. However, `next/image` is disabled and application/runtime code has no direct Sharp import or call site. Repository build/test scripts do import Sharp for controlled README media generation and packaged-static-asset checks; those paths are not executed by the shipped app. No product runtime libvips decode path has been identified. That is reduced reachability, not a claim that the package advisory is false.

The exception expires on **2026-11-20**. Before that date, remove it by adopting a compatible Next 15 patch that supports Sharp 0.35 or by separately validating a Next 16 migration. Extension requires a new review, updated evidence, a new finite date, and the tracking issue history; it must not be renewed silently.
