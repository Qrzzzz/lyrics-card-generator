const {
  INVALID_BASE_URL_ERROR_CODE, INSECURE_BASE_URL_ERROR_CODE,
  buildChatCompletionsRequestBody: buildProviderChatCompletionsRequestBody,
  getChatCompletionMessage, getChatCompletionsUrl: resolveProviderChatCompletionsUrl,
  readProviderError: readNormalizedProviderError, readProviderResponseBody
} = require("./provider-response");
const { AIStreamError, assertAICompletionBudgets, consumeOpenAICompatibleSSE, createAIStreamDeadline } = require("./ai-stream");

function resolveAIProviderEndpoint(baseUrl) {
  try {
    return resolveProviderChatCompletionsUrl(baseUrl);
  } catch (error) {
    const code = error instanceof Error && error.message === INSECURE_BASE_URL_ERROR_CODE
      ? INSECURE_BASE_URL_ERROR_CODE
      : INVALID_BASE_URL_ERROR_CODE;
    throw createAIError(code);
  }
}

async function streamAITranslationInMain({ settings, apiKey, prompt, reasoning, signal, onStatus, onReasoningDelta, onDelta }) {
  const deadline = createAIStreamDeadline(signal);
  try {
    const endpoint = resolveAIProviderEndpoint(settings.baseUrl);
    const requestBody = buildProviderChatCompletionsRequestBody({
      baseUrl: settings.baseUrl,
      model: settings.model,
      prompt,
      reasoning,
      temperature: settings.temperature
    });
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: deadline.signal
    });

    if (!response.ok) {
      throw createAIError(
        "provider_error",
        await readNormalizedProviderError(response, deadline.signal, apiKey)
      );
    }
    onStatus("connected");

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      const body = await readProviderResponseBody(response, deadline.signal);
      const { content, reasoningContent } = getChatCompletionMessage(body);
      assertAICompletionBudgets(content, reasoningContent);
      if (reasoningContent) {
        onStatus("reasoning");
        onReasoningDelta(reasoningContent);
      }
      if (!content) throw createAIError("empty_response");
      onStatus("translating");
      onDelta(content);
      return content;
    }

    if (!response.body) throw createAIError("empty_stream");
    const result = await consumeOpenAICompatibleSSE(
      response,
      {
        onReasoningDelta(delta) {
          onStatus("reasoning");
          onReasoningDelta(delta);
        },
        onDelta(delta) {
          onStatus("translating");
          onDelta(delta);
        }
      },
      { signal: deadline.signal, deadlineAt: deadline.deadlineAt }
    );
    if (!result.content.trim()) throw createAIError("empty_response");
    return result.content;
  } catch (error) {
    if (error instanceof Error && error.message.includes("AI_ERROR:")) throw error;
    if (signal.aborted) throw createAIError("cancelled");
    if (deadline.signal.reason instanceof AIStreamError) {
      throw createAIError(deadline.signal.reason.code);
    }
    if (error instanceof AIStreamError) throw createAIError(error.code);
    if (error?.code === "response_too_large") throw createAIError("response_too_large");
    throw createAIError("network");
  } finally {
    deadline.dispose();
  }
}

function createAIError(code, diagnostic) {
  return new Error(`AI_ERROR:${code}${diagnostic ? `:${String(diagnostic).slice(0, 500)}` : ""}`);
}

module.exports = { streamAITranslationInMain, resolveAIProviderEndpoint, createAIError };
