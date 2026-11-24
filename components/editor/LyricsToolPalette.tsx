"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import type { LyricsWorkspaceCopy } from "@/components/editor/lyrics-workspace-copy";
import { describeLyricsTool, LYRICS_TOOLS, rankPaletteItems, type LyricsTool } from "@/lib/lyrics-tool-registry";
import { getLyricsToolsCopy } from "@/lib/lyrics-tools-copy";
import type { Locale } from "@/lib/types";

export type AppCommand = { id: string; label: string; keywords: string; run: () => void; disabledReason?: string };
type PaletteItem = LyricsTool | AppCommand;
const isCommand = (item: PaletteItem): item is AppCommand => "run" in item;

export function LyricsToolPalette({
  open,
  onClose,
  onActivate,
  copy,
  locale,
  showAiTranslate,
  hasFetch,
  commands = [],
  lyricsAvailable = true,
  lyricsDisabledReason,
  title
}: {
  open: boolean;
  onClose: () => void;
  onActivate: (tool: LyricsTool) => void;
  copy: LyricsWorkspaceCopy;
  locale: Locale;
  showAiTranslate: boolean;
  hasFetch: boolean;
  commands?: AppCommand[];
  lyricsAvailable?: boolean;
  lyricsDisabledReason?: string;
  title?: string;
}) {
  const nav = getLyricsToolsCopy(locale);
  const id = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = useRef<PaletteItem | null>(null);
  const available = useMemo(
    () =>
      LYRICS_TOOLS.filter(
        (tool) => lyricsAvailable && (!tool.capability || (tool.capability === "ai" ? showAiTranslate : hasFetch))
      ),
    [hasFetch, showAiTranslate, lyricsAvailable]
  );
  const results = useMemo(() => rankPaletteItems<PaletteItem>(query, [...commands, ...available],
    item => isCommand(item) ? item : describeLyricsTool(item, copy)), [available, commands, copy, query]);
  const disabledReason = (item: PaletteItem) => isCommand(item) ? item.disabledReason : lyricsDisabledReason;
  const selectable = results.filter(item => !disabledReason(item));
  const selected = selectable.find(item => item.id === selectedId) ?? selectable[0];

  function activate(tool: PaletteItem) {
    if (disabledReason(tool)) return;
    pending.current = tool;
    onClose();
  }
  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      labelledBy={`${id}-title`}
      initialFocusSelector="[data-testid=lyrics-tool-query]"
      inheritThemeFrom=".app-shell"
      panelClassName="max-w-xl overflow-hidden rounded-xl border border-[rgb(var(--panel-border))] bg-[rgb(var(--elevated-panel-bg))] shadow-2xl"
      testId="lyrics-tool-palette"
      onAfterClose={() => {
        const tool = pending.current;
        pending.current = null;
        setQuery("");
        setSelectedId(null);
        if (tool) { if (isCommand(tool)) tool.run(); else onActivate(tool); }
      }}
    >
      <header className="flex items-center gap-2 border-b border-[rgb(var(--panel-border))] p-3">
        <Search className="app-text-subtle size-4 shrink-0" aria-hidden="true" />
        <h2 id={`${id}-title`} className="sr-only">
          {title ?? nav.search}
        </h2>
        <input
          autoComplete="off"
          aria-label={title ?? nav.search}
          placeholder={title ?? nav.placeholder}
          className="control-focus app-text-primary min-w-0 flex-1 rounded bg-transparent p-2 text-sm outline-none"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={`${id}-results`}
          aria-activedescendant={selected && `${id}-${selected.id}`}
          value={query}
          data-testid="lyrics-tool-query"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId(null);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !selected) return;
            if (event.key === "Enter") {
              event.preventDefault();
              activate(selected);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              const index = selectable.indexOf(selected);
              const next = selectable[(index + direction + selectable.length) % selectable.length];
              setSelectedId(next.id);
              document
                .getElementById(`${id}-${next.id}`)
                ?.scrollIntoView({ block: "nearest" });
            }
          }}
        />
        <button
          type="button"
          aria-label={nav.close}
          className="app-button control-focus rounded-md p-2"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>
      <div
        id={`${id}-results`}
        role="listbox"
        aria-label={title ?? nav.search}
        className="max-h-[min(55vh,28rem)] overflow-y-auto p-2"
      >
        {results.map(tool => (
          <button
            key={tool.id}
            id={`${id}-${tool.id}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={tool === selected}
            onMouseEnter={() => { if (!disabledReason(tool)) setSelectedId(tool.id); }}
            onClick={() => activate(tool)}
            aria-disabled={Boolean(disabledReason(tool))}
            data-testid={isCommand(tool) ? `app-command-result-${tool.id}` : `lyrics-tool-result-${tool.id}`}
            className={`control-focus flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${tool === selected ? "bg-[var(--control-selected-bg)]" : "hover:bg-[rgb(var(--button-bg-hover))]"}`}
          >
            <span className="min-w-0 flex-1">
              <span className="app-text-primary block text-sm font-medium">{isCommand(tool) ? tool.label : copy[tool.label]}</span>
              <span className="app-text-subtle block text-xs">
                {isCommand(tool) ? tool.disabledReason ?? nav.run : lyricsDisabledReason ?? (tool.mode === "preview"
                  ? nav.preview
                  : tool.mode === "locate"
                    ? nav.locate
                    : nav.run)}
              </span>
            </span>
            {!isCommand(tool) && (
              <span className="app-text-muted shrink-0 text-xs">
                {tool.category === "cleanup" ? copy.cleanupTab : tool.category === "translation" ? copy.translationTab : copy.reviewTab}
              </span>
            )}
          </button>
        ))}
        {!results.length ? (
          <p role="status" className="app-text-muted p-4 text-sm">
            {nav.empty}
          </p>
        ) : null}
      </div>
      <p className="app-text-subtle border-t border-[rgb(var(--panel-border))] px-4 py-2 text-xs">
        {nav.keyboard}
      </p>
    </AccessibleDialog>
  );
}
