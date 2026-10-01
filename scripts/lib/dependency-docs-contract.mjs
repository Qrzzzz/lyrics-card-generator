export function renderCurrentExceptions(policy) {
  if (!Array.isArray(policy.exceptions)) throw new Error("Invalid exception policy");
  if (policy.exceptions.length === 0) return "No active exceptions. Machine authority: `security/npm-audit-exceptions.json`.";
  return policy.exceptions.map((entry) => `- ${entry.advisory}: ${entry.package}; owner ${entry.owner}; expires ${entry.expires}; tracking ${entry.trackingIssue}`).join("\n");
}

export function verifyDependencyDocs(document, policy) {
  const match = document.match(/<!-- current-exceptions:start -->\s*([\s\S]*?)\s*<!-- current-exceptions:end -->/);
  if (!match || match[1] !== renderCurrentExceptions(policy)) throw new Error("Dependency exception documentation is stale.");
}
