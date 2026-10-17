# API 配置与授权

进入 `/settings/data-sources`。一个 Provider 使用一套凭据，旗下所有已注册指标复用；不按指标重复申请 Key。

- **FRED**：在 https://fred.stlouisfed.org/docs/api/api_key.html 申请免费 Key。服务端 `.env` 设置 `FRED_API_KEY`；重启后连接测试只探测 DFII10。未配置时明确返回 not_configured。
- **Gold API**：当前 XAU/USD 最新参考价无需 Key，最短缓存30秒并尊重 Cache-Control。`GOLD_API_KEY` 仅保留给将来历史功能；当前不会请求历史 endpoint，也不会虚构历史K线。
- **Frankfurter**：无需 Key，USD/CNY 日度参考汇率，不能用作盘中成交汇率或 USD/CNH。
- **AKShare / SGE**：无需 Key。安装 Python collector 后可采集 Au99.99 日线。公开页面接口可能失效；最新报价源时间在2026-10-16实测异常，正确拒绝，不替换为抓取时间。
- **Alpha Vantage**：设置 `ALPHA_VANTAGE_API_KEY`，默认25次/日预算。当前实现官方 SYMBOL_SEARCH 和搜索样本探测；不据此宣称黄金/ETF/股票行情 endpoint 权益已验证。两个不同搜索复用同一凭据。尚未实现其行情落库，因此不能将其设为任意现有 Series 的已验证备源。
- **FMP**：配置模板，尚未实现 endpoint。Yahoo 默认关闭且无采集实现。

也可在 live 模式网页保存加密凭据。先设置 `CREDENTIAL_ENCRYPTION_KEY`（32随机字节base64，例如 `openssl rand -base64 32`），数据库仅保存 AES-256-GCM 密文与后四位；主密钥只在部署环境。修改/删除须确认。环境变量优先，网页不能删除环境变量凭据。Demo 禁止持久化凭据。不得把 Key 放在浏览器存储、URL、截图或 Git。

配置导出只包含 Provider 的启停、预算和路由；不含明文、密文或后四位。导入不配置凭据。路由必须与已验证 Catalog 中的品种/市场/货币/单位/频率/spot或future定义一致；未验证映射被拒绝。

所有实时读取都经内部 API。缓存/配额/请求去重由 Provider Controller 处理，live 使用 PostgreSQL advisory lock 跨 worker 串行保留预算；Demo 为进程内体验。Python独立采集器有独立幂等锁和缓存，当前用量统计是任务次数估算，重试物理次数未完整计费，因此免费严格日限额的 AV 行情不接入 Python。

## 本地真实预览
默认 `DATA_MODE=preview`，真实行情通过 `npm run data:refresh` / 首页「刷新数据」写入私有缓存，不要求PostgreSQL。FRED仅读取服务端环境变量Key，缺Key留空；网页加密保存凭据需live。Web刷新按Provider启停/Controller预算控制；CLI是显式本地采集任务，不共享Web进程内用量。Gold读取时遵守至少30秒及源Cache-Control中更长的缓存自动刷新。正式持久化、跨worker预算与加密凭据请使用live。
