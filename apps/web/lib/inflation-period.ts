import Decimal from "decimal.js";
import type { Point } from "./types";
export const inflationInputs: Record<
  string,
  { id: string; method: "index" | "monthly" }
> = {
  US_CPI_YOY_M: { id: "US_CPI_INDEX_M", method: "index" },
  CN_CPI_YOY_M: { id: "CN_CPI_MOM_M", method: "monthly" },
};
export type PeriodResult = {
  status: "available" | "unavailable";
  estimated: boolean;
  actualFrom: string | null;
  actualTo: string | null;
  months: number;
  cumulativePct: string | null;
  annualizedPct: string | null;
  equivalentAmount: string | null;
  realValue: string | null;
  purchasingPowerPct: string | null;
  startTruncated: boolean;
  endTruncated: boolean;
  message: string;
};
const monthNumber = (time: string) =>
  Number(time.slice(0, 4)) * 12 + Number(time.slice(5, 7)) - 1;
const valid = (value: string | null): value is string =>
  value !== null &&
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
  new Decimal(value).isFinite();
export function inflationPeriod(
  points: Point[],
  method: "index" | "monthly",
  from: string,
  to: string,
): PeriodResult {
  const start = from.slice(0, 7) + "-01",
    end = to.slice(0, 7) + "-01";
  const result: PeriodResult = {
    status: "unavailable",
    estimated: method === "monthly",
    actualFrom: null,
    actualTo: null,
    months: 0,
    cumulativePct: null,
    annualizedPct: null,
    equivalentAmount: null,
    realValue: null,
    purchasingPowerPct: null,
    startTruncated: false,
    endTruncated: false,
    message: "区间内至少需要两个有效观察月份，请同步基础数据或扩大区间。",
  };
  const rows = points
    .filter(
      (p) =>
        /^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(p.time) &&
        p.time >= start &&
        p.time <= end,
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  if (new Set(rows.map((p) => p.time)).size !== rows.length)
    return { ...result, message: "观察月份重复，无法计算。" };
  const endpoints = rows.filter(
    (p) => valid(p.value) && (method !== "index" || new Decimal(p.value).gt(0)),
  );
  const first = endpoints[0],
    last = endpoints.at(-1);
  if (!first || !last || first.time === last.time) return result;
  Object.assign(result, {
    actualFrom: first.time,
    actualTo: last.time,
    months: monthNumber(last.time) - monthNumber(first.time),
    startTruncated: first.time > start,
    endTruncated: last.time < end,
  });
  let factor: Decimal;
  if (method === "index") factor = new Decimal(last.value!).div(first.value!);
  else {
    const changes = rows.filter(
      (p) => p.time > first.time && p.time <= last.time,
    );
    if (
      changes.length !== result.months ||
      changes.some(
        (p, i) =>
          monthNumber(p.time) !== monthNumber(first.time) + i + 1 ||
          !valid(p.value) ||
          new Decimal(p.value).lte(-100),
      )
    )
      return {
        ...result,
        message: "区间内存在缺失或无效环比数据，不能跨月连乘估算。",
      };
    factor = changes.reduce(
      (acc, p) => acc.mul(new Decimal(p.value!).div(100).plus(1)),
      new Decimal(1),
    );
  }
  if (!factor.isFinite() || factor.lte(0))
    return { ...result, message: "价格比值无效，无法计算。" };
  return {
    ...result,
    status: "available",
    cumulativePct: factor.minus(1).mul(100).toFixed(6),
    annualizedPct: factor
      .pow(new Decimal(12).div(result.months))
      .minus(1)
      .mul(100)
      .toFixed(6),
    equivalentAmount: factor.mul(10000).toFixed(2),
    realValue: new Decimal(10000).div(factor).toFixed(2),
    purchasingPowerPct: new Decimal(1).div(factor).minus(1).mul(100).toFixed(6),
    message:
      method === "monthly"
        ? "按公布的月度环比率连乘估算，舍入误差会累积；非官方定基指数结果。"
        : "按未季调 CPI 指数首尾比值计算。",
  };
}
