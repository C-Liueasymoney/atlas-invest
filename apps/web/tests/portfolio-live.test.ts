import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { portfolioApi } from "@/lib/analytics/portfolio-api";

it("applies the portfolio migration twice without destructive changes", async () => {
  const db = new PGlite();
  try {
    const migration = await readFile(
      "../../db/migrations/0004_analytics_portfolios.sql",
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    const tables = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name='analytics_portfolios'",
    );
    expect(tables.rows).toHaveLength(1);
  } finally {
    await db.close();
  }
});
it.runIf(!!process.env.TEST_DATABASE_URL)(
  "round trips object configs in owner-scoped PostgreSQL without cross-owner access",
  async () => {
    const admin = postgres(process.env.TEST_DATABASE_URL!, {
      max: 1,
      onnotice: () => {},
    });
    const schema = "atlas_portfolio_" + randomUUID().replaceAll("-", "");
    await admin.unsafe("CREATE SCHEMA " + schema);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", "-csearch_path=" + schema);
    process.env.DATABASE_URL = url.toString();
    process.env.DATA_MODE = "live";
    const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
    const call = (path: string, method = "GET", payload?: unknown) => {
      const url = new URL("http://localhost:3000/api/v1/analytics/" + path);
      return portfolioApi(
        new Request(url, {
          method,
          body: payload ? JSON.stringify(payload) : undefined,
        }),
        ["analytics", ...path.split("/")],
        url,
      );
    };
    try {
      await db.unsafe(
        await readFile(
          "../../db/migrations/0004_analytics_portfolios.sql",
          "utf8",
        ),
      );
      const other = randomUUID();
      await db`INSERT INTO analytics_portfolios(id,owner_id,name,config) VALUES(${other},${randomUUID()},'other owner',${db.json({ positions: [] })})`;
      expect((await (await call("portfolios"))!.json()).items).toEqual([]);
      await expect(call("portfolios/" + other)).rejects.toMatchObject({
        status: 404,
      });
      await expect(call("portfolios/" + other, "DELETE")).rejects.toMatchObject(
        { status: 404 },
      );
      const p = {
        name: "owner saved",
        baseCurrency: "CNY",
        mode: "percent",
        positions: [
          { assetId: "CASH_CNY", value: 100, exposureCurrency: "CNY" },
        ],
        thresholds: [20],
      };
      const created = await (await call("portfolios", "POST", p))!.json();
      for (let i = 0; i < 3; i++) {
        const response = await (await call(
          "portfolios/" + created.item.id,
          "PUT",
          p,
        ))!.json();
        expect(response.item.positions[0].value).toBe(100);
        const rows =
          await db`SELECT jsonb_typeof(config) AS type,pg_column_size(config) AS size FROM analytics_portfolios WHERE id=${created.item.id}`;
        expect(rows[0].type).toBe("object");
        expect(rows[0].size).toBeLessThan(2000);
      }
      const copy = await (await call(
        "portfolios/" + created.item.id + "/copy",
        "POST",
        {},
      ))!.json();
      expect(copy.item.id).not.toBe(created.item.id);
      await call("portfolios/" + created.item.id, "DELETE");
      expect((await (await call("portfolios"))!.json()).items).toHaveLength(1);
      expect(
        await db`SELECT id FROM analytics_portfolios WHERE id=${other}`,
      ).toHaveLength(1);
    } finally {
      await db.end();
      await admin.unsafe("DROP SCHEMA " + schema + " CASCADE");
      await admin.end();
    }
  },
);
