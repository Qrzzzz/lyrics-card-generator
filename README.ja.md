<div align="center">

# 🎧 Lyrics Card Generator

### 共有に使える高品質な歌詞カードを生成

**Spotify / Apple Music / NetEase Cloud Music / QQ Music · Windows デスクトップアプリ · 高解像度 PNG 書き出し · 多言語ドキュメント**

<p>
  <strong>言語</strong><br/>
  <a href="./README.md">简体中文</a> ·
  <a href="./README.zh-TW.md">繁體中文</a> ·
  <a href="./README.en.md">English</a> ·
  <a href="./README.fr.md">Français</a> ·
  <strong>日本語</strong> ·
  <a href="./README.es.md">Español</a>
</p>

<p>
  <strong>ナビゲーション</strong><br/>
  <a href="https://github.com/Qrzzzz/lyrics-card-generator/releases/latest">最新版をダウンロード</a> ·
  <a href="./docs/releases/v5.1.0.ja.md">リリースノート</a> ·
  <a href="https://qrzzzz.github.io/lyrics-card-generator/">オンライン Web Lite 版</a> ·
  <a href="#主な機能">主な機能</a> ·
  <a href="#ローカル開発">ローカル開発</a> ·
  <a href="./LICENSE">ライセンス</a>
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

歌詞共有カードを作成する Windows デスクトップアプリです。
曲リンクを貼り付けるか情報を手入力し、歌詞、翻訳、カバー、見た目を編集して、高解像度 PNG として書き出せます。

## 📦 ダウンロードとインストール

最新版は [GitHub Releases](https://github.com/Qrzzzz/lyrics-card-generator/releases/latest) からダウンロードできます。

* 推奨インストーラー：`Lyrics Card Generator Setup 5.1.0.exe`
* ポータブル版：`Lyrics Card Generator-5.1.0-portable.exe`

通常利用にはインストーラーを推奨します。ポータブル版は一時利用、検証、リムーバブルドライブでの利用に向いています。

> 現在のビルドはコード署名されていません。Windows が SmartScreen 警告を表示する場合があります。これは未署名の個人アプリでは一般的です。

### v5.1.0 の更新ポイント

* 信頼できない曲・画像 URL は、各リダイレクト前に Safe Fetch で検証され、プライベート、予約済み、クラウドメタデータ宛ての SSRF を遮断します。
* 曲、歌詞、サンプルの読み込みを原子的にし、クリア、曲変更、より新しい操作で古いリクエストと候補を無効化します。
* デスクトップ書き出しは不変スナップショットと同期 mutex を使い、内容、寸法、ファイル名を同じリビジョンに固定します。
* Web Lite は独立した書き出し host を使い、36 行、フォント、寸法安定性、overflow の安全判定をデスクトップ版と共有します。

## 🌐 多言語リリースノート

GitHub Release ページではデフォルトで簡体字中国語の短縮版が使用され、完全なリリースノートは `docs/releases/` にて管理されています：

* [简体中文](./docs/releases/v5.1.0.zh-CN.md)
* [繁體中文](./docs/releases/v5.1.0.zh-TW.md)
* [English](./docs/releases/v5.1.0.en.md)
* [Français](./docs/releases/v5.1.0.fr.md)
* [日本語](./docs/releases/v5.1.0.ja.md)
* [Español](./docs/releases/v5.1.0.es.md)

<a id="主な機能"></a>

## ✨ 主な機能

### 🎨 画像生成とキャンバスレイアウト

* 高品質な歌詞共有画像を生成
* 縦向き、横向き、カスタムキャンバスサイズに対応
* 安全領域、カバー列、コンテンツ列、フッター領域に基づく安定した横向きレイアウト
* 縦向きカスタムキャンバスで実測に基づく自動高さ
* 高解像度 PNG 書き出し

### 📝 歌詞のレイアウトと翻訳

* 原文歌詞と翻訳のレイアウト
* 簡体字中国語、繁体字中国語、英語、フランス語、日本語、スペイン語の目標言語検出による原文 / 翻訳の自動分割
* OpenAI 互換 Chat Completions API を使う AI 歌詞翻訳。プロバイダー URL、モデル、API キー、6 件の既定プリセット、最大 2 件のカスタムプリセット、Reasoning、ストリーミング出力を設定可能

### 🎵 曲検索、音楽リンクとローカルファイル解析

* NetEase Cloud Music で曲名、アーティスト、アルバムを検索し、選択した結果から楽曲情報と歌詞を取り込めます
* Spotify、Apple Music、NetEase Cloud Music、QQ Music のリンク解析
* ローカル MP3 / FLAC からタイトル、アーティスト、アルバム、カバー、埋め込み歌詞を解析

### ✍️ 手動編集と素材アップロード

* 曲名、アーティスト、カバー、歌詞の手動編集
* ローカルカバーのアップロード

### 🌈 ビジュアルスタイルとブランド情報

* カバーから色を抽出してグラデーション背景を生成
* アプリ画面はアルバム動的カラー、ダーク、ライト、ダークアクリル、ライトアクリルの 5 つの外観モードに対応
* プラットフォームロゴ、共有者テキスト、生成ウォーターマーク

### 🔤 フォントと多言語インターフェース

* 源ノ角ゴシック / 源ノ明朝の構成、CJK / 欧文フォントの個別選択、システムフォント選択画面、実際の歌詞によるプレビュー
* 簡体字中国語、繁体字中国語、英語、フランス語、日本語、スペイン語インターフェース

### 🚀 バージョンアップデート

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
* NetEase Cloud Music 検索と歌詞取得
* リモートカバーの読み込み
* 歌詞の自動取得
* AI 歌詞翻訳
* GitHub Releases によるアップデート確認

## 🚀 使い方

1. アプリを起動します。
2. NetEase Cloud Music で曲名、アーティスト、アルバムを検索し、候補を選択して楽曲情報、カバー、歌詞を取り込みます。
3. Spotify、Apple Music、NetEase Cloud Music、QQ Music のリンク貼り付けや、ローカル MP3 / FLAC のアップロードも利用できます。
4. 歌詞と翻訳を編集します。AI 翻訳を使うか、選択中の UI 言語に応じて原文 / 翻訳の交互行を自動分割できます。
5. キャンバス比率、CJK / 欧文フォント構成、色、フレーム、ウォーターマークなどのスタイルを調整します。
6. 右側でカードをプレビューします。
7. 「完了して書き出し」を使って PNG 画像を保存します。

## 🔄 アップデート確認

アプリには「アップデートを確認」ボタンがあります。
ローカル Next API ルート経由でこのプロジェクトの GitHub Releases を取得し、現在のバージョンと最新リリースを比較して、利用可能な場合はインストーラー / ポータブル版のアセットを優先します。

この機能はアップデートを確認してダウンロードページを開くだけです。インストーラーを自動でダウンロードしたり、現在のアプリを自動で置き換えたりはしません。

<a id="ローカル開発"></a>

## 🛠️ ローカル開発

Node.js と npm が必要です。

```bash
npm install
npm run dev
```

その後、以下を開きます。

```text
http://localhost:3000
```

## 🖥️ デスクトップ開発とパッケージング

デスクトップアプリを開発モードで実行します。

```bash
npm run desktop:dev
```

確認用の unpacked デスクトップディレクトリをビルドします。

```bash
npm run desktop:pack
```

Windows インストーラーとポータブル EXE の両方をビルドします。

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

## 📜 Scripts

```bash
npm run dev             # Web 開発サーバーを起動
npm run build           # Next.js アプリをビルド
npm run typecheck       # TypeScript 型チェックを実行
npm run desktop:dev     # Electron 開発モードを起動
npm run desktop:pack    # unpacked デスクトップディレクトリをビルド
npm run desktop:build   # Windows インストーラーとポータブル EXE をビルド
npm run parse:test      # 曲リンク解析をテスト
npm run core:test       # 3.0 コア純粋関数をテスト
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

中国語歌詞カードに適した、強く明瞭で信頼性の高いタイポグラフィ基盤を提供します。

3.1.0 では源ノ角ゴシックと源ノ明朝の2つの構成を用意し、CJK フォントと欧文フォントを個別に選択できます。「フォント」は歌詞、レイアウト、ビジュアル詳細と並ぶ独立した手順になりました。デスクトップ版は Windows システムフォントを列挙でき、Web 版でもおすすめフォントと内蔵プリセットを利用できます。完全なフォントプレビューは右列の実際のカード下に表示され、同じ背景アルゴリズムへ深海ブルー、コバルトブルー、インディゴブルー、ナイトブルーの4色を固定入力します。実際のカード背景や書き出す PNG には影響しません。

## 🙏 謝辞

[Apple Music](https://music.apple.com/) に感謝します。このプロジェクトの色鮮やかなグラデーション、流れる光の背景美学、そして初期の歌詞カードレイアウトの方向性は、Apple Music のビジュアル体験から着想を得ています。本プロジェクトは Apple Music と関係がなく、Apple Music の公式見解を代表するものでもありません。

[Source Han Sans](https://github.com/adobe-fonts/source-han-sans) と [Source Han Serif](https://github.com/adobe-fonts/source-han-serif) に感謝します。これらは中国語歌詞カードに、安定していて明瞭で、存在感のある書体基盤を提供しています。

[OpenAI Codex](https://openai.com/codex/) に感謝します。多くの断片的なアイデアを、実行可能なコード、デスクトップ版のビルドフロー、実際の機能へと変換してくれました。

[ChatGPT 5.6 Sol](https://chatgpt.com/) に感謝します。開発過程での問題特定、方案設計、修正レビュー、受け入れ確認を支援しました。

[ReactBits](https://www.reactbits.dev/) に感謝します。Spark Cursor などのモーションを含む、さまざまな UI アイデアの着想を提供してくれました。

Rangerov に感謝します。このプロジェクトへの関心と意見に感謝します。

[V0idream](https://github.com/V0idream) によるコード軽量化の提案に感謝します。[`v1.1.0`](https://github.com/Qrzzzz/lyrics-card-generator/releases/tag/v1.1.0) では、それに基づく関連最適化を実施済みです。

以下の楽曲とそのクリエイターに感謝します。これらはプロジェクトのサンプルとして、異なる言語、フォント、翻訳の長さ、レイアウトのリズムにおける歌詞カードの表示効果の検証に役立ちました。

<details>
<summary>サンプル楽曲を展開</summary>

| 楽曲 | アルバム | アーティスト |
| --- | --- | --- |
| 《opposite》 | *emails i can't send fwd:* | [Sabrina Carpenter](https://www.sabrinacarpenter.com/) |
| 《勇者》 | *THE BOOK 3* | [YOASOBI](https://www.yoasobi-music.jp/) |
| 《光辉岁月》 | *命运派对* | [Beyond](https://music.apple.com/cn/artist/beyond/79668659) |
| 《Opalite》 | *The Life of a Showgirl* | [Taylor Swift](https://www.taylorswift.com/) |

</details>

また、これらのオープンソースプロジェクトとそのメンテナーにも感謝します：[Next.js](https://nextjs.org/)、[React](https://react.dev/)、[TypeScript](https://www.typescriptlang.org/)、[Tailwind CSS](https://tailwindcss.com/)、[Electron](https://www.electronjs.org/)、[electron-builder](https://www.electron.build/)、[html-to-image](https://github.com/bubkoo/html-to-image)、[Framer Motion](https://motion.dev/)、[Lucide React](https://lucide.dev/)、[Cheerio](https://cheerio.js.org/)、[Zod](https://zod.dev/)、そして現代的なフロントエンドエコシステムを構成する多くのツールチェーン。これらの基盤がなければ、このプロジェクトは現在の形では存在していません。

## 📄 ライセンス

このプロジェクトは、従来のオープンソースライセンスではなく、独自の Source Available License の下で公開されています。

個人、非商用、教育、評価目的でソースコードを閲覧、ダウンロード、実行し、個人的に改変できます。商用利用、再配布、再パッケージング、公開された改変版、または本プロジェクトを基にした競合製品には、権利者からの事前の書面許可が必要です。

サードパーティのオープンソース依存関係は、それぞれのライセンスに従います。詳細は [LICENSE](./LICENSE) を参照してください。
