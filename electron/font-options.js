function normalizeFontOptions(values) {
  const uniqueOptions = new Map();

  for (const value of values) {
    const rawLabel = typeof value === "string" ? value : value?.label;
    const rawFamily = typeof value === "string" ? value : value?.family;
    const label = String(rawLabel || "")
      .replace(/\s*\((TrueType|OpenType|Type 1|Raster|All res)\)\s*$/i, "")
      .trim();
    const family = String(rawFamily || "").trim().replace(/^["']+|["']+$/g, "").trim();
    if (!label || !family || family.toLowerCase() === "desktop.ini" || family.includes(",")) {
      continue;
    }

    const fontWeight = Math.min(900, Math.max(100, Number(value?.fontWeight) || 400));
    const fontStyle = value?.fontStyle === "italic" ? "italic" : "normal";
    const key = `${label.toLocaleLowerCase()}\u0000${family.toLocaleLowerCase()}\u0000${fontWeight}\u0000${fontStyle}`;
    uniqueOptions.set(key, { label, family, fontWeight, fontStyle });
  }

  return [...uniqueOptions.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "zh-CN", { sensitivity: "base" })
  );
}

module.exports = { normalizeFontOptions };
