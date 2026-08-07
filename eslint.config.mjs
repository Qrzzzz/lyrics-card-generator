import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  // Electron and script harnesses have dedicated contract suites and stay out
  // of the Next.js-specific lint configuration.
  { ignores: [".next/**", "dist-desktop/**", "release/**", "playwright-report/**", "index.html", "electron/**", "scripts/**", "tmp/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "off"
    }
  }
];

export default config;
