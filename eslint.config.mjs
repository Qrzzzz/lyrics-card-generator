import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });
const nextConfigs = compat
  .extends("next/core-web-vitals", "next/typescript")
  .map((entry) => ({
    ...entry,
    ignores: [...(entry.ignores ?? []), "electron/**"]
  }));
const electronRules = {
  ...js.configs.recommended.rules,
  "@typescript-eslint/no-require-imports": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }]
};

const config = [
  // Script harnesses stay out of the product lint surface. Electron production
  // code is checked below with Node/CommonJS semantics instead of browser rules.
  { ignores: [".next/**", "coverage/**", "dist-desktop/**", "release/**", "playwright-report/**", "index.html", "scripts/**", "tmp/**", "next-env.d.ts"] },
  ...nextConfigs,
  {
    ignores: ["electron/**"],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "off"
    }
  },
  {
    files: ["electron/**/*.{cjs,js}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node
    },
    rules: electronRules
  },
  {
    files: ["electron/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node
    },
    rules: electronRules
  }
];

export default config;
