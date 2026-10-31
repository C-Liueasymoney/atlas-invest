# Market overview Implementation Plan

**Goal:** 收藏决定主图选项；每个主图可从全部指标自定义关联项。
**Architecture:** 复用第一张观察列表；独立owner/series配置表与API，preview文件存储。关联配置不修改收藏或行情。显式保存，支持空列表和恢复推荐。
**Tech Stack:** Next.js, React, PostgreSQL, Playwright.
**Spec:** docs/market-overview-proposal.md，用户已澄清收藏与关联独立。

- [x] 添加推荐映射和配置API，测试默认、保存空、隔离、无效输入与鉴权。
- [x] 主图选择器强化视觉并只展示收藏；无收藏给出管理入口。
- [x] 关联指标管理面板搜索全目录、增删、保存/恢复推荐，切换主图独立加载。
- [ ] 类型/lint/测试/build、浏览器桌面手机验证，提交推送；独立构建与线上验证。

不改已有未提交workspace修复；迁移只新增表，回滚旧代码无需删除表。
