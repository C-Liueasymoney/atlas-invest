import Decimal from 'decimal.js';
import type { Point } from './types';
import { AppError } from './errors';
export function convertGold(xau:string,fx:string) {if(new Decimal(xau).lte(0)||new Decimal(fx).lte(0)) throw new AppError('INVALID_UNIT','价格和汇率必须为正');return new Decimal(xau).mul(fx).div('31.1034768').toFixed(8);}
export function change(value:string,previous:string,unit:string) {const p=new Decimal(previous),v=new Decimal(value);if(unit==='percent')return {value:v.minus(p).toString(),unit:'百分点'};return {value:p.gt(0)?v.div(p).minus(1).mul(100).toFixed(4):null,unit:'%'};}
export function compareSeries(all:Point[][],mode:string,align:string) {
 const dates=[...new Set(all.flatMap(s=>s.map(p=>p.time)))].sort().filter(t=>align!=='intersection'||all.every(s=>s.some(p=>p.time===t&&p.value!==null)));
 return all.map(points=>{const base=points.find(p=>p.value!==null&&new Decimal(p.value).gt(0))?.value;const map=new Map(points.map(p=>[p.time,p.value]));return dates.map(time=>{const v=map.get(time);return {time,value:v==null?null:mode==='raw'?Number(v):!base?null:Number(new Decimal(v).div(base).minus(mode==='pct'?1:0).mul(100))};});});
}
export function riskStats(values:string[]) {const p=values.map(v=>new Decimal(v)).filter(v=>v.gt(0));let peak=p[0]??new Decimal(0),dd=new Decimal(0);const returns:number[]=[];p.forEach((v,i)=>{peak=Decimal.max(peak,v);dd=Decimal.min(dd,v.div(peak).minus(1));if(i)returns.push(Number(v.div(p[i-1]).ln()));});const mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0;const variance=returns.length>1?returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1):0;return {maxDrawdownPct:Number(dd.mul(100)),annualizedVolatilityPct:returns.length>1?Math.sqrt(variance*252)*100:null,sampleCount:p.length};}
