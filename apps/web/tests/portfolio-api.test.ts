import { it, expect, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { portfolioApi } from "@/lib/analytics/portfolio-api";
let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  delete process.env.ATLAS_PORTFOLIOS_PATH;
});
it("persists isolated private CRUD, rename, copy, scenarios and delete", async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-portfolios-"));
  process.env.ATLAS_PORTFOLIOS_PATH = join(directory, "private.json");
  process.env.DATA_MODE = "demo";
  const call = async (path: string, method = "GET", payload?: unknown) => {
    const url = new URL("http://localhost:3000/api/v1/analytics/" + path);
    return (await portfolioApi(
      new Request(url, {
        method,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      }),
      ["analytics", ...path.split("/")],
      url,
    ))!;
  };
  const p = {
    name: "保存组合",
    baseCurrency: "CNY",
    mode: "percent",
    positions: [{ assetId: "CASH_CNY", value: 100, exposureCurrency: "CNY" }],
    thresholds: [20],
  };
  const created = await call("portfolios", "POST", p);
  expect(created.status).toBe(201);
  const { item } = await created.json();
  expect(item.initialValue).toBe(100000);
  expect((await (await call("portfolios")).json()).items[0].id).toBe(item.id);
  expect(
    (
      await (
        await call("portfolios/" + item.id, "PATCH", { name: "改名" })
      ).json()
    ).item.name,
  ).toBe("改名");
  const copy = await (
    await call("portfolios/" + item.id + "/copy", "POST", {})
  ).json();
  expect(copy.item.id).not.toBe(item.id);
  expect(
    (
      await (
        await call("portfolios/" + item.id + "/scenario", "POST", {
          shocks: {},
          fxShockPct: 0,
        })
      ).json()
    ).returnPct,
  ).toBe(0);
  expect(
    (await (await call("portfolios/" + item.id + "/history-risk")).json())
      .status,
  ).toBe("unavailable");
  expect((await stat(process.env.ATLAS_PORTFOLIOS_PATH!)).mode & 0o777).toBe(
    0o600,
  );
  await call("portfolios/" + item.id, "DELETE");
  expect((await (await call("portfolios")).json()).items).toHaveLength(1);
});
