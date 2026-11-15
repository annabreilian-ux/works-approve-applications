import { expect, type Page } from "@playwright/test";

import { demoPassword } from "./api";

export async function signIn(page: Page, username: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(demoPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(
    page.getByRole("heading", { name: "Applications" }),
  ).toBeVisible();
}

export async function openApplication(
  page: Page,
  applicationNumber: string,
): Promise<void> {
  const row = page.getByRole("row").filter({ hasText: applicationNumber });
  await expect(row).toBeVisible();
  const link = row.getByRole("link", { name: "Open" });
  await link.click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("heading", { name: applicationNumber }),
  ).toBeVisible({ timeout: 20_000 });
}
