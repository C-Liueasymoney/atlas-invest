import Decimal from "decimal.js";
import type { Point, Quote } from "./types";
import { AppError } from "./errors";
export function convertGold(xau: string, fx: string) {
  if (new Decimal(xau).lte(0) || new Decimal(fx).lte(0))
    throw new AppError("INVALID_UNIT", "价格和汇率必须为正");
  return new Decimal(xau).mul(fx).div("31.1034768").toFixed(8);
}
export function change(value: string, previous: string, unit: string) {
  const p = new Decimal(previous),
    v = new Decimal(value);
  if (unit === "percent")
    return { value: v.minus(p).toString(), unit: "百分点" };
  return {
    value: p.gt(0) ? v.div(p).minus(1).mul(100).toFixed(4) : null,
    unit: "%",
  };
}
export function compareSeries(all: Point[][], mode: string, align: string) {
  const dates = [...new Set(all.flatMap((s) => s.map((p) => p.time)))]
    .sort()
    .filter(
      (t) =>
        align !== "intersection" ||
        all.every((s) => s.some((p) => p.time === t && p.value !== null)),
    );
  return all.map((points) => {
    const map = new Map(points.map((p) => [p.time, p.value]));
    const first = dates.map((t) => map.get(t)).find((v) => v != null);
    const base = first != null && new Decimal(first).gt(0) ? first : undefined;
    return dates.map((time) => {
      const v = map.get(time);
      return {
        time,
        value:
          v == null
            ? null
            : mode === "raw"
              ? Number(v)
              : !base
                ? null
                : Number(
                    new Decimal(v)
                      .div(base)
                      .minus(mode === "pct" ? 1 : 0)
                      .mul(100),
                  ),
      };
    });
  });
}
export function riskStats(values: string[]) {
  const p = values.map((v) => new Decimal(v)).filter((v) => v.gt(0));
  let peak = p[0] ?? new Decimal(0),
    dd = new Decimal(0);
  const returns: number[] = [];
  p.forEach((v, i) => {
    peak = Decimal.max(peak, v);
    dd = Decimal.min(dd, v.div(peak).minus(1));
    if (i) returns.push(Number(v.div(p[i - 1]).ln()));
  });
  const mean = returns.length
    ? returns.reduce((a, b) => a + b, 0) / returns.length
    : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
      : 0;
  return {
    maxDrawdownPct: Number(dd.mul(100)),
    annualizedVolatilityPct:
      returns.length > 1 ? Math.sqrt(variance * 252) * 100 : null,
    sampleCount: p.length,
  };
}

export function deriveGoldQuotes(
  x: Quote,
  fx: Quote,
  domestic?: Quote,
): Pick<
  Quote,
  | "value"
  | "asOf"
  | "fetchedAt"
  | "status"
  | "isDemo"
  | "qualityFlags"
  | "message"
> {
  const inputs = domestic ? [x, fx, domestic] : [x, fx];
  const isDemo = inputs.some((q) => q.isDemo);
  if (inputs.some((q) => q.value === null))
    return {
      value: null,
      asOf: null,
      fetchedAt: null,
      status: isDemo ? "demo" : "unavailable",
      isDemo,
      message: "缺少计算所需的黄金、汇率或国内现货输入",
    };
  const converted = convertGold(x.value!, fx.value!);
  const value = domestic
    ? new Decimal(domestic.value!).minus(converted).toFixed(8)
    : converted;
  const dates = inputs
    .flatMap((q) =>
      q.asOf && Number.isFinite(Date.parse(q.asOf))
        ? [new Date(q.asOf).toISOString()]
        : [],
    )
    .sort();
  const fetched = inputs
    .flatMap((q) =>
      q.fetchedAt && Number.isFinite(Date.parse(q.fetchedAt))
        ? [new Date(q.fetchedAt).toISOString()]
        : [],
    )
    .sort();
  const stale =
    dates.length !== inputs.length ||
    inputs.some((q) =>
      ["stale", "unavailable", "not_configured"].includes(q.status),
    );
  return {
    value,
    asOf: dates[0] ?? null,
    fetchedAt: fetched.at(-1) ?? null,
    status: isDemo ? "demo" : stale ? "stale" : "delayed",
    isDemo,
    qualityFlags: [
      "estimate",
      ...(new Set(dates).size > 1 ? ["observation_time_mismatch"] : []),
    ],
    message: "估算值；输入采用各自观察时间，以最早输入标记时效，不是可成交价。",
  };
}
