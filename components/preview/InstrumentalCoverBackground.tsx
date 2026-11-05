"use client";

import { useEffect, useState } from "react";
import { prepareInstrumentalCoverBackground } from "@/lib/instrumental-cover-background";

export function InstrumentalCoverBackground({
  sourceUrl, width, height, onError
}: {
  sourceUrl?: string;
  width: number;
  height: number;
  onError: () => void;
}) {
  const key = JSON.stringify({ sourceUrl, width, height });
  const [prepared, setPrepared] = useState<{ key: string; url: string } | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    if (!sourceUrl) return;
    let active = true;
    void prepareInstrumentalCoverBackground({ sourceUrl, width, height }).then(
      (url) => { if (active) setPrepared({ key, url }); },
      () => { if (active) onError(); }
    );
    return () => { active = false; };
  }, [sourceUrl, width, height, key, onError]);

  const url = prepared?.key === key ? prepared.url : undefined;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-testid="instrumental-album-artwork"
      data-cover-extension-state={!sourceUrl ? "fallback" : url && loadedKey === key ? "ready" : "pending"}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Baked pixels are shared with image export.
        <img key={key} src={url} alt="" className="absolute inset-0 h-full w-full"
          onLoad={() => setLoadedKey(key)} onError={onError} />
      ) : null}
    </div>
  );
}
