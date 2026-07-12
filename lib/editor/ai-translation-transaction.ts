export type AITranslationDocumentIntent<T> = {
  id: number;
  revision: number;
  songIdentity: string;
  previousTranslation: T;
  hasWrittenPartial: boolean;
};

export class AITranslationTransactionController<T> {
  private nextIntentId = 0;
  private activeIntentId: number | null = null;

  begin(revision: number, songIdentity: string, previousTranslation: T): AITranslationDocumentIntent<T> {
    const intent = {
      id: ++this.nextIntentId,
      revision,
      songIdentity,
      previousTranslation,
      hasWrittenPartial: false
    };
    this.activeIntentId = intent.id;
    return intent;
  }

  isCurrent(intent: AITranslationDocumentIntent<T>, revision: number, songIdentity: string) {
    return this.activeIntentId === intent.id &&
      intent.revision === revision &&
      intent.songIdentity === songIdentity;
  }

  invalidate(intent: AITranslationDocumentIntent<T>) {
    if (this.activeIntentId !== intent.id) return false;
    this.activeIntentId = null;
    return true;
  }
}
