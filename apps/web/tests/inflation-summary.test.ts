import { expect, it, vi } from "vitest";
vi.mock("@/lib/data", () => ({ seriesData: vi.fn() }));
import { seriesData } from "@/lib/data";
import { inflationSummary } from "@/lib/inflation-summary";
import { seriesById } from "@/lib/catalog";
const response = (
  id: string,
  points: { time: string; value: string | null }[],
) => ({
  series: seriesById(id),
  points,
  source: {
    id: "fred",
    label: "FRED",
    url: "https://fred.stlouisfed.org/series/CPIAUCNS",
  },
  unit: "index",
  asOf: points.at(-1)?.time ?? null,
  fetchedAt: null,
  status: "delayed" as const,
  isDemo: false,
});
it("loads the raw CPI companion including the baseline observation month", async () => {
  vi.mocked(seriesData).mockResolvedValue(
    response("US_CPI_INDEX_M", [
      { time: "2020-01-01", value: "100" },
      { time: "2025-01-01", value: "120" },
    ]),
  );
  const result = await inflationSummary(
    "US_CPI_YOY_M",
    "2020-01-15",
    "2025-01-31",
  );
  expect(seriesData).toHaveBeenCalledWith(
    "US_CPI_INDEX_M",
    "2020-01-01",
    "2025-01-31",
  );
  expect(result.cumulativePct).toBe("20.000000");
  expect(result.estimated).toBe(false);
});
it("preserves missing-credential status and null outputs instead of inventing results", async () => {
  vi.mocked(seriesData).mockResolvedValue({
    ...response("US_CPI_INDEX_M", []),
    status: "not_configured",
  });
  const result = await inflationSummary(
    "US_CPI_YOY_M",
    "2020-01-01",
    "2025-01-01",
  );
  expect(result.sourceStatus).toBe("not_configured");
  expect(result.cumulativePct).toBeNull();
  expect(result.equivalentAmount).toBeNull();
});
it("does not expose arbitrary or prototype series identifiers", async () => {
  for (const id of ["constructor", "toString", "FRED_CPIAUCSL"])
    await expect(inflationSummary(id)).rejects.toThrow();
});
