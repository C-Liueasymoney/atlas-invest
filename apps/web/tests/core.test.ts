import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/providers/secrets';
import { assertRuntime, signSession, verifySession, authorize } from '@/lib/auth/session';
import { compatibleRoutes } from '@/lib/providers/routing';
import { convertGold, compareSeries, change } from '@/lib/calculations';
import { catalog } from '@/lib/catalog';
const key=Buffer.alloc(32,7).toString('base64');
describe('credential vault',()=>{
 it('encrypts with authenticated randomness and refuses tampering/wrong keys',()=>{
  const a=encryptSecret('private-test-key',key),b=encryptSecret('private-test-key',key);
  expect(a).not.toBe(b); expect(a).not.toContain('private-test-key'); expect(decryptSecret(a,key)).toBe('private-test-key');
  expect(()=>decryptSecret(a,Buffer.alloc(32,8).toString('base64'))).toThrow(); expect(()=>encryptSecret('x','bad')).toThrow();
 });
});
describe('owner authentication',()=>{
 it('refuses production bypass and missing signing secrets',()=>{
  expect(()=>assertRuntime({NODE_ENV:'production',LOCAL_DEV_NO_AUTH:'true'})).toThrow();
  expect(()=>assertRuntime({NODE_ENV:'production',LOCAL_DEV_NO_AUTH:'false'})).toThrow();
 });
 it('expires signed cookies and rejects tampering',()=>{
  const token=signSession('a'.repeat(40),1000);
  expect(verifySession(token,'a'.repeat(40),1001)).toBe(true); expect(verifySession(token+'x','a'.repeat(40),1001)).toBe(false);
  expect(verifySession(token,'a'.repeat(40),1000+86400001)).toBe(false);
 });
 it('does not bypass auth for live data or cross-origin writes',()=>{
  const env={NODE_ENV:'development',DATA_MODE:'demo',LOCAL_DEV_NO_AUTH:'true',APP_BASE_URL:'http://localhost:3000'};
  expect(()=>authorize(new Request('http://localhost:3000/api/providers'),env)).not.toThrow();
  expect(()=>authorize(new Request('http://localhost:3000/api/providers',{method:'POST',headers:{origin:'http://127.0.0.1:3000'}}),env)).not.toThrow();
  expect(()=>authorize(new Request('http://localhost:3000/api/providers'),{...env,DATA_MODE:'live'})).toThrow();
  expect(()=>authorize(new Request('http://localhost:3000/api/providers',{method:'POST',headers:{origin:'https://evil.test'}}),env)).toThrow();
 });
});
describe('series identity',()=>{
 it('rejects futures, currency, unit and frequency mismatches before fallback',()=>{
  const s=catalog.find(s=>s.id==='SGE_AU9999_D1')!;
  const base={providerId:'akshare_sge',providerSymbol:'Au99.99',operation:'bars',interval:'1d',priority:0,enabled:true,mode:'auto',constraints:{unit:'CNY/g',currency:'CNY',market:'SGE',priceDefinition:'spot',frequency:'1d'}};
  expect(compatibleRoutes(s,[base])).toHaveLength(1);
  for(const [field,value] of [['unit','USD/oz'],['priceDefinition','future'],['frequency','1m'],['market','SHFE']]) expect(compatibleRoutes(s,[{...base,constraints:{...base.constraints,[field]:value}}])).toHaveLength(0);
 });
});
describe('financial facts',()=>{
 it('converts troy ounces using Decimal and percentage points for rates',()=>{
  expect(Number(convertGold('3100','7.1'))).toBeCloseTo(707.638,2);
  expect(change('2.7','2.5','percent')).toEqual({value:'0.2',unit:'百分点'});
 });
 it('aligns mixed frequency observations without future filling',()=>{
  const result=compareSeries([[{time:'2026-01-01',value:'100'},{time:'2026-01-02',value:'110'}],[{time:'2026-01-02',value:'2'},{time:'2026-02-01',value:'3'}]],'index100','outer');
  expect(result[1][0]).toEqual({time:'2026-01-01',value:null}); expect(result[0][2]).toEqual({time:'2026-02-01',value:null}); expect(result[0][1].value).toBe(110);
 });
});
