export function revokeReplacedBlobUrl(
  previousUrl?: string,
  nextUrl?: string,
  preservedUrl?: string
) {
  const previous = previousUrl ?? "";
  if (
    !previous.startsWith("blob:") ||
    previous === (nextUrl ?? "") ||
    previous === (preservedUrl ?? "")
  ) {
    return false;
  }

  URL.revokeObjectURL(previous);
  return true;
}

export type BlobUrlRetirementState = {
  currentUrl: string;
  retiredUrls: Set<string>;
};

export function createBlobUrlRetirementState(initialUrl?: string): BlobUrlRetirementState {
  return {
    currentUrl: initialUrl ?? "",
    retiredUrls: new Set<string>()
  };
}

export function reconcileBlobUrlRetirement(
  state: BlobUrlRetirementState,
  nextUrl?: string,
  preservedUrl?: string
) {
  // Replaced URLs enter a retirement set first so a separately preserved
  // preview/export reference can delay revocation until a later reconciliation.
  const next = nextUrl ?? "";
  if (state.currentUrl.startsWith("blob:") && state.currentUrl !== next) {
    state.retiredUrls.add(state.currentUrl);
  }

  state.currentUrl = next;
  state.retiredUrls.delete(next);

  const revokedUrls: string[] = [];
  for (const retiredUrl of state.retiredUrls) {
    if (revokeReplacedBlobUrl(retiredUrl, next, preservedUrl)) {
      state.retiredUrls.delete(retiredUrl);
      revokedUrls.push(retiredUrl);
    }
  }
  return revokedUrls;
}
