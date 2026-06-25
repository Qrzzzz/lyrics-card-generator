import { parseSong, SongParseError } from "../lib/song-parser";

const DEFAULT_TEST_INPUTS = [
  "https://music.apple.com/cn/song/opposite/1677892095",
  "https://music.163.com/song?id=1827600686",
  "https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV",
  "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl"
];

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  const inputs = input ? [input] : DEFAULT_TEST_INPUTS;
  const results = [];

  for (const testInput of inputs) {
    results.push(await parseInput(testInput));
  }

  if (input) {
    const [result] = results;
    console[result.ok ? "log" : "error"](JSON.stringify(result, null, 2));
  } else {
    console.log(JSON.stringify({ ok: results.every((result) => result.ok), results }, null, 2));
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

async function parseInput(input: string) {
  try {
    const data = await parseSong(input);
    return { ok: true as const, input, data };
  } catch (error) {
    if (error instanceof SongParseError) {
      return {
        ok: false as const,
        input,
        error: error.message,
        details: error.details
      };
    }

    return {
      ok: false as const,
      input,
      error: error instanceof Error ? error.message : "Unknown parse failure."
    };
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown parse failure."
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
