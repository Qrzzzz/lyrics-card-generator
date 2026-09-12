/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate the non-streaming completion envelope, not the model's wording.
 * A one-token probe may legitimately end with empty content or reasoning only.
 * @param {{ kind: string, data?: unknown }} body
 * @returns {"provider_error" | "invalid_response" | undefined}
 */
function getConnectionTestResponseError(body) {
  if (body.kind !== "json" || !isRecord(body.data)) return "invalid_response";
  const data = body.data;
  if (Object.hasOwn(data, "error")) return "provider_error";
  if (!Array.isArray(data.choices) || data.choices.length === 0) return "invalid_response";
  const valid = data.choices.every((choice) => {
    if (!isRecord(choice) || !isRecord(choice.message)) return false;
    const message = choice.message;
    if ("role" in message && message.role !== "assistant") return false;
    if ("content" in message && message.content !== null && typeof message.content !== "string") return false;
    if ("reasoning_content" in message && typeof message.reasoning_content !== "string") return false;
    if ("refusal" in message && message.refusal !== null && typeof message.refusal !== "string") return false;
    if ("tool_calls" in message && !Array.isArray(message.tool_calls)) return false;
    return "content" in message
      || typeof message.reasoning_content === "string"
      || typeof message.refusal === "string"
      || (Array.isArray(message.tool_calls) && message.tool_calls.length > 0)
      || choice.finish_reason === "length";
  });
  return valid ? undefined : "invalid_response";
}

/**
 * Remove the actual secret at the privileged boundary before truncation. The
 * renderer also applies this bounded display policy to serialized diagnostics.
 * @param {unknown} diagnostic
 * @param {string} [apiKey]
 */
function sanitizeProviderDiagnostic(diagnostic, apiKey = "") {
  if (typeof diagnostic !== "string") return "";
  const secret = apiKey.trim();
  const redacted = secret ? diagnostic.split(secret).join("[redacted]") : diagnostic;
  return redacted
    .replace(/\bBearer\s+[^\s,;"'<>]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/\p{Cc}/gu, " ")
    .trim()
    .slice(0, 300);
}

module.exports = { getConnectionTestResponseError, sanitizeProviderDiagnostic };
