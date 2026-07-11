import type { Locale } from "@/lib/types";

export type AIPromptUiCopy = {
  workspace: string;
  workspaceDescription: string;
  apiConfiguration: string;
  apiConfigurationDescription: string;
  promptLibrary: string;
  promptLibraryDescription: string;
  back: string;
  forward: string;
  open: string;
  formatRules: string;
  formatRulesDescription: string;
  formatRulesWarning: string;
  unlockRules: string;
  lockRules: string;
  unlockConfirmFirst: string;
  unlockConfirmSecond: string;
  reset: string;
  resetRulesConfirm: string;
  defaultPresets: string;
  customPresets: string;
  customPresetsDescription: string;
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
  resetPresetConfirm: string;
  restorePreset: string;
  restorePresetDescription: string;
  newPresetTitle: string;
  modified: string;
};

const COPY: Record<Locale, AIPromptUiCopy> = {
  zh: {
    workspace: "AI 工作区", workspaceDescription: "在两个独立页面中管理接口连接与模块化提示词。",
    apiConfiguration: "API 配置", apiConfigurationDescription: "配置服务地址、密钥、模型与生成参数。",
    promptLibrary: "提示词资源库", promptLibraryDescription: "像管理文件一样查看、编辑和整理翻译预设。",
    back: "后退", forward: "前进", open: "打开",
    formatRules: "严格格式规则", formatRulesDescription: "所有预设共同使用的输出格式模块，确保 AI 只返回译文本身。",
    formatRulesWarning: "此模块决定输出能否直接写入译文框。修改后可能出现标题、解释或 Markdown，不建议更改。",
    unlockRules: "解锁编辑", lockRules: "锁定编辑",
    unlockConfirmFirst: "严格格式规则是所有预设的安全边界。仍要解锁编辑吗？",
    unlockConfirmSecond: "再次确认：修改后 AI 可能不再只输出译文原文。是否继续？",
    reset: "重置", resetRulesConfirm: "将严格格式规则恢复为 4.6.0 默认内容？",
    defaultPresets: "默认预设", customPresets: "自定义", customPresetsDescription: "只写希望译文呈现的风格、语气和取舍，不需要重复格式要求。",
    customPresetsEmpty: "尚未创建自定义预设。可在设置的提示词资源库中添加，最多 2 个。",
    manageCustomHint: "在设置 > AI > 提示词资源库中编辑",
    addPreset: "新建预设", presetLimit: "最多可创建 2 个额外自定义预设。",
    presetTitle: "标题", presetPrompt: "风格提示词", presetPromptPlaceholder: "例如：语气温柔克制，保留口语停顿；不要堆砌华丽辞藻。只写风格要求即可。",
    protectedPreset: "固定推荐版", defaultPreset: "默认预设", customPreset: "自定义预设", editPreset: "编辑预设",
    deletePreset: "删除", deletePresetConfirm: "删除这个预设？此操作会立即保存。",
    resetPresetConfirm: "将这个预设恢复为 4.6.0 默认标题和提示词？",
    restorePreset: "恢复已删除的默认预设", restorePresetDescription: "选择一个默认预设，将它重新放回资源库。",
    newPresetTitle: "新的自定义预设", modified: "已修改"
  },
  "zh-TW": {
    workspace: "AI 工作區", workspaceDescription: "在兩個獨立頁面中管理 API 連線與模組化提示詞。",
    apiConfiguration: "API 設定", apiConfigurationDescription: "設定服務位址、金鑰、模型與生成參數。",
    promptLibrary: "提示詞資源庫", promptLibraryDescription: "像管理檔案一樣檢視、編輯與整理翻譯預設。",
    back: "上一頁", forward: "下一頁", open: "開啟",
    formatRules: "嚴格格式規則", formatRulesDescription: "所有預設共同使用的輸出格式模組，確保 AI 只回傳譯文本身。",
    formatRulesWarning: "此模組決定輸出能否直接寫入譯文欄。修改後可能出現標題、說明或 Markdown，不建議更改。",
    unlockRules: "解鎖編輯", lockRules: "鎖定編輯", unlockConfirmFirst: "嚴格格式規則是所有預設的安全邊界。仍要解鎖編輯嗎？",
    unlockConfirmSecond: "再次確認：修改後 AI 可能不再只輸出譯文原文。是否繼續？", reset: "重設", resetRulesConfirm: "將嚴格格式規則恢復為 4.6.0 預設內容？",
    defaultPresets: "預設項目", customPresets: "自訂", customPresetsDescription: "只需寫希望譯文呈現的風格、語氣與取捨，不必重複格式要求。",
    customPresetsEmpty: "尚未建立自訂預設。可在設定的提示詞資源庫中新增，最多 2 個。", manageCustomHint: "在設定 > AI > 提示詞資源庫中編輯",
    addPreset: "新增預設", presetLimit: "最多可建立 2 個額外自訂預設。", presetTitle: "標題", presetPrompt: "風格提示詞",
    presetPromptPlaceholder: "例如：語氣溫柔克制，保留口語停頓；不要堆砌華麗辭藻。只寫風格要求即可。",
    protectedPreset: "固定推薦版", defaultPreset: "預設項目", customPreset: "自訂預設", editPreset: "編輯預設", deletePreset: "刪除",
    deletePresetConfirm: "刪除這個預設？此操作會立即儲存。", resetPresetConfirm: "將這個預設恢復為 4.6.0 預設標題與提示詞？",
    restorePreset: "還原已刪除的預設", restorePresetDescription: "選擇一個預設，將它重新放回資源庫。", newPresetTitle: "新的自訂預設", modified: "已修改"
  },
  en: {
    workspace: "AI Workspace", workspaceDescription: "Manage provider access and modular prompts in two focused pages.",
    apiConfiguration: "API Configuration", apiConfigurationDescription: "Configure the endpoint, key, model, and generation options.",
    promptLibrary: "Prompt Library", promptLibraryDescription: "Browse, edit, and organize translation presets like files.",
    back: "Back", forward: "Forward", open: "Open", formatRules: "Strict Format Rules",
    formatRulesDescription: "The shared output module that makes every preset return only the translated lyrics.",
    formatRulesWarning: "This module keeps output ready for the translation field. Editing it may allow headings, explanations, or Markdown and is not recommended.",
    unlockRules: "Unlock editing", lockRules: "Lock editing", unlockConfirmFirst: "Strict format rules are the safety boundary for every preset. Unlock editing anyway?",
    unlockConfirmSecond: "Confirm again: AI may stop returning only the translated lyrics after this change. Continue?", reset: "Reset", resetRulesConfirm: "Restore the strict format rules to the 4.6.0 defaults?",
    defaultPresets: "Default presets", customPresets: "Custom", customPresetsDescription: "Write only the desired style, tone, and tradeoffs. Do not repeat the format rules.",
    customPresetsEmpty: "No custom presets yet. Add up to two from the Prompt Library in Settings.", manageCustomHint: "Edit in Settings > AI > Prompt Library",
    addPreset: "New preset", presetLimit: "You can create up to two additional custom presets.", presetTitle: "Title", presetPrompt: "Style prompt",
    presetPromptPlaceholder: "Example: Keep the tone gentle and restrained, preserve conversational pauses, and avoid ornate wording. Write style guidance only.",
    protectedPreset: "Protected recommended preset", defaultPreset: "Default preset", customPreset: "Custom preset", editPreset: "Edit preset", deletePreset: "Delete",
    deletePresetConfirm: "Delete this preset? The change is saved immediately.", resetPresetConfirm: "Restore this preset's 4.6.0 default title and prompt?",
    restorePreset: "Restore a removed default", restorePresetDescription: "Choose a default preset to return it to the library.", newPresetTitle: "New custom preset", modified: "Modified"
  },
  fr: {
    workspace: "Espace de travail IA", workspaceDescription: "Gérez la connexion API et les prompts modulaires dans deux pages dédiées.",
    apiConfiguration: "Configuration API", apiConfigurationDescription: "Configurez l’adresse, la clé, le modèle et les paramètres de génération.",
    promptLibrary: "Bibliothèque de prompts", promptLibraryDescription: "Parcourez et organisez les préréglages comme des fichiers.", back: "Retour", forward: "Suivant", open: "Ouvrir",
    formatRules: "Règles de format strictes", formatRulesDescription: "Module partagé garantissant que l’IA ne renvoie que la traduction.",
    formatRulesWarning: "Ce module permet d’insérer directement le résultat. Sa modification peut ajouter titres, explications ou Markdown et est déconseillée.",
    unlockRules: "Déverrouiller", lockRules: "Verrouiller", unlockConfirmFirst: "Ces règles protègent tous les préréglages. Les déverrouiller quand même ?",
    unlockConfirmSecond: "Confirmez à nouveau : l’IA pourrait ne plus renvoyer uniquement la traduction. Continuer ?", reset: "Réinitialiser", resetRulesConfirm: "Rétablir les règles de format par défaut de la 4.6.0 ?",
    defaultPresets: "Préréglages par défaut", customPresets: "Personnalisé", customPresetsDescription: "Décrivez seulement le style, le ton et les choix souhaités, sans répéter les règles de format.",
    customPresetsEmpty: "Aucun préréglage personnalisé. Ajoutez-en jusqu’à deux depuis la bibliothèque dans les Réglages.", manageCustomHint: "Modifier dans Réglages > IA > Bibliothèque de prompts",
    addPreset: "Nouveau préréglage", presetLimit: "Vous pouvez créer jusqu’à deux préréglages personnalisés.", presetTitle: "Titre", presetPrompt: "Prompt de style",
    presetPromptPlaceholder: "Exemple : gardez un ton doux et retenu, préservez les pauses orales et évitez les formulations ornées. Décrivez uniquement le style.",
    protectedPreset: "Version recommandée protégée", defaultPreset: "Préréglage par défaut", customPreset: "Préréglage personnalisé", editPreset: "Modifier", deletePreset: "Supprimer",
    deletePresetConfirm: "Supprimer ce préréglage ? La modification sera enregistrée immédiatement.", resetPresetConfirm: "Rétablir le titre et le prompt par défaut de la 4.6.0 ?",
    restorePreset: "Restaurer un préréglage supprimé", restorePresetDescription: "Choisissez un préréglage à remettre dans la bibliothèque.", newPresetTitle: "Nouveau préréglage", modified: "Modifié"
  },
  ja: {
    workspace: "AI ワークスペース", workspaceDescription: "API 接続とモジュール式プロンプトを二つの専用ページで管理します。",
    apiConfiguration: "API 設定", apiConfigurationDescription: "エンドポイント、キー、モデル、生成設定を管理します。",
    promptLibrary: "プロンプトライブラリ", promptLibraryDescription: "翻訳プリセットをファイルのように閲覧・編集・整理します。", back: "戻る", forward: "進む", open: "開く",
    formatRules: "厳格な形式ルール", formatRulesDescription: "すべてのプリセットで翻訳本文だけを返すための共通出力モジュールです。",
    formatRulesWarning: "このモジュールを変更すると、見出し・説明・Markdown が混ざる可能性があります。変更は推奨しません。",
    unlockRules: "編集を解除", lockRules: "編集をロック", unlockConfirmFirst: "形式ルールは全プリセットの安全境界です。それでも編集を解除しますか？",
    unlockConfirmSecond: "再確認：変更後は翻訳本文以外が出力される可能性があります。続けますか？", reset: "リセット", resetRulesConfirm: "形式ルールを 4.6.0 の既定内容に戻しますか？",
    defaultPresets: "既定プリセット", customPresets: "カスタム", customPresetsDescription: "希望する文体・語調・優先事項だけを書き、形式ルールは繰り返さないでください。",
    customPresetsEmpty: "カスタムプリセットはまだありません。設定のライブラリから最大 2 件追加できます。", manageCustomHint: "設定 > AI > プロンプトライブラリで編集",
    addPreset: "新規プリセット", presetLimit: "追加できるカスタムプリセットは最大 2 件です。", presetTitle: "タイトル", presetPrompt: "スタイルプロンプト",
    presetPromptPlaceholder: "例：穏やかで抑制した語調にし、会話の間を残し、華美な表現を避ける。スタイルの指示だけを書いてください。",
    protectedPreset: "固定おすすめ版", defaultPreset: "既定プリセット", customPreset: "カスタムプリセット", editPreset: "編集", deletePreset: "削除",
    deletePresetConfirm: "このプリセットを削除しますか？変更はすぐ保存されます。", resetPresetConfirm: "タイトルとプロンプトを 4.6.0 の既定値に戻しますか？",
    restorePreset: "削除した既定プリセットを復元", restorePresetDescription: "ライブラリに戻すプリセットを選択してください。", newPresetTitle: "新しいカスタムプリセット", modified: "変更済み"
  },
  es: {
    workspace: "Espacio de trabajo de IA", workspaceDescription: "Gestiona la conexión API y los prompts modulares en dos páginas específicas.",
    apiConfiguration: "Configuración de API", apiConfigurationDescription: "Configura la dirección, la clave, el modelo y los parámetros de generación.",
    promptLibrary: "Biblioteca de prompts", promptLibraryDescription: "Explora, edita y organiza los preajustes como archivos.", back: "Atrás", forward: "Adelante", open: "Abrir",
    formatRules: "Reglas de formato estrictas", formatRulesDescription: "Módulo compartido que hace que la IA devuelva solo la traducción.",
    formatRulesWarning: "Este módulo permite insertar el resultado directamente. Editarlo puede añadir títulos, explicaciones o Markdown y no se recomienda.",
    unlockRules: "Desbloquear edición", lockRules: "Bloquear edición", unlockConfirmFirst: "Estas reglas protegen todos los preajustes. ¿Desbloquearlas de todos modos?",
    unlockConfirmSecond: "Confirma de nuevo: la IA podría dejar de devolver únicamente la traducción. ¿Continuar?", reset: "Restablecer", resetRulesConfirm: "¿Restaurar las reglas de formato predeterminadas de 4.6.0?",
    defaultPresets: "Preajustes predeterminados", customPresets: "Personalizados", customPresetsDescription: "Escribe solo el estilo, el tono y las prioridades deseadas; no repitas las reglas de formato.",
    customPresetsEmpty: "Aún no hay preajustes personalizados. Añade hasta dos desde la biblioteca en Ajustes.", manageCustomHint: "Editar en Ajustes > IA > Biblioteca de prompts",
    addPreset: "Nuevo preajuste", presetLimit: "Puedes crear hasta dos preajustes personalizados adicionales.", presetTitle: "Título", presetPrompt: "Prompt de estilo",
    presetPromptPlaceholder: "Ejemplo: usa un tono suave y contenido, conserva las pausas coloquiales y evita palabras recargadas. Escribe solo indicaciones de estilo.",
    protectedPreset: "Versión recomendada protegida", defaultPreset: "Preajuste predeterminado", customPreset: "Preajuste personalizado", editPreset: "Editar", deletePreset: "Eliminar",
    deletePresetConfirm: "¿Eliminar este preajuste? El cambio se guardará de inmediato.", resetPresetConfirm: "¿Restaurar el título y el prompt predeterminados de 4.6.0?",
    restorePreset: "Restaurar un preajuste eliminado", restorePresetDescription: "Elige un preajuste para devolverlo a la biblioteca.", newPresetTitle: "Nuevo preajuste personalizado", modified: "Modificado"
  }
};

export function getAIPromptUiCopy(locale: Locale) {
  return COPY[locale];
}
