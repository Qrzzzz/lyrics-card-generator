export function getConnectionTestResponseError(body: { kind: string; data?: unknown }): "provider_error" | "invalid_response" | undefined;
export function sanitizeProviderDiagnostic(diagnostic: unknown, apiKey?: string): string;
