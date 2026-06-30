export function normalizeAIErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "");
  }

  return "AI 翻译请求失败，请检查网络和接口设置。";
}
