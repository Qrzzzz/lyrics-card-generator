import type { Locale } from "@/lib/types";

const en = {
  settings: "Settings", description: "Personalize the app without changing exported lyric cards.", general: "General",
  appearance: "Appearance", background: "Background", export: "Export", ai: "AI", about: "About",
  language: "Language", spark: "Spark Cursor", sparkDescription: "Show a spark animation when clicking the interface.",
  theme: "Interface mode", albumDynamic: "Album dynamic",
  darkAcrylic: "Dark Acrylic", lightAcrylic: "Light Acrylic", acrylicEffect: "Acrylic effect",
  acrylicSupportNote: "Acrylic uses the native Windows window material and requires Windows 11 22H2 or later; other systems fall back to a readable transparent interface.",
  acrylicAlbumDisabled: "Album dynamic mode does not support Acrylic yet.",
  accentColor: "Accent color", accentAlbumDynamic: "Follow album cover", accentPreset: "Preset colors",
  accentCustom: "Custom hex", accentRed: "Red", accentOrange: "Orange", accentYellow: "Yellow",
  accentGreen: "Green", accentBlue: "Blue", accentPurple: "Purple",
  accentCustomPlaceholder: "#7C3AED", accentInvalid: "Enter a 6-digit hex color, for example #7C3AED.",
  uiFont: "UI font family", defaultFont: "System default", light: "Light mode", dark: "Dark mode",
  source: "Background source", solid: "Solid color",
  image: "Background image", chooseImage: "Choose background image", stretch: "Stretch", contain: "Contain",
  cover: "Cover", blur: "Blur", palette: "Image palette", overlay: "Overlay", blurAmount: "Blur amount",
  resetBackground: "Reset background", exportQuality: "Default image quality", low: "Standard · 1x", medium: "High · 1.4x",
  high: "Ultra · 2x", version: "Version", checkUpdates: "Check for updates",
  githubProfile: "GitHub profile", repository: "Project repository", releases: "Releases", save: "Save", cancel: "Cancel",
  example: "Example", examples: "Examples", loadExample: "Load example", exampleLoaded: "Example loaded",
  originalLanguage: "Original language", translationLanguage: "Translation",
  firstLaunchTitle: "Choose your language", firstLaunchDescription: "You can change this later in Settings.",
  projectDescription: "Create polished lyric sharing images from music links or local audio.",
  clearAll: "Clear all", clearAllDescription: "Clear song content while keeping app settings.",
  backgroundImageSelected: "Background image saved", backgroundImageFailed: "Could not load the background image.",
  backgroundSaveFailed: "Settings were saved, but an old background file could not be removed.", backgroundResetPending: "Background reset saved"
};

type Copy = typeof en;
const zh: Copy = {
  settings: "设置", description: "个性化软件界面，不影响导出的歌词卡片。", general: "通用", appearance: "外观", background: "背景",
  export: "导出", ai: "AI", about: "关于", language: "语言", spark: "Spark Cursor", sparkDescription: "点击界面时显示光标火花动效。",
  theme: "界面模式", albumDynamic: "专辑封面动态取色",
  darkAcrylic: "深色亚克力", lightAcrylic: "浅色亚克力", acrylicEffect: "亚克力效果",
  acrylicSupportNote: "亚克力主题使用 Windows 原生窗口材质，需要 Windows 11 22H2 或更高版本；其他系统会降级为可读的透明界面。",
  acrylicAlbumDisabled: "专辑封面动态取色暂不支持亚克力效果。",
  accentColor: "主题色", accentAlbumDynamic: "跟随专辑封面", accentPreset: "预设颜色",
  accentCustom: "自定义色号", accentRed: "红", accentOrange: "橙", accentYellow: "黄",
  accentGreen: "绿", accentBlue: "蓝", accentPurple: "紫",
  accentCustomPlaceholder: "#7C3AED", accentInvalid: "请输入 6 位十六进制颜色，例如 #7C3AED。",
  uiFont: "界面字体", defaultFont: "系统默认", light: "浅色模式", dark: "深色模式",
  source: "背景来源", solid: "纯色", image: "背景图片", chooseImage: "选择背景图片", stretch: "拉伸", contain: "适应", cover: "填充",
  blur: "模糊", palette: "图片取色", overlay: "遮罩强度", blurAmount: "模糊程度", resetBackground: "重置背景",
  exportQuality: "默认图片导出质量", low: "标准 · 1x", medium: "高清 · 1.4x", high: "超清 · 2x",
  version: "版本", checkUpdates: "检查更新", githubProfile: "GitHub 个人主页", repository: "项目仓库", releases: "发布页面",
  save: "保存", cancel: "取消", example: "示例", examples: "示例歌曲", loadExample: "载入示例", exampleLoaded: "已载入示例",
  originalLanguage: "原语言", translationLanguage: "译文语言",
  firstLaunchTitle: "选择语言 / Choose your language", firstLaunchDescription: "之后可随时在设置中更改。",
  projectDescription: "从音乐链接或本地音频生成精致的歌词分享图片。",
  clearAll: "一键清空", clearAllDescription: "清空歌曲内容并保留软件设置。", backgroundImageSelected: "背景图片已保存",
  backgroundImageFailed: "背景图片读取失败。", backgroundSaveFailed: "设置已保存，但旧背景图片清理失败。", backgroundResetPending: "背景已重置",
};

export const settingsCopy: Record<Locale, Copy> = {
  zh, "zh-TW": { ...zh, settings: "設定", description: "個人化軟體介面，不影響匯出的歌詞卡片。", general: "一般", appearance: "外觀", background: "背景", export: "匯出", language: "語言", save: "儲存", cancel: "取消", exampleLoaded: "已載入範例", originalLanguage: "原語言", translationLanguage: "譯文語言", exportQuality: "預設圖片匯出品質", low: "標準 · 1x", medium: "高清 · 1.4x", high: "超清 · 2x", clearAll: "一鍵清空", clearAllDescription: "清空歌曲內容並保留軟體設定。", backgroundImageSelected: "背景圖片已儲存", backgroundImageFailed: "背景圖片讀取失敗。", backgroundSaveFailed: "設定已儲存，但舊背景圖片清理失敗。", backgroundResetPending: "背景已重設", darkAcrylic: "深色壓克力", lightAcrylic: "淺色壓克力", acrylicSupportNote: "壓克力主題使用 Windows 原生視窗材質，需要 Windows 11 22H2 或更新版本；其他系統會降級為可讀的透明介面。" },
  en,
  fr: { ...en, settings: "Paramètres", general: "Général", appearance: "Apparence", background: "Arrière-plan", export: "Exportation", about: "À propos", language: "Langue", save: "Enregistrer", cancel: "Annuler", example: "Exemple", examples: "Exemples", originalLanguage: "Langue source", translationLanguage: "Traduction", low: "Standard · 1x", medium: "Haute · 1.4x", high: "Ultra · 2x", darkAcrylic: "Acrylique sombre", lightAcrylic: "Acrylique clair", acrylicSupportNote: "Acrylic utilise le matériau de fenêtre natif de Windows et nécessite Windows 11 22H2 ou une version ultérieure ; les autres systèmes utilisent une interface transparente lisible.", clearAll: "Tout effacer", clearAllDescription: "Effacer la chanson tout en conservant les paramètres.", backgroundImageSelected: "Image d’arrière-plan enregistrée", backgroundImageFailed: "Impossible de charger l’image d’arrière-plan.", backgroundSaveFailed: "Les paramètres sont enregistrés, mais l’ancien arrière-plan n’a pas pu être supprimé.", backgroundResetPending: "Arrière-plan réinitialisé" },
  ja: { ...en, settings: "設定", general: "一般", appearance: "外観", background: "背景", export: "書き出し", about: "このアプリについて", language: "言語", save: "保存", cancel: "キャンセル", example: "サンプル", examples: "サンプル", originalLanguage: "原文言語", translationLanguage: "翻訳", low: "標準 · 1x", medium: "高画質 · 1.4x", high: "超高画質 · 2x", darkAcrylic: "ダークアクリル", lightAcrylic: "ライトアクリル", acrylicSupportNote: "アクリルテーマは Windows のネイティブなウィンドウ素材を使用し、Windows 11 22H2 以降が必要です。他の環境では読みやすい透明インターフェイスにフォールバックします。", clearAll: "すべて消去", clearAllDescription: "設定を保持したまま曲の内容を消去します。", backgroundImageSelected: "背景画像を保存しました", backgroundImageFailed: "背景画像を読み込めませんでした。", backgroundSaveFailed: "設定は保存されましたが、古い背景画像を削除できませんでした。", backgroundResetPending: "背景をリセットしました" },
  es: { ...en, settings: "Ajustes", general: "General", appearance: "Apariencia", background: "Fondo", export: "Exportar", about: "Acerca de", language: "Idioma", save: "Guardar", cancel: "Cancelar", example: "Ejemplo", examples: "Ejemplos", originalLanguage: "Idioma original", translationLanguage: "Traducción", low: "Estándar · 1x", medium: "Alta · 1.4x", high: "Ultra · 2x", darkAcrylic: "Acrílico oscuro", lightAcrylic: "Acrílico claro", acrylicSupportNote: "Acrylic usa el material de ventana nativo de Windows y requiere Windows 11 22H2 o posterior; otros sistemas usan una interfaz transparente legible.", clearAll: "Borrar todo", clearAllDescription: "Borra la canción y conserva los ajustes.", backgroundImageSelected: "Imagen de fondo guardada", backgroundImageFailed: "No se pudo cargar la imagen de fondo.", backgroundSaveFailed: "Los ajustes se guardaron, pero no se pudo eliminar el fondo anterior.", backgroundResetPending: "Fondo restablecido" }
};
