# Lyrics Card Generator v2.0.0 Release Notes

发布日期：2026-06-18

## 核心更新

- 升级为 2.0.0 版本，完成歌词卡片编辑、预览、导出和桌面端能力的一轮集中增强。
- 重构横版卡片布局，使用安全区域统一约束封面、歌词、歌曲信息和底部信息，减少内容挤压、越界和遮挡。
- 竖版自定义尺寸的自动高度改为基于真实 DOM 测量，歌词、翻译、字体、行高、封面和底部信息变化后会重新计算画布高度。
- 歌词区域增加更稳的自适应逻辑，横版歌词在空间不足时会收缩字号，避免长歌词直接溢出卡片。

## 歌词处理

- 新增“拆分外文与中文歌词”操作，现在可以直接按行拆分多语言歌词。
- 拆分逻辑会识别中文翻译行，将中文内容拆入翻译区，英语、日语、韩语等外语歌词保留在原歌词区。
- 新增中文翻译格式化操作，可将逗号类标点转为空格、句号类标点转为换行，便于快速整理翻译文本。
- 歌词与翻译设置同步写入顶层状态和样式状态，避免编辑区与预览区状态不一致。

## 本地音频

- 新增本地 MP3 / FLAC 解析能力。
- 可尝试读取音频内嵌的标题、歌手、专辑、封面和歌词。
- 本地音频仅在当前设备内解析，不上传到第三方，也不会保存到仓库。
- 仅当音频中确实包含内嵌歌词时，才会覆盖当前歌词内容。

## 字体与桌面端

- 桌面版新增 Windows 系统字体选择能力。
- 字体设置入口改为“自定义字体 / Custom Font”文字按钮，位置和排版更直接。
- Web 环境保留字体预设，并在系统字体能力不可用时显示桌面端提示。
- Electron 预加载脚本新增安全的桌面 API：系统字体枚举、字体选择和外部链接打开。

## 导出体验

- 最终步骤保留底部“完成并导出 / Complete & Export”主按钮，用于生成 PNG 并触发完成反馈。
- 优化主按钮视觉。
- 导出步骤改为独立的“导出 PNG / Export PNG”入口。

## 更新检查

- GitHub 更新检查改为通过本地 Next API 路由请求 Releases。
- 返回当前版本、最新版本、下载页，以及安装版 / 便携版资产信息。
- 桌面端可通过安全的外部链接 API 打开下载页。
- 更新检查只负责提示和打开下载页，不会静默下载、安装或替换当前程序。

## 导出与图片兼容性

- 本地封面 `blob:` URL、本地音频封面 `data:` URL、本地文件和 localhost 资源不会再被图片代理处理。
- 远程 HTTP / HTTPS 封面仍继续通过图片代理，以提升 PNG 导出成功率。

## 文档与发布

- README 和英文 README 已同步更新 2.0.0 功能说明。
- 新增 v2 核心逻辑测试脚本 `npm run core:test`。
- 桌面构建产物已输出到 `release` 目录：
  - `Lyrics Card Generator Setup 2.0.0.exe`
  - `Lyrics Card Generator-2.0.0-portable.exe`
  - `Lyrics Card Generator Setup 2.0.0.exe.blockmap`

## 验证结果

本次发布前已运行并通过：

```bash
npm run core:test
npm run typecheck
npm run build
npm run desktop:build
```

`npm run desktop:build` 已覆盖 typecheck、Next build、desktop prepare 和 Electron Builder 打包流程。

## 说明

- 当前 Windows 构建未进行代码签名，安装包和便携版的 Authenticode 状态为 `NotSigned`。
- Windows 可能显示 SmartScreen 提示，这是未签名个人应用的常见现象。
