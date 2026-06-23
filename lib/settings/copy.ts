import type { Locale } from "@/lib/types";

const en = {
  settings: "Settings", description: "Personalize the app without changing exported lyric cards.", general: "General",
  appearance: "Appearance", background: "Background", export: "Export", ai: "AI", about: "About",
  language: "Language", spark: "Spark Cursor", sparkDescription: "Show a spark animation when clicking the interface.",
  theme: "UI theme", albumDynamic: "Album dynamic", lightBlue: "Light blue", darkPink: "Dark pink", custom: "Custom",
  uiFont: "UI font family", defaultFont: "System default", accent: "Accent color", textColor: "Text color",
  auto: "Auto", light: "Light", dark: "Dark", source: "Background source", solid: "Solid color",
  image: "Background image", chooseImage: "Choose background image", stretch: "Stretch", contain: "Contain",
  cover: "Cover", blur: "Blur", palette: "Image palette", overlay: "Overlay", blurAmount: "Blur amount",
  resetBackground: "Reset background", exportQuality: "Default image quality", low: "Low · 1x", medium: "Standard · 1.4x",
  high: "High · 2x", ultra: "Ultra · 3x", version: "Version", checkUpdates: "Check for updates",
  githubProfile: "GitHub profile", repository: "Project repository", releases: "Releases", save: "Save", cancel: "Cancel",
  example: "Example", examples: "Examples", loadExample: "Load example", exampleLoaded: "Example loaded",
  firstLaunchTitle: "Choose your language", firstLaunchDescription: "You can change this later in Settings.",
  projectDescription: "Create polished lyric sharing images from music links or local audio.", invalidContrast: "Low contrast; an accessible text color will be used."
};

type Copy = typeof en;
const zh: Copy = {
  settings: "设置", description: "个性化软件界面，不影响导出的歌词卡片。", general: "通用", appearance: "外观", background: "背景",
  export: "导出", ai: "AI", about: "关于", language: "语言", spark: "Spark Cursor", sparkDescription: "点击界面时显示光标火花动效。",
  theme: "界面主题", albumDynamic: "专辑封面动态取色", lightBlue: "蓝白浅色", darkPink: "黑粉深色", custom: "自定义",
  uiFont: "界面字体", defaultFont: "系统默认", accent: "界面主色", textColor: "文字颜色", auto: "自动", light: "浅色", dark: "深色",
  source: "背景来源", solid: "纯色", image: "背景图片", chooseImage: "选择背景图片", stretch: "拉伸", contain: "适应", cover: "填充",
  blur: "模糊", palette: "图片取色", overlay: "遮罩强度", blurAmount: "模糊程度", resetBackground: "重置背景",
  exportQuality: "默认图片导出质量", low: "低 · 1x", medium: "标准 · 1.4x", high: "高清 · 2x", ultra: "超清 · 3x",
  version: "版本", checkUpdates: "检查更新", githubProfile: "GitHub 个人主页", repository: "项目仓库", releases: "发布页面",
  save: "保存", cancel: "取消", example: "示例", examples: "示例歌曲", loadExample: "载入示例", exampleLoaded: "已载入示例",
  firstLaunchTitle: "选择语言 / Choose your language", firstLaunchDescription: "之后可随时在设置中更改。",
  projectDescription: "从音乐链接或本地音频生成精致的歌词分享图片。", invalidContrast: "对比度不足，将自动使用可读文字颜色。"
};

export const settingsCopy: Record<Locale, Copy> = {
  zh, "zh-TW": { ...zh, settings: "設定", description: "個人化軟體介面，不影響匯出的歌詞卡片。", general: "一般", appearance: "外觀", background: "背景", export: "匯出", language: "語言", save: "儲存", cancel: "取消", exampleLoaded: "已載入範例" },
  en,
  fr: { ...en, settings: "Paramètres", general: "Général", appearance: "Apparence", background: "Arrière-plan", export: "Exportation", about: "À propos", language: "Langue", save: "Enregistrer", cancel: "Annuler", example: "Exemple", examples: "Exemples" },
  ja: { ...en, settings: "設定", general: "一般", appearance: "外観", background: "背景", export: "書き出し", about: "このアプリについて", language: "言語", save: "保存", cancel: "キャンセル", example: "サンプル", examples: "サンプル" },
  es: { ...en, settings: "Ajustes", general: "General", appearance: "Apariencia", background: "Fondo", export: "Exportar", about: "Acerca de", language: "Idioma", save: "Guardar", cancel: "Cancelar", example: "Ejemplo", examples: "Ejemplos" }
};
