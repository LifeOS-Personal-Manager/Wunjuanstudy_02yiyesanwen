import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/essays/demo-tadpoles");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("六卡编辑、提示词和排版工作区可用", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "蝌蚪 · 图卡结构" })).toBeVisible();
  await expect(page.getByRole("button", { name: /编辑图卡/ })).toHaveCount(6);
  await page.getByRole("link", { name: /提示词/ }).click();
  await expect(page.getByRole("heading", { name: "提示词清单" })).toBeVisible();
  await page.getByRole("link", { name: /排版/ }).click();
  await expect(page.getByRole("heading", { name: "1080 × 1440 排版台" })).toBeVisible();
});

test("导出页完成发布前检查", async ({ page }) => {
  await page.goto("/essays/demo-tadpoles/export");
  await expect(page.getByText("可以导出")).toBeVisible();
  await expect(page.getByRole("button", { name: /一键导出 ZIP 发布包/ })).toBeEnabled();
});
