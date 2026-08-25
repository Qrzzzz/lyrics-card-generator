# 示例歌曲维护流程

[文档索引](./README.md) · [开发指南](./development.zh-CN.md)

示例歌曲界面的配色来自真实专辑封面。封面只在开发期临时下载并参与本地取色；仓库保存歌曲文字数据与提取后的颜色，不保存或分发真实专辑封面，也不生成中间歌词卡图片。

## 数据位置与职责

- `lib/examples.ts`：歌曲、歌手、专辑、原语言歌词、各界面语言翻译及 `palette` 元数据。
- `scripts/generate-example-palettes.ts`：解析歌曲来源、临时取得封面并同步颜色。
- `app/example-palette-generator/`：仅开发环境可用的调色板提取页面。
- `components/editor/ExamplesFloor.tsx`：示例层的展示、键盘交互与导入行为。
- `tmp/example-covers/`：生成脚本按需创建的临时输入目录，不是分发资源。

## 新增或更新示例

1. 在 `lib/examples.ts` 填写真实歌曲、歌手、专辑、来源链接、原语言歌词与所需翻译。
2. 确认每种界面语言都能得到预期的原文/译文组合，且曲名、歌手和专辑不是占位文本。
3. 运行：

   ```bash
   npm run examples:generate-palettes
   ```

4. 脚本将封面临时写入 `tmp/example-covers/`，通过开发专用页面提取 2 至 6 个颜色，并更新 `lib/examples.ts` 的 `palette.colors`。
5. 审阅差异，确认只提交预期的文字与颜色元数据，没有封面文件或临时目录。
6. 运行：

   ```bash
   npx tsx scripts/test-examples.ts
   npm run core:test
   ```

7. 在桌面版和 Web Lite 检查卡片明暗文字、键盘焦点、整卡导入以及多语言翻译切换。若共享 UI 有改动，再执行 `npm run web-lite:build` 与 `npm run web-lite:check`。

## 呈现与交互契约

- `ExamplesFloor` 使用 `palette.colors` 生成整张竖版卡片的连续背景，不显示封面、模拟内容或显式色条。
- 卡片文字复用界面的明暗对比度算法；浅色背景使用深色文字，深色背景使用浅色文字。
- 整张卡片是唯一导入控件；底部“载入示例”只提供视觉导向，不嵌套第二个按钮。
- 鼠标点击卡片任意位置，以及键盘聚焦后按 Enter 或 Space，必须触发同一导入事务。
- 示例层不得在运行时请求远程封面；离线状态使用已提交的颜色元数据。

## 提交约束

- 不得提交真实专辑封面，不得将其放入 `public/`、README 资源或桌面安装包。
- `palette.extractedFrom` 必须为 `album-cover`，不得从歌词卡、截图或人工色条二次取色。
- `palette.colors` 只能包含合法十六进制颜色，数量为 2 至 6 个。
- 每首示例必须包含可离线显示的真实 `album` 字段，以及完整、可本地化的歌词数据。
- 生成脚本涉及真实网络；网络失败不得以手工猜色替代，应保留原数据并稍后重试。
