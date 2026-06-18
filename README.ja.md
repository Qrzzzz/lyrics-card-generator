<div align="center">

# 🎧 Lyrics Card Generator

### 共有しやすい上質な歌詞カードを作成

**Apple Music / NetEase Cloud Music / QQ Music · Windows デスクトップ · 高解像度 PNG 書き出し · 日本語ドキュメント**

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [Français](./README.fr.md) · [Español](./README.es.md) · [最新リリース](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) · [機能](#機能) · [開発](#ローカル開発) · [ライセンス](./LICENSE)

![Platform](https://img.shields.io/badge/Platform-Windows%20Desktop-111827)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20React%20%2B%20TypeScript-0F766E)
![Desktop](https://img.shields.io/badge/Desktop-Electron-1D4ED8)
![Output](https://img.shields.io/badge/Output-PNG-FF5722)
![Docs](https://img.shields.io/badge/Docs-6%20Languages-7C3AED)
![Release](https://img.shields.io/github/v/release/Qrzzzz/lyrics-card-generator?include_prereleases)

</div>

---

歌詞共有カードを作成する Windows デスクトップアプリです。
曲リンクを貼り付けるか情報を手入力し、歌詞、翻訳、カバー、見た目を編集して、高解像度 PNG として書き出せます。

## 📦 ダウンロードとインストール

最新版は GitHub Releases からダウンロードできます。

* 推奨インストーラー：`Lyrics Card Generator Setup 2.1.0.exe`
* ポータブル版：`Lyrics Card Generator-2.1.0-portable.exe`

通常利用にはインストーラーを推奨します。ポータブル版は一時利用、検証、リムーバブルドライブでの利用に向いています。

> 現在のビルドはコード署名されていません。Windows が SmartScreen 警告を表示する場合があります。これは未署名の個人アプリでは一般的です。

<a id="機能"></a>

## ✨ 機能

* 高品質な歌詞共有画像を生成
* 縦向き、横向き、カスタムキャンバスサイズに対応
* 安全領域、カバー列、コンテンツ列、フッター領域に基づく安定した横向きレイアウト
* 縦向きカスタムキャンバスで実測に基づく自動高さ
* 原文歌詞と翻訳のレイアウト
* 簡体字中国語、繁体字中国語、英語、フランス語、日本語、スペイン語の目標言語検出による原文 / 翻訳の自動分割
* Apple Music、NetEase Cloud Music、QQ Music のリンク解析
* ローカル MP3 / FLAC からタイトル、アーティスト、アルバム、カバー、埋め込み歌詞を解析
* 曲名、アーティスト、カバー、歌詞の手動編集
* ローカルカバーのアップロード
* カバーから色を抽出してグラデーション背景を生成
* プラットフォームロゴ、共有者テキスト、生成ウォーターマーク
* フレーム、影、フォント、Windows システムフォント、文字サイズ、行間、文字色の調整
* 簡体字中国語、繁体字中国語、英語、フランス語、日本語、スペイン語インターフェース
* 高解像度 PNG 書き出し
* GitHub Releases によるアップデート確認

## 🪟 Windows デスクトップ版

デスクトップ版は既存の Next.js Web UI と API ルートを保持し、Electron でラップしています。

EXE を起動すると、ユーザーのマシン上でローカル Next サービスを立ち上げ、デスクトップウィンドウで開きます。通常のユーザーは EXE をダブルクリックするだけで使えます。Node.js、npm、ローカル開発サーバーの知識は不要です。

デスクトップアプリはオフラインでも起動できます。以下の機能はインターネットなしで利用できます。

* 曲情報の手動編集
* 歌詞と翻訳の手動編集
* ローカルカバーのアップロード
* ローカル MP3 / FLAC のメタデータと埋め込み歌詞の解析
* スタイル調整
* PNG 生成と書き出し

以下の機能にはインターネット接続が必要です。

* 音楽プラットフォームリンクの解析
* リモートカバーの読み込み
* 歌詞の自動取得
* GitHub アップデート確認

## 🚀 使い方

1. アプリを起動します。
2. Apple Music、NetEase Cloud Music、QQ Music のリンクを貼り付けるか、曲情報を手入力します。
3. 必要に応じてローカル MP3 / FLAC をアップロードし、メタデータ、カバー、埋め込み歌詞を読み取ります。
4. 歌詞と翻訳を編集します。原文 / 翻訳が交互に並んだテキストは、選択中のインターフェース言語に合わせて自動分割できます。
5. キャンバス比率、フォント、Windows システムフォント、色、フレーム、ウォーターマークなどを調整します。
6. 右側でカードをプレビューします。
7. 「完了して書き出し」で PNG 画像を保存します。

## 🔄 アップデート確認

アプリには「アップデートを確認」ボタンがあります。
ローカル Next API ルート経由で GitHub Releases を取得し、現在のバージョンと最新リリースを比較します。利用可能な場合はインストーラー版とポータブル版を優先して認識します。

この機能はアップデート確認とダウンロードページの表示のみを行います。インストーラーを自動でダウンロードしたり、現在のアプリを自動置換したりしません。

<a id="ローカル開発"></a>

## 🛠️ ローカル開発

Node.js と npm が必要です。

```bash
npm install
npm run dev
```

起動後、以下を開きます。

```text
http://localhost:3000
```

## 🖥️ デスクトップ開発とパッケージング

デスクトップアプリを開発モードで起動します。

```bash
npm run desktop:dev
```

確認用の unpacked デスクトップディレクトリを作成します。

```bash
npm run desktop:pack
```

Windows インストーラーとポータブル EXE をビルドします。

```bash
npm run desktop:build
```

ビルド成果物は以下に出力されます。

```text
release/
```

バンドルされた Next standalone サービスは以下に準備されます。

```text
dist-desktop/server
```

## 📜 スクリプト

```bash
npm run dev             # Web 開発サーバーを起動
npm run build           # Next.js アプリをビルド
npm run typecheck       # TypeScript 型チェック
npm run desktop:dev     # Electron 開発モードを起動
npm run desktop:pack    # unpacked デスクトップディレクトリをビルド
npm run desktop:build   # Windows インストーラーとポータブル EXE をビルド
npm run parse:test      # 曲リンク解析をテスト
npm run core:test       # 2.0 コア純粋関数をテスト
```

## 🧩 技術スタック

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
* ReactBits 由来の UI インスピレーション

## 🔤 フォント

このプロジェクトでは以下を使用しています。

* Source Han Sans
* Source Han Serif

これらは中国語歌詞カードに強く読みやすいタイポグラフィ基盤を提供します。

2.1.0 デスクトップ版では、カスタムカードタイポグラフィ用に Windows システムフォントを列挙できます。Web ビルドではシステムフォントを列挙できませんが、既存のフォントプリセットは利用できます。

## 🙏 謝辞

[Apple Music](https://music.apple.com/) に感謝します。カラフルなグラデーション背景、流れるような雰囲気、初期の歌詞カードレイアウトの方向性は Apple Music の視覚体験から着想を得ています。本プロジェクトは Apple Music と提携しておらず、Apple Music の公式見解を表すものではありません。

[Source Han Sans](https://github.com/adobe-fonts/source-han-sans) と [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) に感謝します。歌詞カードの堅実で読みやすい文字組みを支えています。

[Sabrina Carpenter](https://www.sabrinacarpenter.com/) の「opposite」に感謝します。起動時サンプルとして使われ、英語歌詞と中国語翻訳の初期レイアウトリズムを形作る助けになりました。楽曲の権利は各権利者に帰属します。本プロジェクトは音声コンテンツを配布しません。

[OpenAI Codex](https://openai.com/codex/) に感謝します。多くのアイデアを動作するコード、デスクトップパッケージングのワークフロー、実際の機能へ変換しました。

[ChatGPT 5.5](https://chatgpt.com/) に感謝します。問題診断、設計、修正レビュー、受け入れ確認を支援しました。

[ReactBits](https://www.reactbits.dev/) に感謝します。Spark Cursor など、複数の UI とモーションのアイデアを提供しました。

Rangerov の関心とフィードバックに感謝します。

[Sakuramble](https://github.com/Sakuramble) のコード軽量化の提案に感謝します。関連する最適化は [`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) に実装済みです。

また、[Next.js](https://nextjs.org/)、[React](https://react.dev/)、[TypeScript](https://www.typescriptlang.org/)、[Tailwind CSS](https://tailwindcss.com/)、[Electron](https://www.electronjs.org/)、[electron-builder](https://www.electron.build/)、[html-to-image](https://github.com/bubkoo/html-to-image)、[Framer Motion](https://motion.dev/)、[Lucide React](https://lucide.dev/)、[Cheerio](https://cheerio.js.org/)、[Zod](https://zod.dev/) と現代フロントエンドエコシステムの維持者に感謝します。

## 📄 ライセンス

本プロジェクトは一般的なオープンソースライセンスではなく、独自の Source Available License の下で公開されています。

個人、非商用、教育、評価目的で、ソースコードを閲覧、ダウンロード、実行、私的に変更できます。商用利用、再配布、再パッケージ、改変版の公開、本プロジェクトを基にした競合製品には、権利者の事前の書面許可が必要です。

サードパーティのオープンソース依存関係は、それぞれのライセンスに従います。詳細は [LICENSE](./LICENSE) を参照してください。
