# Lyrics Card Generator v2.1.0 Release Notes

发布日期：2026-06-18

## 核心更新

- 升级为 2.1.0 版本。
- 本版本主要是语言支持更新，没有改变卡片生成、解析、预览、导出和桌面端打包流程的核心功能。
- 应用界面语言从 5 种扩展为 6 种：简体中文、繁體中文、English、Français、日本語、Español。

## 语言与文档

- 新增繁体中文界面入口「繁體中文」。
- 新增繁体中文 README：`README.zh-TW.md`。
- 已同步更新简体中文、英文、法语、日语、西班牙语 README 中的语言列表和 2.1.0 下载文件名。
- README 文档徽章更新为 6 Languages。

## 歌词处理

- 繁体中文加入歌词拆分语言范围。
- 当前界面语言为繁体中文时，“拆分原文 / 译文”会按中文译文行逻辑处理，将中文内容拆入翻译区。
- 非汉语语言仍继续使用各自的目标语言判断逻辑，不回退到中文拆分规则。

## 发布产物

桌面构建产物输出到 `release` 目录：

- `Lyrics Card Generator Setup 2.1.0.exe`
- `Lyrics Card Generator-2.1.0-portable.exe`
- `Lyrics Card Generator Setup 2.1.0.exe.blockmap`

## 验证结果

本次发布前已运行并通过：

```bash
npm run core:test
npm run typecheck
npm run build
npm run desktop:build
```

`npm run desktop:build` 会覆盖 typecheck、Next build、desktop prepare 和 Electron Builder 打包流程。

## 说明

- 当前 Windows 构建未进行代码签名，Windows 可能显示 SmartScreen 提示。
- 本版本定位为语言更新版本，除语言、文档、版本号和构建产物外，不包含其他功能变更。
