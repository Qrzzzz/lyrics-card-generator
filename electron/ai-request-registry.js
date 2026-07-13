class AIRequestRegistry {
  constructor({ tombstoneTtlMs = 30_000, now = () => Date.now() } = {}) {
    this.tombstoneTtlMs = tombstoneTtlMs;
    this.now = now;
    this.requestsBySender = new Map();
    this.tombstonesBySender = new Map();
    this.observedSenders = new Set();
  }

  begin(sender, requestId) {
    this.#purgeExpiredTombstones();
    this.#observeSender(sender);
    const requests = this.#senderMap(this.requestsBySender, sender);
    requests.get(requestId)?.abort();

    const controller = new AbortController();
    requests.set(requestId, controller);
    if (this.#hasTombstone(sender, requestId)) {
      controller.abort(new Error("AI translation request was cancelled before startup completed."));
    }
    return controller;
  }

  cancel(sender, requestId) {
    this.#purgeExpiredTombstones();
    this.#observeSender(sender);
    this.#senderMap(this.tombstonesBySender, sender).set(requestId, this.now() + this.tombstoneTtlMs);
    const controller = this.requestsBySender.get(sender)?.get(requestId);
    if (controller && !controller.signal.aborted) {
      controller.abort(new Error("AI translation request was cancelled."));
    }
    return { cancelled: true, active: Boolean(controller) };
  }

  isActive(sender, requestId, controller) {
    return !controller.signal.aborted &&
      !sender.isDestroyed() &&
      this.requestsBySender.get(sender)?.get(requestId) === controller;
  }

  finish(sender, requestId, controller) {
    const requests = this.requestsBySender.get(sender);
    if (requests?.get(requestId) !== controller) return false;
    requests.delete(requestId);
    if (requests.size === 0) this.requestsBySender.delete(sender);
    return true;
  }

  clearSender(sender) {
    const requests = this.requestsBySender.get(sender);
    requests?.forEach((controller) => controller.abort(new Error("AI translation sender was destroyed.")));
    this.requestsBySender.delete(sender);
    this.tombstonesBySender.delete(sender);
    this.observedSenders.delete(sender);
  }

  get activeCount() {
    let count = 0;
    this.requestsBySender.forEach((requests) => { count += requests.size; });
    return count;
  }

  get tombstoneCount() {
    this.#purgeExpiredTombstones();
    let count = 0;
    this.tombstonesBySender.forEach((tombstones) => { count += tombstones.size; });
    return count;
  }

  #observeSender(sender) {
    if (this.observedSenders.has(sender)) return;
    this.observedSenders.add(sender);
    sender.once("destroyed", () => this.clearSender(sender));
  }

  #senderMap(collection, sender) {
    let entries = collection.get(sender);
    if (!entries) {
      entries = new Map();
      collection.set(sender, entries);
    }
    return entries;
  }

  #hasTombstone(sender, requestId) {
    return (this.tombstonesBySender.get(sender)?.get(requestId) ?? 0) > this.now();
  }

  #purgeExpiredTombstones() {
    const now = this.now();
    this.tombstonesBySender.forEach((tombstones, sender) => {
      tombstones.forEach((expiresAt, requestId) => {
        if (expiresAt <= now) tombstones.delete(requestId);
      });
      if (tombstones.size === 0) this.tombstonesBySender.delete(sender);
    });
  }
}

module.exports = { AIRequestRegistry };
