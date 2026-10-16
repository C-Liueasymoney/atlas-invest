# Personal Investment Research Workspace — 产品需求与技术设计（Codex 可执行）

> 文档版本：1.0  
> 编写日期：2026-10-16  
> 项目代号：**Atlas Invest**（可配置名称，非必须采用）  
> 产品定位：**个人使用、数据可追溯、插件式扩展、优先使用免费数据的投资研究网站**  
> 当前重点：人民币黄金（上海黄金交易所 Au99.99）及其宏观驱动因子；后续扩展纳斯达克100、股票、指数、基金、债券和其他资产。  
> 交付语言：中文界面优先，代码/表名/接口/字段采用英文，文档与关键业务注释中文。

## 0. 给 Codex 的工作指令（必须遵循）

你是负责该项目的高级全栈工程师、数据工程师与测试工程师。**请基于本文档直接创建并实现项目，不要停留在设计讨论、空白脚手架或只有静态视觉稿的状态。**

1. 默认在**空仓库**启动；如仓库已有内容，先阅读现有文件并与此规格协调，切勿覆盖用户已有成果。
2. **第一轮优先交付可运行的 V1 纵向闭环**：独立看板页面 → 实际数据读取 → 统一存储 → 图表与联动 → 观察列表 → 可编辑布局 → 数据源状态 → 基础预警规则 → 测试与使用文档。用 `docs/IMPLEMENTATION_STATUS.md` 标记完成/未完成内容。
3. 优先实现真实数据接口；**不得在“实时/正式环境”中使用编造的行情数字**。没有 API Key、外网不可用或数据源失效时，展示明确标识的 Demo 数据 / 未配置 / 暂不可用，并保留完整设置流程。
4. 所有外部数据必须经 **Provider Adapter → Validate → Normalize → Persist → Query** 流程。禁止前端到处直接调用第三方 API，也禁止把供应商字段名耦合进 UI。
5. 采用 **可注册指标、可注册数据源、可注册 Widget** 的设计，未来新增资产无需改写整个系统；但**不要上来实现微服务集群、Kubernetes、分布式消息队列或复杂付费中间件**。
6. 所有 secrets 从环境变量加载，严禁提交到仓库或暴露到浏览器；提供 `.env.example`。公网上线时需要鉴权/授权，不能因单用户场景忽略安全。
7. 注重可用性：中文界面、深浅色主题、移动端可查看、默认桌面宽屏、多图表拖拽布局、清晰空状态、日期/时区/单位明确。
8. 使用当前稳定且相互兼容的依赖版本；开发时核实最新官方文档，锁定依赖版本，不要想当然使用过时 API。
9. 验收时执行 lint、类型检查、单测、E2E（或可替代的自动化冒烟测试）和构建，修复已发现的错误。
10. 按下文“迭代阶段”推进。如本轮时间/资源不足，优先保证 V1 的核心闭环，**不要为了展示大而全而留下不可运行的伪实现**。
11. 成品必须附上 `README.md`、本地启动指南、免费数据接入指南、部署方案、已知限制、测试结果和下一步 TODO。
12. 若 API 的实际可用性、响应模式或许可与本规格不同，以供应商**最新官方文档/实际接口响应**为准，记录差异，不可静默伪造字段或回退到不可信抓取。

---

## 1. 产品愿景、用户画像与边界

### 1.1 愿景

打造个人版 TradingView 风格的“行情观察 + 宏观因子 + 研究工作流”平台，既可日常看盘，又能研究金价涨跌与美元、实际利率、人民币汇率、ETF 资金流、央行储备等指标的关系。平台应该像积木一样持续扩展到其他资产。

### 1.2 当前用户场景

- 用户刚开始系统性学习投资，希望从黄金开始，逐步扩展投资知识和品种。
- 用户更习惯**人民币、元/克**观察国内黄金，而非仅看到美元/盎司。
- 用户关心风险控制、回撤和长期投资，不希望看板诱导高频投机。
- 用户会不断提出新指标、新图表、新研究逻辑，要求开发迭代成本低。
- 初期为单用户，未来预留多用户架构；默认中国简体中文与 `Asia/Shanghai` 显示时区，设置中可修改。

### 1.3 成功标准

- 打开主页 10 秒内能够看清“价格、变化、上次更新时间、数据状态”。
- 3 分钟内能够回答：黄金涨跌中，国际金价和人民币汇率分别贡献了多少？哪些宏观指标近期明显变化？
- 新增一个普通 FRED 时间序列时，主要通过配置指标和新增映射完成，不需要修改图表组件。
- 数据源故障不会使页面白屏；显示最后可用值、来源、陈旧状态和失败原因。
- V1 可在本地免费运行；云端方案有免费路径但明确限制。

### 1.4 明确的非目标（尤其 V1）

- 不接入真实证券/期货交易，不下单，不连接券商账户。
- 不承诺毫秒级、交易所授权逐笔实时行情，也不将免费示意行情称为可交易报价。
- 不做收益保证、方向预测准确率承诺、不展示缺乏校准的“上涨概率”。
- 不提供受限数据的非法爬取、反反爬、绕过付费墙或未经授权的数据再分发。
- 不在 V1 实现完整 Pine Script 编辑器、订单簿、Level 2 行情、社区社交功能。
- 可参考 TradingView 的信息架构和交互，但不复制其受保护的源码、图标、品牌和独有界面资产。

---

## 2. 功能范围与优先级

### 2.1 P0：V1 必须落地

| 编号 | 功能 | 具体要求 |
|---|---|---|
| P0-01 | 首页概览 | Au99.99（元/克）、XAU/USD、USD/CNY、DFII10、DGS10、广义美元指数；每卡显示数值、单位、变化、数据截至时间、来源、延迟标识 |
| P0-02 | TradingView 风格价格图 | 日K（来源有 OHLC 才提供）、折线图、光标、十字准星、悬浮数据、区间缩放、1M/3M/6M/1Y/3Y/ALL 时间切换、暗色主题 |
| P0-03 | 多指标比较 | 在同一研究页面增删系列；左/右轴或标准化模式（起点=100）、百分比变动模式；不能在同一数值轴混用人民币/克与收益率% |
| P0-04 | 可定制看板 | Widget 目录、添加/删除/调整大小/拖动布局、保存恢复；内置“黄金研究”默认布局 |
| P0-05 | 自选/搜索 | 指标目录检索，按资产分类，添加到观察列表，支持排序与收藏 |
| P0-06 | 真实数据通路 | AKShare 的 SGE 历史行情、FRED 宏观、Frankfurter 日汇率、Gold API 最新金价，适配器分别可启停 |
| P0-07 | 统一数据库 | 历史 OHLC、宏观时间序列、行情快照、数据源元信息、采集运行记录、布局、自选表 |
| P0-08 | 状态/透明性 | 指标“最新/延迟/陈旧/失败/未配置/Demo”状态、采集时间、交易日/统计期、原始来源与免责提示 |
| P0-09 | 数据管理 | 对各 Provider 可查看状态、手动同步、历史回填、导入 CSV/XLSX、失败日志 |
| P0-10 | 预警规则 | 支持跨越价格阈值、百分比变化、数据更新/陈旧；规则存储，先在站内展示触发事件，邮箱推送可扩展 |
| P0-11 | 权限与安全 | 本地 Demo 无钥匙体验；线上私有看板必须登录，操作数据库需要鉴权；密钥不能进入客户端 |
| P0-12 | 工程可运行 | 数据库 migration、seed、环境文件、CI、测试、Docker、本地与免费部署文档 |

### 2.2 P1：第二阶段

- 世界黄金协会黄金 ETF 流量、央行黄金储备数据导入及可信元数据展示。
- CFTC 黄金期货 COT 持仓数据分析。
- 增加更多资产：纳斯达克100（指数本身、ETF 代理需明确）、沪深300、国债、黄金ETF。
- 研究笔记（Markdown）、事件时间轴、图表快照（无自动爬取受限图像）。
- 条件策略指标和因子解释卡、数据质量告警、按事件日期检索。
- CSV/JSON 数据导出及自定义公式指标。

### 2.3 P2：第三阶段

- 研究模板商店（本地模板，不依赖开放平台）、插件 SDK、因子实验室与历史事件研究。
- 带有来源和不确定性说明的 AI 总结（可插拔 LLM，不依赖特定商业供应商）。
- 更完善的提醒通道、多用户权限、云同步、投资组合记录（仅手工记账，不连接账户）。
- 更高频行情接入（必须依据供应商授权及计划）、WebSocket 数据推送。

### 2.4 用户故事（可作为自动化验收）

- 作为用户，我能点开「国内黄金 Au99.99」，看到三年日线和元/克价格，切换日K与折线。
- 我能把「美国10年期实际利率」加到研究页面，并选择“标准化比较”观察两者变化。
- 我能拖动 ETF 资金卡片的位置、调整图表大小，刷新浏览器后布局不丢失。
- 我能为 Au99.99 设置“从下往上穿越 1000 元/克”预警；触发后仅记录一次，直到价格重新回到阈值下方（带滞回/冷却逻辑）。
- FRED Key 缺失时页面明确提示“需要配置 FRED_API_KEY”，而不是显示 0 或演示值。
- 休市时 Au99.99 保留上一交易日收盘价并显示“休市/最近交易日”，而非“在线实时价格”。
- 我导入世界黄金协会 Excel 后，看到统计期、发布日期、单位和文件来源；无法误读为当天的流量数据。
- 新增 `FRED:UNRATE` 等指标，只需配置 catalog 与适配器，不得改动图表基础模块。

---

## 3. 界面与交互设计

### 3.1 信息架构 / 页面路由

| 页面 | 路由 | 内容 |
|---|---|---|
| 总览 | `/dashboard` | 黄金概览与可编辑 Widget 看板 |
| 图表工作台 | `/workspace` | 大图表、多指标叠加、分屏/多面板（基础版） |
| 指标目录 | `/indicators` | 搜索、分类、介绍、更新频率、数据源与覆盖区间 |
| 单指标详情 | `/indicators/[id]` | 历史图、最新数据、元信息、研究解释与来源 |
| 观察列表 | `/watchlists` | 自选资产、指标管理 |
| 预警中心 | `/alerts` | 规则列表、触发历史、启停 |
| 数据源管理 | `/sources` | Adapter 状态、最近同步、API 配置指引、手动导入 |
| 研究笔记（P1） | `/research` | Markdown、标签、关联图表、事件 |
| 偏好设置 | `/settings` | 主题、语言、时区、默认币种与隐私设置 |

### 3.2 桌面布局示意（结构性草图，非最终视觉设计）

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Atlas Invest [仪表盘] [图表] [指标] [预警]                     搜索 Ctrl+K  ☾  用户 │
├───────────────┬────────────────────────────────────────────────────────────────────┤
│ 观察列表       │  黄金市场概览                                     [编辑布局][+]  │
│ 黄金 Au99.99  │ [国内黄金] [国际黄金] [USD/CNY] [实际利率] [美元强弱]             │
│ 国际 XAU/USD  ├────────────────────────────────────────────────────────────────────┤
│ DFII10       │ [国内黄金 Au99.99]   [折线/K线] [1M] [3M] [1Y] [3Y] [ALL]        │
│ DGS10        │                                                                    │
│ USD/CNY      │                    主走势图（支持图表操作）                         │
│ Broad USD    │                                                                    │
│ ...          ├──────────────────────────────┬─────────────────────────────────────┤
│              │ 美国实际利率（独立图表）       │ 美元/人民币（独立图表）             │
│              ├──────────────────────────────┴─────────────────────────────────────┤
│              │ 驱动因子情况：趋势、幅度、时间戳、来源和风险提示                    │
├───────────────┴────────────────────────────────────────────────────────────────────┤
│ 数据来源 · 最近更新 · 免责声明                                  [数据源状态]      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 设计与体验要求

- 参考 TradingView 的信息密度、图表优先、快捷交互与专业感；采用独立视觉风格，深色默认、浅色可切换。
- 颜色语义：涨跌颜色可由用户设置（中国习惯红涨绿跌 / 国际习惯绿涨红跌），并在图表、卡片、预警保持一致；不能仅用颜色表达状态。
- 看板布局通过 JSON 配置持久化；Widget 类型使用稳定 `type` 字符串，不在持久化 JSON 中存储 React 组件引用。
- 支持常见桌面分辨率；平板两栏、手机单栏依次排列；移动端关闭默认拖动，提供“编辑布局”模式，避免误触。
- 搜索支持指标中文名称、英文代码、别名（例如 Au99.99/上海黄金/国内金价；DFII10/美国实际利率）。
- 图表选择新指标后，不清空时间窗口、指标选择和用户自定义布局。
- 错误态有“查看原因、重试、修改设置”路径；图表空态明确缺少哪一天/哪一段数据。
- 日/周/月数据混合画图时使用原始观察日期，对周/月低频指标不做未经标注的每日插值；默认采用观察点阶梯式或点状标记，用户可以切换显示方式。
- 所有重要图表下方显式标注价格单位、数据来源、是否期货/现货/估算值、时区和同步时间。

### 3.4 Widget 基础类型

| type | 名称 | 配置 |
|---|---|---|
| `metric-card` | 单指标行情卡 | `seriesId`, `changeWindow`, `showSparkline` |
| `price-chart` | 价格图表 | `seriesId`, `chartType`, `interval`, `range`, `overlays` |
| `compare-chart` | 多指标比较 | `seriesIds[]`, `scaleMode`, `alignment`, `range` |
| `indicator-table` | 自定义指标表 | `seriesIds[]`, `sort`, `visibleColumns` |
| `factor-explainer` | 因子解释卡 | `factorIds[]`, `lookback`, `methodVersion` |
| `feed-events` | 数据事件列表 | `types[]`, `limit` |
| `source-health` | 数据源健康状态 | `providerIds[]` |
| `markdown-note` | 自定义笔记（P1） | `noteId` |

Widget Registry 示例：

```ts
export interface WidgetDefinition<TConfig> {
  type: string;
  title: string;
  defaultSize: { w: number; h: number };
  configSchema: z.ZodType<TConfig>;
  Component: React.ComponentType<{ config: TConfig; context: WidgetContext }>;
  defaultConfig: TConfig;
  capabilities?: Array<'timeseries' | 'quote' | 'macro' | 'events'>;
}

// 注意：配置持久化只保存 widget.type/config/layout；注册表代码在前端维护。
```

### 3.5 图表支持的最低能力

- Au99.99 使用可获得的真实日 OHLC 绘制 K 线及日线；没有 OHLC 的指标只能使用折线/面积图，隐藏 K 线入口。
- Lightweight Charts 用于价格 K 线、十字准星和量级较大的行情时间序列；ECharts 用于双轴、多因素对比、事件柱状/散点（按实际需要启用）。
- 支持保存图表类型、时间范围、指标及叠加配置到 Widget config。
- `split-pane` 或分屏图表可以进入 P1，V1 至少支持一个主图 + 多个子图，可拖拽布局。
- 不要求完整复刻 TradingView 的所有画线工具或技术指标语言。

---

## 4. 技术架构与技术栈

### 4.1 核心决策

**采用“Next.js 全栈前端/API + Python 数据采集任务 + PostgreSQL”的轻量模块化单体**，不在 V1 增加独立 FastAPI 服务器。未来业务规模增大时可以将 `apps/web` 的 API 与 `services/collector` 提炼成单独服务。

理由：

1. 浏览器只访问项目 API，不直接依赖供应商格式。
2. Python 适合接 AKShare、Pandas、Excel 导入；Next.js 适合 UI 与轻量读写 API。
3. PostgreSQL 便于历史序列、JSON 布局、异步采集日志与以后扩展。
4. 本地 Docker Compose 可运行；云端可选择 Vercel + 托管 Postgres + GitHub Actions 定时任务。
5. 不把网站可用性绑定在“免费持续运行的 Python 后台进程”上。

### 4.2 推荐技术

| 层 | 技术 | 备注 |
|---|---|---|
| 前端框架 | Next.js App Router + React + TypeScript | 使用构建时最新稳定且兼容版本 |
| UI 样式 | Tailwind CSS + shadcn/ui | 自定义独立品牌风格 |
| 图表 | `lightweight-charts` + `echarts` | 遵循图表库署名要求 |
| 状态/请求 | TanStack Query + React 状态 | 服务端缓存、失效重取 |
| 布局 | `react-grid-layout`（或维护良好的等价库） | 拖拽/缩放与响应式 |
| 参数校验 | Zod | API 输入、Widget config 双重校验 |
| 数据持久化 | PostgreSQL + Drizzle ORM（推荐） | 编码类型安全、迁移 |
| Python 采集 | Python 3.13（以 AKShare 当期兼容性为准）、httpx、Pandas、AKShare、SQLAlchemy/Psycopg | 锁定兼容依赖版本 |
| 计划任务 | 本地 CLI + cron；云端 GitHub Actions | 幂等、可补偿，无持续运行依赖 |
| 测试 | Vitest + Testing Library + Playwright；pytest | 单测、集成与E2E |
| 工具 | Docker Compose、pnpm、uv（或 pip） | 统一启动与安装 |
| 认证 | 推荐 Supabase Auth（云端）/ 可替换 Auth Adapter | 本地 Demo 独立受限模式 |

> GitHub Actions 定时工作流可能延迟或丢失执行，不应拿它保证分/秒级行情刷新；只用于允许延迟的日级/周级采集。盘中最新报价可由服务端缓存请求方式按需拉取，严格服从供应商条款与速率。参考：https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows

### 4.3 推荐目录结构

```text
atlas-invest/
├─ apps/
│  └─ web/
│     ├─ app/
│     │  ├─ (app)/dashboard/page.tsx
│     │  ├─ (app)/workspace/page.tsx
│     │  ├─ (app)/indicators/page.tsx
│     │  ├─ (app)/indicators/[id]/page.tsx
│     │  ├─ (app)/watchlists/page.tsx
│     │  ├─ (app)/alerts/page.tsx
│     │  ├─ (app)/sources/page.tsx
│     │  ├─ (app)/settings/page.tsx
│     │  └─ api/v1/**/route.ts
│     ├─ components/
│     │  ├─ shell/
│     │  ├─ charts/
│     │  ├─ widgets/
│     │  ├─ dashboard/
│     │  └─ ui/
│     ├─ lib/
│     │  ├─ indicators/
│     │  ├─ widgets/
│     │  ├─ calculations/
│     │  ├─ source-status/
│     │  ├─ auth/
│     │  └─ db/
│     └─ tests/
├─ services/
│  └─ collector/
│     ├─ src/atlas_collector/
│     │  ├─ adapters/
│     │  │  ├─ akshare_sge.py
│     │  │  ├─ fred.py
│     │  │  ├─ frankfurter.py
│     │  │  ├─ gold_api.py
│     │  │  ├─ wgc_import.py
│     │  │  └─ cftc.py
│     │  ├─ normalizers/
│     │  ├─ persistence/
│     │  ├─ jobs/
│     │  ├─ contracts/
│     │  ├─ cli.py
│     │  └─ settings.py
│     └─ tests/
├─ packages/
│  └─ contracts/       # OpenAPI/JSON Schema/共享 fixture，避免跨语言模型漂移
├─ db/
│  ├─ migrations/
│  ├─ seeds/
│  └─ schema/
├─ config/
│  ├─ indicators.yaml
│  ├─ providers.yaml
│  └─ default_dashboard.json
├─ fixtures/           # 仅用于 DEMO / TEST，独立标识
├─ docs/
│  ├─ API_SETUP.md
│  ├─ DEPLOYMENT.md
│  ├─ DATA_SOURCES.md
│  ├─ SECURITY.md
│  ├─ IMPLEMENTATION_STATUS.md
│  └─ ADR/
├─ .github/workflows/
│  ├─ ci.yml
│  └─ collect-daily.yml
├─ docker-compose.yml
├─ .env.example
├─ README.md
└─ package.json / pnpm-workspace.yaml
```

### 4.4 数据流

```text
上金所公开页面/AKShare   FRED API    Frankfurter    Gold API    WGC人工导入
          │                │            │            │           │
          └────────────────┴────────────┴────────────┴───────────┘
                                   │
                     数据源 Adapter（独立模块）
                                   │
                      类型验证、时间标准化、单位校验
                                   │
                     交易日/发布时间/数值异常检查
                                   │
                      PostgreSQL + ingest_runs
                                   │
                       Next.js /api/v1/*
                                   │
                       Query Cache / 聚合计算
                                   │
             Widget Registry → 自定义 Dashboard → Alerts
```

**数据采集与查询分离：** 页面查询不得在每个刷新时重新抓取上金所历史全量数据；应从数据库读取。对允许较快刷新的 Gold API 行情建立服务端短时缓存和请求节流。

---

## 5. 指标模型（扩展能力的核心）

### 5.1 基础概念

严格区分：

- **Instrument（金融品种）**：例如 `SGE:Au99.99`、`XAU/USD`；可以关联不同价格来源。
- **Series（时间序列）**：某个品种在某个来源/周期下的数值，例如日OHLC、最近报价、宏观利率序列。
- **Indicator/Factor（研究指标）**：一个或多个 Series 及其展示/解释/计算规则，例如美国实际利率、国内黄金溢价。
- **Provider（数据源）**：FRED、AKShare/SGE、Gold API、Frankfurter、WGC 文件导入等。
- **Widget（视觉组件）**：展示 Series / Indicator 的可配置视图。
- **Observation（观测）**：包含统计日期、发布日期、采集时间、数值、数据来源的单条记录。

### 5.2 初始指标 Catalog（必须 seed）

| 内部 seriesId | 显示名 | 计量单位 | 类型 | 来源 |
|---|---|---|---|---|
| `SGE_AU9999_D1` | 国内黄金 Au99.99 日线 | CNY/g | OHLC | AKShare → SGE |
| `SGE_AU9999_QUOTE` | 国内黄金 Au99.99 最新报价 | CNY/g | Quote | AKShare → SGE，尽力而为 |
| `XAUUSD_QUOTE` | 国际黄金参考报价 | USD/troy_oz | Quote | Gold API；参考价非交易承诺 |
| `FX_USDCNY_D1` | 美元兑人民币参考汇率 | CNY/USD | Observation | Frankfurter v2；日级，不是盘中即期 |
| `FRED_DFII10` | 美国10年期实际收益率 | percent | Observation | FRED |
| `FRED_DGS10` | 美国10年期名义国债收益率 | percent | Observation | FRED |
| `FRED_DFF` | 有效联邦基金利率 | percent | Observation | FRED |
| `FRED_CPIAUCSL` | 美国CPI指数 | index | Observation | FRED；月度、不得当通胀率 |
| `FRED_CPILFESL` | 美国核心CPI指数 | index | Observation | FRED；月度 |
| `FRED_DTWEXBGS` | 美国广义名义美元指数 | index | Observation | FRED；**不是DXY** |
| `DERIVED_XAU_CNYG` | 国际黄金折算人民币克价 | CNY/g | Derived | XAUUSD * USDCNY / 31.1034768 |
| `DERIVED_SGE_PREMIUM` | 国内现货相对折算价格差 | CNY/g | Derived | SGE Au99.99 - DERIVED_XAU_CNYG |
| `WGC_ETF_FLOW_GLOBAL_M` | 全球实物黄金ETF月资金流 | USD 或 tonnes（二选一明确） | Imported | WGC XLSX，P1 |
| `WGC_CB_HOLDINGS_M` | 全球/国家央行官方黄金持有量 | tonnes | Imported | WGC XLSX，P1 |
| `CFTC_GOLD_NET_SPEC_W` | COMEX黄金非商业净头寸 | contracts | Observation | CFTC 周报，P1 |

**硬规则：** 

1. `DXY` 与 `DTWEXBGS` 名字、定义、基期不同，不能混用；如用户未来接入真正的 DXY，则使用新 `seriesId`。
2. `XAUUSD_QUOTE` 来自某 API 的最新参考价，不等于 LBMA 官方基准定盘价；行情来源必须可见。
3. `FX_USDCNY_D1` 为**日级参考价**，不可宣传为实时汇率；将来接实时 USD/CNH 时使用独立 seriesId，避免混合历史。
4. `FRED_CPIAUCSL` 是 CPI 指数水平；“同比通胀率”需独立派生公式 `(CPI_t/CPI_{t-12}-1)*100`，且按月对齐。
5. `SGE_AU9999_D1` 与 `SHFE:AU1!`（期货连续合约）属于不同金融品种，不得互相替换。
6. 指标价格变化默认采用自身频率的最新已公布值与上一有效观测对比；不能把“无更新”解释为 0 变动。

### 5.3 Catalog 文件示例

```yaml
- id: FRED_DFII10
  displayName: 美国10年期实际收益率
  aliases: [DFII10, TIPS, 美国实际利率]
  category: macro/rates
  provider: fred
  providerSeriesId: DFII10
  dataKind: observation
  unit: percent
  frequency: business_day
  timezone: America/New_York
  stalePolicy: business_days_3
  docsUrl: https://fred.stlouisfed.org/series/DFII10
  defaultChart: line
  factorHypothesis:
    relationToGold: inverse_typical
    confidence: conceptual_not_predictive
    notes: 利率上升通常增加持有黄金的机会成本，但不是确定性因果规律。
```

初始化时读取 YAML，验证 Zod/Pydantic schema 后 seed DB；以后可通过管理界面新增指标配置。

---

## 6. 外部数据源与免费获取策略（核实日期 2026-10-16）

> **最重要的现实约束：免费、正式授权、毫秒级实时、完整历史四者通常无法同时满足。** P0 目标是个人研究所需的**最近可公开获取数据 + 正确标识时效**，不是做下单级实时交易终端。任何供应商免费政策、授权和频控均以接入当天最新版为准。

### 6.1 中国黄金：SGE + AKShare

- 优先真实数据：上海黄金交易所 `Au99.99`，单位 CNY/g。
- 数据源主页：https://www.sge.com.cn/ ；历史行情入口：https://www.sge.com.cn/sjzx/mrhq
- 开源适配器文档：https://github.com/akfamily/akshare/blob/main/docs/data/spot/spot.md
- 历史接口 `ak.spot_hist_sge(symbol="Au99.99")`：已文档化列 `date, open, close, low, high`，可构成**日线 OHLC**，未提供 volume 则不伪造。
- 行情走势接口 `ak.spot_quotations_sge(symbol="Au99.99")`：文档化 `品种, 时间, 现价, 更新时间`；数据可能是一批分钟行，**必须解析最新有效行与源端更新时间，不代表当前逐笔成交**。
- 首次采集最近 3 年历史日线，后续每天增量同步并定期向前回补 7 个交易日纠错。
- 适配器需独立处理夜盘、休市、时间戳和时区；不把行情“更新时间”错当每根K线的事件时间。
- 采集异常（反爬、响应结构变化、空值、停更）不得清空旧数据；记录失败并标 `degraded/stale`。
- AKShare 用于个人研究原型可行，但项目说明强调其数据采集源于公开页面，接口可能因网页变化失效，且使用需遵守原始来源授权，不能直接推断具备商业再分发权。

### 6.2 国际黄金参考报价：Gold API

- 官方：https://gold-api.com/ ，文档：https://gold-api.com/llms.txt ，价格：https://gold-api.com/pricing
- 免费最新报价示例：`GET https://api.gold-api.com/price/XAU`
- 该免费报价接口目前不要求 Key；官方要求至少缓存 **30 秒**，请尊重返回的 `Cache-Control`。
- 返回参考字段：`symbol`, `currency`, `price`, `updatedAt`；标准化为 `XAUUSD_QUOTE`，单位 USD/troy_oz。
- 历史 `/history` 和 `/ohlc/{symbol}` 是**需 API Key 的其他接口**；目前免费层有 `10 次/小时` 类额度限制，且分钟/小时历史聚合属于更高级计划。实现为独立可选配置，不要假设无限历史K线可无条件获取。
- 若缺少 Key：最新价格模块可正常工作；历史模块优先使用已合法回填的数据，若没有则“无历史数据”，不可构造假K线。
- 供应商报价可能与 TradingView、LBMA、期货市场有价差；显示供应商标签。

### 6.3 美国宏观：FRED API（重点推荐）

- 官方 API 文档：https://fred.stlouisfed.org/docs/api/fred/ ，API Key 指引：https://fred.stlouisfed.org/docs/api/api_key.html
- 需要免费账号和 API Key，放入服务端/采集器环境变量 `FRED_API_KEY`。
- 使用 API V1 `fred/series/observations`，例如：

```bash
curl 'https://api.stlouisfed.org/fred/series/observations?series_id=DFII10&api_key=YOUR_FRED_KEY&file_type=json&observation_start=2023-01-01'
```

- 种子 IDs：`DFII10`, `DGS10`, `DFF`, `CPIAUCSL`, `CPILFESL`, `DTWEXBGS`。
- 对 `value: "."`、缺失日和修订值做专门处理；不能将 `.` 转成 0。
- 将 FRED 日期视为**统计观察日**，采集时间、发布时间另行维护；没有提供可靠发布时间时可为 NULL，不要伪造。
- 月度数据不得填充成虚假每日发布值；支持按原始频率绘图。
- 新增 FRED 指标应主要增加 Catalog 配置，不改 charting 层。
- 注意部分单个时间序列有额外版权/引用提示，指标详情页面展示来源链接与适用许可。

### 6.4 汇率：Frankfurter v2

- 官方：https://frankfurter.dev/
- 免费、无 API Key、日级参考汇率，可缓存本地数据库。默认混合多个官方来源。
- 最新 USD/CNY 示例：

```bash
curl 'https://api.frankfurter.dev/v2/rate/usd/cny'
```

- 历史数据示例：

```bash
curl 'https://api.frankfurter.dev/v2/rates?from=2023-01-01&base=usd&quotes=cny'
```

- 显示 `USD/CNY 日度参考汇率`；**不能当作盘中银行成交价，也不能与 USD/CNH 混同**。
- 数据行中日期是报价对应日期，不等于“今天本地时间”；时区和不同来源更新时间可能不一致。
- 因为是参考汇率，衍生金价与国内盘中行情比较时必须提示**观察时间不一致**。

### 6.5 广义美元指数（DXY 的免费近似观察项）

- FRED `DTWEXBGS`，官方链接：https://fred.stlouisfed.org/series/DTWEXBGS
- 名称为“美国广义名义美元指数”，不是 ICE DXY。它们篮子和权重不同，仅作为“美元强弱”因素代理指标。
- 真正 DXY 的免费长历史/稳定高频 API 不视为 P0 已解决问题；未来通过 `Provider Adapter` 接入获准使用的数据。

### 6.6 世界黄金协会 WGC：P1 手动文件导入优先

- ETF 持仓和资金流：https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows
- 央行储备：https://www.gold.org/goldhub/data/gold-reserves-by-country
- 世界黄金协会 ETF 页面有周度图表与**月度 Excel 下载**；央行储备月度文件通常有约两个月的统计滞后。
- 不假定提供开放稳定 API；P1 默认实现**下载官方 Excel → 本地上传 → 列名映射预览 → 用户确认 → 幂等导入**。
- Excel 处理同时记录文件名、文件 hash、来源 URL、统计截止日、发布日期（已知才填写）、导入日期与单位。
- 对跨期数据、重复导入、文件结构更改有清晰错误提示。
- 不对供应商文件进行未授权公开镜像或数据再分发；个人使用与未来公开站点的授权需分别核查。

### 6.7 CFTC 黄金期货 COT：P1

- 周报历史下载：https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm
- 采集具体“COMEX GOLD”合约对应报告，校验合约标识、Report date 与 Release date；不要将 ETF 持仓与期货头寸混淆。
- 频率是**每周**；具体计算“非商业净多头”需在指标元信息标注使用的 Legacy/Disaggregated 报告口径及 futures-only / combined，不能在口径改变时悄然连接旧历史。

### 6.8 数据源接入优先级与可用性矩阵

| 类别 | 是否可自动接入 | 是否需要 Key | 频率/更新 | P0/P1 | 风险 |
|---|---|---|---|---|---|
| SGE Au99.99 日线（AKShare） | 是，尽力而为 | 否 | 交易日 | P0 | 来源网页/非保证接口稳定 |
| SGE Au99.99 最新报价（AKShare） | 是，尽力而为 | 否 | 源端实际更新决定 | P0 | 可能延迟/结构变化/休市 |
| 国际金价 Gold API quote | 是 | 最新报价否 | 源端较频繁 | P0 | 非交易所保证逐笔，条款可变 |
| Gold API 历史 OHLC | 条件支持 | 是 | 请求数据范围决定 | P1 | 免费层有请求额度/聚合限制 |
| FRED 宏观 | 是 | 是，免费申请 | 日/周/月 | P0 | 缺失值、修订与发布时间 |
| Frankfurter USD/CNY | 是 | 否 | 日级 | P0 | **非实时盘中** |
| 真正 DXY | 暂不保证 | 未定 | 待授权来源 | P1 | 不可拿广义美元指数冒充 |
| WGC ETF / 储备 | 人工导入（稳妥） | 网站免费注册可能需要 | 周/月/有滞后 | P1 | 文件结构与使用许可 |
| CFTC COT | 是 | 否 | 周度 | P1 | 合约映射与统计口径 |

### 6.9 数据采集策略

- Python jobs 按数据种类分组：
  - `collect:sge-history`：手动首次 3 年回填 + 每日同步，回补最近 7 个交易日。
  - `collect:sge-quote`：用户打开页面时按需刷新/本地开发间隔轮询；云端按平台允许的缓存节流做请求；不可保证 24x7 分钟采集。
  - `collect:gold-quote`：服务端缓存不短于 30 秒。若部署为纯 GitHub Actions 定时模式，只能提供有限新鲜度；可由 Next API 做安全、限速的按需请求并可选落库。
  - `collect:fred`：工作日/每日，包含最近 N 日的回补逻辑。
  - `collect:frankfurter`：每日同步、增量回补。
  - `import:wgc-etf`/`import:wgc-reserves`：P1 人工导入。
- 指标指定 `desired_refresh_seconds`, `expected_publication_lag`, `market_calendar` 以及 `stale_threshold`，不对所有数据统一“超 1 分钟就是陈旧”。
- 并发采集需确保同一 source/series 上锁，避免竞态；采集幂等 upsert；外部请求指数退避重试、最大重试次数、失败隔离。
- 做每周数据质量巡检：最新统计日、空值数量、异常波动、连续缺失、重复数据、采集失败次数。

---


## 6.10 新增强制需求：综合数据源优先与可视化 API 配置中心（P0）

**总原则：一个 Provider 可覆盖多个 Instrument/Series；每项指标也可绑定多个 Provider 候选。** 不应按指标重复申请 API Key。新增加资产时优先在已配置综合数据源上搜索符号、验证数据覆盖，再增加新的 Provider。统一数据标准优先于供应商数量最少；不能为了“一个 API”牺牲精度、授权或历史连续性。

### 6.10.1 数据源设置界面与体验

新增 `/settings/data-sources`（`/sources` 可重定向到此页），提供：

1. **Provider目录**：按综合金融行情、宏观、国内市场、黄金专业数据、人工导入分类；展示覆盖类型（股票/ETF/指数/商品/外汇/宏观/资金流）、价格许可、延迟类型、是否需 Key、已覆盖指标数量、状态、最后验证时间。
2. **一套凭据，多项指标复用**：填写 API Key（支持 Bearer/API Key、query/header 两种确定的官方认证方式），服务端加密保存，前端只显示后四位；支持只用 `.env` 的无数据库密钥模式；两种方式不能互相暴露。编辑/删除凭据需确认。不得把密钥保存浏览器本地存储或展示在 URL、日志、前端响应。
3. **测试连接**：按钮触发真实的低成本认证/示例指标请求，返回可用/鉴权失败/超配额/暂时故障/该指标不支持，以及检测时间、数据时间和必要的响应摘要；不能将单一成功测试推断为该 Provider 所有指标都可用。
4. **符号搜索与映射**：输入“黄金/GLD/纳指100”等，列出候选 Provider 的代码、交易所、品种类型、报价单位、币种；用户确认映射，避免 `XAUUSD` 与 `Au99.99`/期货混淆；为每项指标分别选择日线、分钟、最新报价等能力。
5. **指标路由配置**：显示 `canonical_series_id → primary provider/symbol → fallback providers/symbols`；可选择“自动优先”和“固定供应商”；支持按价格、历史数据、新鲜度不同粒度设置路由。必须有可查看的决策原因。
6. **配额预算与缓存**：配置每分钟/小时/天调用预算、TTL、超限等待策略；展示近24小时请求数、缓存命中、429/限额错误、用量（供应商不能查询实际额度时标明“本地估算”）。支持批量API请求（只有上游明确支持时使用）与请求去重。
7. **启停/优先级/降级**：单个 Provider 停用时不影响其他 Provider；失败可自动降级到经过类型、时区、单位、价格口径兼容检查的备选；降级后显示来源变更提示，禁止悄悄拼接不同口径的历史序列。
8. **导入与导出**：导出不含密钥的 Provider/路由/指标配置 JSON；导入后对缺少的密钥显示“待配置”。API 原始响应仅保存有限期、脱敏的诊断样本。
9. **首屏空态和操作指导**：没有API Key时仍可看到支持无Key源与标注的Demo；界面可从 Provider 卡片进入“官网申请地址、获得Key步骤、免费额度、条款提醒、验证示例”。不得未经核实编造免费权益。

### 6.10.2 综合 Provider 候选策略（必须根据实时官方文档复核）

| 候选 | 覆盖范围（能力须逐endpoint探测） | 免费与限制 | P0处理 |
|---|---|---|---|
| Yahoo Finance / `yfinance` | 股票、ETF、部分指数、期货、外汇历史与报价候选 | 非官方公共行情接口；稳定性、限频、授权及再分发限制；**不视为正式免费官方API** | 实现**可选、默认关闭**的研究适配器或保留接口骨架；无可用授权则不在正式/公共部署开启 |
| Alpha Vantage | 股票、外汇、黄金/白银等商品，部分经济指标 | 官方标准免费额度目前约 **25 请求/日**，部分 endpoint 有额外限制；实时美股行情可能需付费 | P0 Provider 适配器/配置页及样本探测；仅启用实际免费可调用接口；按日预算严格限流 |
| Financial Modeling Prep（FMP） | 股票、基本面、ETF/指数/外汇等候选 | 官方 Basic 免费档约 **250 请求/日**，但仅部分 endpoint/历史范围免费；需验证实际访问权益 | P1 扩展，P0 可提供配置模板；不能假设所有黄金/指数接口免费 |
| FRED | 美国利率、通胀、就业、官方经济时间序列 | 免费官方Key，非盘中行情 | P0 核心 |
| AKShare/上金所公开源 | 国内现货黄金、国内股票基金等候选 | 开源封装，不承诺稳定、授权的交易所实时推送 | P0 国内黄金，其他市场按需扩展 |
| Gold API | 国际金价最新报价候选 | 按官网当前限额与接口权限执行 | P0 候选，未来可被综合数据源替换 |
| Frankfurter | 外汇日度参考汇率 | 无Key，非分钟实时价 | P0 日级外汇兜底 |

**选源算法：** 首先必须满足资产品种、市场、货币、单位、价格定义（spot/future/ETF）、历史频率、授权与时效阈值；然后按配置优先级、可用性、免费额度、覆盖范围和缓存状态排序。不得以“一个API覆盖得多”为理由把错误合约数据当成现货，或把GLD价格当成ETF资金流。

### 6.10.3 强制软件接口与数据模型

Provider 统一接口至少包含：

```ts
interface ProviderCapabilities {
  assetClasses: string[];
  operations: ('search'|'quote'|'bars'|'observations'|'fundamentals')[];
  intervals: string[];
  authMode: 'none'|'api_key_header'|'api_key_query'|'bearer'|'unofficial';
  latency: 'realtime'|'delayed'|'eod'|'periodic'|'unknown';
  supportsBatch: boolean;
  termsUrl?: string;
}
interface ProviderDefinition {
  id: string; displayName: string;
  capabilities: ProviderCapabilities;
  configurationSchema: unknown; // 服务端验证Schema，前端由安全字段投影生成表单
}
interface ProviderHealth {
  providerId: string;
  status: 'available'|'unauthorized'|'rate_limited'|'unavailable'|'not_configured';
  checkedAt: string;
  sampleDataAsOf?: string;
  message?: string;
}
```

新增关系表（字段可按实际ORM命名）：

- `provider_credentials`：`id/provider_id/owner_id/secret_ciphertext/secret_last4/created_at/updated_at`（凭据不得明文存储；加密主密钥由环境变量提供；禁日志泄密）。
- `provider_capabilities`：按 provider + operation + interval 记录当前探测状态、来源URL、复核时间；未实测不能标“支持”。
- `series_provider_routes`：`canonical_series_id/provider_id/provider_symbol/operation/interval/priority/enabled/constraints_json`，同一 Series 支持多个排序候选。
- `provider_request_usage`：请求次数、时间窗口、结果类型、缓存命中、错误类别，不保存密钥或敏感请求URL。
- `provider_health_checks`：连接结果、错误代码、验证时间、样本数据时间。

统一服务端 API（需要 owner 鉴权；更新操作写审计日志）：

```text
GET    /api/providers/catalog
GET    /api/providers/configured
POST   /api/providers/:id/credentials
DELETE /api/providers/:id/credentials
POST   /api/providers/:id/test-connection
GET    /api/providers/:id/capabilities
GET    /api/providers/:id/usage
GET    /api/providers/:id/search?q=...
GET    /api/series/:id/routes
PUT    /api/series/:id/routes
POST   /api/providers/:id/sync
```

Provider Controller 先做缓存、速率预算、请求去重和熔断，再调用具体适配器；Provider Adapter 负责供应商鉴权、符号转换和响应解析。**所有看板Widget只能访问统一内部API，不能感知第三方API Key或供应商原始Schema。**

### 6.10.4 验收测试（必须）

- 一套 Alpha Vantage Key 能供两个已验证可用的指标使用，不生成两个重复凭据。
- 缺少密钥时点击“测试连接”，返回 `not_configured` 并显示配置指引，不假装成功。
- 输入错误 Key 或遭遇429时，明确标识错误，不显示成0价格；密钥永不出现在浏览器网络响应、URL、日志和导出配置中。
- 某黄金主源故障时，只有品种、单位、频率、时效兼容的备源可接管；页面可见 `sourceChanged` 与新数据时间。没有兼容备源时显示已缓存旧数据/不可用。
- 两个Widget请求同一指标可以共享缓存；超出免费API配额时暂停采集而不是无限重试。
- Yahoo 非官方接口未开启时，整站可以完成 build、demo 及核心真实数据流程。
- 新增一个已有综合Provider支持的股票/ETF，正常情况下只需新增 Catalog 映射与路由设置，不需要改动现有 Widget 组件。

官方核实入口：
- Alpha Vantage：<https://www.alphavantage.co/documentation/>、<https://www.alphavantage.co/support/>
- FMP：<https://site.financialmodelingprep.com/developer/docs/pricing>
- Yahoo使用条款：<https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html>
- Yahoo开发者限制：<https://legal.yahoo.com/us/en/yahoo/guidelines/ydn/index.html>


## 7. 数据库设计（可直接实现）

数据字段建议如下，最终由 Drizzle schema + migration 实现；Python 侧用共享协议/Pydantic 验证。

### 7.1 核心表

#### `providers`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | text PK | `fred`,`akshare_sge`,`gold_api`,`frankfurter`,`wgc_import` |
| `name` | text | 展示名称 |
| `base_url` | text NULL | URL |
| `auth_type` | text | none/api_key/manual_file |
| `enabled` | boolean | 是否启用 |
| `license_note` | text | 授权与限制说明 |
| `docs_url` | text | 官方文档 |
| `last_success_at` | timestamptz NULL | 最近成功 |
| `last_error` | text NULL | 简化错误 |

#### `instruments`

`id text PK`, `symbol text`, `display_name text`, `asset_class text`, `market text`, `quote_currency text`, `base_unit text`, `timezone text`, `is_tradable_reference boolean`。示例 `SGE_AU9999` 的 `base_unit = g`, `quote_currency = CNY`。

#### `series`

`id text PK`, `provider_id text FK`, `instrument_id text NULL FK`, `provider_series_id text`, `name_zh text`, `kind enum(quote,ohlc,observation,derived,imported)`, `frequency text`, `unit text`, `timezone text`, `description text`, `source_url text`, `is_enabled boolean`, `stale_policy jsonb`, `formula jsonb NULL`, `created_at timestamptz`。

#### `price_bars`

- `series_id text FK`
- `interval text` (`1d`,`1w`,`1mo` 等；不能从日线伪造 1min)
- `bar_time timestamptz`（保存绝对时间，按交易所本地交易日解释）
- `trading_date date NULL`（解决夜盘/交易日标记）
- `open numeric(24,10)`, `high numeric(24,10)`, `low numeric(24,10)`, `close numeric(24,10)`
- `volume numeric(28,10) NULL`
- `observed_at timestamptz NULL`, `ingested_at timestamptz`, `is_revised boolean default false`
- `source_record_id text NULL`, `quality_flags jsonb default []`
- 主键：`(series_id, interval, bar_time)`；常用索引 `(series_id, trading_date DESC)`。

#### `metric_observations`

- `series_id text FK`
- `period_date date`：经济指标所属日期/月份（主查询键）
- `period_end date NULL`：月/季统计结束日
- `value numeric(24,10) NULL`：不支持数值时不写0，使用空值和 quality_flags
- `published_at timestamptz NULL`：数据发布时刻（若官方无法确认可为空）
- `observed_at timestamptz NULL`：上游观测时间（若有）
- `ingested_at timestamptz NOT NULL`：本平台获取时间
- `revision_id text default 'latest'`, `source_record_id text NULL`, `quality_flags jsonb default []`
- 主键：`(series_id, period_date, revision_id)`；常用索引 `(series_id, period_date DESC)`。
- P0 允许 latest 覆盖并记录 `ingest_runs`，P1 扩展 revision 历史和 ALFRED vintage。

#### `latest_quotes`

`series_id text PK`, `value numeric(24,10)`, `currency text NULL`, `asof_at timestamptz NOT NULL`, `fetched_at timestamptz NOT NULL`, `provider_payload_hash text NULL`, `quality_flags jsonb`, `market_state text`。

#### `ingest_runs`

`id uuid PK`, `provider_id`, `job_type`, `series_id NULL`, `started_at`, `finished_at NULL`, `status enum(running,success,partial,failed)`, `inserted_count`, `updated_count`, `error_code NULL`, `error_message NULL`, `source_url NULL`, `duration_ms`。

#### `data_imports`

`id uuid PK`, `provider_id`, `dataset_type`, `file_name`, `file_sha256 UNIQUE`, `stat_period_end NULL`, `released_at NULL`, `imported_at`, `row_count`, `mapping_version`, `status`, `source_url`, `error_json`。

#### `dashboards`

`id uuid PK`, `owner_id uuid`, `name`, `layout_version integer`, `is_default boolean`, `created_at`, `updated_at`。

#### `dashboard_widgets`

`id uuid PK`, `dashboard_id uuid FK`, `type text`, `title text NULL`, `config jsonb`, `layout_desktop jsonb`, `layout_tablet jsonb`, `layout_mobile jsonb`, `schema_version integer`, `created_at`, `updated_at`。

#### `watchlists` / `watchlist_items`

Watchlist 包含 `owner_id,name,sort_order`；item 包含 `watchlist_id,series_id,sort_order,added_at`，建立唯一约束避免重复。

#### `alerts` / `alert_events`

- alert: `id`, `owner_id`, `series_id`, `condition_type`, `params jsonb`, `enabled`, `cooldown_seconds`, `last_evaluated_at`, `last_fired_at`, `created_at`。
- event: `id`, `alert_id`, `triggered_at`, `observed_value`, `threshold`, `series_asof_at`, `delivered_channels`, `dedup_key UNIQUE`, `status`。
- `alert_events` 用不可变事件记录避免重复触发。

### 7.2 必须遵守的数据正确性规则

1. **报价的时间**与**抓取时间**分开：`asof_at` vs `fetched_at`。
2. 月度央行统计属于某个统计月，即使两个月以后发布，也应落在统计月，不应画在发布月份；事件发布时间可以额外在时间轴显示。
3. 价格禁止 `float` 直接长期存储财务精度；DB 用 `numeric`，业务计算用 Decimal（Python）或明确精度函数（TypeScript）。
4. 记录所有归一化计算公式、采用的原始数据源和窗口参数。
5. 同一 series 相同时间点可以回补修订，但不能默默切换指标口径。口径变动需新 series 或新的 metadata version。
6. 相同来源短期故障不会清空数据；查询结果携带质量状态。
7. 一般情况下上游 JSON 只保留 hash/必要字段而非无限制存储全文，避免版权或空间问题。
8. 所有用户私有表使用 owner_id + 鉴权/RLS，避免用户之间读取彼此数据。

---

## 8. 后端 API 合约（HTTP JSON）

统一基路径 `/api/v1`，鉴权根据公开只读/私有写权限划分。使用 Zod 校验 query 和 body、统一错误响应。接口返回公开的数据类对象至少带 `source`, `asOf`, `fetchedAt`, `status`, `unit`。

### 8.1 读接口（P0）

```http
GET /api/v1/catalog?q=gold&category=precious_metals
GET /api/v1/series/SGE_AU9999_D1/metadata
GET /api/v1/series/SGE_AU9999_D1/bars?interval=1d&from=2023-10-01&to=2026-10-16
GET /api/v1/series/FRED_DFII10/observations?from=2023-01-01&to=2026-10-16
GET /api/v1/quotes?seriesIds=SGE_AU9999_QUOTE,XAUUSD_QUOTE,FX_USDCNY_D1
GET /api/v1/compare?seriesIds=SGE_AU9999_D1,FRED_DFII10&from=2024-01-01&to=2026-10-16&mode=index100
GET /api/v1/providers/health
GET /api/v1/dashboards
GET /api/v1/watchlists
GET /api/v1/alerts
GET /api/v1/alert-events
```

`/compare` 要求：先取原始数据再按用户指定的对齐方式计算；不同频率不能偷偷进行未来数据填充（look-ahead bias）；可选 `align=intersection|outer`，缺失值用 `null` 并附原因。

### 8.2 示例报价 JSON

```json
{
  "seriesId": "XAUUSD_QUOTE",
  "value": "4165.20",
  "unit": "USD/troy_oz",
  "currency": "USD",
  "source": { "id": "gold_api", "label": "Gold API", "url": "https://gold-api.com/" },
  "asOf": "2026-10-16T08:00:00Z",
  "fetchedAt": "2026-10-16T08:00:33Z",
  "status": "fresh",
  "marketState": "open",
  "isDemo": false,
  "disclaimer": "参考行情，不代表交易所可成交报价"
}
```

> 上例中的数值/时间仅为**接口结构示例**，不可直接当真实报价 seed 到正式数据库。

### 8.3 写接口（P0）

```http
POST   /api/v1/dashboards
PATCH  /api/v1/dashboards/{id}
PUT    /api/v1/dashboards/{id}/widgets  # 批量、事务性保存布局
POST   /api/v1/watchlists
POST   /api/v1/watchlists/{id}/items
DELETE /api/v1/watchlists/{id}/items/{seriesId}
POST   /api/v1/alerts
PATCH  /api/v1/alerts/{id}
DELETE /api/v1/alerts/{id}
POST   /api/v1/imports/preview         # 文件上限/格式验证/列名预览
POST   /api/v1/imports/commit          # 授权后提交，P1
```

同步管理接口可为受保护的 CLI 或 `/admin/*`，外网不暴露裸同步密钥。

### 8.4 错误结构

```json
{
  "error": {
    "code": "SOURCE_NOT_CONFIGURED",
    "message": "FRED API 尚未配置",
    "details": { "provider": "fred", "envVar": "FRED_API_KEY" },
    "requestId": "..."
  }
}
```

标准错误码：`SOURCE_NOT_CONFIGURED`,`SOURCE_UNAVAILABLE`,`SOURCE_RATE_LIMITED`,`DATA_STALE`,`INVALID_SERIES`,`UNSUPPORTED_INTERVAL`,`INVALID_UNIT`,`UNAUTHORIZED`,`FORBIDDEN`,`VALIDATION_ERROR`。

---

## 9. 核心计算规则与因子解释

### 9.1 国际黄金换算人民币/克

```text
TROY_OUNCE_GRAMS = 31.1034768
implied_cny_per_g = xau_usd_per_troy_oz * usd_cny / TROY_OUNCE_GRAMS
sge_premium_cny_per_g = sge_au9999_cny_per_g - implied_cny_per_g
sge_premium_pct = 100 * sge_premium_cny_per_g / implied_cny_per_g
```

- 只能将同一时间/适当时间差内的 XAU/USD 与 USD/CNY 作高质量比较。
- P0 使用日参考汇率搭配最新金价时，显示“**不同步估算**”提示，并保留各自 asOf。
- 若时间差超过设置阈值（例如跨交易日或超过 24h），不生成正式“实时溢价”，只给出含警告的参考值，必要时隐藏。
- 国内金价并非简单换算的精确等式，交易制度、供需、交易时间、点差都会影响溢价。

### 9.2 收益、回撤与波动

```text
simple_return = P_t / P_previous - 1
period_return = P_end / P_start - 1
running_peak = cummax(P_t)
drawdown = P_t / running_peak - 1
max_drawdown = min(drawdown)
```

- 统一提供价格回报（price return），不可在黄金价格指数未计入费用的情况下称为总回报（total return）。
- 对有交易日间断的数据不按日历天臆造收盘价。
- 计算日收益的时间范围、首尾样本与价格口径清晰提示。
- 可选简单移动平均 SMA（20/60/120 日），技术指标需声明算法版本。

### 9.3 不同量纲的对比模式

1. **独立面板模式（默认）**：每个指标自己的纵轴和单位。
2. **标准化指数模式**：选定共同起点，各 Series `100 * P_t / P_base`；若基准缺失，则显式说明使用最近可用的有效点/拒绝绘制。
3. **区间涨跌幅模式**：`100 * (P_t / P_start -1)`，用于价格/指数；对可能为负/零的宏观数据（如实际利率）不得直接使用百分比模式，应显示**百分点变化**。
4. **双轴模式**：仅适用于少量（不超过2种尺度）Series，轴标签和线色对应。

### 9.4 因子解释（第一阶段只实现基于规则的事实解释）

输入：实际利率、广义美元指数、USD/CNY、最近可得 WGC/ETF 流量（后期）、央行储备。输出：

- `latest`, `previous`, `delta`, `lookback`, `dataAsOf`, `source`, `historicalContext`。
- 可能影响方向 `supportive|headwind|mixed|unknown`。
- 用固定文本模板解释“常见理论关系”，并明确当前变化不代表金价必涨必跌。
- 不可生成没有来源的具体政策或事件原因；不能从单一相关系数推导因果。
- 2026年以后如引入 AI，模型只根据结构化事实与已检索来源生成文字，自动标注文献、时间与不确定性。

### 9.5 研究行为的防误导规则

- “黄金ETF 价格 GLD”与“全球黄金 ETF 资金流”是两种不同数据，标签不同。
- 美国“名义国债收益率 DGS10”与“实际收益率 DFII10”不能混写。
- 美元指数 DXY 与 FRED 广义美元指数不是一回事。
- 中国 SGE 现货 Au99.99 与上海期货交易所 SHFE 黄金期货连续合约不是一回事。
- 对“涨跌红绿”可配置但不要改变正负数学符号含义。
- 所有日级/周级/月级数据须显示来源时间；禁止只展示页面刷新时刻。

---

## 10. 预警系统设计

### 10.1 V1 可用规则

- `crosses_above`: 指标从低于/等于阈值穿越到高于阈值；例 Au99.99 上穿 1000 CNY/g。
- `crosses_below`: 下穿价格阈值。
- `pct_change`: 指定窗口内变动超过阈值，例如7个交易日变化 > 5%。
- `data_stale`: 指标超过各自 stalePolicy，提示数据源问题。
- `new_observation`: 新一期 CPI 或 DFII10 出现，触发“数据更新”事件。

### 10.2 运行原则

- 本地采集 job 完成后评估相关规则；云端日级规则随 GitHub Actions 执行；网站访问时也可触发轻量检查，但要做好幂等与防重复。
- 状态需持久化，使用 `dedup_key` + `cooldown_seconds` 处理重复通知。
- 不允许每次轮询同一个已在阈值之上的价格都重复触发穿越提醒。
- V1 必须完成站内提醒历史；邮件/Telegram/企业微信等为 P1 可插拔通知 Channel，不自行假设第三方凭据可用。
- 在预警规则页面注明“取决于数据更新频率，非保证即时触达”。

---

## 11. 自定义与扩展规范

### 11.1 新增资产或指标，理想改动范围

以新增纳斯达克100为例：

1. 在 `config/indicators.yaml` 新增指标元信息和单位。
2. 指定合规、可用的数据源 Adapter；若是已有通用 FRED 适配器则只传 series ID；若是股票/指数则新增 Provider。
3. 运行 `collector backfill --series ...`。
4. 在 Widget Catalog 选取该指标，保存到布局。
5. 若需要新的研究计算，再新增 `FactorDefinition`，不修改原有图表底层。

### 11.2 Provider Adapter 接口草案（Python）

```python
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol, Sequence

@dataclass(frozen=True)
class NormalizedObservation:
    series_id: str
    period_date: str   # YYYY-MM-DD
    value: Decimal | None
    observed_at: datetime | None
    published_at: datetime | None
    quality_flags: tuple[str, ...] = ()

class ProviderAdapter(Protocol):
    provider_id: str

    def validate_configuration(self) -> None: ...
    async def fetch_observations(
        self, series_id: str, start: str, end: str
    ) -> Sequence[NormalizedObservation]: ...

# 价格 OHLC/Quote 的返回类型定义为独立的 NormalizedBar/NormalizedQuote。
# 不要强迫月度 CPI 使用 OHLC 模型。
```

### 11.3 Widget 扩展协议

- 所有 Widget 必须提供：组件、configSchema、默认尺寸、支持的数据类型、加载态、空态、错误态。
- 看板布局 Schema 带 `schema_version`，升级时提供 migration。
- Widget 定义包使用 `registry.register(widget)`；不得在业务页面堆积巨大 `if/else`。
- 自定义公式优先提供安全的 JSON AST + 白名单运算函数，不使用 JS `eval` 或运行未经审查的用户 Python/JS。
- 可以通过导入/导出 JSON 保存个人 Widget 布局，不将访问令牌或私人数据包含其中。

### 11.4 时间、单位、市场日历统一

- DB 记录时刻为 UTC `timestamptz`；界面按设置时区显示（默认 Asia/Shanghai）。
- 日线数据另外记录 `trading_date`，不盲目用 UTC 日期替代交易所交易日。
- 数据标识中显式 `unit`、`currency`、`market`；只有同一单位或明确转换后才能比较数值。
- 对周/月指标保留统计期，而不是把它们绘制在抓取日期。
- 首次实现时至少覆盖：中国法定休市/周末、美国宏观节假日缺值、汇率市场不同步；无需手工穷举所有未来节假日，市场日历组件允许升级。

---

## 12. 本地开发、免费部署与安全

### 12.1 本地一键体验模式

**必须做到：不申请 API Key 也可以启动。**

```bash
cp .env.example .env
pnpm install
# Python collector 用 uv 或 pip 安装并运行初始化
# docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- 无 Key 时，可以显示独立“DEMO MODE”标签并读取 `fixtures/` 里的模拟数据，**只用于演示 UI**。
- 真正 API/数据库运行模式与 Demo 在代码上明确分离，Demo 不写正式行情表。
- 提供 `make dev` / `pnpm setup:local` 包装上面的命令，并在 README 写清系统要求和替代办法。
- 即使本地数据库未启动，也应给清晰错误提示而不是白屏。

### 12.2 云端低成本部署方案（可选、非 V1 开发前置）

- **前端/API**：Vercel Hobby 等个人用途免费托管（服务条款/限额以部署时为准）。
- **PostgreSQL + Auth**：Supabase Free 或同类免费 Postgres（可能存在空闲暂停、容量和网络限制）。
- **数据采集**：GitHub Actions 运行日级任务，`workflow_dispatch` 手动触发。适合日级/周级，不保证分钟精度。
- **密集实时数据**：可用 Next.js 服务端 API 按需拉取 + 缓存；若后续需要持续采集/更高频，再迁移到付费后台任务或自托管容器。
- **私有模式**：强制登录，拒绝匿名写；仅个人所有者可管理 Provider 设置和导入。
- 只有在供应商授权允许时才能公开共享其行情，默认网站私有访问。

### 12.3 安全要求

- `FRED_API_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 等仅 server/collector 使用。
- `.env.example` 仅占位符，`.gitignore` 覆盖 `.env`, `.env.local`, 上传文件临时目录。
- 所有写接口需要鉴权与 owner 权限检查；托管 Postgres 启用 RLS（如用 Supabase）。
- 本地无鉴权 Demo 仅监听 localhost，`NODE_ENV=production` 时不能启用本地 auth-bypass；如检测到立即拒绝启动。
- 对导入文件限制大小、扩展名、内容类型、行数；XLSX 只使用安全解析库，禁止执行宏和任意公式。
- 对用户输入做验证、防 XSS、CSRF、SQL 注入、SSRF（导入来源仅允许白名单官方域名），限制 API 请求频率。
- 价格数据接口可以公开只读，但若站点整体单用户私有，优先保护所有非登录 API。
- 源头数据写入前做 sanity check 和单位校验，避免被异常供应商值污染数据库。
- 数据库每日/每周备份策略、导出/恢复说明与数据保留策略写入文档。

---

## 13. 开发阶段与可验收交付物

### Milestone 0：基础工程

- 初始化 monorepo、Next.js、Tailwind、图表依赖、Python collector、Postgres 与 Docker。
- 配置 lint、format、TS strict、pytest、CI、env/example、schema migration。
- 构建统一 shell（侧边栏、导航、搜索入口、主题）。
- 产出：一条命令启动页面 + CI 构建成功。

### Milestone 1：真实数据闭环（最优先）

- 接通 `SGE_AU9999_D1`, `FRED_DFII10`, `FRED_DGS10`, `FX_USDCNY_D1`, `XAUUSD_QUOTE`。
- 容错/回填/归一化/写入/查询完成；显示每条数据的 asOf/fetchedAt/source。
- 缺密钥/联网失败时优雅降级。
- 产出：历史日K、实际利率线图、金价卡、接口文档。

### Milestone 2：可定制研究看板

- Widget Registry、拖动与调整尺寸、布局保存、自选列表、指标目录与搜索。
- 指标对比：双轴/标准化/独立图；支持至少两项不同频率指标正确对齐。
- 产出：真正可长期使用的个人研究看板。

### Milestone 3：规则与数据管理

- 预警、站内历史记录、手动同步、数据源状态、错误显示、CSV 导入基础支持。
- 支持计算 `DERIVED_XAU_CNYG` 并在时间不匹配时提示。
- 完整单测、集成、E2E、性能/无障碍冒烟测试。

### Milestone 4：扩展研究（P1）

- WGC ETF、央行储备 Excel 导入；CFTC COT 接口。
- 研究笔记、事件标注、导出 CSV/JSON、布局模板。
- 丰富历史风险指标，如最大回撤、滚动波动率、收益分布。

### 13.1 GitHub 阶段性提交与推送（必须）


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

### 13.2 强制测试清单（至少覆盖）

**采集/解析**

- AKShare SGE 日 OHLC 列映射正确；无 volume 时返回 null。
- AKShare 实时接口返回多行时，依据源字段选择最新有效记录，不把“运行时间”伪装成行情 asOf。
- FRED 缺失 `.` 转为空值，不为0；相同序列重复导入不产生重复行；支持修订回填。
- Frankfurter USD/CNY 返回方向正确，不能倒置为 CNY/USD。
- Gold API 缓存至少30秒；未配置历史 API Key 不请求历史接口。
- Provider 超时/429/非 JSON/字段变化能够被捕获，DB 原数据不丢失。

**金融计算**

- 当 XAUUSD = 3100 USD/oz、USD/CNY = 7.1 时，人民币/克约 `707.64`，以高精度 Decimal 计算（测试允许合理舍入差异）。
- 收益与回撤以实际样本价格计算，对零/负分母有保护。
- 10年实际利率 `2.5% → 2.7%` 是 `+0.2 百分点`，不是 `+8%` 的默认显示。
- CPI 的同比变化必须用12个月前相应月份指数，不是上个月。
- 不同频率组合禁止用未来已公布数据填充过去（look-ahead）。

**前端**

- 无数据可辨识空状态，有数据展示正确单位、统计日、来源与更新状态。
- 拖拽布局保存后刷新不丢失；错误 config 自动给出可恢复提示。
- 中国红涨绿跌 / 国际绿涨红跌配置切换正常。
- 同一 K 线图出现正确 OHLC，若无 OHLC 则不能选 K 线。
- 修改日期范围后所有比较图表一致刷新。
- 数据过时/源不可用时显示旧值但明确标记，不误导为实时。

**安全与构建**

- API Key 不出现在浏览器响应和打包静态资源中。
- 未登录不能修改他人的 watchlist/dashboard/alert。
- `NODE_ENV=production` + 本地 auth bypass 被拒绝。
- CSV/XLSX 恶意内容与超大文件拒绝，错误信息不泄漏 secrets。
- `lint`, `typecheck`, `test`, `build` 全部通过；至少一个 Playwright 主要用户流程通过。

### 13.2 V1 Definition of Done（只有全部满足才可称完成）

- [ ] 新机器按照 README 在无需付费订阅的前提下启动站点。
- [ ] 网站有可用的默认黄金研究看板，桌面/手机均可访问。
- [ ] 国内黄金三年真实日历史可以导入并绘制，显示元/克与来源。
- [ ] FRED 至少两个实际指标 + Frankfurter 汇率 + Gold API 最新参考价完成真实请求/归一化/展示。
- [ ] 缺 Key、休市、429、源更新滞后、接口报错均有可理解状态。
- [ ] 可添加/删除 Widget、保存布局、查看指标信息和自选。
- [ ] 可设置、启停、保存价格阈值预警；满足条件可生成站内事件。
- [ ] 数据源操作有清晰的配置和诊断步骤。
- [ ] 原始官方来源链接及必要的许可/署名文案可被用户看到。
- [ ] 仓库有 migration、seed、测试、CI、README、DATA_SOURCES、API_SETUP、DEPLOYMENT、IMPLEMENTATION_STATUS。
- [ ] 任何 Demo/假数据都有清晰标签，永不混入真实历史。

---

## 14. 项目完成后：免费 API 的实际配置步骤

Codex 必须将本节落实为 `docs/API_SETUP.md`，可复制操作，截图或命令视情况补充。

### 14.1 FRED（推荐首先接入）

1. 打开：https://fred.stlouisfed.org/ ，注册免费账号并登录。
2. 打开：https://fred.stlouisfed.org/docs/api/api_key.html 申请 API Key。
3. 将 Key 放入项目根目录或 collector 对应 `.env` 中：

```dotenv
FRED_API_KEY=replace-with-your-fred-key
```

4. 执行 `pnpm data:sync:fred` 或仓库生成的等价命令。
5. 在“数据源管理”查看 FRED 已配置、最近成功时间、DFII10 真实最新统计日期。
6. 常见错误：401/403检查Key；空值 `.` 不能视为失败；非工作日无新值属于正常。

### 14.2 Frankfurter（无 Key）

1. 测试 `curl https://api.frankfurter.dev/v2/rate/usd/cny`。
2. 执行 `pnpm data:sync:fx`。
3. 检查页面单位 `CNY/USD` 及数据日期。
4. 明确标记为**日度参考汇率，不是分钟实时**。

### 14.3 Gold API（最新报价无 Key，历史需额外配置）

1. 测试 `curl https://api.gold-api.com/price/XAU`。
2. 执行 `pnpm data:sync:gold`；源端 `updatedAt` 入库，缓存不短于30秒。
3. 如需历史 OHLC：按 https://gold-api.com/pricing 的免费档规则注册获取 Key，再配置 `GOLD_API_KEY`；先测 `/ohlc/XAU` 的参数和配额，严禁盲目轮询消耗额度。
4. 不同来源的 XAU/USD 有细小价差，所有显示均注明“Gold API参考报价”。

### 14.4 上金所 Au99.99（无 Key，但来源可能失效）

1. 安装锁定的 AKShare 版本，运行 collector 的 `diagnose akshare_sge`。
2. 执行 `pnpm data:backfill:sge`（回填 3 年），核对日线数据数量及 OHLC。
3. 每天执行 `pnpm data:sync:sge`，只增量更新，并回查最近7个交易日。
4. 如接口报错，优先检查 AKShare 官方文档/版本和上金所官网是否改动；不要自动改成期货数据冒充现货。
5. 管理页面支持导入用户从上金所导出的 CSV/XLSX 作为手工备用方案。

### 14.5 WGC 文件导入（P1）

1. 打开官方黄金ETF或央行储备页面，下载对应 Excel。
2. “数据源管理 → WGC → 上传数据”。
3. 预览：选择数据口径（吨/美元、全球/地区/国家）、统计月份、列映射。
4. 执行导入；同一文件 hash 不重复写入，导入后页面显示统计期、文件来源和最近导入日期。
5. 不在授权不清晰时进行自动公开镜像。

### 14.6 `.env.example` 必含字段

```dotenv
# Shared
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
APP_TIMEZONE=Asia/Shanghai
DATABASE_URL=postgresql://atlas:atlas@localhost:5432/atlas
DATA_MODE=demo       # demo | live

# Only for local dev; production must refuse bypass
LOCAL_DEV_NO_AUTH=true

# External sources
FRED_API_KEY=
GOLD_API_KEY=       # optional for history; latest price works without key

# Optional cloud authentication (document actual setup)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Collection / protection
INGEST_REQUEST_TIMEOUT_SECONDS=15
GOLD_QUOTE_MIN_CACHE_SECONDS=30
```

密钥字段在运行时使用项目真实环境变量机制处理；`.env.example` 不含真实密钥。`DATA_MODE=demo` 必须显式有 DEMO 标识。

---

## 15. 典型扩展用例与未来迭代契约

为了保证该项目在未来持续增长，加入任何新功能时都应遵守：

1. **先补 Catalog，再写逻辑。** 任何资产/指标必须有标准化 ID、单位、频率、说明与来源。
2. **先补 Provider Adapter，再做可视化。** 页面不准自行下载上游 JSON。
3. **先保存真实来源和时间，再做解释。** 不允许 AI 提示词绕过数据层生成“现在是多少”。
4. **图表只依赖项目内部标准 API。** 任意 Provider 替换时不需要改 Chart Widget。
5. **持久化 Schema 可迁移。** Dashboard/Widget config 每次增加破坏性变更必须有迁移脚本。
6. **历史数据口径不可悄悄改。** 期货价格不是现货价；美元强度代理不是真 DXY。
7. **费用与限制透明。** 新数据源必须登记是否免费、是否需 Key、频率、商业许可、速率、最晚可用日期。
8. **上线前测试。** 新 Provider 必须包含 fixture、解析测试、缺失/限流/时间戳测试。

未来可以添加的研究主题：

- 纳斯达克100：指数/ETF价格、估值、收益率、回撤、盈利增长、美元/实际利率敏感性。
- 股票：财报、股价、估值、事件时间线、公司概览。
- 债券：收益率曲线、期限利差、实际收益率、通胀预期。
- 黄金：国内外溢价、月度ETF流量、央行购金、CFTC持仓、历史风险区间。
- 组合研究：定投、资产配置、回撤统计；避免混合不同币种而不换算。

---

## 16. 交给 Codex 的建议推进方式

若在 Codex 对话里使用这份文件，推荐第一条指令如下：

> 请阅读 `INVESTMENT_RESEARCH_PLATFORM_SPEC.md`，根据第0节工作指令开始实施。首先确认运行环境，建立 monorepo、PostgreSQL schema 与迁移、Python Provider Adapter、Next.js API、实际黄金研究 Dashboard，并实现一个可测试的端到端 V1。完成每个 Milestone 后运行测试和构建、更新 `docs/IMPLEMENTATION_STATUS.md`，按第13.1节创建独立、说明清晰的 commit 并推送 GitHub（如果推送被阻塞则报告真实状态），再继续下一个 Milestone。在没有 API Key 或外网不可用时，用严格标注的 Demo 模式保证可运行，不能捏造实际行情。不要仅生成设计稿或空组件。优先保证真实 Au99.99 历史数据与 FRED/Frankfurter/Gold API 的接入和数据新鲜度标记，然后再做可定制 Widget、观察列表和预警。如存在第三方接口/授权限制，请记录并提供不冒充实时行情的降级实现。

### 16.1 Codex 每轮输出必须包括

- 本轮新增/修改文件清单。
- 已完成的用户可见功能和访问路径。
- 数据 API 哪些已实测可用、哪些未配置或失败。
- 已运行的测试、构建及其结果。
- 本地启动/同步命令。
- 剩余风险与下一阶段优先级。
- 本阶段 Git commit SHA、提交主题、远程分支、`git push` 成功/失败情况及失败原因（如有）。

### 16.2 避免的反模式

- 只有漂亮截图，数据无源、无时间戳。
- “实时黄金价格”使用写死的静态数字或日期。
- 把 SGE Au99.99 与 SHFE 黄金期货混为一谈。
- 通过股票价格模拟黄金 ETF 资金流。
- 某数据源失败就空白或全部显示 0。
- 列表里面每个组件都有独立供应商 fetch，造成高请求量且字段不一致。
- 直接将 TradingView 网站的前端 JS、接口或需要付费授权的图库搬到自己网站。
- 将 GitHub Actions 当作可靠的逐分钟调度系统。
- 在未授权情况下对外重分发受限制的第三方数据。

---

## 17. 已核实的官方/一手技术参考文档（2026-10-16）

1. TradingView Lightweight Charts — 开源图表库及署名要求：<https://tradingview.github.io/lightweight-charts/docs/5.0>；授权说明：<https://www.tradingview.com/free-charting-libraries/>
2. AKShare 上海黄金交易所历史/行情接口：<https://github.com/akfamily/akshare/blob/main/docs/data/spot/spot.md>；AKShare 使用风险说明：<https://github.com/akfamily/akshare/blob/main/docs/introduction.md>
3. FRED API：<https://fred.stlouisfed.org/docs/api/fred/>；Key：<https://fred.stlouisfed.org/docs/api/api_key.html>；DFII10：<https://fred.stlouisfed.org/series/DFII10>；美元强弱代理：<https://fred.stlouisfed.org/series/DTWEXBGS>
4. Frankfurter v2 API（免费的日度参考汇率）：<https://frankfurter.dev/>
5. Gold API 最新报价、历史接口与免费限制：<https://gold-api.com/llms.txt>；<https://gold-api.com/pricing>
6. 世界黄金协会全球黄金 ETF 资金流：<https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows>
7. 世界黄金协会央行官方储备：<https://www.gold.org/goldhub/data/gold-reserves-by-country>
8. CFTC 历史 COT 数据：<https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm>
9. GitHub Actions 调度限制：<https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>

> 参考文档不是永久合同。实际编码前请复核 API 版本、字段、条款、速率、免费额度与部署限制。记录复核日期在 `docs/DATA_SOURCES.md`。

---

## 18. 最后确认：V1 的优先取舍

如工程过程中出现资源冲突，严格按以下顺序做选择：

**数据准确与可追溯 > 可运行与安全 > 灵活可配置 > 图表交互 > 视觉效果 > AI/高级分析。**

最终目标是一个用户真正可以每天打开、后续能稳定增量开发的个人投资研究工作台，而不是一次性 Demo。
