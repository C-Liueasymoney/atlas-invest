import { it, expect } from "vitest";
import { dispatch } from "@/lib/api";
it("rejects invalid analysis inputs and keeps demo analyses labelled", async () => {
  process.env.DATA_MODE = "demo";
  process.env.LOCAL_DEV_NO_AUTH = "true";
  const call = (q: string) =>
    dispatch(
      new Request("http://localhost:3000/api/v1/analytics/correlation?" + q),
    );
  expect((await call("assets=FRED_DGS10,FRED_DGS10")).status).toBe(400);
  expect((await call("assets=nope,FRED_DGS10")).status).toBe(404);
  const r = await call(
    "assets=SGE_AU9999_D1,FX_USDCNY_D1&from=2025-01-01&to=2026-10-16",
  );
  expect(r.status).toBe(200);
  const data = await r.json();
  expect(data.isDemo).toBe(true);
  expect(data.matrix).toHaveLength(2);
  expect(data.assets[0].transform).toBe("return");
});
it.runIf(!!process.env.ATLAS_ANALYTICS_REAL_TEST)(
  "computes an actual SGE and FX history pair without synthetic fallback",
  async () => {
    process.env.DATA_MODE = "preview";
    process.env.LOCAL_DEV_NO_AUTH = "true";
    const response = await dispatch(
      new Request(
        "http://localhost:3000/api/v1/analytics/correlation?assets=SGE_AU9999_D1,FX_USDCNY_D1&from=2025-10-16&to=2026-10-16&frequency=daily&currency=CNY",
      ),
    );
    const d = await response.json();
    expect(response.status).toBe(200);
    expect(d.isDemo).toBe(false);
    expect(d.matrix[0][1].n).toBeGreaterThan(100);
    expect(d.matrix[0][1].value).not.toBeNull();
    process.stdout.write(
      JSON.stringify({
        realHistoricalPair: d.matrix[0][1],
        sources: d.assets.map(
          (a: { id: string; asOf: string; count: number }) => ({
            id: a.id,
            asOf: a.asOf,
            count: a.count,
          }),
        ),
      }),
    );
  },
);
