import { it, expect } from "vitest";
import { evaluateRule } from "@/lib/alerts";
import type { Alert, Quote } from "@/lib/types";
const rule = (): Alert => ({
  id: "a",
  seriesId: "SGE_AU9999_D1",
  conditionType: "crosses_above",
  params: { threshold: 1000 },
  enabled: true,
  cooldownSeconds: 60,
  state: {},
});
const q = (value: string, date: string): Quote => ({
  seriesId: "SGE_AU9999_D1",
  value,
  previousValue: null,
  unit: "CNY/g",
  currency: "CNY",
  source: { id: "sge", label: "SGE", url: "" },
  asOf: date + "T00:00:00Z",
  fetchedAt: date + "T01:00:00Z",
  status: "delayed",
  isDemo: false,
});
it("fires only on a crossing, rearms below the threshold and deduplicates repeated observations", () => {
  let a = rule();
  const run = (v: string, d: string, now: number) => {
    const r = evaluateRule(a, q(v, d), [], now);
    a = r.alert;
    return r.event;
  };
  expect(run("1001", "2026-01-01", 1000)).toBeUndefined();
  expect(run("999", "2026-01-02", 2000)).toBeUndefined();
  expect(run("1002", "2026-01-03", 100000)?.observedValue).toBe("1002");
  expect(run("1002", "2026-01-03", 200000)).toBeUndefined();
  expect(run("1003", "2026-01-04", 300000)).toBeUndefined();
  expect(run("990", "2026-01-05", 400000)).toBeUndefined();
  expect(run("1004", "2026-01-06", 500000)).toBeDefined();
});
it("keeps cooldown and suppresses stale price threshold signals", () => {
  const a = {
    ...rule(),
    lastFiredAt: new Date(90000).toISOString(),
    state: { previousValue: "990", previousAsOf: "2026-01-01T00:00:00Z" },
  };
  expect(
    evaluateRule(a, q("1001", "2026-01-02"), [], 100000).event,
  ).toBeUndefined();
  expect(
    evaluateRule(
      rule(),
      { ...q("1001", "2026-01-02"), status: "stale" },
      [],
      100000,
    ).event,
  ).toBeUndefined();
});
it("stale alerts rearm after recovery and new observations do not fire on first initialization", () => {
  let a = { ...rule(), conditionType: "data_stale" };
  let r = evaluateRule(
    a,
    { ...q("1", "2026-01-01"), status: "stale" },
    [],
    100000,
  );
  expect(r.event).toBeDefined();
  a = r.alert;
  r = evaluateRule(a, { ...q("1", "2026-01-01"), status: "stale" }, [], 200000);
  expect(r.event).toBeUndefined();
  a = evaluateRule(r.alert, q("1", "2026-01-02"), [], 300000).alert;
  expect(
    evaluateRule(a, { ...q("1", "2026-01-02"), status: "stale" }, [], 400000)
      .event,
  ).toBeDefined();
  a = { ...rule(), conditionType: "new_observation" };
  r = evaluateRule(a, q("1", "2026-01-01"), [], 100000);
  expect(r.event).toBeUndefined();
  expect(
    evaluateRule(r.alert, q("2", "2026-01-02"), [], 200000).event,
  ).toBeDefined();
});
it("computes percent change over actual observations and protects zero denominators", () => {
  const a = {
    ...rule(),
    conditionType: "pct_change",
    params: { threshold: 5, window: 1 },
  };
  expect(
    evaluateRule(
      a,
      q("110", "2026-01-02"),
      [
        { time: "2026-01-01", value: "100" },
        { time: "2026-01-02", value: "110" },
      ],
      100000,
    ).event,
  ).toBeDefined();
  expect(
    evaluateRule(
      a,
      q("110", "2026-01-02"),
      [
        { time: "2026-01-01", value: "0" },
        { time: "2026-01-02", value: "110" },
      ],
      100000,
    ).event,
  ).toBeUndefined();
});
it("retains the percent-change active latch while an unchanged observation is polled", () => {
  const a = {
    ...rule(),
    conditionType: "pct_change",
    params: { threshold: 5, window: 1 },
  };
  const h = [
    { time: "2026-01-01", value: "100" },
    { time: "2026-01-02", value: "110" },
  ];
  const first = evaluateRule(a, q("110", "2026-01-02"), h, 100000);
  expect(first.event).toBeDefined();
  const repeat = evaluateRule(first.alert, q("110", "2026-01-02"), h, 200000);
  expect(repeat.alert.state.active).toBe(true);
  const next = evaluateRule(
    repeat.alert,
    q("121", "2026-01-03"),
    [...h, { time: "2026-01-03", value: "121" }],
    300000,
  );
  expect(next.event).toBeUndefined();
});
