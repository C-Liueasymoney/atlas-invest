import { it, expect } from "vitest";
import {
  pearson,
  returns,
  align,
  cell,
  rolling,
  normalize,
} from "@/lib/analytics/engine";
const x = Array.from({ length: 40 }, (_, i) => i - 20);
it("correlates returns symmetrically with sign and rejects constant and short series", () => {
  expect(pearson(x.map((v) => ({ x: v, y: v * 2 }))).value).toBeCloseTo(1);
  expect(pearson(x.map((v) => ({ x: v, y: -v }))).value).toBeCloseTo(-1);
  expect(
    pearson(x.map((v, i) => ({ x: v, y: i % 2 ? 1 : -1 }))).value!,
  ).toBeLessThan(0.1);
  expect(pearson(x.map((v) => ({ x: v, y: 1 }))).value).toBeNull();
  expect(pearson([{ x: 1, y: 1 }]).reason).toContain("样本不足");
});
it("uses identical return intervals, handles unsorted/duplicate/bad points, and applies FX once", () => {
  const p = [
    { time: "2026-01-01", value: "100" },
    { time: "2026-01-02", value: "110" },
    { time: "2026-01-05", value: "99" },
  ];
  const r = returns(
    p,
    "daily",
    "return",
    "USD",
    "CNY",
    p.map((q) => ({ ...q, value: "7" })),
  );
  expect(r[0].value).toBeCloseTo(0.1);
  expect(
    returns(
      [...p].reverse(),
      "daily",
      "return",
      "USD",
      "CNY",
      p.map((q) => ({ ...q, value: "7" })),
    ),
  ).toEqual(r);
  expect(
    align(r, returns([p[0], p[2]], "daily", "return", "CNY", "CNY")),
  ).toHaveLength(0);
  expect(returns(p, "daily", "return", "USD", "CNY")).toHaveLength(0);
  expect(normalize([p[0], { ...p[0], value: "200" }])[0].value).toBeNull();
  expect(
    returns([{ ...p[0], value: "-1" }, p[1]], "daily", "return", "CNY", "CNY"),
  ).toEqual([]);
  expect(
    returns(
      [
        { ...p[0], value: "4" },
        { ...p[1], value: "4.1" },
      ],
      "daily",
      "bp-change",
      "USD",
      "CNY",
    )[0].value,
  ).toBeCloseTo(10);
  const changed = returns(
    p,
    "daily",
    "return",
    "USD",
    "CNY",
    p.map((q, i) => ({ ...q, value: String(7 + i) })),
  );
  expect(changed[0].value).toBeCloseTo((1.1 * 8) / 7 - 1);
});
it("matrix diagonal requires variance; rolling preserves unavailable observations", () => {
  const p = x.map((v, i) => ({
    time: `2026-01-${String(i + 1).padStart(2, "0")}`,
    start: String(i),
    key: String(i),
    value: v,
  }));
  expect(cell("a", "a", p, p).value).toBeCloseTo(1);
  expect(cell("a", "b", p, p).value).toBe(cell("b", "a", p, p).value);
  expect(
    rolling(p, p, 30)
      .slice(0, 29)
      .every((p) => p.value === null),
  ).toBe(true);
});

it("shows shared missing dates instead of connecting the rolling line", () => {
  expect(rolling([], [], 30, ["2026-01-02"])).toEqual([
    { time: "2026-01-02", value: null },
  ]);
});
