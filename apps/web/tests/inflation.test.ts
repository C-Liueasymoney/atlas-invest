import { expect, it } from "vitest";
import { parseChinaCpi } from "@/lib/inflation";
import { rangeFrom } from "@/lib/chart-range";
import { parseFred } from "@/lib/providers/upstream";
import { compareSeries } from "@/lib/calculations";
const payload = (data: unknown[]) => ({
  success: true,
  result: { pages: 1, data },
});
it("preserves nationwide CPI zero, deflation and missing observations, aligning observation months", () => {
  const points = parseChinaCpi(
    payload([
      { REPORT_DATE: "2024-03-01 00:00:00", NATIONAL_SAME: null },
      { REPORT_DATE: "2024-02-01 00:00:00", NATIONAL_SAME: 0 },
      {
        REPORT_DATE: "2024-01-01 00:00:00",
        NATIONAL_SAME: -0.8,
        NATIONAL_BASE: 99.2,
      },
    ]),
  );
  expect(points.map((p) => p.value)).toEqual(["-0.8", "0", null]);
  expect(
    compareSeries([points, points], "raw", "intersection")[0].map(
      (p) => p.value,
    ),
  ).toEqual([-0.8, 0]);
});
it("rejects malformed, conflicting, future and incomplete CPI payloads", () => {
  for (const row of [
    { REPORT_DATE: "2024-13-01", NATIONAL_SAME: 1 },
    { REPORT_DATE: "2099-01-01", NATIONAL_SAME: 1 },
    { REPORT_DATE: "2024-01-01", NATIONAL_SAME: "" },
  ])
    expect(() => parseChinaCpi(payload([row]))).toThrow();
  expect(() =>
    parseChinaCpi(
      payload([
        { REPORT_DATE: "2024-01-01", NATIONAL_SAME: 0 },
        { REPORT_DATE: "2024-01-01", NATIONAL_SAME: 1 },
      ]),
    ),
  ).toThrow();
  expect(() =>
    parseChinaCpi({ success: true, result: { pages: 2, data: [] } }),
  ).toThrow();
});
it("keeps FRED yearly percentage units separate from the raw CPI index", () => {
  const response = { observations: [{ date: "2024-01-01", value: "3.1" }] };
  expect(parseFred(response, "CPIAUCNS:pc1").unit).toBe("percent");
  expect(parseFred(response, "CPIAUCSL").unit).toBe("index");
});
it("supports arbitrary years and clamps leap days and month ends", () => {
  expect(rangeFrom("7Y", new Date("2024-02-29"))).toBe("2017-02-28");
  expect(rangeFrom("1M", new Date("2024-03-31"))).toBe("2024-02-29");
  expect(rangeFrom("10Y", new Date("2026-11-03"))).toBe("2016-11-03");
  for (const range of ["0Y", "101Y", "-1Y", "1.5Y", "bad"])
    expect(() => rangeFrom(range)).toThrow();
});
