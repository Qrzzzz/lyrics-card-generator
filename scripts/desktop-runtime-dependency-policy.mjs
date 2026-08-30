import assert from "node:assert/strict";
import path from "node:path";

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const MANIFEST_SECTIONS = new Set(["dependencies", "devDependencies"]);

export function createDesktopRuntimeAuditInput({ rootPackage, rootLock, policy }) {
  assertRecord(rootPackage, "package.json");
  assertRecord(rootLock, "package-lock.json");
  const runtimeRoots = validateDesktopRuntimePolicy(policy);
  assert.equal(rootLock.lockfileVersion, 3, "desktop runtime audit requires package-lock lockfileVersion 3");
  assertRecord(rootLock.packages, "package-lock.json packages");
  const rootLockPackage = rootLock.packages[""];
  assertRecord(rootLockPackage, "package-lock.json root package");

  const roots = runtimeRoots.map((runtimeRoot) => {
    const declaredVersion = rootPackage[runtimeRoot.manifestSection]?.[runtimeRoot.name];
    assertExactVersion(
      declaredVersion,
      `${runtimeRoot.name} must be pinned exactly in package.json ${runtimeRoot.manifestSection}`
    );
    assert.equal(
      rootLockPackage[runtimeRoot.manifestSection]?.[runtimeRoot.name],
      declaredVersion,
      `package-lock.json root ${runtimeRoot.manifestSection}.${runtimeRoot.name} must match package.json`
    );

    const lockPath = rootDependencyPath(runtimeRoot.name);
    const lockEntry = rootLock.packages[lockPath];
    validateLockedPackage(lockEntry, lockPath);
    assert.equal(
      lockEntry.version,
      declaredVersion,
      `${lockPath} must resolve the exact packaged runtime version ${declaredVersion}`
    );
    return {
      name: runtimeRoot.name,
      manifestSection: runtimeRoot.manifestSection,
      version: declaredVersion,
      purl: npmPurl(runtimeRoot.name, declaredVersion),
      lockPath,
      resolved: lockEntry.resolved,
      integrity: lockEntry.integrity
    };
  });

  const closurePaths = collectDependencyClosure(rootLock.packages, roots.map((entry) => entry.lockPath));
  const auditName = `${rootPackage.name ?? "application"}-desktop-runtime-audit`;
  const auditVersion = rootPackage.version ?? "0.0.0";
  const dependencies = Object.fromEntries(roots.map((entry) => [entry.name, entry.version]));
  const auditPackage = {
    name: auditName,
    version: auditVersion,
    private: true,
    dependencies
  };
  const auditLockPackages = {
    "": {
      name: auditName,
      version: auditVersion,
      dependencies
    }
  };

  for (const lockPath of closurePaths) {
    const entry = structuredClone(rootLock.packages[lockPath]);
    delete entry.dev;
    delete entry.devOptional;
    auditLockPackages[lockPath] = entry;
  }

  const packageLock = {
    name: auditName,
    version: auditVersion,
    lockfileVersion: 3,
    requires: true,
    packages: auditLockPackages
  };
  const closure = closurePaths.map((lockPath) => {
    const entry = rootLock.packages[lockPath];
    return {
      name: packageNameFromLockPath(lockPath),
      version: entry.version,
      purl: npmPurl(packageNameFromLockPath(lockPath), entry.version),
      lockPath,
      resolved: entry.resolved,
      integrity: entry.integrity,
      optional: entry.optional === true
    };
  });

  return {
    packageJson: auditPackage,
    packageLock,
    inventory: { roots, closure }
  };
}

export function validateDesktopRuntimePolicy(policy) {
  assertRecord(policy, "desktop runtime audit policy");
  assert.equal(policy.schemaVersion, 1, "unsupported desktop runtime audit policy schemaVersion");
  assert.ok(Array.isArray(policy.runtimeRoots) && policy.runtimeRoots.length > 0, "desktop runtime audit policy needs runtimeRoots");
  assert.deepEqual(
    policy.exceptions,
    [],
    "desktop runtime audit exceptions must remain empty; Electron findings cannot be hidden by this policy"
  );

  const names = new Set();
  return policy.runtimeRoots.map((entry, index) => {
    assertRecord(entry, `runtimeRoots[${index}]`);
    assert.match(entry.name ?? "", PACKAGE_NAME_PATTERN, `runtimeRoots[${index}].name must be an npm package name`);
    assert.ok(
      MANIFEST_SECTIONS.has(entry.manifestSection),
      `runtimeRoots[${index}].manifestSection must be dependencies or devDependencies`
    );
    assert.ok(!names.has(entry.name), `runtimeRoots contains duplicate package ${entry.name}`);
    names.add(entry.name);
    return { name: entry.name, manifestSection: entry.manifestSection };
  });
}

export function npmPurl(packageName, version) {
  assert.match(packageName, PACKAGE_NAME_PATTERN, "npm purl package name must be valid");
  assertExactVersion(version, "npm purl version must be exact");
  const encodedName = packageName.startsWith("@") ? `%40${packageName.slice(1)}` : packageName;
  return `pkg:npm/${encodedName}@${version}`;
}

function collectDependencyClosure(packages, rootPaths) {
  const visited = new Set();
  const queue = [...rootPaths];
  while (queue.length > 0) {
    const lockPath = queue.shift();
    if (visited.has(lockPath)) continue;
    const entry = packages[lockPath];
    validateLockedPackage(entry, lockPath);
    visited.add(lockPath);

    const dependencyGroups = [
      [entry.dependencies, false],
      [entry.optionalDependencies, true],
      [entry.peerDependencies, false]
    ];
    for (const [dependencies, optionalGroup] of dependencyGroups) {
      if (!dependencies) continue;
      for (const dependencyName of Object.keys(dependencies)) {
        const peerOptional = entry.peerDependenciesMeta?.[dependencyName]?.optional === true;
        const dependencyPath = resolveDependencyPath(packages, lockPath, dependencyName);
        if (!dependencyPath) {
          assert.ok(
            optionalGroup || peerOptional,
            `${lockPath} requires ${dependencyName}, but package-lock.json has no resolvable package entry`
          );
          continue;
        }
        queue.push(dependencyPath);
      }
    }
  }
  return [...visited].sort((left, right) => left.localeCompare(right, "en"));
}

function resolveDependencyPath(packages, fromLockPath, dependencyName) {
  let cursor = fromLockPath;
  while (true) {
    const candidate = cursor
      ? path.posix.join(cursor, "node_modules", dependencyName)
      : rootDependencyPath(dependencyName);
    if (packages[candidate]) return candidate;
    if (!cursor) return null;
    const nestedMarker = cursor.lastIndexOf("/node_modules/");
    cursor = nestedMarker >= 0 ? cursor.slice(0, nestedMarker) : "";
  }
}

function rootDependencyPath(packageName) {
  return `node_modules/${packageName}`;
}

function packageNameFromLockPath(lockPath) {
  const marker = lockPath.lastIndexOf("node_modules/");
  assert.ok(marker >= 0, `invalid package-lock package path ${lockPath}`);
  const suffix = lockPath.slice(marker + "node_modules/".length);
  const segments = suffix.split("/");
  return suffix.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function validateLockedPackage(entry, label) {
  assertRecord(entry, `package-lock entry ${label}`);
  assertExactVersion(entry.version, `${label}.version must be exact`);
  assert.match(entry.resolved ?? "", /^https:\/\//u, `${label}.resolved must be an HTTPS registry artifact`);
  assert.match(entry.integrity ?? "", /^sha(?:256|384|512)-/u, `${label}.integrity must be a Subresource Integrity digest`);
  assert.notEqual(entry.link, true, `${label} cannot be a mutable linked dependency`);
}

function assertExactVersion(value, message) {
  assert.equal(typeof value, "string", message);
  assert.match(value, EXACT_VERSION_PATTERN, message);
}

function assertRecord(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
}
