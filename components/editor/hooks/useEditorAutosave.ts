"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getLyricsCardDesktopApi } from "@/lib/desktop-api";
import { createEditorDraftSnapshot, editorDraftChangeKey, draftHasContent, restoreEditorDraft, type AutosaveStatus,
  type EditorDraftLease, type EditorDraftLoad, type EditorDraftSnapshot, type EditorDraftView } from "@/lib/editor-draft";
import type { ImportHistoryWriteResult } from "@/lib/import-history";
import { EditorAutosave } from "@/lib/persistence/editor-autosave";
import { shutdownCoordinator } from "@/lib/persistence/shutdown-coordinator";
import type { AppState } from "@/lib/types";

export function useEditorAutosave({ state, view, enabled, onRestore }: {
  state: AppState;
  view: EditorDraftView;
  enabled: boolean | undefined;
  onRestore: (state: AppState, view: EditorDraftView) => void;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("loading");
  const [ready, setReady] = useState(false);
  const inputs = useRef({ state, view, enabled, onRestore });
  inputs.current = { state, view, enabled, onRestore };
  const readyRef = useRef(false);
  const initialization = useRef<Promise<void> | null>(null);
  const generation = useRef(0);
  const lease = useRef<EditorDraftLease | null>(null);
  const origin = useRef<Promise<string | undefined>>(Promise.resolve(undefined));
  const revision = useRef(0);
  const ownedUrl = useRef("");
  const assets = useRef(new Map<string, Promise<string>>());
  const controllerRef = useRef<EditorAutosave<EditorDraftSnapshot> | null>(null);
  if (!controllerRef.current) controllerRef.current = new EditorAutosave({
    key: editorDraftChangeKey,
    write: async (snapshot) => {
      const desktop = getLyricsCardDesktopApi();
      if (!desktop) throw new Error("desktop_unavailable");
      const ownGeneration = generation.current;
      if (!lease.current) {
        const recordId = await origin.current;
        let result = await desktop.beginEditorDraft(recordId);
        // A failed first import or an automatically trimmed source must not make
        // the full working draft permanently unsavable. Never reuse a deleted ID.
        if (!result.ok && result.code === "not_found") result = await desktop.beginEditorDraft();
        if (!result.ok) throw new Error(result.code);
        if (generation.current !== ownGeneration) throw new Error("stale_draft");
        lease.current = result.data;
      }
      const ownedLease = lease.current;
      const persisted = structuredClone(snapshot);
      const coverAsset = await cacheCover(snapshot.content.coverUrl || snapshot.content.originalCoverUrl);
      if (coverAsset) {
        persisted.coverAsset = coverAsset;
        persisted.content.coverUrl = "";
        persisted.content.originalCoverUrl = "";
      }
      const formAsset = await cacheCover(snapshot.view.songInfoDraft?.coverUrl);
      if (formAsset && persisted.view.songInfoDraft) {
        persisted.formCoverAsset = formAsset;
        persisted.view.songInfoDraft.coverUrl = "";
        persisted.view.songInfoDraft.originalCoverUrl = "";
      }
      if (generation.current !== ownGeneration) throw new Error("stale_draft");
      const result = await desktop.writeEditorDraft(ownedLease.recordId, ownedLease.token, ++revision.current, JSON.stringify(persisted));
      if (!result.ok) throw new Error(result.code);
    },
    onStatus: setStatus
  });
  const controller = controllerRef.current;

  async function cacheCover(url?: string): Promise<string | undefined> {
    if (!url || !/^(blob:|data:)/i.test(url)) return undefined;
    const cached = assets.current.get(url);
    if (cached) return cached;
    const pending = (async () => {
      const dataUrl = await localImageDataUrl(url);
      const result = await getLyricsCardDesktopApi()!.saveEditorDraftCover(dataUrl);
      if (!result.ok) throw new Error(result.code);
      return result.data;
    })();
    assets.current.set(url, pending);
    try { return await pending; }
    catch (error) { assets.current.delete(url); throw error; }
  }

  function reset(nextState: AppState, record?: Promise<ImportHistoryWriteResult> | string, saved = false, nextView = inputs.current.view) {
    generation.current++;
    lease.current = null;
    revision.current = 0;
    ownedUrl.current = nextState.url;
    origin.current = typeof record === "string" ? Promise.resolve(record) : record
      ? record.then((result) => result.ok ? result.record.id : undefined, () => undefined)
      : Promise.resolve(undefined);
    const snapshot = createEditorDraftSnapshot(nextState, nextView);
    controller.reset(snapshot, saved);
    if (!saved && draftHasContent(snapshot)) controller.update(snapshot, true);
    setStatus(controller.getStatus());
  }

  async function restore(loaded: EditorDraftLoad, authorize: () => boolean = () => true) {
    const prepared = { ...loaded };
    for (const [dataKey, assetKey] of [["coverDataUrl", "coverAsset"], ["formCoverDataUrl", "formCoverAsset"]] as const) {
      const data = loaded[dataKey];
      const asset = loaded.snapshot[assetKey];
      if (data && asset) {
        const url = URL.createObjectURL(draftImageBlob(data));
        prepared[dataKey] = url;
        assets.current.set(url, Promise.resolve(asset));
      }
    }
    if (!authorize()) {
      if (prepared.coverDataUrl?.startsWith("blob:")) URL.revokeObjectURL(prepared.coverDataUrl);
      if (prepared.formCoverDataUrl?.startsWith("blob:")) URL.revokeObjectURL(prepared.formCoverDataUrl);
      return null;
    }
    const next = restoreEditorDraft(inputs.current.state, prepared);
    const restoredView = structuredClone(loaded.snapshot.view);
    if (restoredView.songInfoDraft && prepared.formCoverDataUrl) {
      restoredView.songInfoDraft.coverUrl = prepared.formCoverDataUrl;
      restoredView.songInfoDraft.originalCoverUrl = "";
    }
    reset(next, loaded.recordId, true, restoredView);
    inputs.current.onRestore(next, restoredView);
    return next;
  }

  const initializeRef = useRef<() => Promise<void>>(async () => undefined);
  async function initialize() {
    if (readyRef.current) return;
    const desktop = getLyricsCardDesktopApi();
    if (!desktop || !desktop.loadActiveEditorDraft) {
      readyRef.current = true;
      setReady(true);
      setStatus("disabled");
      return;
    }
    setStatus("loading");
    try {
      const result = await desktop.loadActiveEditorDraft();
      if (!result.ok) throw new Error(result.code);
      if (result.data) await restore(result.data);
      else reset(inputs.current.state);
      readyRef.current = true;
      setReady(true);
      controller.setEnabled(inputs.current.enabled === true);
    } catch (error) {
      setStatus("error");
      throw error;
    }
  }
  initializeRef.current = () => {
    if (!initialization.current) initialization.current = initialize().finally(() => { initialization.current = null; });
    return initialization.current;
  };

  useEffect(() => {
    if (enabled === undefined) return;
    void initializeRef.current().catch(() => undefined);
  }, [enabled]);

  useLayoutEffect(() => {
    if (!ready) return;
    controller.setEnabled(enabled === true);
    const snapshot = createEditorDraftSnapshot(state, view);
    controller.update(snapshot);
  }, [controller, enabled, ready, state, view]);

  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  flushRef.current = async () => {
    if (!readyRef.current) await initializeRef.current();
    controller.update(createEditorDraftSnapshot(inputs.current.state, inputs.current.view));
    await controller.flush();
  };
  useEffect(() => shutdownCoordinator.register("editor-draft", () => flushRef.current()), []);
  useEffect(() => () => controller.dispose(), [controller]);

  async function clearActive(commit: () => AppState | null) {
    const expectedGeneration = generation.current;
    await getLyricsCardDesktopApi()?.activateEditorDraft(null);
    if (generation.current !== expectedGeneration) return;
    const nextState = commit();
    if (nextState) reset(nextState, undefined, false, { ...inputs.current.view, songInfoDraft: undefined });
    else controller.update(createEditorDraftSnapshot(inputs.current.state, inputs.current.view), true);
  }
  function removed(recordId?: string) {
    // Stop rather than resurrect a record the user deliberately removed.
    const expectedGeneration = generation.current;
    if (recordId === undefined || lease.current?.recordId === recordId) {
      generation.current++;
      controller.suspend();
      return;
    }
    void origin.current.then((id) => {
      if (generation.current === expectedGeneration && id === recordId) {
        generation.current++;
        controller.suspend();
      }
    });
  }
  return { status, ready, reset, restore, clearActive, removed, hasFormDraft: Boolean(view.songInfoDraft),
    markUnsaved: () => controller.markUnsaved(),
    ownsUrl: (url: string) => readyRef.current && ownedUrl.current === url,
    flush: () => flushRef.current(),
    retry: () => readyRef.current ? controller.flush() : initializeRef.current() };
}

async function localImageDataUrl(url: string) {
  // connect-src intentionally excludes data:. Decode local embedded covers
  // directly; do not weaken CSP or issue a network request to persist an image.
  const blob = url.startsWith("data:") ? draftImageBlob(url) : await (await fetch(url)).blob();
  if (blob.size > 20 * 1024 * 1024) throw new Error("draft_cover_too_large");
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type)) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("draft_cover_read_failed"));
      reader.readAsDataURL(blob);
    });
  }
  // Rasterize other browser-supported local image types; never persist active SVG markup.
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("draft_cover_too_large");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("draft_cover_read_failed");
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function draftImageBlob(dataUrl: string): Blob {
  if (dataUrl.length > 28 * 1024 * 1024) throw new Error("draft_cover_too_large");
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("invalid_draft_cover");
  const binary = atob(match[2]);
  if (binary.length > 20 * 1024 * 1024) throw new Error("draft_cover_too_large");
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: match[1] });
}
