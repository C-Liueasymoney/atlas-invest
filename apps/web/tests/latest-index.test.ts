import { expect, it } from "vitest";
import {
  parseIndexChart,
  parseTencentIndex,
  latestIndex,
} from "@/lib/latest-index";
const now = new Date("2026-10-31T02:00:00Z");
it("validates Tencent's actual index contract and parses Eastern timestamps through DST", () => {
  const fields = Array(36).fill("0");
  Object.assign(fields, {
    1: "纳斯达克100",
    2: ".NDX",
    3: "28384.85",
    4: "29402.51",
    30: "2026-10-30 17:15:59",
    35: "USD",
  });
  const text = `v_us.NDX="${fields.join("~")}";`;
  expect(parseTencentIndex(text, "FRED_NASDAQ100", now).asOf).toBe(
    "2026-10-30T21:15:59.000Z",
  );
  expect(() =>
    parseTencentIndex(
      text.replace("纳斯达克100", "纳斯达克综合"),
      "FRED_NASDAQ100",
      now,
    ),
  ).toThrow();
  expect(() =>
    parseTencentIndex(text.replace("USD", "CNY"), "FRED_NASDAQ100", now),
  ).toThrow();
  expect(() =>
    parseTencentIndex(
      text.replace("2026-10-30", "2026-11-02"),
      "FRED_NASDAQ100",
      now,
    ),
  ).toThrow();
});
it.runIf(!!process.env.ATLAS_INDEX_LIVE_TEST)(
  "reads both actual index quotes and history from the live public source",
  async () => {
    process.env.DATA_MODE = "preview";
    for (const id of ["FRED_NASDAQ100", "FRED_SP500"]) {
      const r = await latestIndex(id, true);
      expect(r.items[0].qualityFlags).toContain("index_quote_snapshot");
      expect(r.history.points.length).toBeGreaterThan(100);
      console.info(id, r.items[0].value, r.items[0].asOf);
    }
  },
);
const payload = {
  chart: {
    result: [
      {
        meta: {
          symbol: "^NDX",
          instrumentType: "INDEX",
          currency: "USD",
          exchangeTimezoneName: "America/New_York",
          regularMarketTime: 1793390400,
          regularMarketPrice: 28384.846,
        },
        timestamp: [1793295000, 1793381400],
        indicators: { quote: [{ close: [29000, 28384.846] }] },
      },
    ],
    error: null,
  },
};
it("reads the actual latest index, source timestamp and same-source daily history", () => {
  const r = parseIndexChart(payload, "FRED_NASDAQ100", now);
  expect(r.items[0].value).toBe("28384.846");
  expect(r.items[0].asOfKind).toBe("timestamp");
  expect(r.history.source.id).toBe("yahoo");
  expect(r.history.points).toHaveLength(2);
});
it("rejects ETFs, wrong symbols, currencies and future ticks", () => {
  for (const change of [
    { symbol: "QQQ" },
    { instrumentType: "ETF" },
    { currency: "CNY" },
    { regularMarketTime: 1893390400 },
  ]) {
    const p = structuredClone(payload);
    Object.assign(p.chart.result[0].meta, change);
    expect(() => parseIndexChart(p, "FRED_NASDAQ100", now)).toThrow();
  }
});
