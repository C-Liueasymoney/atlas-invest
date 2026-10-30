import { expect, test } from "@playwright/test";
test("overview puts the actual source quote before the large chart and isolates research controls", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/v1/market/domestic-quote");
  expect(response.ok()).toBeTruthy();
  const { items } = await response.json();
  const quote = items[0];
  await page.goto("/dashboard");
  const focusSelect = page.getByLabel("选择主图指标");
  await expect(
    focusSelect.getByRole("option", { name: "纳斯达克100指数" }),
  ).toHaveCount(1);
  await expect(
    focusSelect.getByRole("option", { name: "标普500指数" }),
  ).toHaveCount(1);
  await focusSelect.selectOption("FRED_NASDAQ100");
  await expect(
    page.getByRole("heading", { name: "纳斯达克100指数", exact: true }),
  ).toBeVisible();
  await focusSelect.selectOption("SGE_AU9999_D1");
  await expect(
    page.getByRole("heading", { name: "国内黄金 Au99.99", exact: true }),
  ).toBeVisible();
  const price = page.getByTestId("focus-price");
  if (quote.isDemo) {
    await expect(price).toContainText("—");
    await expect(page.locator(".focus-demo")).toContainText("演示数据");
    await expect(price).not.toContainText(quote.value);
  } else if (quote.value !== null) {
    await expect(price).toContainText(
      Number(quote.value).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
    await expect(page.locator(".focus-context")).toContainText(
      quote.asOf.slice(0, 10),
    );
  }
  await expect(
    page.getByRole("tab", { name: "总览", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "添加组件", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".focus-chart-section")).toBeVisible();
  const bounds = await page.locator(".focus-chart-section").boundingBox();
  expect(bounds!.height).toBeGreaterThan(380);
  await page.getByRole("tab", { name: /研究看板/ }).click();
  await expect(
    page.getByRole("button", { name: "添加组件", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "总览", exact: true }).click();
  await expect(page.locator(".focus-chart-section")).toBeVisible();
});
test("manual gold refresh updates the main price from the latest quote independently of daily history", async ({
  page,
}) => {
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: { mode: "preview", authenticated: true, localDemo: true },
    }),
  );
  let value = "854.76";
  await page.route("**/api/v1/market/domestic-quote", async (route) => {
    if (route.request().method() === "POST") value = "833.00";
    await route.fulfill({
      json: {
        items: [
          {
            seriesId: "SGE_AU9999_D1",
            value,
            previousValue: "854.76",
            unit: "CNY/g",
            currency: "CNY",
            isDemo: false,
            status: "delayed",
            asOf: "2026-10-31",
            asOfKind: "date",
            fetchedAt: "2026-10-31T00:00:00Z",
            source: {
              id: "akshare_sge",
              label: "上海黄金交易所 · 延时行情",
              url: "https://www.sge.com.cn/sjzx/yshqbg",
            },
            qualityFlags: ["official_delayed_snapshot"],
          },
        ],
      },
    });
  });
  await page.goto("/dashboard");
  await expect(page.getByTestId("focus-price")).toContainText("854.76");
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(page.getByTestId("focus-price")).toContainText("833.00");
  await expect(page.getByTestId("chart-latest-point")).toHaveAttribute(
    "data-value",
    "833.00",
  );
  await expect(page.locator(".symbol-caption")).toContainText("最新延时行情");
  await expect(page.locator(".focus-chart-section")).toBeVisible();
});
test("both US indexes use latest quotes and align the line endpoint", async ({
  page,
}) => {
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      json: { mode: "preview", authenticated: true, localDemo: true },
    }),
  );
  await page.route("**/api/v1/market/index-quote?*", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("seriesId")!;
    const ndx = id === "FRED_NASDAQ100",
      value = ndx ? "28384.85" : "7580.07";
    const source = {
      id: "tencent_index",
      label: "腾讯财经 · 实际指数参考行情",
      url: "https://gu.qq.com/",
    };
    await route.fulfill({
      json: {
        items: [
          {
            seriesId: id,
            value,
            previousValue: null,
            asOf: "2026-10-30T21:15:59Z",
            asOfKind: "timestamp",
            fetchedAt: "2026-10-31T00:00:00Z",
            unit: "index",
            currency: "USD",
            source,
            status: "delayed",
            isDemo: false,
            qualityFlags: ["index_quote_snapshot"],
          },
        ],
        history: {
          series: {
            id,
            nameZh: ndx ? "纳斯达克100指数" : "标普500指数",
            frequency: "1d",
            timezone: "America/New_York",
            kind: "observation",
          },
          points: [
            { time: "2025-09-15", value: ndx ? "28000" : "7600" },
            { time: "2026-10-29", value: ndx ? "29000" : "7700" },
          ],
          source,
          unit: "index",
          isDemo: false,
          status: "delayed",
          asOf: "2026-10-29",
        },
      },
    });
  });
  await page.goto("/dashboard");
  for (const [id, value] of [
    ["FRED_NASDAQ100", "28384.85"],
    ["FRED_SP500", "7580.07"],
  ]) {
    await page.getByLabel("选择主图指标").selectOption(id);
    await expect(page.getByTestId("chart-latest-point")).toHaveAttribute(
      "data-value",
      value,
    );
    const chart = page.locator(".focus-chart-section .price-chart");
    await page.getByRole("button", { name: "ALL", exact: true }).click();
    const allCount = Number(await chart.getAttribute("data-chart-points"));
    await page.getByRole("button", { name: "1M", exact: true }).click();
    await expect
      .poll(async () => Number(await chart.getAttribute("data-chart-points")))
      .toBeLessThan(allCount);
    await expect(page.getByTestId("focus-price")).toContainText(
      Number(value).toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
    await page.getByRole("button", { name: "刷新数据", exact: true }).click();
    await expect(page.getByTestId("chart-latest-point")).toHaveAttribute(
      "data-value",
      value,
    );
  }
});
test("mobile overview keeps the price, date and navigation accessible without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByTestId("focus-price")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "总览", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(
    page.getByRole("link", { name: "数据源配置", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
});
