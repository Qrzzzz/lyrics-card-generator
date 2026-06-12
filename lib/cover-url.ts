import type { SongSource } from "@/lib/types";

export function getHighResolutionCoverUrl(url: string | undefined, source: SongSource) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) {
    return url ?? "";
  }

  if (source === "apple") {
    return url.replace(/(\d+)x(\d+)bb\.(jpg|jpeg|png|webp)(?=($|\?))/i, "1200x1200bb.$3");
  }

  if (source === "netease") {
    return replaceNeteaseParam(url);
  }

  if (source === "qq") {
    return url.replace(/T002R\d+x\d+M000/i, "T002R1000x1000M000").replace(/R\d+x\d+/i, "R1000x1000");
  }

  return url;
}

function replaceNeteaseParam(url: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("param", "1000y1000");
    return parsed.toString();
  } catch {
    if (url.includes("param=")) {
      return url.replace(/([?&]param=)\d+y\d+/i, "$11000y1000");
    }

    return `${url}${url.includes("?") ? "&" : "?"}param=1000y1000`;
  }
}
