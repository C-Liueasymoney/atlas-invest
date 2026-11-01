import { expect, test } from "@playwright/test";
// Explicit synthetic HTTP fixtures. These tests do not assert live provider values.
const items = [
  ["SGE_AU9999_D1", "国内黄金 Au99.99"],
  ["FRED_NASDAQ100", "纳斯达克100指数"],
  ["FRED_SP500", "标普500指数"],
  ["FRED_DFII10", "美国实际利率"],
  ["FRED_DGS10", "美国国债收益率"],
  ["FX_USDCNY_D1", "美元兑人民币"],
  ["XAUUSD_QUOTE", "国际黄金参考报价"],
].map(([id, name]) => ({
  id,
  name,
  currency: "USD",
  unit: "index",
  transform: "return",
  status: id === "XAUUSD_QUOTE" ? "empty" : "demo",
  source: {
    id: "fixture",
    label: "测试合成来源",
    url: "https://example.com/fixture",
  },
  asOf: "2026-10-30",
  fetchedAt: "2026-10-31T00:00:00Z",
  count: 80,
  reason: id === "XAUUSD_QUOTE" ? "参考报价没有日线历史" : null,
}));
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/session", (r) =>
    r.fulfill({ json: { mode: "demo", authenticated: true, localDemo: true } }),
  );
  await page.route("**/api/v1/analytics/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("availability"))
      return route.fulfill({ json: { items } });
    if (url.pathname.endsWith("refresh"))
      return route.fulfill({ json: { items: [] } });
    const assets = (url.searchParams.get("assets") || "").split(",");
    function cell(a: string, b: string) {
      const empty = [a, b].includes("XAUUSD_QUOTE");
      return {
        a,
        b,
        value: empty
          ? null
          : a === b
            ? 1
            : [a, b].includes("SGE_AU9999_D1")
              ? -0.321
              : 0.854,
        n: empty ? 0 : 80,
        from: "2026-07-01",
        to: "2026-10-30",
        missingRate: empty ? 1 : 0.05,
        reason: empty ? "insufficient_samples" : null,
      };
    }
    if (url.pathname.endsWith("rolling")) {
      const a = url.searchParams.get("a")!,
        b = url.searchParams.get("b")!;
      return route.fulfill({
        json: {
          points: Array.from({ length: 70 }, (_, i) => ({
            time: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10),
            value:
              i < 30 || cell(a, b).value === null
                ? null
                : Math.sin(i / 8) * 0.6,
          })),
          pairs:
            cell(a, b).value === null
              ? []
              : Array.from({ length: 80 }, (_, i) => ({
                  time: new Date(Date.UTC(2026, 6, i + 1))
                    .toISOString()
                    .slice(0, 10),
                  x: Math.sin(i) / 100,
                  y: Math.cos(i) / 100,
                })),
          cell: cell(a, b),
          window: Number(url.searchParams.get("window")),
          warnings: [],
          isDemo: true,
        },
      });
    }
    return route.fulfill({
      json: {
        assets: assets.map((id) => items.find((a) => a.id === id)),
        matrix: assets.map((a) => assets.map((b) => cell(a, b))),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        currency: url.searchParams.get("currency"),
        frequency: url.searchParams.get("frequency"),
        algorithm: "fixture-v1",
        warnings: ["跨市场同日收盘可能不同步"],
        isDemo: true,
      },
    });
  });
});
test("fixture matrix, pair detail, zoom, windows, data table, CSV and refresh", async ({
  page,
}) => {
  await page.goto("/analytics/correlation");
  await expect(
    page.getByRole("heading", { name: "资产相关性", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".analytics-demo")).toContainText("DEMO");
  await expect(page.locator(".analytics-summary")).toContainText("0.071");
  const cell = page.getByRole("button", {
    name: /国内黄金 Au99.99 与 纳斯达克100指数/,
  });
  await cell.focus();
  await expect(
    page.locator(".analytics-matrix-panel [role=status]"),
  ).toContainText("缺失 5.0%");
  await cell.click();
  await expect(page.getByLabel("资产 A", { exact: true })).toHaveValue(
    "SGE_AU9999_D1",
  );
  await expect(page.getByLabel("资产 B", { exact: true })).toHaveValue(
    "FRED_NASDAQ100",
  );
  await page.getByRole("img", { name: /滚动相关系数曲线/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".analytics-chart-tooltip")).toContainText("2026-");
  await page.getByLabel("缩放起点").fill("30");
  await page.getByRole("button", { name: "重置缩放" }).click();
  await expect(page.getByLabel("缩放起点")).toHaveValue("0");
  const rolling = page.waitForRequest(
    (r) =>
      r.url().includes("/correlation/rolling?") &&
      r.url().includes("window=30"),
  );
  await page.getByLabel("滚动窗口").selectOption("30");
  await rolling;
  await page.getByRole("button", { name: "查看数据表" }).click();
  await expect(page.locator(".analytics-pairs-scroll tbody tr")).toHaveCount(
    80,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出矩阵 CSV" }).click();
  expect((await download).suggestedFilename()).toBe("correlation-matrix.csv");
  const refresh = page.waitForRequest(
    (r) => r.url().endsWith("/analytics/refresh") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "刷新分析数据" }).click();
  expect((await refresh).postDataJSON()).toEqual({
    assets: ["SGE_AU9999_D1", "FX_USDCNY_D1", "FRED_NASDAQ100"],
  });
});
test("search, unavailable history and date/frequency/base controls remain explicit", async ({
  page,
}) => {
  await page.goto("/analytics/correlation");
  await page.getByLabel("搜索资产").fill("XAU");
  await expect(page.locator(".analytics-catalog .analytics-asset")).toHaveCount(
    1,
  );
  await expect(page.locator(".analytics-catalog")).toContainText(
    "参考报价没有日线历史",
  );
  await page.locator(".analytics-catalog input[type=checkbox]").check();
  const missing = page.getByRole("button", {
    name: /国内黄金 Au99.99 与 国际黄金参考报价/,
  });
  await expect(missing).toContainText("—");
  await missing.focus();
  await expect(
    page.locator(".analytics-matrix-panel [role=status]"),
  ).toContainText("共同样本不足20个");
  await page.getByLabel("日期范围").selectOption("3Y");
  const request = page.waitForRequest(
    (r) =>
      r.url().includes("/correlation?") &&
      r.url().includes("currency=USD") &&
      r.url().includes("frequency=weekly"),
  );
  await page.getByLabel("采样频率").selectOption("weekly");
  await page.getByLabel("计价货币").selectOption("USD");
  await request;
  await expect(page.locator(".analytics-method")).toContainText("weekly · USD");
  await page.getByLabel("开始日期").fill("2026-10-31");
  await page.getByLabel("结束日期").fill("2026-10-01");
  await expect(
    page.locator(".analytics-correlation [role=alert]"),
  ).toContainText("请选择有效日期区间");
  await expect(page.locator(".analytics-matrix")).toHaveCount(0);
});
test("mobile heatmap scroll stays inside the panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analytics/correlation");
  await expect(page.locator(".analytics-matrix")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "国际黄金", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "移除国际黄金参考报价", exact: true }),
  ).toBeVisible();
});
test("rolling demo remains labelled when the matrix request fails", async ({
  page,
}) => {
  await page.route("**/api/v1/analytics/correlation?*", (r) =>
    r.fulfill({ status: 503, json: { error: { message: "矩阵暂不可用" } } }),
  );
  await page.goto("/analytics/correlation");
  await expect(page.locator(".analytics-demo")).toContainText("DEMO");
  await expect(page.getByText("矩阵暂不可用", { exact: true })).toBeVisible();
});
test("widget asset replacement survives an incomplete local selection", async ({
  page,
}) => {
  const widget = {
    id: "33333333-3333-4333-8333-333333333333",
    type: "rolling-correlation",
    config: {
      seriesIds: ["SGE_AU9999_D1", "FX_USDCNY_D1"],
      range: "1Y",
      frequency: "daily",
      currency: "CNY",
      window: 60,
    },
    layout: { x: 0, y: 0, w: 12, h: 10 },
  };
  await page.route("**/api/v1/dashboards", (r) =>
    r.fulfill({
      json: { items: [{ id: "d", name: "test", widgets: [widget] }] },
    }),
  );
  await page.goto("/dashboard");
  await page.getByRole("tab", { name: /研究看板/ }).click();
  const checks = page.locator(".analytics-catalog input[type=checkbox]");
  await expect(checks).toHaveCount(items.length);
  await page.locator(".analytics-controls summary").click();
  await checks.nth(0).uncheck();
  await expect(
    page.getByText("请选择至少两项资产。", { exact: true }),
  ).toBeVisible();
  await checks.nth(1).check();
  await expect(
    page.getByText("组件配置无法识别。", { exact: false }),
  ).toHaveCount(0);
  await expect(checks.nth(1)).toBeChecked();
});
