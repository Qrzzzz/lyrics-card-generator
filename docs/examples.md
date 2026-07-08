# 示例歌曲维护流程

示例歌曲的界面预览必须复用主歌词卡片链路生成，不维护另一套卡片绘制逻辑。

## 流程

1. 在 `lib/examples.ts` 新增歌曲信息、原语言歌词和各语言翻译。
2. 运行 `npm run examples:generate-previews`，脚本会读取示例歌曲、下载封面、提取调色盘并生成本地预览图。
3. 真实专辑封面只允许临时保存在 `tmp/example-covers/`。
4. `tmp/example-covers/` 必须保留在 `.gitignore` 中，不能被提交。
5. 生成时允许读取真实封面进行取色。
6. 渲染预览时必须使用现有 `LyricCard`，并让 `PaletteBackground` 使用封面提取出的调色盘。
7. 生成预览图时必须关闭封面展示，即 `showCover=false`。
8. 最终只提交 `public/examples/generated/` 下由 `LyricCard` 渲染出来的预览图。
9. 示例歌曲界面只使用同步后的 `preview.colors` 作为单张示例卡片的整体彩色遮罩，不在运行时请求远程封面或重新取色。

## 约束

- 不得提交真实专辑封面。
- 不得把真实专辑封面放入 `public/`。
- 不得把真实专辑封面打包进桌面应用。
- `lib/examples.ts` 中的 `preview.image` 只能指向 `/examples/generated/` 下的本地生成资源。
- `preview.colors` 由生成脚本同步，来自封面调色盘的前 2 到 3 个颜色。
- `ExamplesFloor` 应将 `preview.colors` 覆盖到整张示例卡片上，而不是在卡片左侧直接渲染封面或预览图。
