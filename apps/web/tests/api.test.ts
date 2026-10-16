import { it, expect, beforeAll, afterAll } from "vitest";
import { dispatch } from "@/lib/api";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "atlas-api-"));
  process.env.DATA_MODE = "demo";
  process.env.LOCAL_DEV_NO_AUTH = "true";
  process.env.ATLAS_DEMO_STATE_PATH = join(dir, "state.json");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.ATLAS_DEMO_STATE_PATH;
});
const req = (path: string, method = "GET", body?: unknown) =>
  dispatch(
    new Request("http://localhost:3000/api/" + path, {
      method,
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    path.split("/"),
  );
it("reuses one provider configuration across indicators and never exports credentials", async () => {
  process.env.ALPHA_VANTAGE_API_KEY = "test-only-secret-credential";
  const r = await req("providers/configured");
  const json = await r.json();
  expect(JSON.stringify(json)).not.toContain("test-only-secret-credential");
  expect(
    json.items.find((p: { id: string }) => p.id === "alpha_vantage").credential
      .last4,
  ).toBe("tial");
  const exported = await (await req("providers/export")).text();
  expect(exported).not.toContain("tial");
  expect(exported).not.toContain("test-only-secret");
  delete process.env.ALPHA_VANTAGE_API_KEY;
});
it("returns not_configured for a missing FRED key rather than a zero quote", async () => {
  delete process.env.FRED_API_KEY;
  const h = await (
    await req("providers/fred/test-connection", "POST", {})
  ).json();
  expect(h.status).toBe("not_configured");
});
it("rejects route definitions that try replacing SGE spot with futures", async () => {
  const routes = await (await req("series/SGE_AU9999_D1/routes")).json();
  routes.items[0].constraints.priceDefinition = "future";
  expect(
    (await req("series/SGE_AU9999_D1/routes", "PUT", { routes: routes.items }))
      .status,
  ).toBe(400);
});
it("saves dashboard layouts across requests and keeps demo prices explicit", async () => {
  const d = (await (await req("v1/dashboards")).json()).items[0];
  d.widgets[0].layout.w = 7;
  expect(
    (await req(`v1/dashboards/${d.id}/widgets`, "PUT", { widgets: d.widgets }))
      .status,
  ).toBe(200);
  expect(
    (await (await req("v1/dashboards")).json()).items[0].widgets[0].layout.w,
  ).toBe(7);
  const quotes = await (await req("v1/quotes?seriesIds=SGE_AU9999_D1")).json();
  expect(quotes.items[0].isDemo).toBe(true);
  expect(quotes.items[0].status).toBe("demo");
});
it("rejects requests that mutate another owners resource and untrusted widget types", async () => {
  expect(
    (
      await req(
        "v1/dashboards/30000000-0000-4000-8000-000000000001/widgets",
        "PUT",
        { widgets: [] },
      )
    ).status,
  ).toBe(404);
  const d = (await (await req("v1/dashboards")).json()).items[0];
  d.widgets[0].type = "arbitrary-executable";
  expect(
    (await req(`v1/dashboards/${d.id}/widgets`, "PUT", { widgets: d.widgets }))
      .status,
  ).toBe(400);
});
