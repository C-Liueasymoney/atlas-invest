import { quote } from "./data";
import { database, query } from "./db/client";
import { controlled } from "./providers/controller";
import { getRoutes, providerConfig } from "./providers/repository";
import { compatibleRoutes } from "./providers/routing";
import { seriesById } from "./catalog";
import { AppError } from "./errors";
import type { Quote } from "./types";

const url = "https://www.sge.com.cn/sjzx/yshqbg";
const flag = "official_delayed_snapshot";
const snapshotKey = "akshare_sge:latest-domestic-snapshot";
let previewSnapshot: Quote | undefined;
export function parseSGEDelayed(html: string, now = new Date()): Quote {
  const heading = html.match(
    /上海黄金交易所(\d{4})年(\d{1,2})月(\d{1,2})日延时行情/,
  );
  if (!heading)
    throw new AppError("SOURCE_UNAVAILABLE", "官方页面缺少行情日期");
  const day = `${heading[1]}-${heading[2].padStart(2, "0")}-${heading[3].padStart(2, "0")}`;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  if (
    isNaN(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day ||
    day > today
  )
    throw new AppError("SOURCE_UNAVAILABLE", "官方行情日期无效或在未来");
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const cells = rows.map((r) =>
    [...r[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      c[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim(),
    ),
  );
  const matches = cells.filter((row) => row[0] === "Au99.99");
  const value = matches[0]?.[1];
  if (
    matches.length !== 1 ||
    !value ||
    !/^\d+(?:\.\d+)?$/.test(value) ||
    !Number.isFinite(Number(value)) ||
    Number(value) <= 0
  )
    throw new AppError(
      "SOURCE_UNAVAILABLE",
      "官方页面未提供有效 Au99.99 最新价",
    );
  return {
    seriesId: "SGE_AU9999_D1",
    value,
    previousValue: null,
    unit: "CNY/g",
    currency: "CNY",
    source: { id: "akshare_sge", label: "上海黄金交易所 · 延时行情", url },
    asOf: day,
    asOfKind: "date",
    fetchedAt: now.toISOString(),
    isDemo: false,
    status: "delayed",
    qualityFlags: [flag, "source_event_time_unknown"],
    message:
      "官方最新延时行情；页面仅提供行情日期，精确成交时间及延迟分钟数未知。",
  };
}
export function chooseLatestGold(
  close: Quote,
  latest?: Quote,
  failure?: string,
): Quote {
  const useLatest =
    latest?.value != null &&
    latest.asOf &&
    (!close.asOf || latest.asOf.slice(0, 10) >= close.asOf.slice(0, 10));
  const chosen = useLatest ? { ...latest, previousValue: close.value } : close;
  return {
    ...chosen,
    status: failure ? "stale" : chosen.status,
    message: failure
      ? `最新报价获取失败：${failure}；${useLatest ? "保留最近一次有效报价" : "回退最近有效日收盘价"}。`
      : useLatest
        ? latest.message
        : "未取得更新报价，显示最近有效日收盘价。",
  };
}
async function savedSnapshot() {
  if (process.env.DATA_MODE !== "live") return previewSnapshot;
  const [row] = await query<{ payload: Quote }>(
    "SELECT payload FROM provider_cache WHERE cache_key=$1",
    [snapshotKey],
  );
  const value = row?.payload;
  return value?.qualityFlags?.includes(flag) &&
    value.seriesId === "SGE_AU9999_D1"
    ? value
    : undefined;
}
async function saveSnapshot(latest: Quote) {
  if (process.env.DATA_MODE === "live") {
    const sql = database();
    await sql`INSERT INTO provider_cache(cache_key,provider_id,payload,expires_at) VALUES(${snapshotKey},'akshare_sge',${sql.json(latest as unknown as Parameters<typeof sql.json>[0])},now()+interval '7 days') ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at WHERE (provider_cache.payload->>'asOf') < (EXCLUDED.payload->>'asOf') OR ((provider_cache.payload->>'asOf') = (EXCLUDED.payload->>'asOf') AND (provider_cache.payload->>'fetchedAt') <= (EXCLUDED.payload->>'fetchedAt'))`;
  } else if (
    !previewSnapshot?.asOf ||
    latest.asOf! > previewSnapshot.asOf ||
    (latest.asOf === previewSnapshot.asOf &&
      latest.fetchedAt! >= previewSnapshot.fetchedAt!)
  )
    previewSnapshot = latest;
}
export async function latestDomesticGold(force = false): Promise<Quote> {
  const close = await quote("SGE_AU9999_D1");
  if (process.env.DATA_MODE === "demo") return close;
  let previous = await savedSnapshot();
  try {
    const series = seriesById("SGE_AU9999_D1");
    const route = compatibleRoutes(series, await getRoutes(series.id))[0];
    if (
      !series.enabled ||
      !(await providerConfig("akshare_sge")).enabled ||
      !route ||
      route.providerId !== series.providerId ||
      route.providerSymbol !== series.providerSymbol
    )
      throw new AppError("SOURCE_UNAVAILABLE", "数据源或对应路由已停用");
    const latest = await controlled(
      "akshare_sge",
      "latest-domestic-request",
      async () => {
        const r = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "AtlasInvest/0.1 personal research" },
        });
        if (!r.ok)
          throw new AppError("SOURCE_UNAVAILABLE", "官方延时页面请求失败");
        const html = await r.text();
        if (html.length > 2_000_000)
          throw new AppError("SOURCE_UNAVAILABLE", "官方页面过大");
        return { value: parseSGEDelayed(html) };
      },
      force,
    );
    // Persist only after the controller releases its transaction connection.
    previous = await savedSnapshot();
    if (force || !previous?.fetchedAt || latest.fetchedAt! > previous.fetchedAt)
      await saveSnapshot(latest);
    previous = await savedSnapshot();
    const result = chooseLatestGold(close, previous);
    if (
      result.fetchedAt &&
      Date.now() - Date.parse(result.fetchedAt) > 10 * 60 * 1000
    )
      return {
        ...result,
        status: "stale",
        message: `${result.message} 最近核对已超过10分钟。`,
      };
    return result;
  } catch (e) {
    previous = await savedSnapshot();
    const fallback = chooseLatestGold(
      close,
      previous,
      e instanceof AppError ? e.message : "来源暂不可用",
    );
    if (previous)
      await saveSnapshot({
        ...previous,
        status: "stale",
        message: fallback.message,
      });
    return fallback;
  }
}
