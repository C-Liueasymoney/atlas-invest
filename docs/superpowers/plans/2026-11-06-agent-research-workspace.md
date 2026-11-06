# 跨端持仓研究工作台 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task.

**Goal:** 网站复制研究任务，外部 Codex/Work 分析后通过授权 MCP 自动写回。
**Architecture:** 独立 owner 研究状态保存真实持仓、决策和固定任务快照；官方 MCP SDK 暴露三个工具；OAuth 与浏览器登录分别验证。
**Tech Stack:** Next.js / TypeScript / PostgreSQL / Zod / MCP TypeScript SDK / Express。
**Spec:** docs/superpowers/specs/2026-11-06-agent-research-workspace-design.md

## Global Constraints
- 网站不调用模型 API；提示词没有密码或长期密钥。
- 原始决策保留、复盘追加；固定快照、来源及数据截至日期必须展示。
- 所有写回通过 owner 和任务校验；幂等、冲突、过期、撤销必须验证。
- 新代码基于已 fetch 并合并的 origin/codex/atlas-v1；不推送或部署未验证代码。

## Review Focus
- 网络断线重试不得重复保存；并发提交只有一个结果。
- 快照变更不得冒充当前结论。
- OAuth 错误客户端、资源、scope、过期与 PKCE 必须拒绝。
- 外部链接、用户内容只能安全展示；普通 Cookie API 跨站规则继续生效。
- 多进程持久化与真实数据库迁移必须有验证证据。

### Task 1: 持仓、决策、研究任务与网站
- [ ] 创建 lib/investment/{model,store,service,api}.ts、数据库迁移、投资研究页面并接入导航。
- [ ] 服务导出 researchToolDefinitions（name/description/inputSchema）与 runResearchTool(name,args)，供远程层调用。
- [ ] 测试固定快照、上下文变更、幂等冲突、过期撤销、并发、来源校验、原决策保留。
- [ ] 实现三个模块任务模板、复制失败全文回退、结果显示、恢复导入。

### Task 2: MCP 与 OAuth
- [ ] 使用 SDK HTTP transport 和 OAuth router，实现 owner 授权、持久客户端/授权码/令牌、PKCE、scope/resource 校验。
- [ ] 新增独立远程服务启动脚本、systemd 与反向代理示例，服务复用 Task 1 业务函数。
- [ ] 用 SDK 客户端验证 initialize/list/call，验证 OAuth 错误情况及重启持久化。

### Task 3: 联调、接入及验收
- [ ] 运行类型、lint、相关测试、完整测试和生产构建；验证可运行页面与实际 MCP 往返。
- [ ] 尝试现有工具能完成的私人插件接入；外部账户授权无法代办时准确记录。
- [ ] 独立审查整体改动，修正问题并完成中文验收与使用文档。

## Progress
- 2026-11-06 GitHub fetch 成功；远端无新增，本地设计提交领先一个；已建立 codex/agent-research-workspace。
- Ruling: 用户已批准设计并要求实现，直接执行，不重复请求计划批准。

- Task1 completed: holdings/decisions/tasks/results/UI; 15 investment tests including real PostgreSQL.
- Task2 completed: official SDK MCP+OAuth; protocol tests and PostgreSQL replay revocation passed.
- Final review: reported P2 fixed with regression tests and scoped re-review clean.
- Full suite: 136 passed, 3 skipped; lint/typecheck/build passed.
- Deployment: user provided Aliyun console; IAB Workbench connected; source release transfer next.
