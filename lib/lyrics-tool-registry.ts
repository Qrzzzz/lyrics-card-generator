import {
  getLyricsWorkspaceCopy,
  type LyricsWorkspaceCopy
} from "@/components/editor/lyrics-workspace-copy";
import type { LyricsSidebarTab } from "@/lib/lyrics-workbench";

export type LyricsTool = {
  id: string;
  category: LyricsSidebarTab;
  label: keyof LyricsWorkspaceCopy;
  target: string;
  mode: "run" | "preview" | "locate";
  keywords: string;
  capability?: "ai" | "fetch";
};

export const LYRICS_TOOLS: readonly LyricsTool[] = [
  {
    id: "trim",
    category: "cleanup",
    label: "trimBlankLines",
    target: "lyrics-cleanup-blank-trim",
    mode: "run",
    keywords: "首尾 空白 trim boundary blank lines espaces 空行 extremos"
  },
  {
    id: "collapse",
    category: "cleanup",
    label: "collapseBlankLines",
    target: "lyrics-cleanup-blank-collapse",
    mode: "run",
    keywords: "连续 連續 空白 重复空行 collapse blank lines espaces 空行 líneas vacías"
  },
  {
    id: "remove-blank",
    category: "cleanup",
    label: "removeBlankLines",
    target: "lyrics-cleanup-blank-all-preview",
    mode: "preview",
    keywords: "空白 空行 删除 刪除 remove blank lines supprimer 空行 eliminar"
  },
  {
    id: "paste",
    category: "cleanup",
    label: "cleanPaste",
    target: "lyrics-cleanup-paste",
    mode: "run",
    keywords: "粘贴 貼上 清理 clipboard paste whitespace coller 貼り付け pegar"
  },
  {
    id: "lrc",
    category: "cleanup",
    label: "stripLrcShortcut",
    target: "lyrics-cleanup-lrc-preview",
    mode: "preview",
    keywords:
      "时间戳 時間戳 时间轴 時間軸 timestamps timeline metadata LRC horodatage タイムスタンプ marcas de tiempo"
  },
  {
    id: "merge",
    category: "cleanup",
    label: "mergeHeading",
    target: "lyrics-merge-selected",
    mode: "run",
    keywords: "合并 合併 选区 選取 merge join lines fusionner 結合 combinar"
  },
  {
    id: "tags",
    category: "cleanup",
    label: "tagsHeading",
    target: "lyrics-tags-preview",
    mode: "preview",
    keywords: "段落 标签 標籤 主歌 副歌 chorus verse tags balises タグ etiquetas"
  },
  {
    id: "keep",
    category: "cleanup",
    label: "keepSelection",
    target: "lyrics-command-keep-selection",
    mode: "preview",
    keywords: "截取 选中 選取 保留 keep crop selection conserver 選択 conservar selección"
  },
  {
    id: "separator",
    category: "cleanup",
    label: "separatorTool",
    target: "lyrics-tool-insert-separator",
    mode: "run",
    keywords: "分隔符 分隔线 分隔線 separator stanza séparateur 区切り separador"
  },
  {
    id: "translation",
    category: "translation",
    label: "translationHeading",
    target: "translation-toggle",
    mode: "locate",
    keywords: "双语 雙語 bilingual enable translation traduction 翻訳 traducción"
  },
  {
    id: "ai",
    category: "translation",
    label: "aiShortcut",
    target: "lyrics-command-ai",
    mode: "run",
    keywords: "AI 人工智能 翻译 翻譯 translate traduire traduction 翻譯 翻訳 traducir traducción",
    capability: "ai"
  },
  {
    id: "split",
    category: "translation",
    label: "splitPreview",
    target: "lyrics-split-preview",
    mode: "preview",
    keywords: "交替 拆分 分离 分離 alternating split bilingual alterner 交互 separar"
  },
  {
    id: "format",
    category: "translation",
    label: "formatTranslation",
    target: "lyrics-format-translation",
    mode: "run",
    keywords: "格式 标点 標點 format punctuation mise en forme 書式 formato"
  },
  {
    id: "swap",
    category: "translation",
    label: "swapPreview",
    target: "lyrics-swap-preview",
    mode: "preview",
    keywords: "交换 交換 原译 原譯 swap columns permuter 入れ替え intercambiar"
  },
  {
    id: "alignment",
    category: "review",
    label: "alignmentHeading",
    target: "lyrics-review-alignment-section",
    mode: "locate",
    keywords: "对齐 對齊 错位 錯位 alignment mismatch alignement 対応 alineación"
  },
  {
    id: "invisible",
    category: "review",
    label: "invisibleTool",
    target: "lyrics-review-invisible-character",
    mode: "locate",
    keywords: "异常 異常 字符 字元 零宽 零寬 invisible zero width caractères 不可視 caracteres"
  },
  {
    id: "duplicates",
    category: "review",
    label: "duplicateTool",
    target: "lyrics-review-duplicate-line",
    mode: "locate",
    keywords: "重复 重複 duplicate repeated lines doublons 重複 duplicadas"
  },
  {
    id: "long",
    category: "review",
    label: "longLineTool",
    target: "lyrics-review-long-line",
    mode: "locate",
    keywords: "超长 超長 长行 長行 long wrap longueur 長い largas"
  },
  {
    id: "budget",
    category: "review",
    label: "lineBudgetLabel",
    target: "lyrics-line-budget",
    mode: "locate",
    keywords: "导出 匯出 导出限制 36 37 export limit budget limite 書き出し límite"
  },
  {
    id: "undo",
    category: "cleanup",
    label: "undo",
    target: "lyrics-command-undo",
    mode: "run",
    keywords: "撤销 復原 undo annuler 元に戻す deshacer"
  },
  {
    id: "redo",
    category: "cleanup",
    label: "redo",
    target: "lyrics-command-redo",
    mode: "run",
    keywords: "重做 redo rétablir やり直す rehacer"
  },
  {
    id: "fetch",
    category: "cleanup",
    label: "fetchTool",
    target: "lyrics-command-fetch",
    mode: "run",
    keywords: "获取 取得 获取歌词 fetch lyrics télécharger 歌詞取得 obtener letras",
    capability: "fetch"
  }
];

const localizedNames = new Map(
  LYRICS_TOOLS.map((tool) => [
    tool.id,
    (["zh", "zh-TW", "en", "fr", "ja", "es"] as const)
      .map((locale) => getLyricsWorkspaceCopy(locale)[tool.label])
      .join(" ")
  ])
);

export function searchLyricsTools(query: string, copy: LyricsWorkspaceCopy, tools = LYRICS_TOOLS) {
  const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const normalizedQuery = normalize(query).trim();
  const terms = normalizedQuery.split(/\s+/u).filter(Boolean);
  const score = (tool: LyricsTool) => {
    if (!normalizedQuery) return 0;
    const label = normalize(copy[tool.label]);
    if (label === normalizedQuery) return 100;
    if (label.startsWith(normalizedQuery)) return 80;
    if (
      (["zh", "zh-TW", "en", "fr", "ja", "es"] as const).some((locale) =>
        normalize(getLyricsWorkspaceCopy(locale)[tool.label]).startsWith(normalizedQuery)
      )
    )
      return 70;
    if (normalize(tool.keywords).split(/\s+/u).includes(normalizedQuery)) return 60;
    return label.includes(normalizedQuery) ? 40 : 0;
  };
  return tools
    .filter((tool) =>
      terms.every((term) =>
        normalize(`${copy[tool.label]} ${localizedNames.get(tool.id)} ${tool.keywords}`).includes(
          term
        )
      )
    )
    .sort((a, b) => score(b) - score(a));
}
