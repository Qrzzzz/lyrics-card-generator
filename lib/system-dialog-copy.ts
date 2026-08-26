import type { Locale } from "@/lib/types";

type SystemDialogCopy = {
  appTitle: string;
  cancel: string;
  close: string;
  continue: string;
  replace: string;
  overwrite: string;
  remove: string;
  replaceDocumentTitle: string;
  overwriteTranslationTitle: string;
  clearHistoryTitle: string;
  trimHistoryTitle: string;
  historyCheckFailedTitle: string;
  closeSaveFailedTitle: string;
};

export const systemDialogCopy: Record<Locale, SystemDialogCopy> = {
  zh: {
    appTitle: "歌词卡片生成器",
    cancel: "取消",
    close: "关闭",
    continue: "继续",
    replace: "替换",
    overwrite: "覆盖",
    remove: "删除",
    replaceDocumentTitle: "替换当前歌曲？",
    overwriteTranslationTitle: "覆盖现有译文？",
    clearHistoryTitle: "清空全部历史记录？",
    trimHistoryTitle: "删除较早的历史记录？",
    historyCheckFailedTitle: "无法核对历史记录",
    closeSaveFailedTitle: "设置保存失败"
  },
  "zh-TW": {
    appTitle: "歌詞卡片生成器",
    cancel: "取消",
    close: "關閉",
    continue: "繼續",
    replace: "取代",
    overwrite: "覆寫",
    remove: "刪除",
    replaceDocumentTitle: "取代目前歌曲？",
    overwriteTranslationTitle: "覆寫現有譯文？",
    clearHistoryTitle: "清除全部歷史記錄？",
    trimHistoryTitle: "刪除較早的歷史記錄？",
    historyCheckFailedTitle: "無法確認歷史記錄",
    closeSaveFailedTitle: "設定儲存失敗"
  },
  en: {
    appTitle: "Lyrics Card Generator",
    cancel: "Cancel",
    close: "Close",
    continue: "Continue",
    replace: "Replace",
    overwrite: "Overwrite",
    remove: "Delete",
    replaceDocumentTitle: "Replace the current song?",
    overwriteTranslationTitle: "Overwrite the existing translation?",
    clearHistoryTitle: "Clear all history?",
    trimHistoryTitle: "Delete older history items?",
    historyCheckFailedTitle: "History could not be checked",
    closeSaveFailedTitle: "Settings could not be saved"
  },
  fr: {
    appTitle: "Générateur de cartes de paroles",
    cancel: "Annuler",
    close: "Fermer",
    continue: "Continuer",
    replace: "Remplacer",
    overwrite: "Écraser",
    remove: "Supprimer",
    replaceDocumentTitle: "Remplacer le morceau actuel ?",
    overwriteTranslationTitle: "Écraser la traduction existante ?",
    clearHistoryTitle: "Effacer tout l’historique ?",
    trimHistoryTitle: "Supprimer les anciens éléments ?",
    historyCheckFailedTitle: "Impossible de vérifier l’historique",
    closeSaveFailedTitle: "Impossible d’enregistrer les paramètres"
  },
  ja: {
    appTitle: "歌詞カードジェネレーター",
    cancel: "キャンセル",
    close: "閉じる",
    continue: "続行",
    replace: "置き換える",
    overwrite: "上書き",
    remove: "削除",
    replaceDocumentTitle: "現在の曲を置き換えますか？",
    overwriteTranslationTitle: "既存の訳詞を上書きしますか？",
    clearHistoryTitle: "履歴をすべて消去しますか？",
    trimHistoryTitle: "古い履歴を削除しますか？",
    historyCheckFailedTitle: "履歴を確認できませんでした",
    closeSaveFailedTitle: "設定を保存できませんでした"
  },
  es: {
    appTitle: "Generador de tarjetas de letras",
    cancel: "Cancelar",
    close: "Cerrar",
    continue: "Continuar",
    replace: "Reemplazar",
    overwrite: "Sobrescribir",
    remove: "Eliminar",
    replaceDocumentTitle: "¿Reemplazar la canción actual?",
    overwriteTranslationTitle: "¿Sobrescribir la traducción existente?",
    clearHistoryTitle: "¿Borrar todo el historial?",
    trimHistoryTitle: "¿Eliminar elementos antiguos?",
    historyCheckFailedTitle: "No se pudo comprobar el historial",
    closeSaveFailedTitle: "No se pudo guardar la configuración"
  }
};
