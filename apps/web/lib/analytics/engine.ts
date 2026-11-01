export type Frequency = "daily" | "weekly" | "monthly";
export type Observation = { time: string; value: string | null };
export type ReturnPoint = {
  time: string;
  start: string;
  key: string;
  value: number;
};
export type Cell = {
  a: string;
  b: string;
  value: number | null;
  n: number;
  from: string | null;
  to: string | null;
  reason: string | null;
  missingRate: number;
};
export const MIN_SAMPLES = 20;
export function normalize(points: Observation[], positive = true) {
  const map = new Map<string, number | null>();
  for (const p of points) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(p.time) ||
      !Number.isFinite(Date.parse(p.time)) ||
      new Date(p.time).toISOString().slice(0, 10) !== p.time
    )
      continue;
    const v = p.value === null || p.value.trim() === "" ? NaN : Number(p.value);
    const valid = Number.isFinite(v) && (!positive || v > 0) ? v : null;
    if (map.has(p.time) && map.get(p.time) !== valid) map.set(p.time, null);
    else if (!map.has(p.time)) map.set(p.time, valid);
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, value]) => ({ time, value }));
}
export function bucket(date: string, f: Frequency) {
  if (f === "daily") return date;
  if (f === "monthly") return date.slice(0, 7);
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function returns(
  points: Observation[],
  frequency: Frequency,
  transform: "return" | "bp-change",
  currency: string,
  base: string,
  fx: Observation[] = [],
): ReturnPoint[] {
  const rates = new Map(normalize(fx).map((p) => [p.time, p.value]));
  const data = normalize(points, transform === "return").map((p) => {
    let value = p.value;
    if (transform === "return" && currency !== base) {
      const rate = rates.get(p.time);
      value =
        value !== null && rate != null
          ? currency === "USD" && base === "CNY"
            ? value * rate
            : currency === "CNY" && base === "USD"
              ? value / rate
              : null
          : null;
    }
    return { ...p, value };
  });
  const periods = new Map<string, { time: string; value: number | null }>();
  for (const p of data) periods.set(bucket(p.time, frequency), p);
  const rows = [...periods];
  const result: ReturnPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [before, a] = rows[i - 1],
      [period, b] = rows[i];
    if (a.value === null || b.value === null) continue;
    if (
      frequency === "weekly" &&
      (Date.parse(period) - Date.parse(before)) / 86400000 !== 7
    )
      continue;
    if (frequency === "monthly") {
      const x = new Date(before + "-01"),
        y = new Date(period + "-01");
      if (
        (y.getUTCFullYear() - x.getUTCFullYear()) * 12 +
          y.getUTCMonth() -
          x.getUTCMonth() !==
        1
      )
        continue;
    }
    const value =
      transform === "return"
        ? b.value / a.value - 1
        : (b.value - a.value) * 100;
    if (Number.isFinite(value))
      result.push({
        time: frequency === "daily" ? b.time : period,
        start: before,
        key: before + "|" + period,
        value,
      });
  }
  return result;
}
export function pearson(
  pairs: { x: number; y: number }[],
  minimum = MIN_SAMPLES,
): { value: number | null; reason: string | null } {
  if (pairs.length < minimum)
    return { value: null, reason: `样本不足：至少${minimum}期` };
  const mx = pairs.reduce((s, p) => s + p.x, 0) / pairs.length,
    my = pairs.reduce((s, p) => s + p.y, 0) / pairs.length;
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const p of pairs) {
    const x = p.x - mx,
      y = p.y - my;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  if (xx <= 1e-24 || yy <= 1e-24)
    return { value: null, reason: "变化序列方差为0" };
  return {
    value: Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))),
    reason: null,
  };
}
export function align(a: ReturnPoint[], b: ReturnPoint[]) {
  const m = new Map(b.map((p) => [p.key, p]));
  return a
    .flatMap((p) => {
      const q = m.get(p.key);
      return q ? [{ time: p.time, key: p.key, x: p.value, y: q.value }] : [];
    })
    .sort((p, q) => p.time.localeCompare(q.time));
}
export function cell(
  a: string,
  b: string,
  x: ReturnPoint[],
  y: ReturnPoint[],
): Cell {
  const pairs = align(x, y),
    union = new Set([...x, ...y].map((p) => p.key)).size;
  return {
    a,
    b,
    ...pearson(pairs),
    n: pairs.length,
    from: pairs[0]?.time ?? null,
    to: pairs.at(-1)?.time ?? null,
    missingRate: union ? 1 - pairs.length / union : 1,
  };
}
export function rolling(
  a: ReturnPoint[],
  b: ReturnPoint[],
  window: number,
  timeline: string[] = [],
) {
  const pairs = align(a, b);
  const all = [
    ...new Set([...a.map((p) => p.time), ...b.map((p) => p.time), ...timeline]),
  ].sort();
  const paired = new Map(pairs.map((p, i) => [p.time, i]));
  return all.map((time) => {
    const i = paired.get(time);
    return {
      time,
      value:
        i === undefined || i + 1 < window
          ? null
          : pearson(pairs.slice(i + 1 - window, i + 1), window).value,
    };
  });
}
