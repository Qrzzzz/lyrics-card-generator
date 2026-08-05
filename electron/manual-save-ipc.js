"use strict";

function createManualSaveIpcHandlers({
  trackMutation,
  readLimit,
  store,
  errorCode,
  logger = console
}) {
  if (
    typeof trackMutation !== "function" ||
    typeof readLimit !== "function" ||
    !store ||
    typeof store.createManualSave !== "function" ||
    typeof store.updateManualSave !== "function" ||
    typeof errorCode !== "function"
  ) {
    throw new TypeError("Manual-save IPC handlers require explicit queue, preference, Store, and error dependencies.");
  }

  const create = (_event, envelope) => {
    if (typeof envelope !== "string") return { ok: false, code: "invalid_snapshot" };
    return trackMutation(async () => {
      try {
        const record = await store.createManualSave(envelope, await readLimit());
        return { ok: true, record };
      } catch (error) {
        logger.error(
          "[import-history] unable to create manual save",
          error instanceof Error ? error.message : "unknown error"
        );
        return { ok: false, code: errorCode(error) };
      }
    });
  };

  const update = (_event, recordId, envelope) => {
    if (typeof envelope !== "string") return { ok: false, code: "invalid_snapshot" };
    return trackMutation(async () => {
      try {
        const record = await store.updateManualSave(recordId, envelope, await readLimit());
        return { ok: true, record };
      } catch (error) {
        logger.error(
          "[import-history] unable to update manual save",
          error instanceof Error ? error.message : "unknown error"
        );
        return { ok: false, code: errorCode(error) };
      }
    });
  };

  return { create, update };
}

module.exports = { createManualSaveIpcHandlers };
