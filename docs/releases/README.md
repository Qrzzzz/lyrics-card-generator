# 多语言发布说明规范

Lyrics Card Generator 面向国内用户，GitHub Release 页面默认使用简体中文。其他语言不直接堆在 Release 正文里，而是放在 `docs/releases/` 目录下维护，再从 Release 正文跳转过去。

Release 页面保持短、清楚；完整说明保留 6 种语言，方便不同用户阅读。

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
- `v1.0.0`：Windows 桌面正式版、检查更新、自动高度和导出体验优化。
- `v1.1.0`：多语言发布说明待迁移补齐。
- `v2.0.0`：横版布局、本地音频、系统字体、导出与更新检查增强。
- `v2.1.0`：多语言界面与文档更新。
- `v3.0.0`：歌词翻译、设置中心与导出流程优化。
- `v3.2.1`：v3.2.0 的 bugfix 版本，修复主题可读性、首次语言持久化、Header 清空入口与背景设置稳定性，并补充细网格控制。
- `v3.3.0`：新增 Spotify 单曲链接解析，支持自动填入标题、歌手、封面并显示平台 Logo。
- `v3.3.1`：v3.3.0 的 bugfix 版本，修复卡片背景细网格叠加和关闭后仍残留网格的问题。
- `v3.4.0`：重构布局步骤的内容类型逻辑，将背景网格升级为可配置的视觉细节选项，锁定纯音乐卡片为 1:1。
- `v3.6.0`：新增深色亚克力与浅色亚克力应用主题，Windows 桌面端支持真正的 Acrylic 半透明窗口材质，并升级为融合式自绘标题栏与内部滚动条。
- `v3.6.1`：修复 Acrylic 桌面标题栏最大化/还原状态同步、hover、层级和多语言文案，并修正当前下载入口。
- `v3.7.1`：界面控件标准化版本，统一开关、选项卡片、分段控件与设置面板基础控件，并改善可访问性与焦点反馈，为后续 v3.8.0 动效升级打基础。
- `v3.8.0`：集中化动效系统版本，统一编辑器、设置、预览外壳、共享控件、AI 面板与应用背景的动效，并保持导出 PNG 静态输出稳定。
- `v3.8.1`：维护性重构版本，拆分 LyricEditor 职责、整理 AI provider 请求辅助逻辑，并在不改变用户可见行为的前提下同步完成类型检查、回归测试和桌面构建验证。
- `v3.9.0`：设置即时保存与卡片信息改进版本，保持原有六语言范围，并改进手动歌曲信息、专辑名显示与 Windows 发布产物。
- `v3.9.1`：桌面窗口圆角与标题栏修复版本，改用 Windows 原生圆角裁剪，限制背景与标题栏在应用外壳内绘制，并改用红黄绿窗口控制按钮。

旧的 `docs/release-notes-v*.md` 单文件发布说明已迁移到本目录，避免同一版本存在多套入口。

## GitHub Release 正文写法

Release 正文只写简体中文短版。Release 页面不在仓库目录中，不能使用 `./vX.Y.Z.en.md` 这类相对链接。建议使用完整 GitHub 链接。

```md
# Lyrics Card Generator vX.Y.Z

语言：简体中文 · [繁體中文](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.zh-TW.md) · [English](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.en.md) · [Français](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.fr.md) · [日本語](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.ja.md) · [Español](https://github.com/Qrzzzz/lyrics-card-generator/blob/main/docs/releases/vX.Y.Z.es.md)
```

## 内容同步原则

6 个语言版本应保持同一结构和同一信息量。不要让英文版比中文版多信息，也不要让其他语言只剩一句“见中文版”。发布说明面向用户，不要写“给发布者的备注”“Maintainer Note”这类内部说明。

涉及目标语言的功能描述必须本地化。例如 v3.0.0 的歌词翻译功能：中文用户看到的是中文歌词翻译，英文用户看到的是 English lyric translations，法语用户看到的是 traduction française，日本语用户看到的是 日本語の歌詞翻訳，西语用户看到的是 traducción al español。

也就是说，目标译文语言应跟随当前界面语言，不能所有语言版本都写成“生成中文翻译”。

## 工作流程

1. 先构建版本并确认版本号。
2. 复制 `.github/RELEASE_TEMPLATE.md`，填好中文短版 Release 正文。
3. 在 `docs/releases/` 下补齐 6 个语言文件。
4. 创建 Git tag 和 GitHub Release。
5. 添加发布产物。
6. 发布后检查应用内“检查更新”能否正确识别最新版。
