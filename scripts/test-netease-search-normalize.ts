import assert from "node:assert/strict";
import {
  buildNeteaseSongUrl,
  normalizeNeteaseDetail,
  normalizeNeteaseLyrics,
  normalizeNeteaseSearchSongs
} from "../lib/music-search/netease";

const legacyShape = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        {
          id: 186016,
          name: "晴天",
          artists: [{ name: "周杰伦" }],
          album: { name: "叶惠美", picUrl: "https://example.com/a.jpg" },
          duration: 269000
        }
      ]
    }
  },
  8
);

assert.equal(legacyShape.length, 1);
assert.equal(legacyShape[0].id, "186016");
assert.equal(legacyShape[0].title, "晴天");
assert.equal(legacyShape[0].artist, "周杰伦");
assert.deepEqual(legacyShape[0].artists, ["周杰伦"]);
assert.equal(legacyShape[0].album, "叶惠美");
assert.equal(legacyShape[0].durationMs, 269000);
assert.equal(legacyShape[0].coverUrl, "https://example.com/a.jpg");
assert.equal(legacyShape[0].pageUrl, "https://music.163.com/song?id=186016");

const modernShape = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        {
          id: "123",
          name: "Song",
          ar: [{ name: "Artist A" }, { name: "Artist B" }],
          al: { name: "Album", blurPicUrl: "https://example.com/blur.jpg" },
          dt: 1000
        },
        { name: "Missing ID" },
        { id: 456 }
      ]
    }
  },
  8
);

assert.equal(modernShape.length, 1);
assert.equal(modernShape[0].artist, "Artist A / Artist B");
assert.equal(modernShape[0].durationMs, 1000);
assert.equal(modernShape[0].coverUrl, "https://example.com/blur.jpg");

const limited = normalizeNeteaseSearchSongs(
  { result: { songs: [{ id: 1, name: "A" }, { id: 2, name: "B" }] } },
  1
);
assert.equal(limited.length, 1);

const lyrics = normalizeNeteaseLyrics({
  lrc: {
    lyric: "[ar:周杰伦]\n[ti:晴天]\n[00:01.00]故事的小黄花\n[00:02.12][00:03.12]从出生那年就飘着"
  }
});
assert.equal(lyrics, "故事的小黄花\n从出生那年就飘着");

const detail = normalizeNeteaseDetail(
  {
    songs: [
      {
        name: "晴天",
        artists: [{ name: "周杰伦" }],
        album: { name: "叶惠美", picUrl: "https://example.com/a.jpg" }
      }
    ]
  },
  "186016"
);
assert.equal(detail.source, "netease");
assert.equal(detail.title, "晴天");
assert.equal(detail.artist, "周杰伦");
assert.equal(detail.album, "叶惠美");
assert.equal(detail.originalUrl, buildNeteaseSongUrl("186016"));
assert.equal(detail.finalUrl, buildNeteaseSongUrl("186016"));
assert.equal(detail.parseMethod, "netease-search");

console.log(JSON.stringify({ ok: true, neteaseSearchNormalizeTests: 20 }, null, 2));
