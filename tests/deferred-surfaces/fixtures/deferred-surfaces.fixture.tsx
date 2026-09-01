import { useRef, useState, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DeferredExamplesSurface,
  DeferredHistorySurface,
  DeferredSettingsSurface
} from "../../../components/editor/DeferredEditorSurfaces";
import {
  DeferredAiTranslatePanel,
  DeferredExportPanel
} from "../../../components/editor/DeferredEditorStepPanels";
import { ExportCardReadinessStore } from "../../../components/editor/hooks/export-card-readiness-store";
import { createT } from "../../../lib/i18n";

const kinds = ["examples", "history", "settings", "ai", "export"] as const;
type SurfaceKind = (typeof kinds)[number];
type HarnessMode = "fail-first" | "success";
type DeferredModule = { default: ComponentType<Record<string, unknown>> };

const readinessStore = new ExportCardReadinessStore();

class LoaderController {
  readonly calls = Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<SurfaceKind, number>;
  readonly loaders = Object.fromEntries(kinds.map((kind) => [
    kind,
    () => this.load(kind)
  ])) as Record<SurfaceKind, () => Promise<DeferredModule>>;
  private readonly pending = new Map<SurfaceKind, (error: Error) => void>();
  private readonly components = Object.fromEntries(kinds.map((kind) => [
    kind,
    createLoadedComponent(kind)
  ])) as Record<SurfaceKind, ComponentType<Record<string, unknown>>>;

  constructor(private readonly mode: HarnessMode) {}

  reject(kind: SurfaceKind) {
    const reject = this.pending.get(kind);
    if (!reject) throw new Error(`No pending loader for ${kind}.`);
    this.pending.delete(kind);
    reject(new TypeError(`Interrupted ${kind} chunk request.`));
  }

  private load(kind: SurfaceKind): Promise<DeferredModule> {
    this.calls[kind] += 1;
    if (this.mode === "success" || this.calls[kind] > 1) {
      return Promise.resolve({ default: this.components[kind] });
    }
    return new Promise((_resolve, reject) => {
      this.pending.set(kind, reject);
    });
  }
}

function createLoadedComponent(kind: SurfaceKind) {
  return function LoadedSurface(props: Record<string, unknown>) {
    const [state, setState] = useState(0);
    const onClose = typeof props.onClose === "function" ? props.onClose as () => void : null;
    return (
      <section
        data-testid={`${kind}-loaded`}
        data-streaming-text={String(props.streamingText ?? "")}
        data-readiness-preserved={props.readinessStore === readinessStore ? "true" : "false"}
      >
        <span data-testid={`${kind}-loaded-state`}>{state}</span>
        <button type="button" data-testid={`${kind}-loaded-increment`} onClick={() => setState((value) => value + 1)}>
          Increment {kind}
        </button>
        {onClose ? (
          <button type="button" data-testid={`${kind}-loaded-close`} onClick={onClose}>
            Close {kind}
          </button>
        ) : null}
      </section>
    );
  };
}

function createBooleanRecord(value: boolean) {
  return Object.fromEntries(kinds.map((kind) => [kind, value])) as Record<SurfaceKind, boolean>;
}

function DeferredSurfaceFixture({ controller }: { controller: LoaderController }) {
  const [mounted, setMounted] = useState(() => createBooleanRecord(false));
  const [active, setActive] = useState(() => createBooleanRecord(false));
  const [editorActions, setEditorActions] = useState(0);
  const triggerRefs = useRef<Record<SurfaceKind, HTMLButtonElement | null>>({
    examples: null,
    history: null,
    settings: null,
    ai: null,
    export: null
  });

  function openSurface(kind: SurfaceKind) {
    setMounted((current) => ({ ...current, [kind]: true }));
    setActive((current) => ({ ...current, [kind]: true }));
  }

  function closeSurface(kind: SurfaceKind) {
    setActive((current) => ({ ...current, [kind]: false }));
    window.requestAnimationFrame(() => triggerRefs.current[kind]?.focus({ preventScroll: true }));
  }

  function renderTrigger(kind: SurfaceKind) {
    return (
      <button
        key={kind}
        ref={(node) => { triggerRefs.current[kind] = node; }}
        type="button"
        data-testid={`${kind}-trigger`}
        onClick={() => openSurface(kind)}
      >
        Open {kind}
      </button>
    );
  }

  return (
    <main>
      <nav>{kinds.map(renderTrigger)}</nav>
      <button
        type="button"
        data-testid="editor-main-action"
        onClick={() => setEditorActions((value) => value + 1)}
      >
        Editor action
      </button>
      <output data-testid="editor-main-count">{editorActions}</output>

      <DeferredExamplesSurface
        mounted={mounted.examples}
        loadComponent={controller.loaders.examples as never}
        isActive={active.examples}
        locale="en"
        onLoad={() => undefined}
        onClose={() => closeSurface("examples")}
        transition={{ duration: 0 }}
      />
      <DeferredHistorySurface
        mounted={mounted.history}
        loadComponent={controller.loaders.history as never}
        isActive={active.history}
        locale="en"
        transition={{ duration: 0 }}
        reduceMotion
        onClose={() => closeSurface("history")}
        onReplay={async () => ({ status: "missing" })}
        onNotify={() => undefined}
        onRecordRemoved={() => undefined}
        onHistoryCleared={() => undefined}
      />
      <DeferredSettingsSurface
        mounted={mounted.settings}
        loadComponent={controller.loaders.settings as never}
        isActive={active.settings}
        locale="en"
        userSettings={{} as never}
        isDesktopShell={false}
        transition={{ duration: 0 }}
        onLocaleChange={() => undefined}
        onUserSettingsPreview={() => undefined}
        onUserSettingsChange={() => undefined}
        onClose={() => closeSurface("settings")}
        onSaved={() => undefined}
        onNotify={() => undefined}
        onPersistenceIssueChange={() => undefined}
      />

      <section
        data-testid="lyrics-translation-ai-page"
        data-page-active={active.ai ? "true" : "false"}
        aria-hidden={!active.ai}
        inert={!active.ai ? true : undefined}
      >
        {mounted.ai ? (
          <DeferredAiTranslatePanel
            loadComponent={controller.loaders.ai as never}
            backLabel="Back"
            locale="en"
            initialStyle="balanced"
            initialReasoning={false}
            promptLibrary={{} as never}
            loading={false}
            streamingText="streaming state kept"
            reasoningText="reasoning state kept"
            phase="translating"
            themeColor="#7C3AED"
            error=""
            onClose={() => closeSurface("ai")}
            onCancel={() => undefined}
            onConfirm={() => undefined}
          />
        ) : null}
      </section>

      <section
        data-testid="export-step-page"
        data-page-active={active.export ? "true" : "false"}
        aria-hidden={!active.export}
        inert={!active.export ? true : undefined}
      >
        {mounted.export ? (
          <DeferredExportPanel
            loadComponent={controller.loaders.export as never}
            label="Export"
            locale="en"
            t={createT("en")}
            accentColor="#7C3AED"
            exportFormat="png"
            onExportFormatChange={() => undefined}
            exportQuality="high"
            onExportQualityChange={() => undefined}
            isExporting={false}
            readinessStore={readinessStore}
          />
        ) : null}
        <button type="button" data-testid="export-return" onClick={() => closeSurface("export")}>
          Back
        </button>
      </section>
    </main>
  );
}

let root: Root | null = null;
let controller: LoaderController | null = null;

window.__deferredSurfaceHarness = {
  start(mode: HarnessMode) {
    controller = new LoaderController(mode);
    root?.unmount();
    root = createRoot(document.getElementById("root")!);
    root.render(<DeferredSurfaceFixture controller={controller} />);
  },
  reject(kind: SurfaceKind) {
    controller?.reject(kind);
  },
  calls(kind: SurfaceKind) {
    return controller?.calls[kind] ?? 0;
  }
};

declare global {
  interface Window {
    __deferredSurfaceHarness: {
      start: (mode: HarnessMode) => void;
      reject: (kind: SurfaceKind) => void;
      calls: (kind: SurfaceKind) => number;
    };
  }
}
