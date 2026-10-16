import type { Locale } from "@/lib/types";

const copy = {
  zh: {
    search: "搜索工具",
    placeholder: "搜索名称、关键词或同义词…",
    empty: "未找到工具，试试“空行”“LRC”或“对齐”。",
    close: "关闭搜索",
    collapse: "收起工具侧栏",
    expand: "展开工具侧栏",
    preview: "打开预览并确认",
    locate: "定位工具",
    run: "调用工具",
    keepConfirm: "确认仅保留选中",
    keepPreview: "将仅保留选中的文本，其余内容会被删除。可撤销。",
    keyboard: "↑ ↓ 选择 · Enter 调用 · Esc 关闭"
  },
  "zh-TW": {
    search: "搜尋工具",
    placeholder: "搜尋名稱、關鍵字或同義詞…",
    empty: "找不到工具，試試「空行」「LRC」或「對齊」。",
    close: "關閉搜尋",
    collapse: "收合工具側欄",
    expand: "展開工具側欄",
    preview: "開啟預覽並確認",
    locate: "定位工具",
    run: "使用工具",
    keepConfirm: "確認僅保留選取",
    keepPreview: "僅保留選取的文字，其餘內容將被刪除。可復原。",
    keyboard: "↑ ↓ 選取 · Enter 使用 · Esc 關閉"
  },
  en: {
    search: "Search tools",
    placeholder: "Search names, keywords or synonyms…",
    empty: "No tools found. Try blank lines, LRC or alignment.",
    close: "Close search",
    collapse: "Collapse tools sidebar",
    expand: "Expand tools sidebar",
    preview: "Open preview and confirm",
    locate: "Locate tool",
    run: "Run tool",
    keepConfirm: "Confirm keep selection",
    keepPreview:
      "Only the selected text will remain. Other text will be removed. You can undo this.",
    keyboard: "↑ ↓ Select · Enter Run · Esc Close"
  },
  fr: {
    search: "Rechercher un outil",
    placeholder: "Nom, mot-clé ou synonyme…",
    empty: "Aucun outil trouvé. Essayez lignes vides, LRC ou alignement.",
    close: "Fermer la recherche",
    collapse: "Replier les outils",
    expand: "Déplier les outils",
    preview: "Ouvrir l’aperçu et confirmer",
    locate: "Localiser l’outil",
    run: "Exécuter l’outil",
    keepConfirm: "Confirmer la conservation de la sélection",
    keepPreview:
      "Seul le texte sélectionné sera conservé. Le reste sera supprimé. Cette action peut être annulée.",
    keyboard: "↑ ↓ Choisir · Entrée Exécuter · Échap Fermer"
  },
  ja: {
    search: "ツールを検索",
    placeholder: "名前・キーワード・類義語で検索…",
    empty: "ツールが見つかりません。空行、LRC、行の対応などを試してください。",
    close: "検索を閉じる",
    collapse: "ツールを折りたたむ",
    expand: "ツールを展開",
    preview: "プレビューを開いて確認",
    locate: "ツールの位置へ",
    run: "ツールを実行",
    keepConfirm: "選択範囲のみを保持することを確認",
    keepPreview: "選択したテキストだけを残し、他のテキストを削除します。元に戻せます。",
    keyboard: "↑ ↓ 選択 · Enter 実行 · Esc 閉じる"
  },
  es: {
    search: "Buscar herramientas",
    placeholder: "Nombre, palabra clave o sinónimo…",
    empty: "No se encontraron herramientas. Prueba líneas vacías, LRC o alineación.",
    close: "Cerrar búsqueda",
    collapse: "Contraer herramientas",
    expand: "Expandir herramientas",
    preview: "Abrir vista previa y confirmar",
    locate: "Localizar herramienta",
    run: "Ejecutar herramienta",
    keepConfirm: "Confirmar conservar selección",
    keepPreview:
      "Solo se conservará el texto seleccionado. El resto se eliminará. Puedes deshacerlo.",
    keyboard: "↑ ↓ Seleccionar · Intro Ejecutar · Esc Cerrar"
  }
} satisfies Record<Locale, Record<string, string>>;

export const getLyricsToolsCopy = (locale: Locale) => copy[locale];
