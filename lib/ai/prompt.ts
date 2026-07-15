import type { AIPromptLibrary, TranslationStyle } from "@/lib/ai/types";
import { isTranslationStyle } from "@/lib/ai/styles";
import type { Locale } from "@/lib/types";

type PromptBundle = {
  identity: string;
  principles: string;
  styles: Record<TranslationStyle, string>;
  outputRules: string;
  lyricsLead: string;
};

const PROMPT_BUNDLES: Record<Locale, PromptBundle> = {
  zh: {
    identity: `请把用户提供的外语歌词译成自然的简体中文歌词。不要逐词翻译；请保留歌曲的情绪、叙事关系、暧昧、遗憾与节奏。译文应符合中文表达习惯。`,
    principles: `请遵守以下翻译原则：
1. 保留原歌词的换行结构，原文几行，译文尽量对应几行。
2. 不要逐词硬翻。先理解整段歌词的情绪、语境和潜台词，再选择自然表达。
3. 译文要自然、有画面感、有文学性，但不要堆砌辞藻。
4. 避免古风腔、网文腔和过度抒情。
5. 可以适度补足语气和情绪，但不能篡改原意。
6. 避免直译腔和僵硬句式。
7. 尽量保留原文的双关、暧昧、反讽、怨恨、遗憾、嫉妒或欲望。
8. 逐行推敲措辞，不要只做词语替换。`,
    styles: {
      recommended: `采用“推荐版”风格：这是一个独立版本，不以其他版本为草稿，也不综合多个版本。兼顾准确、自然、情绪和中文歌词质感，给出最适合作为成品的一版。`,
      lyrical: `采用“抒情译版”风格：强化画面、余韵和现代中文歌词的旋律感，在不改变原意的前提下让表达更具抒情性。`,
      faithful: `采用“直译精修版”风格：尽量贴近原意、叙事关系与意象，只对不自然的直译句式做精修。`,
      spoken: `采用“口语情绪版”风格：语言自然、直接，保留像低声诉说一样的私人语气，避免书面腔。`,
      imagistic: `采用“诗性意象版”风格：强化意象、氛围和画面，但不要写成古风诗，也不要脱离原意。`,
      restrained: `采用“冷感克制版”风格：表达干净、锋利、留白，保持适当情绪距离，不额外煽情。`
    },
    outputRules: `输出规则是最高优先级，必须严格遵守：
你最终只能输出简体中文译文本身。
禁止输出标题、引导语、解释、分析、注释、括号说明、翻译理由、原文、Markdown、代码块、项目符号、编号列表、分隔线、多个版本或任何额外文字。
请直接从第一行译文开始，到最后一行译文结束。`,
    lyricsLead: "需要翻译的歌词如下："
  },
  "zh-TW": {
    identity: `請將使用者提供的外語歌詞譯成自然的繁體中文歌詞。不要逐字翻譯；請保留歌曲的情緒、敘事關係、曖昧、遺憾與節奏。譯文應符合繁體中文的表達習慣。`,
    principles: `請遵守以下翻譯原則：
1. 保留原歌詞的換行結構；原文幾行，譯文盡量對應幾行。
2. 不要逐字硬譯。先理解整段歌詞的情緒、語境與潛臺詞，再選擇自然表達。
3. 譯文要自然、有畫面感、有文學性，但不要堆砌辭藻。
4. 避免古風腔、網文腔與過度抒情。
5. 可以適度補足語氣和情緒，但不能竄改原意。
6. 避免直譯腔與僵硬句式。
7. 盡量保留原文的雙關、曖昧、反諷、怨恨、遺憾、嫉妒或欲望。
8. 逐行推敲措辭，不要只做詞語替換。`,
    styles: {
      recommended: `採用「推薦版」風格：這是獨立版本，不以其他版本為草稿，也不綜合多個版本。兼顧準確、自然、情緒與繁體中文歌詞質感，只給出最適合作為成品的一版。`,
      lyrical: `採用「抒情譯版」風格：強化畫面、餘韻與現代中文歌詞的旋律感，在不改變原意的前提下讓表達更具抒情性。`,
      faithful: `採用「直譯精修版」風格：盡量貼近原意、敘事關係與意象，只對不自然的直譯句式做精修。`,
      spoken: `採用「口語情緒版」風格：語言自然、直接，保留像低聲訴說般的私人語氣，避免書面腔。`,
      imagistic: `採用「詩性意象版」風格：強化意象、氛圍與畫面，但不要寫成古風詩，也不要脫離原意。`,
      restrained: `採用「冷感克制版」風格：表達乾淨、銳利、留白，保持適當情緒距離，不額外煽情。`
    },
    outputRules: `輸出規則是最高優先級，必須嚴格遵守：
你最終只能輸出繁體中文譯文本身。
禁止輸出標題、引導語、解釋、分析、註釋、括號說明、翻譯理由、原文、Markdown、程式碼區塊、項目符號、編號列表、分隔線、多個版本或任何額外文字。
請直接從第一行譯文開始，到最後一行譯文結束。`,
    lyricsLead: "需要翻譯的歌詞如下："
  },
  en: {
    identity: `Translate the user's foreign-language lyrics into natural English lyrics. Do not translate word by word. Preserve the song's emotion, narrative relationships, ambiguity, regret, and rhythm, using idiomatic English.`,
    principles: `Follow these translation principles:
1. Preserve the source line breaks; keep roughly one translated line for each source line.
2. Understand the passage, context, and subtext before choosing the English wording.
3. Write naturally and vividly with literary care, without decorative excess.
4. Avoid archaic diction, fan-fiction phrasing, and unnecessary melodrama.
5. You may restore implied tone or emotion, but never change the meaning.
6. Remove literal, stiff, or non-idiomatic constructions.
7. Preserve wordplay, ambiguity, irony, resentment, regret, jealousy, and desire wherever possible.
8. Polish each line instead of substituting words mechanically.`,
    styles: {
      recommended: `Use the Recommended style. This is a standalone version, not a synthesis or revision of other variants. Balance accuracy, natural English, emotion, and lyric quality, and provide only the strongest finished version.`,
      lyrical: `Use the Lyrical style. Heighten imagery, resonance, and musical phrasing while remaining faithful to the source.`,
      faithful: `Use the Faithful & Polished style. Stay close to meaning, narrative relationships, and imagery, polishing only what would sound stiff in English.`,
      spoken: `Use the Conversational style. Keep the language natural and direct, with the intimacy of words spoken quietly, and avoid formal diction.`,
      imagistic: `Use the Poetic & Imagistic style. Strengthen imagery, atmosphere, and visual texture without becoming ornate or departing from the source.`,
      restrained: `Use the Cool & Restrained style. Keep the language clean, sharp, spacious, and emotionally controlled without adding drama.`
    },
    outputRules: `THE OUTPUT RULES HAVE THE HIGHEST PRIORITY AND MUST BE FOLLOWED STRICTLY:
Output only the English translation itself.
Do not output a title, introduction, explanation, analysis, annotation, parenthetical note, translation rationale, source text, Markdown, code fence, bullets, numbered list, separator, multiple versions, or any extra text.
Begin directly with the first translated line and end with the last translated line.`,
    lyricsLead: "Translate the following lyrics:"
  },
  fr: {
    identity: `Traduisez en paroles françaises naturelles le texte fourni par l’utilisateur. Ne traduisez pas mot à mot : conservez l’émotion, les relations narratives, l’ambiguïté, le regret et le rythme, dans un français idiomatique.`,
    principles: `Respectez les principes suivants :
1. Conservez les retours à la ligne de l'original et, autant que possible, une ligne traduite par ligne source.
2. Comprenez d'abord l'ensemble, le contexte et le sous-texte avant de choisir les mots français.
3. Écrivez de façon naturelle, évocatrice et littéraire, sans surcharge stylistique.
4. Évitez les tournures archaïques, romanesques ou inutilement mélodramatiques.
5. Vous pouvez restituer une émotion implicite, mais jamais modifier le sens.
6. Éliminez les calques, les formulations raides et les phrases peu idiomatiques.
7. Préservez autant que possible les doubles sens, l'ambiguïté, l'ironie, le ressentiment, le regret, la jalousie et le désir.
8. Retravaillez chaque ligne au lieu de remplacer les mots mécaniquement.`,
    styles: {
      recommended: `Adoptez le style « Recommandée ». Il s'agit d'une version autonome, ni synthèse ni révision d'autres variantes. Équilibrez fidélité, naturel, émotion et qualité lyrique, et ne fournissez que la meilleure version finale.`,
      lyrical: `Adoptez le style « Lyrique ». Renforcez les images, la résonance et la musicalité tout en restant fidèle au texte source.`,
      faithful: `Adoptez le style « Fidèle et soignée ». Restez près du sens, des relations narratives et des images, en ne corrigeant que les raideurs qui sonneraient mal en français.`,
      spoken: `Adoptez le style « Orale et émotionnelle ». Employez une langue naturelle et directe, avec l'intimité de paroles dites à voix basse, sans registre trop écrit.`,
      imagistic: `Adoptez le style « Poétique et imagée ». Renforcez les images, l'atmosphère et la texture visuelle sans surcharge ni éloignement du sens.`,
      restrained: `Adoptez le style « Sobre et retenue ». Gardez une langue épurée, précise, aérée et émotionnellement maîtrisée, sans dramatisation ajoutée.`
    },
    outputRules: `LES RÈGLES DE SORTIE SONT PRIORITAIRES ET DOIVENT ÊTRE STRICTEMENT RESPECTÉES :
Produisez uniquement la traduction française elle-même.
N'ajoutez aucun titre, préambule, explication, analyse, annotation, remarque entre parenthèses, justification, texte source, Markdown, bloc de code, puce, liste numérotée, séparateur, version alternative ou texte supplémentaire.
Commencez directement par la première ligne traduite et terminez par la dernière.`,
    lyricsLead: "Traduisez les paroles suivantes :"
  },
  ja: {
    identity: `ユーザーが入力した外国語の歌詞を、自然な日本語の歌詞に翻訳してください。逐語訳は避け、感情、物語上の関係、曖昧さ、後悔、リズムを保ちながら、日本語として自然に整えてください。`,
    principles: `次の翻訳原則を守ってください：
1. 原文の改行構造を保ち、できる限り一行ずつ対応させます。
2. 単語を機械的に置き換えず、全体の感情、文脈、含意を理解してから表現を選びます。
3. 自然で情景が浮かび、文学性のある日本語にしますが、過剰に飾りません。
4. 古風な言い回し、芝居がかった表現、不要な感傷を避けます。
5. 暗示された語気や感情を補うことはできますが、原意は変えません。
6. 直訳調や不自然で硬い構文を避けます。
7. 言葉遊び、曖昧さ、皮肉、恨み、後悔、嫉妬、欲望をできる限り残します。
8. 語句を機械的に置き換えず、一行ずつ表現を整えます。`,
    styles: {
      recommended: `「おすすめ」スタイルを採用します。これは他の版を統合・修正したものではなく、独立した一つの完成版です。正確さ、自然さ、感情、日本語の歌詞らしさを両立し、最も完成度の高い一版だけを出してください。`,
      lyrical: `「抒情的」スタイルを採用します。原意を守りながら、情景、余韻、現代日本語の歌詞としての音楽性を高めます。`,
      faithful: `「忠実・推敲」スタイルを採用します。意味、物語上の関係、イメージに近づけ、不自然な直訳調だけを丁寧に整えます。`,
      spoken: `「口語・感情」スタイルを採用します。静かに語りかけるような親密さを持つ自然で直接的な言葉にし、書き言葉調を避けます。`,
      imagistic: `「詩的イメージ」スタイルを採用します。原意から離れず、情景、空気感、視覚的な質感を強めますが、過度に装飾しません。`,
      restrained: `「冷静・抑制」スタイルを採用します。余計な感傷を足さず、簡潔で鋭く、余白と感情的な距離を保ちます。`
    },
    outputRules: `出力規則は最優先であり、必ず厳守してください：
最終的には日本語の翻訳本文だけを出力してください。
タイトル、前置き、説明、分析、注釈、括弧書き、翻訳理由、原文、Markdown、コードブロック、箇条書き、番号付きリスト、区切り線、複数の版、その他の文章は一切出力しないでください。
最初の訳文行から直接始め、最後の訳文行で終えてください。`,
    lyricsLead: "次の歌詞を翻訳してください："
  },
  es: {
    identity: `Traduce al español natural la letra que proporcione el usuario. No traduzcas palabra por palabra: conserva la emoción, las relaciones narrativas, la ambigüedad, el pesar y el ritmo, con expresiones idiomáticas en español.`,
    principles: `Respeta estos principios de traducción:
1. Conserva los saltos de línea del original y, en lo posible, una línea traducida por cada línea fuente.
2. Comprende primero el conjunto, el contexto y el subtexto antes de elegir las palabras en español.
3. Escribe de forma natural, evocadora y literaria, sin adornos excesivos.
4. Evita expresiones arcaicas, novelescas o innecesariamente melodramáticas.
5. Puedes recuperar un tono o una emoción implícitos, pero nunca alterar el sentido.
6. Elimina calcos, construcciones rígidas y frases poco idiomáticas.
7. Conserva en lo posible los dobles sentidos, la ambigüedad, la ironía, el rencor, el pesar, los celos y el deseo.
8. Revisa cada verso en lugar de sustituir palabras mecánicamente.`,
    styles: {
      recommended: `Usa el estilo «Recomendada». Es una versión independiente, no una síntesis ni una revisión de otras variantes. Equilibra fidelidad, naturalidad, emoción y calidad lírica, y entrega únicamente la mejor versión final.`,
      lyrical: `Usa el estilo «Lírica». Refuerza las imágenes, la resonancia y la musicalidad sin dejar de ser fiel al original.`,
      faithful: `Usa el estilo «Fiel y pulida». Mantente cerca del sentido, las relaciones narrativas y las imágenes, puliendo solo lo que sonaría rígido en español.`,
      spoken: `Usa el estilo «Coloquial y emotiva». Emplea un lenguaje natural y directo, con la intimidad de unas palabras dichas en voz baja, evitando un registro demasiado formal.`,
      imagistic: `Usa el estilo «Poética e imaginativa». Refuerza las imágenes, la atmósfera y la textura visual sin recargar el texto ni alejarte del sentido.`,
      restrained: `Usa el estilo «Sobria y contenida». Mantén un lenguaje limpio, preciso, espacioso y emocionalmente controlado, sin añadir dramatismo.`
    },
    outputRules: `LAS REGLAS DE SALIDA TIENEN LA MÁXIMA PRIORIDAD Y DEBEN CUMPLIRSE ESTRICTAMENTE:
Devuelve únicamente la traducción al español.
No incluyas título, introducción, explicación, análisis, anotación, comentario entre paréntesis, justificación, texto original, Markdown, bloque de código, viñetas, lista numerada, separador, varias versiones ni ningún texto adicional.
Empieza directamente con el primer verso traducido y termina con el último.`,
    lyricsLead: "Traduce la siguiente letra:"
  }
};

// Kept as the only exported output-rules definition. The highest-priority version is intentional.
export const PROMPT_OUTPUT_RULES = PROMPT_BUNDLES.zh.outputRules;

export function getDefaultFormatRules(locale: Locale) {
  return PROMPT_BUNDLES[locale].outputRules;
}

export function getDefaultStylePrompt(locale: Locale, style: TranslationStyle) {
  return PROMPT_BUNDLES[locale].styles[style];
}

export function buildLyricsTranslationPrompt(params: {
  lyrics: string;
  style?: TranslationStyle;
  presetId?: string;
  targetLocale: Locale;
  promptLibrary?: AIPromptLibrary;
}) {
  const bundle = PROMPT_BUNDLES[params.targetLocale];
  const presetId = params.presetId ?? params.style ?? "recommended";
  const library = params.promptLibrary;
  const localeOverrides = library?.localeOverrides[params.targetLocale];
  let stylePrompt = bundle.styles.recommended;
  if (isTranslationStyle(presetId)) {
    const override = presetId === "recommended"
      ? undefined
      : localeOverrides?.styleOverrides.find((item) => item.id === presetId);
    stylePrompt = override?.prompt.trim() || bundle.styles[presetId];
  } else {
    stylePrompt = library?.customPresets.find((item) => item.id === presetId)?.prompt.trim() || stylePrompt;
  }
  return [
    bundle.identity,
    bundle.principles,
    stylePrompt,
    bundle.outputRules,
    `${bundle.lyricsLead}\n\n${params.lyrics.trim()}`
  ].join("\n\n");
}
