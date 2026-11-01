# 资产相关性与组合风险分析

入口 `/analytics/correlation`，导航“相关性与风险”。同一登录、Catalog、Provider、数据库查询及Dashboard系统。无需新增依赖。运行方式沿用README。

## 数据和方法

- 分析用历史观察，不把最新报价追加为正式日收盘。优先`seriesData`读取price_bars/metric_observations；仅在指数数据库无历史时读取已有Provider持久化快照，绝不在分析GET中直接抓第三方。
- `engine.ts`为纯函数，`service.ts`负责统一查询、资产口径和版本缓存；新增价格资产在`transform()`登记历史回报口径、Catalog/Provider接入；不能把宏观序列随意登记为价格。
- 价格简单收益率 P(t)/P(t-1)-1，DGS10/DFII10/DFF按百分点差乘100得到bp。指数仅价格回报，不含股息/费用。FX本身按USD/CNY报价变化分析（不是可持仓资产）。
- 日频先独立计算收益，然后只配对起止日期完全一致的区间。周频ISO周、月频自然月取周期最后实际观察；缺整期则不跨期桥接。周/月日期为周期标签，不代表周初/月初可得。没有前填、未来填充或将休市日收盘虚构成交易。
- 换币先按观察日准确匹配USD/CNY。人民币价格不再次乘汇率；美元价换CNY乘、CNY换USD除；缺同日汇率的观察无效。相关性不要求不同黄金序列单位相同：收益率无量纲，未把盎司价格直接当作克价。将来若比较价格水平，1金衡盎司=31.1034768克。
- 至少20个有效配对样本；常量/无效/不支持序列返回null和原因，不返回伪造的0。重复冲突日期作缺失，非正价格不计算收益。矩阵每对独立取交集，对角线同样检查样本和方差。
- missingRate分母为所选资产观察周期并集（排除首个无收益周期），不是自然日覆盖率；丢失的共同有效变化显示滚动断点。不同市场收盘不同时，相关系数可能受错位影响。
- 滚动窗口30/60/120/252指有效配对变化数。日期范围不足时显示N/A。矩阵不一定半正定，不直接充作组合协方差矩阵。
- 缓存键包括资产、日期、频率、币种、算法atlas-corr-v1和完整底层序列哈希（含来源/采集时间）；最多32项。数据刷新使用已有同步器/Provider控制器，并带所选历史起止日期（live）；index优先FRED历史同步，失败才尝试已接入公开指数参考源。preview仍遵循原有预览采集能力。

## 来源清单（2026-11-01线上数据库核验）

|资产|Provider|历史条数/最新日期|Key与限制|
|---|---|---|---|
|Au99.99|AKShare/SGE|738 / 2026-10-30|免费公共日线，交易日口径|
|NASDAQ100|FRED|783 / 2026-10-29|免费FRED Key，官方价格指数日观察；腾讯快照备源约320条，仅数据库无历史时使用|
|SP500|FRED|783 / 2026-10-28|同一FRED Key；不是SPY或期货|
|USD/CNY|Frankfurter|1359 / 2026-11-01|公共日参考汇率，不是逐笔外汇成交|
|DGS10 / DFII10|FRED|各784 / 2026-10-29|同一Key；只分析基点变化，不是债券回报|
|DFF|FRED|1096 / 2026-10-29|利率变化，不允许成为组合持仓|
|XAU/USD|Gold API|只有最新报价，无可用历史|无Key；相关性显示历史不可用，压力情景可作为手动假设参考资产|
|债券ETF|尚未接入|不可用|没有虚构价格或拿DGS10替代ETF|

本机真实采集缓存另已核验黄金/汇率2025-10-16至2026-10-16：191个共同区间，Pearson -0.3405145065。这是历史数据验证，不是当前市场预测。选择5年不代表供应商已覆盖5年，实际样本范围以API/单元格为准；源不支持的历史不会造数补足。FRED密钥继续通过现有网页配置中心保存。

## 投资组合与压力情景

百分比输入须合计100%；金额输入均为已换算基准币市值，自动归一化。初始10万元、25%纳指+10%黄金+65%现金仅是可修改示例，未编造20%债券ETF。支持多个组合、改名、复制、删除、CNY/USD现金。

报价币种和实际货币敞口分别说明。对未换币的外币敞口，输入USD/CNY假设冲击后，(1+本币资产冲击)*(1+汇率冲击)-1；USD基准中的CNY资产采用汇率因子倒数。已转换为基准币回报的敞口不重复叠加。外币敞口缺显式汇率假设即拒绝。现金本币收益显式为0，不含利息。

压力结果是初始权重的单期加权冲击，显示模拟前后价值、总损益、亏损、每资产金额和净亏损贡献；抵消亏损的资产贡献可以为负，净亏损为0时贡献比例N/A。默认20%亏损阈值、25%高波动目标、30%提示阈值均可编辑。高波动分类目前显式为NDX/SP500，不冒充实测波动。

所有预设均为假设，不是历史回放。低于阈值不能保证真实最大回撤。历史组合收益/年化波动/最大回撤/协方差/风险贡献作为后续增强：当前history-risk接口明确返回unavailable和null，未来必须采用完整共同样本并说明固定权重再平衡假设。

## API、存储与组件

- GET `/api/v1/analytics/assets/availability`
- GET `/api/v1/analytics/correlation?assets=...&from=...&to=...&frequency=daily|weekly|monthly&currency=CNY|USD`
- GET `/api/v1/analytics/correlation/rolling?...&a=...&b=...&window=60`
- POST `/api/v1/analytics/refresh` `{assets,from,to}`
- GET/POST `/api/v1/analytics/portfolios`；GET/PUT/PATCH/DELETE `/:id`；POST `/:id/copy`
- POST `/api/v1/analytics/portfolio/scenario` `{portfolio,shocks,fxShockPct}`，或已保存组合 `portfolios/:id/scenario`
- GET/POST `portfolios/:id/history-risk` 返回后续增强状态

所有接口复用鉴权与同源保护。迁移0004增加owner隔离analytics_portfolios，config必须JSON对象。preview/demo各自私有文件，禁止提交。回滚代码可保留新增表及组合数据。

研究看板“添加组件”提供correlation-matrix、rolling-correlation、portfolio-stress-test；选择资产或已保存组合后保存布局。配置为稳定type及JSON schema；不完整资产编辑保留本地，避免中途使组件失效。独立页面与组件支持深浅主题、移动端滚动、加载/失败/空状态；CSV包含演示标识和计算参数。
