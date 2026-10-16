import { expect, test } from "@playwright/test";
test("demo dashboard is honest, usable and persists a widget", async ({
  page,
  request,
}) => {
  const macroResponse = page.waitForResponse((response) =>
    response.url().includes("/FRED_DFII10/observations"),
  );
  await page.goto("/dashboard");
  expect((await macroResponse).ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "黄金研究看板" }),
  ).toBeVisible();
  await expect(
    page.getByText("当前为独立演示数据", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加组件" }).click();
  await page.getByRole("button", { name: "指标行情卡", exact: false }).click();
  await page.getByRole("button", { name: "添加到看板" }).click();
  await page.getByRole("button", { name: "保存布局", exact: true }).click();
  await expect(page.getByText("看板布局已保存")).toBeVisible();
  await page.reload();
  const response = await request.get("/api/v1/dashboards");
  const { items } = await response.json();
  expect(
    items[0].widgets.some((w: { type: string }) => w.type === "metric-card"),
  ).toBeTruthy();
  await page.getByRole("button", { name: "编辑布局" }).click();
  await expect(
    page.getByRole("button", { name: "删除组件 metric-card" }).last(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "删除组件 metric-card" })
    .last()
    .click();
  await page.getByRole("button", { name: "保存布局", exact: true }).click();
  await expect(page.getByText("看板布局已保存")).toBeVisible();
});
test("catalog search, watchlist addition and alerts CRUD", async ({ page }) => {
  await page.goto("/indicators");
  await page.getByRole("textbox", { name: "搜索指标目录" }).fill("DFII10");
  await expect(
    page
      .getByRole("link", { name: "美国10年期实际收益率", exact: false })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "收藏 美国10年期实际收益率" }).click();
  await expect(page.getByText("已加入观察列表")).toBeVisible();
  await page.goto("/alerts");
  await page.getByRole("button", { name: "新建预警" }).click();
  await page.getByRole("button", { name: "保存预警规则" }).click();
  await expect(page.getByText("预警规则已创建")).toBeVisible();
  const toggle = page.getByRole("switch").last();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: /删除 .* 预警/ })
    .last()
    .click();
  await expect(page.getByText("规则已删除")).toBeVisible();
});
test("provider center renders actual diagnostics and secret-free export", async ({
  page,
}) => {
  await page.goto("/settings/data-sources");
  await expect(
    page.getByRole("heading", { name: "数据源配置", exact: true }),
  ).toBeVisible();
  const fred = page
    .locator(".provider-card")
    .filter({ has: page.getByRole("heading", { name: "FRED", exact: true }) });
  await fred.getByRole("button", { name: "配置连接" }).click();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(page.locator(".test-result")).toContainText("FRED_API_KEY");
  await expect(page.getByRole("dialog")).toContainText("待配置");
  await page.getByRole("button", { name: "关闭对话框" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出配置" }).click();
  expect((await download).suggestedFilename()).toBe("atlas-providers.json");
});
test("mobile layout keeps navigation and dashboard usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "黄金研究看板" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("link", { name: "数据源配置", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "数据源配置", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
});

test("research notes persist and official CSV preview stays separate from live tables", async ({
  page,
}) => {
  await page.goto("/research");
  await page.getByRole("button", { name: "新建笔记" }).click();
  await page.getByLabel("标题", { exact: true }).fill("E2E 研究证据");
  await page
    .getByLabel("研究内容（Markdown）")
    .fill("## 待验证\n黄金与实际利率");
  await page.getByRole("button", { name: "保存笔记" }).click();
  await expect(page.getByText("研究笔记已保存")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "E2E 研究证据" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除研究笔记" }).click();
  await expect(page.getByText("笔记已删除")).toBeVisible();
  await page.getByRole("button", { name: "导入数据" }).click();
  await page
    .getByRole("combobox", { name: /^目标指标/ })
    .selectOption("WGC_ETF_FLOW_GLOBAL_M");
  await page.getByLabel("统计期结束日期").fill("2026-09-30");
  await page
    .getByLabel("原始来源链接")
    .fill("https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows");
  await page.getByLabel("数据文件").setInputFiles({
    name: "e2e-data.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("date,value\n2026-09-30,10\n"),
  });
  await page.getByRole("button", { name: "解析并预览" }).click();
  await expect(page.getByText("预览已生成，请核对后确认")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "确认导入数据库" }).click();
  await expect(page.getByText("Demo 只能预览，不能写入正式数据")).toBeVisible();
});
test("price-only historical risk statistics are visible and labeled demo", async ({
  page,
}) => {
  await page.goto("/indicators/SGE_AU9999_D1");
  await expect(
    page.getByRole("heading", { name: "历史风险观察" }),
  ).toBeVisible();
  await expect(page.getByText("历史最大回撤", { exact: true })).toBeVisible();
  await expect(page.getByText("相邻观察点收益分布")).toBeVisible();
});
