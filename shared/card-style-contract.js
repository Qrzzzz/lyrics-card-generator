/** @typedef {{type?: string, optional?: boolean, values?: string[], ref?: string, pattern?: string, maxLength?: number, integer?: boolean}} Field */
/** @type {{definitions: Record<string, {requiredOnRead: string[], fields: Record<string, Field>}>}} */
const schema = require("./card-style-schema.json");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/**
 * Schema 1 accepts missing legacy style fields, then the renderer supplies its
 * defaults. Unknown/derived fields are stripped; authored values are validated.
 * @param {unknown} input
 * @param {string} name
 * @returns {Record<string, unknown> | null}
 */
function normalizeFields(input, name) {
  if (!object(input)) return null;
  const definition = schema.definitions[name];
  if (!definition) return null;
  /** @type {Record<string, unknown>} */
  const result = {};
  for (const [key, field] of Object.entries(definition.fields)) {
    const value = input[key];
    if (value === undefined) {
      if (definition.requiredOnRead.includes(key)) return null;
      continue;
    }
    if (field.ref) {
      const nested = normalizeFields(value, field.ref);
      if (!nested) return null;
      result[key] = nested;
    } else if (field.values) {
      if (typeof value !== "string" || !field.values.includes(value)) return null;
      result[key] = value;
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") return null;
      result[key] = value;
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100_000) return null;
      if (field.integer && !Number.isInteger(value)) return null;
      result[key] = value;
    } else {
      if (typeof value !== "string" || value.length > (field.maxLength ?? 2048)) return null;
      if (field.pattern && !new RegExp(field.pattern, "i").test(value)) return null;
      result[key] = field.pattern ? value.toUpperCase() : value;
    }
  }
  return result;
}

/** @param {unknown} input */
function normalizeDraftStyle(input) { return normalizeFields(input, "CardStyleInputs"); }
module.exports = { normalizeDraftStyle };
