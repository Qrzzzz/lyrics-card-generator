import type { ImportHistoryWriteResult, RemoteLyricsSnapshot } from "@/lib/import-history";

type Session = {
  record: Promise<string | null>;
  recordId?: string;
  replayUrl: string;
  latest: RemoteLyricsSnapshot;
  saved: string;
  writing?: Promise<void>;
  error?: unknown;
  removed: boolean;
};

/** Owns immutable snapshots across slow initial writes, edits, song switches and shutdown. */
export class RemoteHistorySession {
  private current: Session | null = null;
  private readonly sessions = new Set<Session>();

  constructor(
    private readonly write: (id: string, snapshot: RemoteLyricsSnapshot) => Promise<ImportHistoryWriteResult>,
    private readonly warn: () => void
  ) {}

  bind(result: Promise<ImportHistoryWriteResult>, initial: RemoteLyricsSnapshot, replayUrl: string) {
    this.detach();
    const session: Session = {
      record: Promise.resolve(null), replayUrl,
      latest: structuredClone(initial), saved: JSON.stringify(initial), removed: false
    };
    session.record = result.then((value) => {
      if (!value.ok) throw new Error(value.code);
      session.recordId = value.record.id;
      return value.record.id;
    });
    this.current = session;
    this.sessions.add(session);
    this.drain(session);
  }

  update(snapshot: RemoteLyricsSnapshot) {
    const session = this.current;
    if (!session || session.removed) return;
    session.latest = structuredClone(snapshot);
    this.drain(session);
  }

  ownsUrl(url: string) { return Boolean(this.current && !this.current.removed && this.current.replayUrl === url); }

  detach() {
    const previous = this.current;
    this.current = null;
    // An initial automatic import that never created a record has already warned
    // the user; it must not poison a later document after they replace this one.
    if (previous && !previous.writing && (!previous.error || !previous.recordId)) this.sessions.delete(previous);
  }

  remove(id?: string) {
    for (const session of this.sessions) {
      if (id === undefined || session.recordId === id) {
        session.removed = true;
        session.error = undefined;
        if (this.current === session) this.current = null;
      }
    }
  }

  async flush({ ignoreUnrecordedFailures = false }: { ignoreUnrecordedFailures?: boolean } = {}) {
    // Includes detached sessions: changing songs must not abandon the prior song's final edit.
    for (const session of this.sessions) this.drain(session);
    while (true) {
      const pending = [...this.sessions].flatMap((session) => session.writing ? [session.writing] : []);
      if (!pending.length) break;
      await Promise.all(pending);
    }
    const failed = [...this.sessions].find((session) => session.error && !session.removed &&
      (!ignoreUnrecordedFailures || session.recordId));
    if (failed) throw failed.error;
  }

  private drain(session: Session) {
    if (session.writing || session.removed) return;
    const operation = (async () => {
      const id = await session.record;
      if (!id || session.removed) return;
      while (!session.removed && session.saved !== JSON.stringify(session.latest)) {
        const snapshot = session.latest;
        const result = await this.write(id, snapshot);
        if (!result.ok) {
          // Deletion and automatic trimming must never recreate the record.
          if (result.code === "not_found") { session.removed = true; break; }
          throw new Error(result.code);
        }
        session.saved = JSON.stringify(snapshot);
      }
      session.error = undefined;
    })();
    session.writing = operation.catch((error: unknown) => {
      if (!session.error && !session.removed) this.warn();
      session.error = error;
    }).finally(() => {
      session.writing = undefined;
      if (!session.error && !session.removed && session.saved !== JSON.stringify(session.latest)) {
        this.drain(session);
      } else if (session.removed || (this.current !== session && (!session.error || !session.recordId))) {
        this.sessions.delete(session);
      }
    });
  }
}
