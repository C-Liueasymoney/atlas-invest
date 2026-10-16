# 实施状态

以各阶段实际命令输出为准；不把本地 build 视为 GitHub CI 成功。

## Milestone 0 — 进行中
初始化工程、规范化数据库、元数据 catalog、Next.js shell、Python 包、CI。
环境暂缺 Docker/PostgreSQL，使用嵌入式 PostgreSQL 兼容引擎验证迁移；尚未验证外部 PostgreSQL 服务。

## 后续阶段
1. Provider 配置中心与真实采集。
2. 可编辑看板。
3. 预警、导入、派生指标。
4. P1 扩展研究；未完成不能声称全规格完成。

### M0 验证记录（2026-10-16）
- Next.js 16.4.2 / React 19.3.1 / Lightweight Charts 5.2.1，精确锁定 npm lockfile。
- lint、TypeScript strict、Vitest 2 项（PostgreSQL 迁移幂等/精度/约束与指标身份）、production build 均通过。
- 本机 Homebrew Python 3.14 的 pyexpat 动态链接错误导致 ensurepip 失败；改用 Codex bundled Python 验证，系统 Python 未修改。
- npm runtime audit 无高危；开发期 Next ESLint 的 braces 依赖链有 5 项高危报告，上游无兼容修复，不使用 force 降级框架，列为已知限制。
- 初始迁移纯新增。回滚：停止应用，备份数据库后再删除专用 schema/database；不要依赖 git revert 删除业务数据。
- 首个阶段提交和推送结果见后续阶段日志及 git history。
