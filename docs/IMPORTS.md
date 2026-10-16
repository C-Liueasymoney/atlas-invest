# 数据文件导入、导出与研究笔记

研究笔记在 `/api/v1/research` 提供 GET/POST，`/:id` 提供 GET/PATCH/DELETE。保存 `title`、`markdown`、`tags`、`seriesIds`、可选 `eventDate`；Markdown 是纯文本，API 不解释 HTML 或执行脚本。所有读写沿用 owner 鉴权和同源写入检查；正式模式通过 `workspace()` 的数据库事务保存，修改写审计日志。

## 文件预览

`POST /api/v1/imports/preview` 使用 multipart/form-data：

| 字段 | 要求 |
|---|---|
| `file` | UTF-8 CSV 或 XLSX，最多2MB、10000条数据、128列；XLSX只允许一个数据工作表 |
| `seriesId` | 既有可导入指标；WGC仅允许全球ETF月资金流USD、央行黄金储备tonnes；统计观察序列须匹配来源 |
| `sourceUrl` | HTTPS官方来源页面；只记录，不会发起网络请求 |
| `statPeriodEnd` | 必填统计截止日 `YYYY-MM-DD`，不得早于文件中最大日期 |
| `unit` | 默认为指标单位，提供时须完全一致 |
| `publishedAt` | 可选，已知发布时间，ISO 8601且带时区；未知留空 |
| `dateColumn` / `valueColumn` | 可选，默认 `date` / `value`；首行必须是唯一、非空的表头 |

响应包含 `token,columns,rows,count,fileName,fileSha256,expiresAt,seriesId,sourceUrl,unit,statPeriodEnd,publishedAt,metadata,isDemo`。`rows` 最多展示前20条，`count` 是全部有效行数。应由用户核对日期、单位、数据口径和来源，再进行确认。

示例：

```csv
date,value
2026-08-31,123456789.25
2026-09-30,-23456789.50
```

数据值保留十进制字符串，最多14位整数、10位小数。负资金流允许；NaN/Infinity、缺失数值、非法/重复日期、公式形式单元格、重复表头均拒绝，不能将缺失值自动变成0。统计日保持原始日期，不填充成每日数据；XLSX日期单元格按其UTC日期读取，无日期样式的Excel序号需要先整理成ISO日期。

官方域名白名单为 `gold.org,cftc.gov,sge.com.cn,fred.stlouisfed.org,frankfurter.dev` 及其子域；还会进一步校验指标对应 Provider，不能将CFTC期货头寸文件导入WGC ETF资金流。报价/OHLC不使用此导入口径。

## 安全边界与确认写入

只接受CSV/XLSX，拒绝XLS/XLSM、宏、公式、外部链接和复杂单元格。XLSX在交给 [ExcelJS官方解析器](https://github.com/exceljs/exceljs) 前校验ZIP目录和本地记录、路径、重复条目、加密标志，并实际限制解压：最多2000条目、单条5MB、合计20MB。XML的DTD/实体和外部关系也会拒绝。文件始终在内存中解析，不写入用户提供的路径，不抓取来源URL。

预览有效10分钟，正式模式存于 `provider_cache`，键绑定当前owner及随机UUID token；浏览器只持令牌。Demo允许预览但禁止确认写入。`POST /api/v1/imports/commit` 请求：

```json
{"token":"预览返回的UUID","confirm":true}
```

确认后在单一事务中锁定该预览与指标、检查owner+文件SHA256+指标去重、写入 `data_imports` 和标准化 `metric_observations`、审计，再消耗token。重复文件即使更名也返回 `status:duplicate`，不会重复导入。消耗或过期的token须重新上传。单个series使用与Python采集器相同的advisory锁标识，避免采集/导入互相覆盖。

`data_imports` 保存文件名、SHA256、来源、统计截止日、可选发布时间、导入时间、行数、映射版本；`metadata`保存单位、seriesId和列映射。需应用 `db/migrations/0002_import_metadata.sql`。观察值的 `source_record_id` 指向导入记录；未知发布时间保持NULL。

## 导出

`GET /api/v1/export?seriesId=FRED_DFII10&format=json|csv`。导出标准化points，并附来源、单位、数据时间、采集时间、时效status和isDemo；CSV每行重复这些元信息，Demo行明确标为 `true/demo`。字符串正确转义，引导公式的 `= + @ -` 文本添加单引号，防止电子表格公式注入。不能把Demo导出当作实际行情使用。

## 验证与限制

```sh
npm -w apps/web test
npm -w apps/web run typecheck
# 提供仅供测试使用的本地数据库连接后，额外验证真实导入事务与元信息
TEST_DATABASE_URL="$DATABASE_URL" npm -w apps/web test -- --run tests/imports.test.ts tests/research.test.ts
```

本地真实PostgreSQL已验证来源元信息、导入去重、token消耗，测试记录结束时清除。尚不支持直接解析WGC多页复杂报表；请先整理一个数据表及日期/数值列，预览核对后导入。服务端重启不会丢失正式模式待确认预览，Demo预览在进程内。

依赖锁定 `exceljs@4.4.0`。当前npm生产依赖审计显示2项moderate（ExcelJS引用的uuid缓冲区边界公告），没有生产high；预览不用uuid库处理外部缓冲区，令牌使用Node `crypto.randomUUID`。上游没有无破坏的修复升级建议；需跟进修复，不采用会改变解析器主版本的强制降级。
