import json,datetime,math
from pathlib import Path
series={}
start=datetime.date(2023,10,16)
for sid,base,drift in [('SGE_AU9999_D1',470,0.25),('FRED_DFII10',2.1,-0.0003),('FRED_DGS10',4.3,-0.0002),('FRED_DTWEXBGS',115,0.005),('FX_USDCNY_D1',7.2,-0.00015)]:
 points=[]
 for i in range(1094):
  day=start+datetime.timedelta(days=i)
  if day.weekday()>4:continue
  value=base+drift*i+math.sin(i/23)*base*0.018+math.cos(i/9)*base*0.003
  p={'time':str(day),'value':f'{value:.4f}'}
  if sid=='SGE_AU9999_D1':p.update(open=f'{value+math.sin(i)*2:.4f}',high=f'{value+4:.4f}',low=f'{value-4:.4f}',close=f'{value:.4f}',volume=None)
  points.append(p)
 series[sid]=points
Path('apps/web/fixtures/demo.json').write_text(json.dumps({'warning':'SYNTHETIC DEMO DATA - never use as real quotes','asOf':'2026-10-13T00:00:00Z','series':series},separators=(',',':'))+'\n')
