import { expect, test } from "@playwright/test";
test("mobile holding registration, immutable task, clipboard fallback and recovered evidence", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const name = "PW持仓" + Date.now();
  await page.goto("/investments");
  await page.getByRole("button", { name: "登记持仓", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill(name);
  await page.getByLabel("数值", { exact: true }).fill("1200");
  await page.getByRole("button", { name: "保存持仓", exact: true }).click();
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("checkbox", { name }) });
  await expect(card).toContainText("代码待确认");
  await card.getByRole("checkbox", { name }).check();
  await page.getByRole("button", { name: "创建任务并查看复制指令" }).click();
  await expect(page).toHaveURL(/\/investments\/tasks\//);
  await expect(
    page.getByRole("heading", { name: "待执行", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("blocked")) },
    }),
  );
  await page.getByRole("button", { name: "复制 AI 指令", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("自动复制失败");
  await expect(page.getByLabel("完整 AI 指令")).toContainText(
    "get_research_task",
  );
  const taskId = page.url().split("/").pop()!;
  const response = await request.get("/api/v1/investment/tasks/" + taskId);
  const { task } = await response.json();
  const result = {
    kind: "holding_analysis",
    asOf: "2026-11-06T00:00:00Z",
    summary: "研究结果页面回归验证",
    facts: [{ id: "f1", text: "资料来源提供了披露", sourceIds: ["s1"] }],
    mechanisms: [
      {
        title: "利率因素",
        explanation: "利率可能影响折现率",
        holdingIds: [task.context.holdings[0].id],
        conditions: "现金流不变",
        counterFactors: "盈利增长",
        factIds: ["f1"],
      },
    ],
    events: [],
    observations: [
      {
        text: "观察后续披露",
        holdingIds: [task.context.holdings[0].id],
        mechanismIndexes: [0],
        sourceIds: ["s1"],
      },
    ],
    review: null,
    sources: [
      {
        id: "s1",
        url: "https://example.com/disclosure",
        title: "披露资料",
        publisher: "机构",
        publishedAt: null,
        retrievedAt: "2026-11-06T00:00:00Z",
        coverage: "仅公开摘要",
        access: "summary",
      },
    ],
    limitations: ["无法核实完整披露"],
    generation: "external_ai",
  };
  await page.getByLabel("恢复提交 JSON").fill(
    JSON.stringify({
      taskId,
      schemaVersion: 1,
      contextVersion: task.contextVersion,
      result,
      idempotencyKey: "pw-recovery",
    }),
  );
  await page
    .getByRole("button", { name: "校验并恢复保存", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "已保存", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "打开已保存结果" }).click();
  await expect(
    page.getByRole("heading", { name: "研究结果", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("研究结果页面回归验证", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "不确定性与资料覆盖" }),
  ).toBeVisible();
  await expect(page.getByText("观察后续披露", { exact: true })).toBeVisible();
  await expect(
    page.getByText("无法核实完整披露", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("investment-result-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
