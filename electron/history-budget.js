// JSON text can expand several times in memory. Keep both the primary and the
// recovery file bounded; never interpret an over-budget file as corrupt/empty.
const MAX_HISTORY_DOCUMENT_BYTES = require("../shared/resource-budgets.json").history.documentBytes;

function historyBudgetError() {
  const error = new Error("history_storage_limit");
  return Object.assign(error, { code: "history_storage_limit" });
}

/**
 * The open handle binds stat and read to the same file. A bounded read also
 * catches files growing after stat, without allocating their complete contents.
 * @param {typeof import("node:fs/promises")} filesystem
 * @param {string} filePath
 * @param {number} maximumBytes
 */
async function readHistoryJson(filesystem, filePath, maximumBytes = MAX_HISTORY_DOCUMENT_BYTES) {
  const handle = await filesystem.open(filePath, "r");
  try {
    if ((await handle.stat()).size > maximumBytes) throw historyBudgetError();
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maximumBytes - total + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maximumBytes) throw historyBudgetError();
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return { value: JSON.parse(Buffer.concat(chunks, total).toString("utf8")), bytes: total };
  } finally { await handle.close(); }
}

/**
 * Linear membership checks; diagnostics count visits without timing gates.
 * @param {{ id: string }[]} previous
 * @param {{ id: string }[]} next
 * @param {(event: string) => void} observe
 */
function hasRemovedHistoryRecords(previous, next, observe = () => {}) {
  const ids = new Set(next.map((record) => { observe("deletion-index"); return record.id; }));
  return previous.some((record) => { observe("deletion-check"); return !ids.has(record.id); });
}

module.exports = { MAX_HISTORY_DOCUMENT_BYTES, historyBudgetError, readHistoryJson, hasRemovedHistoryRecords };
