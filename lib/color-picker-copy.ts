import type { Locale } from "@/lib/types";

export const colorPickerCopy: Record<Locale, { source: string; manual: string; invalid: string; presets: string[] }> = {
  zh: { source: "候选颜色来源", manual: "手动选择", invalid: "请输入 6 位十六进制颜色，例如 #123ABC。", presets: ["炭灰", "暖白", "中灰", "纯白"] },
  "zh-TW": { source: "候選顏色來源", manual: "手動選擇", invalid: "請輸入 6 位十六進位顏色，例如 #123ABC。", presets: ["炭灰", "暖白", "中灰", "純白"] },
  en: { source: "Color source", manual: "Manual selection", invalid: "Enter a six-digit HEX color, such as #123ABC.", presets: ["Charcoal", "Warm white", "Gray", "White"] },
  fr: { source: "Source des couleurs", manual: "Sélection manuelle", invalid: "Saisissez une couleur HEX à six chiffres, par exemple #123ABC.", presets: ["Anthracite", "Blanc chaud", "Gris", "Blanc"] },
  ja: { source: "候補色の取得元", manual: "手動選択", invalid: "#123ABC のような6桁の16進数カラーを入力してください。", presets: ["チャコール", "暖かい白", "グレー", "白"] },
  es: { source: "Origen de los colores", manual: "Selección manual", invalid: "Introduce un color HEX de seis dígitos, como #123ABC.", presets: ["Carbón", "Blanco cálido", "Gris", "Blanco"] }
};
