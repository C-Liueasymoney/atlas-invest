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

## 区间累计物价与购买力

选定区间后，通胀详情/看板图表及比较图显示三项：累计物价涨幅、复合年均涨幅、维持期初1万单位本币消费所需的期末金额。另显示不计利息时，同额现金折算为期初价格的购买力及其变化。

美国补充原始未季调 `US_CPI_INDEX_M`（FRED CPIAUCNS，1982–1984=100），用期末/期初CPI比值算价格因子F；与CPIAUCSL季调指数不混接。
中国补充 `CN_CPI_MOM_M`（NATIONAL_SEQUENTIAL，全国月环比率），从锚点之后第一个月到末月连乘 `(1 + 环比/100)` 得到F。锚点当月环比不乘入；缺失中间月份或无效因子时返回不可计算。因为公布环比值有舍入，结果明确标为估算，不作为官方定基指数精确累计值。

- 累计涨幅 = `(F − 1) × 100%`
- 年均涨幅 = `(F^(12/实际月份数) − 1) × 100%`
- 维持期初1万单位本币消费所需金额 = `10000 × F`
- 今天1万单位本币相当于期初购买力 = `10000 / F`
- 同额现金购买力变化 = `(1/F − 1) × 100%`

计算按完整观察月份选取端点，明确标出实际起止月。历史不足、最后月份尚未发布时不外推、不把实际短区间冒充完整n年；仅有一个点时不计算年化。
美国金额单位为美元，中国为人民币；不是汇率折算，也不表示个人实际支出、工资、存款利息或投资回报。

`npm run data:refresh -- --series US_CPI_YOY_M` / `CN_CPI_YOY_M` 及网页同步会同时更新对应基础序列；定时采集也已增加两条基础序列。部署时运行 `npm run db:seed` 注册新增元数据，再同步数据即可，无新表迁移。
新增接口：`GET /api/v1/inflation/{US_CPI_YOY_M|CN_CPI_YOY_M}/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`，使用现有身份鉴权。
