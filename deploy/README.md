# ECS 部署

使用 Ubuntu 软件源的 Node.js 22、PostgreSQL 与 Python venv，systemd 管理应用。
Web 仅监听 `127.0.0.1:3000`，PostgreSQL 仅监听本地；Tailscale Serve 提供 tailnet 内 HTTPS 访问。

`deploy/.env` 必须设为 0600，包含 APP_BASE_URL、DATABASE_URL、OWNER_PASSWORD、SESSION_SECRET、
CREDENTIAL_ENCRYPTION_KEY 和 POSTGRES_PASSWORD，禁止提交。
DATABASE_URL 使用普通角色 `atlas` 连接 `127.0.0.1:5432/atlas`；postgres 本地管理员仅用于初始化与备份。

项目目录 `/opt/atlas-invest`，进程用户 `atlas`。环境文件由 systemd 以 root 权限加载，应用用户不能直接读取。
首次安装依赖并构建后，由 root 运行：

```sh
python3 deploy/configure-native.py
install -m 644 deploy/atlas-*.service deploy/atlas-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now atlas-web.service atlas-collect.timer atlas-backup.timer
tailscale serve --bg http://127.0.0.1:3000
```

`APP_BASE_URL` 必须等于 Serve 返回的 HTTPS URL。使用 Serve，不启用 Funnel。
手机登录同一 tailnet 后访问此 URL，仍需输入应用 owner 密码。
Python 采集器安装在 `services/collector/.venv`，网页手动同步与每30分钟的服务器采集使用同一套环境。
FRED Key 推荐在网页「数据源配置」中保存，Node 和 Python 共用 PostgreSQL 加密凭据，服务器保留 `CREDENTIAL_ENCRYPTION_KEY`，不设置非空 `FRED_API_KEY` 环境覆盖。每30分钟的采集包含 `FRED_NASDAQ100`、`FRED_SP500`；未配置 Key 时在联网和消耗预算前跳过。源数据异常仍会按应用规则拒绝，保留已有数据。

凭据链路诊断脚本 `deploy/verify-credential-flow.py` 验证线上 owner API 保存、密文、Python 解密、替换和删除，不调用上游；仅在没有真实 FRED 凭据、暂停采集定时器且采集任务空闲时运行。它不会覆盖已保存的真实 Key。诊断后恢复定时器。

每天北京时间03:30执行加密备份，目录 `/var/backups/atlas-invest`，加密密钥 `/etc/atlas-invest/backup.key`。
当前保留所有备份，不自动删除。需定期将备份与密钥分别复制到安全的异地存储；同机备份不防实例丢失。
更新前执行备份并保留旧构建；迁移失败不要启动新版本。
查看状态：`systemctl status atlas-web atlas-collect.timer atlas-backup.timer`。
查看应用日志：`journalctl -u atlas-web -n 80 --no-pager`。

项目源文件及运维脚本由 root 持有；运行用户只可写 Next.js 缓存和 `/var/lib/atlas-invest` 状态目录。
Tailscale 禁用接收 DNS（服务器不需要 MagicDNS），并由 `atlas-dns-compat` 在启动后放行来自
`100.100.2.136/138` 的已建立 DNS 查询回复，避免 Tailscale 对100.64/10网段的防伪规则误拦截 AliDNS。

部署后验证由 root 执行：`python3 deploy/verify-private.py`（HTTPS、登录与行情 API）、
`python3 deploy/verify-database.py`（隔离 schema 中运行现有集成测试）、
`python3 deploy/verify-backup.py`（恢复到新临时数据库并核对行数后清理）。
这些脚本不打印应用密码或会话内容。

## 公网 IP HTTPS 入口（2026-10-30）

公网地址为 `https://47.101.193.94:443`，手机无需连接 Tailscale，仍使用原工作空间密码登录。
安全组仅为此入口新增 `0.0.0.0/0` 到 TCP 80、443：80 提供 ACME HTTP-01 验证并将普通访问跳转到 HTTPS；
443 提供应用反向代理。Next.js 的 3000 与 PostgreSQL 的 5432 继续仅监听本地。

Nginx HTTPS 绑定 `172.19.7.35:443`，避免占用 Tailscale Serve 的 `100.124.158.1:443`。
应用 `APP_BASE_URL` 保留私有 HTTPS 地址；Nginx 仅将精确匹配的公网 Origin 映射到该地址，
其他 Origin 原样交给应用拒绝，保留 Secure / HttpOnly / SameSite=Strict Cookie 和原跨站请求保护。
若公网 IP 或私网 IP 改变，需更新 `configure-public.py`、`verify-public.py` 并重新申请对应证书。

服务器使用 Ubuntu 软件源的 Nginx，以及 `/opt/atlas-certbot` venv 中 Certbot 5.9。
初次配置顺序：

```sh
python3 deploy/configure-public.py http
/opt/atlas-certbot/bin/certbot certonly --non-interactive --agree-tos \
  --register-unsafely-without-email --preferred-profile shortlived \
  --webroot --webroot-path /var/www/atlas-acme \
  --ip-address 47.101.193.94 --cert-name 47.101.193.94
python3 deploy/configure-public.py https
install -m 755 deploy/reload-nginx.sh /usr/local/sbin/atlas-reload-nginx
install -m 644 deploy/atlas-certbot-renew.service deploy/atlas-certbot-renew.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now nginx atlas-certbot-renew.timer
```

证书路径 `/etc/letsencrypt/live/47.101.193.94/`，使用短期 IP 证书。
`atlas-certbot-renew.timer` 每六小时检查续期（带随机延迟），续期后检查配置并热重载 Nginx。
站点更改前的配置与默认站点链接保存在 `/etc/nginx/atlas-backups/<UTC 时间戳>/`。
修改后务必验证实际 HTTP/HTTPS 响应，不能仅依据 `nginx -t` 或 systemd reload 成功判断切换完成。

验证命令：

```sh
python3 deploy/verify-public.py
python3 deploy/verify-private.py
/opt/atlas-certbot/bin/certbot renew --dry-run --run-deploy-hooks \
  --deploy-hook /usr/local/sbin/atlas-reload-nginx
```

本机可用 `python3 deploy/verify-public.py --external --password-file .atlas/deployment-access.txt`
验证真实公网 HTTPS、登录、跨站请求拒绝、行情接口和退出。脚本不打印密码或 Cookie。

## 阿里云与 Tailscale 的内网兼容

2026-10-30 确认旧的一次性 DNS 规则会被 Tailscale 后续插到 INPUT 顶部的 hook 遮挡，
导致 DNS、云助手和 Workbench 内网通道异常。`aliyun-network-compat.sh` 在 INPUT 顶部维护独立链：
允许 eth0 上来自 `100.100.0.0/16`（阿里云服务）及 `100.118.0.0/16`（本地域 OSS）的已建立连接回复，
并允许 `100.104.0.0/16`（Workbench 网关）访问 SSH 22。其余 Tailscale 防伪规则继续生效。

```sh
install -m 644 deploy/atlas-network-compat.service deploy/atlas-network-compat.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now atlas-network-compat.timer
systemctl start atlas-network-compat.service
```

计时器在启动后及每分钟校正规则顺序。安装本机 Workbench CLI 后可使用已经配置的 RAM 凭据执行：

```sh
workbench exec --instance-id i-uf6e1z4hkdc3u03591w2 --region cn-shanghai \
  --command 'systemctl is-active atlas-web nginx atlas-network-compat.timer atlas-certbot-renew.timer'
```

Workbench 配置与 AccessKey 只保存在本机 `~/.workbench/config.json`，不得放入仓库或输出到日志。
