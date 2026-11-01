import { createHash } from "node:crypto";
import { catalog, seriesById } from "../catalog";
import { seriesData, syncSeries } from "../data";
import { query, demoMode } from "../db/client";
import { latestIndex } from "../latest-index";
import type { SeriesData } from "../types";
import {
  bucket,
  returns,
  cell,
  rolling,
  align,
  type Frequency,
} from "./engine";
export function transform(id: string): "return" | "bp-change" | "unsupported" {
  if (["FRED_DGS10", "FRED_DFII10", "FRED_DFF"].includes(id))
    return "bp-change";
  if (
    [
      "SGE_AU9999_D1",
      "XAUUSD_QUOTE",
      "FX_USDCNY_D1",
      "FRED_NASDAQ100",
      "FRED_SP500",
    ].includes(id)
  )
    return "return";
  return "unsupported";
}
export type AnalysisInput = {
  assets: string[];
  from: string;
  to: string;
  frequency: Frequency;
  currency: "CNY" | "USD";
};
export async function history(
  id: string,
  from: string,
  to: string,
): Promise<SeriesData> {
  const result = await seriesData(id, from, to);
  if (
    result.points.length ||
    !["FRED_NASDAQ100", "FRED_SP500"].includes(id) ||
    demoMode()
  )
    return result;
  const saved = (
    await query<{ payload: { history?: SeriesData } }>(
      "SELECT payload FROM provider_cache WHERE cache_key=$1",
      ["tencent_index:index-snapshot:" + id],
    )
  )[0]?.payload?.history;
  return saved
    ? {
        ...saved,
        points: saved.points.filter((p) => p.time >= from && p.time <= to),
      }
    : result;
}
const cache = new Map<string, unknown>();
async function prepared(input: AnalysisInput) {
  const ids = [...new Set([...input.assets, "FX_USDCNY_D1"])];
  const data = await Promise.all(
    ids.map((id) => history(id, input.from, input.to)),
  );
  const fx = data.find((d) => d.series.id === "FX_USDCNY_D1")!;
  const selected = input.assets.map((id) =>
    data.find((d) => d.series.id === id)!,
  );
  const transformed = selected.map((d) => {
    const kind = transform(d.series.id);
    return kind === "unsupported"
      ? []
      : returns(
          d.points,
          input.frequency,
          kind,
          d.series.id === "FX_USDCNY_D1" ? input.currency : d.series.currency,
          input.currency,
          fx.points,
        );
  });
  const assets = selected.map((d, i) => ({
    id: d.series.id,
    name: d.series.nameZh,
    currency: d.series.currency,
    unit: d.unit,
    transform: transform(d.series.id),
    status: d.status,
    source: d.source,
    asOf: d.asOf,
    fetchedAt: d.fetchedAt,
    count: d.points.filter((p) => p.value !== null).length,
    validReturns: transformed[i].length,
    reason:
      transform(d.series.id) === "unsupported"
        ? "该指标不是已注册可比价格或利率变化序列"
        : !d.points.length
          ? "历史数据不可用；请在数据源中心同步/回填"
          : !transformed[i].length
            ? "无有效变化；检查价格及同日汇率是否齐备"
            : null,
  }));
  return {
    assets,
    transformed,
    timelines: selected.map((d) =>
      [...new Set(d.points.map((p) => bucket(p.time, input.frequency)))]
        .sort()
        .slice(1),
    ),
    isDemo: selected.some((d) => d.isDemo),
    version: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}
export const warnings = [
  "价格使用简单收益率；利率使用基点变化（非债券回报）。指数采用价格回报，不含股息。",
  "日频按相同起止交易日期的收益区间取交集；周频ISO周、月频自然月各取周期末实际观察，不填充休市价格。",
  "跨市场同一日期的收盘时间不同，可能造成相关性偏差；按资产对交集的矩阵不用于直接估算组合协方差。",
  "FX报价自身采用原始USD/CNY变化；其他价格仅在有效同日汇率存在时转换，既有人民币价格不重复转换。",
  "陈旧序列仍可用于历史研究，所选日期范围不保证拥有完整覆盖；相关性低不代表风险小。",
];
export async function correlation(input: AnalysisInput) {
  const p = await prepared(input);
  const key = JSON.stringify({
    ...input,
    version: p.version,
    algorithm: "atlas-corr-v1",
  });
  if (cache.has(key)) return cache.get(key);
  const matrix = input.assets.map((a, i) =>
    input.assets.map((b, j) => {
      const c = cell(a, b, p.transformed[i], p.transformed[j]);
      return {
        ...c,
        missingRate:
          1 -
          c.n /
            Math.max(1, new Set([...p.timelines[i], ...p.timelines[j]]).size),
        reason: c.reason || p.assets[i].reason || p.assets[j].reason,
      };
    }),
  );
  const result = {
    ...input,
    assets: p.assets,
    matrix,
    isDemo: p.isDemo,
    algorithm: "atlas-corr-v1",
    warnings,
  };
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
export async function rollingAnalysis(
  input: AnalysisInput,
  a: string,
  b: string,
  window: number,
) {
  const p = await prepared(input),
    i = input.assets.indexOf(a),
    j = input.assets.indexOf(b);
  return {
    points: rolling(p.transformed[i], p.transformed[j], window, [
      ...p.timelines[i],
      ...p.timelines[j],
    ]),
    pairs: align(p.transformed[i], p.transformed[j]),
    cell: cell(a, b, p.transformed[i], p.transformed[j]),
    window,
    warnings,
    isDemo: p.isDemo,
  };
}
export async function availability() {
  const items = await Promise.all(
    catalog.map(async (s) => {
      const d = await history(s.id, "1900-01-01", "2100-01-01");
      return {
        id: s.id,
        name: s.nameZh,
        currency: s.currency,
        unit: s.unit,
        transform: transform(s.id),
        status: d.status,
        source: d.source,
        asOf: d.asOf,
        fetchedAt: d.fetchedAt,
        count: d.points.filter((p) => p.value !== null).length,
        reason:
          transform(s.id) === "unsupported"
            ? "尚未注册可比历史口径"
            : !d.points.length
              ? "历史不可用；请配置并同步数据源"
              : null,
      };
    }),
  );
  return { items };
}
export async function refreshAssets(ids: string[]) {
  ids.forEach(seriesById);
  const items = [];
  for (const id of ids) {
    seriesById(id);
    try {
      if (["FRED_NASDAQ100", "FRED_SP500"].includes(id))
        await latestIndex(id, true);
      else await syncSeries(id);
      items.push({ id, status: "requested" });
    } catch {
      items.push({
        id,
        status: "unavailable",
        message:
          "同步失败或该来源不支持历史回填；已有历史保留，请检查数据源配置中心",
      });
    }
  }
  cache.clear();
  return { items };
}
