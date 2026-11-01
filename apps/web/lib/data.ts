import {
  previewMode,
  previewSeries,
  previewQuote,
  refreshPreview,
} from "./market-preview";
import { collectorCommand } from "./collector";
import fixture from "../fixtures/demo.json";
import { catalog, seriesById } from "./catalog";
import { query, demoMode, database } from "./db/client";
import { getRoutes, credential, providerConfig } from "./providers/repository";
import { providerById } from "./providers/registry";
import { compatibleRoutes } from "./providers/routing";
import { fetchSample } from "./providers/upstream";
import { deriveGoldQuotes, compareSeries, riskStats } from "./calculations";
import { AppError } from "./errors";
import type { Point, Quote, SeriesData, Series, Source } from "./types";
function source(s: Series, id = s.providerId): Source {
  return { id, label: providerById(id).displayName, url: s.sourceUrl };
}
export async function seriesData(
  id: string,
  from = "1900-01-01",
  to = "2100-01-01",
): Promise<SeriesData> {
  const s = seriesById(id);
  if (previewMode()) return previewSeries(id, from, to);
  let points: Point[] = [],
    asOf: string | null = null,
    fetchedAt: string | null = null,
    provider = s.providerId;
  if (demoMode()) {
    points = ((fixture.series as Record<string, Point[]>)[id] ?? []).filter(
      (p) => p.time >= from && p.time <= to,
    );
    return {
      series: s,
      points,
      unit: s.unit,
      source: source(s),
      asOf: points.at(-1)?.time ?? null,
      fetchedAt: fixture.asOf,
      status: "demo",
      isDemo: true,
      message: "DEMO：合成示例，仅用于体验界面",
    };
  }
  if (s.kind === "ohlc") {
    const rows = await query<{
      trading_date: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string | null;
      ingested_at: Date;
      provider_id: string;
    }>(
      "SELECT trading_date::text,open,high,low,close,volume,ingested_at,provider_id FROM price_bars WHERE series_id=$1 AND interval='1d' AND trading_date>=$2::date AND trading_date<=$3::date ORDER BY trading_date LIMIT 10000",
      [id, from, to],
    );
    if (rows.length) {
      provider = rows.at(-1)!.provider_id;
      const same = rows.filter((r) => r.provider_id === provider);
      points = same.map((r) => ({
        time: r.trading_date,
        value: r.close,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
      asOf = points.at(-1)!.time + "T00:00:00Z";
      fetchedAt = rows.at(-1)!.ingested_at.toISOString();
    }
  } else if (!["quote", "derived"].includes(s.kind)) {
    const rows = await query<{
      period_date: string;
      value: string | null;
      ingested_at: Date;
      provider_id: string;
    }>(
      "SELECT period_date::text,value,ingested_at,provider_id FROM metric_observations WHERE series_id=$1 AND revision_id='latest' AND period_date>=$2::date AND period_date<=$3::date ORDER BY period_date LIMIT 10000",
      [id, from, to],
    );
    if (rows.length) {
      provider = rows.at(-1)!.provider_id;
      points = rows
        .filter((r) => r.provider_id === provider)
        .map((r) => ({ time: r.period_date, value: r.value }));
      const latest = points.findLast((p) => p.value !== null);
      asOf = latest ? latest.time + "T00:00:00Z" : null;
      fetchedAt = rows.at(-1)!.ingested_at.toISOString();
    }
  }
  const c = await credential(s.providerId);
  const config = await providerConfig(s.providerId);
  const status = !asOf
    ? providerById(s.providerId).envVar && !c.configured
      ? "not_configured"
      : "unavailable"
    : !config.enabled || Date.now() - Date.parse(asOf) > s.staleSeconds * 1000
      ? "stale"
      : "delayed";
  return {
    series: s,
    points,
    unit: s.unit,
    source: source(s, provider),
    asOf,
    fetchedAt,
    status,
    isDemo: false,
    message: !asOf
      ? "尚无历史数据，请配置并同步。"
      : !config.enabled
        ? "数据源已停用，保留最后数据。"
        : "最近交易日/统计观察日；不代表盘中实时。",
  };
}
export async function persistSample(
  id: string,
  sample: Awaited<ReturnType<typeof fetchSample>>,
) {
  if (demoMode()) throw new AppError("FORBIDDEN", "Demo 不写正式行情表", 409);
  const s = seriesById(id);
  if (
    sample.unit !== s.unit ||
    sample.currency !== s.currency ||
    !Number.isFinite(Date.parse(sample.asOf))
  )
    throw new AppError("INVALID_UNIT", "样本口径不符合指标");
  await database().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    if (s.kind === "quote" && sample.value !== null)
      await tx`INSERT INTO latest_quotes(series_id,value,currency,asof_at,fetched_at,provider_id) VALUES(${id},${sample.value},${sample.currency},${sample.asOf},${sample.fetchedAt},${sample.providerId}) ON CONFLICT(series_id) DO UPDATE SET value=EXCLUDED.value,asof_at=EXCLUDED.asof_at,fetched_at=EXCLUDED.fetched_at,provider_id=EXCLUDED.provider_id WHERE latest_quotes.asof_at<=EXCLUDED.asof_at`;
    for (const p of sample.points)
      await tx`INSERT INTO metric_observations(series_id,period_date,value,ingested_at,provider_id) VALUES(${id},${p.time},${p.value},${sample.fetchedAt},${sample.providerId}) ON CONFLICT(series_id,period_date,revision_id) DO UPDATE SET value=EXCLUDED.value,ingested_at=EXCLUDED.ingested_at,provider_id=EXCLUDED.provider_id WHERE metric_observations.provider_id=EXCLUDED.provider_id`;
  });
}
export async function quote(id: string): Promise<Quote> {
  const s = seriesById(id);
  const base: Quote = {
    seriesId: id,
    asOfKind: s.kind === "quote" ? "timestamp" : "date",
    value: null,
    previousValue: null,
    unit: s.unit,
    currency: s.currency,
    source: source(s),
    asOf: null,
    fetchedAt: null,
    status: demoMode() ? "demo" : "unavailable",
    isDemo: demoMode(),
  };
  if (s.kind === "derived") {
    const [x, fx] = await Promise.all([
      quote("XAUUSD_QUOTE"),
      quote("FX_USDCNY_D1"),
    ]);
    const domestic =
      id === "DERIVED_SGE_PREMIUM" ? await quote("SGE_AU9999_D1") : undefined;
    return {
      ...base,
      ...deriveGoldQuotes(x, fx, domestic),
      source: {
        id: "derived",
        label: domestic
          ? "SGE − (XAU × USD/CNY ÷ 31.1034768)"
          : "XAU × USD/CNY ÷ 31.1034768",
        url: s.sourceUrl,
      },
    };
  }
  if (previewMode()) return previewQuote(id);
  if (demoMode()) {
    const data = await seriesData(id);
    const values = data.points.filter((p) => p.value !== null);
    return {
      ...base,
      value:
        id === "XAUUSD_QUOTE" ? "3100.0000" : (values.at(-1)?.value ?? null),
      previousValue:
        id === "XAUUSD_QUOTE" ? "3090.0000" : (values.at(-2)?.value ?? null),
      asOf: data.asOf ?? fixture.asOf,
      fetchedAt: fixture.asOf,
      message: "DEMO 合成示例，非正式行情",
    };
  }
  let changed = false,
    failure: string | undefined;
  if (id === "XAUUSD_QUOTE") {
    const routes = compatibleRoutes(s, await getRoutes(id));
    const candidates =
      routes[0]?.mode === "fixed" ? routes.slice(0, 1) : routes;
    for (const [i, r] of candidates.entries()) {
      try {
        const sample = await fetchSample(r.providerId, r.providerSymbol);
        await persistSample(id, sample);
        changed = i > 0;
        break;
      } catch (e) {
        failure = e instanceof AppError ? e.message : "数据源不可用";
      }
    }
  }
  if (s.kind === "quote") {
    const [r] = await query<{
      value: string;
      asof_at: Date;
      fetched_at: Date;
      provider_id: string;
      quality_flags: string[];
    }>("SELECT * FROM latest_quotes WHERE series_id=$1", [id]);
    if (r) {
      const enabled = (await providerConfig(r.provider_id)).enabled;
      return {
        ...base,
        value: r.value,
        asOf: r.asof_at.toISOString(),
        fetchedAt: r.fetched_at.toISOString(),
        source: source(s, r.provider_id),
        sourceChanged: changed,
        status:
          failure ||
          !enabled ||
          Date.now() - r.asof_at.getTime() > s.staleSeconds * 1000
            ? "stale"
            : "delayed",
        qualityFlags: r.quality_flags,
        message:
          failure ??
          (!enabled
            ? "数据源已停用；保留最后报价"
            : "参考报价；非交易所可成交价格"),
      };
    }
    return { ...base, message: failure ?? "尚无报价，请运行采集器" };
  }
  const d = await seriesData(id);
  const valid = d.points.filter((p) => p.value !== null);
  return {
    ...base,
    value: valid.at(-1)?.value ?? null,
    previousValue: valid.at(-2)?.value ?? null,
    source: d.source,
    asOf: d.asOf,
    fetchedAt: d.fetchedAt,
    status: d.status,
    message: d.message,
  };
}
export async function compare(
  ids: string[],
  mode: string,
  align: string,
  from?: string,
  to?: string,
) {
  const data = await Promise.all(ids.map((id) => seriesData(id, from, to)));
  if (mode === "raw" && new Set(data.map((d) => d.unit)).size > 1)
    throw new AppError(
      "INVALID_UNIT",
      "不同单位请选择标准化/百分比模式或独立图",
    );
  const aligned = compareSeries(
    data.map((d) => d.points),
    mode,
    align,
  );
  return {
    series: data.map((d, i) => ({
      id: d.series.id,
      nameZh: d.series.nameZh,
      unit: mode === "raw" ? d.unit : mode === "pct" ? "%" : "起点=100",
      points: aligned[i],
      status: d.status,
      isDemo: d.isDemo,
    })),
    alignment: align,
    mode,
  };
}
export async function syncSeries(
  id: string,
  range?: { from: string; to: string },
) {
  if (previewMode()) return refreshPreview(id);
  if (demoMode())
    throw new AppError(
      "FORBIDDEN",
      "Demo 不能采集到正式表；连接测试可验证真实上游",
      409,
    );
  const s = seriesById(id);
  const route = compatibleRoutes(s, await getRoutes(id))[0];
  if (!route)
    throw new AppError("SOURCE_UNAVAILABLE", "没有启用且兼容的数据路由", 409);
  if (!(await providerConfig(route.providerId)).enabled)
    throw new AppError("SOURCE_UNAVAILABLE", "数据源已停用");
  if (["akshare_sge", "cftc"].includes(route.providerId)) {
    const result = await collectorCommand(id, false, range);
    return {
      status: "success",
      message: "采集器已完成，详情见 ingest_runs",
      result,
    };
  }
  const year = new Date();
  year.setUTCFullYear(year.getUTCFullYear() - 3);
  const sample = await fetchSample(
    route.providerId,
    route.providerSymbol,
    s.kind === "quote"
      ? undefined
      : range?.from || year.toISOString().slice(0, 10),
    s.kind === "quote" ? undefined : range?.to,
  );
  await persistSample(id, sample);
  return {
    status: "success",
    count: sample.points.length || 1,
    message: "已验证并保存真实数据",
  };
}
export async function stats(id: string) {
  const s = seriesById(id);
  if (s.frequency !== "1d" || !(s.kind === "ohlc" || id === "FX_USDCNY_D1"))
    throw new AppError(
      "UNSUPPORTED_INTERVAL",
      "历史风险统计目前仅支持日度正价格/汇率，不用于利率或月度指标",
    );
  const d = await seriesData(id);
  return {
    ...riskStats(d.points.flatMap((p) => (p.value ? [p.value] : []))),
    source: d.source,
    asOf: d.asOf,
    fetchedAt: d.fetchedAt,
    status: d.status,
    isDemo: d.isDemo,
    observationBasis:
      "按有效日度观察点计算，年化假设252个交易日，不预测未来风险",
  };
}
export { catalog };

export async function importsForSeries(id: string) {
  const s = seriesById(id);
  if (s.kind !== "imported") return [];
  if (demoMode()) return [];
  return query<{
    id: string;
    fileName: string;
    fileSha256: string;
    statPeriodEnd: string;
    releasedAt: Date | null;
    importedAt: Date;
    sourceUrl: string;
    rowCount: number;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id,file_name AS "fileName",file_sha256 AS "fileSha256",stat_period_end::text AS "statPeriodEnd",released_at AS "releasedAt",imported_at AS "importedAt",source_url AS "sourceUrl",row_count AS "rowCount",metadata FROM data_imports WHERE dataset_type=$1 AND owner_id=$2 ORDER BY imported_at DESC LIMIT 20`,
    [id, "00000000-0000-4000-8000-000000000001"],
  );
}
