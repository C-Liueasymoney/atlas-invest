import json
from pathlib import Path
rows=[
('SGE_AU9999_D1','国内黄金 Au99.99 日线','akshare_sge','Au99.99','ohlc','1d','CNY/g','CNY','SGE','spot',432000),
('SGE_AU9999_QUOTE','国内黄金 Au99.99 最新报价','akshare_sge','Au99.99','quote','quote','CNY/g','CNY','SGE','spot',86400),
('XAUUSD_QUOTE','国际黄金参考报价','gold_api','XAU','quote','quote','USD/troy_oz','USD','global','spot',3600),
('FX_USDCNY_D1','美元兑人民币日度参考汇率','frankfurter','USD/CNY','observation','1d','CNY/USD','CNY','reference','reference',432000),
('FRED_DFII10','美国10年期实际收益率','fred','DFII10','observation','1d','percent','USD','US','macro',432000),
('FRED_DGS10','美国10年期名义国债收益率','fred','DGS10','observation','1d','percent','USD','US','macro',432000),
('FRED_DFF','有效联邦基金利率','fred','DFF','observation','1d','percent','USD','US','macro',432000),
('FRED_CPIAUCSL','美国CPI指数（月度）','fred','CPIAUCSL','observation','1mo','index','USD','US','macro',5184000),
('FRED_CPILFESL','美国核心CPI指数（月度）','fred','CPILFESL','observation','1mo','index','USD','US','macro',5184000),
('FRED_DTWEXBGS','美国广义名义美元指数（非DXY）','fred','DTWEXBGS','observation','1d','index','USD','US','macro',432000),
('DERIVED_XAU_CNYG','国际黄金折算人民币克价','derived','XAU*CNY/31.1034768','derived','quote','CNY/g','CNY','global','derived',432000),
('DERIVED_SGE_PREMIUM','国内现货相对折算价格差','derived','SGE-XAUCNYG','derived','quote','CNY/g','CNY','SGE','derived',432000),
('WGC_ETF_FLOW_GLOBAL_M','全球实物黄金ETF月资金流','wgc_import','ETF_FLOW','imported','1mo','USD','USD','global','flow',7776000),
('WGC_CB_HOLDINGS_M','央行官方黄金持有量','wgc_import','CB_HOLDINGS','imported','1mo','tonnes','XAU','global','holdings',10368000),
('CFTC_GOLD_NET_SPEC_W','COMEX黄金非商业净头寸','cftc','088691','observation','1w','contracts','USD','COMEX','futures_position',1209600)]
urls={'akshare_sge':'https://www.sge.com.cn/sjzx/mrhq','gold_api':'https://gold-api.com/','frankfurter':'https://frankfurter.dev/','fred':'https://fred.stlouisfed.org/','wgc_import':'https://www.gold.org/goldhub/data','cftc':'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm','derived':'https://www.lbma.org.uk/'}
result=[]
for id,name,provider,symbol,kind,freq,unit,currency,market,definition,stale in rows:
 result.append(dict(id=id,nameZh=name,providerId=provider,providerSymbol=symbol,kind=kind,frequency=freq,unit=unit,currency=currency,market=market,priceDefinition=definition,timezone='Asia/Shanghai' if market=='SGE' else 'UTC',staleSeconds=stale,sourceUrl=urls[provider]+('series/'+symbol if provider=='fred' else ''),description=('统计观察日，缺失值保留为空。' if provider=='fred' else '参考数据，仅用于个人研究；数据时间与采集时间分开显示。'),category='macro' if provider=='fred' else 'gold',enabled=True))
Path('config/indicators.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
