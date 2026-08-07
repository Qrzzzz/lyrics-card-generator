import type { Config } from "tailwindcss";

const config: Config = {
  // Web Lite reuses application components, so its classes must participate in
  // the same Tailwind reachability scan as the desktop-rendered Next.js app.
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./web-lite/**/*.{html,js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        glass: "0 24px 80px rgba(0,0,0,0.35)"
      },
      fontFamily: {
        systemSans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ],
        systemSerif: ["Georgia", "ui-serif", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
