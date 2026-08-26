"use client";

import {
  getLyricsCardDesktopApi,
  type NativeConfirmDialogOptions,
  type NativeAlertDialogOptions
} from "@/lib/desktop-api";

function browserMessage(message: string, detail: string) {
  return detail ? `${message}\n\n${detail}` : message;
}

export async function showSystemConfirm(options: NativeConfirmDialogOptions) {
  const desktop = getLyricsCardDesktopApi();
  if (desktop?.showNativeConfirm) {
    try {
      return await desktop.showNativeConfirm(options);
    } catch {
      // Development/browser fallback retains a usable confirmation if native IPC is unavailable.
    }
  }
  return window.confirm(browserMessage(options.message, options.detail));
}

export async function showSystemAlert(options: NativeAlertDialogOptions) {
  const desktop = getLyricsCardDesktopApi();
  if (desktop?.showNativeAlert) {
    try {
      await desktop.showNativeAlert(options);
      return;
    } catch {
      // Development/browser fallback retains a visible error if native IPC is unavailable.
    }
  }
  window.alert(browserMessage(options.message, options.detail));
}
