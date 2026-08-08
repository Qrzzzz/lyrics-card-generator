import type { Locale } from "@/lib/types";

type DeferredSurfaceCopy = {
  loadFailed: string;
  retry: string;
};

export const deferredSurfaceCopy: Record<Locale, DeferredSurfaceCopy> = {
  zh: {
    loadFailed: "暂时无法加载此内容。",
    retry: "重试"
  },
  "zh-TW": {
    loadFailed: "暫時無法載入此內容。",
    retry: "再試一次"
  },
  en: {
    loadFailed: "This content couldn’t be loaded.",
    retry: "Try again"
  },
  fr: {
    loadFailed: "Impossible de charger ce contenu pour le moment.",
    retry: "Réessayer"
  },
  ja: {
    loadFailed: "この内容を一時的に読み込めません。",
    retry: "再試行"
  },
  es: {
    loadFailed: "No se pudo cargar este contenido por el momento.",
    retry: "Reintentar"
  }
};
