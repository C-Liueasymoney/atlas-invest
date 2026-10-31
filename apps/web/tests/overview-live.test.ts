import { it, expect } from "vitest";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relatedApi } from "@/lib/api-related";
it.runIf(!!process.env.TEST_DATABASE_URL)(
  "stores object-shaped per-chart settings in PostgreSQL",
  async () => {
    const admin = postgres(process.env.TEST_DATABASE_URL!, {
        max: 1,
        onnotice: () => {},
      }),
      schema = "overview_" + randomUUID().replaceAll("-", "");
    await admin.unsafe("CREATE SCHEMA " + schema);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", "-csearch_path=" + schema);
    process.env.DATABASE_URL = url.toString();
    process.env.DATA_MODE = "live";
    const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
      await db.unsafe(
        "CREATE TABLE series(id text PRIMARY KEY); INSERT INTO series VALUES('FRED_SP500'),('FRED_NASDAQ100')",
      );
      await db.unsafe(
        await readFile("../../db/migrations/0003_market_related.sql", "utf8"),
      );
      const call = (items?: string[]) =>
        relatedApi(
          new Request(
            "http://localhost:3000/api/v1/market/related/FRED_SP500",
            {
              method: items ? "PUT" : "GET",
              headers: { "content-type": "application/json" },
              body: items ? JSON.stringify({ items }) : undefined,
            },
          ),
          ["market", "related", "FRED_SP500"],
        );
      await call(["FRED_NASDAQ100"]);
      expect((await (await call())!.json()).items).toEqual(["FRED_NASDAQ100"]);
      expect(
        (
          await db`select jsonb_typeof(related_ids) as kind from market_related_preferences`
        )[0].kind,
      ).toBe("array");
      await call([]);
      expect((await (await call())!.json()).items).toEqual([]);
    } finally {
      await db.end();
      await admin.unsafe("DROP SCHEMA " + schema + " CASCADE");
      await admin.end();
    }
  },
);
