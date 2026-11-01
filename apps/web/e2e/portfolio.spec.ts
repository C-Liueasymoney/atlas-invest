import { expect, test } from "@playwright/test";

test("restored widget waits for its saved portfolio while FX assumptions remain editable", async ({
  page,
  request,
}) => {
  const created = await request.post("/api/v1/analytics/portfolios", {
    data: {
      name: `PW延迟载入${Date.now()}`,
      baseCurrency: "CNY",
      mode: "percent",
      initialValue: 345678,
      positions: [{ assetId: "CASH_CNY", value: 100, exposureCurrency: "CNY" }],
      thresholds: [20],
    },
  });
  expect(created.ok()).toBeTruthy();
  const { item } = await created.json();
  let release!: () => void, markStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  await page.route(
    `**/api/v1/analytics/portfolios/${item.id}`,
    async (route) => {
      const response = await route.fetch();
      markStarted();
      await gate;
      await route.fulfill({ response });
    },
  );
  await page.route("**/api/v1/dashboards", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "portfolio-regression",
            name: "组合载入测试",
            widgets: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                type: "portfolio-stress-test",
                config: { portfolioId: item.id },
                layout: { x: 0, y: 0, w: 12, h: 12 },
              },
            ],
          },
        ],
      },
    }),
  );
  try {
    await page.goto("/dashboard");
    await page.getByRole("tab", { name: /研究看板/ }).click();
    await started;
    const portfolio = page.getByRole("region", { name: "组合风险情景" });
    await expect(portfolio.getByLabel("已保存组合")).toHaveValue(item.id);
    await portfolio.getByLabel("USD/CNY假设变化", { exact: true }).fill("10");
    await expect(
      portfolio.getByRole("button", { name: "计算假设结果", exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      portfolio.getByRole("button", { name: "计算假设结果", exact: true }),
    ).toBeEnabled();
    await expect(
      portfolio.getByLabel("USD/CNY假设变化", { exact: true }),
    ).toHaveValue("10");
    await portfolio
      .getByRole("button", { name: "计算假设结果", exact: true })
      .click();
    await expect(portfolio.locator(".portfolio-result strong")).toHaveText(
      "组合假设收益 0.00%",
    );
    await expect(portfolio.getByTestId("portfolio-before")).toContainText(
      "345,678 CNY",
    );
  } finally {
    release();
    await request.delete(`/api/v1/analytics/portfolios/${item.id}`);
  }
});

test("late scenario and save responses preserve newer portfolio edits", async ({
  page,
  request,
}) => {
  const prefix = `PW延迟组合${Date.now()}`;
  let releaseScenario!: () => void, markScenarioStarted!: () => void;
  const scenarioGate = new Promise<void>((resolve) => {
    releaseScenario = resolve;
  });
  const scenarioStarted = new Promise<void>((resolve) => {
    markScenarioStarted = resolve;
  });
  await page.route("**/api/v1/analytics/portfolio/scenario", async (route) => {
    const response = await route.fetch();
    markScenarioStarted();
    await scenarioGate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/analytics/correlation");
    const portfolio = page.getByRole("region", { name: "组合风险情景" });
    await portfolio.getByLabel("组合名称").fill(prefix);
    await portfolio
      .getByRole("button", { name: "计算假设结果", exact: true })
      .click();
    await scenarioStarted;
    await portfolio.getByLabel("假设涨跌 1", { exact: true }).fill("-20");
    releaseScenario();
    await expect(
      portfolio.getByRole("button", { name: "计算假设结果", exact: true }),
    ).toBeEnabled();
    await expect(portfolio.locator(".portfolio-result")).toHaveCount(0);
    await expect(
      portfolio.getByLabel("假设涨跌 1", { exact: true }),
    ).toHaveValue("-20");
    await page.unroute("**/api/v1/analytics/portfolio/scenario");
    let releaseSave!: () => void, markSaveStarted!: () => void;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const saveStarted = new Promise<void>((resolve) => {
      markSaveStarted = resolve;
    });
    await page.route("**/api/v1/analytics/portfolios", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      markSaveStarted();
      await saveGate;
      await route.fulfill({ response });
    });
    await portfolio
      .getByRole("button", { name: "保存新组合", exact: true })
      .click();
    await saveStarted;
    await portfolio.getByLabel("组合名称").fill(prefix + "未保存的新修改");
    releaseSave();
    await expect(
      portfolio.getByRole("button", { name: "保存新组合", exact: true }),
    ).toBeEnabled();
    await expect(portfolio.getByLabel("组合名称")).toHaveValue(
      prefix + "未保存的新修改",
    );
    await expect(portfolio.getByLabel("已保存组合")).toHaveValue("");
  } finally {
    releaseScenario();
    const response = await request.get("/api/v1/analytics/portfolios");
    if (response.ok())
      for (const item of (await response.json()).items)
        if (item.name.startsWith(prefix))
          await request.delete(`/api/v1/analytics/portfolios/${item.id}`);
  }
});

// Uses the actual internal owner API and isolated demo/preview persistence, never market fixtures.
test("saved portfolio editing, shocks, thresholds, monetary values, copy and clear", async ({
  page,
  request,
}) => {
  const prefix = `PW组合${Date.now()}`;
  const list = await request.get("/api/v1/analytics/portfolios");
  expect(list.ok()).toBeTruthy();
  try {
    await page.goto("/analytics/correlation");
    const portfolio = page.getByRole("region", { name: "组合风险情景" });
    await expect(portfolio.getByLabel("组合名称")).toHaveValue(
      "示例组合（可修改）",
    );
    await portfolio.getByLabel("组合名称").fill(prefix);
    await portfolio.getByLabel("组合初始价值").fill("200000");
    await portfolio
      .getByRole("button", { name: "移除持仓 2", exact: true })
      .click();
    await portfolio.getByLabel("持仓 2", { exact: true }).fill("75");
    await portfolio.getByLabel("亏损提示阈值", { exact: true }).fill("10");
    await portfolio
      .getByRole("button", { name: "计算假设结果", exact: true })
      .click();
    await expect(portfolio.locator(".portfolio-result strong")).toHaveText(
      "组合假设收益 -10.00%",
    );
    await expect(portfolio.getByTestId("portfolio-before")).toContainText(
      "200,000 CNY",
    );
    await expect(portfolio.getByTestId("portfolio-after")).toContainText(
      "180,000 CNY",
    );
    await expect(portfolio.getByTestId("portfolio-profit-loss")).toContainText(
      "-20,000 CNY",
    );
    await expect(portfolio.locator(".portfolio-result")).toContainText(
      "亏损 10% 阈值：已触发",
    );
    await expect(portfolio.locator(".portfolio-result")).toContainText(
      "目标 25%，提示阈值 30%",
    );
    await expect(
      portfolio.locator(".portfolio-result tbody tr").first(),
    ).toContainText("100.00%");
    const saveResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/analytics/portfolios") &&
        r.request().method() === "POST",
    );
    await portfolio
      .getByRole("button", { name: "保存新组合", exact: true })
      .click();
    const saved = await (await saveResponse).json();
    expect(saved.item.initialValue).toBe(200000);
    const originalId = saved.item.id;
    await expect(
      portfolio.getByLabel("已保存组合", { exact: true }),
    ).toHaveValue(originalId);
    await portfolio.getByLabel("组合名称").fill(prefix + "改名");
    await portfolio
      .getByRole("button", { name: "保存 / 改名", exact: true })
      .click();
    await expect(portfolio.getByLabel("已保存组合")).toContainText(
      prefix + "改名",
    );
    const copyResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/portfolios/${originalId}/copy`) &&
        r.request().method() === "POST",
    );
    await portfolio.getByRole("button", { name: "复制", exact: true }).click();
    const copied = await (await copyResponse).json();
    expect(copied.item.id).not.toBe(originalId);
    await expect(portfolio.getByLabel("已保存组合")).toHaveValue(
      copied.item.id,
    );
    await page.reload();
    await portfolio.getByLabel("已保存组合").selectOption(originalId);
    await expect(portfolio.getByLabel("组合名称")).toHaveValue(prefix + "改名");
    await expect(portfolio.getByLabel("组合初始价值")).toHaveValue("200000");
    await portfolio.getByLabel("持仓 1", { exact: true }).fill("24");
    await expect(
      portfolio.getByRole("button", { name: "计算假设结果", exact: true }),
    ).toBeDisabled();
    await expect(
      portfolio.getByRole("button", { name: "保存 / 改名", exact: true }),
    ).toBeDisabled();
    await expect(portfolio).toContainText("权重必须合计100%");
    await portfolio
      .getByRole("button", { name: "清空持仓", exact: true })
      .click();
    await expect(portfolio.getByLabel(/^资产 \d+$/)).toHaveCount(0);
    await expect(
      portfolio.getByRole("button", { name: "计算假设结果", exact: true }),
    ).toBeDisabled();
    await portfolio.getByLabel("已保存组合").selectOption(copied.item.id);
    await portfolio.getByRole("button", { name: "删除", exact: true }).click();
    await expect(portfolio.getByLabel("已保存组合")).toHaveValue("");
    const missing = await request.get(
      `/api/v1/analytics/portfolios/${copied.item.id}`,
    );
    expect(missing.status()).toBe(404);
    const invalid = await request.post("/api/v1/analytics/portfolios", {
      data: {
        ...saved.item,
        name: prefix + "非法",
        positions: [
          { assetId: "CASH_CNY", value: 99, exposureCurrency: "CNY" },
        ],
      },
    });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error.message).toContain("100%");
    const missingFx = await request.post(
      "/api/v1/analytics/portfolio/scenario",
      { data: { portfolio: saved.item, shocks: { FRED_NASDAQ100: -40 } } },
    );
    expect(missingFx.status()).toBe(400);
    expect((await missingFx.json()).error.message).toContain("显式");
  } finally {
    const response = await request.get("/api/v1/analytics/portfolios");
    if (response.ok())
      for (const item of (await response.json()).items)
        if (item.name.startsWith(prefix))
          await request.delete(`/api/v1/analytics/portfolios/${item.id}`);
  }
});
