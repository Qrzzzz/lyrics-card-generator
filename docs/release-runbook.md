# 标准发布入口

后续常规发布统一使用 `scripts/release.ps1`。已有 `release.yml` 继续负责
构建、安装测试、附件下载核验和公开发布；入口不降低现有门禁，也不在本地
重复下载安装包。模型只处理准备工作、失败诊断和最终结果汇报。

## 使用方式

在发布分支完成版本、六语言发布说明和相关修改并提交后执行：

```powershell
.\scripts\release.ps1 -Version 6.5.6 -CheckOnly
.\scripts\release.ps1 -Version 6.5.6 -Publish
# 终端中断或修复远端失败后，从原来的分支和提交恢复
.\scripts\release.ps1 -Version 6.5.6 -Resume
```

版本只是示例，应替换为实际版本。RC 使用 `6.5.6-rc.1`，包版本仍为
`6.5.6`。需要 Node.js、已安装的项目依赖、Git、已登录且具有发布权限的
GitHub CLI，以及 PowerShell。也可跨平台执行：

```text
node scripts/release-cli.mjs --version 6.5.6 --mode check
node scripts/release-cli.mjs --version 6.5.6 --mode publish
node scripts/release-cli.mjs --version 6.5.6 --mode resume
```

`CheckOnly` 默认启用，只检查版本、说明一致性、仓库配置及工作区，读取
GitHub 仓库信息，不推送、不创建 PR、不打标签。工作区不干净时退出码为 1，
明确列为阻塞；它不代表 CI 已通过或源码发布授权已通过。

`Publish` 表示授权完整的远端发布链：推送已准备的当前分支，创建或复用
PR，等待策略要求的检查，按精确 head SHA squash 合并，等待合并提交的
main CI，创建并推送 annotated tag，等待 Release 工作流，核对公开状态、
精确标签提交及四个附件的名称、大小、上传状态和 API SHA-256 摘要。
从 main 启动时，HEAD 必须已经对应唯一的已合并 PR。

不自动提交、不强推、不移动已有标签、不绕过审批或分支保护、不自动修复
测试，也不自动重跑失败工作流。新版本准备和代码审查仍是发布前工作。
Pages 有独立工作流；本入口确认桌面 Release，不声称已验证 Pages 部署。

## 等待、恢复与异常

- 每 60 秒查一次远端状态，阶段开始时输出提示，不持续打印完整日志。
  默认单次运行最多等待 90 分钟，可用 `-TimeoutMinutes 120` 调整；
  外部命令另有两分钟超时。超时不会撤销已完成的远端动作。
- 状态保存在 `git rev-parse --git-path release-state` 指向的 Git 元数据
  目录，按版本记录原始提交、分支、PR、合并提交、CI/Release run ID 和
  attempt、Release ID、附件摘要。该目录不进入提交。
- `Resume` 仍允许执行尚未完成的推送、合并、打标签步骤，属于发布授权。
  必须保留原始 checkout、提交及本地状态文件。它重新读取远端证据，不把
  本地完成标记当成跳过安全检查的依据。
- 失败时先查看输出中的 PR 或 run，读取对应失败步骤日志。修复需要更改
  源码时应走新的提交/发布准备流程，不修改旧状态文件去伪造匹配。
  远端瞬态失败可明确重跑原工作流，再 `Resume`。
- 标签推送后没有可见 Release run 时只等待和超时报错，避免重复构建。
  检查 Actions 后可显式执行
  `gh workflow run release.yml --ref v版本号 -f tag=v版本号`，
  再恢复；已经存在的标签不会重新创建或移动。
- 同版本并发执行由本地锁阻止。进程被强制终止留下锁时，确认没有运行中的
  发布进程后才删除错误消息指出的 `.lock` 文件，保留 `.json` 状态。

完整回归由 CI 执行，最终安装包验证由 Release 工作流执行。只有同一提交、
同一环境、相同检查契约的成功证据才能复用；PR 的 CI 不能替代 main 的
合并提交 CI。日志和状态只保存必要证据，不保存 GitHub token。
