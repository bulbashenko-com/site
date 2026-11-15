import { expect, test, type Page } from "@playwright/test"

// The section buttons exist twice (desktop sidebar and mobile menu); only the visible one counts.
const homeButton = (page: Page, label: string) =>
  page.getByRole("button", { name: label, exact: true }).filter({ visible: true }).first()

test("the language switch changes the interface and is remembered", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "RU", exact: true }).click()
  await expect(homeButton(page, "ГЛАВНАЯ")).toBeVisible()
  await page.reload()
  await expect(homeButton(page, "ГЛАВНАЯ")).toBeVisible()
  await page.getByRole("button", { name: "SK", exact: true }).click()
  await expect(homeButton(page, "DOMOV")).toBeVisible()
  await page.getByRole("button", { name: "EN", exact: true }).click()
  await expect(homeButton(page, "HOME")).toBeVisible()
})
