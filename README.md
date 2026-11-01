# Atlas Invest

国内黄金主报价优先使用上金所最新延时行情：打开页面、恢复可见和可见页面每5分钟检查；点击「刷新数据」绕过普通报价缓存重新请求，仍遵守供应商预算和故障冷却。请求失败时明确标记陈旧并依次回退最近成功报价、最近日收盘价。源页面只提供日期时，另列采集时间，不冒充精确成交时间。日线图表与最新报价独立，不用盘中价格覆盖历史收盘。API：`GET/POST /api/v1/market/domestic-quote`。授权服务申请及费用核查见 [国内黄金行情来源](docs/GOLD_MARKET_DATA_OPTIONS.md)。

个人黄金与宏观研究工作台：Next.js / React / TypeScript、PostgreSQL、Python collector。中文深浅主题、可编辑看板、日K与折线、指标比较、自选、站内预警和数据源配置中心。所有正式数据都经过供应商适配、校验、归一化与存储；演示数据明确隔离。

## 本地真实行情预览

需要 Node.js >=22（推荐22 LTS）、npm 和 Python 3.12/3.13。

```sh
npm ci
npm run setup:local
python3.12 -m venv services/collector/.venv
services/collector/.venv/bin/python -m pip install -e 'services/collector[test]'
npm run data:refresh
npm run dev
```

打开 [研究看板](http://localhost:3000/dashboard) 或 [API配置中心](http://localhost:3000/settings/data-sources)。默认 `DATA_MODE=preview`，仅监听本机，不需要数据库；读取采集器生成的实际行情缓存，首页突出 Au99.99 收盘价、相邻有效交易日变化和主图，研究组件在「研究看板」标签中。根目录 `.env` 由 npm 脚本自动加载。

点击「刷新数据」或运行 `npm run data:refresh` 可重新采集。SGE、Gold API、Frankfurter无需Key；FRED缺Key留空。Gold API参考报价读取时遵守至少30秒及源Cache-Control中更长的缓存；日线按交易/统计日期显示，绝不标成盘中价。私有实际行情在根目录 `.atlas/market-snapshot.json`，已忽略、不提交；它与PostgreSQL正式存储独立。采集失败保留最近实际值并标记陈旧，首次无数据则留空，不以假价填补。预览偏好独立存入 `.atlas/preview-state.json`；首次保留既有Demo布局/笔记/自选，预警与事件重新建立；生产请配置下文的 `live` 模式。

显式设 `DATA_MODE=demo` 可离线体验合成图表；行情接口带 `isDemo:true`，首页报价留空并标「演示数据」。Demo不是市场报价。

### 配置免费的 FRED 数据

纳斯达克100指数和标普500指数使用 FRED 的官方日收盘序列 `NASDAQ100`、`SP500`。同一枚免费 Key 也可读取本项目中的美国利率、CPI 和美元指数。

**已部署的 live 网站推荐直接网页配置：**登录后进入 `/settings/data-sources` → FRED →「编辑 / 设置凭据」→ 输入 Key 并确认保存 →「测试连接」→ 同步指标。Key 由服务端以 AES-256-GCM 加密存入 PostgreSQL，网页后端与 Python 定时采集共用；替换、删除后下一次读取生效，无需重启。服务器每30分钟采集一次，已纳入纳斯达克100和标普500。加密主密钥由服务器单独管理，不通过网页或 Git 传递。

下面的环境变量方式适用于不连接数据库的本地 preview。环境变量优先于数据库；使用网页管理时，服务器不要再设置非空的 `FRED_API_KEY`。

1. 登录 [FRED API Keys](https://fredaccount.stlouisfed.org/apikeys)，创建并复制一枚 Key。申请说明见 [FRED 官方文档](https://fred.stlouisfed.org/docs/api/api_key.html)。
2. 仓库根目录还没有 `.env` 时先运行 `npm run setup:local`；已有时不要覆盖。
3. 编辑根目录 `.env`，将 `FRED_API_KEY=` 改成 `FRED_API_KEY=你的Key`。不要把 Key 发到聊天、截图或提交到 Git。
4. 运行 `npm run data:refresh`，再运行或重启 `npm run dev`。
5. 打开 `/dashboard`，在「选择主图指标」中切换到「纳斯达克100指数」或「标普500指数」。显示的是日收盘观察值，不是 QQQ、SPY、期货或盘中报价。

没有 Key 时两个指数仍会出现在看板选择器和自选中，但数值保持空白并显示未配置，不会用演示价格替代。

## 接入真实数据

先安装 Docker（或自行准备 PostgreSQL >=17）与兼容的 Python 3.12/3.13，然后：

```sh
docker compose up -d db
npm run db:migrate
npm run db:seed
python3.12 -m venv services/collector/.venv
services/collector/.venv/bin/python -m pip install -e 'services/collector[test]'
```

根目录`.env`中设置：

```dotenv
DATA_MODE=live
LOCAL_DEV_NO_AUTH=false
OWNER_PASSWORD=replace-with-a-long-private-password
SESSION_SECRET=replace-with-at-least-32-random-characters
FRED_API_KEY=your-private-fred-key
```

数据库地址默认指向本地Compose。`npm run dev`后在`/login`登录，进入数据源配置中心。FRED需要免费Key；Alpha Vantage的可选符号搜索需要Key。SGE、Frankfurter、Gold API最新报价、CFTC无需Key。Gold历史/FMP/Yahoo没有当作已完成的行情能力。网页凭据加密保存还需要`CREDENTIAL_ENCRYPTION_KEY`，也可只用环境变量，不在数据库保存Key。

### 验证最新 Au99.99

在终端安全导出与`.env`相同的`DATABASE_URL`和`DATA_MODE=live`（Python CLI不会自动读取.env）。示例中不要把真实Key放入命令历史。

```sh
# 不写数据库，查看上游最新有效日K、交易日与来源
services/collector/.venv/bin/python -m atlas_collector sync --series SGE_AU9999_D1 --probe
# 三年历史回填与持久化
services/collector/.venv/bin/python -m atlas_collector backfill --series SGE_AU9999_D1
# 后续增量，默认重叠回补近期窗口
services/collector/.venv/bin/python -m atlas_collector sync --series SGE_AU9999_D1
```

登录后查看`/indicators/SGE_AU9999_D1`，或调用`GET /api/v1/series/SGE_AU9999_D1/bars?interval=1d`，将最后一条`time/open/high/low/close`与[上金所每日行情](https://www.sge.com.cn/sjzx/mrhq)核对。界面“数据截至”是交易/统计日期，“采集”是抓取时间；历史日线不标盘中实时。

2026-10-17复核：最新交易日10月16日，Au99.99收盘901.57 CNY/g、前有效收盘892.96；+8.61、+0.96%。OHLC与上金所官方日报逐字段一致。三年滚动窗口当日728根日K。该数值是当次真实采集证据，未固定seed为正式报价；SGE分钟报价返回未来交易日标签，适配器继续拒绝。详见 [价格复核记录](docs/PRICE_VERIFICATION.md)。

FRED命令将同一Key复用于`FRED_NASDAQ100`、`FRED_SP500`、`FRED_DFII10`、`FRED_DGS10`和其他catalog序列；Frankfurter：`--series FX_USDCNY_D1`；Gold：`--series XAUUSD_QUOTE`；CFTC：`--series CFTC_GOLD_NET_SPEC_W`。实际参数见`--help`。

## 验证与部署

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
services/collector/.venv/bin/python -m pytest services/collector/tests -q
```

设置`TEST_DATABASE_URL`后，Web与Python测试会执行真实PostgreSQL集成；Web owner测试使用独立schema并清理，不写入正式市场数据。没有该变量时相应集成测试会明确skip。GitHub CI配置PostgreSQL服务并执行上述检查，不能把本地通过写成远端CI已通过。

生产部署必须禁用本地bypass、配置密码/会话秘密、HTTPS与`APP_BASE_URL`；然后`npm start`或使用仓库Dockerfile。单owner鉴权不是多租户系统。云端SGE采集通过外置job执行，不能假设serverless存在本地Python。

## 当前交付边界

本轮交付可运行、可验证的V1核心；严格规格验收仍未全部满足：FRED缺Key尚未完成两条真实序列请求；Alpha Vantage仅符号搜索/样本探测，行情适配与两个行情指标验证未完成；当前路由仅接受已核实Catalog映射，没有可用的跨Provider等价备源；SGE最新报价存在源时间异常。Excel文件必须整理为单表并明确映射日期/数值列，未自动识别每版WGC原始工作簿。Python离线job不自动评估站内预警，网站行情读取/手动评估/网页同步会评估；不保证即时通知。完整市场节假日日历、图表事件标记、完整多用户Auth/RLS和邮件通知为后续工作。

[实施状态与阶段提交](docs/IMPLEMENTATION_STATUS.md) · [API设置](docs/API_SETUP.md) · [源文档与实测](docs/DATA_SOURCES.md) · [接口契约](docs/API.md) · [导入](docs/IMPORTS.md) · [部署与备份](docs/DEPLOYMENT.md)

## 资产相关性与组合风险

进入 `/analytics/correlation`（导航“相关性与风险”）：选择历史资产、区间、日/周/月及CNY/USD，点击矩阵查看滚动窗口、散点和CSV；页面下方可保存多个模拟组合并设置单期假设冲击。利率使用bp变化，不作为债券价格；无历史的XAU及未接入债券ETF明确不可用。三个分析Widget可加入现有研究看板并保存配置。

live先执行 `npm run db:migrate`（新增0004组合表）；其余启动及凭据配置沿用上文。计算、来源覆盖、FX和再平衡边界、API及后续历史风险接口见[分析模块说明](docs/ANALYTICS.md)。历史组合波动/回撤等仍为后续增强，不以单期情景替代。
