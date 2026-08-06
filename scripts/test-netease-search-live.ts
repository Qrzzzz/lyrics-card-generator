import { resolveNeteaseSong, searchNeteaseSongs } from "../lib/music-search/netease";

const DEFAULT_KEYWORD = "晴天 周杰伦";
const DEFAULT_CANONICAL = {
  id: "186016",
  title: "晴天",
  artist: "周杰伦"
} as const;

class LiveEnvironmentFailure extends Error {
  constructor(
    readonly stage: "search" | "resolve",
    readonly originalError: unknown
  ) {
    super(originalError instanceof Error ? originalError.message : String(originalError));
    this.name = "LiveEnvironmentFailure";
  }
}

class LiveLogicFailure extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "LiveLogicFailure";
  }
}

async function runLiveStep<T>(stage: "search" | "resolve", action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    throw new LiveEnvironmentFailure(stage, error);
  }
}

function requireLogic(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) {
    throw new LiveLogicFailure(code, message);
  }
}

async function main() {
  const suppliedKeyword = process.argv.slice(2).join(" ").trim();
  const keyword = suppliedKeyword || DEFAULT_KEYWORD;
  const results = await runLiveStep("search", () => searchNeteaseSongs(keyword, 8));
  console.log(JSON.stringify({ keyword, results }, null, 2));

  requireLogic(results.length > 0, "empty_results", `NetEase returned no results for "${keyword}".`);

  if (suppliedKeyword) {
    console.log(JSON.stringify({ ok: true, mode: "custom-query-diagnostic" }, null, 2));
    return;
  }

  const canonical = results.find((song) => song.id === DEFAULT_CANONICAL.id);
  requireLogic(
    canonical,
    "canonical_not_visible",
    `Canonical NetEase ID ${DEFAULT_CANONICAL.id} was not visible in the first ${results.length} results.`
  );
  requireLogic(
    canonical.title === DEFAULT_CANONICAL.title,
    "canonical_title_mismatch",
    `Expected title "${DEFAULT_CANONICAL.title}", received "${canonical.title}".`
  );
  requireLogic(
    canonical.artist === DEFAULT_CANONICAL.artist &&
      canonical.artists.length === 1 &&
      canonical.artists[0] === DEFAULT_CANONICAL.artist,
    "canonical_artist_mismatch",
    `Expected exact artist "${DEFAULT_CANONICAL.artist}", received "${canonical.artist}".`
  );

  const resolved = await runLiveStep("resolve", () => resolveNeteaseSong(canonical.id));
  requireLogic(
    resolved.song.title === DEFAULT_CANONICAL.title &&
      resolved.song.artist === DEFAULT_CANONICAL.artist &&
      resolved.song.originalUrl === canonical.pageUrl,
    "canonical_resolve_mismatch",
    `Resolved canonical row as "${resolved.song.title}" by "${resolved.song.artist}".`
  );

  console.log(JSON.stringify({ ok: true, canonical, resolved }, null, 2));
}

main().catch((error) => {
  const failure =
    error instanceof LiveEnvironmentFailure
      ? { ok: false, failureType: "environment", stage: error.stage, message: error.message }
      : error instanceof LiveLogicFailure
        ? { ok: false, failureType: "logic", code: error.code, message: error.message }
        : {
            ok: false,
            failureType: "logic",
            code: "unexpected_test_failure",
            message: error instanceof Error ? error.message : String(error)
          };
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
