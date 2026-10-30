import { expect, it } from "vitest";
import {
  parseSGEDelayed,
  chooseLatestGold,
  latestDomesticGold,
} from "@/lib/latest-gold";
import type { Quote } from "@/lib/types";
const now = new Date("2026-10-31T00:00:00Z");
const html = `<h1>上海黄金交易所2026年10月31日延时行情</h1><table>
<tr><td>iAu99.99</td><td>848.62</td></tr>
<tr><td>Au99.99</td><td>833.00</td><td>855</td></tr></table>`;
const close = {
  seriesId: "SGE_AU9999_D1",
  value: "854.76",
  asOf: "2026-10-30T00:00:00Z",
  fetchedAt: "2026-10-30T08:09:55Z",
  isDemo: false,
  status: "delayed",
  unit: "CNY/g",
  currency: "CNY",
  source: { id: "akshare_sge", label: "SGE", url: "https://www.sge.com.cn" },
} as Quote;
it("reads the exact domestic contract and preserves source date without inventing an intraday timestamp", () => {
  const q = parseSGEDelayed(html, now);
  expect(q.value).toBe("833.00");
  expect(q.asOf).toBe("2026-10-31");
  expect(q.asOfKind).toBe("date");
  expect(q.fetchedAt).toBe(now.toISOString());
});
it("rejects zero, missing contract and future source dates", () => {
  for (const bad of [
    html.replace("833.00", "0"),
    html.replace("<td>Au99.99</td>", "<td>Au(T+D)</td>"),
    html.replace("10月31日", "11月02日"),
  ])
    expect(() => parseSGEDelayed(bad, now)).toThrow();
});
it("uses the newer quote before a daily close, and never replaces newer data with an older snapshot", () => {
  const latest = parseSGEDelayed(html, now);
  expect(chooseLatestGold(close, latest).value).toBe("833.00");
  expect(chooseLatestGold(close, { ...latest, asOf: "2026-10-29" }).value).toBe(
    "854.76",
  );
});
it("keeps the last valid latest quote on request failure with an explicit stale warning", () => {
  const latest = parseSGEDelayed(html, now);
  const result = chooseLatestGold(close, latest, "请求超时");
  expect(result.value).toBe("833.00");
  expect(result.status).toBe("stale");
  expect(result.message).toContain("请求超时");
  expect(chooseLatestGold(close, undefined, "请求超时").value).toBe("854.76");
});
it.runIf(!!process.env.ATLAS_SGE_LIVE_TEST)(
  "reads the live official delayed page without modifying daily price history",
  async () => {
    process.env.DATA_MODE = "preview";
    const result = await latestDomesticGold(true);
    expect(result.qualityFlags).toContain("official_delayed_snapshot");
    expect(Number(result.value)).toBeGreaterThan(0);
    expect(result.asOfKind).toBe("date");
    console.info("Official SGE delayed quote", {
      value: result.value,
      sourceDate: result.asOf,
      fetchedAt: result.fetchedAt,
    });
  },
);
