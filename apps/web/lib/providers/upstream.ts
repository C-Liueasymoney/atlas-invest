import { createHash } from "node:crypto";
import { collectorCommand } from "../collector";
import { z } from "zod";
import { AppError } from "../errors";
import { controlled } from "./controller";
import { credential, saveHealth } from "./repository";
import type { Health, Point } from "../types";
export interface NormalizedSample {
  points: Point[];
  asOf: string;
  fetchedAt: string;
  value: string | null;
  unit: string;
  currency: string;
  providerId: string;
  symbol: string;
}
const finite = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export async function upstreamJson(
  url: URL,
  headers: Record<string, string> = {},
) {
  let r: Response;
  try {
    r = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(
        Math.min(
          30000,
          Number(process.env.INGEST_REQUEST_TIMEOUT_SECONDS || 15) * 1000,
        ),
      ),
    });
  } catch {
    throw new AppError("SOURCE_UNAVAILABLE", "上游网络超时或不可达", 503);
  }
  if (r.status === 401 || r.status === 403)
    throw new AppError(
      "SOURCE_UNAUTHORIZED",
      "上游拒绝鉴权，请检查 Key 或接口权限",
      401,
    );
  if (r.status === 429)
    throw new AppError("SOURCE_RATE_LIMITED", "供应商请求额度耗尽", 429);
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw new AppError("SOURCE_UNAVAILABLE", "上游返回非 JSON", 503);
  }
  const parsed = z.record(z.string(), z.unknown()).safeParse(data);
  if (parsed.success) {
    const d = parsed.data;
    const detail = String(
      d.error_message ?? d.Information ?? d["Error Message"] ?? "",
    );
    if (
      /invalid.*api.?key|api.?key.*(?:invalid|not registered|missing)|value for variable api_key/i.test(
        detail,
      )
    )
      throw new AppError(
        "SOURCE_UNAUTHORIZED",
        "上游拒绝 API Key，请检查凭据",
        401,
      );
    if (d.Note || d.Information)
      throw new AppError(
        "SOURCE_RATE_LIMITED",
        "供应商限额、计划或示例 Key 限制，请核对账户权益",
        429,
      );
    if (d["Error Message"] || d.error)
      throw new AppError(
        "SOURCE_UNAUTHORIZED",
        "供应商拒绝请求，检查代码或 Key",
        401,
      );
  }
  if (!r.ok)
    throw new AppError("SOURCE_UNAVAILABLE", `上游 HTTP ${r.status}`, 503);
  return {
    data,
    maxAgeSeconds: Number(
      r.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 0,
    ),
  };
}
export function parseGold(data: unknown): NormalizedSample {
  const d = z
    .object({
      symbol: z.literal("XAU"),
      currency: z.literal("USD"),
      price: finite.positive(),
      updatedAt: z.iso.datetime({ offset: true }),
    })
    .parse(data);
  if (Date.parse(d.updatedAt) > Date.now() + 300000)
    throw new AppError(
      "SOURCE_UNAVAILABLE",
      "上游报价时间超前，拒绝伪新鲜数据",
    );
  return {
    providerId: "gold_api",
    symbol: "XAU",
    points: [],
    value: String(d.price),
    asOf: d.updatedAt,
    fetchedAt: new Date().toISOString(),
    unit: "USD/troy_oz",
    currency: "USD",
  };
}
export function parseFx(data: unknown): NormalizedSample {
  const rows = z
    .array(
      z.object({
        date,
        base: z.string(),
        quote: z.string(),
        rate: finite.positive(),
      }),
    )
    .min(1)
    .parse(Array.isArray(data) ? data : [data]);
  if (
    rows.some(
      (d) => d.base.toUpperCase() !== "USD" || d.quote.toUpperCase() !== "CNY",
    )
  )
    throw new AppError("INVALID_UNIT", "汇率方向不匹配");
  const points = rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ time: d.date, value: String(d.rate) }));
  return {
    providerId: "frankfurter",
    symbol: "USD/CNY",
    points,
    value: points.at(-1)!.value,
    asOf: points.at(-1)!.time + "T00:00:00Z",
    fetchedAt: new Date().toISOString(),
    unit: "CNY/USD",
    currency: "CNY",
  };
}
export function parseFred(data: unknown, symbol: string): NormalizedSample {
  const rows = z
    .object({
      observations: z.array(
        z.object({
          date,
          value: z
            .string()
            .refine(
              (v) => v === "." || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v),
              "非有效数值",
            ),
        }),
      ),
    })
    .parse(data).observations;
  const points = rows
    .map((d) => ({
      time: d.date,
      value: d.value === "." ? null : String(finite.parse(Number(d.value))),
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
  const latest = points.findLast((p) => p.value !== null);
  if (!latest) throw new AppError("SOURCE_UNAVAILABLE", "FRED 没有有效观测");
  return {
    providerId: "fred",
    symbol,
    points,
    value: latest.value,
    asOf: latest.time + "T00:00:00Z",
    fetchedAt: new Date().toISOString(),
    unit: ["DFII10", "DGS10", "DFF"].includes(symbol) ? "percent" : "index",
    currency: "USD",
  };
}
export async function fetchSample(
  providerId: string,
  symbol: string,
  from?: string,
  to?: string,
): Promise<NormalizedSample> {
  if (providerId === "fred" && !(await credential(providerId)).key)
    throw new AppError("SOURCE_NOT_CONFIGURED", "请配置 FRED_API_KEY", 409);
  return controlled(
    providerId,
    JSON.stringify([
      symbol,
      from,
      to,
      createHash("sha256")
        .update((await credential(providerId)).key ?? "public")
        .digest("hex")
        .slice(0, 16),
    ]),
    async () => {
      let url: URL;
      let parser: (data: unknown) => NormalizedSample;
      if (providerId === "gold_api") {
        if (symbol !== "XAU")
          throw new AppError("UNSUPPORTED_INTERVAL", "仅验证 XAU 最新报价");
        url = new URL("https://api.gold-api.com/price/XAU");
        parser = parseGold;
      } else if (providerId === "frankfurter") {
        if (symbol !== "USD/CNY")
          throw new AppError("INVALID_UNIT", "仅支持 USD/CNY 参考汇率");
        url = new URL(
          from
            ? "https://api.frankfurter.dev/v2/rates"
            : "https://api.frankfurter.dev/v2/rate/usd/cny",
        );
        if (from) {
          url.searchParams.set("from", from);
          url.searchParams.set("base", "USD");
          url.searchParams.set("quotes", "CNY");
          if (to) url.searchParams.set("to", to);
        }
        parser = parseFx;
      } else if (providerId === "fred") {
        const c = await credential(providerId);
        if (!c.key)
          throw new AppError(
            "SOURCE_NOT_CONFIGURED",
            "请配置 FRED_API_KEY",
            409,
          );
        url = new URL("https://api.stlouisfed.org/fred/series/observations");
        url.searchParams.set("series_id", symbol);
        url.searchParams.set("api_key", c.key);
        url.searchParams.set("file_type", "json");
        url.searchParams.set(
          "observation_start",
          from ||
            new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
        );
        if (to) url.searchParams.set("observation_end", to);
        parser = (d) => parseFred(d, symbol);
      } else
        throw new AppError(
          "UNSUPPORTED_INTERVAL",
          "该操作请使用已配置的 Python collector 或文件导入",
          409,
        );
      const { data, maxAgeSeconds } = await upstreamJson(url);
      let value: NormalizedSample;
      try {
        value = parser(data);
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError(
          "SOURCE_UNAVAILABLE",
          "上游字段或单位不符合已验证协议",
          503,
        );
      }
      return { value, maxAgeSeconds };
    },
  );
}
export async function symbolSearch(providerId: string, q: string) {
  if (providerId === "alpha_vantage") {
    const c = await credential(providerId);
    if (!c.key)
      throw new AppError(
        "SOURCE_NOT_CONFIGURED",
        "请配置 ALPHA_VANTAGE_API_KEY",
        409,
      );
    return controlled(
      providerId,
      "search:" +
        createHash("sha256").update(c.key).digest("hex").slice(0, 16) +
        ":" +
        q,
      async () => {
        const url = new URL("https://www.alphavantage.co/query");
        url.searchParams.set("function", "SYMBOL_SEARCH");
        url.searchParams.set("keywords", q);
        url.searchParams.set("apikey", c.key!);
        const { data } = await upstreamJson(url);
        const parsed = z
          .object({ bestMatches: z.array(z.record(z.string(), z.string())) })
          .parse(data);
        return {
          value: parsed.bestMatches.map((m) => ({
            providerId,
            symbol: m["1. symbol"],
            name: m["2. name"],
            market: m["4. region"],
            assetClass: m["3. type"],
            unit: m["8. currency"] + "/share",
            currency: m["8. currency"],
            priceDefinition: "security",
            operations: ["quote", "bars"],
            intervals: ["1d"],
          })),
        };
      },
    );
  }
  return [];
}
export async function testConnection(id: string): Promise<Health> {
  const checkedAt = new Date().toISOString();
  let h: Health;
  let op = "quote",
    interval = "quote",
    symbol = "XAU";
  try {
    if (id === "tencent_index") {
      symbol = "us.NDX";
      const { latestIndex } = await import("../latest-index");
      const sample = (await latestIndex("FRED_NASDAQ100", true)).items[0];
      if (sample.source.id !== "tencent_index" || sample.status === "stale")
        throw new AppError(
          "SOURCE_UNAVAILABLE",
          sample.message || "指数来源不可用",
        );
      h = {
        providerId: id,
        status: "available",
        checkedAt,
        sampleDataAsOf: sample.asOf || undefined,
        message: "实际纳斯达克100指数参考报价已验证；并非专业实时授权。",
      };
    } else if (["akshare_sge", "cftc"].includes(id)) {
      const seriesId =
        id === "akshare_sge" ? "SGE_AU9999_D1" : "CFTC_GOLD_NET_SPEC_W";
      symbol = id === "akshare_sge" ? "Au99.99" : "088691";
      op = id === "akshare_sge" ? "bars" : "observations";
      interval = id === "akshare_sge" ? "1d" : "1w";
      const summary = await controlled(id, "probe:" + seriesId, async () => {
        const data = await collectorCommand(seriesId, true);
        const rows = z
          .array(
            z.object({
              trading_date: z.string().optional(),
              period_date: z.string().optional(),
            }),
          )
          .min(1)
          .parse(data.records);
        const latest = rows
          .flatMap((r) =>
            r.trading_date || r.period_date
              ? [r.trading_date || r.period_date!]
              : [],
          )
          .sort()
          .at(-1);
        return { value: { asOf: latest ? latest + "T00:00:00Z" : undefined } };
      });
      h = {
        providerId: id,
        status: "available",
        checkedAt,
        sampleDataAsOf: summary.asOf,
        message: `仅 ${symbol} ${op} 样本已验证；源端观察日期与采集时间分开。`,
      };
    } else if (id === "alpha_vantage") {
      symbol = "IBM";
      op = "search";
      interval = "1d";
      await symbolSearch(id, "IBM");
      h = {
        providerId: id,
        status: "available",
        checkedAt,
        message:
          "仅 SYMBOL_SEARCH 已验证；行情 endpoint 与账户权益需逐项验证。",
      };
    } else {
      if (id === "fred") {
        symbol = "DFII10";
        op = "observations";
        interval = "1d";
      } else if (id === "frankfurter") {
        symbol = "USD/CNY";
        op = "observations";
        interval = "1d";
      }
      const sample = await fetchSample(id, symbol);
      h = {
        providerId: id,
        status: "available",
        checkedAt,
        sampleDataAsOf: sample.asOf,
        message: `仅 ${symbol} 的 ${op} 样本请求成功；不代表所有能力可用。`,
      };
    }
  } catch (e) {
    const code = e instanceof AppError ? e.code : "";
    h = {
      providerId: id,
      status:
        code === "SOURCE_NOT_CONFIGURED"
          ? "not_configured"
          : code === "SOURCE_UNAUTHORIZED"
            ? "unauthorized"
            : code === "SOURCE_RATE_LIMITED"
              ? "rate_limited"
              : "unavailable",
      checkedAt,
      message: e instanceof AppError ? e.message : "上游请求失败或协议已变化",
    };
  }
  await saveHealth(h, op, interval, symbol);
  return h;
}
