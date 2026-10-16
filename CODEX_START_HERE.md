# 发给 Codex 的第一条消息

请首先读取同目录下的 `INVESTMENT_RESEARCH_PLATFORM_SPEC.md`，然后**直接开始实施开发**，不要再次只给概念方案或等待选择框架。

严格遵循规格第0节、第6.10节（API配置中心）、第13节。优先确保第一版的端到端真实功能：

1. 优先实现 `/settings/data-sources` API配置中心：一个Provider凭据复用多个指标、连接测试、符号搜索、数据源路由、限额缓存、故障回退；接口详情按规格6.10。
2. Next.js/React/TypeScript 界面与可编辑 Dashboard、TradingView Lightweight Charts 风格的 K 线/折线图。
3. PostgreSQL 规范化存储与数据库迁移。
4. Python 数据采集 Adapter：AKShare 上金所 Au99.99 历史日线，FRED DFII10/DGS10，Frankfurter USD/CNY，Gold API XAU/USD 最新报价。
5. Next.js API 统一数据读取、来源/时间/数据时效状态。
6. 自选指标、Widget 保存、基础预警及站内触发历史。
7. `.env.example`、`README.md`、API配置/部署/授权文档、测试与CI。


## 每阶段强制 Git 提交与 GitHub 推送（P0）

**每完成一个 Milestone（0、1、2、3、4），必须分别形成一个可识别、可回滚的 Git 提交，并推送到配置好的 GitHub 远程分支；不得将所有阶段积攒成一次大提交。** 操作顺序：

1. 检查 `git status`、当前分支与 `git remote -v`，确认在正确仓库和用户指定的工作分支上；尊重已有提交和未提交修改，不得擅自清理或覆盖。
2. 完成本阶段功能，运行可用的 lint、typecheck、test、build；必须修复失败，若存在环境阻塞则在状态文档中如实标注，不得声称验证通过。
3. 更新 `docs/IMPLEMENTATION_STATUS.md`：记录完成内容、涉及模块、数据库迁移、测试结果、已知限制和回滚注意事项。
4. 用 `git diff --check`、`git diff --stat` 检查变更，**仅暂存本阶段相关文件**；禁止提交 `.env`、API Key、Token、私钥、密码、缓存、数据库备份等敏感或生成物。
5. 创建有意义的提交信息，采用 `feat(scope): 描述` / `fix(scope): 描述` / `chore(scope): 描述` 格式，提交主题须说明实际完成的工作，不允许只写 `update`、`changes` 或 `milestone done`。提交正文列出主要修改、验证结果、迁移和潜在回滚影响。
6. 执行 `git push -u origin <当前分支>`（后续可 `git push`），确认推送成功，并记录 commit SHA、分支、远程地址和推送结果，再开始下一 Milestone。
7. 若 `origin` 未配置、缺少 GitHub 授权、远端保护规则拒绝推送、网络故障等：**保留本地 commit，明确报告阻塞及需要用户完成的步骤**，不得伪称已推送，不得自行创建未经许可的远程仓库、不得强制推送；继续开发时仍需保持分阶段独立 commit。

推荐提交示例：

```text
chore(scaffold): initialize monorepo and CI for milestone 0
feat(data): add normalized gold and macro pipelines for milestone 1
feat(dashboard): implement customizable widgets for milestone 2
feat(alerts): add rules and provider management for milestone 3
feat(research): add ETF imports and research notes for milestone 4
```

**安全与回滚：** 禁止 `git push --force`、重写共享历史、对未知用户变更使用 `git reset --hard`。若阶段包含破坏性数据库迁移，需提供迁移/回退说明，且不能仅依赖 `git revert` 恢复数据库。每阶段总结必须单独展示该阶段 commit SHA、commit subject、GitHub push 状态及检查结果。

**开发要求：** 先检查仓库，如为空仓库按规格初始化；真实数据只能来自经过核实的上游接口；缺 Key 则使用带有清晰 DEMO 标签的体验模式，严禁伪造正式价格。避免将不同品种混作同一指标；不把免费日级行情误标为盘中实时。使用模块化 Provider / Indicator / Widget 注册机制，让我将来增加纳斯达克100、股票、基金和更多分析模块时成本低。每完成一个阶段执行 lint、typecheck、test、build，修复错误并更新 `docs/IMPLEMENTATION_STATUS.md`。如不能一次做完全部内容，应先交付可运行且可验证的 V1 核心闭环。

完成后请告诉我准确的启动命令、哪些数据源需要 API Key、如何验证最新 Au99.99 数据、尚未实现的功能和下一步改进计划。
