import {
  DocumentTransactionController,
  songDocumentIdentity
} from "@/lib/editor/document-transactions";
import type { AppState } from "@/lib/types";

export type TranslationValue = {
  text: string;
  enabled: boolean;
};

export type EditorDocumentStateMutation = (current: AppState) => AppState;

type EnqueueStateUpdate = (updater: EditorDocumentStateMutation) => void;

function applyTranslationValue(current: AppState, value: TranslationValue): AppState {
  return {
    ...current,
    translationText: value.text,
    translationEnabled: value.enabled,
    style: {
      ...current.style,
      translationText: value.text,
      translationEnabled: value.enabled
    }
  };
}

/**
 * Bridges the synchronous document revision controller to React's potentially
 * deferred state queue. External document changes enqueue rollback and the
 * user's mutation as one updater before advancing the revision. The updater is
 * deliberately revision-agnostic: the rollback was authorized synchronously
 * by the AI generation that was invalidated, and re-checking after mutate()
 * would make it disappear when React defers functional updaters.
 */
export class EditorDocumentStateAdapter {
  constructor(
    private readonly controller: DocumentTransactionController,
    private readonly enqueueStateUpdate: EnqueueStateUpdate,
    private readonly getCurrentState: () => AppState
  ) {}

  applyAITranslation(
    value: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) {
    if (
      !this.controller.isCurrentRevision(expectedRevision) ||
      songDocumentIdentity(this.getCurrentState().song) !== expectedSongIdentity
    ) return false;

    this.enqueueStateUpdate((current) => {
      if (
        !this.controller.isCurrentRevision(expectedRevision) ||
        songDocumentIdentity(current.song) !== expectedSongIdentity
      ) return current;
      return applyTranslationValue(current, value);
    });
    return true;
  }

  queueDocumentMutation(
    rollback: TranslationValue | undefined,
    mutation: EditorDocumentStateMutation
  ) {
    this.enqueueStateUpdate((current) => mutation(
      rollback ? applyTranslationValue(current, rollback) : current
    ));
    return this.controller.mutate();
  }

  queueRollback(rollback: TranslationValue | undefined) {
    if (!rollback) return false;
    this.enqueueStateUpdate((current) => applyTranslationValue(current, rollback));
    return true;
  }
}
