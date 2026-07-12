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
type CommitStateUpdate = (updater: EditorDocumentStateMutation) => void;

export type EditorDocumentSnapshot = {
  revision: number;
  songIdentity: string;
  lyrics: string;
  translation: TranslationValue;
};

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
    private readonly commitStateUpdate: CommitStateUpdate,
    private readonly getCurrentState: () => AppState
  ) {}

  getDocumentSnapshot(): EditorDocumentSnapshot {
    const current = this.getCurrentState();
    return {
      revision: this.controller.currentRevision,
      songIdentity: songDocumentIdentity(current.song),
      lyrics: current.lyrics,
      translation: {
        text: current.style.translationText,
        enabled: current.style.translationEnabled
      }
    };
  }

  /**
   * Starts an AI generation as one synchronous document intent. Any pending
   * import is aborted by mutate(), and the returned snapshot is taken from the
   * same controller revision that every partial/final write must present.
  */
  beginAITranslation(): EditorDocumentSnapshot {
    // Drain any rollback/partial queued by an immediately preceding intent.
    // Otherwise that older updater could render after this newer generation.
    this.commitStateUpdate((current) => current);
    const revision = this.controller.mutate();
    const current = this.getCurrentState();
    return {
      revision,
      songIdentity: songDocumentIdentity(current.song),
      lyrics: current.lyrics,
      translation: {
        text: current.style.translationText,
        enabled: current.style.translationEnabled
      }
    };
  }

  applyAIPartial(
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

  /**
   * Terminal AI writes are committed through an injected synchronous React
   * boundary. This drains any earlier partial updater before the terminal
   * value and makes completion observable before the orchestrator settles.
   */
  commitAITranslation(
    value: TranslationValue,
    expectedRevision: number,
    expectedSongIdentity: string
  ) {
    if (
      !this.controller.isCurrentRevision(expectedRevision) ||
      songDocumentIdentity(this.getCurrentState().song) !== expectedSongIdentity
    ) return false;

    let committed = false;
    this.commitStateUpdate((current) => {
      if (
        !this.controller.isCurrentRevision(expectedRevision) ||
        songDocumentIdentity(current.song) !== expectedSongIdentity
      ) return current;
      committed = true;
      return applyTranslationValue(current, value);
    });
    return committed;
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
