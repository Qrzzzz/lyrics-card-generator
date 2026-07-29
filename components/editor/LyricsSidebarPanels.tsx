"use client";

import { ChevronDown } from "lucide-react";
import {
  type CSSProperties,
  type Ref,
  type ReactNode,
  useEffect,
  useMemo,
  useState
} from "react";
import { AiTranslateButton } from "@/components/lyrics/AiTranslateButton";
import {
  formatLyricsWorkspaceCopy,
  type LyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import { Section, ToggleRow } from "@/components/ui/controls";
import { getAIUiCopy } from "@/lib/ai/ui-copy";
import type { createT } from "@/lib/i18n";
import { formatChineseTranslation, splitAlternatingLyrics } from "@/lib/lyric-format";
import {
  cleanSynchronizedBlankRows,
  previewParagraphTags,
  removeAllBlankLines,
  resolveLyricsTextScope,
  stripLrcTimeline,
  type LyricsBlankMode,
  type LyricsTextSelection,
  type LyricsWorkbenchEditor
} from "@/lib/lyrics-workbench";
import type { Locale } from "@/lib/types";
import { cn } from "@/lib/utils";

export type LyricsSidebarPanelProps = {
  copy: LyricsWorkspaceCopy;
  activeEditor: LyricsWorkbenchEditor;
  activeText: string;
  selection: LyricsTextSelection;
  lyrics: string;
  translationText: string;
  translationEnabled: boolean;
  locale: Locale;
  themeColor: string;
  t: ReturnType<typeof createT>;
  isAITranslating: boolean;
  showAiTranslate: boolean;
  onBlankCleanup: (mode: LyricsBlankMode, synchronized: boolean) => void;
  onCleanPaste: () => void;
  onStripLrc: () => void;
  onMergeSelectedLines: () => void;
  onRemoveParagraphTags: () => void;
  onTranslationEnabledChange: (enabled: boolean) => void;
  onAITranslate: () => void;
  onSplitAlternatingLyrics: (lyrics: string, translationText: string) => void;
  onFormatTranslation: (translationText: string) => void;
  onSwapColumns: () => void;
};

export function LyricsCleanupPanel({
  copy,
  activeEditor,
  activeText,
  selection,
  lyrics,
  translationText,
  translationEnabled,
  onBlankCleanup,
  onCleanPaste,
  onStripLrc,
  onMergeSelectedLines,
  onRemoveParagraphTags
}: LyricsSidebarPanelProps) {
  const [synchronized, setSynchronized] = useState(false);
  const [showLrcPreview, setShowLrcPreview] = useState(false);
  const [showTagPreview, setShowTagPreview] = useState(false);
  const [showRemoveAllPreview, setShowRemoveAllPreview] = useState(false);
  const synchronizedActive = synchronized && translationEnabled;

  useEffect(() => {
    if (!translationEnabled) setSynchronized(false);
  }, [translationEnabled]);

  const scope = resolveLyricsTextScope(activeText, selection);
  const selectedLineCount = scope.hasSelection ? scope.endLine - scope.startLine + 1 : 0;
  const lrcPreview = useMemo(
    () => stripLrcTimeline(activeText, selection),
    [activeText, selection]
  );
  const tags = useMemo(
    () => previewParagraphTags(activeText, selection),
    [activeText, selection]
  );
  const cleanupCount = (lrcPreview.stats.timestamps ?? 0) + (lrcPreview.stats.metadata ?? 0);
  const activeLabel = activeEditor === "translation" ? copy.translation : copy.original;
  const scopeSummary = formatLyricsWorkspaceCopy(
    scope.hasSelection ? copy.selectedLinesScope : copy.activeColumnScope,
    {
      label: activeLabel,
      start: scope.startLine,
      end: scope.endLine
    }
  );
  const synchronizedScopeSummary = scope.hasSelection
    ? formatLyricsWorkspaceCopy(copy.synchronizedScope, {
        start: scope.startLine,
        end: scope.endLine
      })
    : formatLyricsWorkspaceCopy(copy.activeColumnScope, {
        label: `${copy.original}/${copy.translation}`
      });
  const removeAllCount = synchronizedActive
    ? cleanSynchronizedBlankRows({
        lyrics,
        translationText,
        mode: "all",
        lineRange: scope.hasSelection
          ? { startLine: scope.startLine, endLine: scope.endLine }
          : undefined
      }).removedRows
    : removeAllBlankLines(activeText, selection).stats.removedLines ?? 0;
  const removeAllScope = synchronizedActive ? synchronizedScopeSummary : scopeSummary;

  return (
    <div className="grid gap-3">
      <div
        className="lyrics-sidebar-context"
        data-testid="lyrics-cleanup-context"
      >
        <div className="flex min-w-0 items-center gap-2 px-0.5">
          <span className="app-text-subtle shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em]">
            {copy.scopeHeading}
          </span>
          <strong
            className="app-text-primary min-w-0 flex-1 truncate text-right text-xs font-semibold"
            data-testid="lyrics-cleanup-scope-summary"
            title={synchronizedActive ? synchronizedScopeSummary : scopeSummary}
          >
            {synchronizedActive ? synchronizedScopeSummary : scopeSummary}
          </strong>
        </div>
        <div
          role="group"
          aria-label={copy.scopeHeading}
          className="segmented-control lyrics-sidebar-choice-grid grid grid-cols-2"
          style={{
            "--segmented-count": 2,
            "--segmented-active-translate": synchronizedActive ? "100%" : "0%"
          } as CSSProperties}
        >
          <span className="segmented-control__active-indicator" aria-hidden="true" />
          <ChoiceButton
            selected={!synchronizedActive}
            onClick={() => setSynchronized(false)}
            label={copy.activeColumn}
            testId="lyrics-cleanup-scope-active"
          />
          <ChoiceButton
            selected={synchronizedActive}
            onClick={() => setSynchronized(true)}
            label={copy.alignedColumns}
            testId="lyrics-cleanup-scope-synchronized"
            disabled={!translationEnabled}
          />
        </div>
        {synchronizedActive ? (
          <p className="app-text-subtle px-0.5 text-[10px] leading-4">{copy.alignedColumnsHint}</p>
        ) : null}
      </div>

      <PanelSection title={copy.commonCleanupHeading} testId="lyrics-cleanup-section-common">
        <OperationGroup title={copy.blankLinesHeading}>
          <OperationItem>
            <ToolButton
              label={copy.trimBlankLines}
              onClick={() => onBlankCleanup("trim", synchronizedActive)}
              testId="lyrics-cleanup-blank-trim"
            />
          </OperationItem>
          <OperationItem>
            <ToolButton
              label={copy.collapseBlankLines}
              onClick={() => onBlankCleanup("collapse", synchronizedActive)}
              testId="lyrics-cleanup-blank-collapse"
            />
          </OperationItem>
          <OperationItem>
            <ToolButton
              label={copy.removeBlankLines}
              onClick={() => setShowRemoveAllPreview((value) => !value)}
              testId="lyrics-cleanup-blank-all-preview"
              danger
            />
            {showRemoveAllPreview ? (
              <PreviewBox testId="lyrics-cleanup-blank-all-preview-result">
                <p>{formatLyricsWorkspaceCopy(copy.removeBlankLinesPreview, {
                  count: removeAllCount,
                  scope: removeAllScope
                })}</p>
                <ToolButton
                  label={copy.confirmRemoveBlankLines}
                  onClick={() => {
                    onBlankCleanup("all", synchronizedActive);
                    setShowRemoveAllPreview(false);
                  }}
                  disabled={removeAllCount === 0}
                  testId="lyrics-cleanup-blank-all"
                  danger
                />
              </PreviewBox>
            ) : null}
          </OperationItem>
        </OperationGroup>

        <OperationGroup testId="lyrics-cleanup-section-paste">
          <OperationItem>
            <ToolButton
              label={copy.cleanPaste}
              description={copy.cleanPasteHint}
              onClick={onCleanPaste}
              testId="lyrics-cleanup-paste"
            />
          </OperationItem>
        </OperationGroup>
      </PanelSection>

      <details className="lyrics-sidebar-more" data-testid="lyrics-cleanup-more">
        <summary
          className="control-focus lyrics-sidebar-more__summary"
          data-testid="lyrics-cleanup-more-summary"
        >
          <span>{copy.moreCleanupHeading}</span>
          <ChevronDown className="lyrics-sidebar-more__chevron size-4" aria-hidden="true" />
        </summary>
        <div className="lyrics-sidebar-more__content">
          <OperationGroup title={copy.lrcHeading} testId="lyrics-cleanup-section-lrc">
            <OperationItem>
              <ToolButton
                label={copy.previewLrc}
                onClick={() => setShowLrcPreview((value) => !value)}
                testId="lyrics-cleanup-lrc-preview"
              />
              {showLrcPreview ? (
                <PreviewBox testId="lyrics-cleanup-lrc-preview-result">
                  <p>{formatLyricsWorkspaceCopy(copy.lrcPreview, {
                    timestamps: lrcPreview.stats.timestamps ?? 0,
                    metadata: lrcPreview.stats.metadata ?? 0
                  })}</p>
                  <ToolButton
                    label={copy.applyLrc}
                    onClick={onStripLrc}
                    disabled={cleanupCount === 0}
                    testId="lyrics-cleanup-lrc-apply"
                  />
                </PreviewBox>
              ) : null}
            </OperationItem>
          </OperationGroup>

          <OperationGroup title={copy.mergeHeading} testId="lyrics-cleanup-section-merge">
            <OperationItem>
              <ToolButton
                label={selectedLineCount >= 2
                  ? formatLyricsWorkspaceCopy(copy.mergeSelectedLines, { count: selectedLineCount })
                  : copy.mergeHeading}
                description={selectedLineCount < 2 ? copy.mergeSelectionHint : undefined}
                onClick={onMergeSelectedLines}
                disabled={selectedLineCount < 2}
                testId="lyrics-merge-selected"
              />
            </OperationItem>
          </OperationGroup>

          <OperationGroup title={copy.tagsHeading} testId="lyrics-cleanup-section-tags">
            <OperationItem>
              <ToolButton
                label={copy.previewTags}
                onClick={() => setShowTagPreview((value) => !value)}
                testId="lyrics-tags-preview"
              />
              {showTagPreview ? (
                <PreviewBox testId="lyrics-tags-preview-result">
                  {tags.length > 0 ? (
                    <>
                      <ul className="grid gap-1 font-mono text-[10px]">
                        {tags.slice(0, 8).map((tag) => <li key={`${tag.line}-${tag.text}`}>{tag.line}: {tag.text}</li>)}
                      </ul>
                      <ToolButton
                        label={formatLyricsWorkspaceCopy(copy.removeTags, { count: tags.length })}
                        onClick={onRemoveParagraphTags}
                        testId="lyrics-tags-apply"
                        danger
                      />
                    </>
                  ) : <p>{copy.noTags}</p>}
                </PreviewBox>
              ) : null}
            </OperationItem>
          </OperationGroup>
        </div>
      </details>
    </div>
  );
}

export function LyricsTranslationPanel({
  copy,
  locale,
  lyrics,
  translationText,
  translationEnabled,
  themeColor,
  t,
  isAITranslating,
  showAiTranslate,
  onTranslationEnabledChange,
  onAITranslate,
  onSplitAlternatingLyrics,
  onFormatTranslation,
  onSwapColumns,
  aiButtonRef
}: LyricsSidebarPanelProps & { aiButtonRef: Ref<HTMLButtonElement> }) {
  const [showSplitPreview, setShowSplitPreview] = useState(false);
  const [showSwapPreview, setShowSwapPreview] = useState(false);
  const split = useMemo(() => splitAlternatingLyrics(lyrics, locale), [locale, lyrics]);
  const aiCopy = getAIUiCopy(locale);
  const splitOriginalLines = countRows(split.lyrics);
  const splitTranslationLines = countRows(split.translationText);

  return (
    <div className="grid gap-3">
      <section
        className="lyrics-sidebar-primary"
        data-testid="lyrics-translation-primary"
      >
        <p className="app-text-subtle px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
          {copy.translationHeading}
        </p>
        <ToggleRow
          label={t("enableTranslation")}
          checked={translationEnabled}
          onChange={onTranslationEnabledChange}
          size="sm"
          testId="translation-toggle"
          className="lyrics-sidebar-primary__toggle"
        />

        {showAiTranslate ? (
          <div className="rounded-md" data-testid="lyrics-ai-entry">
            <AiTranslateButton
              buttonRef={aiButtonRef}
              label={isAITranslating ? aiCopy.translating : aiCopy.aiTranslate}
              loading={isAITranslating}
              themeColor={themeColor}
              onClick={onAITranslate}
            />
          </div>
        ) : null}
      </section>

      <PanelSection title={copy.columnToolsHeading} testId="lyrics-translation-column-tools">
        <OperationGroup testId="lyrics-translation-section-split">
          <OperationItem>
            <ToolButton
              label={copy.splitPreview}
              onClick={() => setShowSplitPreview((value) => !value)}
              testId="lyrics-split-preview"
            />
            {showSplitPreview ? (
              <PreviewBox testId="lyrics-split-preview-result">
                <p>{formatLyricsWorkspaceCopy(copy.splitSummary, {
                  original: splitOriginalLines,
                  translation: splitTranslationLines
                })}</p>
                <ToolButton
                  label={copy.splitApply}
                  onClick={() => onSplitAlternatingLyrics(split.lyrics, split.translationText)}
                  disabled={!split.lyrics && !split.translationText}
                  testId="lyrics-split-apply"
                />
              </PreviewBox>
            ) : null}
          </OperationItem>
        </OperationGroup>

        <OperationGroup testId="lyrics-translation-section-format">
          <OperationItem>
            <ToolButton
              label={copy.formatTranslation}
              onClick={() => onFormatTranslation(formatChineseTranslation(translationText))}
              disabled={!translationText}
              testId="lyrics-format-translation"
            />
          </OperationItem>
        </OperationGroup>

        <OperationGroup testId="lyrics-translation-section-swap">
          <OperationItem>
            <ToolButton
              label={copy.swapPreview}
              onClick={() => setShowSwapPreview((value) => !value)}
              disabled={!translationText}
              testId="lyrics-swap-preview"
              danger
            />
            {showSwapPreview ? (
              <PreviewBox testId="lyrics-swap-preview-result">
                <p>{copy.swapSummary}</p>
                <ToolButton
                  label={copy.swapApply}
                  onClick={onSwapColumns}
                  testId="lyrics-swap-apply"
                  danger
                />
              </PreviewBox>
            ) : null}
          </OperationItem>
        </OperationGroup>
      </PanelSection>
    </div>
  );
}

function PanelSection({
  title,
  children,
  description,
  testId
}: {
  title: string;
  children: ReactNode;
  description?: ReactNode;
  testId?: string;
}) {
  return (
    <Section
      title={title}
      description={description}
      variant="plain"
      className="lyrics-sidebar-section"
      contentClassName="gap-2.5"
      testId={testId}
    >
      {children}
    </Section>
  );
}

function PreviewBox({
  children,
  testId
}: {
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="status-info grid gap-2.5 rounded-lg border p-3 text-xs leading-relaxed" data-testid={testId}>
      {children}
    </div>
  );
}

function OperationGroup({
  title,
  children,
  testId
}: {
  title?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="lyrics-sidebar-operation-group" data-testid={testId}>
      {title ? (
        <p className="app-text-subtle px-1 text-[10px] font-semibold uppercase tracking-[0.08em]">
          {title}
        </p>
      ) : null}
      <div className="lyrics-sidebar-operation-list">{children}</div>
    </div>
  );
}

function OperationItem({ children }: { children: ReactNode }) {
  return <div className="lyrics-sidebar-operation">{children}</div>;
}

function ChoiceButton({
  label,
  selected,
  onClick,
  testId,
  disabled = false
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "segmented-control__item control-focus control-disabled relative z-[2] h-8 min-w-0 rounded-lg px-2 text-[11px] font-semibold",
        selected && "app-text-primary"
      )}
      aria-pressed={selected}
      data-selected={selected ? "true" : "false"}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

const ToolButton = function ToolButton({
  label,
  description,
  onClick,
  testId,
  disabled = false,
  danger = false,
  ref
}: {
  label: string;
  description?: string;
  onClick: () => void;
  testId: string;
  disabled?: boolean;
  danger?: boolean;
  ref?: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "control-surface lyrics-sidebar-action control-focus control-disabled flex min-h-9 w-full items-start rounded-lg px-2.5 py-2 text-left text-[13px] font-medium leading-5",
        danger && "lyrics-sidebar-action--danger"
      )}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span className="min-w-0 flex-1">
        <span className="app-text-primary block">{label}</span>
        {description ? (
          <span className="app-text-subtle mt-0.5 block text-[10px] font-normal leading-4">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
};

function countRows(text: string) {
  return text ? text.split(/\r\n?|\n/u).length : 0;
}
