const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { AIRequestRegistry } = require("../electron/ai-request-registry");

class Sender extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
  }

  isDestroyed() {
    return this.destroyed;
  }

  destroy() {
    this.destroyed = true;
    this.emit("destroyed");
  }
}

{
  const registry = new AIRequestRegistry();
  const sender = new Sender();
  registry.cancel(sender, "early");
  const controller = registry.begin(sender, "early");
  assert.equal(controller.signal.aborted, true, "a pre-start cancel tombstone aborts before settings/provider work");
  registry.finish(sender, "early", controller);
  assert.equal(registry.activeCount, 0);
}

{
  const registry = new AIRequestRegistry();
  const firstWindow = new Sender();
  const secondWindow = new Sender();
  const first = registry.begin(firstWindow, "same-id");
  const second = registry.begin(secondWindow, "same-id");
  registry.cancel(firstWindow, "same-id");
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false, "request ids are scoped to their sender");
  assert.equal(registry.isActive(secondWindow, "same-id", second), true);
}

{
  let now = 100;
  const registry = new AIRequestRegistry({ tombstoneTtlMs: 10, now: () => now });
  const sender = new Sender();
  const controller = registry.begin(sender, "active");
  assert.deepEqual(registry.cancel(sender, "active"), { cancelled: true, active: true });
  assert.deepEqual(registry.cancel(sender, "active"), { cancelled: true, active: true });
  assert.equal(controller.signal.aborted, true, "duplicate cancel remains idempotent");
  registry.finish(sender, "active", controller);
  assert.equal(registry.activeCount, 0);
  assert.equal(registry.tombstoneCount, 1);
  now = 111;
  assert.equal(registry.tombstoneCount, 0, "bounded tombstones are eventually removed");
}

{
  const registry = new AIRequestRegistry();
  const sender = new Sender();
  const controller = registry.begin(sender, "destroyed");
  sender.destroy();
  assert.equal(controller.signal.aborted, true);
  assert.equal(registry.activeCount, 0, "sender destruction aborts and clears every request");
  assert.equal(registry.tombstoneCount, 0);
}

console.log("Electron AI request lifecycle tests passed");
