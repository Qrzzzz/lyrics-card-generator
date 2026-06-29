<div align="center">

# 🎧 Lyrics Card Generator

### Generate polished lyric sharing cards for social sharing

**Spotify / Apple Music / NetEase Cloud Music / QQ Music · Windows desktop app · HD PNG export · multilingual documentation**

<p>
  <strong>Language</strong><br/>
  <a href="./README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <strong>English</strong> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.es.md">Español</a>
</p>

<p>
  <strong>Navigation</strong><br/>
  <a href="https://github.com/Qrzzzz/lyrics-card-generator/releases/latest">Latest Release</a> ·
  <a href="./docs/releases/v3.7.1.en.md">Release Notes</a> ·
  <a href="#features">Features</a> ·
  <a href="#local-development">Local Development</a> ·
  <a href="./LICENSE">License</a>
</p>

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-PNG-FF5722)
![Docs](https://img.shields.io/badge/Docs-6%20Languages-7C3AED)
![Release](https://img.shields.io/github/v/release/Qrzzzz/lyrics-card-generator?include_prereleases)

</div>

---

<img
  align="right"
  src="./public/app-icon.png"
  alt="Lyrics Card Generator icon"
  width="200"
/>

A Windows desktop app for generating polished lyric sharing cards.
Paste a song link or enter song information manually, edit lyrics, translations, cover art, and visual styles, then export a high-resolution PNG image for sharing.

## 📦 Download and Installation

Download the latest version from [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest):

* Recommended installer: `Lyrics Card Generator Setup 3.7.1.exe`
* Portable version: `Lyrics Card Generator-3.7.1-portable.exe`

The installer is recommended for regular use. The portable version is useful for temporary use, testing, or running from a removable drive.

> The current build is not code-signed. Windows may show a SmartScreen warning, which is common for unsigned personal applications.

### v3.7.1 Highlights

* Standardizes toggle controls across the style panel, lyric input, song info, and settings so state changes and disabled feedback are more consistent.
* Moves single-choice patterns such as language selection onto shared option cards and aligns layout mode, grid density, and frame/full-bleed choices with a common segmented-control pattern.
* Unifies the look and interaction feedback of common settings-panel inputs, textareas, selects, and action buttons.
* Improves keyboard usability, focus visibility, label presentation, and disabled-state behavior for common controls.
* Prepares the UI control layer for the later v3.8.0 animation upgrade without shipping that animation system yet.

<br clear="right" />

## 🌐 Multilingual Release Notes

The GitHub Release page defaults to a simplified Chinese short version, while the full release notes are maintained in `docs/releases/`:

* [简体中文](./docs/releases/v3.7.1.zh-CN.md)
* [繁體中文](./docs/releases/v3.7.1.zh-TW.md)
* [English](./docs/releases/v3.7.1.en.md)
* [Français](./docs/releases/v3.7.1.fr.md)
* [日本語](./docs/releases/v3.7.1.ja.md)
* [Español](./docs/releases/v3.7.1.es.md)

<a id="features"></a>

## ✨ Features

* Generate high-polish lyric sharing images
* Portrait, landscape, and custom canvas sizes
* Rebuilt landscape layout based on safe areas, cover column, content column, and footer regions
* Measured auto height for portrait custom canvases
* Original lyric and translation layout
* Split alternating original / translated lyrics with Simplified Chinese, Traditional Chinese, English, French, Japanese, and Spanish target-language detection
* AI lyric translation through OpenAI-compatible Chat Completions APIs, with configurable provider URL, model, API key, six translation styles, reasoning, and streaming output
* Spotify, Apple Music, NetEase Cloud Music, and QQ Music link parsing
* Local MP3 / FLAC metadata parsing for title, artist, album, cover art, and embedded lyrics
* Manual song title, artist, cover, and lyric editing
* Local cover upload
* Palette extraction from cover art for gradient backgrounds
* Platform logo, shared-by text, and generated watermark
* Source Han Sans / Serif schemes, independent CJK and Latin fonts, a system-font picker, and lyric-based typography previews
* Simplified Chinese / Traditional Chinese / English / French / Japanese / Spanish interface
* High-resolution PNG export
* GitHub Releases update checking

## 🪟 Windows Desktop Version

The desktop version keeps the original Next.js Web UI and API routes, then wraps them with Electron.

When the EXE starts, it launches a local Next service on the user’s machine and opens it in a desktop window. Normal users only need to double-click the EXE. They do not need to understand Node.js, npm, or local development servers.

The desktop app can start offline. These features remain available without internet access:

* Manual song information editing
* Manual lyric and translation editing
* Local cover upload
* Local MP3 / FLAC metadata and embedded lyric parsing
* Style customization
* PNG generation and export

These features require internet access:

* Music platform link parsing
* Remote cover loading
* Automatic lyric fetching
* AI lyric translation
* GitHub update checking

## 🚀 How to Use

1. Start the app.
2. Paste a Spotify, Apple Music, NetEase Cloud Music, or QQ Music link, or enter song information manually.
3. Optionally upload a local MP3 / FLAC file to read metadata, cover art, and embedded lyrics.
4. Edit lyrics and translations; use AI translation or split alternating original / translated text according to the selected interface language.
5. Adjust canvas ratio, CJK / Latin font schemes, colors, frames, watermarks, and other styles.
6. Preview the card on the right.
7. Use “Complete & Export” to save the PNG image.

## 🔄 Update Checking

The app provides a “Check for updates” button.
It requests this project’s GitHub Releases through a local Next API route, compares the current version with the latest published release, and prioritizes installer / portable assets when available.

This feature only checks for updates and opens the download page. It does not silently download installers or replace the current app automatically.

<a id="local-development"></a>

## 🛠️ Local Development

Node.js and npm are required.

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## 🖥️ Desktop Development and Packaging

Run the desktop app in development mode:

```bash
npm run desktop:dev
```

Build an unpacked desktop directory for inspection:

```bash
npm run desktop:pack
```

Build both the Windows installer and portable EXE:

```bash
npm run desktop:build
```

Build artifacts are written to:

```text
release/
```

The bundled Next standalone service is prepared in:

```text
dist-desktop/server
```

## 📜 Scripts

```bash
npm run dev             # Start the Web development server
npm run build           # Build the Next.js app
npm run typecheck       # Run TypeScript type checking
npm run desktop:dev     # Start Electron development mode
npm run desktop:pack    # Build an unpacked desktop directory
npm run desktop:build   # Build the Windows installer and portable EXE
npm run parse:test      # Test song link parsing
npm run core:test       # Test 3.0 core pure functions
```

## 🧩 Tech Stack

* Next.js
* React
* TypeScript
* Tailwind CSS
* Electron
* electron-builder
* html-to-image
* Framer Motion
* Lucide React
* Cheerio
* Zod
* UI inspiration from ReactBits

## 🔤 Fonts

The project uses:

* Source Han Sans
* Source Han Serif

They provide a strong, clear, and reliable typographic foundation for Chinese lyric cards.

Version 3.1.0 provides Source Han Sans and Source Han Serif schemes and lets CJK and Latin fonts be selected independently. Font Schemes is now a dedicated workflow step alongside Lyrics, Layout, and Visual Details. The desktop app can enumerate Windows system fonts, while Web builds retain recommended fonts and bundled presets. The full font preview sits below the real card in the right column and uses the real card background algorithm with fixed Deep Sea, Cobalt, Indigo, and Nightfall color inputs; it does not change the actual card background or enter the exported PNG.

## 🙏 Acknowledgements

Thanks to [Apple Music](https://music.apple.com/). The colorful gradients, flowing-light background aesthetics, and early lyric card layout direction in this project were inspired by the Apple Music visual experience. This project is not affiliated with Apple Music and does not represent Apple Music’s official position.

Thanks to [Source Han Sans](https://github.com/adobe-fonts/source-han-sans) and [Source Han Serif](https://github.com/adobe-fonts/source-han-serif). They provide a stable, clear, and substantial typographic foundation for Chinese lyric cards.

Thanks to [Sabrina Carpenter](https://www.sabrinacarpenter.com/)’s “opposite”. As the default sample shown when the app starts, it helped define the visual rhythm of the first layout, English lyrics, and Chinese translation.

Thanks to [YOASOBI](https://www.yoasobi-music.jp/)’s “勇者”. It is used as example text in lyric sample displays and helped verify the layout effects of different fonts inside the cards.

Thanks to [OpenAI Codex](https://openai.com/codex/). It turned many scattered ideas into runnable code, desktop build workflows, and real features.

Thanks to [ChatGPT 5.5](https://chatgpt.com/) for issue diagnosis, solution design, fix review, and acceptance checks throughout development.

Thanks to [ReactBits](https://www.reactbits.dev/) for multiple UI ideas, including motion inspiration such as Spark Cursor.

Thanks to Rangerov for attention to this project and for providing feedback.

Thanks to [V0idream](https://github.com/V0idream) for suggesting code slimming improvements. [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) has already made related optimizations accordingly.

Thanks also to these open-source projects and their maintainers: [Next.js](https://nextjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Electron](https://www.electronjs.org/), [electron-builder](https://www.electron.build/), [html-to-image](https://github.com/bubkoo/html-to-image), [Framer Motion](https://motion.dev/), [Lucide React](https://lucide.dev/), [Cheerio](https://cheerio.js.org/), [Zod](https://zod.dev/), and the many toolchains that make up the modern frontend ecosystem. Without this infrastructure, this project would not exist in its current form.

## 📄 License

This project is released under a custom Source Available License, not a traditional open-source license.

You may view, download, run, and privately modify the source code for personal, non-commercial, educational, and evaluation purposes. Commercial use, redistribution, repackaging, public modified releases, and competing products based on this project require prior written permission from the copyright holder.

Third-party open-source dependencies remain governed by their respective licenses. See [LICENSE](./LICENSE) for details.

## Star History

<a href="https://www.star-history.com/?repos=Qrzzzz%2Flyrics-card-generator&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&legend=top-left" />
 </picture>
</a>
