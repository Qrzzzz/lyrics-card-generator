#!/usr/bin/env node

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/;
const DECISIVE_REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
const REVIEWER_WRITE_PERMISSIONS = new Set(["admin", "write"]);

export const releaseSourcePolicy = Object.freeze(
  JSON.parse(readFileSync(new URL("../security/release-source-policy.json", import.meta.url), "utf8"))
);

export class ReleaseSourceError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ReleaseSourceError";
    this.code = code;
    this.details = details;
  }
}

function reject(code, message, details = undefined) {
  throw new ReleaseSourceError(code, message, details);
}

function normalizeSha(value, label) {
  const sha = String(value || "").toLowerCase();
  if (!SHA_PATTERN.test(sha)) reject("invalid_sha", `${label} is not a full 40-character commit SHA.`);
  return sha;
}

function validateInputs({ repository, tag, expectedSha }) {
  if (!REPOSITORY_PATTERN.test(repository)) reject("invalid_repository", `Invalid repository: ${repository}`);
  if (!TAG_PATTERN.test(tag)) reject("invalid_tag", `Invalid release tag: ${tag}`);
  return normalizeSha(expectedSha, "Expected release SHA");
}

function encodeRepository(repository) {
  return repository.split("/").map(encodeURIComponent).join("/");
}

function sortNewestFirst(left, right) {
  const leftTime = Date.parse(left.created_at || left.updated_at || "") || 0;
  const rightTime = Date.parse(right.created_at || right.updated_at || "") || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  if ((left.run_attempt || 0) !== (right.run_attempt || 0)) return (right.run_attempt || 0) - (left.run_attempt || 0);
  return Number(right.id || 0) - Number(left.id || 0);
}

export function createGitHubClient({ token, apiUrl = "https://api.github.com", fetchImpl = globalThis.fetch }) {
  if (!token) reject("missing_token", "GH_TOKEN or GITHUB_TOKEN is required.");
  if (typeof fetchImpl !== "function") reject("missing_fetch", "A Fetch API implementation is required.");
  const baseUrl = apiUrl.replace(/\/+$/, "");

  async function get(path) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "lyrics-card-generator-release-source-gate",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 1000);
      reject("github_api_error", `GitHub API ${response.status} for ${path}: ${body}`);
    }
    return response.json();
  }

  async function getAll(path, key = undefined) {
    const items = [];
    for (let page = 1; page <= 20; page += 1) {
      const separator = path.includes("?") ? "&" : "?";
      const payload = await get(`${path}${separator}per_page=100&page=${page}`);
      const pageItems = key ? payload[key] : payload;
      if (!Array.isArray(pageItems)) reject("github_api_shape", `Expected an array from ${path}.`);
      items.push(...pageItems);
      if (pageItems.length < 100) return items;
    }
    reject("github_api_pagination", `GitHub API pagination exceeded 2000 entries for ${path}.`);
  }

  return { get, getAll };
}

async function resolvePeeledTagSha(client, repositoryPath, tag) {
  const ref = await client.get(`/repos/${repositoryPath}/git/ref/tags/${encodeURIComponent(tag)}`);
  if (ref.ref !== `refs/tags/${tag}`) reject("tag_ref_mismatch", `Resolved ${ref.ref || "an unknown ref"}, expected refs/tags/${tag}.`);

  let target = ref.object;
  for (let depth = 0; depth < 8; depth += 1) {
    const type = String(target?.type || "");
    const sha = normalizeSha(target?.sha, `Tag ${tag} target`);
    if (type === "commit") return sha;
    if (type !== "tag") reject("invalid_tag_target", `Tag ${tag} resolves to unsupported object type ${type || "unknown"}.`);
    const tagObject = await client.get(`/repos/${repositoryPath}/git/tags/${sha}`);
    target = tagObject.object;
  }
  reject("tag_peel_depth", `Tag ${tag} exceeded the annotated-tag peel depth limit.`);
}

function selectReviewedPullRequest({ pullRequests, releaseSha, baseBranch }) {
  const eligible = pullRequests.filter((pullRequest) => {
    const mergeSha = String(pullRequest.merge_commit_sha || "").toLowerCase();
    return pullRequest.state === "closed"
      && Boolean(pullRequest.merged_at)
      && pullRequest.base?.ref === baseBranch
      && mergeSha === releaseSha;
  });
  if (eligible.length !== 1) {
    reject(
      "reviewed_merge_missing",
      `Release SHA ${releaseSha} must be the exact merge result of one reviewed pull request into ${baseBranch}; found ${eligible.length}.`,
      { associatedPullRequests: pullRequests.map((pullRequest) => pullRequest.number), eligiblePullRequests: eligible.map((pullRequest) => pullRequest.number) }
    );
  }
  return eligible[0];
}

function validateApprovalPolicy(policy) {
  if (!Number.isInteger(policy.requiredApprovals) || policy.requiredApprovals < 0) {
    reject("invalid_approval_policy", "requiredApprovals must be a non-negative integer.");
  }
  if (!Array.isArray(policy.trustedReviewers)) {
    reject("invalid_approval_policy", "trustedReviewers must be an explicit array.");
  }

  const trustedReviewers = [];
  const seenLogins = new Set();
  for (const entry of policy.trustedReviewers) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      reject("invalid_approval_policy", "Each trustedReviewers entry must be an object.");
    }
    const login = String(entry.login || "").trim();
    if (!login || login.length > 100 || login.includes("/")) {
      reject("invalid_approval_policy", "Each trusted reviewer must have a valid explicit login.");
    }
    if (entry.allowBot !== undefined && typeof entry.allowBot !== "boolean") {
      reject("invalid_approval_policy", `allowBot for ${login} must be a boolean when present.`);
    }
    const normalizedLogin = login.toLowerCase();
    if (seenLogins.has(normalizedLogin)) {
      reject("invalid_approval_policy", `Trusted reviewer ${login} is listed more than once.`);
    }
    seenLogins.add(normalizedLogin);
    trustedReviewers.push({ login, normalizedLogin, allowBot: entry.allowBot === true });
  }

  if (policy.requiredApprovals > trustedReviewers.length) {
    reject(
      "trusted_reviewer_capacity",
      `Approval policy requires ${policy.requiredApprovals} reviewer(s), but only ${trustedReviewers.length} explicit trusted reviewer(s) are configured.`,
      { requiredApprovals: policy.requiredApprovals, configuredTrustedReviewers: trustedReviewers.map((entry) => entry.login) }
    );
  }
  return { requiredApprovals: policy.requiredApprovals, trustedReviewers };
}

async function resolveCurrentlyTrustedReviewers({ client, repositoryPath, approvalPolicy }) {
  const eligible = new Map();
  for (const reviewer of approvalPolicy.trustedReviewers) {
    let payload;
    try {
      payload = await client.get(
        `/repos/${repositoryPath}/collaborators/${encodeURIComponent(reviewer.login)}/permission`
      );
    } catch (error) {
      reject(
        "reviewer_permission_unavailable",
        `Could not verify current repository permission for trusted reviewer ${reviewer.login}.`,
        {
          reviewer: reviewer.login,
          causeCode: error instanceof ReleaseSourceError ? error.code : "unexpected_error"
        }
      );
    }

    const responseLogin = String(payload?.user?.login || "");
    const accountType = String(payload?.user?.type || "");
    const permission = String(payload?.permission || "").toLowerCase();
    if (!responseLogin || responseLogin.toLowerCase() !== reviewer.normalizedLogin || !accountType || !permission) {
      reject(
        "reviewer_permission_unavailable",
        `GitHub returned incomplete or mismatched permission evidence for trusted reviewer ${reviewer.login}.`,
        { reviewer: reviewer.login }
      );
    }

    const isBot = accountType.toLowerCase() === "bot" || reviewer.normalizedLogin.endsWith("[bot]");
    const accountTypeAllowed = isBot ? reviewer.allowBot : accountType.toLowerCase() === "user";
    if (accountTypeAllowed && REVIEWER_WRITE_PERMISSIONS.has(permission)) {
      eligible.set(reviewer.normalizedLogin, {
        login: responseLogin,
        accountType,
        permission
      });
    }
  }

  if (eligible.size < approvalPolicy.requiredApprovals) {
    reject(
      "trusted_reviewer_capacity",
      `Approval policy requires ${approvalPolicy.requiredApprovals} reviewer(s), but only ${eligible.size} explicitly trusted reviewer(s) currently have write access.`,
      {
        requiredApprovals: approvalPolicy.requiredApprovals,
        currentlyTrustedReviewers: [...eligible.values()].map((reviewer) => reviewer.login)
      }
    );
  }
  return eligible;
}

async function selectCurrentApprovals({ client, repositoryPath, reviews, pullRequest, approvalPolicy }) {
  const pullRequestHead = normalizeSha(pullRequest.head?.sha, `Pull request #${pullRequest.number} head SHA`);
  const authorLogin = String(pullRequest.user?.login || "").trim();
  if (!authorLogin) {
    reject(
      "review_identity_unavailable",
      `Pull request #${pullRequest.number} has no author identity for the non-author approval check.`
    );
  }
  const author = authorLogin.toLowerCase();
  const currentlyTrustedReviewers = await resolveCurrentlyTrustedReviewers({
    client,
    repositoryPath,
    approvalPolicy
  });
  const latestDecisionByReviewer = new Map();
  const orderedReviews = [...reviews].sort((left, right) => {
    const timeDelta = (Date.parse(left.submitted_at || "") || 0) - (Date.parse(right.submitted_at || "") || 0);
    return timeDelta || Number(left.id || 0) - Number(right.id || 0);
  });
  for (const review of orderedReviews) {
    const state = String(review.state || "").toUpperCase();
    const reviewer = String(review.user?.login || "");
    if (reviewer && DECISIVE_REVIEW_STATES.has(state)) {
      latestDecisionByReviewer.set(reviewer.toLowerCase(), { reviewer, review });
    }
  }

  const approvals = [...latestDecisionByReviewer.entries()]
    .filter(([normalizedReviewer, { review }]) => normalizedReviewer !== author
      && currentlyTrustedReviewers.has(normalizedReviewer)
      && String(review.state || "").toUpperCase() === "APPROVED"
      && String(review.commit_id || "").toLowerCase() === pullRequestHead)
    .map(([normalizedReviewer, { reviewer, review }]) => ({
      reviewer,
      reviewId: review.id,
      commitSha: pullRequestHead,
      permission: currentlyTrustedReviewers.get(normalizedReviewer).permission,
      accountType: currentlyTrustedReviewers.get(normalizedReviewer).accountType
    }));

  if (approvals.length < approvalPolicy.requiredApprovals) {
    reject(
      "current_approval_missing",
      `Pull request #${pullRequest.number} needs ${approvalPolicy.requiredApprovals} trusted non-author approval(s) on final head ${pullRequestHead}; found ${approvals.length}.`,
      { pullRequest: pullRequest.number, pullRequestHead, approvals }
    );
  }
  return approvals;
}

function inspectRequiredChecks({ jobs, run, releaseSha, requiredChecks }) {
  const failures = [];
  const checks = [];
  for (const name of requiredChecks) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1) {
      failures.push(`${name}: expected exactly one check, found ${matches.length}`);
      continue;
    }
    const job = matches[0];
    const jobSha = String(job.head_sha || "").toLowerCase();
    const jobAttempt = Number(job.run_attempt || run.run_attempt || 1);
    if (jobSha !== releaseSha) failures.push(`${name}: head SHA ${jobSha || "missing"} does not match ${releaseSha}`);
    if (jobAttempt !== Number(run.run_attempt || 1)) failures.push(`${name}: run attempt ${jobAttempt} does not match ${run.run_attempt || 1}`);
    if (job.status !== "completed" || job.conclusion !== "success") {
      failures.push(`${name}: ${job.status || "unknown"}/${job.conclusion || "none"}`);
    }
    checks.push({
      name,
      status: job.status,
      conclusion: job.conclusion,
      jobId: job.id,
      checkRunUrl: job.check_run_url
    });
  }
  if (run.status !== "completed" || run.conclusion !== "success") {
    failures.push(`workflow run: ${run.status || "unknown"}/${run.conclusion || "none"}`);
  }
  return { checks, failures };
}

async function selectSuccessfulCiRun({ client, repositoryPath, releaseSha, policy }) {
  const query = new URLSearchParams({
    branch: policy.baseBranch,
    event: "push",
    head_sha: releaseSha
  });
  const runs = await client.getAll(
    `/repos/${repositoryPath}/actions/workflows/${encodeURIComponent(policy.ciWorkflow)}/runs?${query}`,
    "workflow_runs"
  );
  const relevantRuns = runs
    .filter((run) => String(run.head_sha || "").toLowerCase() === releaseSha
      && run.event === "push"
      && run.head_branch === policy.baseBranch
      && (!run.path || run.path === policy.ciWorkflowPath)
      && (!run.name || run.name === policy.ciWorkflowName))
    .sort(sortNewestFirst);

  const diagnostics = [];
  const run = relevantRuns[0];
  if (run) {
    if (run.status !== "completed") {
      diagnostics.push({ runId: run.id, runAttempt: run.run_attempt, failures: [`workflow run: ${run.status || "unknown"}/none`] });
    } else {
      const jobs = await client.getAll(
        `/repos/${repositoryPath}/actions/runs/${run.id}/attempts/${run.run_attempt || 1}/jobs`,
        "jobs"
      );
      const inspection = inspectRequiredChecks({ jobs, run, releaseSha, requiredChecks: policy.requiredChecks });
      if (inspection.failures.length === 0) return { run, checks: inspection.checks };
      diagnostics.push({ runId: run.id, runAttempt: run.run_attempt, failures: inspection.failures });
    }
  }

  reject(
    "required_ci_not_successful",
    `No completed successful ${policy.ciWorkflowName} push run on ${policy.baseBranch} contains the full required check set for ${releaseSha}.`,
    { requiredChecks: policy.requiredChecks, runs: diagnostics }
  );
}

export async function authorizeReleaseSource({
  client,
  repository,
  tag,
  expectedSha,
  policy = releaseSourcePolicy
}) {
  const releaseSha = validateInputs({ repository, tag, expectedSha });
  const repositoryPath = encodeRepository(repository);
  const approvalPolicy = validateApprovalPolicy(policy);
  const remoteTagSha = await resolvePeeledTagSha(client, repositoryPath, tag);
  if (remoteTagSha !== releaseSha) {
    reject("tag_sha_mismatch", `Remote tag ${tag} peels to ${remoteTagSha}, expected ${releaseSha}.`);
  }

  const branch = await client.get(`/repos/${repositoryPath}/branches/${encodeURIComponent(policy.baseBranch)}`);
  const mainSha = normalizeSha(branch.commit?.sha, `${policy.baseBranch} tip SHA`);
  const comparison = await client.get(`/repos/${repositoryPath}/compare/${releaseSha}...${mainSha}`);
  const mergeBaseSha = normalizeSha(comparison.merge_base_commit?.sha, "Comparison merge-base SHA");
  if (!(["ahead", "identical"].includes(comparison.status)) || mergeBaseSha !== releaseSha) {
    reject(
      "off_main",
      `Release SHA ${releaseSha} is not an ancestor of approved ${policy.baseBranch} tip ${mainSha}.`,
      { comparisonStatus: comparison.status, mergeBaseSha }
    );
  }

  const pullRequests = await client.getAll(`/repos/${repositoryPath}/commits/${releaseSha}/pulls`);
  const pullRequest = selectReviewedPullRequest({ pullRequests, releaseSha, baseBranch: policy.baseBranch });
  let approvals = [];
  if (approvalPolicy.requiredApprovals > 0) {
    const reviews = await client.getAll(`/repos/${repositoryPath}/pulls/${pullRequest.number}/reviews`);
    approvals = await selectCurrentApprovals({
      client,
      repositoryPath,
      reviews,
      pullRequest,
      approvalPolicy
    });
  }
  const ci = await selectSuccessfulCiRun({ client, repositoryPath, releaseSha, policy });

  return {
    releaseTag: tag,
    releaseSha,
    mainBranch: policy.baseBranch,
    mainSha,
    reviewedPullRequest: {
      number: pullRequest.number,
      url: pullRequest.html_url,
      headSha: pullRequest.head.sha,
      approvals
    },
    ci: {
      workflow: policy.ciWorkflowPath,
      runId: ci.run.id,
      runAttempt: ci.run.run_attempt || 1,
      runUrl: ci.run.html_url,
      checks: ci.checks
    }
  };
}

function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) reject("invalid_argument", `Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) reject("invalid_argument", `Missing value for ${argument}`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const repository = args.repository || process.env.GITHUB_REPOSITORY || "";
  const tag = args.tag || process.env.RELEASE_TAG || "";
  const expectedSha = args["expected-sha"] || process.env.EXPECTED_RELEASE_SHA || "";
  const client = createGitHubClient({
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    apiUrl: args["api-url"] || process.env.GITHUB_API_URL || "https://api.github.com"
  });
  const evidence = await authorizeReleaseSource({ client, repository, tag, expectedSha });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.output) writeFileSync(args.output, serialized, "utf8");
  else process.stdout.write(serialized);
  if (args["github-output"]) {
    appendFileSync(
      args["github-output"],
      [
        `release_sha=${evidence.releaseSha}`,
        `main_sha=${evidence.mainSha}`,
        `reviewed_pr=${evidence.reviewedPullRequest.number}`,
        `ci_run_id=${evidence.ci.runId}`,
        `ci_run_attempt=${evidence.ci.runAttempt}`
      ].join("\n") + "\n",
      "utf8"
    );
  }
  console.log(
    `Authorized ${evidence.releaseTag} at ${evidence.releaseSha}: PR #${evidence.reviewedPullRequest.number}, CI run ${evidence.ci.runId} attempt ${evidence.ci.runAttempt}.`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const code = error instanceof ReleaseSourceError ? error.code : "unexpected_error";
    console.error(`[${code}] ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof ReleaseSourceError && error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  });
}
