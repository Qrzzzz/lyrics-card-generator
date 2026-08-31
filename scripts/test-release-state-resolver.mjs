import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createReleaseStateClient,
  ReleaseStateError,
  resolveGitHubRelease
} from "./resolve-github-release.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/release-state/cases.json", import.meta.url), "utf8"));

function release(id, tagName, state) {
  return {
    id,
    tag_name: tagName,
    draft: state === "draft",
    prerelease: false,
    target_commitish: fixture.expectedSha,
    html_url: `https://github.test/releases/${id}`
  };
}

function filler(page, index) {
  const id = page * 100_000 + index + 1;
  return release(id, `v0.${page}.${index}`, "published");
}

function response(payload, { status = 200, link = "", invalidJson = false } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "link" ? link : "" },
    async json() {
      if (invalidJson) throw new SyntaxError("fixture invalid JSON");
      return payload;
    },
    async text() {
      return typeof payload === "string" ? payload : JSON.stringify(payload);
    }
  };
}

function scenarioFetch(scenario, phaseState = undefined) {
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    requests.push(`${parsed.pathname}${parsed.search}`);
    if (parsed.pathname.endsWith(`/git/ref/tags/${fixture.tag}`)) {
      return response({
        ref: `refs/tags/${fixture.tag}`,
        object: { type: "tag", sha: fixture.annotatedTagSha }
      });
    }
    if (parsed.pathname.endsWith(`/git/tags/${fixture.annotatedTagSha}`)) {
      return response({ object: { type: "commit", sha: fixture.expectedSha } });
    }
    if (parsed.pathname === `/repos/${fixture.repository}`) {
      return response({ id: fixture.repositoryId, full_name: fixture.repository });
    }
    if (!parsed.pathname.endsWith("/releases")) return response("unexpected fixture route", { status: 404 });

    const page = Number(parsed.searchParams.get("page"));
    if (scenario.errorPage === page) return response("fixture API outage", { status: 503 });
    if (scenario.malformedPage === page) return response({ releases: [] });

    if (scenario.matches) {
      const matches = scenario.matches.map((state, index) => release(700 + index, fixture.tag, state));
      return response(matches);
    }
    if (phaseState) {
      return response(phaseState === "none" ? [] : [release(800, fixture.tag, phaseState)]);
    }
    if (scenario.pagination === "empty-probe") {
      if (page > scenario.fullPages) return response([]);
      return response(Array.from({ length: 100 }, (_, index) => filler(page, index)));
    }

    if (page > scenario.pages) return response([]);
    const isLastPage = page === scenario.pages;
    const items = Array.from({ length: isLastPage ? 1 : 100 }, (_, index) => filler(page, index));
    if (page === scenario.targetPage) items[0] = release(900, fixture.tag, scenario.targetState);
    const linkedReleasesPath = scenario.linkRepositoryId
      ? `/repositories/${scenario.linkRepositoryId}/releases`
      : `/repos/${fixture.repository}/releases`;
    const link = !isLastPage
      ? `<https://api.github.test${linkedReleasesPath}?per_page=100&page=${page + 1}>; rel="next"`
      : "";
    return response(items, { link });
  };
  return { fetchImpl, requests };
}

async function resolveScenario(scenario, phaseState = undefined) {
  const mock = scenarioFetch(scenario, phaseState);
  const evidence = await resolveGitHubRelease({
    client: createReleaseStateClient({
      token: "fixture-token",
      apiUrl: "https://api.github.test",
      fetchImpl: mock.fetchImpl
    }),
    repository: fixture.repository,
    tag: fixture.tag,
    expectedSha: fixture.expectedSha
  });
  return { evidence, requests: mock.requests };
}

for (const scenario of fixture.scenarios) {
  if (scenario.phases) {
    const actions = [];
    for (const phase of scenario.phases) actions.push((await resolveScenario(scenario, phase)).evidence.action);
    assert.deepEqual(actions, scenario.expectedActions, `${scenario.name} safely re-resolves a duplicate-create race`);
    continue;
  }
  if (scenario.expectedError) {
    await assert.rejects(
      resolveScenario(scenario),
      (error) => error instanceof ReleaseStateError && error.code === scenario.expectedError,
      `${scenario.name} fails closed with ${scenario.expectedError}`
    );
    continue;
  }
  const { evidence, requests } = await resolveScenario(scenario);
  assert.equal(evidence.state, scenario.expectedState, `${scenario.name} resolves exact state`);
  assert.equal(evidence.remoteTagSha, fixture.expectedSha, `${scenario.name} stays bound to the authorized tag SHA`);
  if (scenario.pages) {
    assert.equal(evidence.pagesRead, scenario.pages, `${scenario.name} reads every advertised page`);
    assert.ok(requests.some((request) => request.includes(`page=${scenario.targetPage}`)), `${scenario.name} reaches the target page`);
  }
  if (scenario.pagination === "empty-probe") {
    assert.equal(evidence.pagesRead, scenario.fullPages + 1, `${scenario.name} terminates on the explicit empty page`);
  }
  assert.ok(["push", "workflow_dispatch"].includes(scenario.event), `${scenario.name} represents a supported release trigger`);
}

const movedTag = fixture.scenarios[0];
const moved = scenarioFetch(movedTag);
const movedClient = createReleaseStateClient({
  token: "fixture-token",
  apiUrl: "https://api.github.test",
  fetchImpl: async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith(`/git/tags/${fixture.annotatedTagSha}`)) {
      return response({ object: { type: "commit", sha: "cccccccccccccccccccccccccccccccccccccccc" } });
    }
    return moved.fetchImpl(url);
  }
});
await assert.rejects(
  resolveGitHubRelease({
    client: movedClient,
    repository: fixture.repository,
    tag: fixture.tag,
    expectedSha: fixture.expectedSha
  }),
  (error) => error instanceof ReleaseStateError && error.code === "tag_sha_mismatch",
  "a moved tag cannot reuse a release resolved for the authorized SHA"
);

const wrongCanonicalRepository = {
  ...fixture.scenarios.find((scenario) => scenario.linkRepositoryId),
  linkRepositoryId: fixture.repositoryId + 1
};
await assert.rejects(
  resolveScenario(wrongCanonicalRepository),
  (error) => error instanceof ReleaseStateError && error.code === "github_api_link",
  "a canonical numeric pagination path for another repository fails closed"
);

console.log(`Release state resolver fixture tests passed (${fixture.scenarios.length} scenarios)`);
