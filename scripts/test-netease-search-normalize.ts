import assert from "node:assert/strict";
import {
  buildNeteaseSongUrl,
  normalizeNeteaseDetail,
  normalizeNeteaseLyrics,
  normalizeNeteaseSearchSongs,
  searchNeteaseSongs
} from "../lib/music-search/netease";

function rawSearchSong(id: number, name: string, artists: string[]) {
  return {
    id,
    name,
    ar: artists.map((artist) => ({ name: artist })),
    al: { name: `Album ${id}` }
  };
}

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

const canonicalRanking = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(101, "晴天", ["周杰伦-", "A-LNK"]),
        rawSearchSong(102, "晴天", ["周杰伦."]),
        rawSearchSong(103, "晴天（正式版）", ["周杰伦、"]),
        rawSearchSong(186016, "晴天", ["周杰伦"]),
        rawSearchSong(104, "晴天", ["周杰伦、"]),
        rawSearchSong(105, "晴天", ["周杰伦", "A-LNK"])
      ]
    }
  },
  6,
  "晴天 周杰伦"
);
assert.equal(canonicalRanking[0].id, "186016");
assert.deepEqual(
  canonicalRanking.map((song) => song.id),
  ["186016", "105", "101", "102", "104", "103"]
);

const unicodeRanking = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(201, "Café", ["THE BAND."]),
        rawSearchSong(202, "Ｃａｆｅ\u0301", ["The  Band"])
      ]
    }
  },
  2,
  "  Café   THE BAND  "
);
assert.equal(unicodeRanking[0].id, "202");
assert.deepEqual(
  unicodeRanking.map((song) => song.id),
  ["202", "201"]
);

const versionCandidates = [
  rawSearchSong(301, "Orbit", ["Artist"]),
  rawSearchSong(302, "Orbit (Acoustic)", ["Artist"]),
  rawSearchSong(303, "Orbit (Live)", ["Artist"])
];
assert.equal(
  normalizeNeteaseSearchSongs({ result: { songs: versionCandidates } }, 3, "Orbit Artist")[0].id,
  "301"
);
assert.equal(
  normalizeNeteaseSearchSongs({ result: { songs: versionCandidates } }, 3, "Orbit (Live) Artist")[0]
    .id,
  "303"
);

const multiArtistRanking = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(401, "Duet", ["Artist A"]),
        rawSearchSong(402, "Duet", ["Artist A", "Artist B."]),
        rawSearchSong(403, "Duet", ["Artist A", "Artist B"])
      ]
    }
  },
  3,
  "Artist B / DUET / Artist A"
);
assert.deepEqual(
  multiArtistRanking.map((song) => song.id),
  ["403", "401", "402"]
);

const artistOnlyRanking = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(501, "First", ["Artist A."]),
        rawSearchSong(502, "Second", ["Artist A", "Artist B"]),
        rawSearchSong(503, "Third", ["Artist A"])
      ]
    }
  },
  3,
  " artist a "
);
assert.deepEqual(
  artistOnlyRanking.map((song) => song.id),
  ["503", "502", "501"]
);

const titleOnlyRanking = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(601, "Orbit (Live)", ["First"]),
        rawSearchSong(602, "Orbit", ["Second"]),
        rawSearchSong(603, "Orbit", ["Third"])
      ]
    }
  },
  3,
  " orbit "
);
assert.deepEqual(
  titleOnlyRanking.map((song) => song.id),
  ["602", "603", "601"]
);

const weakFallback = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(701, "Alpha", ["One"]),
        rawSearchSong(702, "Beta", ["Two"]),
        rawSearchSong(703, "Gamma", ["Three"])
      ]
    }
  },
  3,
  "no semantic overlap"
);
assert.deepEqual(
  weakFallback.map((song) => song.id),
  ["701", "702", "703"]
);

const rankedThenLimited = normalizeNeteaseSearchSongs(
  {
    result: {
      songs: [
        rawSearchSong(801, "Other", ["Else"]),
        rawSearchSong(802, "晴天", ["周杰伦."]),
        rawSearchSong(803, "晴天", ["周杰伦"]),
        rawSearchSong(804, "晴天 (Live)", ["周杰伦"])
      ]
    }
  },
  2,
  "晴天 周杰伦"
);
assert.deepEqual(
  rankedThenLimited.map((song) => song.id),
  ["803", "802"]
);

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

async function testCandidatePool() {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let requestedLimit = "";

  globalThis.fetch = (async (_input, init) => {
    fetchCalls += 1;
    const form = init?.body;
    assert.ok(form instanceof URLSearchParams);
    requestedLimit = form.get("limit") || "";
    assert.equal(form.get("s"), "晴天 周杰伦");
    assert.equal(form.get("offset"), "0");
    assert.equal(form.get("type"), "1");

    return Response.json({
      result: {
        songs: [
          rawSearchSong(901, "晴天", ["周杰伦."]),
          rawSearchSong(186016, "晴天", ["周杰伦"]),
          rawSearchSong(902, "Other", ["Else"])
        ]
      }
    });
  }) as typeof fetch;

  try {
    const results = await searchNeteaseSongs("晴天 周杰伦", 2);
    assert.equal(requestedLimit, "100");
    assert.deepEqual(
      results.map((song) => song.id),
      ["186016", "901"]
    );
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void testCandidatePool()
  .then(() => {
    console.log(JSON.stringify({ ok: true, neteaseSearchNormalizeTests: 40 }, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
