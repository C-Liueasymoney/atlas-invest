# 中美 CPI 同比通胀率 Implementation Plan

**Goal:** 中美通胀可收藏、加入看板、按近n年对比。
**Architecture:** 复用现有Catalog、Provider Controller、PostgreSQL和图表；新增中国宏观Provider和FRED受限变换映射。
**Tech Stack:** Next.js / TypeScript / Python / PostgreSQL
**Spec:** docs/superpowers/specs/2026-11-03-inflation-design.md

## Global Constraints
- 密钥不进入Git或日志；月初仅代表观察月份；缺失不补零；保留已有行情。

## Review Focus
- NATIONAL_SAME为百分比，不把NATIONAL_BASE当同比。
- FRED CPIAUCNS使用pc1，不混用CPIAUCSL季调指数。
- 负值、零值和不重叠月份在原始数值比较时保持正确。
- 最多100年可用历史回填和自定义区间均走现有预算、停用与缓存控制。
- 部署只更新现有实例，先备份；无法连接时如实报告。

## Tasks
- [x] 注册两项通胀指标；实现Python与TS采集和字段校验；纳入preview、定时作业及seed。
- [x] 图表支持5Y、10Y与自定义n年，比较页新增通胀快捷选择、原始数值模式和日期筛选。
- [x] 测试真实响应结构、范围边界、缺失/零/负值、FRED变换参数，检查类型、lint和build。
- [ ] 提交推送，连接已有服务器备份、拉取、seed、build和重启，验证新指标接口与定时采集。
