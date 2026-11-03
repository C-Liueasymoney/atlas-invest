import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import catalog from "../../../config/indicators.json";
import { defaultWorkspace } from "@/lib/db/workspace";
describe("normalized PostgreSQL schema", () => {
  it("accepts an initial migration twice, preserves decimal OHLC and rejects impossible bars", async () => {
    const db = new PGlite();
    const migration = await readFile(
      resolve(process.cwd(), "../../db/migrations/0001_initial.sql"),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(
      "INSERT INTO providers(id,name) VALUES('sge','SGE'); INSERT INTO series(id,provider_id,provider_series_id,name_zh,kind,frequency,unit,timezone,description,source_url,stale_policy,metadata) VALUES('gold','sge','Au99.99','gold','ohlc','1d','CNY/g','Asia/Shanghai','','','{}','{}')",
    );
    await db.exec(
      "INSERT INTO price_bars(series_id,interval,bar_time,trading_date,open,high,low,close,provider_id) VALUES('gold','1d','2026-10-15T00:00:00Z','2026-10-15',800.123456789,801,799,800.9,'sge')",
    );
    const result = await db.query<{ open: string; volume: null }>(
      "SELECT open,volume FROM price_bars",
    );
    expect(result.rows[0].open).toBe("800.1234567890");
    expect(result.rows[0].volume).toBeNull();
    await expect(db.exec("UPDATE price_bars SET high=1")).rejects.toThrow();
    await db.close();
  });
  it("does not identify the broad dollar index as ICE DXY or merge spot and futures", () => {
    expect(catalog.find((s) => s.id === "FRED_DTWEXBGS")?.providerSymbol).toBe(
      "DTWEXBGS",
    );
    expect(catalog.find((s) => s.id === "SGE_AU9999_D1")?.priceDefinition).toBe(
      "spot",
    );
    expect(new Set(catalog.map((s) => s.id)).size).toBe(catalog.length);
  });
  it("registers the actual Nasdaq-100 and S&P 500 daily index series and adds them to a new watchlist", () => {
    expect(catalog.find((s) => s.id === "FRED_NASDAQ100")).toMatchObject({
      providerId: "fred",
      providerSymbol: "NASDAQ100",
      kind: "observation",
      frequency: "1d",
      unit: "index",
      market: "US",
      priceDefinition: "index_close",
    });
    expect(catalog.find((s) => s.id === "FRED_SP500")).toMatchObject({
      providerId: "fred",
      providerSymbol: "SP500",
      kind: "observation",
      frequency: "1d",
      unit: "index",
      market: "US",
      priceDefinition: "index_close",
    });
    const watchlist = defaultWorkspace().watchlists[0].items;
    expect(watchlist).toContain("FRED_NASDAQ100");
    expect(watchlist).toContain("FRED_SP500");
  });
});
