import type { AIPromptLibrary, EditableTranslationStyle, TranslationStyle } from "@/lib/ai/types";
import type { Locale } from "@/lib/types";

export type TranslationStyleOption = {
  id: TranslationStyle;
  name: string;
  description: string;
};

export type TranslationPresetOption = {
  id: string;
  name: string;
  description: string;
  source: "recommended" | "built-in" | "custom";
};

export const STYLE_ORDER: TranslationStyle[] = [
  "recommended",
  "lyrical",
  "faithful",
  "spoken",
  "imagistic",
  "restrained"
];

export const EDITABLE_STYLE_ORDER = STYLE_ORDER.filter(
  (style): style is EditableTranslationStyle => style !== "recommended"
);

const STYLE_COPY: Record<Locale, Record<TranslationStyle, Omit<TranslationStyleOption, "id">>> = {
  zh: {
    recommended: { name: "推荐版", description: "兼顾准确、自然和中文歌词质感的独立版本。" },
    lyrical: { name: "抒情译版", description: "强调画面、余韵和现代中文歌词的旋律感。" },
    faithful: { name: "直译精修版", description: "贴近原意和叙事关系，同时去掉机翻腔。" },
    spoken: { name: "口语情绪版", description: "自然、直接，保留低声诉说般的私人语气。" },
    imagistic: { name: "诗性意象版", description: "强化意象、氛围和画面，但不写成古风诗。" },
    restrained: { name: "冷感克制版", description: "干净、锋利、留白，保持情绪距离。" }
  },
  "zh-TW": {
    recommended: { name: "推薦版", description: "兼顧準確、自然和繁體中文歌詞質感的獨立版本。" },
    lyrical: { name: "抒情譯版", description: "強調畫面、餘韻和現代中文歌詞的旋律感。" },
    faithful: { name: "直譯精修版", description: "貼近原意和敘事關係，同時去除機器翻譯感。" },
    spoken: { name: "口語情緒版", description: "自然、直接，保留低聲訴說般的私人語氣。" },
    imagistic: { name: "詩性意象版", description: "強化意象、氛圍和畫面，但不寫成古風詩。" },
    restrained: { name: "冷感克制版", description: "乾淨、鋒利、留白，保持情緒距離。" }
  },
  en: {
    recommended: { name: "Recommended", description: "A standalone balance of accuracy, natural phrasing, and lyric quality." },
    lyrical: { name: "Lyrical", description: "Emphasizes imagery, resonance, and the musicality of modern English lyrics." },
    faithful: { name: "Faithful & Polished", description: "Stays close to meaning and narrative while removing translation stiffness." },
    spoken: { name: "Conversational", description: "Natural and direct, with the intimacy of words spoken quietly." },
    imagistic: { name: "Poetic & Imagistic", description: "Strengthens imagery and atmosphere without becoming ornate poetry." },
    restrained: { name: "Cool & Restrained", description: "Clean, sharp, and spacious, with emotional distance." }
  },
  fr: {
    recommended: { name: "Recommandée", description: "Une version autonome équilibrant fidélité, naturel et qualité lyrique en français." },
    lyrical: { name: "Lyrique", description: "Privilégie les images, la résonance et la musicalité des paroles françaises modernes." },
    faithful: { name: "Fidèle et soignée", description: "Reste proche du sens et du récit tout en supprimant les raideurs de traduction." },
    spoken: { name: "Orale et émotionnelle", description: "Naturelle et directe, avec l’intimité de mots dits à voix basse." },
    imagistic: { name: "Poétique et imagée", description: "Renforce les images et l’atmosphère sans devenir trop littéraire." },
    restrained: { name: "Sobre et retenue", description: "Épurée, précise et distante, avec des silences assumés." }
  },
  ja: {
    recommended: { name: "おすすめ", description: "正確さ、自然さ、日本語の歌詞らしさを両立した独立版です。" },
    lyrical: { name: "抒情的", description: "情景、余韻、現代日本語の歌詞としての音楽性を重視します。" },
    faithful: { name: "忠実・推敲", description: "原意と物語の流れを守りながら、翻訳調を取り除きます。" },
    spoken: { name: "口語・感情", description: "静かに語りかけるような、自然で親密な言葉にします。" },
    imagistic: { name: "詩的イメージ", description: "過度に装飾せず、イメージと空気感を強めます。" },
    restrained: { name: "冷静・抑制", description: "感情を抑え、鋭さと余白、距離感を保ちます。" }
  },
  es: {
    recommended: { name: "Recomendada", description: "Una versión independiente que equilibra fidelidad, naturalidad y calidad lírica en español." },
    lyrical: { name: "Lírica", description: "Da prioridad a las imágenes, la resonancia y la musicalidad de la letra moderna." },
    faithful: { name: "Fiel y pulida", description: "Respeta el sentido y la narración eliminando la rigidez de una traducción literal." },
    spoken: { name: "Coloquial y emotiva", description: "Natural y directa, con la intimidad de algo dicho en voz baja." },
    imagistic: { name: "Poética e imaginativa", description: "Refuerza las imágenes y la atmósfera sin volverse recargada." },
    restrained: { name: "Sobria y contenida", description: "Limpia, incisiva y con espacio emocional." }
  }
};

export function getTranslationStyles(locale: Locale): TranslationStyleOption[] {
  return STYLE_ORDER.map((id) => ({ id, ...STYLE_COPY[locale][id] }));
}

export function getTranslationPresets(locale: Locale, library: AIPromptLibrary): TranslationPresetOption[] {
  const hidden = new Set(library.hiddenStyleIds);
  const overrides = new Map(library.styleOverrides.map((override) => [override.id, override]));
  const builtIns = STYLE_ORDER.filter((id) => id === "recommended" || !hidden.has(id as EditableTranslationStyle)).map((id) => {
    const copy = STYLE_COPY[locale][id];
    const override = id === "recommended" ? undefined : overrides.get(id as EditableTranslationStyle);
    return {
      id,
      name: override?.title.trim() || copy.name,
      description: copy.description,
      source: id === "recommended" ? "recommended" as const : "built-in" as const
    };
  });
  const custom = library.customPresets.map((preset) => ({
    id: preset.id,
    name: preset.title,
    description: preset.prompt,
    source: "custom" as const
  }));
  return [...builtIns, ...custom];
}

export function isTranslationStyle(value: unknown): value is TranslationStyle {
  return STYLE_ORDER.includes(value as TranslationStyle);
}

export function isEditableTranslationStyle(value: unknown): value is EditableTranslationStyle {
  return EDITABLE_STYLE_ORDER.includes(value as EditableTranslationStyle);
}
