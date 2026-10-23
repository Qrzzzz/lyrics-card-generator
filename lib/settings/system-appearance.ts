"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-color-scheme: dark)";
export function getSystemDarkAppearance(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches : false;
}
function subscribe(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const serverSnapshot = () => false;
export function useSystemDarkAppearance() {
  return useSyncExternalStore(subscribe, getSystemDarkAppearance, serverSnapshot);
}
