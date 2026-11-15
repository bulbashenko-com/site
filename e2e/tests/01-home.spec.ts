import { expect, test } from "@playwright/test"
import { REVISION } from "./env"

test("the site reports the build under test and a working database", async ({ request }) => {
  const response = await request.get("/api/health")
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.ok).toBe(true)
  if (REVISION) expect(body.revision).toBe(REVISION)
})

test("the home page renders without errors", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const response = await page.goto("/")
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/Aleksandr Albekov/)
  await expect(page.getByRole("button", { name: "EN", exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test("an unknown page answers 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist")
  expect(response?.status()).toBe(404)
})
