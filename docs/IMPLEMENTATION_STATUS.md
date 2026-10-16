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

## GitHub 推送阻塞
M0 `5b1bdf4` — `chore(scaffold): initialize Atlas monorepo, normalized schema and CI`。
分支 `codex/atlas-v1`，origin `https://github.com/C-Liueasymoney/atlas-invest.git`。
`git push -u origin codex/atlas-v1` 失败：macOS credential helper `failed to get: -60008` / `could not read Username ... Device not configured`。
没有创建远程仓库、没有强推。本地阶段提交保留。需在本机登录 GitHub（Git credential manager / GitHub CLI）后重新执行同一 push 命令。
M0 Python pytest 在提交时未安装，之后已由独立 venv 完成，M1 全套 PostgreSQL 测试19项通过；M0 不宣称当时 Python 测试已通过。

## Milestone 1 — 数据闭环
- Provider Registry、环境变量/加密凭据、真实样本探测、符号搜索、逐项能力记录、规范路由、预算/TTL/请求去重/熔断、安全配置导入导出、owner鉴权与审计API。
- 标准行情/历史/比较API，Decimal人民币金价折算，统计日/抓取日、来源和陈旧状态分开。Demo独立fixture/偏好库，无隐式假价回退。
- Python AKShare SGE日线/报价、FRED通用序列、Frankfurter v2、Gold API；事务upsert、历史修订、重试/锁/采集日志。0001迁移，无破坏性变更。
- 临时真实PostgreSQL: 三年 Au99.99 729 根日K；2026-10-16收盘901.57 CNY/g。重复同步0新增0修订。Frankfurter16个观测、Gold API最新报价成功写入，重复报价命中缓存。数值仅为当次采集证据，不是固定seed。
- 19项Python测试（含真实PostgreSQL）通过；Web16项测试、lint、strict typecheck、production build通过。外部FRED缺Key，未宣称两条真实FRED请求验收通过。
- 已知限制：SGE最新报价返回未来交易日时间标签而拒绝；AV只验证search，其他综合行情endpoint未完成；路由当前严格限于已注册/核实映射，历史来源切换显示分段而不拼接。无兼容备源时保留旧值。

M1 commit `4242b13` — `feat(data): add secure provider control and normalized gold data pipelines`；GitHub重试失败（HTTPS无凭据，terminal prompts disabled），本地保留。

## Milestone 2 — 可定制看板
- 中文深浅主题、移动侧栏、全局搜索、黄金概览、指标详情/收藏/排序、标准化与百分比比较。
- 五类Zod校验Widget注册表、真实拖拽/调整大小、增删/保存/恢复布局；Lightweight Charts v5 日K/折线、时间范围、来源/更新时间/DEMO标识。
- API配置中心凭据确认/测试连接/预算/启停/符号路由/配置导入导出均接内部API。已修复localhost与127.0.0.1开发访问的同源判断。
- 验证：lint/typecheck/build通过；UI注册表3项测试通过；浏览器看板保存刷新、配置诊断导出、手机导航/无横向溢出通过。桌面/移动截图人工检查。
- 预警写接口、研究导入在M3继续；M2对应E2E以看板/配置/手机三条为范围。无新迁移。
