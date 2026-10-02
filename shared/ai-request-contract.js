const budgets = require("./resource-budgets.json");

/** @param {unknown} value @returns {value is string} */
function isValidAIRequestId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
}

/**
 * Privileged IPC accepts unknown and exposes only this validated transport shape.
 * @param {unknown} input
 * @returns {{ok: true, prompt: string, reasoning: boolean} | {ok: false, code: "invalid_request" | "request_too_large"}}
 */
function parseAITranslationRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "invalid_request" };
  const source = /** @type {Record<string, unknown>} */ (input);
  if (typeof source.prompt !== "string" || !source.prompt.trim() ||
      (source.reasoning !== undefined && typeof source.reasoning !== "boolean")) return { ok: false, code: "invalid_request" };
  if (new TextEncoder().encode(source.prompt).byteLength > budgets.jsonRequestBytes.aiTranslate) {
    return { ok: false, code: "request_too_large" };
  }
  return { ok: true, prompt: source.prompt, reasoning: source.reasoning === true };
}
module.exports = { isValidAIRequestId, parseAITranslationRequest };
