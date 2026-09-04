import type { AutosaveStatus } from "@/lib/editor-draft";

export const AUTOSAVE_DELAY_MS = 5_000;

/** One logical document owns one write lane. Replacement must await flush(). */
export class EditorAutosave<T> {
  private latest: T | null = null;
  private latestKey = "";
  private savedKey = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | null = null;
  private writingGeneration = 0;
  private generation = 0;
  private enabled = true;
  private blocked = false;
  private lastEditAt = 0;
  private status: AutosaveStatus = "idle";

  constructor(private readonly options: {
    write: (snapshot: T) => Promise<void>;
    key?: (snapshot: T) => string;
    onStatus: (status: AutosaveStatus) => void;
    now?: () => number;
    schedule?: typeof setTimeout;
    cancel?: typeof clearTimeout;
  }) {}

  getStatus() { return this.status; }
  private publish(status: AutosaveStatus) {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }
  private clearTimer() {
    if (this.timer !== undefined) (this.options.cancel ?? clearTimeout)(this.timer);
    this.timer = undefined;
  }
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) { this.clearTimer(); this.publish("disabled"); }
    else if (!this.blocked) this.schedule();
  }
  reset(snapshot: T | null, saved = false) {
    this.clearTimer();
    this.generation++;
    this.blocked = false;
    this.latest = snapshot === null ? null : structuredClone(snapshot);
    this.latestKey = snapshot === null ? "" : this.key(snapshot);
    this.savedKey = this.latestKey;
    this.publish(!this.enabled ? "disabled" : saved ? "saved" : "idle");
  }
  suspend() {
    this.clearTimer();
    this.generation++;
    this.blocked = true;
    this.publish("disabled");
  }
  markUnsaved() {
    this.savedKey = "";
    this.lastEditAt = (this.options.now ?? Date.now)();
    this.schedule();
  }
  update(snapshot: T, force = false) {
    const key = this.key(snapshot);
    this.latest = structuredClone(snapshot);
    if (key === this.latestKey && !force) return;
    this.latestKey = key;
    if (force) this.savedKey = "";
    this.lastEditAt = (this.options.now ?? Date.now)();
    if (this.enabled && !this.blocked) this.schedule();
  }
  private key(snapshot: T) { return (this.options.key ?? JSON.stringify)(snapshot); }
  private schedule() {
    this.clearTimer();
    if (!this.enabled || this.blocked) return;
    if (!this.latest || this.latestKey === this.savedKey) {
      if (this.status !== "idle") this.publish("saved");
      return;
    }
    this.publish("pending");
    const delay = Math.max(0, AUTOSAVE_DELAY_MS - ((this.options.now ?? Date.now)() - this.lastEditAt));
    this.timer = (this.options.schedule ?? setTimeout)(() => {
      this.timer = undefined;
      void this.flush(false).catch(() => undefined);
    }, delay);
  }
  async flush(force = true): Promise<void> {
    this.clearTimer();
    if (!this.enabled || this.blocked) return;
    if (this.writing) {
      const writingGeneration = this.writingGeneration;
      try { await this.writing; }
      catch (error) { if (writingGeneration === this.generation) throw error; }
      return this.flush(force);
    }
    if (this.latest === null || this.latestKey === this.savedKey) return;
    if (!force && (this.options.now ?? Date.now)() - this.lastEditAt < AUTOSAVE_DELAY_MS) {
      this.schedule();
      return;
    }
    const snapshot = this.latest;
    const key = this.latestKey;
    const generation = this.generation;
    this.publish("saving");
    const writing = this.options.write(snapshot);
    this.writing = writing;
    this.writingGeneration = generation;
    try {
      await writing;
      if (generation !== this.generation) return;
      this.savedKey = key;
      if (key === this.latestKey) this.publish("saved");
    } catch (error) {
      if (generation === this.generation) this.publish("error");
      throw error;
    } finally {
      if (this.writing === writing) this.writing = null;
    }
    if (generation === this.generation && key !== this.latestKey) {
      if (force) await this.flush(true);
      else this.schedule();
    }
  }
  dispose() { this.clearTimer(); }
}
