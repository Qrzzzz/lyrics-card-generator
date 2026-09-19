# v6.5.4 设置分组与作者赞赏验收

状态：本地开发候选，尚未发布。基于工作区 v6.5.2，按需求将候选版本设为 v6.5.4。

## 行为

- 通用页将恢复应用偏好放在独立的重置分组；非桌面环境不显示空的历史分组。重置范围和原有确认流程不变。
- 外观页以主题与材质、主题色、界面字体、交互效果分组；继续即时保存原有字段。
- 关于页新增“支持作者”入口，详情路由为 `{ section: "about", path: ["support"] }`，参与面包屑和访问历史。
- 只提供 USDT · TRON（TRC20）与 USDT · X Layer（USDT0）。公开收款地址保存在 `electron/support-addresses.json`，供 UI、二维码生成和桌面复制边界共用。
- 二维码只编码收款地址。页面明确提示在钱包核对资产及网络，不接入钱包、金额、交易监听或支付成功状态。
- 桌面浏览器权限仍全部拒绝。新增受现有可信发送者校验保护的 IPC，只接受 `tron` / `xlayer`，在主进程查表写入固定地址，拒绝任意文本。浏览器环境使用标准剪贴板接口。
- 复制异常显示手动复制提示。切换网络或离开页面使旧复制请求的反馈失效。

## 本地验证

- `npm run typecheck`、`npm run lint`、`npm run core:test`、`npm run stability:test`、`npm run electron-runtime:test` 通过。
- `npm run support:test` 通过：固定地址核对、非法复制参数不写入剪贴板、主进程复制失败传播、两个实际 SVG 分别以 192 / 384 px 独立解码、六语言面包屑和非法路由回退。
- `npm run web-lite:build`、`npm run web-lite:check` 通过，生成文件版本同步。
- `npm run desktop:pack` 通过，新增主进程文件与 JSON 已加入打包清单。
- `npm run desktop:support-test` 在打包后的 Windows 程序通过：两个真实系统剪贴板写入、失败及过期回调、前进后退与面包屑、六语言、浅色/深色、1000 / 1280 px 窗口、严重及关键无障碍问题检查、单一顶层窗口。测试会保留并恢复原剪贴板内容。
- `node scripts/test-desktop-settings-interactions.mjs` 在打包程序通过原有完整交互回归，包括设置重置确认、主题及字体、AI 设置、工作台导航与尺寸切换等场景。
- `node scripts/test-static-asset-equivalence.cjs --packaged`、`node scripts/test-packaged-runtime-manifest.cjs --unpacked-only`、`npm run font-license:test` 通过。未构建 NSIS 安装包，默认 manifest 检查所要求的 `app-update.yml` / `elevate.exe` 不属于 `--dir` 产物，因此使用仓库现有的 `--unpacked-only` 校验模式。
- 截图：`output/playwright/v6.5.4/`。日志：`output/v654-*.log`。

以上为本地软件行为验证，没有进行真实链上转账，也不是远端 CI 或 Release 发布证据。

## 资源与文案

六语言界面、六份候选发布说明、六份 README、版本索引及 package / lockfile 已同步。SVG 来源和许可证随应用提供，见 `public/support/SOURCES.txt`。二维码通过 `npm run support:generate-qr` 重新生成；地址变更后必须重新生成并运行解码检查。

X Layer 的 USDT0 标注依据：

- https://usdt0.to/ecosystem/x-layer
- https://www.okx.com/en-gb/help/usdt0-faq

本轮保留已有的 `.github/RELEASE_TEMPLATE.md` 和版本索引写作规范改动，仅在索引中增加本候选条目。未创建提交、推送或发布。
