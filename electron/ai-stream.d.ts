export type AIStreamErrorCode =
  | "cancelled"
  | "stream_idle_timeout"
  | "stream_deadline_exceeded"
  | "stream_event_too_large"
  | "stream_buffer_too_large"
  | "stream_output_too_large"
  | "stream_reasoning_too_large";

export class AIStreamError extends Error {
  readonly code: AIStreamErrorCode;
  constructor(code: AIStreamErrorCode);
}

export type AIStreamLimits = {
  singleEventBytes: number;
  bufferBytes: number;
  outputBytes: number;
  reasoningBytes: number;
  idleTimeoutMs: number;
  totalDeadlineMs: number;
};

export type AIStreamCallbacks = {
  onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
  onReasoningDelta?: (delta: string, accumulated: string) => void | Promise<void>;
};

export function consumeOpenAICompatibleSSE(
  response: Response,
  callbacks?: AIStreamCallbacks,
  options?: { signal?: AbortSignal; deadlineAt?: number; limits?: Partial<AIStreamLimits> }
): Promise<{ content: string; reasoningContent: string; doneReceived: boolean }>;

export function assertAICompletionBudgets(
  content: string,
  reasoningContent: string,
  limits?: AIStreamLimits
): void;

export function createAIStreamDeadline(
  parentSignal?: AbortSignal,
  timeoutMs?: number
): { signal: AbortSignal; deadlineAt: number; dispose: () => void };

export const resourceBudgets: {
  jsonRequestBytes: Record<string, number>;
  upstreamResponseBytes: Record<string, number>;
  upstreamTimeoutMs: Record<string, number>;
  aiStream: AIStreamLimits;
  localAudio: Record<string, number>;
};
