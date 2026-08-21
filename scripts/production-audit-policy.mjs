const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const ADVISORY_PATTERN = /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/u;

export function evaluateProductionAudit(audit, policy, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  validateAudit(audit, errors);
  const exceptions = validatePolicy(policy, today, errors);
  const advisories = collectBlockingAdvisories(audit?.vulnerabilities ?? {}, errors);
  const currentKeys = new Set();

  for (const advisory of advisories) {
    const key = advisoryKey(advisory);
    currentKeys.add(key);
    const exception = exceptions.get(key);
    if (!exception) {
      errors.push(
        `Unapproved ${advisory.severity} production advisory ${advisory.advisory} ` +
        `(${advisory.package}, npm source ${advisory.source}).`
      );
      continue;
    }
    if (exception.package !== advisory.package) {
      errors.push(
        `Exception ${exception.advisory} names package ${exception.package}, but npm reports ${advisory.package}.`
      );
    }
    if (exception.severity !== advisory.severity) {
      errors.push(
        `Exception ${exception.advisory} records severity ${exception.severity}, but npm reports ${advisory.severity}.`
      );
    }
  }

  for (const [key, exception] of exceptions) {
    if (!currentKeys.has(key)) {
      errors.push(
        `Stale exception ${exception.advisory} (${exception.package}) is not present in the current production audit; remove it.`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    advisories,
    exceptions: [...exceptions.values()],
    metadata: audit?.metadata?.vulnerabilities ?? null
  };
}

function validateAudit(audit, errors) {
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    errors.push("npm audit output must be a JSON object.");
    return;
  }
  if (!audit.vulnerabilities || typeof audit.vulnerabilities !== "object") {
    errors.push("npm audit output is missing vulnerabilities.");
  }
  if (!audit.metadata?.vulnerabilities) {
    errors.push("npm audit output is missing vulnerability metadata.");
  }
}

function validatePolicy(policy, today, errors) {
  const valid = new Map();
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    errors.push("The production audit exception policy must be a JSON object.");
    return valid;
  }
  if (policy.schemaVersion !== 1) {
    errors.push(`Unsupported production audit policy schemaVersion: ${policy.schemaVersion}.`);
  }
  if (!Array.isArray(policy.exceptions)) {
    errors.push("The production audit policy must contain an exceptions array.");
    return valid;
  }

  for (const [index, exception] of policy.exceptions.entries()) {
    const label = `exceptions[${index}]`;
    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    requireString(exception, "advisory", label, errors);
    requireString(exception, "package", label, errors);
    requireString(exception, "affectedRange", label, errors);
    requireString(exception, "expires", label, errors);
    requireString(exception, "owner", label, errors);
    requireString(exception, "trackingIssue", label, errors);
    requireString(exception, "reason", label, errors);
    requireString(exception, "reachability", label, errors);
    if (!Number.isInteger(exception.source) || exception.source <= 0) {
      errors.push(`${label}.source must be a positive npm advisory number.`);
    }
    if (typeof exception.advisory === "string" && !ADVISORY_PATTERN.test(exception.advisory)) {
      errors.push(`${label}.advisory must be a GHSA identifier.`);
    }
    if (!BLOCKING_SEVERITIES.has(exception.severity)) {
      errors.push(`${label}.severity must be high or critical.`);
    }
    if (typeof exception.expires === "string" && !/^\d{4}-\d{2}-\d{2}$/u.test(exception.expires)) {
      errors.push(`${label}.expires must use YYYY-MM-DD.`);
    } else if (exception.expires < today) {
      errors.push(`${label} expired on ${exception.expires}; today is ${today}.`);
    }
    if (
      typeof exception.trackingIssue === "string" &&
      !/^https:\/\/github\.com\/Qrzzzz\/lyrics-card-generator\/issues\/\d+$/u.test(exception.trackingIssue)
    ) {
      errors.push(`${label}.trackingIssue must be a repository issue URL.`);
    }
    if (typeof exception.reason === "string" && exception.reason.trim().length < 40) {
      errors.push(`${label}.reason must explain why a safe fix is unavailable.`);
    }
    if (typeof exception.reachability === "string" && exception.reachability.trim().length < 40) {
      errors.push(`${label}.reachability must document packaged runtime exposure.`);
    }

    if (Number.isInteger(exception.source) && typeof exception.advisory === "string") {
      const key = advisoryKey(exception);
      if (valid.has(key)) {
        errors.push(`${label} duplicates ${exception.advisory} / npm source ${exception.source}.`);
      } else {
        valid.set(key, exception);
      }
    }
  }
  return valid;
}

function requireString(object, property, label, errors) {
  if (typeof object[property] !== "string" || object[property].trim() === "") {
    errors.push(`${label}.${property} must be a non-empty string.`);
  }
}

function collectBlockingAdvisories(vulnerabilities, errors) {
  const collected = new Map();
  const blockingPackages = Object.entries(vulnerabilities)
    .filter(([, finding]) => BLOCKING_SEVERITIES.has(finding?.severity))
    .map(([name]) => name);

  for (const packageName of blockingPackages) {
    const resolved = resolvePackageAdvisories(packageName, vulnerabilities, new Set());
    if (resolved.length === 0) {
      errors.push(`Blocking production finding ${packageName} does not resolve to an advisory object.`);
    }
    for (const advisory of resolved) {
      if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue;
      const normalized = {
        advisory: advisory.url?.split("/").at(-1) ?? "",
        source: advisory.source,
        package: advisory.dependency ?? advisory.name,
        severity: advisory.severity,
        range: advisory.range,
        title: advisory.title,
        url: advisory.url
      };
      if (!ADVISORY_PATTERN.test(normalized.advisory) || !Number.isInteger(normalized.source)) {
        errors.push(`Blocking finding ${packageName} has an invalid advisory identity.`);
        continue;
      }
      collected.set(advisoryKey(normalized), normalized);
    }
  }
  return [...collected.values()].sort((left, right) => advisoryKey(left).localeCompare(advisoryKey(right)));
}

function resolvePackageAdvisories(packageName, vulnerabilities, visiting) {
  if (visiting.has(packageName)) return [];
  const finding = vulnerabilities[packageName];
  if (!finding || !Array.isArray(finding.via)) return [];
  const nextVisiting = new Set(visiting).add(packageName);
  const resolved = [];
  for (const via of finding.via) {
    if (typeof via === "string") {
      resolved.push(...resolvePackageAdvisories(via, vulnerabilities, nextVisiting));
    } else if (via && typeof via === "object") {
      resolved.push(via);
    }
  }
  return resolved;
}

function advisoryKey(advisory) {
  return `${advisory.advisory}:${advisory.source}`;
}
