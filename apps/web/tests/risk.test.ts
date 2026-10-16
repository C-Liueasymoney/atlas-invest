import { it, expect } from "vitest";
import { riskStats } from "@/lib/calculations";
it("reports actual peak-to-trough drawdown and daily return distribution", () => {
  const s = riskStats(["100", "120", "90", "110"]);
  expect(s.maxDrawdownPct).toBe(-25);
  expect(s.sampleCount).toBe(4);
  expect(s.annualizedVolatilityPct).toBeGreaterThan(0);
  expect(s.returnDistribution.reduce((n, b) => n + b.count, 0)).toBe(3);
  expect(s.annualizationDays).toBe(252);
});
it("does not report zero risk when no valid prices exist", () => {
  const s = riskStats(["0", "-1"]);
  expect(s.maxDrawdownPct).toBeNull();
  expect(s.annualizedVolatilityPct).toBeNull();
  expect(s.sampleCount).toBe(0);
});
