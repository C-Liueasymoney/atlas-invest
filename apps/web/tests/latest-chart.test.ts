import { expect, it } from "vitest";
import { withLatestQuote } from "@/lib/chart-latest";
import type { Quote } from "@/lib/types";
const quote = {
  value: "833",
  asOf: "2026-10-31",
  asOfKind: "date",
  isDemo: false,
} as Quote;
it("extends a line to the latest quote without changing historical closes", () => {
  const points = [{ time: "2026-10-30", value: "854.76", close: "854.76" }];
  expect(withLatestQuote(points, quote, "Asia/Shanghai").at(-1)).toEqual({
    time: "2026-10-31",
    value: "833",
  });
  expect(points).toEqual([
    { time: "2026-10-30", value: "854.76", close: "854.76" },
  ]);
});
it("uses the index market date and replaces only the displayed same-day endpoint", () => {
  const points = [{ time: "2026-10-30", value: "29000" }];
  expect(
    withLatestQuote(
      points,
      {
        ...quote,
        value: "28384.846",
        asOf: "2026-10-31T00:00:00Z",
        asOfKind: "timestamp",
      },
      "America/New_York",
    ),
  ).toEqual([{ time: "2026-10-30", value: "28384.846" }]);
  expect(
    withLatestQuote(points, { ...quote, isDemo: true }, "America/New_York"),
  ).toEqual(points);
});
