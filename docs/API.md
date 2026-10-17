# Internal API contract

All responses are JSON; errors: `{error:{code,message,requestId}}`. `/api/v1` data APIs and `/api/providers` + `/api/series/:id/routes` management APIs require owner access, except localhost development preview/Demo. Writes enforce same-origin. Credentials never appear in reads/export; only `last4` and `source`.

- `GET /api/v1/session` → `{mode:'preview'|'demo'|'live',authenticated:boolean,timezone:string}`
- `POST /api/auth/login` `{password}` → session cookie; `POST /api/auth/logout`.
- `GET /api/v1/catalog?q=&category=` → `{items:Series[]}` (`id,nameZh,providerId,providerSymbol,kind,frequency,unit,currency,timezone,description,sourceUrl,staleSeconds,category`).
- `GET /api/v1/series/:id/metadata` → Series
- `GET /api/v1/series/:id/bars?from=&to=&interval=1d` and `/observations` → `{series,points:[{time:'YYYY-MM-DD',value:string|null,open?,high?,low?,close?,volume?:string|null}],source,asOf,fetchedAt,status,isDemo,unit,message?}`
- `POST /api/v1/market/refresh` `{}` → `{status,message,results:[{seriesId,status,count?,asOf?}]}`. Preview only (other modes409); bounded real collector calls, provider enablement/budget checks.
- `GET /api/v1/quotes?seriesIds=...` → `{items:[{seriesId,value:string|null,previousValue:string|null,unit,currency,source:{id,label,url},asOf:string|null,fetchedAt:string|null,status,isDemo,message?,qualityFlags?:string[],sourceChanged?:boolean}]}`
- `GET /api/v1/compare?seriesIds=...&mode=index100|pct|raw&align=intersection|outer&from=&to=` → `{series:[{id,nameZh,unit,points:[{time,value:number|null}],status,isDemo}],alignment,mode}`
- `GET /api/v1/dashboards` → `{items:[{id,name,layoutVersion,widgets:[{id,type,title?,config:{seriesId?,seriesIds?,chartType?,range?,scaleMode?},layout:{x,y,w,h}}]}]}`
- `POST /api/v1/dashboards` `{name}`; `PUT /api/v1/dashboards/:id/widgets` `{widgets:[...]}`; `PATCH /api/v1/dashboards/:id` `{name}`.
- `GET /api/v1/watchlists` → `{items:[{id,name,items:string[]}]}`. `POST /api/v1/watchlists` `{name}`; `POST /api/v1/watchlists/:id/items` `{seriesId}`; `DELETE .../items/:seriesId`; `PUT .../items` `{seriesIds:string[]}` reorder.
- `GET /api/v1/alerts` → `{items:Alert[]}`. POST `{seriesId,conditionType:'crosses_above'|'crosses_below'|'pct_change'|'data_stale'|'new_observation',params:{threshold:number,window?:number},cooldownSeconds?:number}`; PATCH `/:id` `{enabled}`; DELETE `/:id`. `POST /api/v1/alerts/evaluate`; `GET /api/v1/alert-events` → `{items:[]}`.
- `GET /api/providers/catalog` and `/configured` → `{items:[{id,displayName,category,capabilities,docsUrl,termsUrl,licenseNote,envVar?,enabled,credential:{configured,last4?,source:'env'|'database'|'none'},config:{ttlSeconds,perMinute,perHour,perDay},health?,coverageCount}]}`.
- POST `/api/providers/:id/credentials` `{apiKey,confirm:true}`; DELETE `{confirm:true}`; PATCH `/api/providers/:id` `{enabled?,config?:{ttlSeconds?,perMinute?,perHour?,perDay?}}`.
- POST `/api/providers/:id/test-connection` → `{providerId,status,checkedAt,sampleDataAsOf?,message}`; GET `/:id/capabilities` → `{items:[...]}`; GET `/:id/usage` → `{requests24h,cacheHits,rateLimited,estimate:true}`.
- GET `/api/providers/:id/search?q=` → `{items:[{providerId,symbol,name,market,assetClass,unit,currency,priceDefinition,operations,intervals}],message?}`. Registry search is labeled catalog; AV uses official symbol search when configured.
- GET `/api/series/:id/routes` → `{items:[{providerId,providerSymbol,operation,interval,priority,enabled,constraints:{unit,currency,market,priceDefinition,frequency},mode:'auto'|'fixed'}],reason:string}`; PUT `{routes:[...]}`.
- POST `/api/providers/:id/sync` `{seriesId?}` → `{status,message,count?}`. Collector writes live PostgreSQL; preview refreshes private real cache, Demo sync explicitly denied (test connection still real).
- GET `/api/providers/export` → secret-free `{providers,routes}`; POST `/api/providers/import` same projected schema, keys omitted.
- POST `/api/v1/imports/preview` multipart file + seriesId + sourceUrl + statPeriodEnd + unit(可选) + publishedAt(可选) + dateColumn/valueColumn (optional, default date/value) → `{token,columns,rows,count,fileName}`; POST `/commit` `{token,confirm:true}`; no arbitrary source URL fetching.
- GET/POST `/api/v1/research` list/create `{title,markdown,tags?,seriesIds?,eventDate?}`; PATCH/DELETE `/:id`.
- GET `/api/v1/export?seriesId=&format=json|csv`.

Demo uses a separate disk JSON store for owner UI preferences only. All Demo market envelopes have `isDemo:true,status:'demo'`; no provider credentials can be stored in Demo. Live uses normalized PostgreSQL. Invalid database connection produces a visible 503, never silent Demo fallback.

- `GET /api/v1/series/:id/stats`：仅日度价格/汇率；最大回撤、252日年化/最近21间隔波动、收益分布与源状态。空样本为null，不对利率/月度数据套用价格风险公式。
- `GET /api/v1/series/:id/imports`：owner的最近20个导入批次、文件hash、统计期、未知可空的原始发布时间、单位与官方URL。Imported指标JSON导出同时包含importBatches；CSV保留标准逐行统计日期/来源。
- Quote可带`asOfKind=date|timestamp`。日K/宏观观察期只显示日期，不能把用于标准日期键的UTC午夜显示成源端盘中报价时刻。

Preview reads validated actual collector snapshots from the ignored root `.atlas/market-snapshot.json`; `isDemo:false`. Missing sources return null/unavailable or not_configured; failures never substitute Demo. Preview preferences use a separate `preview-state.json`, importing only layouts/watchlists/notes on first use. Synthetic alert state/events never carry into preview; no formal market-table writes occur. Preview supports environment credentials only; encrypted web credentials require live/PostgreSQL.
