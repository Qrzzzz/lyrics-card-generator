# v6.3.2 设置布局：实现与验收

2026-09-13；6.3.2 发布验证记录。设计依据见 [审计与方案](../v6.3.2-settings-layout-audit-plan.md)。

## 实现约定

第 3～5 步使用 `components/editor/style-panel/SettingsLayout.tsx` 的 Layout、Group、Grid、Field、Toggle 组件。原先 rows／pairs／toggles 三类网格已退役；其他页面的 SettingRow 保持原有布局。

唯一列数规则位于 `app/globals.css` 的 `.editor-settings-grid`：最小列宽 15.5rem，间距 0.75rem，最多三列。采用 CSS Grid 的 auto-fill 与 min/max 直接表达方案公式，不再维护额外的容器断点或 JS 列数状态。末行保留列宽，DOM 顺序和字段实例不随重排改变。

字段标题、当前值、控件、说明各自有固定位置。字段组件将可访问名称和说明关联到实际控件，避免出现重复命名的外层 group。开关与条件字段共占一个单元；背景密度、分享者、自定义尺寸和横版参数的状态规则保持原样。

桌面字体方案入口使用同一网格，自定义编辑器仍为完整工作区。分类使用共享网格，操作按钮可换行，字体名称完整换行、字体示例可截断。预设选中标记和字体选中指示器改用主题变量。Web Lite 保留四种字体选项，采用同一网格；不增加桌面专用字体能力。

## 已完成的自动验证

| 检查 | 证据与范围 |
| --- | --- |
| 核心回归 | `npm run core:test` 通过；包含布局、自动尺寸、字体、分隔符、状态和版本一致性等现有检查 |
| 类型与静态检查 | `npm run typecheck`、`npm run lint` 通过 |
| 组件浏览器验收 | `settings-layout.spec.ts` 的 5 项测试通过 |
| Web Lite 回归 | `settings-responsive.spec.ts` 与相关 smoke 共 7 项测试通过；包含 axe、字体与语言持久化、纯音乐／双语／横竖版切换及自动宽度 |
| 生成文件 | `npm run web-lite:build` 后 `npm run web-lite:check` 通过 |
| Windows 构建 | `npm run desktop:pack` 生成 6.3.2 的 `release/win-unpacked` 应用 |
| 原生 Windows 回归 | `node scripts/test-desktop-settings-interactions.mjs` 通过；在独立测试用户目录中验证字体草稿、主题、窗口尺寸、拖拽、预览与导出等完整流程 |

组件测试对六种语言、三个步骤分别扫描 280～1100px 内容宽度（每 8px，并补 508／768px 阈值及两侧 1px）。核对列数、顺序、重叠和横向溢出；另覆盖 100%／125%／150%／200% 根字号、四种主题、法语窄屏字体编辑器、草稿应用／取消、焦点与值的保持。主题检查包含普通深浅色、深浅亚克力的 CSS 表现与 axe 严重／关键问题检查。

完整 Web Lite 页面覆盖 320×568、375×667、768×1024、1000×700、1023×768、1024×768、1280×720、1440×900、1920×1080、2560×1440，以及允许的最小／中间／最大分割比例。连续拖动往返不改变设置值或导出卡片宽高。

## 视觉对照

使用 HEAD `59e60b3` 的原组件及 CSS 构建基线；候选使用当前组件。截图通过真实 Chromium 渲染取得，截图与度量保存在 `output/playwright/v6.3.2/`。测试辅助页不接触用户保存的数据，也不会替代应用内的真实工作区测试。

以下为简中、相同条件设置下的面板高度，单位 px：

| 步骤 | 内容宽度 | 基线 | 6.3.2 |
| --- | --- | --- | --- |
| 布局 | 640 | 955 | 668 |
| 布局 | 960 | 691 | 566 |
| 字体 | 640 | 530.5 | 470 |
| 字体 | 960 | 530.5 | 345 |
| 外观 | 640 | 677 | 539 |
| 外观 | 960 | 619 | 483 |

440px 下统一为单列。样本中布局高度由 1039px 变为 1074px，外观由 693px 变为 837px；这是保留完整文案、44px 操作区及单列阅读顺序的取舍，不声称每一种宽度都减少高度。字体在此宽度由 566.5px 降为 516.5px。

原生截图保存在 `playwright-report/desktop/step-three-expanded.png`、`step-five-expanded.png` 与 `inline-font-picker-with-sample-card.png`；已复核扩展三列和字体编辑布局。测试歌曲、网络响应及用户目录为隔离测试数据。原生套件的旧“两列”断言已更新为第 3、5 步在相同扩展宽度下使用同一列数规则。

## 复现

```powershell
npm run typecheck
npm run lint
npm run core:test
npm run web-lite:build
npm run web-lite:check
npx playwright test --config=playwright.deferred-surfaces.config.ts settings-layout
npx playwright test --config=playwright.web-lite.config.ts settings-responsive
npm run desktop:pack
node scripts/test-desktop-settings-interactions.mjs
```

基线截图可在 HEAD 仍是审计基线时，设置 `SETTINGS_LAYOUT_BASELINE=1` 后执行组件套件的 `comparison screenshots` 用例，再清除此环境变量。不要在提交后的新 HEAD 上将该输出误当成 6.3.1 基线。

## 验收边界

Windows 原生回归已通过。浏览器根字号变化覆盖文本增大，不等同于更改 Windows 系统显示缩放；本轮不将后者或任意壁纸下的原生 Acrylic 合成效果列为已完成验证。正式 Setup 的构建、安装回归、SBOM、摘要和公开发布由 Release 工作流验证；远程发布状态以 GitHub Release 为准。

## 发布前清理

本地最终验证日志、基线／候选截图及原生截图共 66 项已归档到仓库外的发布证据目录。`.next`、`dist-desktop`、本地打包目录、测试结果与 TypeScript 增量缓存已移入回收站。旧版测试目录的 5 个 `.asar` 以及部分日志、截图／报告仍保留：前者清理遇到路径或权限限制，后续清理操作被自动审批策略阻止。这些文件不纳入版本提交或发布。正式发布证据另由 GitHub Actions 保存。
