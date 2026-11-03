import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { previewSeries, previewQuote } from "@/lib/market-preview";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-real-preview-"));
  process.env.ATLAS_MARKET_CACHE_PATH = join(dir, "market.json");
  process.env.DATA_MODE = "preview";
});
afterEach(async () => {
  delete process.env.ATLAS_MARKET_CACHE_PATH;
  await rm(dir, { recursive: true, force: true });
});
it("uses only verified normalized observations in real preview and never falls back to demo", async () => {
  const empty = await previewQuote("SGE_AU9999_D1");
  expect(empty.value).toBeNull();
  expect(empty.isDemo).toBe(false);
  expect(empty.status).toBe("unavailable");
  const fred = await previewQuote("FRED_DFII10");
  expect(fred.value).toBeNull();
  expect(fred.status).toBe("not_configured");
});
it("shows real close and previous valid close with source trading date", async () => {
  await writeFile(
    process.env.ATLAS_MARKET_CACHE_PATH!,
    JSON.stringify({
      version: 1,
      series: {
        SGE_AU9999_D1: {
          seriesId: "SGE_AU9999_D1",
          providerId: "akshare_sge",
          fetchedAt: new Date().toISOString(),
          status: "ok",
          points: [
            {
              time: "2026-10-15",
              value: "892.96",
              open: "900",
              high: "910",
              low: "890",
              close: "892.96",
              volume: null,
            },
            {
              time: "2026-10-16",
              value: "901.57",
              open: "893.99",
              high: "902",
              low: "893",
              close: "901.57",
              volume: null,
            },
          ],
          asOf: "2026-10-16",
          qualityFlags: [],
        },
      },
    }),
  );
  const q = await previewQuote("SGE_AU9999_D1");
  expect(q.value).toBe("901.57");
  expect(q.previousValue).toBe("892.96");
  expect(q.asOf?.slice(0, 10)).toBe("2026-10-16");
  expect(q.isDemo).toBe(false);
  expect(q.asOfKind).toBe("date");
  const series = await previewSeries(
    "SGE_AU9999_D1",
    "2026-10-16",
    "2026-10-16",
  );
  expect(series.points).toHaveLength(1);
  expect(series.points[0].close).toBe("901.57");
  expect(series.unit).toBe("CNY/g");
});
it("rejects a malformed private cache rather than labeling it as real market data", async () => {
  await writeFile(
    process.env.ATLAS_MARKET_CACHE_PATH!,
    JSON.stringify({
      version: 1,
      series: { XAUUSD_QUOTE: { price: 3100, asOf: "2099-01-01" } },
    }),
  );
  const q = await previewQuote("XAUUSD_QUOTE", false);
  expect(q.value).toBeNull();
  expect(q.status).toBe("unavailable");
  expect(q.isDemo).toBe(false);
});
import { dispatch } from "@/lib/api";
it("exposes the preview mode honestly and does not permit a demo refresh to write a market cache", async () => {
  process.env.LOCAL_DEV_NO_AUTH = "true";
  const response = await dispatch(
    new Request("http://localhost:3000/api/v1/session"),
  );
  expect((await response.json()).mode).toBe("preview");
  process.env.DATA_MODE = "demo";
  const refresh = await dispatch(
    new Request("http://localhost:3000/api/v1/market/refresh", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(refresh.status).toBe(409);
});
import { memory, providerConfig } from "@/lib/providers/repository";
it("marks disabled provider cache stale for quotes and history without losing actual values", async () => {
  const id = "FX_USDCNY_D1";
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    process.env.ATLAS_MARKET_CACHE_PATH!,
    JSON.stringify({
      version: 1,
      series: {
        [id]: {
          seriesId: id,
          providerId: "frankfurter",
          fetchedAt: new Date().toISOString(),
          status: "ok",
          points: [{ time: today, value: "6.684" }],
          asOf: today,
          qualityFlags: [],
        },
      },
    }),
  );
  const cfg = await providerConfig("frankfurter");
  memory.configs.set("frankfurter", { ...cfg, enabled: false });
  try {
    const q = await previewQuote(id);
    expect(q.value).toBe("6.684");
    expect(q.status).toBe("stale");
    expect(q.message).toContain("停用");
    expect((await previewSeries(id)).status).toBe("stale");
  } finally {
    memory.configs.delete("frankfurter");
  }
});
import { workspace } from "@/lib/db/workspace";
it("carries layouts but isolates synthetic alert state and events from real preview", async () => {
  process.env.ATLAS_DEMO_STATE_PATH = join(dir, "demo-state.json");
  process.env.ATLAS_PREVIEW_STATE_PATH = join(dir, "preview-state.json");
  try {
    process.env.DATA_MODE = "demo";
    await workspace((s) => {
      s.dashboards[0].name = "My saved research";
      s.alerts.push({
        id: crypto.randomUUID(),
        seriesId: "SGE_AU9999_D1",
        conditionType: "crosses_above",
        params: { threshold: 800 },
        enabled: true,
        cooldownSeconds: 0,
        state: { previousValue: "739", previousAsOf: "2026-10-15" },
      });
    }, true);
    process.env.DATA_MODE = "preview";
    const actual = await workspace((s) => s, true);
    expect(actual.dashboards[0].name).toBe("My saved research");
    expect(actual.alerts).toEqual([]);
    expect(actual.events).toEqual([]);
    process.env.DATA_MODE = "demo";
    expect((await workspace((s) => s.alerts)).length).toBe(1);
  } finally {
    delete process.env.ATLAS_DEMO_STATE_PATH;
    delete process.env.ATLAS_PREVIEW_STATE_PATH;
  }
});
import { refreshPreview } from "@/lib/market-preview";
import { getRoutes } from "@/lib/providers/repository";
it("blocks collection when the canonical route is disabled", async () => {
  const id = "XAUUSD_QUOTE";
  memory.routes.set(
    id,
    (await getRoutes(id)).map((r) => ({ ...r, enabled: false })),
  );
  try {
    const result = await refreshPreview(id);
    expect(result.results).toEqual([{ seriesId: id, status: "disabled" }]);
  } finally {
    memory.routes.delete(id);
  }
});
it("includes both equity indexes in the default preview refresh", async () => {
  const previousKey = process.env.FRED_API_KEY;
  delete process.env.FRED_API_KEY;
  for (const providerId of [
    "akshare_sge",
    "gold_api",
    "frankfurter",
    "eastmoney_macro",
  ])
    memory.configs.set(providerId, {
      ...(await providerConfig(providerId)),
      enabled: false,
    });
  try {
    const result = await refreshPreview();
    expect(result.results).toContainEqual({
      seriesId: "FRED_NASDAQ100",
      status: "not_configured",
    });
    expect(result.results).toContainEqual({
      seriesId: "FRED_SP500",
      status: "not_configured",
    });
  } finally {
    for (const providerId of [
      "akshare_sge",
      "gold_api",
      "frankfurter",
      "eastmoney_macro",
    ])
      memory.configs.delete(providerId);
    if (previousKey) process.env.FRED_API_KEY = previousKey;
  }
});
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
it("reuses a real Gold cache during the upstream max-age instead of calling the probe", async () => {
  const id = "XAUUSD_QUOTE";
  await writeFile(
    process.env.ATLAS_MARKET_CACHE_PATH!,
    JSON.stringify({
      version: 1,
      series: {
        [id]: {
          seriesId: id,
          providerId: "gold_api",
          fetchedAt: new Date(Date.now() - 60000).toISOString(),
          cacheSeconds: 600,
          status: "ok",
          points: [],
          value: "4166.1",
          asOf: new Date().toISOString(),
          qualityFlags: [],
        },
      },
    }),
  );
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      resolve(process.cwd(), "../../scripts/refresh-market.mjs"),
      "--series",
      id,
    ],
    { env: { ...process.env, COLLECTOR_PYTHON: "/unavailable-test-python" } },
  );
  expect(JSON.parse(stdout).results[0]).toMatchObject({
    seriesId: id,
    status: "success",
    cached: true,
  });
});

it("serializes concurrent Gold CLI refreshes and rechecks the shared source TTL", async () => {
  const runner = join(dir, "probe.mjs");
  const calls = join(dir, "calls.txt");
  await writeFile(
    runner,
    `#!${process.execPath}
import {appendFile} from "node:fs/promises";
await appendFile(process.env.PROBE_LOG,"call\\n");
await new Promise(r=>setTimeout(r,250));
console.log(JSON.stringify({seriesId:"XAUUSD_QUOTE",providerId:"gold_api",fetchedAt:new Date().toISOString(),cacheSeconds:300,records:[{value:"4166.1",asof_at:new Date().toISOString(),quality_flags:[]}]}));
`,
    { mode: 0o700 },
  );
  const refresh = () =>
    promisify(execFile)(
      process.execPath,
      [
        resolve(process.cwd(), "../../scripts/refresh-market.mjs"),
        "--series",
        "XAUUSD_QUOTE",
      ],
      { env: { ...process.env, COLLECTOR_PYTHON: runner, PROBE_LOG: calls } },
    );
  const results = await Promise.all([refresh(), refresh()]);
  expect(results.map((r) => JSON.parse(r.stdout).results[0].status)).toEqual([
    "success",
    "success",
  ]);
  expect((await readFile(calls, "utf8")).trim().split("\n")).toHaveLength(1);
});
