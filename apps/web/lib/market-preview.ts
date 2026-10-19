import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { seriesById } from "./catalog";
import { providerConfig, getRoutes } from "./providers/repository";
import { catalog } from "./catalog";
import { providerById } from "./providers/registry";
import { controlled } from "./providers/controller";
import { compatibleRoutes } from "./providers/routing";
import { AppError } from "./errors";
import type { Point, Quote, SeriesData } from "./types";
const number = z
  .string()
  .regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)$/)
  .refine((v) => Number.isFinite(Number(v)));
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
  );
const point = z.object({
  time: day,
  value: number.nullable(),
  open: number.optional(),
  high: number.optional(),
  low: number.optional(),
  close: number.optional(),
  volume: number.nullable().optional(),
});
const entrySchema = z.object({
  seriesId: z.string(),
  providerId: z.string(),
  fetchedAt: z.iso.datetime({ offset: true }),
  cacheSeconds: z.number().int().min(0).max(86400).default(0),
  status: z.enum(["ok", "unavailable", "not_configured"]),
  points: z.array(point).max(10000),
  asOf: z.string().nullable(),
  value: number.optional(),
  qualityFlags: z.array(z.string()).default([]),
  lastError: z.string().max(300).optional(),
});
const root = () =>
  process.env.ATLAS_PROJECT_ROOT || resolve(process.cwd(), "../..");
export const previewMode = () => process.env.DATA_MODE === "preview";
async function enabledRoute(id: string) {
  const s = seriesById(id);
  const route = compatibleRoutes(s, await getRoutes(id))[0];
  return (
    s.enabled &&
    !!route &&
    route.providerId === s.providerId &&
    route.providerSymbol === s.providerSymbol &&
    (await providerConfig(s.providerId)).enabled
  );
}
async function entry(id: string) {
  try {
    const raw = JSON.parse(
      await readFile(
        process.env.ATLAS_MARKET_CACHE_PATH ||
          resolve(root(), ".atlas/market-snapshot.json"),
        "utf8",
      ),
    );
    if (raw.version !== 1) return;
    const parsed = entrySchema.safeParse(raw.series?.[id]);
    if (!parsed.success) return;
    const e = parsed.data,
      s = seriesById(id);
    if (
      e.seriesId !== id ||
      e.providerId !== s.providerId ||
      Date.parse(e.fetchedAt) > Date.now() + 300000 ||
      (e.asOf &&
        (isNaN(Date.parse(e.asOf)) ||
          Date.parse(e.asOf) >
            Date.now() + (s.kind === "quote" ? 300000 : 86400000)))
    )
      return;
    return e;
  } catch {
    return;
  }
}
export async function refreshPreview(seriesId?: string) {
  if (!previewMode())
    throw new AppError("FORBIDDEN", "此操作仅用于真实数据预览", 409);
  const ids = seriesId
    ? [seriesById(seriesId).id]
    : [
        "SGE_AU9999_D1",
        "XAUUSD_QUOTE",
        "FX_USDCNY_D1",
        "FRED_DFII10",
        "FRED_DGS10",
        "FRED_DTWEXBGS",
        "FRED_NASDAQ100",
        "FRED_SP500",
      ];
  const results: {
    seriesId: string;
    status: string;
    count?: number;
    asOf?: string | null;
  }[] = [];
  for (const id of ids) {
    const s = catalog.find((s) => s.id === id)!;
    if (!(await enabledRoute(id))) {
      results.push({ seriesId: id, status: "disabled" });
      continue;
    }
    if (s.providerId === "fred" && !process.env.FRED_API_KEY) {
      results.push({ seriesId: id, status: "not_configured" });
      continue;
    }
    try {
      const result = await controlled(
        s.providerId,
        "refresh-preview:" + id,
        async () => {
          const { stdout } = await promisify(execFile)(
            process.execPath,
            [resolve(root(), "scripts/refresh-market.mjs"), "--series", id],
            {
              cwd: root(),
              env: process.env,
              timeout: 120000,
              maxBuffer: 1024 * 1024,
            },
          );
          const parsed = z
            .object({
              results: z.array(
                z.object({
                  seriesId: z.string(),
                  status: z.string(),
                  count: z.number().optional(),
                  asOf: z.string().nullable().optional(),
                }),
              ),
            })
            .parse(JSON.parse(stdout));
          return {
            value: parsed.results[0],
            maxAgeSeconds: (await entry(id))?.cacheSeconds,
          };
        },
      );
      results.push(result);
    } catch {
      results.push({ seriesId: id, status: "unavailable" });
    }
  }
  return {
    status: results.some((r) => r.status === "unavailable")
      ? "partial"
      : "success",
    message: `${results.filter((r) => r.status === "success").length} 项实际数据已更新；${results.filter((r) => r.status === "not_configured").length} 项缺少凭据。`,
    results,
  };
}

export async function previewSeries(
  id: string,
  from = "1900-01-01",
  to = "2100-01-01",
): Promise<SeriesData> {
  const s = seriesById(id),
    e = await entry(id);
  const enabled = await enabledRoute(id);
  const points: Point[] = (e?.points ?? []).filter(
    (p) => p.time >= from && p.time <= to,
  );
  const valid = points.findLast((p) => p.value !== null);
  const asOf = valid?.time ?? null;
  const unavailable =
    s.providerId === "fred" && !process.env.FRED_API_KEY
      ? "not_configured"
      : "unavailable";
  return {
    series: s,
    points,
    source: {
      id: s.providerId,
      label: providerById(s.providerId).displayName,
      url: s.sourceUrl,
    },
    unit: s.unit,
    asOf,
    fetchedAt: e?.fetchedAt ?? null,
    status: !asOf
      ? unavailable
      : !enabled ||
          e?.status !== "ok" ||
          Date.now() - Date.parse(asOf) > s.staleSeconds * 1000
        ? "stale"
        : "delayed",
    isDemo: false,
    message: !asOf
      ? unavailable === "not_configured"
        ? "FRED_API_KEY 未配置，未使用演示值替代"
        : "尚无已采集真实数据，请点击刷新数据"
      : !enabled
        ? "数据源或路由已停用，保留最近实际数据"
        : (e?.lastError ??
          "实际源数据 · 最近交易日/统计观察日，非盘中可成交报价"),
  };
}
export async function previewQuote(
  id: string,
  autoRefresh = true,
): Promise<Quote> {
  const s = seriesById(id);
  let e = await entry(id);
  const enabled = await enabledRoute(id);
  if (
    enabled &&
    id === "XAUUSD_QUOTE" &&
    autoRefresh &&
    (!e ||
      Date.now() - Date.parse(e.fetchedAt) >
        Math.max(30, e.cacheSeconds) * 1000)
  ) {
    try {
      await refreshPreview(id);
      e = await entry(id);
    } catch {}
  }
  if (s.kind !== "quote") {
    const d = await previewSeries(id);
    const valid = d.points.filter((p) => p.value !== null);
    return {
      seriesId: id,
      value: valid.at(-1)?.value ?? null,
      previousValue: valid.at(-2)?.value ?? null,
      asOfKind: "date",
      unit: s.unit,
      currency: s.currency,
      source: d.source,
      asOf: d.asOf,
      fetchedAt: d.fetchedAt,
      status: d.status,
      isDemo: false,
      message: d.message,
    };
  }
  const asOf = e?.asOf ?? null;
  return {
    seriesId: id,
    value: e?.value ?? null,
    previousValue: null,
    asOfKind: "timestamp",
    unit: s.unit,
    currency: s.currency,
    source: {
      id: s.providerId,
      label: providerById(s.providerId).displayName,
      url: s.sourceUrl,
    },
    asOf,
    fetchedAt: e?.fetchedAt ?? null,
    status: !e?.value
      ? "unavailable"
      : !enabled ||
          e.status !== "ok" ||
          !asOf ||
          Date.now() - Date.parse(asOf) > s.staleSeconds * 1000
        ? "stale"
        : "delayed",
    isDemo: false,
    qualityFlags: e?.qualityFlags,
    message: !enabled
      ? "数据源或路由已停用，保留最近实际报价"
      : (e?.lastError ??
        (!e
          ? "尚无有效源报价；不会使用演示价格"
          : "供应商参考报价；非上金所收盘价或首饰零售价")),
  };
}
