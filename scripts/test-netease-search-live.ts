import { resolveNeteaseSong, searchNeteaseSongs } from "../lib/music-search/netease";

async function main() {
  const keyword = process.argv.slice(2).join(" ").trim() || "晴天 周杰伦";
  const results = await searchNeteaseSongs(keyword, 8);
  console.log(JSON.stringify({ keyword, results }, null, 2));

  const first = results[0];
  if (!first) {
    return;
  }

  const resolved = await resolveNeteaseSong(first.id);
  console.log(JSON.stringify({ first: resolved }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
