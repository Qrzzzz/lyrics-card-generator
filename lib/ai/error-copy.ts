import type { Locale } from "@/lib/types";

export type AIErrorCode = "missing_api_key" | "missing_model" | "missing_base_url" | "invalid_base_url" | "invalid_request" | "empty_prompt" | "network" | "timeout" | "provider_error" | "empty_stream" | "invalid_response" | "empty_response" | "cancelled" | "request_failed" | "unknown";

const copy: Record<Locale, Record<AIErrorCode, string>> = {
  zh: {
    missing_api_key: "尚未配置 API Key，请先前往设置。", missing_model: "尚未配置模型，请先在设置中填写模型名称。", missing_base_url: "尚未配置 Base URL，请先前往设置。", invalid_base_url: "Base URL 无效，请检查设置。", invalid_request: "AI 翻译请求无效。", empty_prompt: "歌词为空，请先输入歌词。", network: "网络请求失败，请检查 Base URL、网络连接和服务状态。", timeout: "AI 请求超时，请稍后重试。", provider_error: "AI 服务返回错误。", empty_stream: "AI 服务未返回可读取的数据流。", invalid_response: "AI 服务返回了无法解析的响应。", empty_response: "AI 返回为空，请重试或更换模型。", cancelled: "AI 翻译已取消。", request_failed: "AI 翻译请求失败。", unknown: "AI 翻译请求失败，请检查网络和接口设置。"
  },
  "zh-TW": {
    missing_api_key: "尚未設定 API Key，請先前往設定。", missing_model: "尚未設定模型，請先在設定中填寫模型名稱。", missing_base_url: "尚未設定 Base URL，請先前往設定。", invalid_base_url: "Base URL 無效，請檢查設定。", invalid_request: "AI 翻譯請求無效。", empty_prompt: "歌詞為空，請先輸入歌詞。", network: "網路請求失敗，請檢查 Base URL、網路連線和服務狀態。", timeout: "AI 請求逾時，請稍後重試。", provider_error: "AI 服務傳回錯誤。", empty_stream: "AI 服務未傳回可讀取的資料串流。", invalid_response: "AI 服務傳回了無法解析的回應。", empty_response: "AI 回傳內容為空，請重試或更換模型。", cancelled: "AI 翻譯已取消。", request_failed: "AI 翻譯請求失敗。", unknown: "AI 翻譯請求失敗，請檢查網路和介面設定。"
  },
  en: {
    missing_api_key: "No API key is configured. Open Settings to add one.", missing_model: "No model is configured. Enter the model name in Settings.", missing_base_url: "No Base URL is configured. Open Settings to add one.", invalid_base_url: "The Base URL is invalid. Check Settings.", invalid_request: "The AI translation request is invalid.", empty_prompt: "Enter lyrics before starting a translation.", network: "The network request failed. Check the Base URL, connection, and service status.", timeout: "The AI request timed out. Try again later.", provider_error: "The AI provider returned an error.", empty_stream: "The AI provider did not return a readable stream.", invalid_response: "The AI provider returned an unreadable response.", empty_response: "The AI response was empty. Retry or choose another model.", cancelled: "AI translation was cancelled.", request_failed: "The AI translation request failed.", unknown: "AI translation failed. Check the network and provider settings."
  },
  fr: {
    missing_api_key: "Aucune clé API n’est configurée. Ajoutez-en une dans les paramètres.", missing_model: "Aucun modèle n’est configuré. Indiquez son nom dans les paramètres.", missing_base_url: "Aucune URL de base n’est configurée. Ajoutez-en une dans les paramètres.", invalid_base_url: "L’URL de base est invalide. Vérifiez les paramètres.", invalid_request: "La demande de traduction IA est invalide.", empty_prompt: "Saisissez des paroles avant de lancer la traduction.", network: "La requête réseau a échoué. Vérifiez l’URL de base, la connexion et le service.", timeout: "La requête IA a expiré. Réessayez plus tard.", provider_error: "Le fournisseur d’IA a renvoyé une erreur.", empty_stream: "Le fournisseur d’IA n’a pas renvoyé de flux lisible.", invalid_response: "Le fournisseur d’IA a renvoyé une réponse illisible.", empty_response: "La réponse de l’IA est vide. Réessayez ou changez de modèle.", cancelled: "La traduction IA a été annulée.", request_failed: "La demande de traduction IA a échoué.", unknown: "La traduction IA a échoué. Vérifiez le réseau et les paramètres du fournisseur."
  },
  ja: {
    missing_api_key: "API キーが設定されていません。設定画面で追加してください。", missing_model: "モデルが設定されていません。設定画面でモデル名を入力してください。", missing_base_url: "Base URL が設定されていません。設定画面で追加してください。", invalid_base_url: "Base URL が無効です。設定を確認してください。", invalid_request: "AI 翻訳リクエストが無効です。", empty_prompt: "翻訳を始める前に歌詞を入力してください。", network: "ネットワーク要求に失敗しました。Base URL、接続、サービス状態を確認してください。", timeout: "AI リクエストがタイムアウトしました。後でもう一度お試しください。", provider_error: "AI プロバイダーがエラーを返しました。", empty_stream: "AI プロバイダーから読み取り可能なストリームが返されませんでした。", invalid_response: "AI プロバイダーから解析できない応答が返されました。", empty_response: "AI の応答が空です。再試行するか別のモデルを選んでください。", cancelled: "AI 翻訳をキャンセルしました。", request_failed: "AI 翻訳リクエストに失敗しました。", unknown: "AI 翻訳に失敗しました。ネットワークとプロバイダー設定を確認してください。"
  },
  es: {
    missing_api_key: "No hay una clave API configurada. Añádela en Configuración.", missing_model: "No hay un modelo configurado. Escribe su nombre en Configuración.", missing_base_url: "No hay una URL base configurada. Añádela en Configuración.", invalid_base_url: "La URL base no es válida. Revisa la configuración.", invalid_request: "La solicitud de traducción con IA no es válida.", empty_prompt: "Escribe la letra antes de iniciar la traducción.", network: "La solicitud de red falló. Revisa la URL base, la conexión y el servicio.", timeout: "La solicitud de IA agotó el tiempo. Inténtalo de nuevo más tarde.", provider_error: "El proveedor de IA devolvió un error.", empty_stream: "El proveedor de IA no devolvió un flujo legible.", invalid_response: "El proveedor de IA devolvió una respuesta ilegible.", empty_response: "La respuesta de IA está vacía. Reintenta o elige otro modelo.", cancelled: "La traducción con IA se canceló.", request_failed: "La solicitud de traducción con IA falló.", unknown: "La traducción con IA falló. Revisa la red y la configuración del proveedor."
  }
};

export function getAIErrorMessage(locale: Locale, code: AIErrorCode, diagnostic?: string) {
  const primary = copy[locale][code] ?? copy[locale].unknown;
  return diagnostic && code === "provider_error" ? `${primary} (${diagnostic.slice(0, 300)})` : primary;
}

export function parseSerializedAIError(message: string) {
  const normalized = message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "");
  const match = normalized.match(/^AI_ERROR:([a-z_]+)(?::([\s\S]*))?$/);
  return match ? { code: match[1] as AIErrorCode, diagnostic: match[2]?.trim() || undefined } : { code: "unknown" as const, diagnostic: undefined };
}
