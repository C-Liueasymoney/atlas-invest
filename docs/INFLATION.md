# 中美 CPI 同比通胀率

指标目录中搜索“通胀”可找到美国 `US_CPI_YOY_M`、中国 `CN_CPI_YOY_M`。可加入自选、看板的价格图表组件。
图表工作台点击“比较中美通胀 · 近10年”，按月在同一个百分比轴上比较。可以选1、3、5、10年或输入1–100的整数，自定义开始/结束日期亦可。

- 美国：FRED 的 CPIAUCNS（CPI-U 全部项目、未季调），请求 `units=pc1`，即 `(本月CPI/上年同月CPI - 1) × 100`。与已有 CPIAUCSL 季调价格指数分开注册。参见 https://fred.stlouisfed.org/docs/api/fred/series_observations.html 和 https://fred.stlouisfed.org/series/CPIAUCNS 。
- 中国：东方财富 `RPT_ECONOMY_CPI` 的 `NATIONAL_SAME`，全国 CPI 同比增长率，已经是百分比，不再减100、不与 NATIONAL_BASE/城市/农村数据混用。供应商页面 https://data.eastmoney.com/cjsj/cpi.html 。
- 月初日期表示统计观察月份，不是发布日期；缺失保持空、零和负值有效。比较图只对齐共同有效月份，不前向填充。最新观察月份可能不同。
- 首次同步回填最多100年范围内上游实际提供的历史；数据源历史不足的区间只显示已有数据，不补造。后续Python同步增量回查近期数据。数据源失败保留旧值与状态。

## 本地 preview
美国需要根目录 `.env` 的 `FRED_API_KEY`；中国不需要Key。

```sh
npm run data:refresh -- --series CN_CPI_YOY_M
npm run data:refresh -- --series US_CPI_YOY_M
```

## 服务器 live
先 `npm run db:seed` 注册新增Provider和指标（无需新增表迁移）。沿用原先数据库FRED密钥；中国无需凭据。
更新后的 `deploy/collect.sh` 每轮包含两国通胀；现有每30分钟systemd定时器无需更改周期。手动网页同步和Python定时采集都受既有预算、停用与路由检查控制。

```sh
services/collector/.venv/bin/python -m atlas_collector sync --series CN_CPI_YOY_M
services/collector/.venv/bin/python -m atlas_collector sync --series US_CPI_YOY_M --skip-unconfigured
```

运行Python时由systemd/部署环境安全注入DATA_MODE、DATABASE_URL和加密主密钥；不要将凭据写入Git或命令历史。
