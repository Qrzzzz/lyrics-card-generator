import type { Locale, SongSource } from "@/lib/types";

export type ExampleSongId = "opposite" | "yuusha" | "glorious-years";

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
  url: string;
  source: SongSource;
  originalLanguage: ExampleTranslationLanguage;
  lyrics: string;
  translations: ExampleTranslationSample[];
  translationEnabled: boolean;
};

export const EXAMPLE_SONGS: ExampleSong[] = [{
  id: "opposite",
  title: "opposite",
  artist: "Sabrina Carpenter",
  url: "https://music.apple.com/cn/song/opposite/1677892095",
  source: "apple",
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
  title: "Yuusha",
  artist: "YOASOBI",
  url: "https://music.apple.com/tr/album/yuusha/1707001460?i=1707001466",
  source: "apple",
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
  url: "https://music.apple.com/tr/album/%E5%85%89%E8%BC%9D%E6%AD%B2%E6%9C%88/1464503952?i=1464504134",
  source: "apple",
  originalLanguage: "zh-TW",
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
      language: "zh",
      label: EXAMPLE_LANGUAGE_LABELS.zh,
      text: [
        "今天只剩残留的躯壳",
        "迎接光辉岁月",
        "在风雨中抱紧自由",
        "一生走过彷徨的挣扎",
        "相信自己能够改变未来",
        "试问谁又能做到"
      ].join("\n")
    },
    {
      language: "zh-TW",
      label: EXAMPLE_LANGUAGE_LABELS["zh-TW"],
      text: [
        "今天只有殘留的軀殼",
        "迎接光輝歲月",
        "風雨中抱緊自由",
        "一生經過彷徨的掙扎",
        "自信可改變未來",
        "問誰又能做到"
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
};

export function resolveExampleTranslation(
  example: ExampleSong,
  locale: Locale
): ExampleTranslationSample {
  return (
    example.translations.find((item) => item.language === locale) ??
    example.translations[0]
  );
}
