import type { SongInfo, SongSource } from "../lib/types";
import { parseSong, SongParseError } from "../lib/song-parser";

type LiveParseCase = {
  input: string;
  source: SongSource;
  title: RegExp;
  artist: RegExp;
  album?: RegExp;
  parseMethod: RegExp;
};

// These are live provider probes rather than hermetic CI fixtures; each case
// validates stable semantic fields while allowing localized metadata variants.
const DEFAULT_TEST_CASES: LiveParseCase[] = [
  {
    input: "https://y.qq.com/n/ryqq/songDetail/577816187",
    source: "qq",
    title: /^第57次取消发送$/,
    artist: /卢润泽/,
    album: /^第57次取消发送$/,
    parseMethod: /^qq-html-json$/
  },
  {
    input: "https://music.163.com/#/song?id=186016",
    source: "netease",
    title: /^晴天$/,
    artist: /^周杰伦$/,
    album: /^叶惠美$/,
    parseMethod: /^netease-api$/
  },
  {
    input: "https://music.apple.com/us/song/sunny-day/1721464906?l=zh-Hant-TW",
    source: "apple",
    title: /^(晴天|Sunny Day)$/,
    artist: /^(周杰伦|周杰倫|Jay Chou)$/,
    album: /^(叶惠美|葉惠美|Yeh, Hwei-Mei)$/,
    parseMethod: /^apple-lookup$/
  },
  {
    input: "https://open.spotify.com/track/5pIcwtJYNJx93l420oR2Vm",
    source: "spotify",
    title: /^晴天$/,
    artist: /^(周杰伦|周杰倫|Jay Chou)$/,
    parseMethod: /^(spotify-oembed|spotify-og)$/
  },
  {
    input: "https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv",
    source: "spotify",
    title: /^Bohemian Rhapsody - Remastered 2011$/,
    artist: /^Queen$/,
    parseMethod: /^(spotify-oembed|spotify-og)$/
  }
];

async function main() {
  const input = process.argv.slice(2).join(" ").trim();
  const cases = input ? [{ input }] : DEFAULT_TEST_CASES;
  const results = [];

  for (const testCase of cases) {
    results.push(await parseInput(testCase.input, "source" in testCase ? testCase : undefined));
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

async function parseInput(input: string, expected?: LiveParseCase) {
  try {
    const data = await parseSong(input);
    const mismatches = expected ? validateResult(data, expected) : [];
    if (mismatches.length > 0) {
      return {
        ok: false as const,
        input,
        error: `Parsed metadata did not match the expected song: ${mismatches.join("; ")}`,
        data
      };
    }
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

function validateResult(data: SongInfo, expected: LiveParseCase) {
  const mismatches: string[] = [];
  if (data.source !== expected.source) mismatches.push(`source=${data.source}`);
  if (!expected.title.test(data.title)) mismatches.push(`title=${JSON.stringify(data.title)}`);
  if (!expected.artist.test(data.artist)) mismatches.push(`artist=${JSON.stringify(data.artist)}`);
  if (expected.album && !expected.album.test(data.album || "")) mismatches.push(`album=${JSON.stringify(data.album || "")}`);
  if (!expected.parseMethod.test(data.parseMethod || "")) {
    mismatches.push(`parseMethod=${JSON.stringify(data.parseMethod || "")}`);
  }
  return mismatches;
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
