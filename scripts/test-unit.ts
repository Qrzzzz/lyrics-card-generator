import assert from "node:assert/strict";
import { estimateLandscapeLyricsHeight, getLandscapeTypography } from "../lib/landscape-typography";
import { getLandscapeSlots } from "../lib/landscape-layout";
import { extractNeteaseSongId } from "../lib/parsers/netease";
import { extractQQSongId, extractQQSongMid } from "../lib/parsers/qq";
import { fetchPublicUrl, readTextWithLimit } from "../lib/safe-fetch";
import { detectSource, splitTitleAndArtist } from "../lib/song-parser";
import { extractFirstUrl } from "../lib/url-normalize";
import { validatePublicHttpUrl } from "../lib/url-safety";

async function main() {
  testUrlExtraction();
  testSourceDetection();
  testPlatformIds();
  testTitleSplitting();
  await testUrlSafety();
  await testSafeRedirects();
  await testResponseLimits();
  testLandscapeTextFit();
  console.log("unit tests passed");
}

function testUrlExtraction() {
  assert.equal(
    extractFirstUrl("分享 https://music.163.com/#/song?id=1827600686。"),
    "https://music.163.com/song?id=1827600686"
  );
  assert.equal(
    extractFirstUrl("Listen: https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV,"),
    "https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"
  );
  assert.equal(extractFirstUrl("no url here"), "");
}

function testSourceDetection() {
  assert.equal(detectSource("https://music.163.com/song?id=1827600686"), "netease");
  assert.equal(detectSource("https://y.music.163.com/m/song?id=1827600686"), "netease");
  assert.equal(detectSource("https://163cn.tv/abc123"), "netease");
  assert.equal(detectSource("https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"), "qq");
  assert.equal(detectSource("https://i.y.qq.com/v8/playsong.html?songmid=0039MnYb0qxYhV"), "qq");
  assert.equal(detectSource("https://music.apple.com/us/album/test/123?i=456"), "apple");
  assert.equal(detectSource("https://www.qq.com/news/a.html"), "unknown");
  assert.equal(detectSource("https://open.weixin.qq.com/connect/oauth2/authorize"), "unknown");
}

function testPlatformIds() {
  assert.equal(extractNeteaseSongId("https://music.163.com/#/song?id=1827600686"), "1827600686");
  assert.equal(extractNeteaseSongId("https://y.music.163.com/m/song?id=1827600686"), "1827600686");
  assert.deepEqual(extractQQSongId("https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV"), {
    type: "songmid",
    value: "0039MnYb0qxYhV"
  });
  assert.deepEqual(extractQQSongId("https://i.y.qq.com/n2/m/share/details/song.html?songid=97773"), {
    type: "songid",
    value: "97773"
  });
  assert.equal(extractQQSongMid("https://i.y.qq.com/v8/playsong.html?songmid=0039MnYb0qxYhV"), "0039MnYb0qxYhV");
}

function testTitleSplitting() {
  assert.deepEqual(splitTitleAndArtist("晴天 - 周杰伦 - QQ音乐", "qq"), {
    title: "晴天",
    artist: "周杰伦"
  });
  assert.deepEqual(splitTitleAndArtist("Cruel Summer by Taylor Swift on Apple Music", "apple"), {
    title: "Cruel Summer",
    artist: "Taylor Swift"
  });
}

async function testUrlSafety() {
  assert.equal((await validatePublicHttpUrl("file:///etc/passwd")).ok, false);
  assert.equal((await validatePublicHttpUrl("http://127.0.0.1/")).ok, false);
  assert.equal((await validatePublicHttpUrl("http://0x7f000001/")).ok, false);
  assert.equal((await validatePublicHttpUrl("http://localhost/")).ok, false);
}

async function testSafeRedirects() {
  const blockedValidator = async (rawUrl: string) => {
    if (rawUrl.includes("169.254.169.254")) {
      return { ok: false as const, error: "blocked redirect target" };
    }

    return { ok: true as const, url: new URL(rawUrl) };
  };

  await assert.rejects(
    () =>
      fetchPublicUrl("https://music.example/start", {
        fetchImpl: async () => new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
        validateUrl: blockedValidator
      }),
    /blocked redirect target/
  );

  const calls: string[] = [];
  const ok = await fetchPublicUrl("https://music.example/start", {
    fetchImpl: async (input) => {
      const url = input.toString();
      calls.push(url);
      if (url.endsWith("/start")) {
        return new Response("", { status: 302, headers: { location: "/final" } });
      }

      return new Response("ok", { status: 200 });
    },
    validateUrl: async (rawUrl) => ({ ok: true as const, url: new URL(rawUrl) })
  });

  assert.equal(ok.finalUrl, "https://music.example/final");
  assert.deepEqual(calls, ["https://music.example/start", "https://music.example/final"]);
}

async function testResponseLimits() {
  await assert.rejects(() => readTextWithLimit(new Response("12345"), 4), /too large/i);
  assert.equal(await readTextWithLimit(new Response("12345"), 5), "12345");
}

function testLandscapeTextFit() {
  const slots = getLandscapeSlots(1920, 1080, {
    showCover: true,
    allowTwoLineTitle: false,
    showSongInfo: true
  });

  const pureTypography = getLandscapeTypography({
    width: 1920,
    height: 1080,
    lineCount: 12,
    hasTranslation: false,
    contentMode: "lyrics",
    maxHeight: slots.lyrics.maxHeight,
    lineHeight: 1.32
  });
  const pureHeight = estimateLandscapeLyricsHeight({
    lineCount: 12,
    hasTranslation: false,
    lyricFontSize: pureTypography.lyricFontSize,
    lineHeight: 1.32
  });
  assert.ok(pureHeight <= slots.lyrics.maxHeight, `12-line landscape lyrics should fit, got ${pureHeight}`);

  const translatedTypography = getLandscapeTypography({
    width: 1920,
    height: 1080,
    lineCount: 6,
    hasTranslation: true,
    contentMode: "lyrics",
    maxHeight: slots.lyrics.maxHeight,
    lineHeight: 1.32
  });
  const translatedHeight = estimateLandscapeLyricsHeight({
    lineCount: 6,
    hasTranslation: true,
    lyricFontSize: translatedTypography.lyricFontSize,
    translationFontSize: translatedTypography.translationFontSize,
    lineHeight: 1.32
  });
  assert.ok(translatedHeight <= slots.lyrics.maxHeight, `6 translated landscape pairs should fit, got ${translatedHeight}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
