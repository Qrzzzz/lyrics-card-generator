import type { Locale } from "@/lib/types";

type SeparatorCopy = {
  label: string;
  insert: string;
  edit: string;
  dot: string;
  line: string;
  hint: string;
  tooltip: string;
};

export const separatorCopy: Record<Locale, SeparatorCopy> = {
  zh: {
    label: "分隔符", insert: "插入分隔符", edit: "编辑文本", dot: "居中单点", line: "细横线",
    hint: "在第二步「歌词」中插入，在这里统一设置样式。",
    tooltip: "分隔符：在第五步「视觉细节」中设置样式。按一次退格或 Delete 选中，再按一次删除。"
  },
  "zh-TW": {
    label: "分隔符", insert: "插入分隔符", edit: "編輯文字", dot: "置中單點", line: "細橫線",
    hint: "在第二步「歌詞」中插入，在這裡統一設定樣式。",
    tooltip: "分隔符：在第五步「視覺細節」中設定樣式。按一次退格或 Delete 選取，再按一次刪除。"
  },
  en: {
    label: "Separator", insert: "Insert separator", edit: "Edit text", dot: "Centered dot", line: "Thin line",
    hint: "Insert in step 2, Lyrics. Choose the style for all separators here.",
    tooltip: "Separator: choose its style in step 5, Visual details. Press Backspace or Delete once to select, then again to remove."
  },
  fr: {
    label: "Séparateur", insert: "Insérer un séparateur", edit: "Modifier le texte", dot: "Point centré", line: "Trait fin",
    hint: "Insérez-le à l’étape 2, Paroles. Choisissez ici le style de tous les séparateurs.",
    tooltip: "Séparateur : choisissez son style à l’étape 5, Détails visuels. Appuyez une fois sur Retour arrière ou Suppr pour le sélectionner, puis une seconde fois pour le supprimer."
  },
  ja: {
    label: "区切り", insert: "区切りを挿入", edit: "テキストを編集", dot: "中央の点", line: "細い横線",
    hint: "ステップ2「歌詞」で挿入し、ここですべての区切りのスタイルを設定します。",
    tooltip: "区切り：ステップ5「ビジュアル詳細」でスタイルを設定します。Backspace または Delete を1回押すと選択、もう1回押すと削除します。"
  },
  es: {
    label: "Separador", insert: "Insertar separador", edit: "Editar texto", dot: "Punto centrado", line: "Línea fina",
    hint: "Insértalo en el paso 2, Letras. Elige aquí el estilo de todos los separadores.",
    tooltip: "Separador: elige su estilo en el paso 5, Detalles visuales. Pulsa Retroceso o Supr una vez para seleccionarlo y otra vez para eliminarlo."
  }
};
