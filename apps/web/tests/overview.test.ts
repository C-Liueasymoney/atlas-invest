import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "@/lib/api";
it("persists per-chart related selections including empty lists without changing favorites", async () => {
  const dir = await mkdtemp(join(tmpdir(), "overview-"));
  process.env.DATA_MODE = "preview";
  process.env.LOCAL_DEV_NO_AUTH = "true";
  process.env.ATLAS_OVERVIEW_PATH = join(dir, "settings.json");
  const call = (id: string, items?: string[]) =>
    dispatch(
      new Request("http://localhost:3000/api/v1/market/related/" + id, {
        method: items ? "PUT" : "GET",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: items ? JSON.stringify({ items }) : undefined,
      }),
    );
  try {
    expect((await (await call("FRED_NASDAQ100")).json()).items).toContain(
      "FRED_SP500",
    );
    expect((await call("FRED_NASDAQ100", ["FRED_CPIAUCSL"])).status).toBe(200);
    expect((await (await call("FRED_NASDAQ100")).json()).items).toEqual([
      "FRED_CPIAUCSL",
    ]);
    await call("FRED_NASDAQ100", []);
    expect((await (await call("FRED_NASDAQ100")).json()).items).toEqual([]);
    expect((await (await call("FRED_SP500")).json()).items).toContain(
      "FRED_NASDAQ100",
    );
    expect((await call("FRED_SP500", ["FRED_SP500"])).status).toBe(400);
    expect((await call("FRED_SP500", ["unknown"])).status).toBe(404);
    expect(
      (await call("FRED_SP500", ["FRED_DGS10", "FRED_DGS10"])).status,
    ).toBe(400);
  } finally {
    delete process.env.ATLAS_OVERVIEW_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});
