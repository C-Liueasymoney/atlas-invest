import { it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { dispatch } from "@/lib/api";
import { signSession } from "@/lib/auth/session";
it.runIf(!!process.env.TEST_DATABASE_URL)(
  "live API preserves owner boundaries, encrypts reusable provider secrets and reports all-null windows honestly",
  async () => {
    const admin = postgres(process.env.TEST_DATABASE_URL!, {
      onnotice: () => {},
      max: 1,
    });
    const schema = "atlas_api_" + randomUUID().replaceAll("-", "");
    await admin.unsafe("CREATE SCHEMA " + schema);
    const dbUrl = new URL(process.env.TEST_DATABASE_URL!);
    dbUrl.searchParams.set("options", "-csearch_path=" + schema);
    process.env.DATABASE_URL = dbUrl.toString();
    process.env.DATA_MODE = "live";
    process.env.LOCAL_DEV_NO_AUTH = "false";
    process.env.OWNER_PASSWORD = "integration-test-password";
    process.env.SESSION_SECRET = "a".repeat(40);
    process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.ALPHA_VANTAGE_API_KEY;
    const db = postgres(dbUrl.toString(), { onnotice: () => {}, max: 1 });
    const call = (
      path: string,
      method = "GET",
      body?: unknown,
      authenticated = true,
    ) =>
      dispatch(
        new Request("http://localhost:3000/api/" + path, {
          method,
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
            ...(authenticated
              ? {
                  cookie:
                    "atlas_session=" + signSession(process.env.SESSION_SECRET!),
                }
              : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    try {
      await db.unsafe(
        await readFile("../../db/migrations/0001_initial.sql", "utf8"),
      );
      await db`INSERT INTO providers(id,name) VALUES('fred','FRED'),('alpha_vantage','Alpha Vantage'),('akshare_sge','SGE'),('gold_api','Gold'),('frankfurter','FX'),('derived','Derived'),('fmp','FMP'),('yahoo','Yahoo'),('wgc_import','WGC'),('cftc','CFTC')`;
      await db`INSERT INTO series(id,provider_id,provider_series_id,name_zh,kind,frequency,unit,timezone,description,source_url,stale_policy,metadata) VALUES('FRED_DFII10','fred','DFII10','test fixture','observation','1d','percent','UTC','','','{}','{}')`;
      await db`INSERT INTO metric_observations(series_id,period_date,value,provider_id) VALUES('FRED_DFII10','2026-01-01',NULL,'fred')`;
      expect(
        (await call("v1/dashboards", "GET", undefined, false)).status,
      ).toBe(401);
      const other = randomUUID(),
        dashboardId = randomUUID();
      await db`INSERT INTO dashboards(id,owner_id,name) VALUES(${dashboardId},${other},'private other owner')`;
      const patch = await call("v1/dashboards/" + dashboardId, "PATCH", {
        name: "stolen",
      });
      expect(patch.status).toBe(404);
      const ownDashboard = randomUUID();
      await db`INSERT INTO dashboards(id,owner_id,name) VALUES(${ownDashboard},'00000000-0000-4000-8000-000000000001','round-trip regression')`;
      await db`INSERT INTO dashboard_widgets(id,dashboard_id,type,config,layout_desktop) VALUES(${randomUUID()},${ownDashboard},'price-chart',${db.json({ seriesId: "FRED_DFII10", chartType: "line", range: "1Y" })},${db.json({ x: 0, y: 0, w: 8, h: 5 })})`;
      for (let round = 0; round < 3; round++) {
        const response = await call("v1/dashboards");
        expect(response.status).toBe(200);
        const dashboard = (await response.json()).items[0];
        expect(typeof dashboard.widgets[0].config).toBe("object");
        expect(typeof dashboard.widgets[0].layout).toBe("object");
        expect((await call("v1/quotes?seriesIds=FRED_DFII10")).status).toBe(
          200,
        );
      }
      const [jsonTypes] =
        await db`SELECT bool_and(jsonb_typeof(config)='object' AND jsonb_typeof(layout_desktop)='object') AS valid FROM dashboard_widgets`;
      expect(jsonTypes.valid).toBe(true);
      const nullData = await (
        await call(
          "v1/series/FRED_DFII10/observations?from=2026-01-01&to=2026-01-02",
        )
      ).json();
      expect(nullData.asOf).toBeNull();
      expect(nullData.status).not.toBe("delayed");
      expect(nullData.isDemo).toBe(false);
      const key = "test-secret-" + randomUUID();
      expect(
        (
          await call("providers/alpha_vantage/credentials", "POST", {
            apiKey: key,
            confirm: true,
          })
        ).status,
      ).toBe(200);
      const [vault] =
        await db`SELECT secret_ciphertext FROM provider_credentials`;
      expect(vault.secret_ciphertext).not.toContain(key);
      const publicData = await (await call("providers/configured")).text();
      expect(publicData).not.toContain(key);
      const exported = await (await call("providers/export")).text();
      expect(exported).not.toContain(key);
      expect(exported).not.toContain(vault.secret_ciphertext);
      expect(await db`SELECT * FROM provider_credentials`).toHaveLength(1);
      const route = await (await call("series/FRED_DFII10/routes")).json();
      route.items[0].enabled = false;
      expect(
        (
          await call("series/FRED_DFII10/routes", "PUT", {
            routes: route.items,
          })
        ).status,
      ).toBe(200);
      const sync = await call("providers/fred/sync", "POST", {
        seriesId: "FRED_DFII10",
      });
      expect(sync.status).toBe(409);
      expect((await sync.json()).error.message).toContain("路由");
    } finally {
      await db.end();
      await admin.unsafe("DROP SCHEMA " + schema + " CASCADE");
      await admin.end();
      process.env.DATA_MODE = "demo";
    }
  },
);
