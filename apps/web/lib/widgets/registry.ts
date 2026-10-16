import { z } from "zod";
const seriesId = z.string().min(1);
export const widgetRegistry = {
  "price-chart": {
    title: "价格与历史图表",
    description: "日线、OHLC 与可追溯数据来源",
    defaultSize: { w: 8, h: 6 },
    configSchema: z.object({
      seriesId,
      chartType: z.enum(["line", "candlestick"]).default("line"),
      range: z.enum(["1M", "3M", "6M", "1Y", "3Y", "ALL"]).default("1Y"),
    }),
    defaultConfig: {
      seriesId: "SGE_AU9999_D1",
      chartType: "line",
      range: "1Y",
    },
  },
  "metric-card": {
    title: "指标行情卡",
    description: "最新观测、变化与更新时间",
    defaultSize: { w: 4, h: 3 },
    configSchema: z.object({ seriesId }),
    defaultConfig: { seriesId: "FRED_DFII10" },
  },
  "indicator-table": {
    title: "自定义指标表",
    description: "集中观察多项市场与宏观指标",
    defaultSize: { w: 4, h: 5 },
    configSchema: z.object({ seriesIds: z.array(seriesId).min(1) }),
    defaultConfig: { seriesIds: ["FRED_DFII10", "FRED_DGS10", "FX_USDCNY_D1"] },
  },
  "source-health": {
    title: "数据源健康状态",
    description: "连接状态、凭据与采集诊断",
    defaultSize: { w: 4, h: 4 },
    configSchema: z.object({}),
    defaultConfig: {},
  },
  "compare-chart": {
    title: "多指标比较",
    description: "起点 100 或百分比变化",
    defaultSize: { w: 8, h: 6 },
    configSchema: z.object({
      seriesIds: z.array(seriesId).min(2),
      scaleMode: z.enum(["index100", "pct"]).default("index100"),
    }),
    defaultConfig: {
      seriesIds: ["SGE_AU9999_D1", "FRED_DFII10"],
      scaleMode: "index100",
    },
  },
} as const;
export type WidgetType = keyof typeof widgetRegistry;
export type Widget = {
  id: string;
  type: string;
  title?: string;
  config: {
    seriesId?: string;
    seriesIds?: string[];
    chartType?: string;
    range?: string;
    scaleMode?: string;
  };
  layout: { x: number; y: number; w: number; h: number };
};
export function validateWidget(widget: Widget) {
  const definition = widgetRegistry[widget.type as WidgetType];
  return (
    !!definition && definition.configSchema.safeParse(widget.config).success
  );
}
export function createWidget(
  type: WidgetType,
  config: Widget["config"],
  index = 0,
): Widget {
  return {
    id: crypto.randomUUID(),
    type,
    config,
    layout: { x: 0, y: index * 4, ...widgetRegistry[type].defaultSize },
  };
}
