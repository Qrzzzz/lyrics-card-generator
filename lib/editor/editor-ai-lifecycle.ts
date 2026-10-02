import { AITranslationOrchestrator } from "@/lib/editor/ai-translation-orchestrator";
import type { TranslationValue } from "@/lib/editor/editor-document-state-adapter";
import type { AITranslationPhase } from "@/lib/ai/types";

/**
 * Construct once in the composition root. Both domains share this identity;
 * neither hook installs callbacks into the other hook's mutable refs.
 */
export class EditorAILifecycle extends AITranslationOrchestrator<TranslationValue, AITranslationPhase> {
  invalidateDocument(reason: "document" | "ai-start" = "document") {
    if (reason === "ai-start") { this.prepareReplacement(); return undefined; }
    return this.invalidate();
  }
}
