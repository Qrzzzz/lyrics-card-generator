#!/usr/bin/env node

import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/;
const PAGE_SIZE = 100;
const MAX_RELEASE_PAGES = 10_000;

export class ReleaseStateError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ReleaseStateError";
    this.code = code;
    this.details = details;
  }
}

function reject(code, message, details = undefined) {
  throw new ReleaseStateError(code, message, details);
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

async function readErrorBody(response) {
  try {
    return (await response.text()).slice(0, 1000);
  } catch {
    return "unreadable response body";
  }
}

export function createReleaseStateClient({
  token,
  apiUrl = "https://api.github.com",
  fetchImpl = globalThis.fetch
}) {
  if (!token) reject("missing_token", "GH_TOKEN or GITHUB_TOKEN is required.");
  if (typeof fetchImpl !== "function") reject("missing_fetch", "A Fetch API implementation is required.");
  const baseUrl = new URL(apiUrl.replace(/\/+$/, ""));

  async function get(pathOrUrl) {
    const url = new URL(pathOrUrl, baseUrl);
    if (url.origin !== baseUrl.origin) reject("github_api_link", `Refusing GitHub API URL outside ${baseUrl.origin}.`);
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "lyrics-card-generator-release-state-gate",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (!response?.ok) {
      const status = Number(response?.status || 0);
      reject("github_api_error", `GitHub API ${status || "failure"} for ${url.pathname}${url.search}: ${await readErrorBody(response || {})}`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      reject("github_api_json", `GitHub API returned invalid JSON for ${url.pathname}${url.search}.`, {
        cause: error instanceof Error ? error.message : String(error)
      });
    }
    return {
      payload,
      link: response.headers?.get?.("link") || "",
      url
    };
  }

  return { baseUrl, get };
}

function parseNextLink({ link, currentUrl, baseUrl, allowedReleasePaths, currentPage }) {
  if (!link) return null;
  const candidates = [];
  for (const entry of link.split(/,(?=\s*<)/)) {
    const match = entry.trim().match(/^<([^>]+)>\s*;(.*)$/);
    if (!match) reject("github_api_link", `Malformed GitHub pagination Link header: ${link}`);
    const relations = [...match[2].matchAll(/(?:^|;)\s*rel="([^"]+)"/g)]
      .flatMap((relation) => relation[1].split(/\s+/));
    if (relations.includes("next")) candidates.push(match[1]);
  }
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) reject("github_api_link", "GitHub pagination returned multiple next links.");

  const nextUrl = new URL(candidates[0], currentUrl);
  const pageValues = nextUrl.searchParams.getAll("page");
  const perPageValues = nextUrl.searchParams.getAll("per_page");
  const nextPage = Number(pageValues[0]);
  const unexpectedQueryKey = [...nextUrl.searchParams.keys()]
    .find((key) => key !== "page" && key !== "per_page");
  if (
    nextUrl.origin !== baseUrl.origin
    || nextUrl.username !== ""
    || nextUrl.password !== ""
    || nextUrl.hash !== ""
    || !allowedReleasePaths.has(nextUrl.pathname)
    || unexpectedQueryKey !== undefined
    || pageValues.length !== 1
    || perPageValues.length !== 1
    || perPageValues[0] !== String(PAGE_SIZE)
    || !Number.isInteger(nextPage)
    || nextPage !== currentPage + 1
  ) {
    reject("github_api_link", `Unsafe or non-sequential GitHub pagination link: ${nextUrl.href}`);
  }
  return nextUrl;
}

function inspectReleasePage(payload, page) {
  if (!Array.isArray(payload)) reject("github_api_shape", `Expected an array on release page ${page}.`);
  if (payload.length > PAGE_SIZE) reject("github_api_shape", `Release page ${page} exceeded ${PAGE_SIZE} entries.`);
  for (const [index, release] of payload.entries()) {
    if (!release || typeof release !== "object" || Array.isArray(release)) {
      reject("github_api_shape", `Release page ${page} entry ${index} is not an object.`);
    }
    if (
      !Number.isSafeInteger(release.id)
      || release.id <= 0
      || typeof release.tag_name !== "string"
      || typeof release.draft !== "boolean"
      || typeof release.prerelease !== "boolean"
    ) {
      reject("github_api_shape", `Release page ${page} entry ${index} is missing required identity/state fields.`);
    }
  }
  return payload;
}

export async function listAllReleases({ client, repositoryPath }) {
  const releasesPath = `/repos/${repositoryPath}/releases`;
  const repository = (await client.get(`/repos/${repositoryPath}`)).payload;
  if (!Number.isSafeInteger(repository?.id) || repository.id <= 0) {
    reject("github_api_shape", "GitHub repository metadata is missing a valid numeric ID.");
  }
  const allowedReleasePaths = new Set([
    releasesPath,
    `/repositories/${repository.id}/releases`
  ]);
  const releases = [];
  const visited = new Set();
  let page = 1;
  let nextUrl = new URL(`${releasesPath}?per_page=${PAGE_SIZE}&page=${page}`, client.baseUrl);

  while (page <= MAX_RELEASE_PAGES) {
    if (visited.has(nextUrl.href)) reject("github_api_pagination", `GitHub release pagination repeated ${nextUrl.href}.`);
    visited.add(nextUrl.href);
    const response = await client.get(nextUrl);
    const pageItems = inspectReleasePage(response.payload, page);
    releases.push(...pageItems);
    const linkedNext = parseNextLink({
      link: response.link,
      currentUrl: response.url,
      baseUrl: client.baseUrl,
      allowedReleasePaths,
      currentPage: page
    });
    if (pageItems.length === 0) {
      if (linkedNext) reject("github_api_pagination", `Empty release page ${page} unexpectedly advertised another page.`);
      return { releases, pagesRead: page };
    }
    if (linkedNext) {
      nextUrl = linkedNext;
      page += 1;
      continue;
    }
    if (pageItems.length < PAGE_SIZE) return { releases, pagesRead: page };
    page += 1;
    nextUrl = new URL(`${releasesPath}?per_page=${PAGE_SIZE}&page=${page}`, client.baseUrl);
  }
  reject("github_api_pagination", `GitHub release pagination exceeded ${MAX_RELEASE_PAGES} pages.`);
}

async function resolvePeeledTagSha({ client, repositoryPath, tag }) {
  const ref = (await client.get(`/repos/${repositoryPath}/git/ref/tags/${encodeURIComponent(tag)}`)).payload;
  if (ref?.ref !== `refs/tags/${tag}`) reject("tag_ref_mismatch", `Resolved ${ref?.ref || "an unknown ref"}, expected refs/tags/${tag}.`);
  let target = ref.object;
  for (let depth = 0; depth < 8; depth += 1) {
    const type = String(target?.type || "");
    const sha = normalizeSha(target?.sha, `Tag ${tag} target`);
    if (type === "commit") return sha;
    if (type !== "tag") reject("invalid_tag_target", `Tag ${tag} resolves to unsupported object type ${type || "unknown"}.`);
    target = (await client.get(`/repos/${repositoryPath}/git/tags/${sha}`)).payload?.object;
  }
  reject("tag_peel_depth", `Tag ${tag} exceeded the annotated-tag peel depth limit.`);
}

export async function resolveGitHubRelease({ client, repository, tag, expectedSha }) {
  const normalizedExpectedSha = validateInputs({ repository, tag, expectedSha });
  const repositoryPath = encodeRepository(repository);
  const remoteTagSha = await resolvePeeledTagSha({ client, repositoryPath, tag });
  if (remoteTagSha !== normalizedExpectedSha) {
    reject("tag_sha_mismatch", `Remote tag ${tag} peels to ${remoteTagSha}, expected ${normalizedExpectedSha}.`);
  }

  const { releases, pagesRead } = await listAllReleases({ client, repositoryPath });
  const matching = releases.filter((release) => release.tag_name === tag);
  if (matching.length > 1) {
    reject("release_conflict", `Found multiple GitHub releases for exact tag ${tag}.`, {
      releaseIds: matching.map((release) => release.id),
      states: matching.map((release) => release.draft ? "draft" : "published")
    });
  }

  const release = matching[0];
  if (!release) {
    return {
      repository,
      tag,
      expectedReleaseSha: normalizedExpectedSha,
      remoteTagSha,
      pagesRead,
      releaseCount: releases.length,
      state: "none",
      action: "create_draft",
      release: null
    };
  }
  const expectedPrerelease = /-rc\.\d+$/.test(tag);
  if (release.prerelease !== expectedPrerelease) {
    reject("release_state_mismatch", `Release ${release.id} prerelease state does not match exact tag ${tag}.`);
  }
  const state = release.draft ? "draft" : "published";
  return {
    repository,
    tag,
    expectedReleaseSha: normalizedExpectedSha,
    remoteTagSha,
    pagesRead,
    releaseCount: releases.length,
    state,
    action: state === "draft" ? "reuse_draft" : "verify_published",
    release: {
      id: release.id,
      tagName: release.tag_name,
      draft: release.draft,
      prerelease: release.prerelease,
      targetCommitish: typeof release.target_commitish === "string" ? release.target_commitish : null,
      htmlUrl: typeof release.html_url === "string" ? release.html_url : null
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
  const evidence = await resolveGitHubRelease({
    client: createReleaseStateClient({
      token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
      apiUrl: args["api-url"] || process.env.GITHUB_API_URL || "https://api.github.com"
    }),
    repository: args.repository || process.env.GITHUB_REPOSITORY || "",
    tag: args.tag || process.env.RELEASE_TAG || "",
    expectedSha: args["expected-sha"] || process.env.EXPECTED_RELEASE_SHA || ""
  });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.output) writeFileSync(args.output, serialized, "utf8");
  else process.stdout.write(serialized);
  if (args["github-output"]) {
    appendFileSync(
      args["github-output"],
      [
        `published=${evidence.state === "published"}`,
        `release_id=${evidence.release?.id || 0}`,
        `release_state=${evidence.state}`,
        `remote_tag_sha=${evidence.remoteTagSha}`
      ].join("\n") + "\n",
      "utf8"
    );
  }
  console.log(
    `Resolved ${evidence.tag} at ${evidence.remoteTagSha}: ${evidence.state} after ${evidence.pagesRead} release page(s).`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const code = error instanceof ReleaseStateError ? error.code : "unexpected_error";
    console.error(`[${code}] ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof ReleaseStateError && error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  });
}
