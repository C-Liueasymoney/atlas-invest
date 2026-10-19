import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  stat,
  rmdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(
  await readFile(resolve(root, "config/indicators.json"), "utf8"),
);
const path =
  process.env.ATLAS_MARKET_CACHE_PATH ||
  resolve(root, ".atlas/market-snapshot.json");
const defaults = [
  "SGE_AU9999_D1",
  "XAUUSD_QUOTE",
  "FX_USDCNY_D1",
  "FRED_DFII10",
  "FRED_DGS10",
  "FRED_DTWEXBGS",
  "FRED_NASDAQ100",
  "FRED_SP500",
];
const specified = process.argv.indexOf("--series");
const ids = specified >= 0 ? [process.argv[specified + 1]] : defaults;
if (
  ids.some(
    (id) =>
      !catalog.some(
        (s) =>
          s.id === id &&
          ["akshare_sge", "gold_api", "frankfurter", "fred", "cftc"].includes(
            s.providerId,
          ),
      ),
  )
)
  throw Error("Unsupported canonical series");
const num = (v, positive = false) => {
  const d = new Decimal(String(v));
  if (!d.isFinite() || (positive && d.lte(0)))
    throw Error("Invalid normalized number");
  return d.toString();
};
const date = (v) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw Error("Invalid statistical date");
  return v;
};
async function acquire(lock, waitMs = 10000) {
  await mkdir(dirname(lock), { recursive: true });
  const until = Date.now() + waitMs;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      const info = await stat(lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > 180000) {
        await rmdir(lock).catch(() => {});
        continue;
      }
      if (Date.now() > until) throw Error("Snapshot store busy");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  return () => rmdir(lock).catch(() => {});
}
async function persist(id, entry) {
  const release = await acquire(path + ".lock");
  try {
    let cache = { version: 1, series: {} };
    try {
      const existing = JSON.parse(await readFile(path, "utf8"));
      if (existing.version === 1 && existing.series) cache = existing;
    } catch {}
    const old = cache.series[id];
    cache.series[id] =
      entry.status !== "ok" && (old?.points?.length || old?.value != null)
        ? {
            ...old,
            lastError: entry.lastError,
            status: entry.status,
            lastAttemptAt: entry.lastAttemptAt,
          }
        : entry;
    const tmp = path + "." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(cache), { mode: 0o600 });
    await rename(tmp, path);
  } finally {
    await release();
  }
}
const results = [];
for (const id of ids) {
  const release =
    id === "XAUUSD_QUOTE"
      ? await acquire(path + ".gold-request.lock", 120000)
      : async () => {};
  try {
    const s = catalog.find((s) => s.id === id);
    if (id === "XAUUSD_QUOTE") {
      try {
        const existing = JSON.parse(await readFile(path, "utf8"));
        const cached = existing.version === 1 && existing.series?.[id];
        if (
          cached?.providerId === s.providerId &&
          cached.status === "ok" &&
          cached.value &&
          new Decimal(cached.value).gt(0) &&
          Number.isFinite(Date.parse(cached.asOf)) &&
          Date.parse(cached.asOf) <= Date.now() + 300000 &&
          Date.parse(cached.fetchedAt) <= Date.now() &&
          Date.now() - Date.parse(cached.fetchedAt) <
            Math.max(30, Math.min(86400, Number(cached.cacheSeconds) || 0)) *
              1000
        ) {
          results.push({
            seriesId: id,
            status: "success",
            count: 1,
            asOf: cached.asOf,
            cached: true,
          });
          continue;
        }
      } catch {}
    }
    let entry;
    const at = new Date().toISOString();
    if (s.providerId === "fred" && !process.env.FRED_API_KEY) {
      entry = {
        seriesId: id,
        providerId: s.providerId,
        fetchedAt: at,
        lastAttemptAt: at,
        status: "not_configured",
        points: [],
        asOf: null,
        qualityFlags: [],
        lastError: "FRED_API_KEY 未配置",
      };
    } else
      try {
        const local = resolve(root, "services/collector/.venv/bin/python");
        const python =
          process.env.COLLECTOR_PYTHON ||
          (existsSync(local) ? local : "python3");
        const { stdout } = await promisify(execFile)(
          python,
          ["-m", "atlas_collector", "sync", "--series", id, "--probe"],
          {
            cwd: root,
            env: {
              ...process.env,
              PYTHONPATH: resolve(root, "services/collector/src"),
            },
            timeout: 120000,
            maxBuffer: 8 * 1024 * 1024,
          },
        );
        const probe = JSON.parse(stdout);
        if (
          probe.seriesId !== id ||
          probe.providerId !== s.providerId ||
          !Array.isArray(probe.records) ||
          !probe.records.length
        )
          throw Error("Invalid normalized probe");
        const points =
          s.kind === "ohlc"
            ? probe.records.map((r) => {
                const point = {
                  time: date(r.trading_date),
                  value: num(r.close, true),
                  open: num(r.open, true),
                  high: num(r.high, true),
                  low: num(r.low, true),
                  close: num(r.close, true),
                  volume: r.volume == null ? null : num(r.volume),
                };
                if (
                  new Decimal(point.low).gt(
                    Decimal.min(point.open, point.close),
                  ) ||
                  new Decimal(point.high).lt(
                    Decimal.max(point.open, point.close),
                  )
                )
                  throw Error("OHLC violation");
                return point;
              })
            : s.kind === "quote"
              ? []
              : probe.records.map((r) => ({
                  time: date(r.period_date),
                  value:
                    r.value === null
                      ? null
                      : num(r.value, s.providerId === "frankfurter"),
                }));
        points.sort((a, b) => a.time.localeCompare(b.time));
        if (new Set(points.map((p) => p.time)).size !== points.length)
          throw Error("Duplicate observations");
        const latest = s.kind === "quote" ? probe.records.at(-1) : null;
        const asOf =
          latest?.asof_at ||
          points.findLast((p) => p.value !== null)?.time ||
          null;
        if (
          latest &&
          (!asOf ||
            !Number.isFinite(Date.parse(asOf)) ||
            Date.parse(asOf) > Date.now() + 300000)
        )
          throw Error("Invalid source timestamp");
        entry = {
          seriesId: id,
          providerId: s.providerId,
          fetchedAt: probe.fetchedAt,
          cacheSeconds: Math.max(
            0,
            Math.min(86400, Number(probe.cacheSeconds) || 0),
          ),
          status: "ok",
          points,
          asOf,
          qualityFlags: latest?.quality_flags || [],
          ...(latest ? { value: num(latest.value, true) } : {}),
        };
      } catch {
        entry = {
          seriesId: id,
          providerId: s.providerId,
          fetchedAt: at,
          lastAttemptAt: at,
          status: "unavailable",
          points: [],
          asOf: null,
          qualityFlags: [],
          lastError: "上游或采集环境暂不可用，保留最近实际数据",
        };
      }
    await persist(id, entry);
    results.push({
      seriesId: id,
      status: entry.status === "ok" ? "success" : entry.status,
      count: entry.points.length || (entry.value ? 1 : 0),
      asOf: entry.asOf,
    });
  } finally {
    await release();
  }
}
const count = results.filter((r) => r.status === "success").length;
console.log(
  JSON.stringify({
    status: results.some((r) => r.status === "unavailable")
      ? "partial"
      : "success",
    message: `${count} 项真实数据已更新；${results.filter((r) => r.status === "not_configured").length} 项缺少凭据。`,
    results,
  }),
);
