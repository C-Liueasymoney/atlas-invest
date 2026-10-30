import { z } from "zod";
import { controlled } from "./providers/controller";
import { database, query } from "./db/client";
import { quote, seriesData } from "./data";
import { seriesById } from "./catalog";
import { AppError } from "./errors";
import type { Quote, SeriesData } from "./types";
export const indexSymbols: Record<string, string> = {
  FRED_NASDAQ100: "^NDX",
  FRED_SP500: "^GSPC",
};
export type IndexResult = {
  items: Quote[];
  history: SeriesData;
  message: string;
};
export function parseIndexChart(
  payload: unknown,
  id: string,
  now = new Date(),
): IndexResult {
  const expected = indexSymbols[id];
  if (!expected) throw new AppError("INVALID_SERIES", "不支持的指数");
  const record = z
    .object({
      meta: z.object({
        symbol: z.literal(expected),
        instrumentType: z.literal("INDEX"),
        currency: z.literal("USD"),
        exchangeTimezoneName: z.literal("America/New_York"),
        regularMarketPrice: z.number().finite().positive(),
        regularMarketTime: z.number().int().positive(),
      }),
      timestamp: z.array(z.number().int().positive()),
      indicators: z.object({
        quote: z
          .array(
            z.object({
              close: z.array(z.number().finite().positive().nullable()),
            }),
          )
          .min(1),
      }),
    })
    .parse(
      z
        .object({ chart: z.object({ result: z.array(z.unknown()).min(1) }) })
        .parse(payload).chart.result[0],
    );
  const m = record.meta,
    at = new Date(m.regularMarketTime * 1000);
  if (at.getTime() > now.getTime() + 300000)
    throw new AppError("SOURCE_UNAVAILABLE", "指数报价时间在未来");
  const marketDate = (epoch: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(epoch * 1000));
  const closes = record.indicators.quote[0].close;
  if (record.timestamp.length !== closes.length)
    throw new AppError("SOURCE_UNAVAILABLE", "指数历史字段不完整");
  const unique = new Map<string, string>();
  record.timestamp.forEach((t, i) => {
    if (t * 1000 > now.getTime() + 300000)
      throw new AppError("SOURCE_UNAVAILABLE", "指数历史时间在未来");
    if (closes[i] != null) unique.set(marketDate(t), String(closes[i]));
  });
  const points = [...unique]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, value]) => ({ time, value }));
  const source = {
    id: "yahoo",
    label: "Yahoo Finance · 指数参考行情",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(expected)}/`,
  };
  const item: Quote = {
    seriesId: id,
    value: String(m.regularMarketPrice),
    previousValue:
      points.filter((p) => p.time < marketDate(m.regularMarketTime)).at(-1)
        ?.value ?? null,
    unit: "index",
    currency: "USD",
    asOf: at.toISOString(),
    asOfKind: "timestamp",
    fetchedAt: now.toISOString(),
    isDemo: false,
    status: now.getTime() - at.getTime() > 4 * 86400000 ? "stale" : "delayed",
    source,
    qualityFlags: ["index_quote_snapshot"],
    message:
      "实际指数最新参考报价；免费公共接口，可能延时，不承诺实时或稳定性。",
  };
  return {
    items: [item],
    history: {
      series: seriesById(id),
      points,
      source,
      asOf: points.at(-1)?.time ?? null,
      fetchedAt: now.toISOString(),
      status: item.status,
      isDemo: false,
      unit: "index",
      message: "同一来源的近一年日线；折线末端单独同步最新报价。",
    },
    message: item.message!,
  };
}
const memory = new Map<string, IndexResult>();
const tencentSymbols: Record<string, string> = {
  FRED_NASDAQ100: "us.NDX",
  FRED_SP500: "us.INX",
};
export function parseTencentIndex(
  text: string,
  id: string,
  now = new Date(),
): Quote {
  const symbol = tencentSymbols[id];
  if (!symbol) throw new AppError("INVALID_SERIES", "不支持的指数");
  const line = text.split("\n").find((l) => l.startsWith(`v_${symbol}=`));
  const fields = line?.match(/="([^"]*)"/)?.[1].split("~");
  const name = id === "FRED_NASDAQ100" ? "纳斯达克100" : "标普500";
  if (
    !fields ||
    fields[1] !== name ||
    fields[2] !== symbol.slice(2) ||
    fields[35] !== "USD" ||
    !/^\d+(?:\.\d+)?$/.test(fields[3]) ||
    Number(fields[3]) <= 0 ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fields[30])
  )
    throw new AppError("SOURCE_UNAVAILABLE", "指数品种、货币或时间校验失败");
  const date = fields[30].slice(0, 10);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(date + "T12:00:00Z"))
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  const at = new Date(fields[30].replace(" ", "T") + offset);
  if (!Number.isFinite(at.getTime()) || at.getTime() > now.getTime() + 300000)
    throw new AppError("SOURCE_UNAVAILABLE", "指数报价时间无效或在未来");
  return {
    seriesId: id,
    value: fields[3],
    previousValue: Number(fields[4]) > 0 ? fields[4] : null,
    unit: "index",
    currency: "USD",
    asOf: at.toISOString(),
    asOfKind: "timestamp",
    fetchedAt: now.toISOString(),
    isDemo: false,
    status: now.getTime() - at.getTime() > 4 * 86400000 ? "stale" : "delayed",
    source: {
      id: "tencent_index",
      label: "腾讯财经 · 实际指数参考行情",
      url: `https://gu.qq.com/${symbol.replace(".", "")}`,
    },
    qualityFlags: ["index_quote_snapshot"],
    message:
      "实际指数参考报价；源端时间按美东时区解析，公共行情可能延时，不保证逐笔实时。",
  };
}
async function tencentIndex(id: string): Promise<IndexResult> {
  const symbol = tencentSymbols[id];
  const r = await fetch(`https://qt.gtimg.cn/q=${symbol}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new AppError("SOURCE_UNAVAILABLE", "指数报价来源不可用");
  const item = parseTencentIndex(
    new TextDecoder("gb18030").decode(await r.arrayBuffer()),
    id,
  );
  let history: SeriesData;
  try {
    const h = await fetch(
      `https://web.ifzq.gtimg.cn/appstock/app/usfqkline/get?param=${symbol},day,,,320,qfq`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!h.ok) throw new Error();
    const payload = await h.json();
    const rows = z
      .array(z.array(z.unknown()).min(6))
      .min(1)
      .parse(payload?.data?.[symbol]?.day);
    const points = rows
      .map((row) => {
        const date = z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .parse(row[0]);
        const value = z.coerce.number().finite().positive().parse(row[2]);
        if (Date.parse(date) > Date.now() + 86400000) throw new Error();
        return { time: date, value: String(value) };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
    history = {
      series: seriesById(id),
      points,
      source: item.source,
      asOf: points.at(-1)!.time,
      fetchedAt: item.fetchedAt,
      status: item.status,
      isDemo: false,
      unit: "index",
      message: "腾讯财经实际指数日线；末端同步最新报价，不改写数据库收盘记录。",
    };
  } catch {
    history = {
      series: seriesById(id),
      points: [],
      source: item.source,
      asOf: null,
      fetchedAt: item.fetchedAt,
      status: "unavailable",
      isDemo: false,
      unit: "index",
      message: "指数历史暂不可用；仍保留最新报价。",
    };
  }
  return { items: [item], history, message: item.message! };
}
export async function latestIndex(
  id: string,
  force = false,
): Promise<IndexResult> {
  const symbol = indexSymbols[id];
  if (!symbol) throw new AppError("INVALID_SERIES", "不支持的指数");
  if (process.env.DATA_MODE === "demo")
    return {
      items: [await quote(id)],
      history: await seriesData(id),
      message: "DEMO",
    };
  const key = "tencent_index:index-snapshot:" + id;
  let saved =
    process.env.DATA_MODE === "live"
      ? (
          await query<{ payload: IndexResult }>(
            "SELECT payload FROM provider_cache WHERE cache_key=$1",
            [key],
          )
        )[0]?.payload
      : memory.get(id);
  try {
    let raw: IndexResult;
    try {
      raw = await controlled(
        "tencent_index",
        "index-chart:" + id,
        async () => ({ value: await tencentIndex(id) }),
        force,
      );
    } catch {
      raw = await controlled(
        "yahoo",
        "index-chart:" + symbol,
        async () => {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`,
            {
              cache: "no-store",
              signal: AbortSignal.timeout(15000),
              headers: { "User-Agent": "Mozilla/5.0" },
            },
          );
          if (!r.ok)
            throw new AppError("SOURCE_UNAVAILABLE", "指数报价来源不可用");
          return { value: parseIndexChart(await r.json(), id) };
        },
        force,
      );
    }
    const result: IndexResult = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!result.history.points.length) result.history = await seriesData(id);
    const prior = saved?.items?.[0],
      item = result.items[0];
    if (!prior?.asOf || item.asOf! >= prior.asOf) {
      if (process.env.DATA_MODE === "live") {
        const sql = database();
        await sql`INSERT INTO provider_cache(cache_key,provider_id,payload,expires_at) VALUES(${key},${item.source.id},${sql.json(result as unknown as Parameters<typeof sql.json>[0])},now()+interval '7 days') ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,provider_id=EXCLUDED.provider_id,expires_at=EXCLUDED.expires_at WHERE (provider_cache.payload->'items'->0->>'asOf') <= (EXCLUDED.payload->'items'->0->>'asOf')`;
        saved = (
          await query<{ payload: IndexResult }>(
            "SELECT payload FROM provider_cache WHERE cache_key=$1",
            [key],
          )
        )[0]?.payload;
      } else {
        memory.set(id, result);
        saved = result;
      }
    }
    return saved ?? result;
  } catch (e) {
    const message = `最新指数获取失败：${e instanceof AppError ? e.message : "来源暂不可用"}；保留最近可信数据。`;
    if (saved?.items?.[0])
      return {
        ...saved,
        items: saved.items.map((q) => ({ ...q, status: "stale", message })),
        message,
      };
    return {
      items: [{ ...(await quote(id)), message }],
      history: await seriesData(id),
      message,
    };
  }
}
