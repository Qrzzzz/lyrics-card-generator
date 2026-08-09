import { findExportCard } from "@/components/editor/hooks/useMeasuredAutoCanvasHeight";

const OBSERVED_EXPORT_CARD_SELECTORS = [
  "[data-card-content]",
  "[data-card-header]",
  "[data-card-lyrics-viewport]",
  "[data-card-lyrics]",
  "[data-card-footer]"
] as const;

type ResizeObserverLike = Pick<ResizeObserver, "observe" | "unobserve" | "disconnect">;
type MutationObserverLike = Pick<MutationObserver, "observe" | "disconnect">;

export type ExportCardFontSetLike = {
  readonly ready: Promise<unknown>;
  addEventListener: (type: "loading" | "loadingdone" | "loadingerror", listener: EventListener) => void;
  removeEventListener: (type: "loading" | "loadingdone" | "loadingerror", listener: EventListener) => void;
};

export type ExportCardCoordinatorEnvironment = {
  createResizeObserver: (callback: ResizeObserverCallback) => ResizeObserverLike | null;
  createMutationObserver: (callback: MutationCallback) => MutationObserverLike | null;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frame: number) => void;
  getFontSet: () => ExportCardFontSetLike | null;
};

export type ExportCardDomCoordinatorInput = {
  getContainer: () => HTMLElement | null;
  evaluate: (container: HTMLElement | null) => void;
  environment?: ExportCardCoordinatorEnvironment;
};

/** One observer and one animation-frame scheduler own the live off-screen tree. */
export class ExportCardDomCoordinator {
  private readonly getContainer: () => HTMLElement | null;
  private readonly evaluate: (container: HTMLElement | null) => void;
  private readonly environment: ExportCardCoordinatorEnvironment;
  private active = false;
  private frame: number | null = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserverLike | null = null;
  private mutationObserver: MutationObserverLike | null = null;
  private readonly observedResizeTargets = new Set<HTMLElement>();
  private fontSet: ExportCardFontSetLike | null = null;
  private queuedFontReady: Promise<unknown> | null = null;

  constructor({
    getContainer,
    evaluate,
    environment = createBrowserExportCardCoordinatorEnvironment()
  }: ExportCardDomCoordinatorInput) {
    this.getContainer = getContainer;
    this.evaluate = evaluate;
    this.environment = environment;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.resizeObserver = this.environment.createResizeObserver(() => this.requestEvaluation());
    this.mutationObserver = this.environment.createMutationObserver(() => {
      this.syncContainerAndTargets();
      this.requestEvaluation();
    });
    this.fontSet = this.environment.getFontSet();
    this.fontSet?.addEventListener("loading", this.handleFontActivity);
    this.fontSet?.addEventListener("loadingdone", this.handleFontActivity);
    this.fontSet?.addEventListener("loadingerror", this.handleFontActivity);
    this.syncContainerAndTargets();
    this.queueCurrentFontReady();
    this.scheduleEvaluation();
  }

  requestEvaluation() {
    if (!this.active) return;
    this.syncContainerAndTargets();
    this.queueCurrentFontReady();
    this.scheduleEvaluation();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.frame !== null) {
      this.environment.cancelFrame(this.frame);
      this.frame = null;
    }
    this.detachContainer();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.mutationObserver = null;
    this.fontSet?.removeEventListener("loading", this.handleFontActivity);
    this.fontSet?.removeEventListener("loadingdone", this.handleFontActivity);
    this.fontSet?.removeEventListener("loadingerror", this.handleFontActivity);
    this.fontSet = null;
    this.queuedFontReady = null;
  }

  private readonly handleFontActivity: EventListener = () => {
    if (!this.active) return;
    this.queueCurrentFontReady();
    this.scheduleEvaluation();
  };

  private readonly handleImageSettled: EventListener = () => {
    if (this.active) this.scheduleEvaluation();
  };

  private scheduleEvaluation() {
    if (!this.active) return;
    if (this.frame !== null) this.environment.cancelFrame(this.frame);
    this.frame = this.environment.requestFrame(() => {
      this.frame = null;
      if (!this.active) return;
      this.syncContainerAndTargets();
      this.evaluate(this.container);
    });
  }

  private queueCurrentFontReady() {
    const ready = this.fontSet?.ready;
    if (!ready || ready === this.queuedFontReady) return;
    this.queuedFontReady = ready;
    void ready.then(
      () => {
        if (this.active && this.queuedFontReady === ready) this.scheduleEvaluation();
      },
      () => {
        if (this.active && this.queuedFontReady === ready) this.scheduleEvaluation();
      }
    );
  }

  private syncContainerAndTargets() {
    const nextContainer = this.getContainer();
    if (nextContainer !== this.container) {
      if (this.container) this.detachContainer();
      this.container = nextContainer;
      if (this.container) {
        this.container.addEventListener("load", this.handleImageSettled, true);
        this.container.addEventListener("error", this.handleImageSettled, true);
        this.mutationObserver?.observe(this.container, {
          attributes: true,
          attributeFilter: ["class", "style"],
          childList: true,
          characterData: true,
          subtree: true
        });
      }
    }

    const nextTargets = collectExportCardResizeTargets(this.container);
    for (const target of this.observedResizeTargets) {
      if (!nextTargets.has(target)) {
        this.resizeObserver?.unobserve(target);
        this.observedResizeTargets.delete(target);
      }
    }
    for (const target of nextTargets) {
      if (!this.observedResizeTargets.has(target)) {
        this.resizeObserver?.observe(target);
        this.observedResizeTargets.add(target);
      }
    }
  }

  private detachContainer() {
    this.container?.removeEventListener("load", this.handleImageSettled, true);
    this.container?.removeEventListener("error", this.handleImageSettled, true);
    this.mutationObserver?.disconnect();
    for (const target of this.observedResizeTargets) {
      this.resizeObserver?.unobserve(target);
    }
    this.observedResizeTargets.clear();
    this.container = null;
  }
}

export function collectExportCardResizeTargets(container: HTMLElement | null) {
  const targets = new Set<HTMLElement>();
  const root = findExportCard(container);
  if (!root) return targets;
  targets.add(root);
  for (const selector of OBSERVED_EXPORT_CARD_SELECTORS) {
    const target = root.querySelector<HTMLElement>(selector);
    if (target) targets.add(target);
  }
  return targets;
}

function createBrowserExportCardCoordinatorEnvironment(): ExportCardCoordinatorEnvironment {
  return {
    createResizeObserver: (callback) => (
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(callback)
    ),
    createMutationObserver: (callback) => (
      typeof MutationObserver === "undefined" ? null : new MutationObserver(callback)
    ),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (frame) => cancelAnimationFrame(frame),
    getFontSet: () => {
      if (typeof document === "undefined" || !document.fonts) return null;
      const fonts = document.fonts;
      return {
        get ready() {
          return fonts.ready;
        },
        addEventListener: (type, listener) => fonts.addEventListener(type, listener),
        removeEventListener: (type, listener) => fonts.removeEventListener(type, listener)
      };
    }
  };
}
