# 实施状态

**当前：V1核心可运行并已验证；严格规格尚未全部验收，M4部分完成。GitHub推送受本机凭据阻塞。**

以各阶段实际命令输出为准；不把本地 build 视为 GitHub CI 成功。

## 阶段提交与推送总表

分支：`codex/atlas-v1`；origin：`https://github.com/C-Liueasymoney/atlas-invest.git`。所有push均实际尝试，因本机HTTPS凭据不可用而失败；没有远端CI通过记录。

|阶段|本地SHA|Commit subject|检查证据|GitHub push|
|---|---|---|---|---|
|M0|`5b1bdf4`|`chore(scaffold): initialize Atlas monorepo, normalized schema and CI`|lint/typecheck/Web2/build通过；当时Python安装阻塞|失败：keychain -60008|
|M1|`4242b13`|`feat(data): add secure provider control and normalized gold data pipelines`|Web16/Python19、真实PG/SGE/FX/Gold、build通过|失败：无HTTPS凭据|
|M2|`cec3e78`|`feat(dashboard): add editable research widgets and provider configuration UI`|UI3、看板/配置/移动3条浏览器流程、lint/typecheck/build通过|失败：无HTTPS凭据|
|M3|`802d295`|`feat(alerts): add persistent rules, validated imports and private deployment checks`|Web45、浏览器4、lint/typecheck/build通过|失败：无HTTPS凭据|
|M4部分|`fb7d5a8`|`feat(research): add official COT data, import provenance and historical risk views`|Web49/Python26/浏览器6、format/lint/typecheck/build、真实生产实例通过|失败：无HTTPS凭据|

本机完成GitHub授权后执行 `git push -u origin codex/atlas-v1`，会保留并推送以上分阶段历史。不要force push。

## Milestone 0 — 已提交
初始化工程、规范化数据库、元数据 catalog、Next.js shell、Python 包、CI。
初始环境无 Docker/PostgreSQL，先以PGlite验证迁移；M1起已启动仓库本地PostgreSQL18临时服务完成集成验证，系统服务未修改。Docker镜像未实际构建。

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

M2 commit `cec3e78` — `feat(dashboard): add editable research widgets and provider configuration UI`；GitHub push仍失败（HTTPS缺凭据），本地保留。

## Milestone 3 — 规则与数据管理
- 完成五类预警规则、穿越重新触发/冷却/站内事件去重，规则与状态事务保存。网页同步后与行情读取时评估，另提供手动评估。Python离线job暂不自行评估，故不保证后台即时提醒。
- CSV/XLSX上传→列映射→统计期/单位/来源校验→限时预览→确认导入，官方域名白名单、不抓取任意URL、公式/宏/ZIP膨胀拒绝，按文件hash幂等写入。0002仅新增data_imports.metadata列，回退可保留该列，无需删除数据。
- 支持安全Markdown笔记/标签/事件日期、带DEMO/来源的CSV/JSON导出（提前实现部分P1）；Dockerfile/私有启动保护、CI真实PostgreSQL与Playwright。
- 独立审查回归修复：空字符串FRED禁止转0、未来Gold时间拒绝、禁用路由阻止同步、DFII10不得映射DGS10、百分比预警保持active状态、国内价差继承最旧输入陈旧状态、全空观测asOf=null、对齐后选比较基期、AV配置导入也限制25次/日。
- 最新验证：45项Web测试全部通过（含真实PostgreSQL凭据加密/owner隔离/导入事务/禁用路由），lint、strict typecheck、production build通过；4条真实内部API Chromium E2E通过。没有把本地结果视为GitHubCI。
- 已知依赖：开发工具链5项高危报告（Next ESLint->braces）；生产ExcelJS->uuid 2项moderate，暂无干净兼容修复，严格限制上传体积与结构；没有使用force降级。Docker镜像配置已提供，本机无Docker，因此未实际构建容器。

M3 commit `802d295` — `feat(alerts): add persistent rules, validated imports and private deployment checks`；GitHub push仍失败（缺本机HTTPS凭据），本地保留。

## Milestone 4 — 研究扩展（部分完成）
- 官方CFTC年度ZIP，COMEX GOLD088691、Legacy futures-only非商业多头减空头；实际探测与落库2026-10-06净头寸210335 contracts。发布时间未知保留NULL。CLI、网页同步/连接探测和workflow_dispatch手动选择可用，默认日级任务仍仅P0。
- 已具备WGC规范化单表CSV/XLSX导入、笔记/标签/事件日期、CSV/JSON导出、黄金默认布局恢复。新增批次来源详情：文件hash、统计截止、原始发布时间、导入时间、单位与官方URL；JSON导出包含批次信息。
- 新增仅日度价格/汇率适用的历史最大回撤、252交易日年化波动、最近21间隔滚动波动和相邻观测收益分布。显示样本数/DEMO/假设，缺样本不报零风险；利率/月度序列拒绝套用。
- Python与TS共享Provider advisory锁与预算统计，禁用Provider/Series/route在联网前阻止；不覆盖已有异源历史。用量仍为本地作业估算，Python内部重试/多年度CFTC下载不等于一个物理请求，不能当供应商剩余额度。
- 凭据更换清理旧缓存；缓存键隔离凭据指纹；错误Key与额度耗尽区分。生产Standalone启动已修复、静态资源自动准备；生产禁止bypass的实际命令检查通过。
- 最终验证：49项Web测试（配置TEST_DATABASE_URL时含2项真实PG集成）、26项Python测试、6条Playwright流程；lint/typecheck/format/build通过。真实生产实例登录会话读取729根Au99.99日线，isDemo=false，浏览器错误0；图表及风险统计截图已人工检查。SGE/CFTC网页连接测试均拿到真实样本。
- 尚未完成：WGC原始多页报表自动识别、图表事件标记、多研究布局模板管理。因此M4标为部分完成，不宣称整份P1或严格V1 DoD全部验收。

## 独立审查与决定
已确认的解析、时间、路由、预警、比较和配额锁问题已修复并加入回归测试；Python物理请求/重试的精确计费仍作为明确限制，不能声称严格供应商剩余额度保障。未提供FRED Key，不能代替用户申请，仍需真实DFII10/DGS10验收；未获凭据/授权的AV行情endpoint、FMP、Yahoo不伪装为可用。导入CSV保留标准来源/日期列，更详细批次元信息通过详情与JSON导出查看。单owner密码会话作为V1鉴权，完整多用户/RLS后续实现。
剩余风险：Python请求预算为作业估算；生产ExcelJS依赖2项moderate、开发ESLint链5项high；Docker配置未实际构建；GitHub尚未推送/运行CI。更详细技术限制见README、DATA_SOURCES、DEPLOYMENT。

## 下一步优先顺序
1. 本机完成GitHub授权后推送阶段历史，查看远端CI实际结果。
2. 配置FRED_API_KEY，验证DFII10/DGS10与其他宏观序列真实数据。
3. 按真实账户权益验证综合Provider行情和等价路由；完善物理请求计数、夜盘交易日历与离线预警job。
4. 完成WGC原始工作簿映射、图表事件标注与多用户权限。
