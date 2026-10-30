import { expect, test } from "@playwright/test";

test("favorites turn yellow after saving, persist across pages and can be cancelled", async ({
  page,
}) => {
  let items: string[] = [];
  let fail = false;
  await page.route("**/api/v1/watchlists**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      return route.fulfill({
        json: { items: [{ id: "favorites", name: "我的观察列表", items }] },
      });
    }
    if (fail)
      return route.fulfill({
        status: 500,
        json: { error: { message: "保存失败" } },
      });
    if (request.method() === "POST")
      items.push(request.postDataJSON().seriesId);
    if (request.method() === "DELETE") items = [];
    return route.fulfill({
      json: { id: "favorites", name: "我的观察列表", items },
    });
  });
  await page.goto("/indicators");
  const favorite = page.getByRole("button", {
    name: "收藏 美国10年期实际收益率",
    exact: true,
  });
  await expect(favorite).toBeEnabled();
  await expect(favorite).toHaveAttribute("aria-pressed", "false");
  await favorite.click();
  const saved = page.getByRole("button", {
    name: "取消收藏 美国10年期实际收益率",
    exact: true,
  });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await expect(saved.locator("svg")).toHaveCSS("fill", "rgb(234, 179, 8)");
  await page.goto("/indicators/FRED_DFII10");
  const cancel = page.getByRole("button", { name: "取消自选", exact: true });
  await expect(cancel).toBeEnabled();
  await expect(cancel).toHaveAttribute("aria-pressed", "true");
  fail = true;
  await cancel.click();
  await expect(page.getByText("保存失败", { exact: true })).toBeVisible();
  await expect(cancel).toHaveAttribute("aria-pressed", "true");
  fail = false;
  await cancel.click();
  await expect(
    page.getByRole("button", { name: "加入自选", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("已取消自选", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "加入自选", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
