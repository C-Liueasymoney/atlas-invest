import { expect, it, vi } from "vitest";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { latestDomesticGold } from "@/lib/latest-gold";

it.runIf(!!process.env.TEST_DATABASE_URL)(
  "concurrent live refreshes finish within the five-connection pool and do not regress the source day",
  async () => {
    const admin = postgres(process.env.TEST_DATABASE_URL!, {
      max: 1,
      onnotice: () => {},
    });
    const schema = "latest_gold_" + randomUUID().replaceAll("-", "");
    await admin.unsafe("CREATE SCHEMA " + schema);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", "-csearch_path=" + schema);
    process.env.DATABASE_URL = url.toString();
    process.env.DATA_MODE = "live";
    const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      const day = calls === 6 ? "30" : "31";
      return new Response(
        `<h1>上海黄金交易所2026年10月${day}日延时行情</h1><table><tr><td>Au99.99</td><td>${calls === 6 ? "854.76" : "833.00"}</td></tr></table>`,
      );
    });
    try {
      await db.unsafe(
        await readFile("../../db/migrations/0001_initial.sql", "utf8"),
      );
      await db`INSERT INTO providers(id,name,config) VALUES('akshare_sge','SGE',${db.json({ perMinute: 100, perHour: 100, perDay: 100 })})`;
      const results = await Promise.all(
        Array.from({ length: 6 }, () => latestDomesticGold(true)),
      );
      expect(results).toHaveLength(6);
      const [row] =
        await db`SELECT payload FROM provider_cache WHERE cache_key='akshare_sge:latest-domestic-snapshot'`;
      expect(row.payload.asOf).toBe("2026-10-31");
      expect(row.payload.value).toBe("833.00");
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
      await db.end();
      await admin.unsafe("DROP SCHEMA " + schema + " CASCADE");
      await admin.end();
    }
  },
  15000,
);
