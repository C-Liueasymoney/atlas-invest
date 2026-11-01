# 实施状态

## 2026-10-31 — 国内金价优先最新延时行情

- 核实线上854.76元/克是2026-10-30 Au99.99日收盘，官方延时页已有更新报价。主报价改为认证 GET/POST `/api/v1/market/domestic-quote`，精确读取 Au99.99，手动刷新绕过普通缓存，仍保留 Provider 配额/启停/路由与故障冷却。
- 页面显示最新延时行情与采集时间，源页面没有精确成交时间时不伪造。打开、恢复可见及可见页面每5分钟检查；来源失败依次保留最近成功报价、回退日收盘，明确错误原因/陈旧状态。日线图表独立保留，不改写历史OHLC，无新迁移。
- 独立快照保存到 provider_cache；日期/采集顺序由原子upsert保护；控制器事务结束后再持久化，避免五连接池并发耗尽；失败标记不会被旧缓存读取清除。
- 本地验证：Web74项通过（含真实PostgreSQL；外网实时探测默认1项跳过，已另行显式运行通过），浏览器10条通过，lint/typecheck/format/production build通过。新增测试覆盖精确品种、缺失/零/未来日期、强制刷新、失败回退、历史不变以及六个并发请求不会耗尽连接池或回退来源日期。独立审查发现的连接池与快照竞争问题已修正。
- 专业服务申请条件与费用核查见 GOLD_MARKET_DATA_OPTIONS.md；未查到适用于本用途的统一官方公开价格，未联系销售、申请或购买任何服务。
- 发布完成：采用服务器独立暂存目录，复制当前部署源码以保留另一个聊天已发布的看板修复，仅覆盖本轮五个功能文件；单工作进程。首次384MB堆不足发生在隔离TypeScript检查，未影响线上；640MB重试完成全部生产构建后，本机3102端口先验收成功，再切换线上。旧构建与五个源码文件备份保留于 `/opt/atlas-deploy-staging/latest-gold-previous-20261031`。
- 2026-10-31北京时间06:38，线上实际手动刷新返回833.0元/克，源日期2026-10-31；公网浏览器点击后主报价显示833.00元/克，接口采集时间2026-10-30T22:38:27.860Z。历史仍截至2026-10-30，未被覆盖。公网完整登录/看板/行情/退出验证通过，网站、PostgreSQL、Nginx、采集定时器均active。价格仅为当次验收快照，不是固定正式种子。

**当前：V1核心可运行并已验证；严格规格尚未全部验收，M4部分完成。分支已完成手动推送，后续提交继续使用已配置的本机凭据。**

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


## 2026-10-17 — 行情页面重做与价格纠正
- 按 TradingView 的信息层级重排：默认白色、横向导航、Au99.99 大号价格/涨跌、清楚的来源与交易日期、大面积蓝色主图；相关指标在侧栏，缺Key留空。「研究看板」标签保留组件编辑/拖拽/保存，支持深色及390px移动端。
- 根因是默认Demo展示合成行情，而非SGE日线解析错误。改为显式真实 `preview` 默认，实际Python probe经校验后写入私有、Git忽略的 `.atlas/market-snapshot.json`（0600）。缺数据不回退Demo；错误保留旧实际值并标陈旧。Demo主报价留空、图表保留演示标识。live仍使用PostgreSQL鉴权和规范表，没有迁移。
- 2026-10-16 Au99.99 OHLC 893.99/902/893/901.57 CNY/g，与上金所官方日报逐字段一致；前有效收盘892.96，变化+8.61/+0.96%。10月17日三年滚动窗口728根日K。Gold API、Frankfurter真实采集成功；FRED无Key保持not_configured。详细时间、来源与换算口径见PRICE_VERIFICATION.md。
- 首页实际刷新、Gold读取自动缓存刷新遵守Provider/路由启停、本地Controller预算及至少30秒/源Cache-Control的较长TTL；CLI跨进程目录锁覆盖Gold缓存复查与请求，防止并发绕过。CLI显式作业与Web用量统计分开，Python重试物理请求仍未精确计费。
- Preview偏好独立存储；首次仅迁移Demo的布局/自选/笔记，预警状态与事件不迁移，避免合成前值造成伪触发。正式模式刷新使用正式sync接口；月/周指标显示实际频率。修复测试PostgreSQL helper对已有目录重复initdb的问题。
- 验证：Web63项全部通过（含真实PG与并发刷新回归），Python27项全部通过（含真实PG）；lint、strict typecheck、format与production build通过。Demo完整8条E2E通过；真实preview价格/日期/手机两条流程单独验证。CUA人工检查白色/深色桌面、390px手机和可编辑研究标签；截图已保存本地。
- 限制：preview依赖本地Python、仅适合本机开发，生产请配置live与外置采集job；FRED缺Key仍未完成真实验收；SGE分钟源未来时间仍拒绝，日线不冒充盘中价。GitHub凭据阻塞见本轮提交后记录，不宣称远端CI通过。
- 回滚：本轮无数据库迁移，revert代码即可；实际快照与preview偏好为私有本地文件。旧demo-state保留，回退不会删除用户研究资料。

本轮实现提交 `39a639f` — `feat(market): focus gold overview and replace default synthetic quotes with verified preview`。
分支 `codex/atlas-v1`，origin `https://github.com/C-Liueasymoney/atlas-invest.git`。本轮HTTPS已到达远端，但GitHub拒绝推送：当前Personal Access Token缺少 `workflow` scope，不能创建/更新历史中的 `.github/workflows/ci.yml`。这取代了此前无本机凭据的具体阻塞；不是代码检查失败。需使用具备该仓库代码及工作流写入权限的凭据，之后重新执行 `git push -u origin codex/atlas-v1`。没有移除CI以绕过权限、没有强推，全部本地阶段历史保留。

## 2026-10-19 — 美国股票指数追踪

- Catalog 新增 FRED `NASDAQ100` 与 `SP500`，分别展示纳斯达克100指数、标普500指数的官方日收盘观察值；明确不以 QQQ、SPY、期货或盘中报价替代。
- 两个指数加入默认自选、首页刷新和主图选择器；首页以“美国股票指数 / IDX / 日度观察”突出语义。无 Key 时保留入口并明确留空，不回退到 Demo 数值。
- 共用服务端 `FRED_API_KEY`，无数据库迁移。当前本机没有 `.env`，真实 FRED 认证与取数需用户配置免费 Key 后完成。
- 功能级测试覆盖 catalog、默认自选、刷新名单、主图筛选及指数文案。验证通过：格式、lint、strict typecheck、production build、Web 65 项、Python 18 项及 Playwright 8 条；本机未配置测试数据库，9 项 Python PostgreSQL 集成测试明确跳过。

## 2026-10-30 — 网页凭据与定时采集共用数据库

- 保留现有 owner 配置页面、API、数据库表及 AES-256-GCM 格式。新增 Python owner 隔离的 live 凭据读取，与 Node 密文互通；环境变量仍优先，preview/demo 不读凭据数据库。不缓存解密后的 Key，网页替换、删除在下次读取生效。
- Python 加密库固定 cryptography 50.0.2。可选任务 `--skip-unconfigured` 仅跳过缺失供应商凭据，缺数据库、缺指标注册、错误主密钥等仍失败；缺 Key 在消耗预算和请求上游前跳过。部署采集脚本新增两条美国指数，FRED 请求间隔13秒。
- 本地验证：Python 33 项全部通过（真实临时 PostgreSQL，无跳过）；Web 67 项全部通过（真实临时 PostgreSQL，无跳过）；Playwright 8 条通过；lint、typecheck、格式和 production build 通过。独立审查发现的错误分类与临时部署脚本定时器恢复问题已修正。
- 实例 i-uf6e1z4hkdc3u03591w2 / cn-shanghai 已确认 live、PostgreSQL、有效32字节加密主密钥、root:0600 环境文件；未保存任何真实 FRED Key。部署没有更换主密钥或修改既有市场数据；元数据 seed 补齐两条指数，无新增迁移。
- 部署完成。过程中首次构建自动回退，第二次构建遇到实例全局 OOM，导致 Workbench 与公网暂时超时；原通道随后恢复，无需新增 RAM 权限。同实例“服务部署agent”聊天同时在修复看板 JSON 重复编码问题，最终构建恢复后，本次仅进行凭据和服务验证，未继续并发构建。第二次部署日志 /var/log/atlas-credentials-release-r2.log；代码/旧构建备份 /var/backups/atlas-invest/credentials-release-20261030-r2，另有加密数据库备份。保留这些回滚点。
- 最终线上验证通过：deploy/verify-credential-flow.py 完整验证 owner API 保存、跨站拒绝、密文、Python读取、无密钥导出、替换与删除；测试 Key 已清理且没有向供应商发送。与定时器相同用户/EnvironmentFile 的 SP500 任务在无 Key 时返回 skipped、退出0。公私网 HTTPS、登录、安全 Cookie、受保护行情、看板/报价和退出均通过，atlas-web/PostgreSQL/Nginx/atlas-collect.timer 均已恢复运行。
- 现在用户仅需登录 https://47.101.193.94/settings/data-sources，在 FRED 面板保存真实 Key、测试连接并同步指标；以后替换/删除通过网页完成，无需修改配置文件或重启。未持有真实供应商 Key，故不声称已验证 FRED 真实认证和取数。

## 2026-10-31 — 最新报价同步折线及美国指数参考行情

- 国内黄金与两个美国指数的主报价同步到折线末端：同一市场日期替换显示点，新日期追加；不改写历史数据库或日K的OHLC。指数日期按America/New_York处理，范围按钮对供应商日线有效。
- 新增腾讯财经实际NDX/INX公共参考行情及最多320条同源日线，无需Key；名称、代码、货币和源端时间均校验。手动刷新请求新报价，失败保留最近可信快照，再兜底FRED日收盘。Yahoo实际指数备源默认关闭，ECS访问超时；公共源可能延时，不承诺专业实时。
- 首页主报价、侧栏报价、主图使用同一最新接口；快照保存在provider_cache，无数据库迁移，只新增tencent_index供应商元数据。既有FRED观察值保留。
- 本地验证：Web79项通过、2项外网可选测试跳过；单独开启指数外网测试通过；Playwright11条通过，覆盖黄金/指数刷新和折线一致、范围切换。lint、strict typecheck、格式、production build通过。
- 服务器部署在独立目录构建并保留旧.next及源文件；服务切换前进行临时进程报价验证。生产验证与Git推送结果见本次交付记录。无密钥或数据库资料提交。
- 回滚：恢复备份.next及源文件即可，新增provider行可保留；缓存不覆盖规范化日收盘历史。

本轮功能提交 `932d803` — `feat(market): sync latest quotes with charts and refresh US indexes` 已正常推送至 `origin/codex/atlas-v1`（https://github.com/C-Liueasymoney/atlas-invest）。

ECS临时生产进程及正式切换后验证均通过；公网浏览器实际点击三个指标刷新，验证主报价与折线最新点一致：Au99.99 833.00（2026-10-31）、NDX 28384.85（2026-10-30T21:15:59Z）、SP500 7580.07（2026-10-30T20:47:43Z）。指数接口本次各返回321条日线（供应商count参数320含当期额外行），默认1Y图显示252点。手机390px截图也已检查。

首次独立构建因服务器缺少既有 `useRemote.setData` 返回值而未通过类型检查；只在临时目录补齐对应一行，重新构建成功后才切换。保留服务器原有其他修复。生产源文件SHA256与本地charts/latest-index一致。回滚产物：`/opt/atlas-deploy-staging/latest-market-previous-20261031`；构建日志：`/var/log/atlas-latest-market-rebuild.log`。公网完整会话验证通过，atlas-web、PostgreSQL、Nginx、atlas-collect.timer均active。

其他指标核查：XAUUSD采集时间2026-10-31；人民币汇率和黄金历史日线2026-10-30；利率/联邦基金利率观察2026-10-29；CPI2026-09；CFTC2026-10-27；美元指数历史停留2026-10-23，需要保留陈旧状态，不将采集时间冒充观察日期。

手机复查补充：密集验收触发本地5次/分钟预算时，Yahoo默认停用曾掩盖主源限额原因。已改为备源失败后保留主源原始原因；新回归测试在旧代码失败、修复后通过，相关6项测试通过，1项外网测试按默认跳过；typecheck通过。历史范围说明改为“约320条”以覆盖供应商包含当期额外行的返回。

## 2026-10-31 — 收藏驱动主图与独立关联指标管理

- 右上角主图切换器增加醒目标签、收藏数量与管理入口，严格按现有收藏操作使用的首张观察列表展示，允许全部收藏指标作为主图。空列表引导添加，研究看板入口保持可访问；同一浏览器记住仍被收藏的上次主图。
- 每个主图有独立关联项配置，可从全目录搜索添加、取消、清空、恢复推荐并显式保存；关联与收藏独立。黄金/国际黄金/美国指数/汇率提供初始研究对照分组，不宣称已计算统计相关性。
- 新增受原有鉴权与同源保护的GET/PUT /api/v1/market/related/:seriesId；migration0003新增market_related_preferences(owner_id,series_id,related_ids)，不修改已有行情或工作区表。live使用PostgreSQL、preview/demo各自独立私有文件；服务器保存配置支持跨设备读取。
- API验证空列表持久化、主图隔离、自关联/重复/无效指标拒绝；真实PostgreSQL验证JSON数组形状。Web82项通过，2项外网可选测试跳过；12条浏览器流程通过。审查发现空收藏误隐藏研究看板的问题已修正并加入回归，同时加入主图重载记忆验证。
- 增量迁移仅加表，回滚代码可保留表与用户配置；生产使用独立构建与旧产物备份，部署验证见交付结果。未提交其他聊天尚未提交的workspace修复及部署文件。

功能提交1b13789已推送origin/codex/atlas-v1。ECS已完成新增表迁移及首轮激活，黄金/NDX/SP500配置读取通过；公网实际验证配置保存、读回、清空，测试配置已清理。通用迁移运行器在该实例报08P01 invalid message format，故使用管理员事务执行0003并将表归属atlas、登记迁移；未扩大应用权限。运行时配置API读写均成功。旧产物备份overview-previous-20261031，后续手机宽度修正备份overview-width-previous-20261031。

手机复查修正了新增related-panel在flex布局中未铺满宽度的细节；新增宽度回归通过。关联配置管理、收藏筛选与最新行情功能的最终公网验证见交付结果。

最终生产验证完成：公网当前8个收藏与8个主图选项一致，黄金/NDX/SP500三个管理面板均可选择其余16个目录指标（总17项），关联配置真实保存/读取/清空通过，测试配置已删除恢复默认；手机390px关联区域铺满且无横向溢出、关联报价可显示。完整公网会话验证通过，atlas-web/PostgreSQL/Nginx/采集定时器均active。新构建日志/var/log/atlas-overview-width-build.log，旧版本保留在/opt/atlas-deploy-staging/overview-width-previous-20261031。

## 2026-10-31 — 主图切换框紧凑化

- 将标题、自选数量与管理入口排在同一行，收紧内边距与选择框高度；保留手机全宽及收藏联动。手机浏览器无横向溢出测试通过，格式检查通过。无数据库迁移，回滚样式提交即可。

## 2026-11-01 — Analytics Phase 1：数据与计算

- 新增模块化价格简单收益率/利率基点变化、Pearson矩阵、30/60/120/252期滚动、ISO周/自然月重采样；日频按相同起止日期区间交集，不前向填充。转换价格仅用同日有效USD/CNY，人民币序列不重复叠加汇率，FX序列自身按原始汇率变化。
- 复用seriesData数据库查询；指数仅在数据库无历史时读取已有供应商持久化快照，读分析不直接请求第三方。新增availability/correlation/rolling与受限刷新API，沿用鉴权和同源校验。缓存包含查询条件、算法版本和完整底层数据哈希，最多32项。无新增依赖或迁移。
- 严格缺失/重复冲突/非法非正价格处理，少于20有效样本及零方差返回null与原因；共同缺失日期保留滚动空值断点。价格指数不含股息，跨市场异步收盘和pairwise矩阵局限明确披露。
- 核心/API定向5项通过，实际缓存数据探测额外1项通过：SGE与FX在2025-10-16至2026-10-16有191个相同区间收益样本，Pearson=-0.3405145065，两源截至2026-10-16。该探测读取现有真实采集缓存，不生成正式行情。XAU只有快照、债券ETF未接入，明确不可用。
- Phase1检查：lint、typecheck、全量测试（当时工作区91通过/7跳过，含并行准备模块）、production build通过；没有配置测试PG时集成项如实跳过。Phase1提交仅包含计算/API/测试/计划与本记录，后续阶段文件独立提交。

## 2026-11-01 — Analytics Phase 2：分析页面与Widget

- /analytics/correlation提供全目录搜索、快捷添加、1/3/5年和自定义日期、日/周/月及CNY/USD，矩阵固定表头、悬停/点击样本详情、收益关系散点与表格、固定±1滚动线、窗口与局部缩放、三类CSV。概览统计全部来自API单元格，来源/时效/变换口径逐资产展示。
- correlation-matrix与rolling-correlation注册到原Widget体系，使用稳定JSON配置，支持添加、布局存储和恢复；服务端检查分析配置有效性。相关性与风险入口加入主导航。
- 审查修复：不完整资产选择保留在组件本地，避免中途取消一个资产就导致Widget失效；矩阵请求失败但滚动Demo成功时仍显示DEMO。
- lint/typecheck/production build通过；当前全量94测试通过、8项条件性跳过（含待Phase3模块）；4条分析页面浏览器通过，新增Widget替换资产边界单独通过。分析Widget API保存/恢复和非法窗口拒绝自动化测试通过。此阶段无数据库迁移。
