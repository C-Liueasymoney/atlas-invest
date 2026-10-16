import { describe, expect, it } from 'vitest';
import { validateWidget, widgetRegistry, createWidget } from '../lib/widgets/registry';
import { formatValue, dateTime } from '../components/api';
describe('widget persistence boundary',()=>{
 it('round-trips registered widgets as safe JSON and validates their configuration',()=>{for(const type of Object.keys(widgetRegistry) as (keyof typeof widgetRegistry)[]){const widget=createWidget(type,JSON.parse(JSON.stringify(widgetRegistry[type].defaultConfig)));const restored=JSON.parse(JSON.stringify(widget));expect(validateWidget(restored)).toBe(true);expect(restored.id).toMatch(/^[a-f0-9-]{36}$/);}});
 it('rejects unknown and corrupted persisted widgets with a recoverable state',()=>{expect(validateWidget({id:'x',type:'unknown',config:{},layout:{x:0,y:0,w:4,h:4}})).toBe(false);expect(widgetRegistry['price-chart'].configSchema.safeParse({seriesId:'SGE_AU9999_D1',chartType:'line',range:'LIVE'}).success).toBe(false);expect(widgetRegistry['compare-chart'].configSchema.safeParse({seriesIds:['only-one']}).success).toBe(false);});
 it('does not turn missing market observations into zero',()=>{expect(formatValue(null)).toBe('—');expect(formatValue(undefined)).toBe('—');expect(formatValue('')).toBe('—');expect(formatValue('0')).toBe('0');expect(formatValue('NaN')).toBe('—');expect(dateTime(null)).toBe('尚无记录');});
});
