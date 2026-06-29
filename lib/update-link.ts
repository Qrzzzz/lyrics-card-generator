import type { UpdateResult } from "@/lib/github-update";

export function getUpdateLink(result: UpdateResult) {
  if (result.status === "latest" || result.status === "update-available") {
    return result.releaseUrl;
  }

  return "";
}
