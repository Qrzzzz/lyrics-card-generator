<div align="center">

# 🎧 Lyrics Card Generator

### 生成可用於分享的高質感歌詞分享卡片

**Spotify / Apple Music / 網易雲音樂 / QQ 音樂 · Windows 桌面應用程式 · 高清 PNG 匯出 · 多語言文件**

<p>
  <strong>語言</strong><br/>
  <a href="./README.md">简体中文</a> ·
  <strong>繁體中文</strong> ·
  <a href="./README.en.md">English</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.es.md">Español</a>
</p>

<p>
  <strong>導覽</strong><br/>
  <a href="https://github.com/Qrzzzz/lyrics-card-generator/releases/latest">下載最新版</a> ·
  <a href="./docs/releases/v3.3.0.zh-TW.md">發布說明</a> ·
  <a href="#主要功能">主要功能</a> ·
  <a href="#本機開發">本機開發</a> ·
  <a href="./LICENSE">授權條款</a>
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

## 📦 下載與安裝

請前往 [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) 下載最新版：

* 建議一般使用者下載安裝版：`Lyrics Card Generator Setup 3.3.0.exe`
* 不想安裝時可下載可攜版：`Lyrics Card Generator-3.3.0-portable.exe`

安裝版適合長期使用；可攜版適合臨時執行、測試或放在隨身碟中使用。

> 目前版本尚未進行程式碼簽章。Windows 可能顯示 SmartScreen 提示，這是未簽章個人應用常見現象。

### v3.3.0 更新重點

* 新增 Spotify 單曲連結解析，可自動填入歌曲標題、歌手與封面。
* 支援 `open.spotify.com/track/...`、地區化 track 頁面、embed track 頁面以及常見 Spotify 短連結。
* Spotify 歌曲可顯示平台 Logo，並繼續使用現有封面取色、歌詞卡片編輯與 PNG 匯出流程。
* 自動歌詞取得仍沿用現有實驗性歌詞搜尋，不從 Spotify 取得歌詞，也不需要 Spotify API 金鑰。

<a id="主要功能"></a>

<br clear="right" />

## 🌐 多語言發佈說明

GitHub Release 頁面預設使用簡體中文短版，完整發佈說明維護在 `docs/releases/`：

* [简体中文](./docs/releases/v3.3.0.zh-CN.md)
* [繁體中文](./docs/releases/v3.3.0.zh-TW.md)
* [English](./docs/releases/v3.3.0.en.md)
* [Français](./docs/releases/v3.3.0.fr.md)
* [日本語](./docs/releases/v3.3.0.ja.md)
* [Español](./docs/releases/v3.3.0.es.md)

## ✨ 主要功能

* 生成高質感歌詞分享圖片
* 支援直式、橫式和自訂畫布尺寸
* 橫式版面基於安全區域重構，封面欄、內容欄和底部資訊更穩定
* 直式自訂尺寸支援基於真實 DOM 測量的自動高度
* 支援歌詞原文與翻譯並排排版
* 支援按目前介面語言拆分原文 / 譯文，包括簡體中文、繁體中文、英文、法文、日文、西班牙文目標譯文
* 支援相容 OpenAI Chat Completions 的 AI 歌詞翻譯，可設定服務商 Base URL、模型、API Key、六種翻譯風格、Reasoning 與串流輸出
* 支援 Spotify、Apple Music、網易雲音樂、QQ 音樂連結解析
* 支援本機 MP3 / FLAC 中繼資料解析，嘗試讀取標題、藝人、專輯、封面和內嵌歌詞
* 支援手動填寫歌曲名、藝人、封面和歌詞
* 支援本機封面上傳
* 支援從封面擷取色彩並生成漸層背景
* 支援平台 Logo、分享人、生成浮水印
* 支援思源黑體 / 思源宋體兩套字型方案、自訂中日韓 / 西文字型、系統字型選擇視窗與真實歌詞字型預覽
* 支援簡體中文 / 繁體中文 / English / Français / 日本語 / Español 介面切換
* 支援匯出高解析 PNG 圖片
* 支援從 GitHub Releases 檢查新版本

## 🪟 Windows 桌面版說明

桌面版保留原本的 Next.js Web 介面和 API 路由，並透過 Electron 包裝為本機應用。

執行 EXE 後，應用會在本機啟動一個本機 Next 服務，並在桌面視窗中開啟。一般使用者只需要雙擊 EXE 使用，不需要了解 Node.js、npm 或本機開發環境。

桌面版可以離線啟動。以下功能在離線狀態下仍可使用：

* 手動編輯歌曲資訊
* 手動編輯歌詞和翻譯
* 上傳本機封面
* 解析本機 MP3 / FLAC 檔案中的中繼資料和內嵌歌詞
* 調整樣式
* 生成和匯出 PNG 圖片

以下功能需要連線：

* 音樂平台連結解析
* 遠端封面載入
* 自動歌詞擷取
* AI 歌詞翻譯
* GitHub 檢查更新

## 🚀 使用方式

1. 啟動應用。
2. 貼上 Spotify、Apple Music、網易雲音樂或 QQ 音樂連結，或手動填寫歌曲資訊。
3. 也可以上傳本機 MP3 / FLAC，自動讀取檔案內的歌曲資訊、封面和內嵌歌詞。
4. 編輯歌詞和翻譯；可使用 AI 翻譯，也可將原文 / 譯文交替行依目前介面語言自動拆分。
5. 調整畫布比例、字型方案（中日韓 / 西文）、字號、顏色、邊框、浮水印等樣式。
6. 在右側預覽卡片。
7. 點擊「完成並匯出」，儲存 PNG 圖片。

## 🔄 檢查更新

應用內提供「檢查更新」按鈕。
它會透過本機 Next API 路由請求本專案的 GitHub Releases，比較目前版本和最新發布版本，並優先識別安裝版和可攜版下載資產。

此功能只負責檢查更新並開啟下載頁面，不會靜默下載安裝包，也不會自動取代目前程式。

<a id="本機開發"></a>

## 🛠️ 本機開發

需要 Node.js 和 npm。

```bash
npm install
npm run dev
```

啟動後造訪：

```text
http://localhost:3000
```

## 🖥️ 桌面版開發與打包

開發桌面版：

```bash
npm run desktop:dev
```

建構可檢查的 unpacked 桌面目錄：

```bash
npm run desktop:pack
```

建構 Windows 安裝版和可攜版：

```bash
npm run desktop:build
```

建構產物會輸出到：

```text
release/
```

桌面版所需的 Next standalone 服務會被整理到：

```text
dist-desktop/server
```

## 📜 常用指令

```bash
npm run dev             # 啟動 Web 開發伺服器
npm run build           # 建構 Next.js 應用
npm run typecheck       # TypeScript 型別檢查
npm run desktop:dev     # 啟動 Electron 開發模式
npm run desktop:pack    # 建構 unpacked 桌面目錄
npm run desktop:build   # 建構 Windows 安裝版和可攜版
npm run parse:test      # 測試歌曲連結解析
npm run core:test       # 測試 3.0 核心純函式
```

## 🧩 技術棧

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
* ReactBits 風格 UI 靈感

## 🔤 字型

專案使用：

* 思源黑體
* 思源宋體

它們為卡片提供厚重、清晰、適合中文歌詞排版的字型基礎。

3.1.0 提供思源黑體與思源宋體兩套預設方案，並可分別設定中日韓字型與西文字型。「字型方案」成為與歌詞、版面配置和視覺細節並列的獨立步驟；桌面版可從 Windows 系統字型清單中選擇，Web 版仍可使用推薦字型與內建預設。完整字型預覽位於右側真實卡片下方，使用與真實卡片相同的背景演算法，並固定以深海藍、鈷藍、靛藍、夜幕藍取色；它不會修改實際卡片背景，也不會進入最終 PNG。

## 🙏 致謝

感謝 [Apple Music](https://music.apple.com/)。這個專案的彩色漸層、流光背景美學，以及早期歌詞卡片排版方向，受到 Apple Music 視覺體驗的啟發。本專案與 Apple Music 沒有關聯，也不代表 Apple Music 官方立場。

感謝 [思源黑體](https://github.com/adobe-fonts/source-han-sans) 和 [思源宋體](https://github.com/adobe-fonts/source-han-serif)。它們為中文歌詞卡片提供穩定、清晰、有分量的字型基礎。

感謝 [Sabrina Carpenter](https://www.sabrinacarpenter.com/) 的《opposite》。它作為應用啟動時的預設範例，幫助確定初版排版、英文歌詞和中文翻譯的視覺節奏。

感謝 [YOASOBI](https://www.yoasobi-music.jp/) 的《勇者》。它在歌詞樣例展示中用作示例文字，幫助驗證不同字型在卡片中的排版效果。

感謝 [OpenAI Codex](https://openai.com/codex/)。它把許多零散想法轉化為可執行的程式碼、桌面版建構流程和實際功能。

感謝 [ChatGPT 5.5](https://chatgpt.com/) 在開發過程中進行問題定位、方案設計、修復複核和驗收檢查。

感謝 [ReactBits](https://www.reactbits.dev/) 提供的多種 UI 創意，包括 Spark Cursor 等動效靈感。

感謝 Rangerov 對此專案的關注和提出意見。

感謝 [V0idream](https://github.com/V0idream) 提出的程式碼瘦身建議，[`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) 已據此進行相關最佳化。

也感謝這些開源專案及其維護者：[Next.js](https://nextjs.org/)、[React](https://react.dev/)、[TypeScript](https://www.typescriptlang.org/)、[Tailwind CSS](https://tailwindcss.com/)、[Electron](https://www.electronjs.org/)、[electron-builder](https://www.electron.build/)、[html-to-image](https://github.com/bubkoo/html-to-image)、[Framer Motion](https://motion.dev/)、[Lucide React](https://lucide.dev/)、[Cheerio](https://cheerio.js.org/)、[Zod](https://zod.dev/)，以及構成現代前端生態的眾多工具鏈。沒有這些基礎設施，這個專案不會以現在的形態出現。

## 📄 授權條款

本專案採用自訂 Source Available License，而不是傳統開源授權條款。

你可以為了個人、非商業、學習、評估目的查看、下載、執行原始碼，並進行僅限個人使用的私下修改。未經作者書面許可，不得商用、再分發、重新打包、公開發布修改版，或基於本專案製作競爭性產品。

本專案依賴的第三方開源元件仍遵循它們各自的授權條款。詳見 [LICENSE](./LICENSE)。

## Star History

<a href="https://www.star-history.com/?repos=Qrzzzz%2Flyrics-card-generator&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=Qrzzzz/lyrics-card-generator&type=date&legend=top-left" />
 </picture>
</a>
