import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHolding,
  updateHolding,
  createDecision,
  updateDecision,
  createTask,
  submitResult,
  getTask,
  cancelTask,
  readWorkspace,
} from "@/lib/investment/service";
let directory: string;
const holding = {
  name: "待确认基金",
  code: null,
  market: null,
  identityStatus: "unconfirmed",
  assetClass: "fund",
  currency: "CNY",
  exposureCurrency: null,
  sizing: "value",
  amount: 2000,
  valuationDate: "2026-11-06",
  source: "手动登记",
  investmentScope: "待披露确认",
};
export const result = {
  kind: "holding_analysis",
  asOf: "2026-11-06T00:00:00Z",
  summary: "尚不能确认实际证券",
  facts: [{ id: "f1", text: "官方资料可访问", sourceIds: ["s1"] }],
  mechanisms: [
    {
      title: "利率",
      explanation: "利率变化可能影响估值",
      holdingIds: [],
      conditions: "久期较长时",
      counterFactors: "现金流增长",
      factIds: ["f1"],
    },
  ],
  events: [],
  observations: [
    {
      text: "确认基金代码",
      holdingIds: [],
      mechanismIndexes: [0],
      sourceIds: ["s1"],
    },
  ],
  review: null,
  sources: [
    {
      id: "s1",
      url: "https://example.com/disclosure",
      title: "披露",
      publisher: "发布机构",
      publishedAt: null,
      retrievedAt: "2026-11-06T00:00:00Z",
      coverage: "未提供完整披露",
      access: "partial",
    },
  ],
  limitations: ["代码未确认，无法穿透"],
  generation: "external_ai",
};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-investment-"));
  vi.stubEnv("DATA_MODE", "demo");
  vi.stubEnv("ATLAS_INVESTMENT_PATH", join(directory, "state.json"));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function setup() {
  const h = await createHolding(holding);
  const t = await createTask({
    kind: "holding_analysis",
    holdingIds: [h.id],
    from: "2026-10-07",
    to: "2026-11-06",
  });
  return { h, t };
}
const submit = (
  t: Awaited<ReturnType<typeof createTask>>,
  r: unknown = result,
  key = "retry-1",
) =>
  submitResult({
    taskId: t.id,
    schemaVersion: 1,
    contextVersion: t.contextVersion,
    result: r,
    idempotencyKey: key,
  });
it("starts empty and freezes selected context while detecting later edits", async () => {
  expect((await readWorkspace()).holdings).toEqual([]);
  const { h, t } = await setup();
  await updateHolding(h.id, { ...holding, name: "已编辑", expectedVersion: 1 });
  const read = await getTask(t.id);
  expect(read.task.context.holdings[0].name).toBe("待确认基金");
  expect(read.contextChanged).toBe(true);
  expect((await readWorkspace()).holdings[0].revisions).toHaveLength(1);
});
it("stores only one concurrent result, retries identical content and rejects conflicts", async () => {
  const { t } = await setup();
  const [a, b] = await Promise.all([submit(t), submit(t)]);
  expect(a.resultId).toBe(b.resultId);
  expect((await readWorkspace()).results).toHaveLength(1);
  await expect(submit(t, { ...result, summary: "不同" })).rejects.toMatchObject(
    { status: 409 },
  );
  await expect(submit(t, result, "another-key")).rejects.toMatchObject({
    status: 409,
  });
});
it("rejects cancelled/expired tasks and wrong versions", async () => {
  const { t } = await setup();
  await expect(
    submitResult({
      taskId: t.id,
      schemaVersion: 2,
      contextVersion: t.contextVersion,
      result,
      idempotencyKey: "x",
    }),
  ).rejects.toMatchObject({ status: 400 });
  await cancelTask(t.id);
  await expect(submit(t)).rejects.toMatchObject({ status: 409 });
  const { t: next } = await setup();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 8 * 86400000);
  await expect(submit(next)).rejects.toMatchObject({ status: 410 });
});
it("rejects unsafe sources, missing citations and asset associations outside the snapshot", async () => {
  const { t } = await setup();
  await expect(
    submit(t, {
      ...result,
      sources: [{ ...result.sources[0], url: "javascript:alert(1)" }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    submit(t, {
      ...result,
      facts: [{ id: "f1", text: "无来源", sourceIds: ["unknown"] }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    submit(t, {
      ...result,
      mechanisms: [
        {
          ...result.mechanisms[0],
          holdingIds: ["00000000-0000-4000-8000-000000000099"],
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("keeps the original decision and appends completed reviews atomically", async () => {
  const { h } = await setup();
  const d = await createDecision({
    holdingIds: [h.id],
    rationale: "原始理由",
    supportingEvidence: "披露",
    falsification: "假设不成立",
    horizon: "一年",
    reviewDate: "2027-01-01",
  });
  await updateDecision(d.id, {
    holdingIds: [h.id],
    rationale: "修订理由",
    supportingEvidence: "新披露",
    falsification: "条件变化",
    horizon: "一年",
    reviewDate: "2027-01-02",
    expectedVersion: 1,
  });
  const t = await createTask({
    kind: "decision_review",
    holdingIds: [h.id],
    decisionId: d.id,
    from: "2026-10-07",
    to: "2026-11-06",
  });
  await submitResult({
    taskId: t.id,
    schemaVersion: 1,
    contextVersion: t.contextVersion,
    idempotencyKey: "review",
    result: {
      ...result,
      kind: "decision_review",
      review: {
        evidenceChanges: "未获得新证据",
        counterEvidence: "无",
        unresolved: "仍待披露",
      },
    },
  });
  const state = await readWorkspace();
  expect(state.decisions[0].original.rationale).toBe("原始理由");
  expect(state.decisions[0].revisions).toHaveLength(1);
  expect(state.decisions[0].reviewResultIds).toHaveLength(1);
});
it("detects context drift after completion while replaying the original saved receipt", async () => {
  const { h, t } = await setup();
  const receipt = await submit(t);
  await updateHolding(h.id, { ...holding, amount: 3000, expectedVersion: 1 });
  expect((await getTask(t.id)).contextChanged).toBe(true);
  expect(await submit(t)).toEqual(receipt);
  await expect(
    updateHolding(h.id, { ...holding, expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
});
it("saves portfolio and event templates and rejects mismatched review fields", async () => {
  const { h } = await setup();
  for (const kind of ["portfolio_analysis", "events"]) {
    const t = await createTask({
      kind,
      holdingIds: [h.id],
      from: "2026-10-07",
      to: "2026-11-06",
    });
    await expect(
      submit(t, {
        ...result,
        kind,
        review: { evidenceChanges: "x", counterEvidence: "x", unresolved: "x" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await submit(t, { ...result, kind });
  }
  expect((await readWorkspace()).results).toHaveLength(2);
});
it("preserves month precision for an event overlapping the research window", async () => {
  const { h } = await setup();
  const t = await createTask({
    kind: "events",
    holdingIds: [h.id],
    from: "2026-10-07",
    to: "2026-11-06",
  });
  await submit(t, {
    ...result,
    kind: "events",
    events: [
      {
        title: "月度披露",
        eventDate: "2026-10-01",
        datePrecision: "month",
        publishedAt: null,
        holdingIds: [h.id],
        explanation: "仅知道该月，不能声称具体日期",
        concept: "披露滞后",
        sourceIds: ["s1"],
      },
    ],
  });
  const state = await readWorkspace();
  expect(state.results[0].result.events[0].datePrecision).toBe("month");
});
it("re-researches the current decision holdings after A becomes A+B and keeps its result history", async () => {
  const a = await createHolding(holding),
    b = await createHolding({ ...holding, name: "新增持仓B" });
  const data = {
    holdingIds: [a.id],
    rationale: "原始理由",
    supportingEvidence: "披露",
    falsification: "假设不成立",
    horizon: "一年",
    reviewDate: "2027-01-01",
  };
  const decision = await createDecision(data);
  const first = await createTask({
    kind: "decision_review",
    decisionId: decision.id,
    holdingIds: [a.id],
    from: "2026-10-07",
    to: "2026-11-06",
  });
  const receipt = await submit(first, {
    ...result,
    kind: "decision_review",
    review: {
      evidenceChanges: "无新资料",
      counterEvidence: "待确认",
      unresolved: "需披露",
    },
  });
  await updateDecision(decision.id, {
    ...data,
    holdingIds: [a.id, b.id],
    expectedVersion: 1,
  });
  const next = await createTask({
    kind: "decision_review",
    decisionId: decision.id,
    previousResultId: receipt.resultId,
    from: first.from,
    to: first.to,
  });
  expect(next.context.holdings.map((h) => h.id)).toEqual([a.id, b.id]);
  expect(next.previousResultId).toBe(receipt.resultId);
  expect(next.context.decisions[0].version).toBe(2);
  expect(
    (await getTask(first.id)).task.context.holdings.map((h) => h.id),
  ).toEqual([a.id]);
  const legacy = await createTask({
    kind: "decision_review",
    decisionId: decision.id,
    holdingIds: [a.id],
    previousResultId: receipt.resultId,
    from: first.from,
    to: first.to,
  });
  expect(legacy.context.holdings.map((h) => h.id)).toEqual([a.id, b.id]);
});
it("rejects previous review results from a different decision with identical holdings", async () => {
  const { h } = await setup();
  const data = {
    holdingIds: [h.id],
    rationale: "原始理由",
    supportingEvidence: "披露",
    falsification: "假设不成立",
    horizon: "一年",
    reviewDate: "2027-01-01",
  };
  const first = await createDecision(data),
    other = await createDecision({ ...data, rationale: "另一判断" });
  const task = await createTask({
    kind: "decision_review",
    decisionId: first.id,
    holdingIds: [h.id],
    from: "2026-10-07",
    to: "2026-11-06",
  });
  const receipt = await submit(task, {
    ...result,
    kind: "decision_review",
    review: {
      evidenceChanges: "无",
      counterEvidence: "无",
      unresolved: "未知",
    },
  });
  await expect(
    createTask({
      kind: "decision_review",
      decisionId: other.id,
      holdingIds: [h.id],
      previousResultId: receipt.resultId,
      from: task.from,
      to: task.to,
    }),
  ).rejects.toMatchObject({ status: 400 });
});
