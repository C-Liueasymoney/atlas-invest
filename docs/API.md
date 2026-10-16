# Internal API contract

All responses are JSON; errors: `{error:{code,message,requestId}}`. `/api/v1` data APIs and `/api/providers` + `/api/series/:id/routes` management APIs require owner access, except localhost Demo. Writes enforce same-origin. Credentials never appear in reads/export; only `last4` and `source`.

- `GET /api/v1/session` → `{mode:'demo'|'live',authenticated:boolean,timezone:string}`
- `POST /api/auth/login` `{password}` → session cookie; `POST /api/auth/logout`.
- `GET /api/v1/catalog?q=&category=` → `{items:Series[]}` (`id,nameZh,providerId,providerSymbol,kind,frequency,unit,currency,timezone,description,sourceUrl,staleSeconds,category`).
- `GET /api/v1/series/:id/metadata` → Series
- `GET /api/v1/series/:id/bars?from=&to=&interval=1d` and `/observations` → `{series,points:[{time:'YYYY-MM-DD',value:string|null,open?,high?,low?,close?,volume?:string|null}],source,asOf,fetchedAt,status,isDemo,unit,message?}`
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
- POST `/api/providers/:id/sync` `{seriesId?}` → `{status,message,count?}`. Collector writes live PostgreSQL; Demo sync explicitly denied (test connection still real).
- GET `/api/providers/export` → secret-free `{providers,routes}`; POST `/api/providers/import` same projected schema, keys omitted.
- POST `/api/v1/imports/preview` multipart file + seriesId + sourceUrl + dateColumn/valueColumn (optional, default date/value) → `{token,columns,rows,count,fileName}`; POST `/commit` `{token,confirm:true}`; no arbitrary source URL fetching.
- GET/POST `/api/v1/research` list/create `{title,markdown,tags?,seriesIds?,eventDate?}`; PATCH/DELETE `/:id`.
- GET `/api/v1/export?seriesId=&format=json|csv`.

Demo uses a separate disk JSON store for owner UI preferences only. All Demo market envelopes have `isDemo:true,status:'demo'`; no provider credentials can be stored in Demo. Live uses normalized PostgreSQL. Invalid database connection produces a visible 503, never silent Demo fallback.
