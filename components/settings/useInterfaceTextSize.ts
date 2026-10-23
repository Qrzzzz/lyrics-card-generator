"use client";
import { useEffect } from "react";
import type { UiTextSize } from "@/lib/settings/types";
/** Portalled notifications share interface type tokens, while cards opt out. */
export function useInterfaceTextSize(value: UiTextSize) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.uiTextSize;
    root.dataset.uiTextSize = value;
    return () => { if (previous === undefined) delete root.dataset.uiTextSize; else root.dataset.uiTextSize = previous; };
  }, [value]);
}
