# 黄金价格复核记录

核对时间：2026-10-17，Asia/Shanghai。本次只读取真实上游，未修改采集解析器、数据库、正式种子、启动配置或页面。父任务确认此前 localhost:3000 运行于 Demo，展示的 Au99.99 约739.3048、XAU 3100属于合成示例；不能作为真实价格。

## 上金所 Au99.99：交易日2026-10-16

直接读取[上海黄金交易所每日行情](https://www.sge.com.cn/sjzx/quotation_daily_new?end_date=2026-10-16&start_date=2026-10-16)，按**日期完全相等、合约完全相等 Au99.99**筛选，排除iAu99.99、Au100g和延期合约。官方HTML表头为日期、合约、开盘价、最高价、最低价、收盘价、涨跌（元）、涨跌幅、加权平均价、成交量（kg）等。

| 字段 | 官方日报 |
|---|---:|
| 开盘价 | 893.99 CNY/g |
| 最高价 | 902.00 CNY/g |
| 最低价 | 893.00 CNY/g |
| 收盘价 | 901.57 CNY/g |
| 官方涨跌额 | +8.61元 |
| 官方涨跌幅 | +0.96% |
| 加权平均价 | 898.18 CNY/g |
| 官方报告成交量 | 6654.08 kg |

日报明确日期是10月16日；核对日在周六10月17日，不能把这根日线日期改成“今天”。页面中没有可可靠提取的源端发布时间，保存 `sourcePublishedAt:null`，抓取时间另存。成交量列直接保留为 `reportedVolumeKg`，没有将kg悄悄混入原先未定义成交量口径的OHLC字段。

`reportedChange=8.61`、`reportedChangePct=0.96`直接取自官方表格，百分比字段以百分数存储（0.96表示0.96%，不是0.0096）。`reportedChangeBasis=exchange_reported_not_derived`。本次不推断交易所涨跌比较基准，也不将其替换成由前收盘计算的日收益；如页面另行计算，应使用独立字段并标明计算口径。

AKShare 1.18.64 的 `spot_hist_sge` 确实向 `https://www.sge.com.cn/graph/Dailyhq` POST `instid=Au99.99`，原始最后一行是：

```text
["2026-10-16", 893.99, 901.57, 893.0, 902.0]
# 原始顺序 date,open,close,low,high
```

独立直接POST与collector规范化输出、官方日报的OHLC逐字段Decimal比较均相等。检查过实际安装的AKShare源码及collector子进程路径，没有fixture分支；HTTP_PROXY、HTTPS_PROXY、ALL_PROXY、NO_PROXY均未设置。默认三年滚动区间返回728根日线，末日为10月16日，历史日期没有被统一改写成当前日。

## 国际金价、汇率与换算核验

本次读取的[Gold API官方XAU端点](https://api.gold-api.com/price/XAU)返回参考报价 `4166.100098 USD/troy_oz`，源时间 `2026-10-17T06:59:41Z`，抓取时间 `2026-10-17T06:59:54.224138Z`。这是供应商参考报价，不能冒充上海黄金现货或珠宝门店零售价。

[Frankfurter官方v2](https://api.frankfurter.dev/v2/rates?from=2023-10-17&to=2026-10-17&base=usd&quotes=cny)返回1097条日度参考记录，最新观察日 `2026-10-17`，USD/CNY=`6.684`；发布时间未知，保持NULL。该默认混合源数据会随来源更新而修订，应保存实际响应日期与抓取时间，不将其标为盘中银行成交价。

按 `XAUUSD × USDCNY ÷ 31.1034768` 计算，结果为 `895.27653883 CNY/g`。相对于国内10月16日收盘901.57，算术差约 `6.29346117 CNY/g`，比值差约 `0.70296282%`。这个比较存在观察时点错配，仅用于数量级和单位核对，不是同一时刻可成交溢价，也不是投资建议。

## 临时复核快照

以下文件仅放在 `/tmp`，供本地预览读取，不提交仓库：

- `/tmp/atlas-verified-SGE_AU9999_D1.json`：真实三年OHLC，`asOf/fetchedAt/sourceUrl/unit/records`，额外附最新日 `officialDaily` 交叉核对元信息。
- `/tmp/atlas-verified-XAUUSD_QUOTE.json`：真实XAU供应商参考报价和源时间。
- `/tmp/atlas-verified-FX_USDCNY_D1.json`：真实日度参考汇率及观察日期。
- `/tmp/atlas-verified-SGE_OFFICIAL_DAILY.json`：官方HTML最新日精确匹配行的结构化诊断和抓取时间；未知源发布时间保持NULL。

这些是本次读取快照，不等于持续实时订阅，也不构成正式数据库入库验收。父任务可用其提供明确标识的只读真实数据预览；切换Demo/预览/正式模式应在界面明确显示。

SGE分钟走势接口仍把更新时间标为未来交易日；collector继续返回 `invalid_timestamp`，没有用本地时间或猜测交易日历填补。FRED无Key时应继续返回 `not_configured`，不生成0价格或仿真正式值。

## 复核命令

从仓库根目录执行（均不写数据库）：

```sh
services/collector/.venv/bin/python -m atlas_collector sync --series SGE_AU9999_D1 --probe
services/collector/.venv/bin/python -m atlas_collector sync --series XAUUSD_QUOTE --probe
services/collector/.venv/bin/python -m atlas_collector sync --series FX_USDCNY_D1 --probe
services/collector/.venv/bin/python -m atlas_collector sync --series SGE_AU9999_QUOTE --probe
```

未发现需要修改现有OHLC价格解析的证据，因此本轮没有生产代码变更。修正页面应以明确区分Demo和真实预览为首要措施，而不是把不同市场、不同观察时间或珠宝零售价混成同一指标。
