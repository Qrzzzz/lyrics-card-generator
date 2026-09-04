import type { Locale } from "@/lib/types";

const en = {
  copyAll: "Copy remote history", copyOne: "Copy JSON", paste: "Paste import",
  title: "Import remote history", intro: "Paste history JSON. Lyrics keep their saved form; covers are fetched from song links when loaded.",
  input: "History JSON", preview: "Preview import", confirm: "Import", cancel: "Cancel",
  summary: "Add {added} · Duplicates {duplicates} · Removed by limit {trimmed}",
  trim: "The current retention limit will remove {trimmed} items. Check this before importing, or change the limit in Settings.",
  copied: "Copied {count} remote history items", skipped: "{count} older items have no lyrics snapshot; reimport them first",
  imported: "Imported {added} items; skipped {duplicates} duplicates",
  invalid: "Invalid history JSON. Only supported remote records with complete lyrics snapshots can be imported.",
  tooLarge: "JSON is too large (maximum 16 MiB / 1,000 records). Copy fewer records.",
  stale: "History or its retention limit changed. Preview again before importing.",
  noRemote: "No remote history to copy", missingLyrics: "This older history has no lyrics snapshot. Reimport it before copying.",
  failed: "History transfer failed. Your saved data is unchanged. Try again.",
  coverFailed: "Lyrics restored; the cover could not be fetched"
};

type TransferCopy = typeof en;
export const historyTransferCopy: Record<Locale, TransferCopy> = {
  en,
  zh: {
    copyAll: "复制全部远程记录", copyOne: "复制 JSON", paste: "粘贴导入",
    title: "导入远程历史", intro: "粘贴历史 JSON。歌词按保存时的形式恢复；载入歌曲时通过歌曲链接获取封面。",
    input: "历史记录 JSON", preview: "预览导入", confirm: "确认导入", cancel: "取消",
    summary: "新增 {added} 条 · 重复 {duplicates} 条 · 上限淘汰 {trimmed} 条",
    trim: "当前保留上限会淘汰 {trimmed} 条记录。请核对后导入，或先在设置中调整上限。",
    copied: "已复制 {count} 条远程记录", skipped: "另有 {count} 条旧记录缺少歌词快照，请先重新导入",
    imported: "已导入 {added} 条，跳过 {duplicates} 条重复记录",
    invalid: "历史 JSON 格式无效。仅支持包含完整歌词快照的远程记录。",
    tooLarge: "JSON 过大（最多 16 MiB / 1,000 条）。请减少一次复制的记录数量。",
    stale: "历史记录或保留上限已变化，请重新预览后导入。",
    noRemote: "没有可复制的远程历史", missingLyrics: "这条旧记录缺少歌词快照，请先重新导入后再复制。",
    failed: "历史传输失败，已保存的数据未更改，请重试。", coverFailed: "歌词已恢复，暂未获取到封面"
  },
  "zh-TW": {
    copyAll: "複製全部遠端記錄", copyOne: "複製 JSON", paste: "貼上匯入",
    title: "匯入遠端歷史", intro: "貼上歷史 JSON。歌詞按儲存時的形式還原；載入歌曲時透過歌曲連結取得封面。",
    input: "歷史記錄 JSON", preview: "預覽匯入", confirm: "確認匯入", cancel: "取消",
    summary: "新增 {added} 筆 · 重複 {duplicates} 筆 · 上限移除 {trimmed} 筆",
    trim: "目前保留上限會移除 {trimmed} 筆記錄。請確認後匯入，或先在設定中調整上限。",
    copied: "已複製 {count} 筆遠端記錄", skipped: "另有 {count} 筆舊記錄缺少歌詞快照，請先重新匯入",
    imported: "已匯入 {added} 筆，略過 {duplicates} 筆重複記錄",
    invalid: "歷史 JSON 格式無效。僅支援含完整歌詞快照的遠端記錄。",
    tooLarge: "JSON 過大（最多 16 MiB / 1,000 筆）。請減少一次複製的記錄數量。",
    stale: "歷史記錄或保留上限已變更，請重新預覽後匯入。",
    noRemote: "沒有可複製的遠端歷史", missingLyrics: "此舊記錄缺少歌詞快照，請先重新匯入後再複製。",
    failed: "歷史傳輸失敗，已儲存的資料未變更，請重試。", coverFailed: "歌詞已還原，暫時無法取得封面"
  },
  fr: {
    copyAll: "Copier l’historique distant", copyOne: "Copier le JSON", paste: "Importer par collage",
    title: "Importer l’historique distant", intro: "Collez le JSON. Les paroles gardent leur forme enregistrée ; les pochettes sont récupérées via les liens lors du chargement.",
    input: "Historique JSON", preview: "Aperçu", confirm: "Importer", cancel: "Annuler",
    summary: "Ajouts : {added} · Doublons : {duplicates} · Suppressions dues à la limite : {trimmed}",
    trim: "La limite actuelle supprimera {trimmed} éléments. Vérifiez avant d’importer ou modifiez la limite dans les réglages.",
    copied: "{count} éléments distants copiés", skipped: "{count} anciens éléments sans paroles enregistrées ; réimportez-les d’abord",
    imported: "{added} éléments importés ; {duplicates} doublons ignorés",
    invalid: "JSON d’historique invalide. Seuls les éléments distants avec un instantané complet des paroles sont acceptés.",
    tooLarge: "JSON trop volumineux (16 MiB / 1 000 éléments maximum). Copiez moins d’éléments.",
    stale: "L’historique ou sa limite a changé. Actualisez l’aperçu avant d’importer.",
    noRemote: "Aucun historique distant à copier", missingLyrics: "Cet ancien élément n’a pas de paroles enregistrées. Réimportez-le avant de le copier.",
    failed: "Échec du transfert. Les données enregistrées sont inchangées. Réessayez.", coverFailed: "Paroles restaurées ; pochette indisponible"
  },
  ja: {
    copyAll: "リモート履歴をコピー", copyOne: "JSON をコピー", paste: "貼り付けて取り込む",
    title: "リモート履歴の取り込み", intro: "履歴 JSON を貼り付けてください。歌詞は保存時の状態で復元し、ジャケットは曲の読み込み時にリンクから取得します。",
    input: "履歴 JSON", preview: "取り込み内容を確認", confirm: "取り込む", cancel: "キャンセル",
    summary: "追加 {added} 件 · 重複 {duplicates} 件 · 上限による削除 {trimmed} 件",
    trim: "現在の保存上限により {trimmed} 件が削除されます。確認して取り込むか、設定で上限を変更してください。",
    copied: "リモート履歴を {count} 件コピーしました", skipped: "歌詞の保存がない旧履歴 {count} 件は、先に再取り込みしてください",
    imported: "{added} 件を取り込み、重複 {duplicates} 件をスキップしました",
    invalid: "履歴 JSON が無効です。完全な歌詞スナップショットを含むリモート履歴のみ対応しています。",
    tooLarge: "JSON が大きすぎます（最大 16 MiB / 1,000 件）。コピーする件数を減らしてください。",
    stale: "履歴または保存上限が変更されました。取り込み内容を再確認してください。",
    noRemote: "コピーできるリモート履歴がありません", missingLyrics: "この旧履歴には歌詞が保存されていません。再取り込みしてからコピーしてください。",
    failed: "履歴の転送に失敗しました。保存済みデータは変更されていません。再試行してください。", coverFailed: "歌詞は復元しましたが、ジャケットを取得できませんでした"
  },
  es: {
    copyAll: "Copiar historial remoto", copyOne: "Copiar JSON", paste: "Importar pegando",
    title: "Importar historial remoto", intro: "Pega el JSON. La letra conserva su forma guardada; la portada se obtiene del enlace al cargar la canción.",
    input: "Historial JSON", preview: "Vista previa", confirm: "Importar", cancel: "Cancelar",
    summary: "Añadir {added} · Duplicados {duplicates} · Eliminados por el límite {trimmed}",
    trim: "El límite actual eliminará {trimmed} elementos. Revísalos antes de importar o cambia el límite en Ajustes.",
    copied: "Se copiaron {count} elementos remotos", skipped: "{count} elementos antiguos no tienen letra guardada; vuelve a importarlos primero",
    imported: "Se importaron {added} elementos; se omitieron {duplicates} duplicados",
    invalid: "JSON de historial no válido. Solo se aceptan registros remotos con una instantánea completa de la letra.",
    tooLarge: "JSON demasiado grande (máximo 16 MiB / 1.000 registros). Copia menos elementos.",
    stale: "El historial o su límite ha cambiado. Revisa la vista previa antes de importar.",
    noRemote: "No hay historial remoto para copiar", missingLyrics: "Este registro antiguo no tiene letra guardada. Vuelve a importarlo antes de copiarlo.",
    failed: "Error al transferir el historial. Los datos guardados no han cambiado. Inténtalo de nuevo.", coverFailed: "Letra restaurada; no se pudo obtener la portada"
  }
};

export function historyTransferError(locale: Locale, code: string) {
  const copy = historyTransferCopy[locale];
  if (code === "invalid_transfer" || code === "invalid_snapshot") return copy.invalid;
  if (code === "transfer_too_large") return copy.tooLarge;
  if (code === "history_confirmation_stale") return copy.stale;
  if (code === "missing_lyrics") return copy.missingLyrics;
  if (code === "no_remote_history") return copy.noRemote;
  return copy.failed;
}
