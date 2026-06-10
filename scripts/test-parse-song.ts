import { parseSong, SongParseError } from "../lib/song-parser";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "Usage: npm run parse:test -- \"https://music.163.com/song?id=...\""
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  try {
    const data = await parseSong(input);
    console.log(JSON.stringify({ ok: true, data }, null, 2));
  } catch (error) {
    if (error instanceof SongParseError) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            error: error.message,
            details: error.details
          },
          null,
          2
        )
      );
    } else {
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
    }
    process.exitCode = 1;
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
