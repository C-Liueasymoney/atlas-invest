# Atlas Invest

个人黄金与宏观研究工作台：Next.js / React / TypeScript、PostgreSQL、Python collector。中文深浅主题、可编辑看板、日K与折线、指标比较、自选、站内预警和数据源配置中心。所有正式数据都经过供应商适配、校验、归一化与存储；演示数据明确隔离。

## 无 Key 启动体验

需要 Node.js >=22（推荐22 LTS）与 npm。

```sh
npm ci
npm run setup:local
npm run dev
```

打开 [研究看板](http://localhost:3000/dashboard) 或 [API配置中心](http://localhost:3000/settings/data-sources)。默认仅监听本机，Demo不需要数据库或Key。根目录`.env`由npm脚本自动加载。Demo价格为合成fixture，界面与接口均有标签；仅布局/自选/规则/笔记写入独立`.atlas`目录，正式行情表不接收Demo。

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

2026-10-16本轮真实验证：三年729根Au99.99日K，最新交易日10月16日，收盘901.57 CNY/g；重复同步0新增0修订。这里只记录验证证据，不会将该值固定seed为正式报价。SGE最新报价当日返回未来交易日标签，适配器正确拒绝，日线不受影响。

FRED命令将同一Key复用于`FRED_DFII10`、`FRED_DGS10`和其他catalog序列；Frankfurter：`--series FX_USDCNY_D1`；Gold：`--series XAUUSD_QUOTE`；CFTC：`--series CFTC_GOLD_NET_SPEC_W`。实际参数见`--help`。

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
