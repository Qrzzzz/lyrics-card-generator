# 多语言发布说明规范

Lyrics Card Generator 面向国内用户，GitHub Release 页面默认使用简体中文。其他语言不直接堆在 Release 正文里，而是放在 `docs/releases/` 目录下维护，再从 Release 正文跳转过去。

Release 页面保持短、清楚、适合下载；完整说明保留 6 种语言，方便不同用户阅读。

## 语言文件命名

每个正式版本分别维护 6 个 Markdown 文件：

```text
docs/releases/vX.Y.Z.zh-CN.md
docs/releases/vX.Y.Z.zh-TW.md
docs/releases/vX.Y.Z.en.md
docs/releases/vX.Y.Z.fr.md
docs/releases/vX.Y.Z.ja.md
docs/releases/vX.Y.Z.es.md
```

当前项目界面支持：简体中文、繁體中文、English、Français、日本語、Español。

## 已整理版本

- `v0.1.0`：Windows 桌面版初版发布。
- `v2.1.0`：多语言界面与文档更新。
- `v3.0.0`：歌词翻译、设置中心与导出流程优化。

旧的 `docs/release-notes-v*.md` 单文件发布说明已迁移到本目录，避免同一版本存在多套入口。

## GitHub Release 正文写法

Release 正文只写简体中文短版。Release 页面不在仓库目录中，不能使用 `./vX.Y.Z.en.md` 这类相对链接。建议使用完整 GitHub 链接。

```md
# Lyrics Card Generator vX.Y.Z

语言：简体中文 · [繁體中文](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.zh-TW.md) · [English](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.en.md) · [Français](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.fr.md) · [日本語](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.ja.md) · [Español](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.es.md)
```

## 内容同步原则

6 个语言版本应保持同一结构和同一信息量。不要让英文版比中文版多信息，也不要让其他语言只剩一句“见中文版”。发布说明面向用户，不要写“给发布者的备注”“Maintainer Note”这类内部说明。

涉及目标语言的功能描述必须本地化。例如 v3.0.0 的歌词翻译功能：中文用户看到的是中文歌词翻译，英文用户看到的是 English lyric translations，法语用户看到的是 traduction française，日本语用户看到的是日本語の歌詞翻訳，西语用户看到的是 traducción al español。

也就是说，目标译文语言应跟随当前界面语言，不能所有语言版本都写成“生成中文翻译”。

## 工作流程

1. 先构建版本并确认版本号。
2. 复制 `.github/RELEASE_TEMPLATE.md`，填好中文短版 Release 正文。
3. 在 `docs/releases/` 下补齐 6 个语言文件。
4. 创建 Git tag 和 GitHub Release。
5. 上传安装版和便携版资产。
6. 发布后检查应用内“检查更新”能否正确识别最新版。