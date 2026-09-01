import { NextResponse } from "next/server";
import resourceBudgets from "@/electron/resource-budgets.json";
import {
  AIProviderConnectionError,
  testAIProviderConnection
} from "@/lib/ai/provider-request";
import type { SaveAISettingsInput } from "@/lib/ai/types";
import { validateAppMutationRequest } from "@/lib/app-request";
import { readLimitedJson } from "@/lib/json-request";

export const runtime = "nodejs";

type ConnectionTestBody = {
  settings?: SaveAISettingsInput & { apiKey?: string };
};

export async function POST(request: Request) {
  const rejection = validateAppMutationRequest(request, "application/json");
  if (rejection) return errorResponse(rejection.code, rejection.status);

  const bodyResult = await readLimitedJson<ConnectionTestBody>(
    request,
    resourceBudgets.jsonRequestBytes.aiConnectionTest
  );
  if (!bodyResult.ok) {
    const code = bodyResult.reason === "too_large"
      ? "request_too_large"
      : bodyResult.reason === "cancelled"
        ? "cancelled"
        : "invalid_request";
    return errorResponse(code, code === "request_too_large" ? 413 : code === "cancelled" ? 499 : 400);
  }

  const settings = bodyResult.value.settings;
  try {
    await testAIProviderConnection({
      baseUrl: settings?.baseUrl ?? "",
      model: settings?.model ?? "",
      apiKey: settings?.apiKey ?? "",
      signal: request.signal
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AIProviderConnectionError) {
      const status = error.code === "provider_error"
        ? 502
        : error.code === "timeout"
          ? 504
          : error.code === "cancelled"
            ? 499
            : error.code === "response_too_large"
              ? 502
              : 400;
      return errorResponse(error.code, status, error.diagnostic);
    }
    return errorResponse("network", 502);
  }
}

function errorResponse(code: string, status: number, diagnostic?: string) {
  return NextResponse.json({ error: { code, diagnostic } }, { status });
}
