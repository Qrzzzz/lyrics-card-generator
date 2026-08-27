import type { SystemFontOption } from "@/lib/desktop-api";

export type FontCategory = "cjk" | "latin";

export type FontFamilyOption = {
  id: string;
  family: string;
  label: string;
  category: FontCategory;
  preview: string;
};

export const RECOMMENDED_FONTS: FontFamilyOption[] = [
  cjkFont("source-han-sans", "Source Han Sans SC"),
  cjkFont("source-han-serif", "Source Han Serif SC"),
  cjkFont("microsoft-yahei", "Microsoft YaHei"),
  cjkFont("simsun", "SimSun"),
  latinFont("source-han-sans-latin", "Source Han Sans SC"),
  latinFont("source-han-serif-latin", "Source Han Serif SC"),
  latinFont("inter", "Inter"),
  latinFont("source-sans-3", "Source Sans 3"),
  latinFont("source-serif-4", "Source Serif 4"),
  latinFont("arial", "Arial"),
  latinFont("georgia", "Georgia"),
  latinFont("maple-mono", "Maple Mono")
];

export function buildFontOptions(category: FontCategory, systemFonts: SystemFontOption[]) {
  const recommended = RECOMMENDED_FONTS.filter((font) => font.category === category);
  const discovered = systemFonts
    .map((font, index): FontFamilyOption => ({
      id: `system-${category}-${font.family}-${index}`,
      family: font.family,
      label: font.label,
      category,
      preview: previewTextForCategory(category)
    }));

  // Font names are not a reliable signal for script coverage. Keep every
  // discovered family available in both roles and use categories only to
  // tailor recommendations and preview text.
  const seen = new Set<string>();
  return [...recommended, ...discovered].filter((font) => {
    const key = font.family.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function previewTextForCategory(category: FontCategory) {
  return category === "cjk" ? "共に歩んだ旅路を辿れば" : "tomoni ayunda tabiji wo tadoreba";
}

function cjkFont(id: string, family: string): FontFamilyOption {
  return { id, family, label: family, category: "cjk", preview: previewTextForCategory("cjk") };
}

function latinFont(id: string, family: string): FontFamilyOption {
  return { id, family, label: family, category: "latin", preview: previewTextForCategory("latin") };
}
