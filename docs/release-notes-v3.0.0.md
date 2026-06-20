# Lyrics Card Generator v3.0.0 Release Notes

发布日期：2026-06-20

## 版本定位

v3.0.0 引入可配置的 AI 歌词翻译工作流，将语言设置与 AI 配置统一到应用设置中心，同时收敛最终导出交互，移除重复操作并保留完整完成动效。

---

## 新增功能

### AI 歌词翻译

- 支持兼容 OpenAI Chat Completions 协议的服务商，可自定义 Base URL、模型和 API Key
- 提供六种翻译风格：推荐（`recommended`）、歌唱（`lyrical`）、忠实（`faithful`）、口语（`spoken`）、意象（`imagistic`）、克制（`restrained`）
- 根据当前界面语言（简体中文、繁體中文、English、Français、日本語、Español）自动匹配目标译文语种
- 支持流式翻译输出，翻译过程逐字渲染
- 支持 Reasoning 思维链过程展示（可开关）
- 支持请求中途取消与错误反馈
- 翻译入口与歌词编辑区集成，在原文 / 译文行旁直接触发

### 桌面端安全存储

- AI API Key 使用 Electron `safeStorage` 加密后持久化到系统密钥链
- Web 开发预览仅在当前会话保留 Key，不会写入磁盘
- 界面一律不回显完整 API Key，仅显示前后几位的掩码

### 应用设置中心

- 新增设置对话框，集中管理界面语言和 AI 翻译参数
- 语言切换提供即时生效的视觉预览
- AI 设置提供连接测试按钮，可即时验证配置是否正确
- 所有设置说明、按钮、状态提示覆盖六种界面语言

### 导出步骤优化

- 最终步骤只保留一个「完成并导出」主按钮
- 原底部完成按钮的主题色渐变、扫光动画、阴影和完成彩屑效果完整迁移至导出面板
- 按钮尺寸压缩到标准操作高度，不再撑满整个步骤区域
- 最后一步导航区域内容自适应收缩，移除异常的大量空白

---

## 文件变更

### 新增文件

| 路径 | 说明 |
|------|------|
| `app/api/ai/translate/route.ts` | AI 翻译 Next.js API 路由（POST），处理流式翻译请求 |
| `lib/ai/types.ts` | AI 翻译相关 TypeScript 类型定义 |
| `lib/ai/client.ts` | OpenAI 协议客户端封装，含配置校验与请求逻辑 |
| `lib/ai/prompt.ts` | 六种翻译风格的系统提示词（prompt）模板 |
| `lib/ai/styles.ts` | 翻译风格元数据（名称、图标、描述）的六语言本地化 |
| `lib/ai/ui-copy.ts` | AI 面板、设置、按钮、错误提示的六语言界面文案 |
| `lib/ai/clean.ts` | 翻译结果清洗工具，去除模型可能输出的 markdown 和说明文字 |
| `lib/contrast-color.ts` | 颜色对比度计算工具 |
| `components/settings/SettingsDialog.tsx` | 设置中心弹窗（语言 + AI 配置） |
| `components/settings/LanguageSettingsSection.tsx` | 语言设置面板 |
| `components/settings/AiSettingsSection.tsx` | AI 设置面板（Base URL、模型、Key、风格、Reasoning） |
| `components/lyrics/AiTranslatePanel.tsx` | AI 翻译交互面板（按钮、风格选择、流式输出、Reasoning 展示） |
| `components/lyrics/AiTranslateButton.tsx` | AI 翻译触发按钮（带加载动画） |
| `components/lyrics/TranslationFieldBorder.tsx` | AI 翻译字段的发光边框指示器 |
| `docs/release-notes-v3.0.0.md` | 本发布说明 |

### 修改文件

| 路径 | 变更量 | 说明 |
|------|--------|------|
| `electron/main.js` | +321 行 | 新增 AI 翻译 HTTP 代理 IPC 通道、safeStorage API Key 持久化、AI 设置读写接口 |
| `electron/preload.js` | +12 行 | 暴露 AI 翻译和 safeStorage 相关 IPC 方法到渲染进程 |
| `lib/desktop-api.ts` | +13 行 | 新增桌面端 AI API Key 存取方法和翻译代理调用 |
| `app/globals.css` | +216 行 | 新增 AI 翻译面板、设置对话框、翻译字段边框等样式 |
| `components/editor/LyricEditor.tsx` | +182 行 | 集成 AI 翻译按钮与面板，优化歌词行交互 |
| `components/editor/LyricInput.tsx` | +34 行 | 新增 AI 翻译提示入口 |
| `components/editor/EditorHeader.tsx` | -116 行 | 移除内联设置，改为调用设置中心弹窗 |
| `components/editor/SettingsStepper.tsx` | -105 行 | 精简步骤导航，移除大面积留白 |
| `components/editor/ExportPanel.tsx` | ±30 行 | 完成按钮动效迁移，按钮尺寸标准化 |
| `components/ui/StarBorder.tsx` | +3 行 | 动效参数微调 |
| `scripts/test-v2-core.ts` | +84 行 | 新增 AI 翻译提示词输出规则验证测试 |
| `package.json` | ±2 行 | 版本号 2.1.0 → 3.0.0 |

---

## 发布产物

Windows 桌面构建输出到 `release/` 目录：

- `Lyrics Card Generator Setup 3.0.0.exe`（约 153 MB）— 安装版
- `Lyrics Card Generator-3.0.0-portable.exe`（约 152 MB）— 便携版
- `Lyrics Card Generator Setup 3.0.0.exe.blockmap` — 增量更新校验文件

---

## 验证清单

```bash
npm run typecheck       # TypeScript 类型检查
npm run core:test       # 3.0 核心函数测试（含 AI 翻译提示词规则）
npm run build           # Next.js 生产构建
npm run desktop:build   # Windows 安装版与便携版构建
```

手动验证项：

- [ ] 最终导出步骤只有一个「完成并导出」主按钮
- [ ] 完成后彩屑动效正常触发
- [ ] 设置中心可切换语言并即时生效
- [ ] AI 设置可配置并连接测试
- [ ] 翻译流式输出正常、Reasoning 可展开/折叠
- [ ] 取消请求可终止进行中的翻译
- [ ] 桌面版 API Key 关闭后重新打开仍然可用

---

## 注意事项

- 当前 Windows 构建未进行代码签名，Windows 可能显示 SmartScreen 安全提示
- v3.0.0 不内置任何第三方 AI API 额度或密钥，用户需自行准备兼容 OpenAI 协议的服务商
- AI 翻译功能仅桌面版支持 API Key 持久化存储（safeStorage），Web 预览环境仅会话内有效
- 翻译质量、速度、费用和速率限制取决于所选服务商，与本项目无关
- 从 v2.x 升级至此版本，API Key 等 AI 设置需重新配置
