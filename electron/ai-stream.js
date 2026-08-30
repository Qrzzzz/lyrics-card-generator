const resourceBudgets = require("./resource-budgets.json");

const AI_STREAM_ERROR_CODES = new Set([
  "cancelled",
  "stream_idle_timeout",
  "stream_deadline_exceeded",
  "stream_event_too_large",
  "stream_buffer_too_large",
  "stream_output_too_large",
  "stream_reasoning_too_large"
]);

class AIStreamError extends Error {
  constructor(code) {
    super(`AI stream failed: ${code}`);
    this.name = "AIStreamError";
    this.code = code;
  }
}

function createAIStreamDeadline(parentSignal, timeoutMs = resourceBudgets.aiStream.totalDeadlineMs) {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutMs;
  const abortFromParent = () => {
    if (controller.signal.aborted) return;
    controller.abort(toAIStreamError(parentSignal?.reason, "cancelled"));
  };
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new AIStreamError("stream_deadline_exceeded"));
    }
  }, timeoutMs);

  return {
    signal: controller.signal,
    deadlineAt,
    dispose() {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}

async function consumeOpenAICompatibleSSE(response, callbacks = {}, options = {}) {
  if (!response.body) {
    throw new Error("AI provider did not return a readable stream.");
  }

  const limits = { ...resourceBudgets.aiStream, ...(options.limits ?? {}) };
  const deadlineAt = options.deadlineAt ?? Date.now() + limits.totalDeadlineMs;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let bufferBytes = 0;
  let output = "";
  let reasoning = "";
  let outputBytes = 0;
  let reasoningBytes = 0;
  let completed = false;

  const emitEvent = async (event) => {
    if (encoder.encode(event).byteLength > limits.singleEventBytes) {
      throw new AIStreamError("stream_event_too_large");
    }

    const dataLines = [];
    for (const line of event.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return false;
    const payload = dataLines.join("\n").trim();
    if (!payload) return false;
    if (payload === "[DONE]") return true;

    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      return false;
    }

    const reasoningDelta = data?.choices?.[0]?.delta?.reasoning_content;
    if (typeof reasoningDelta === "string" && reasoningDelta) {
      reasoningBytes += encoder.encode(reasoningDelta).byteLength;
      if (reasoningBytes > limits.reasoningBytes) {
        throw new AIStreamError("stream_reasoning_too_large");
      }
      reasoning += reasoningDelta;
      await callbacks.onReasoningDelta?.(reasoningDelta, reasoning);
    }

    const outputDelta = data?.choices?.[0]?.delta?.content;
    if (typeof outputDelta === "string" && outputDelta) {
      outputBytes += encoder.encode(outputDelta).byteLength;
      if (outputBytes > limits.outputBytes) {
        throw new AIStreamError("stream_output_too_large");
      }
      output += outputDelta;
      await callbacks.onDelta?.(outputDelta, output);
    }
    return false;
  };

  const consumeBuffer = async (flushTail = false) => {
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = flushTail ? "" : (events.pop() ?? "");
    if (flushTail && events.length === 1 && events[0] === "") return false;
    bufferBytes = encoder.encode(buffer).byteLength;
    for (const event of events) {
      if (await emitEvent(event)) return true;
    }
    return false;
  };

  try {
    while (!completed) {
      const { done, value } = await readWithBudgets(
        reader,
        options.signal,
        limits.idleTimeoutMs,
        deadlineAt
      );

      if (done) {
        buffer += decoder.decode();
        bufferBytes = encoder.encode(buffer).byteLength;
        if (bufferBytes > limits.bufferBytes) {
          throw new AIStreamError("stream_buffer_too_large");
        }
        completed = await consumeBuffer(true);
        break;
      }

      if (bufferBytes + value.byteLength > limits.bufferBytes) {
        throw new AIStreamError("stream_buffer_too_large");
      }
      buffer += decoder.decode(value, { stream: true });
      completed = await consumeBuffer(false);
    }

    if (completed) {
      await safeCancel(reader, "SSE [DONE] received.");
    }
    return { content: output, reasoningContent: reasoning, doneReceived: completed };
  } catch (error) {
    await safeCancel(reader, error);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cancellation already released the transport resources.
    }
  }
}

function assertAICompletionBudgets(content, reasoningContent, limits = resourceBudgets.aiStream) {
  const encoder = new TextEncoder();
  if (encoder.encode(String(content ?? "")).byteLength > limits.outputBytes) {
    throw new AIStreamError("stream_output_too_large");
  }
  if (encoder.encode(String(reasoningContent ?? "")).byteLength > limits.reasoningBytes) {
    throw new AIStreamError("stream_reasoning_too_large");
  }
}

function readWithBudgets(reader, signal, idleTimeoutMs, deadlineAt) {
  if (signal?.aborted) return Promise.reject(toAIStreamError(signal.reason, "cancelled"));
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) return Promise.reject(new AIStreamError("stream_deadline_exceeded"));
  const waitMs = Math.max(1, Math.min(idleTimeoutMs, remainingMs));
  const timeoutCode = remainingMs <= idleTimeoutMs
    ? "stream_deadline_exceeded"
    : "stream_idle_timeout";

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      operation();
    };
    const onAbort = () => finish(() => reject(toAIStreamError(signal?.reason, "cancelled")));
    const timer = setTimeout(() => finish(() => reject(new AIStreamError(timeoutCode))), waitMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => finish(() => resolve(result)),
      (error) => finish(() => reject(signal?.aborted ? toAIStreamError(signal.reason, "cancelled") : error))
    );
  });
}

async function safeCancel(reader, reason) {
  try {
    await reader.cancel(reason);
  } catch {
    // Preserve the budget/cancellation classification that initiated cleanup.
  }
}

function toAIStreamError(error, fallbackCode) {
  if (error instanceof AIStreamError) return error;
  if (error && typeof error === "object" && AI_STREAM_ERROR_CODES.has(error.code)) {
    return new AIStreamError(error.code);
  }
  return new AIStreamError(fallbackCode);
}

module.exports = {
  AIStreamError,
  assertAICompletionBudgets,
  consumeOpenAICompatibleSSE,
  createAIStreamDeadline,
  resourceBudgets
};
