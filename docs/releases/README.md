# 多语言发布说明规范

Lyrics Card Generator 面向国内用户，GitHub Release 页面默认使用简体中文。其他语言不直接堆在 Release 正文里，而是放在 `docs/releases/` 目录下，用链接跳转。

这样做的目的很简单：Release 页面保持短、清楚、适合下载；完整说明保留 6 种语言，方便不同用户阅读。

## 语言文件命名

每个正式版本使用同一个版本号，分别维护 6 个 Markdown 文件：

```text
docs/releases/vX.Y.Z.zh-CN.md
docs/releases/vX.Y.Z.zh-TW.md
docs/releases/vX.Y.Z.en.md
docs/releases/vX.Y.Z.fr.md
docs/releases/vX.Y.Z.ja.md
docs/releases/vX.Y.Z.es.md
```

当前项目界面支持的语言是：

- 简体中文
- 繁體中文
- English
- Français
- 日本語
- Español

## GitHub Release 正文写法

Release 正文只写简体中文短版，推荐结构如下：

```md
# Lyrics Card Generator vX.Y.Z

## 语言 / Languages

完整发布说明：

- [简体中文](./docs/releases/vX.Y.Z.zh-CN.md)
- [繁體中文](./docs/releases/vX.Y.Z.zh-TW.md)
- [English](./docs/releases/vX.Y.Z.en.md)
- [Français](./docs/releases/vX.Y.Z.fr.md)
- [日本語](./docs/releases/vX.Y.Z.ja.md)
- [Español](./docs/releases/vX.Y.Z.es.md)

## 推荐下载

- 安装版：`Lyrics Card Generator Setup X.Y.Z.exe`
- 便携版：`Lyrics Card Generator-X.Y.Z-portable.exe`

## 本次更新

- 新增：...
- 改进：...
- 修复：...

## 升级注意事项

...
```

如果某次更新很小，也可以只在 Release 正文里写 3 到 5 条重点，把完整内容放进语言文件。

## 内容同步原则

6 个语言版本应保持同一结构和同一信息量。推荐顺序：

1. 下载与安装
2. 本次更新
3. 升级注意事项
4. 已知限制
5. 完整变更记录

不要让英文版比中文版多信息，也不要让其他语言只剩一句“见中文版”。

## 自动生成 Release Notes

仓库已提供 `.github/release.yml`。在 GitHub 创建 Release 时，可以使用自动生成 Release Notes，再把生成内容整理进中文短版和各语言文件。

标签建议：

- `feature` / `enhancement`：新增功能
- `bug` / `fix`：修复
- `ui` / `ux` / `design`：界面体验
- `i18n` / `localization` / `docs`：多语言和文档
- `build` / `ci` / `chore` / `refactor`：构建与维护
- `breaking-change`：破坏性变更
- `ignore-for-release` / `no-release-note`：不进入发布说明

## 工作流程

1. 先构建版本并确认版本号。
2. 复制 `.github/RELEASE_TEMPLATE.md`，填好中文短版 Release 正文。
3. 在 `docs/releases/` 下补齐 6 个语言文件。
4. 创建 Git tag 和 GitHub Release。
5. 上传安装版和便携版资产。
6. 发布后检查应用内“检查更新”能否正确识别最新版。
