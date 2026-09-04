# Dependency advisory policy

[Documentation index](../README.md) · [Development guide](../development.en.md)

This repository treats an npm package severity as a triage signal, not proof that the product exposes the advisory's trigger. The gate still fails closed for every new high or critical finding in the production dependency tree.

## Three dependency scopes

1. `npm audit --omit=dev` evaluates packages in the root lockfile's production dependency closure. `npm run dependency-audit:gate` runs a fresh registry audit and accepts a high or critical advisory only when `security/npm-audit-exceptions.json` contains the same GHSA and npm source ID, package, severity, owner, reason, reachability review, tracking issue, and an unexpired date.
2. A full `npm audit` also covers build and development tooling. It is recorded during dependency work, but a tooling finding is not described as a packaged runtime exploit without separate reachability evidence.
3. The release SPDX SBOM is generated after the tested desktop package is built. `npm run sbom:prepare` makes a byte-for-byte verified copy of `release/win-unpacked` and changes only the standalone dependency directory name from `_node_modules` to `node_modules`, because Syft otherwise skips that npm closure. The workflow pins Syft 1.51.0 and scans this temporary `dist-desktop/sbom-runtime` view with the JavaScript installed-package cataloger explicitly enabled. `npm run sbom:inspect -- <file>` requires the Next/Sharp npm purls, rejects representative build-only npm purls, and confirms that every production exception names a package actually present in the packaged runtime. The SBOM remains authoritative when a package marked dev at the root is nevertheless copied into the actual standalone closure.

The policy file is not a global ignore list. The evaluator rejects new unapproved high/critical advisories, expired exceptions, stale exceptions after an advisory is fixed, malformed or undocumented entries, and package/severity mismatches. A registry or JSON failure also fails the gate rather than being interpreted as a clean audit.

## Commands and evidence

```bash
npm run dependency-audit:test
npm run dependency-audit:check
npm run dependency-audit:gate
```

- `dependency-audit:test` validates policy parsing and fail-closed behavior with deterministic fixtures.
- `dependency-audit:check` performs the current registry audit and evaluates it against `security/npm-audit-exceptions.json`; it requires registry access.
- `dependency-audit:gate` runs both and is used by CI. Its fixture suite also covers the desktop runtime audit policy. CI separately runs `sbom:test` for the SPDX policy fixtures.
- Release reuses those deterministic fixtures from its authorized exact-SHA CI, but still runs `dependency-audit:check` against current advisories. After building Setup, it runs `desktop-runtime-audit:prepare` then `desktop-runtime-audit:check` with native-command failure propagation; a failed preparation cannot fall through to stale input. SBOM generation, finalization, and inspection still operate on the newly built runtime.

When an audit changes, preserve the raw advisory identifiers and dependency path before editing an exception. A version bump, root `devDependency` label, or low application reachability does not by itself prove that a packaged dependency is absent; use the built runtime and release SBOM when packaging reachability matters.

## Exception maintenance

An exception change must include all of the following in one reviewable update:

1. Reproduce the current advisory with a clean lockfile install and record GHSA/npm source IDs, package, severity, and dependency path.
2. Determine whether the package is present in the packaged runtime and identify application/runtime call sites separately from build-only scripts.
3. Prefer a compatible dependency update. Do not force an out-of-range transitive package merely to silence the audit.
4. If no safe compatible update exists, add a finite expiry, named owner, reachability reasoning, and tracking issue to `security/npm-audit-exceptions.json`.
5. Run `dependency-audit:gate`; for packaged dependencies, also rebuild and inspect the SBOM with `sbom:prepare` and `sbom:inspect`.
6. Remove the exception as soon as the advisory disappears or a supported repair lands. The evaluator treats a stale exception as a failure.

## Current exception

`GHSA-f88m-g3jw-g9cj` covers inherited libvips vulnerabilities in `sharp <0.35.0`. Next 15.5.23 declares optional `sharp ^0.34.3`; npm's supported remediation is a breaking Next 16 upgrade. Forcing Sharp 0.35 outside Next 15's declared range is not an acceptable patch-only repair.

Sharp is present in the packaged standalone runtime. However, `next/image` is disabled and application/runtime code has no direct Sharp import or call site. Repository build/test scripts do import Sharp for controlled README media generation and packaged-static-asset checks; those paths are not executed by the shipped app. No product runtime libvips decode path has been identified. That is reduced reachability, not a claim that the package advisory is false.

The exception expires on **2026-11-20**. Before that date, remove it by adopting a compatible Next 15 patch that supports Sharp 0.35 or by separately validating a Next 16 migration. Extension requires a new review, updated evidence, a new finite date, and the tracking issue history; it must not be renewed silently.
