import type { Locale } from "@/lib/types";

export type AIPromptUiCopy = {
  workspace: string;
  workspaceDescription: string;
  apiConfiguration: string;
  apiConfigurationDescription: string;
  translationDefaults: string;
  translationDefaultsDescription: string;
  promptLibrary: string;
  promptLibraryDescription: string;
  back: string;
  forward: string;
  open: string;
  formatRules: string;
  formatRulesDescription: string;
  formatRulesWarning: string;
  reset: string;
  resetAll: string;
  defaultPresets: string;
  defaultPresetSummary: string;
  customPresets: string;
  customPresetsDescription: string;
  customPresetSummary: string;
  customPresetsEmpty: string;
  manageCustomHint: string;
  addPreset: string;
  presetLimit: string;
  presetTitle: string;
  presetPrompt: string;
  presetPromptPlaceholder: string;
  protectedPreset: string;
  defaultPreset: string;
  customPreset: string;
  editPreset: string;
  deletePreset: string;
  deletePresetConfirm: string;
  restorePreset: string;
  restorePresetDescription: string;
  newPresetTitle: string;
  savePreset: string;
  discardDraft: string;
  requiredFields: string;
  modified: string;
};

const COPY: Record<Locale, AIPromptUiCopy> = {
  zh: {
    workspace: "AI 工作区", workspaceDescription: "在三个独立页面中管理服务连接、翻译默认值与模块化提示词。",
    apiConfiguration: "API 配置", apiConfigurationDescription: "配置服务地址、密钥、模型并测试连接。",
    translationDefaults: "翻译默认值", translationDefaultsDescription: "设置温度、默认翻译风格与默认推理强度。",
    promptLibrary: "提示词资源库", promptLibraryDescription: "查看、编辑和整理翻译预设。",
    back: "后退", forward: "前进", open: "打开",
    formatRules: "严格格式规则", formatRulesDescription: "所有预设共同使用的输出格式模块，确保 AI 只返回译文本身。",
    formatRulesWarning: "此模块是所有预设共同使用的安全边界，已固定为内置规则，无法编辑或替换。",
    reset: "重置", resetAll: "重置全部",
    defaultPresets: "默认预设", defaultPresetSummary: "6 个默认预设：1 个受保护、5 个可编辑；当前显示 {visible} 个，已移除 {removed} 个", customPresets: "自定义", customPresetsDescription: "只写希望译文呈现的风格、语气和取舍，不需要重复格式要求。", customPresetSummary: "2 个自定义名额：已使用 {count} 个",
    customPresetsEmpty: "尚未创建自定义预设。可在设置的提示词资源库中添加，最多 2 个。",
    manageCustomHint: "在设置 > AI > 提示词资源库中编辑",
    addPreset: "新建预设", presetLimit: "最多可创建 2 个额外自定义预设。",
    presetTitle: "标题", presetPrompt: "风格提示词", presetPromptPlaceholder: "例如：语气温柔克制，保留口语停顿；不要堆砌华丽辞藻。只写风格要求即可。",
    protectedPreset: "固定推荐版", defaultPreset: "默认预设", customPreset: "自定义预设", editPreset: "编辑预设",
    deletePreset: "删除", deletePresetConfirm: "删除这个预设？此操作会立即保存。",
    restorePreset: "恢复已删除的默认预设", restorePresetDescription: "选择一个默认预设，将它重新放回资源库。",
    newPresetTitle: "新的自定义预设", savePreset: "保存预设", discardDraft: "放弃草稿", requiredFields: "标题和风格提示词均为必填；保存前不会占用自定义预设名额。", modified: "已修改"
  },
  "zh-TW": {
    workspace: "AI 工作區", workspaceDescription: "在三個獨立頁面中管理服務連線、翻譯預設值與模組化提示詞。",
    apiConfiguration: "API 設定", apiConfigurationDescription: "設定服務位址、金鑰、模型並測試連線。",
    translationDefaults: "翻譯預設值", translationDefaultsDescription: "設定溫度、預設翻譯風格與預設推理強度。",
    promptLibrary: "提示詞資源庫", promptLibraryDescription: "檢視、編輯與整理翻譯預設。",
    back: "上一頁", forward: "下一頁", open: "開啟",
    formatRules: "嚴格格式規則", formatRulesDescription: "所有預設共同使用的輸出格式模組，確保 AI 只回傳譯文本身。",
    formatRulesWarning: "此模組是所有預設共用的安全邊界，已固定為內建規則，無法編輯或取代。",
    reset: "重設", resetAll: "全部重設",
    defaultPresets: "預設項目", defaultPresetSummary: "6 個預設項目：1 個受保護、5 個可編輯；目前顯示 {visible} 個，已移除 {removed} 個", customPresets: "自訂", customPresetsDescription: "只需寫希望譯文呈現的風格、語氣與取捨，不必重複格式要求。", customPresetSummary: "2 個自訂名額：已使用 {count} 個",
    customPresetsEmpty: "尚未建立自訂預設。可在設定的提示詞資源庫中新增，最多 2 個。", manageCustomHint: "在設定 > AI > 提示詞資源庫中編輯",
    addPreset: "新增預設", presetLimit: "最多可建立 2 個額外自訂預設。", presetTitle: "標題", presetPrompt: "風格提示詞",
    presetPromptPlaceholder: "例如：語氣溫柔克制，保留口語停頓；不要堆砌華麗辭藻。只寫風格要求即可。",
    protectedPreset: "固定推薦版", defaultPreset: "預設項目", customPreset: "自訂預設", editPreset: "編輯預設", deletePreset: "刪除",
    deletePresetConfirm: "刪除這個預設？此操作會立即儲存。",
    restorePreset: "還原已刪除的預設", restorePresetDescription: "選擇一個預設，將它重新放回資源庫。", newPresetTitle: "新的自訂預設", savePreset: "儲存預設", discardDraft: "放棄草稿", requiredFields: "標題與風格提示詞皆為必填；儲存前不會占用自訂預設名額。", modified: "已修改"
  },
  en: {
    workspace: "AI Workspace", workspaceDescription: "Manage provider access, translation defaults, and modular prompts in three focused pages.",
    apiConfiguration: "API Configuration", apiConfigurationDescription: "Configure the endpoint, key, and model, then test the connection.",
    translationDefaults: "Translation defaults", translationDefaultsDescription: "Set temperature, the default translation style, and default reasoning strength.",
    promptLibrary: "Prompt Library", promptLibraryDescription: "Browse, edit, and organize translation presets.",
    back: "Back", forward: "Forward", open: "Open", formatRules: "Strict Format Rules",
    formatRulesDescription: "The shared output module that makes every preset return only the translated lyrics.",
    formatRulesWarning: "This shared safety boundary is fixed to the built-in rules and cannot be edited or replaced.",
    reset: "Reset", resetAll: "Reset all",
    defaultPresets: "Default presets", defaultPresetSummary: "6 default presets: 1 protected, 5 editable · {visible} shown, {removed} removed", customPresets: "Custom", customPresetsDescription: "Write only the desired style, tone, and tradeoffs. Do not repeat the format rules.", customPresetSummary: "2 custom slots: {count} used",
    customPresetsEmpty: "No custom presets yet. Add up to two from the Prompt Library in Settings.", manageCustomHint: "Edit in Settings > AI > Prompt Library",
    addPreset: "New preset", presetLimit: "You can create up to two additional custom presets.", presetTitle: "Title", presetPrompt: "Style prompt",
    presetPromptPlaceholder: "Example: Keep the tone gentle and restrained, preserve conversational pauses, and avoid ornate wording. Write style guidance only.",
    protectedPreset: "Protected recommended preset", defaultPreset: "Default preset", customPreset: "Custom preset", editPreset: "Edit preset", deletePreset: "Delete",
    deletePresetConfirm: "Delete this preset? The change is saved immediately.",
    restorePreset: "Restore a removed default", restorePresetDescription: "Choose a default preset to return it to the library.", newPresetTitle: "New custom preset", savePreset: "Save preset", discardDraft: "Discard draft", requiredFields: "Title and style prompt are required. The draft uses no custom-preset slot until saved.", modified: "Modified"
  },
  fr: {
    workspace: "Espace de travail IA", workspaceDescription: "Gérez l’accès au prestataire, les valeurs de traduction et les prompts dans trois pages dédiées.",
    apiConfiguration: "Configuration API", apiConfigurationDescription: "Configurez l’adresse, la clé et le modèle, puis testez la connexion.",
    translationDefaults: "Valeurs de traduction", translationDefaultsDescription: "Réglez la température, le style par défaut et le niveau de raisonnement par défaut.",
    promptLibrary: "Bibliothèque de prompts", promptLibraryDescription: "Parcourez, modifiez et organisez les préréglages de traduction.", back: "Retour", forward: "Suivant", open: "Ouvrir",
    formatRules: "Règles de format strictes", formatRulesDescription: "Module partagé garantissant que l’IA ne renvoie que la traduction.",
    formatRulesWarning: "Cette limite de sécurité commune est fixée aux règles intégrées et ne peut être ni modifiée ni remplacée.",
    reset: "Réinitialiser", resetAll: "Tout réinitialiser",
    defaultPresets: "Préréglages par défaut", defaultPresetSummary: "6 préréglages : 1 protégé, 5 modifiables · {visible} affichés, {removed} retirés", customPresets: "Personnalisé", customPresetsDescription: "Décrivez seulement le style, le ton et les choix souhaités, sans répéter les règles de format.", customPresetSummary: "2 emplacements personnalisés : {count} utilisé(s)",
    customPresetsEmpty: "Aucun préréglage personnalisé. Ajoutez-en jusqu’à deux depuis la bibliothèque dans les Réglages.", manageCustomHint: "Modifier dans Réglages > IA > Bibliothèque de prompts",
    addPreset: "Nouveau préréglage", presetLimit: "Vous pouvez créer jusqu’à deux préréglages personnalisés.", presetTitle: "Titre", presetPrompt: "Prompt de style",
    presetPromptPlaceholder: "Exemple : gardez un ton doux et retenu, préservez les pauses orales et évitez les formulations ornées. Décrivez uniquement le style.",
    protectedPreset: "Version recommandée protégée", defaultPreset: "Préréglage par défaut", customPreset: "Préréglage personnalisé", editPreset: "Modifier", deletePreset: "Supprimer",
    deletePresetConfirm: "Supprimer ce préréglage ? La modification sera enregistrée immédiatement.",
    restorePreset: "Restaurer un préréglage supprimé", restorePresetDescription: "Choisissez un préréglage à remettre dans la bibliothèque.", newPresetTitle: "Nouveau préréglage", savePreset: "Enregistrer", discardDraft: "Abandonner le brouillon", requiredFields: "Le titre et le prompt de style sont obligatoires. Le brouillon n’occupe aucune place avant l’enregistrement.", modified: "Modifié"
  },
  ja: {
    workspace: "AI ワークスペース", workspaceDescription: "プロバイダー接続、翻訳の初期値、モジュール式プロンプトを三つのページで管理します。",
    apiConfiguration: "API 設定", apiConfigurationDescription: "エンドポイント、キー、モデルを設定して接続をテストします。",
    translationDefaults: "翻訳の初期値", translationDefaultsDescription: "温度、既定の翻訳スタイル、既定の推論強度を設定します。",
    promptLibrary: "プロンプトライブラリ", promptLibraryDescription: "翻訳プリセットを閲覧・編集・整理します。", back: "戻る", forward: "進む", open: "開く",
    formatRules: "厳格な形式ルール", formatRulesDescription: "すべてのプリセットで翻訳本文だけを返すための共通出力モジュールです。",
    formatRulesWarning: "この共通の安全ルールは内蔵内容に固定されており、編集も置き換えもできません。",
    reset: "リセット", resetAll: "すべてリセット",
    defaultPresets: "既定プリセット", defaultPresetSummary: "既定 6 件：保護 1 件、編集可能 5 件 · 表示 {visible} 件、削除済み {removed} 件", customPresets: "カスタム", customPresetsDescription: "希望する文体・語調・優先事項だけを書き、形式ルールは繰り返さないでください。", customPresetSummary: "カスタム枠 2 件：{count} 件使用中",
    customPresetsEmpty: "カスタムプリセットはまだありません。設定のライブラリから最大 2 件追加できます。", manageCustomHint: "設定 > AI > プロンプトライブラリで編集",
    addPreset: "新規プリセット", presetLimit: "追加できるカスタムプリセットは最大 2 件です。", presetTitle: "タイトル", presetPrompt: "スタイルプロンプト",
    presetPromptPlaceholder: "例：穏やかで抑制した語調にし、会話の間を残し、華美な表現を避ける。スタイルの指示だけを書いてください。",
    protectedPreset: "固定おすすめ版", defaultPreset: "既定プリセット", customPreset: "カスタムプリセット", editPreset: "編集", deletePreset: "削除",
    deletePresetConfirm: "このプリセットを削除しますか？変更はすぐ保存されます。",
    restorePreset: "削除した既定プリセットを復元", restorePresetDescription: "ライブラリに戻すプリセットを選択してください。", newPresetTitle: "新しいカスタムプリセット", savePreset: "プリセットを保存", discardDraft: "下書きを破棄", requiredFields: "タイトルとスタイルプロンプトは必須です。保存するまでカスタム枠を使用しません。", modified: "変更済み"
  },
  es: {
    workspace: "Espacio de trabajo de IA", workspaceDescription: "Gestiona el acceso al proveedor, los valores de traducción y los prompts en tres páginas.",
    apiConfiguration: "Configuración de API", apiConfigurationDescription: "Configura la dirección, la clave y el modelo, y prueba la conexión.",
    translationDefaults: "Valores de traducción", translationDefaultsDescription: "Configura la temperatura, el estilo predeterminado y la intensidad de razonamiento predeterminada.",
    promptLibrary: "Biblioteca de prompts", promptLibraryDescription: "Consulta, edita y organiza los preajustes de traducción.", back: "Atrás", forward: "Adelante", open: "Abrir",
    formatRules: "Reglas de formato estrictas", formatRulesDescription: "Módulo compartido que hace que la IA devuelva solo la traducción.",
    formatRulesWarning: "Este límite de seguridad compartido está fijado a las reglas integradas y no se puede editar ni sustituir.",
    reset: "Restablecer", resetAll: "Restablecer todo",
    defaultPresets: "Preajustes predeterminados", defaultPresetSummary: "6 preajustes: 1 protegido, 5 editables · {visible} visibles, {removed} eliminados", customPresets: "Personalizados", customPresetsDescription: "Escribe solo el estilo, el tono y las prioridades deseadas; no repitas las reglas de formato.", customPresetSummary: "2 espacios personalizados: {count} usados",
    customPresetsEmpty: "Aún no hay preajustes personalizados. Añade hasta dos desde la biblioteca en Ajustes.", manageCustomHint: "Editar en Ajustes > IA > Biblioteca de prompts",
    addPreset: "Nuevo preajuste", presetLimit: "Puedes crear hasta dos preajustes personalizados adicionales.", presetTitle: "Título", presetPrompt: "Prompt de estilo",
    presetPromptPlaceholder: "Ejemplo: usa un tono suave y contenido, conserva las pausas coloquiales y evita palabras recargadas. Escribe solo indicaciones de estilo.",
    protectedPreset: "Versión recomendada protegida", defaultPreset: "Preajuste predeterminado", customPreset: "Preajuste personalizado", editPreset: "Editar", deletePreset: "Eliminar",
    deletePresetConfirm: "¿Eliminar este preajuste? El cambio se guardará de inmediato.",
    restorePreset: "Restaurar un preajuste eliminado", restorePresetDescription: "Elige un preajuste para devolverlo a la biblioteca.", newPresetTitle: "Nuevo preajuste personalizado", savePreset: "Guardar preajuste", discardDraft: "Descartar borrador", requiredFields: "El título y el prompt de estilo son obligatorios. El borrador no ocupa una plaza hasta guardarse.", modified: "Modificado"
  }
};

export function getAIPromptUiCopy(locale: Locale) {
  return COPY[locale];
}

export function formatAIPromptUiText(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template
  );
}
