# 另一终端继续：部署与 Atlas 私人插件接入

更新时间：2026-11-06。接续终端已完成正式部署与公网 MCP 读写验证，具体见 [本次部署记录](DEPLOYMENT_2026-11-06.md)。

以下“服务器现状”和安装失败为**本次接续之前的交接历史**，不能当作当前运行状态。当前运行 b6d6464；已启用 atlas-agent，迁移0005/0006已完成。账户侧授权状态以本次部署记录为准。

## 获取代码

仓库： https://github.com/C-Liueasymoney/atlas-invest

功能分支：`codex/agent-research-workspace`。先 fetch 最新分支，再阅读本文件和 `docs/INVESTMENT_RESEARCH_ACCEPTANCE.md`。产品设计见 `docs/superpowers/specs/2026-11-06-agent-research-workspace-design.md`。

```sh
git fetch origin
git switch codex/agent-research-workspace
git pull --ff-only
```

已有本地修改时先保留，不能直接 reset/clean 覆盖。

## 开发交付与验证

已实现真实持仓、币种/类别登记概览、决策原始记录和版本、单项/组合/事件/复盘任务、自动复制完整AI指令、来源/机制/观察项展示、结果恢复导入、远程MCP三个工具及owner OAuth。

全套Web回归37文件：136通过、3个现有条件跳过；独立临时PostgreSQL已运行迁移和元数据seed，验证多进程并发、owner隔离、回执幂等、冲突和OAuth撤销事务。临时数据库随后已停止。lint、typecheck、production build、390px移动E2E与独立最终审查通过。

`npm run agent:build` 构建 `.atlas/runtime/server.mjs` 和 `db.mjs`：纯Node MCP与迁移工具，减少服务器运行时对TSX/源码依赖安装的要求。`npm run agent:verify-runtime` 验证该产物独立启动、健康检查、OAuth元数据与未授权拒绝。两条命令已在开发机通过；Next.js网站产物仍需单独构建。

## 服务器现状（重要）

- 实例：`i-uf6e1z4hkdc3u03591w2`，上海，公网 `47.101.193.94`。用户通过阿里云控制台的Workbench登录root。
- 网站目录：`/opt/atlas-invest`，**不是Git仓库**，先前使用源码包部署。原网站为systemd `atlas-web`，Nginx为公网入口。
- 本终端上传了 `/tmp/atlas-invest-research-20261106.tar.gz`，解包在 `/tmp/atlas-research-release`。此暂存包较GitHub最新代码旧，**接续应重新取得分支最新代码，不要直接运行旧暂存包**。
- 源码已复制进网站目录；根 `node_modules` 安装中断，可能不完整。线上旧 `.next/standalone` 运行产物未被本次构建替换。最后一次成功查询 `atlas-web` 为active。
- 执行了加密数据库备份与代码备份，位于 `/var/backups/atlas-invest/atlas-20261106T09*.sql.gz.enc` 与 `research-code-*.tar.gz`。密钥沿用 `/etc/atlas-invest/backup.key`，不得输出或提交。
- 首次npm安装因锁文件中的内部镜像地址不可达而停滞；已将102个地址切换到npm官方仓库，版本/integrity保留，并增加项目`.npmrc`。
- 后续安装两次被系统OOM终止，已在内核日志确认；384MB堆限制与低并发也未完成安装。这是已实测失败，**不要在2GB服务器上反复运行 `npm ci --include=dev`**。
- 三次脚本均未越过npm安装阶段；因此没有执行新迁移、网站新构建、Nginx新增路由、MCP服务安装启用，也没有写入ATLAS公开地址配置。不能宣称MCP公网地址已可用。
- Workbench可能仍在只读 `tail -f /tmp/atlas-research-deploy.log`。先回到明确的shell提示符，或新开Shell，再执行命令。先检查残留进程与旧网站健康状态。
- 不要输出服务器 `deploy/.env`、数据库密码、会话秘密或OAuth令牌。

## 推荐继续部署的方法

优先在有足够内存的Linux构建环境/CI构建网站，再把Next standalone与static/public产物传到服务器运行；MCP可用`agent:build`的纯Node产物，运行命令为 `node /部署路径/server.mjs`。Next standalone包含平台依赖，Mac构建产物不能直接当作Linux完整运行包上传。

当前 `deploy/deploy-research.sh` 是源码构建路线，含备份、回滚和低内存参数；本次在2GB实例上安装阶段仍失败，所以它不是已完成线上验收的一键方案。另一个终端应先选择Linux构建环境，准备并验证完整运行产物，完善产物部署方式后再切换服务。

继续前核对：旧网站响应、当前进程、磁盘和内存、备份可用、旧运行产物与新源码的版本。需要回退时优先使用本次开始前的代码备份，并保留当前私有`.env`与数据库；不要清空持仓或行情数据。

迁移SQL为0005、0006，迁移成功后再启动新服务。远程服务配置与Nginx路由示例：`deploy/atlas-agent.service`、`deploy/agent-nginx.conf`。使用纯Node产物时将ExecStart改为其实际路径，不能沿用TSX入口并假设root node_modules完整。

## MCP上线后在另一台电脑接入 Codex

**计划地址，当前尚未上线：** `https://47.101.193.94/mcp`。如果后续换域名，更新服务器ATLAS配置和下列地址。

先检查公网 `/agent/health` 与 `/.well-known/oauth-protected-resource/mcp`。无令牌调用 `/mcp` 应为401。

```sh
codex mcp add atlas-invest --url https://47.101.193.94/mcp
codex mcp login atlas-invest --scopes research:read,research:submit,offline_access
```

或在检出仓库后设置 `ATLAS_AGENT_PUBLIC_URL` 并执行 `npm run agent:connect`。首次连接复用网站已有登录会话，不再在Atlas连接页输入密码；确认允许读取研究任务与保存对应结果；不要把密码或长期令牌贴进提示词。

新会话应看到：

- `get_research_task`
- `submit_research_result`
- `get_research_task_status`

在网站 `/investments` 登记一项测试持仓、复制研究指令，在新Codex会话执行。确认AI返回服务器回执和可打开的结果链接；网站结果关联正确持仓，并显示真实来源、截至日期、事实与推断区分。接入不依赖本地仓库路径，另一台设备打开同一网站读取同一结果。

## ChatGPT Work / 手机接入

在可登录ChatGPT的另一终端，打开 `https://chatgpt.com/plugins`，添加私人MCP服务，URL填上述真实上线地址，认证选OAuth与DCR。权限为 `research:read research:submit offline_access`，完成owner授权后安装/启用，再从Work选中Atlas使用。

本终端未完成ChatGPT账户登录，用户明确要求跳过；**私人插件没有在账户中创建或安装**。已有 `npm run agent:package` 可生成私人插件manifest/MCP配置，生成文件不代表账号侧安装。移动端以该账户实际支持的插件为准；手机Codex若走远程主机，需主机在线并接入相同工具。

## 可以复制给下一位 Codex 的任务

> 请继续Atlas Invest的部署与私人MCP接入。先从GitHub获取 `C-Liueasymoney/atlas-invest` 的 `codex/agent-research-workspace` 最新代码，阅读 `docs/NEXT_TERMINAL_HANDOFF.md` 和验收文档。功能开发已完成，不要重复实现。服务器是上海ECS `i-uf6e1z4hkdc3u03591w2`，用户可在阿里云Workbench登录。当前源码已复制，但npm安装因2GB内存OOM失败，旧standalone仍是原运行版本；不要盲目重跑npm ci。先核对现状和备份，使用Linux构建产物完成部署，再验证公网OAuth/MCP真实读写，最后在当前可用的Codex或ChatGPT Work终端完成一次owner授权和跨端结果读回。禁止打印凭据，不得把尚未完成的账号接入写成已完成。
