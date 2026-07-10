import type { Locale, SongSource } from "@/lib/types";

// Maintenance note:
// - Real album covers are only temporary development-time palette inputs.
// - Do not commit real album covers.
// - Do not place real album covers in public/.
// - Do not bundle real album covers into the desktop app.
// - Commit only the extracted color metadata used by the examples gallery.
// - Gallery palettes must be extracted directly from album covers, never from rendered lyric cards.

export type ExampleSongId = "opposite" | "yuusha" | "glorious-years" | "opalite";

export const EXAMPLE_TRANSLATION_LANGUAGES = [
  "zh",
  "zh-TW",
  "en",
  "fr",
  "ja",
  "es"
] as const;

export type ExampleTranslationLanguage = typeof EXAMPLE_TRANSLATION_LANGUAGES[number];

export const EXAMPLE_LANGUAGE_LABELS: Record<ExampleTranslationLanguage, string> = {
  zh: "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  fr: "Français",
  ja: "日本語",
  es: "Español"
};

export type ExampleTranslationSample = {
  language: ExampleTranslationLanguage;
  label: string;
  text: string;
};

export type ExampleSong = {
  id: ExampleSongId;
  title: string;
  artist: string;
  album: string;
  url: string;
  source: SongSource;
  palette: {
    colors: [string, string, ...string[]];
    extractedFrom: "album-cover";
  };
  originalLanguage: ExampleTranslationLanguage;
  originalLanguageLabel?: string;
  lyrics: string;
  translations: ExampleTranslationSample[];
  translationEnabled: boolean;
};

export const EXAMPLE_SONGS: ExampleSong[] = [{
  id: "opalite",
  title: "Opalite",
  artist: "Taylor Swift",
  album: "The Life of a Showgirl",
  url: "https://music.apple.com/tr/album/opalite/1833328839?i=1833328845",
  source: "apple",
  palette: {
    colors: ["#6A723D", "#5A9E7D", "#BC6339", "#BEB383", "#4A502B", "#D2D7B7"],
    extractedFrom: "album-cover"
  },
  originalLanguage: "en",
  lyrics: [
    "It's alright",
    "You were dancing through the lightning strikes",
    "Sleepless in the onyx night",
    "But now the sky is opalite"
  ].join("\n"),
  translations: [
    {
      language: "zh",
      label: EXAMPLE_LANGUAGE_LABELS.zh,
      text: [
        "没关系",
        "你曾在雷霆交加中翩然起舞",
        "在缟玛瑙般的长夜里彻夜难眠",
        "可如今，天空已泛起蛋白石的光"
      ].join("\n")
    },
    {
      language: "zh-TW",
      label: EXAMPLE_LANGUAGE_LABELS["zh-TW"],
      text: [
        "沒關係",
        "你曾在雷霆交加中翩然起舞",
        "在縞瑪瑙般的長夜裡徹夜難眠",
        "可如今，天空已泛起蛋白石的光"
      ].join("\n")
    },
    {
      language: "fr",
      label: EXAMPLE_LANGUAGE_LABELS.fr,
      text: [
        "Tout va bien",
        "Tu dansais au milieu des éclairs",
        "Sans sommeil dans la nuit d’onyx",
        "Mais à présent, le ciel luit comme une opalite"
      ].join("\n")
    },
    {
      language: "ja",
      label: EXAMPLE_LANGUAGE_LABELS.ja,
      text: [
        "大丈夫",
        "君は稲妻の中を踊り抜けていた",
        "オニキスの夜に眠れずにいて",
        "でも今、空はオパライトの光を帯びている"
      ].join("\n")
    },
    {
      language: "es",
      label: EXAMPLE_LANGUAGE_LABELS.es,
      text: [
        "Está bien",
        "Bailabas entre los relámpagos",
        "Sin dormir en la noche de ónix",
        "Pero ahora el cielo resplandece como opalita"
      ].join("\n")
    }
  ],
  translationEnabled: true
}, {
  id: "opposite",
  title: "opposite",
  artist: "Sabrina Carpenter",
  album: "emails i can't send fwd:",
  url: "https://music.apple.com/cn/song/opposite/1677892095",
  source: "apple",
  palette: {
    colors: ["#FBE6D2", "#E6C29E", "#C99C6F", "#8F5F3F", "#623121", "#231212"],
    extractedFrom: "album-cover"
  },
  originalLanguage: "en",
  lyrics: ["And I know now", "Even if I tried to change", "That somehow", "You'd end up with her anyway"].join("\n"),
  translations: [
    {
      language: "zh",
      label: EXAMPLE_LANGUAGE_LABELS.zh,
      text: ["我如今才明白", "纵使我拼尽全力改写结局", "命运兜兜转转", "你终究还是会走向她"].join("\n")
    },
    {
      language: "zh-TW",
      label: EXAMPLE_LANGUAGE_LABELS["zh-TW"],
      text: ["我現在才明白", "就算我試著改變", "不知怎麼地", "你終究還是會和她在一起"].join("\n")
    },
    {
      language: "fr",
      label: EXAMPLE_LANGUAGE_LABELS.fr,
      text: ["Et je le sais maintenant", "Même si j'essayais de changer", "D'une façon ou d'une autre", "Tu finirais avec elle malgré tout"].join("\n")
    },
    {
      language: "ja",
      label: EXAMPLE_LANGUAGE_LABELS.ja,
      text: ["今ならわかる", "たとえ変えようとしても", "なぜか結局", "あなたはやっぱり彼女を選ぶ"].join("\n")
    },
    {
      language: "es",
      label: EXAMPLE_LANGUAGE_LABELS.es,
      text: ["Y ahora lo sé", "Aunque intentara cambiar", "De algún modo", "Acabarías con ella igual"].join("\n")
    }
  ],
  translationEnabled: true
}, {
  id: "yuusha",
  title: "勇者",
  artist: "YOASOBI",
  album: "THE BOOK 3",
  url: "https://music.apple.com/tr/album/yuusha/1707001460?i=1707001466",
  source: "apple",
  palette: {
    colors: ["#F6F4F8", "#CED0EC", "#9E8EAE", "#3D3249", "#F6F5F7"],
    extractedFrom: "album-cover"
  },
  originalLanguage: "ja",
  lyrics: [
    "共に歩んだ旅路を辿れば",
    "そこに君は居なくとも",
    "きっと見つけられる"
  ].join("\n"),
  translations: [
    {
      language: "zh",
      label: EXAMPLE_LANGUAGE_LABELS.zh,
      text: [
        "若回望你我并肩走过的旅途",
        "即便那里已不见你的身影",
        "我也一定能寻见你留下的痕迹"
      ].join("\n")
    },
    {
      language: "zh-TW",
      label: EXAMPLE_LANGUAGE_LABELS["zh-TW"],
      text: [
        "若回望你我並肩走過的旅途",
        "即便那裡已不見你的身影",
        "我也一定能尋見你留下的痕跡"
      ].join("\n")
    },
    {
      language: "en",
      label: EXAMPLE_LANGUAGE_LABELS.en,
      text: [
        "If I retrace the road we once walked side by side",
        "Even if you are no longer there",
        "I know I will find what you left behind"
      ].join("\n")
    },
    {
      language: "fr",
      label: EXAMPLE_LANGUAGE_LABELS.fr,
      text: [
        "Si je remonte le chemin que nous avons parcouru côte à côte",
        "Même si tu n’y es plus",
        "Je saurai retrouver les traces que tu as laissées"
      ].join("\n")
    },
    {
      language: "es",
      label: EXAMPLE_LANGUAGE_LABELS.es,
      text: [
        "Si vuelvo sobre el camino que recorrimos juntos",
        "Aunque tú ya no estés allí",
        "Sé que encontraré las huellas que dejaste"
      ].join("\n")
    }
  ],
  translationEnabled: true
}, {
  id: "glorious-years",
  title: "光輝歲月",
  artist: "Beyond",
  album: "命運派對",
  url: "https://music.apple.com/tr/album/%E5%85%89%E8%BC%9D%E6%AD%B2%E6%9C%88/1464503952?i=1464504134",
  source: "apple",
  palette: {
    colors: ["#7A7A7A", "#171718", "#A7A7A6", "#E0E0E0", "#4D4D4D", "#0E0E0F"],
    extractedFrom: "album-cover"
  },
  originalLanguage: "zh-TW",
  originalLanguageLabel: "粵語",
  lyrics: [
    "今天只有殘留的軀殼",
    "迎接光輝歲月",
    "風雨中抱緊自由",
    "一生經過彷徨的掙扎",
    "自信可改變未來",
    "問誰又能做到"
  ].join("\n"),
  translations: [
    {
      language: "en",
      label: EXAMPLE_LANGUAGE_LABELS.en,
      text: [
        "Only a hollow shell remains today",
        "To greet the years of glory",
        "Holding freedom tight through stormy winds and rain",
        "A lifetime spent in struggle and doubt",
        "Believe you can change the future",
        "But who can truly make it happen?"
      ].join("\n")
    },
    {
      language: "fr",
      label: EXAMPLE_LANGUAGE_LABELS.fr,
      text: [
        "Aujourd'hui, il ne reste qu'une enveloppe brisée",
        "Pour accueillir les années glorieuses",
        "Dans le vent et la pluie, serrer la liberté contre soi",
        "Toute une vie traversée par l'errance et la lutte",
        "Croire en soi peut changer l'avenir",
        "Mais qui donc pourrait vraiment y parvenir ?"
      ].join("\n")
    },
    {
      language: "ja",
      label: EXAMPLE_LANGUAGE_LABELS.ja,
      text: [
        "今日、残されたのは抜け殻のような身だけ",
        "輝かしい歳月を迎えるために",
        "風雨の中で自由を強く抱きしめる",
        "一生を迷いと葛藤の中で歩み抜き",
        "自信が未来を変えられると信じる",
        "いったい誰が、それを成し遂げられるだろう"
      ].join("\n")
    },
    {
      language: "es",
      label: EXAMPLE_LANGUAGE_LABELS.es,
      text: [
        "Hoy solo queda un cuerpo vacío",
        "Para recibir los años gloriosos",
        "Abrazando la libertad entre viento y lluvia",
        "Tras una vida de dudas y lucha",
        "La confianza puede cambiar el porvenir",
        "Pero ¿quién podría lograrlo de verdad?"
      ].join("\n")
    }
  ],
  translationEnabled: true
}];

export type ExampleLoadPayload = {
  example: ExampleSong;
  translation: ExampleTranslationSample;
  importTranslation?: boolean;
};

export function resolveExampleTranslation(
  example: ExampleSong,
  locale: Locale
): ExampleTranslationSample {
  if (example.originalLanguage === locale) {
    return {
      language: locale,
      label: EXAMPLE_LANGUAGE_LABELS[locale],
      text: ""
    };
  }

  const exactTranslation = example.translations.find((item) => item.language === locale);

  if (exactTranslation) {
    return exactTranslation;
  }

  if (isChineseLocale(example.originalLanguage) && isChineseLocale(locale)) {
    return {
      language: locale,
      label: EXAMPLE_LANGUAGE_LABELS[locale],
      text: ""
    };
  }

  return example.translations[0];
}

function isChineseLocale(language: ExampleTranslationLanguage) {
  return language === "zh" || language === "zh-TW";
}
