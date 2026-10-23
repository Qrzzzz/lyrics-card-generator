import type { Locale } from "@/lib/types";

const en = {
  exact: "Exact value", reset: "Restore default", invalid: "Enter a value from {min} to {max}, in steps of {step}.",
  automatic: "Calculated automatically. Turn off automatic sizing to edit.",
  uiSize: "Interface text size", sizes: ["Standard", "Larger", "Largest"],
  commands: "Search commands", settings: "Open settings", history: "Open history",
  export: "Export image", copy: "Copy image", preview: "Toggle preview",
  busy: "Image output is busy.", blocked: "Resolve the export issue first.",
  guarded: "Finish or cancel the current edit first.", field: "Go to setting",
  lyricsOnly: "Available in Lyrics mode.", translationOnly: "Enable translation in Lyrics first.",
  typography: "Text and typography", background: "Canvas and background", visible: "Content and credits",
  separatorInsert: "Insert a separator in Lyrics"
};
type Copy = Omit<typeof en, "sizes"> & { sizes: string[] };
export const productivityCopy: Record<Locale, Copy> = {
  en,
  zh: { exact: "精确数值", reset: "恢复默认", invalid: "请输入 {min} 至 {max} 之间的数值，步长为 {step}。", automatic: "由自动尺寸计算，关闭自动尺寸后可编辑。",
    uiSize: "界面字号", sizes: ["标准", "较大", "大"], commands: "搜索命令", settings: "打开设置", history: "打开历史记录",
    lyricsOnly: "切换到歌词模式后可用。", translationOnly: "请先在歌词工作区启用译文。",
    export: "导出图片", copy: "复制图片", preview: "切换预览", busy: "正在处理图片输出。", blocked: "请先处理导出问题。", guarded: "请先完成或取消当前编辑。", field: "定位设置",
    typography: "文字与排版", background: "画布与背景", visible: "内容与署名", separatorInsert: "前往歌词插入分隔符" },
  "zh-TW": { exact: "精確數值", reset: "還原預設", invalid: "請輸入 {min} 至 {max} 之間的數值，間距為 {step}。", automatic: "由自動尺寸計算，關閉自動尺寸後可編輯。",
    uiSize: "介面字級", sizes: ["標準", "較大", "大"], commands: "搜尋命令", settings: "開啟設定", history: "開啟歷史記錄",
    lyricsOnly: "切換至歌詞模式後可用。", translationOnly: "請先在歌詞工作區啟用譯文。",
    export: "匯出圖片", copy: "複製圖片", preview: "切換預覽", busy: "正在處理圖片輸出。", blocked: "請先處理匯出問題。", guarded: "請先完成或取消目前編輯。", field: "定位設定",
    typography: "文字與排版", background: "畫布與背景", visible: "內容與署名", separatorInsert: "前往歌詞插入分隔符" },
  fr: { exact: "Valeur exacte", reset: "Rétablir la valeur", invalid: "Saisissez une valeur de {min} à {max}, par pas de {step}.", automatic: "Calcul automatique. Désactivez la taille automatique pour modifier.",
    uiSize: "Taille du texte de l’interface", sizes: ["Standard", "Plus grand", "Très grand"], commands: "Rechercher une commande", settings: "Ouvrir les réglages", history: "Ouvrir l’historique",
    lyricsOnly: "Disponible en mode Paroles.", translationOnly: "Activez d’abord la traduction dans Paroles.",
    export: "Exporter l’image", copy: "Copier l’image", preview: "Afficher ou masquer l’aperçu", busy: "Une image est en cours de traitement.", blocked: "Résolvez d’abord le problème d’export.", guarded: "Terminez ou annulez la modification actuelle.", field: "Accéder au réglage",
    typography: "Texte et typographie", background: "Canevas et fond", visible: "Contenu et crédits", separatorInsert: "Insérer un séparateur dans les paroles" },
  ja: { exact: "正確な値", reset: "既定値に戻す", invalid: "{min} から {max} の値を {step} 刻みで入力してください。", automatic: "自動計算されています。自動サイズをオフにすると編集できます。",
    uiSize: "画面の文字サイズ", sizes: ["標準", "大きめ", "大"], commands: "コマンドを検索", settings: "設定を開く", history: "履歴を開く",
    lyricsOnly: "歌詞モードで利用できます。", translationOnly: "先に歌詞で翻訳を有効にしてください。",
    export: "画像を書き出す", copy: "画像をコピー", preview: "プレビューを切り替え", busy: "画像を処理中です。", blocked: "書き出しの問題を先に解決してください。", guarded: "現在の編集を完了またはキャンセルしてください。", field: "設定に移動",
    typography: "文字と組版", background: "キャンバスと背景", visible: "表示内容とクレジット", separatorInsert: "歌詞で区切りを挿入" },
  es: { exact: "Valor exacto", reset: "Restaurar valor", invalid: "Introduce un valor de {min} a {max}, en pasos de {step}.", automatic: "Se calcula automáticamente. Desactiva el tamaño automático para editar.",
    uiSize: "Tamaño del texto de la interfaz", sizes: ["Estándar", "Mayor", "Máximo"], commands: "Buscar comandos", settings: "Abrir ajustes", history: "Abrir historial",
    lyricsOnly: "Disponible en el modo Letra.", translationOnly: "Activa primero la traducción en Letra.",
    export: "Exportar imagen", copy: "Copiar imagen", preview: "Alternar vista previa", busy: "Se está procesando una imagen.", blocked: "Resuelve primero el problema de exportación.", guarded: "Termina o cancela la edición actual.", field: "Ir al ajuste",
    typography: "Texto y tipografía", background: "Lienzo y fondo", visible: "Contenido y créditos", separatorInsert: "Insertar un separador en la letra" }
};
