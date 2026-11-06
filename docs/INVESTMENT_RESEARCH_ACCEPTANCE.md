# 投资研究工作台：验收与使用说明

日期：2026-11-06。功能入口：`/investments`。网站不调用大模型；检索、推理和解释由你使用的 Codex / ChatGPT Work 执行。

## 交付内容

| 能力       | 实现行为                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 真实持仓   | 登记股票、ETF、基金、黄金、现金等，保留代码、市场、投资范围、计价币种、实际货币敞口、手动市值/比例与日期；允许代码待确认；编辑保留版本 |
| 组合概览   | 按币种展示手动市值，按资产类别展示已登记比例；不把不同币种市值直接相加，不把市值快照冒充账户收益                                       |
| 持仓研究   | 单项体检、组合共同风险、事件课堂与决策复盘均可生成任务；默认近30天，可修改；事件最多5条                                                |
| 复制指令   | 自动包含任务编号、目的、时间范围、读取/分析/保存/确认步骤；没有密码或永久凭据；剪贴板不可用时显示可选全文                              |
| 事件与学习 | 保存事实、来源、可能影响机制、成立条件、抵消因素、事件、学习概念、下一步观察与资料限制                                                 |
| 决策与复盘 | 保存当初的持有理由、支持证据、反证条件、期限与复查日期；修改保留原始版本；AI复盘追加关联                                               |
| 自动写回   | 授权后的远程MCP读取固定任务上下文，提交结果并查询服务器回执；完成后返回结果页面链接                                                    |
| 一致性     | 相同提交重复请求返回同一回执；不同结果冲突；撤销/过期拒绝新提交；旧持仓快照明确标注                                                    |
| 故障恢复   | 写回失败保留提交JSON，可在任务页恢复导入；复用相同格式、权限和幂等校验                                                                 |

持仓为用户手动登记；本次不自动访问券商账户。基金精确穿透需要具体产品和相应日期的披露；没有完整交易流水和行情时不计算实际账户收益。AI分析始终显示为外部AI生成，格式校验不证明内容真实。

## 日常怎么用

1. 打开网站，登录后进入导航“持仓研究”。登记各项真实持仓；不确定的代码留空并选择待确认。
2. 如需记录投资理由，新建决策，填写理由、证据、反证条件、预计持有期限和复查日期。
3. 选择需要研究的持仓或某条决策，创建相应研究任务；任务页可再次复制同一任务的AI指令。
4. 在已经接入 Atlas 的 Codex 或 ChatGPT Work 新会话粘贴指令。AI读取任务、自行查找资料并通过工具写回。
5. AI收到保存回执并核实状态后返回结果链接。打开链接即可查看来源、影响因素、事件解释、观察项或复盘。
6. 使用其他电脑或手机打开同一部署的网站，读取同一份任务和结果。再次研究创建新任务，可链接上一份结果。

任务7天有效。复制任务后网站显示“待执行”，不会凭复制动作声称AI已经运行。代码/投资范围不明或执行端没有联网能力时，应明确记录资料缺口。对于短期涨跌，结果应保留“可能机制”和“无法确定”，不能把相关事件当作已证实因果。

## 本地启动

安装依赖：`npm ci`。网站沿用 `npm run dev`。MCP服务使用 `npm run agent:start`，默认仅监听 `127.0.0.1:3001`。

在项目根 `.env` 中配置：

```dotenv
# 示例地址；替换为你实际使用的地址
ATLAS_PUBLIC_BASE_URL=http://127.0.0.1:3000
ATLAS_AGENT_PUBLIC_URL=http://127.0.0.1:3001
ATLAS_AGENT_PORT=3001
# OWNER_PASSWORD 复用你的个人工作台密码，至少12字符；不写入提示词
# 网站与MCP使用同一DATA_MODE、ATLAS_PROJECT_ROOT或数据库
```

开发环境允许loopback HTTP；生产必须HTTPS。demo/preview研究状态分别保存在根`.atlas`中的私有文件；文件锁协调网站与MCP进程。若进程崩溃遗留锁，确认网站和MCP都已停止且没有写入进程后，管理员才可清理对应`.lock`目录。live使用PostgreSQL事务行锁。

## 服务器部署

部署前备份；安装新依赖并构建，执行 `npm run db:migrate`（新增0005投资状态、0006 OAuth状态）。保留原数据和备份。

在服务器 `deploy/.env` 配置真实公开地址：

```dotenv
DATA_MODE=live
ATLAS_PUBLIC_BASE_URL=https://你的站点地址
ATLAS_AGENT_PUBLIC_URL=https://你的站点地址
ATLAS_AGENT_PORT=3001
```

复用既有数据库、OWNER_PASSWORD与SESSION_SECRET。公开地址必须为可信规范HTTPS origin，不含凭据、查询参数或片段；不能填Tailscale私网地址并假定云端AI能够访问。

1. 将 `deploy/atlas-agent.service` 安装到systemd并启用。它从现有服务端环境读取配置，以atlas用户运行，仅绑定loopback，不公开数据库端口。
2. 在现有Nginx HTTPS server块中include `deploy/agent-nginx.conf`。它将 `/mcp`、OAuth元数据/授权/令牌/注册/撤销及同意页路由到3001。OAuth的Origin必须保持真实公网值，不能使用网页API的私网Origin改写。
3. 检查 `nginx -t` 后再reload；重启网站与MCP，验证公网 `/agent/health`、`/.well-known/oauth-protected-resource/mcp` 和OAuth元数据。
4. 无令牌请求 `/mcp` 应返回401；禁止将不需要鉴权的示例配置用于真实持仓。
5. 验证实际浏览器授权与AI调用，再声明该客户端接入完成。

OAuth由官方MCP SDK提供协议路由与PKCE验证；应用实现owner同意、客户端/授权码/令牌持久化、资源和scope校验、刷新轮换与撤销。授权码一次使用，两分钟到期；access token一小时；请求offline_access时refresh token最长30天。令牌不会进入研究指令，access/refresh只存散列。

## 连接 Codex 与 ChatGPT Work

### Codex电脑端

部署公网MCP后，在对应电脑设置 `ATLAS_AGENT_PUBLIC_URL`，运行：

```sh
npm run agent:connect
```

脚本先验证公网健康检查，然后调用官方 `codex mcp add` 与 `codex mcp login`。浏览器出现Atlas同意页后，输入个人工作台密码并授权。新会话可使用三个工具。不同本地运行环境可能需要各自接入；本地配置不等于所有电脑自动同步。

### ChatGPT Work与移动端

1. 在ChatGPT网页的Plugins入口选择添加自定义MCP服务。
2. Server URL填真实 `https://你的站点地址/mcp`；选择OAuth与动态客户端注册（DCR），不填写网站密码作为API Key。
3. 如需显式scope，使用 `research:read research:submit offline_access`；不填时默认读写权限，但没有离线刷新。
4. 安装到个人插件目录并完成Atlas授权，然后在Work会话选择Atlas插件，粘贴网站复制的任务。
5. 在账户实际可用的手机Work入口重复验收。手机Codex若连接远程主机，主机需在线且具备对应工具配置；云环境也需单独验证网络与工具支持。

`npm run agent:package` 可根据公开地址生成 `.atlas/atlas-invest-plugin/` 私人插件包（manifest与远程MCP配置）。本地插件包不代表已经在ChatGPT账户安装；Work/移动端以实际注册的私人MCP连接为准。

官方参考：[私人插件接入](https://developers.openai.com/plugins/quickstart)、[插件支持范围](https://learn.chatgpt.com/docs/plugins)、[OAuth要求](https://developers.openai.com/plugins/build/auth)。

## 本次验证记录

- GitHub远端已fetch并确认最新，开发分支为 `codex/agent-research-workspace`。
- 完整Web回归：37个测试文件，136通过、3个现有条件跳过；使用独立PostgreSQL并先执行迁移/基础元数据seed，`--maxWorkers=2 --testTimeout=20000`。跳过项不作为已验证能力。
- 真实PostgreSQL验证投资状态多进程写入、唯一回执、冲突、原子完成、owner隔离，以及OAuth刷新重放后的整组撤销持久化。
- 官方MCP SDK客户端完成HTTP授权码+PKCE、initialize、工具列表、读任务、超过100KB结果写回及状态读回；验证只读scope、CORS预检、回环临时端口、匿名注册容量和刷新重放。
- `npm run lint`、`npm run typecheck`、`npm run build`通过。独立最终审查所报问题已修复并复审通过。
- 390px移动端E2E通过：登记、复制失败全文回退、恢复提交、来源/因素/观察项展示。

## 当前远程接入状态

用户最终要求本终端停止部署和账号接入，开发完成后推送GitHub。接续说明、服务器实际变更、备份、已知安装失败及另一终端完整接入步骤见 [另一终端交接文档](NEXT_TERMINAL_HANDOFF.md)。

本次已通过用户登录的Workbench上传源码并备份。服务器npm安装先遇内部镜像不可达，改用官方仓库后又被2GB实例OOM终止；384MB堆限制也未成功。脚本未进入新构建/迁移/服务切换。源码已复制、root node_modules可能不完整，旧standalone运行产物未被替换；不能把状态写成完全没有改动或已经上线。

MCP公网部署与ChatGPT账户私人插件均未完成。用户可在另一终端按交接文档继续。网站不需要大模型API Key。

附加构建命令：`npm run agent:build` 产出纯Node MCP/迁移工具，`npm run agent:verify-runtime` 验证运行产物；已在本机验证。生产网站应在Linux环境构建，再部署standalone，避免在2GB运行服务器重复安装全部开发依赖。

公开npm审计返回10项moderate，来自已有eslint-config-next/minimatch和ExcelJS/uuid依赖链；本轮新增MCP运行SDK未出现在报告中。未执行会降级主依赖的force修复；记录留待独立依赖升级处理。
