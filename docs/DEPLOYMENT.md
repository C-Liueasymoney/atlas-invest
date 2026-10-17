# 本地与私有部署

## 本地真实预览
Node >=22，安装Python采集器（见README）。`npm ci && npm run setup:local` 后运行 `npm run data:refresh && npm run dev`，访问 http://localhost:3000 。默认 `DATA_MODE=preview`，仅监听127.0.0.1。真实缓存位于根目录 `.atlas/market-snapshot.json`，文件权限0600、不提交Git；偏好仍写本地JSON，不写 PostgreSQL 正式行情。未采集或缺Key时留空；失败保留旧实际值并标陈旧。

显式 `DATA_MODE=demo` 为合成图表体验，带DEMO标签，主报价留空。Preview只适合本机开发，依赖本地Python；生产使用live与外置采集job。

## 真实本地模式

```sh
docker compose up -d db
npm run db:migrate
npm run db:seed
python3.12 -m venv services/collector/.venv
services/collector/.venv/bin/python -m pip install -e 'services/collector[test]'
```

修改根目录 `.env`：`DATA_MODE=live`、`LOCAL_DEV_NO_AUTH=false`、至少12位 `OWNER_PASSWORD`、至少32位 `SESSION_SECRET`，并设置数据库地址及 FRED Key。根目录 npm 脚本会加载 `.env`；直接使用 Python CLI 时先安全地导出同一组服务端环境变量。`npm run dev` 后登录；从配置中心手动同步或运行 collector CLI。未启动数据库返回明确503，不会暗中切换到Demo。

## 生产

`npm ci && npm run build`。build 不要求凭据；生产启动必须先关闭 bypass，并设置 owner 密码与签名秘密。`npm start` 只监听localhost；反向代理以HTTPS暴露，设置 `APP_BASE_URL=https://your-private-domain`。容器内可设置 `ATLAS_BIND_HOST=0.0.0.0` 并限制端口与网络。不要将数据库端口公开。

当前使用单 owner 的密码+HMAC HttpOnly/SameSite=Strict会话，24h过期；是可替换的 Auth Adapter，不是完整 Supabase 多用户实现。没有密码找回/多用户/RLS策略。仅用专用最小权限数据库角色，不能把单 owner架构直接当多租户服务部署。生产会话 Cookie Secure；本地HTTP生产测试应在API工具中手动传cookie或配置TLS。

Vercel + 托管 PostgreSQL 可用，但 Python SGE 同步需外置 GitHub Actions，serverless 不包含本地 collector 环境。每个数据源按官方授权配置为私有，不自动公开再分发行情。免费托管额度与暂停策略需部署当天确认，不承诺永久免费或实时采集。

GitHub Actions `collect.yml` 需要 secrets `DATABASE_URL`、`FRED_API_KEY`；先迁移/seed。定时任务可能延迟，网站不承诺即时预警。FRED无key跳过；SGE quote时间异常可能使任务报告失败，其他series仍独立执行。

## 备份与回滚

每日用平台备份或 `pg_dump` 保存加密私有备份（不进入Git），每周演练在独立数据库 `pg_restore`。保留7份日备份、4份周备份。保管加密主密钥与数据库备份，丢失主密钥无法恢复网页凭据。
初始0001迁移仅新增表，业务回滚先停采集/备份，恢复旧应用版本；需要删除数据时在确认备份后删除专用数据库。Git revert不恢复数据库。Provider诊断只留安全摘要，使用量/健康/审计日志建议30天定期归档清理，不保存无限原始响应。

## 验证

`npm run lint && npm run typecheck && npm test && npm run build`；`npm run test:e2e` 使用Playwright启动localhost服务器。collector `python -m pytest services/collector/tests`，有 `TEST_DATABASE_URL` 时执行真实PostgreSQL集成。GitHubCI的状态以远端实际运行结果为准。
