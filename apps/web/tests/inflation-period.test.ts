import { expect, it } from "vitest";
import { inflationPeriod } from "@/lib/inflation-period";
import { parseChinaCpi } from "@/lib/inflation";
const p = (time: string, value: string | null) => ({ time, value });
it("uses CPI level ratios, inverse purchasing power and compound annual growth", () => {
  const result = inflationPeriod(
    [p("2020-01-01", "100"), p("2025-01-01", "120")],
    "index",
    "2020-01-15",
    "2025-01-31",
  );
  expect(result.status).toBe("available");
  expect(result.cumulativePct).toBe("20.000000");
  expect(result.equivalentAmount).toBe("12000.00");
  expect(result.realValue).toBe("8333.33");
  expect(Number(result.annualizedPct)).toBeCloseTo(3.713729, 5);
  expect(Number(result.purchasingPowerPct)).toBeCloseTo(-16.666667, 5);
  expect(result.months).toBe(60);
});
it("compounds monthly rates after the anchor month, preserving deflation and zero", () => {
  const result = inflationPeriod(
    [
      p("2024-01-01", "99"),
      p("2024-02-01", "2"),
      p("2024-03-01", "-1"),
      p("2024-04-01", "0"),
    ],
    "monthly",
    "2024-01-01",
    "2024-04-01",
  );
  expect(result.estimated).toBe(true);
  expect(result.cumulativePct).toBe("0.980000");
  expect(result.equivalentAmount).toBe("10098.00");
});
it("rejects missing internal months, nulls, duplicates and invalid monthly factors", () => {
  for (const points of [
    [p("2024-01-01", "0"), p("2024-03-01", "1")],
    [p("2024-01-01", "0"), p("2024-02-01", null), p("2024-03-01", "1")],
    [p("2024-01-01", "0"), p("2024-02-01", "-100")],
    [p("2024-01-01", "0"), p("2024-01-01", "0"), p("2024-02-01", "1")],
  ]) {
    const result = inflationPeriod(
      points,
      "monthly",
      "2024-01-01",
      "2024-03-01",
    );
    expect(result.status).toBe("unavailable");
    expect(result.cumulativePct).toBeNull();
  }
});
it("reports actual coverage and never annualizes a single observation or invents an endpoint", () => {
  const result = inflationPeriod(
    [p("2023-02-01", "100"), p("2024-01-01", "98")],
    "index",
    "2020-01-01",
    "2026-11-03",
  );
  expect(result.startTruncated).toBe(true);
  expect(result.endTruncated).toBe(true);
  expect(result.actualFrom).toBe("2023-02-01");
  expect(result.months).toBe(11);
  expect(result.cumulativePct).toBe("-2.000000");
  expect(
    inflationPeriod(
      [p("2024-01-01", "100")],
      "index",
      "2020-01-01",
      "2025-01-01",
    ).status,
  ).toBe("unavailable");
  expect(
    inflationPeriod(
      [p("2024-01-01", "0"), p("2025-01-01", "1")],
      "index",
      "2020-01-01",
      "2025-01-01",
    ).status,
  ).toBe("unavailable");
});
it("selects NATIONAL_SEQUENTIAL without substituting the yearly rate", () => {
  const points = parseChinaCpi(
    {
      success: true,
      result: {
        pages: 1,
        data: [
          {
            REPORT_DATE: "2024-01-01",
            NATIONAL_SAME: 3,
            NATIONAL_SEQUENTIAL: -0.2,
          },
        ],
      },
    },
    "NATIONAL_SEQUENTIAL",
  );
  expect(points[0].value).toBe("-0.2");
});
