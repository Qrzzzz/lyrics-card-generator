export type VersionParts = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

export function parseVersion(version: string): VersionParts | null {
  const normalized = version.trim().replace(/^v/i, "").split("+")[0];
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".").filter(Boolean) : []
  };
}

export function compareVersionStrings(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  if (!leftParts || !rightParts) {
    return null;
  }

  return compareVersions(leftParts, rightParts);
}

export function compareVersions(left: VersionParts, right: VersionParts) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

export function normalizeVersion(version: string) {
  const parsed = parseVersion(version);
  if (!parsed) {
    return version.trim();
  }

  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.prerelease.length > 0 ? `${base}-${parsed.prerelease.join(".")}` : base;
}

function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  if (left.length === 0) {
    return 1;
  }

  if (right.length === 0) {
    return -1;
  }

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (leftPart === undefined) {
      return -1;
    }

    if (rightPart === undefined) {
      return 1;
    }

    const leftNumber = parseNumericIdentifier(leftPart);
    const rightNumber = parseNumericIdentifier(rightPart);

    if (leftNumber !== null && rightNumber !== null) {
      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
      continue;
    }

    if (leftNumber !== null) {
      return -1;
    }

    if (rightNumber !== null) {
      return 1;
    }

    const compared = leftPart.localeCompare(rightPart);
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

function parseNumericIdentifier(value: string) {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    return null;
  }

  return Number(value);
}
