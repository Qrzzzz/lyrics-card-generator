import type { SongSource } from "@/lib/types";

export type ExampleSongId = "opposite";

export type ExampleSong = {
  id: ExampleSongId;
  title: string;
  artist: string;
  url: string;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  source: SongSource;
};

export const EXAMPLE_SONGS: ExampleSong[] = [{
  id: "opposite",
  title: "opposite",
  artist: "Sabrina Carpenter",
  url: "https://music.apple.com/cn/song/opposite/1677892095",
  lyrics: ["And I know now", "Even if I tried to change", "That somehow", "You'd end up with her anyway"].join("\n"),
  translationText: ["我如今才明白", "纵使我拼尽全力改写结局", "命运兜兜转转", "你终究还是会走向她"].join("\n"),
  translationEnabled: true,
  source: "apple"
}];
