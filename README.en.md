# Lyrics Card Generator

A Windows desktop app for generating polished lyric sharing cards.
Paste a song link or enter song information manually, edit lyrics, translations, cover art, and visual styles, then export a high-resolution PNG image for sharing.

The current focus is the Windows desktop version: download the EXE and run it directly. No manual Node.js setup or server deployment is required for normal users.

## Download and Installation

Download the latest version from GitHub Releases:

* Recommended installer: `Lyrics-Card-Generator-Setup-v1.0.0-win-x64.exe`
* Portable version: `Lyrics-Card-Generator-Portable-v1.0.0-win-x64.exe`

The installer is recommended for regular use. The portable version is useful for temporary use, testing, or running from a removable drive.

> The current build is not code-signed. Windows may show a SmartScreen warning, which is common for unsigned personal applications.

## Features

* Generate high-polish lyric sharing images
* Portrait, landscape, and custom canvas sizes
* Automatic card height for long lyrics, translations, and footer information
* Original lyric and translation layout
* Apple Music, NetEase Cloud Music, and QQ Music link parsing
* Manual song title, artist, cover, and lyric editing
* Local cover upload
* Palette extraction from cover art for gradient backgrounds
* Platform logo, shared-by text, and generated watermark
* Frame, shadow, font, font size, line height, and text color controls
* Chinese / English interface
* High-resolution PNG export
* GitHub Releases update checking

## Windows Desktop Version

The desktop version keeps the original Next.js Web UI and API routes, then wraps them with Electron.

When the EXE starts, it launches a local Next service on the user’s machine and opens it in a desktop window. Normal users only need to double-click the EXE. They do not need to understand Node.js, npm, or local development servers.

The desktop app can start offline. These features remain available without internet access:

* Manual song information editing
* Manual lyric and translation editing
* Local cover upload
* Style customization
* PNG generation and export

These features require internet access:

* Music platform link parsing
* Remote cover loading
* Automatic lyric fetching
* GitHub update checking

## How to Use

1. Start the app.
2. Paste an Apple Music, NetEase Cloud Music, or QQ Music link, or enter song information manually.
3. Edit lyrics and translations.
4. Adjust canvas ratio, fonts, colors, frames, watermarks, and other styles.
5. Preview the card on the right.
6. Export the PNG image.

## Update Checking

The app provides a “Check for updates” button.
It requests this project’s GitHub Releases and compares the current version with the latest published release.

This feature only checks for updates and opens the download page. It does not silently download installers or replace the current app automatically.

## Local Development

Node.js and npm are required.

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Desktop Development and Packaging

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

## Scripts

```bash
npm run dev             # Start the Web development server
npm run build           # Build the Next.js app
npm run typecheck       # Run TypeScript type checking
npm run desktop:dev     # Start Electron development mode
npm run desktop:pack    # Build an unpacked desktop directory
npm run desktop:build   # Build the Windows installer and portable EXE
npm run parse:test      # Test song link parsing
```

## Tech Stack

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

## Fonts

The project uses:

* Source Han Sans
* Source Han Serif

They provide a strong, clear, and reliable typographic foundation for Chinese lyric cards.

## Acknowledgements

Thanks to Apple Music. The colorful gradient background, flowing visual atmosphere, and early lyric card layout direction were inspired by the Apple Music visual experience. This project is not affiliated with Apple Music and does not represent Apple Music’s official position.

Thanks to Source Han Sans and Source Han Serif. They provide the solid and legible typographic foundation used by the lyric cards.

Thanks to Sabrina Carpenter’s “opposite”. It is used as the startup sample and helped shape the first layout rhythm for English lyrics and Chinese translations. All rights to the musical work belong to their respective owners. This project does not distribute audio content.

Thanks to OpenAI Codex for turning many ideas into working code, desktop packaging workflows, and real product features.

Thanks to ChatGPT 5.5 for issue diagnosis, solution design, fix review, and acceptance checks throughout the development process.

Thanks to ReactBits for multiple UI ideas, including Spark Cursor and other motion inspirations.

Thanks to Rangerov for attention to this project and for providing feedback.

Thanks also to the maintainers of Next.js, React, TypeScript, Tailwind CSS, Electron, electron-builder, html-to-image, Framer Motion, Lucide React, Cheerio, Zod, and the broader modern frontend ecosystem. Without these open-source foundations, this project would not exist in its current form.

## Copyright and Notice

This project is designed to generate lyric sharing cards. Users should make sure they have the right to use the lyrics, cover art, platform logos, and other materials they provide.

Platform names, musical works, artist names, and trademarks belong to their respective owners. This project is not officially affiliated with Apple Music, NetEase Cloud Music, QQ Music, or related music platforms.

This repository does not currently include a dedicated open-source license. If the project is intended for broader redistribution or derivative development, a clear `LICENSE` file should be added.
