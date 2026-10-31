import { test, expect } from "@playwright/test";
test("favorites gate the main chart while related picks can use the full catalog", async ({
  page,
}) => {
  let favorites = ["SGE_AU9999_D1", "FRED_NASDAQ100"];
  const prefs: Record<string, string[]> = {};
  await page.route("**/api/v1/watchlists", (r) =>
    r.fulfill({ json: { items: [{ id: "test", items: favorites }] } }),
  );
  await page.route("**/api/v1/market/related/*", async (r) => {
    const id = r.request().url().split("/").at(-1)!;
    if (r.request().method() === "PUT")
      prefs[id] = r.request().postDataJSON().items;
    await r.fulfill({
      json: {
        seriesId: id,
        items: prefs[id] ?? ["FRED_DGS10"],
        recommended: ["FRED_DGS10"],
        customized: id in prefs,
      },
    });
  });
  await page.goto("/dashboard");
  const select = page.getByLabel("选择主图指标");
  await expect(select.locator("option")).toHaveCount(2);
  await expect(select.locator('option[value="FRED_SP500"]')).toHaveCount(0);
  await page.getByRole("button", { name: "管理关联", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索指标" }).fill("标普500");
  await page.getByLabel("标普500指数").check();
  await page.getByRole("button", { name: "保存关联指标", exact: true }).click();
  await expect(page.locator(".related-markets")).toContainText("标普500");
  await select.selectOption("FRED_NASDAQ100");
  await page.reload();
  await expect(select).toHaveValue("FRED_NASDAQ100");
  await expect(page.locator(".related-markets")).not.toContainText("标普500");
  await select.selectOption("SGE_AU9999_D1");
  await expect(page.locator(".related-markets")).toContainText("标普500");
  await page.getByRole("button", { name: "管理关联", exact: true }).click();
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByRole("button", { name: "保存关联指标", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("尚未添加关联指标", { exact: false }),
  ).toBeVisible();
  favorites = [];
  await page.reload();
  await expect(
    page.getByText("还没有自选指标。", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".focus-chart-section")).toHaveCount(0);
  await page.getByRole("tab", { name: /研究看板/ }).click();
  await expect(
    page.getByRole("button", { name: "添加组件", exact: true }),
  ).toBeVisible();
});
