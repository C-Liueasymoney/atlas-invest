# 2026-11-06/07：持仓研究与 MCP 正式部署

本次接续已读取共享对话《拓展投资学习功能》、GitHub最新功能分支与交接文档。分支为 `codex/agent-research-workspace`，本轮基础版本 `b6d6464`。本地原工作区干净，使用fetch/快进与跟踪分支切换，未重写历史。

## 正式运行

- 网站：https://47.101.193.94/investments
- MCP：https://47.101.193.94/mcp
- 实例：上海 `i-uf6e1z4hkdc3u03591w2`，项目 `/opt/atlas-invest`。
- `atlas-web`、新增 `atlas-agent`、Nginx与PostgreSQL运行正常；3000、3001、5432仅监听loopback。原有公网443、HTTPS和owner认证保持生效。
- MCP使用 `/opt/atlas-invest/runtime/server.mjs` 纯Node产物，由systemd以atlas用户运行、读取既有root:0600环境文件；没有上传开发机原生运行包作为Linux网站产物。
- 0005/0006增量迁移完成，表归属atlas，已登记schema_migrations。Catalog元数据seed完成，不写演示行情。
- 中美通胀四条序列已真实同步：CN同比/环比各225条，US同比/指数各1199条，观察月均截至2026-09。完整采集任务随后退出0。

## 构建与回滚

没有再次在2GB服务器执行全量npm ci。隔离目录 `/opt/atlas-deploy-staging/research-b6d6464-20261106` 复用同版本Linux依赖，补齐新增依赖及对应Linux esbuild二进制；验证Linux SWC后执行webpack生产构建，单worker、640MB Node堆、systemd限制内存和CPU。构建期间原网站持续运行，构建成功后才切换。

- Linux构建日志：`/var/log/atlas-research-staging-build.log`，含 `RESEARCH_BUILD_SUCCESS`。
- 激活日志：`/var/log/atlas-research-activate.log`，含 `PRODUCTION_RELEASE_VERIFIED`。
- 切换前加密数据库备份：`/var/backups/atlas-invest/atlas-20261106T153119Z.sql.gz.enc`；密钥沿用服务器私有文件，不进入仓库。
- 旧网站产物、源码、Nginx、私有环境与原依赖备份：`/opt/atlas-deploy-staging/research-previous-20261106T1540`（仅管理员可读）。
- 授权页修复前的MCP产物：`/opt/atlas-deploy-staging/agent-consent-before-20261106.mjs`。

回滚应先停止相关服务，恢复备份源码/旧.next及Nginx、环境，再检查配置并启动；0005/0006为增量表，可保留持仓与授权状态。应用Git回滚不恢复数据库。恢复私有环境时必须保留后续真实凭据变更；不得把备份中的凭据输出到日志或Git。

## 验证与授权页修复

- 本轮初次全量PostgreSQL回归136通过、3条件跳过；新增浏览器回归后为38测试文件、137通过、3跳过。
- lint、strict typecheck、本地production build、Linuxproduction build、独立MCP运行包构建与启动检查通过。
- 390px浏览器流程通过：持仓登记、固定任务、复制失败全文回退、结果恢复保存、来源/因素/观察项展示。
- 临时生产进程与正式公网均通过OAuth DCR+PKCE、initialize、三个工具、真实PG任务读取、结果写回、重复提交相同回执和网页读回。只清理本次技术验收生成的ID与临时OAuth授权，保留用户数据。
- 原有公网证书、登录、安全Cookie、CSRF拒绝、受保护Catalog/看板/行情、退出检查通过；匿名MCP返回401。

首次实际浏览器同意失败的原因是授权页全局 `Referrer-Policy: no-referrer` 导致原生表单发送 `Origin: null`，被严格同源检查拒绝。新增真实Chromium表单回归先复现失败，再仅对同意页改用 `strict-origin`；保留完整CSRF Cookie、Origin、PKCE、scope/resource和令牌检查。该策略仅发送origin，不泄露授权请求查询串。修复产物已部署到MCP服务，网站无需为此重新切换。

## 客户端接入

本机Codex已通过官方CLI注册并完成OAuth，权限为 `research:read research:submit offline_access`。凭据由Codex官方本机存储管理，网站密码未写入MCP配置或研究指令。需要新开Codex聊天加载工具；其他电脑需各自连接同一URL并授权。

本机CLI 0.142.5支持的命令为：

```sh
codex mcp add atlas-invest --url https://47.101.193.94/mcp
codex mcp login atlas-invest --scopes research:read,research:submit,offline_access
```

`add`可能自动开始OAuth。不要再显式重复传resource：本机版本已自动发现它，再传会产生重复resource数组而被服务端拒绝。不要在本机版本的add命令使用不支持的 `--oauth-client-registration` 参数。

ChatGPT账户中的Atlas私人MCP配置已填妥，已进入“连接Atlas Invest”最终确认页；账户连接与实际工具调用尚待该确认完成，不能标为已授权或已验收。自动元数据发现/DCR在ChatGPT侧失败，未观察到对应注册请求到达服务器；按界面支持的方式手工填写已验证端点，并为界面给出的精确回调预注册无密钥公共客户端后进入连接步骤。未以无鉴权接口绕过。

`npm run agent:package`已生成本机忽略目录下的私人插件包；生成包或Codex连接成功不等于ChatGPT账户已安装。新增真实浏览器回归依赖既有Playwright Chromium；CI已将浏览器安装提前到单元测试前，README验证命令同步。
