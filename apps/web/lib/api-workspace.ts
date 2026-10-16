import {z} from 'zod';
import {workspace} from './db/workspace';
import {body,parse,json} from './api-helpers';
import {AppError} from './errors';
import {seriesById} from './catalog';
const config=z.record(z.string(),z.unknown());
const widget=z.object({id:z.uuid(),type:z.enum(['metric-card','price-chart','compare-chart','indicator-table','factor-explainer','feed-events','source-health','markdown-note']),title:z.string().max(100).optional(),config,layout:z.object({x:z.number().int().min(0).max(11),y:z.number().int().min(0).max(1000),w:z.number().int().min(2).max(12),h:z.number().int().min(2).max(20)})});
function checkWidgets(widgets:z.infer<typeof widget>[]){if(new Set(widgets.map(w=>w.id)).size!==widgets.length)throw new AppError('VALIDATION_ERROR','Widget id 重复');for(const w of widgets){if(w.layout.x+w.layout.w>12)throw new AppError('VALIDATION_ERROR','Widget 超出12列边界');if(w.config.seriesId)seriesById(String(w.config.seriesId));if(w.config.seriesIds){const ids=parse(z.array(z.string()).max(10),w.config.seriesIds);ids.forEach(seriesById);}if(w.config.chartType==='candlestick'&&(!w.config.seriesId||seriesById(String(w.config.seriesId)).kind!=='ohlc'))throw new AppError('UNSUPPORTED_INTERVAL','只有 OHLC 指标可使用K线');if(w.config.range&&!['1M','3M','6M','1Y','3Y','ALL'].includes(String(w.config.range)))throw new AppError('VALIDATION_ERROR','不支持的图表范围');}}
export async function workspaceApi(request:Request,p:string[]):Promise<Response|undefined>{const method=request.method;
 if(p[0]==='dashboards'){
  if(p.length===1&&method==='GET')return json({items:await workspace(s=>s.dashboards)});
  if(p.length===1&&method==='POST'){const d=parse(z.object({name:z.string().min(1).max(80)}),await body(request));return json(await workspace(s=>{const item={id:crypto.randomUUID(),name:d.name,layoutVersion:1,widgets:[]};s.dashboards.push(item);return item;},true),201);}
  if(p[1]&&method==='PATCH'){const d=parse(z.object({name:z.string().min(1).max(80)}),await body(request));return json(await workspace(s=>{const item=s.dashboards.find(d=>d.id===p[1]);if(!item)throw new AppError('FORBIDDEN','看板不存在或无权限',404);item.name=d.name;return item;},true));}
  if(p[2]==='widgets'&&method==='PUT'){const d=parse(z.object({widgets:z.array(widget).max(40)}),await body(request));checkWidgets(d.widgets);return json(await workspace(s=>{const item=s.dashboards.find(d=>d.id===p[1]);if(!item)throw new AppError('FORBIDDEN','看板不存在或无权限',404);item.widgets=d.widgets;return item;},true));}
 }
 if(p[0]==='watchlists'){
  if(p.length===1&&method==='GET')return json({items:await workspace(s=>s.watchlists)});
  if(p.length===1&&method==='POST'){const d=parse(z.object({name:z.string().min(1).max(80)}),await body(request));return json(await workspace(s=>{const item={id:crypto.randomUUID(),name:d.name,items:[]};s.watchlists.push(item);return item;},true),201);}
  if(p[2]==='items'){
   const d:{seriesId?:string;seriesIds?:string[]}=method==='POST'?parse(z.object({seriesId:z.string()}),await body(request)):method==='PUT'?parse(z.object({seriesIds:z.array(z.string()).max(100)}),await body(request)):{};
   if(d.seriesId)seriesById(d.seriesId);if(d.seriesIds)d.seriesIds.forEach(seriesById);
   return json(await workspace(s=>{const list=s.watchlists.find(w=>w.id===p[1]);if(!list)throw new AppError('FORBIDDEN','观察列表不存在或无权限',404);if(method==='POST'&&d.seriesId)list.items=[...new Set([...list.items,d.seriesId])];else if(method==='DELETE')list.items=list.items.filter(id=>id!==p[3]);else if(method==='PUT'&&d.seriesIds)list.items=[...new Set(d.seriesIds)];else throw new AppError('VALIDATION_ERROR','不支持的操作');return list;},true));
  }
 }
 if(p[0]==='alerts'&&p.length===1&&method==='GET')return json({items:await workspace(s=>s.alerts)});
 if(p[0]==='alert-events'&&method==='GET')return json({items:await workspace(s=>s.events)});
 return undefined;
}
