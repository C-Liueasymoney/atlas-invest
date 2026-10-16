import { it, expect } from "vitest";
import { parseFred, parseGold } from "@/lib/providers/upstream";
import { validateRoutes } from "@/lib/api-providers";
import { defaultRoute } from "@/lib/providers/routing";
import { seriesById } from "@/lib/catalog";
it("rejects empty and malformed FRED values instead of manufacturing zero", () => {
  for (const value of ["", " ", "bad", "Infinity"])
    expect(() =>
      parseFred({ observations: [{ date: "2026-10-16", value }] }, "DFII10"),
    ).toThrow();
  expect(
    parseFred(
      {
        observations: [
          { date: "2026-10-15", value: "." },
          { date: "2026-10-16", value: "2.10" },
        ],
      },
      "DFII10",
    ).points[0].value,
  ).toBeNull();
});
it("rejects future quote clocks and type changed prices", () => {
  expect(() =>
    parseGold({
      symbol: "XAU",
      currency: "USD",
      price: 1,
      updatedAt: "2099-01-01T00:00:00Z",
    }),
  ).toThrow();
  expect(() =>
    parseGold({
      symbol: "XAU",
      currency: "USD",
      price: true,
      updatedAt: "2026-01-01T00:00:00Z",
    }),
  ).toThrow();
});
it("rejects same-unit but semantically different FRED metrics", () => {
  const route = defaultRoute(seriesById("FRED_DFII10"));
  route.providerSymbol = "DGS10";
  expect(() => validateRoutes("FRED_DFII10", [route])).toThrow();
});
import { compareSeries, deriveGoldQuotes } from "@/lib/calculations";
import type { Quote } from "@/lib/types";
const input = (
  value: string,
  date: string,
  status: Quote["status"] = "delayed",
): Quote => ({
  seriesId: "test",
  value,
  previousValue: null,
  unit: "",
  currency: "",
  source: { id: "test", label: "test", url: "" },
  asOf: date + "T00:00:00Z",
  fetchedAt: date + "T01:00:00Z",
  status,
  isDemo: false,
});
it("normalizes only after intersection alignment so every first visible value is100", () => {
  const r = compareSeries(
    [
      [
        { time: "2026-01-01", value: "100" },
        { time: "2026-01-02", value: "200" },
      ],
      [{ time: "2026-01-02", value: "50" }],
    ],
    "index100",
    "intersection",
  );
  expect(r[0][0].value).toBe(100);
  expect(r[1][0].value).toBe(100);
});
it("propagates the oldest domestic close into premium staleness and asOf", () => {
  const r = deriveGoldQuotes(
    input("3100", "2026-10-16"),
    input("7.1", "2026-10-16"),
    input("900", "2026-09-01", "stale"),
  );
  expect(r.status).toBe("stale");
  expect(Date.parse(r.asOf!)).toBe(Date.UTC(2026, 8, 1));
  expect(r.qualityFlags).toContain("observation_time_mismatch");
});
import { vi, afterEach } from "vitest";
import { upstreamJson } from "@/lib/providers/upstream";
afterEach(() => vi.unstubAllGlobals());
it("classifies invalid-key JSON as authentication failure even with HTTP400", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json(
      {
        error_code: 400,
        error_message: "The value for variable api_key is not registered",
      },
      { status: 400 },
    ),
  );
  await expect(
    upstreamJson(new URL("https://api.example.test/observations")),
  ).rejects.toMatchObject({ code: "SOURCE_UNAUTHORIZED" });
});
it("classifies an invalid Alpha Vantage key separately from quota exhaustion", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ Information: "Invalid API key" }),
  );
  await expect(
    upstreamJson(new URL("https://api.example.test/query")),
  ).rejects.toMatchObject({ code: "SOURCE_UNAUTHORIZED" });
});
