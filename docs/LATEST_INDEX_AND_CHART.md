# 最新报价与折线同步

2026-10-31：线上原纳指100的FRED观察值截至10月29日，标普500截至10月28日。FRED是日收盘发布源，保留为历史/失败兜底，不作为实时指数源。

主报价、侧栏报价与指数主图统一使用 `/api/v1/market/index-quote?seriesId=FRED_NASDAQ100|FRED_SP500`。POST绕过普通缓存，但不绕过预算/停用/冷却；GET复用短缓存。主报价时间按源端提供，美股源端时间按America/New_York解析（包括夏令时），采集时间独立保留。

已实测腾讯公共行情 `us.NDX`（纳斯达克100）与 `us.INX`（标普500）的名称、代码、USD货币及时间字段，ECS可达；对应usfqkline端点提供同源日线（最多320条）。不是QQQ、SPY、期货或纳斯达克综合指数。该公开参考源可能延时和限流，不代表专业实时接口或商业再分发授权。

Yahoo `^NDX`、`^GSPC`的INDEX类型、USD、最新价和日线已在本机验证，价格与主源相符；ECS访问超时，因此保留为默认关闭的可选备源，不能依赖其云端可达性。新浪公共端点本机可读，但云端返回Forbidden，未接入。

若最新源失败，先保留最近可信指数快照，再回退FRED。快照与同源近期日线保存在provider_cache，保持来源时间单调，不改写原FRED观测。新增provider `tencent_index`，无数据库迁移，seed新增元数据行。

折线将最新主报价按市场日期加入末端，或仅替换显示层的同日末端。日K仍使用原始OHLC，不把盘中参考价变成已收盘K线；最新点明确标记来源与时间。历史范围按钮对传入日线也生效，超出供应商覆盖的范围明确提示“最多320条”。没有FRED Key也可读取公共指数参考价与同源近期图表。

核验源：
- https://gu.qq.com/usNDX
- https://gu.qq.com/usINX
- https://finance.yahoo.com/quote/%5ENDX/
- https://finance.yahoo.com/quote/%5EGSPC/
- https://fred.stlouisfed.org/series/NASDAQ100
- https://fred.stlouisfed.org/series/SP500

当次探测值（非固定种子）：NDX约28384.85；SP500约7580.07，源日期均为美东2026-10-30。
