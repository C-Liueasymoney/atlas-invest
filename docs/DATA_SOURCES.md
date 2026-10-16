# 真实数据采集

核对日期：2026-10-16。采集器只处理真实上游数据；`DATA_MODE=demo`（以及未显式设置为 `live`）拒绝数据库写入。无 Key 的 `--probe` 可独立验证上游，不连接数据库。所有金额/利率使用 `Decimal`；JSON 中用字符串返回，避免精度丢失。

## 安装与命令

从仓库根目录运行，推荐 Python 3.12：

```sh
python3.12 -m venv services/collector/.venv
services/collector/.venv/bin/python -m pip install -r services/collector/requirements.lock
services/collector/.venv/bin/python -m pip install --no-deps -e services/collector
services/collector/.venv/bin/python -m pytest services/collector/tests

# 无数据库的真实探测，可在 demo 模式执行
services/collector/.venv/bin/python -m atlas_collector sync --series SGE_AU9999_D1 --start 2026-10-01 --end 2026-10-16 --probe
services/collector/.venv/bin/python -m atlas_collector sync --series XAUUSD_QUOTE --probe
services/collector/.venv/bin/python -m atlas_collector sync --series FX_USDCNY_D1 --probe

# 先应用数据库迁移并导入 catalog；凭据由服务端环境继承
export DATA_MODE=live
# 使用安全的环境管理方式注入 DATABASE_URL 和可选 FRED_API_KEY
services/collector/.venv/bin/python -m atlas_collector backfill --series SGE_AU9999_D1
services/collector/.venv/bin/python -m atlas_collector sync --series FRED_DFII10
```

默认首次采集最近三年，已有非报价序列的 `sync` 从最近数据日期前14个自然日重查，以覆盖正常情况下至少7个交易日。`backfill` 总是使用完整日期范围；可显式传 `--start YYYY-MM-DD --end YYYY-MM-DD`。指标从 `config/indicators.json` 注册，`ATLAS_CATALOG_PATH` 可指定部署时的绝对目录。添加 FRED 指标不需要复制凭据或修改图表。

## 核对过的上游

| Provider | 官方文档 | 凭据 | 采集语义 |
|---|---|---|---|
| AKShare / SGE | [AKShare 文档](https://github.com/akfamily/akshare/blob/main/docs/data/spot/spot.md)、[实现](https://github.com/akfamily/akshare/blob/main/akshare/spot/spot_sge.py)、[SGE](https://www.sge.com.cn/sjzx/mrhq) | 无 | `spot_hist_sge('Au99.99')` 返回日线；`spot_quotations_sge` 返回分钟参考走势 |
| FRED | [Observations V1](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)、[Key](https://fred.stlouisfed.org/docs/api/api_key.html) | 服务端 `FRED_API_KEY` | 通用 series observations，支持分页；原始统计日，日/月等原始频率 |
| Frankfurter | [官方 v2 文档](https://frankfurter.dev/) | 无 | `/v2/rates?from=...&to=...&base=usd&quotes=cny`，日度参考汇率 |
| Gold API | [官方说明](https://gold-api.com/llms.txt) | 最新报价无 | `/price/XAU`，USD/troy_oz；最少缓存30秒，遵循更长的 Cache-Control |

上金所日线以 `Asia/Shanghai` 零点作为日期桶标识，不代表当日开盘成交事件；`observed_at` 留空。上游没有成交量，因此 `volume=NULL`。报价从有效分钟行选择最新事件，日期取自源端更新时间；只有有明确信息的午夜跨日场景才调整前一自然日，并标质量旗标。源端日期在未来时拒绝写入。不要用采集时间填充上游时间。

FRED `.` 转为 SQL NULL，不转为0。`realtime_start` 是实时查询区间信息，不伪装发布时间；未知 `published_at/observed_at` 留空。修订前的 latest 值以稳定的 `revised:<hash>` 保存，新的 latest 值原地更新。Frankfurter 保持实际响应日期和 USD/CNY 配对；不是 USD/CNH，也不是盘中成交价。Gold API 必须有可解析且含时区的 `updatedAt`。

## 幂等、故障与缓存

单 series 会话 advisory lock 覆盖拉取和写入；同一 series 并行作业返回 `already_running`。批次在 PostgreSQL 事务内 upsert；相同记录不更新采集时间、不制造修订；修改过的日线标记 `is_revised`。报价禁止较旧源时间覆盖较新报价。

`ingest_runs` 记录成功、失败、缓存命中、耗时及插入/更新数；失败不会删除原有行情。错误输出仅含安全类别和固定说明，原始异常、带密钥 URL 和响应体不写日志。HTTP 网络/5xx 最多3次指数退避；401/403/429立即结束。AKShare 在独立进程中运行，总超时75秒，最多3次尝试。`provider_request_usage` 按作业记录，是本地作业计数，不等于上游物理请求/重试次数。

Gold API 缓存由数据库跨进程共享，短于30秒的头不会缩短缓存，更长的 Cache-Control 会延长。`--probe` 是显式诊断，每次直接请求上游，应避免频繁调用。GitHub Actions 的日度采集只提供定时快照；不能标为持续实时行情。

## 实测结果与限制

2026-10-16 实测（真实读取，并已在本地 PostgreSQL 完成三类成功数据的写入）：

- Au99.99 日线：默认三年回填成功，共729条；10月8日至16日有7条，重复同步插入0/更新0。16日 OHLC 为 `893.99 / 902 / 893 / 901.57 CNY/g`，成交量为空。
- Frankfurter：10月1日至16日共16条，16日参考 USD/CNY=`6.6853`。
- Gold API：数据时间 `2026-10-16T14:34:37Z`，参考报价 `4192.399902 USD/troy_oz`。
- SGE 最新报价：源端 `更新时间=2026年10月19日 22:32:57`，当时实际为16日晚。疑似夜盘使用下个交易日标签；在官方交易日历/节假日映射尚未验证前返回 `invalid_timestamp`，保留旧报价。此路径不能声称已通过最新报价写入验收。
- FRED：环境无 Key，真实认证及数据拉取未验证；返回 `not_configured`。标准化、缺失值、分页用官方结构样本测试。

Alpha Vantage/FMP/Yahoo、CFTC、WGC导入不在此采集器核心交付中；不能将 Provider 配置模板误写为已经通过采集验证。上游授权和再分发条款需按用途核查，AKShare 不提供交易所商业授权保证。

## PostgreSQL 集成测试与调度

本地真实 PostgreSQL 验证：19项测试全部通过，无跳过；日线重复采集插入0/更新0，Gold API 紧接重复采集返回 cached。设置仅供测试使用的 `TEST_DATABASE_URL` 后执行 pytest。集成测试会创建独立临时 schema，验证幂等、修订、整批回滚、旧报价保护、失败保留和缓存；结束删除该 schema，不会修改 public 表。未配置时这些测试明确 skip。

`.github/workflows/collect.yml` 每工作日 UTC 21:20 执行，也支持手动选择 series。先设置仓库 `DATABASE_URL` secret 并完成迁移/catalog seed；FRED 可选设置 `FRED_API_KEY` secret。单指标失败会继续收集其他指标，最终任务报失败。无 FRED Key 时明确跳过相关指标。
