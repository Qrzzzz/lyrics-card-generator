# 文档索引 / Documentation index

此目录保存长期有效的开发、维护、测试、安全与发布文档。面向普通用户的产品概览保留在根目录 6 份 README；具体版本变更保留在 `docs/releases/`。

This directory contains durable development, maintenance, testing, security, and release documentation. User-facing product summaries stay in the six root READMEs, while version-specific changes stay under `docs/releases/`.

## 开发与维护 / Development and maintenance

- [开发指南（简体中文）](./development.zh-CN.md)
- [Development guide (English)](./development.en.md)
- [Windows desktop maintenance](./desktop.md)
- [桌面自动草稿与恢复约定](./editor-autosave.md)
- [Web Lite browser support](./web-lite-browser-support.md)
- [Dependabot 更新接入与验证](./dependabot.md)
- [示例歌曲维护流程](./examples.md)

## 安全与测试 / Security and testing

- [CI 与发布门禁职责](./testing/ci-gates.md)
- [Dependency advisory policy](./security/dependency-advisory-policy.md)
- [Background composition acceptance contract](./testing/background-composition.md)

## 发布 / Releases

- [多语言发布说明规范与版本索引](./releases/README.md)

新增长期维护文档时，请在此处登记入口。一次性实施计划、审计草稿和发布前验收快照不保留在 `docs/`；需要追溯时使用 Git 历史、PR/Issue 或 Actions/Release 记录。
