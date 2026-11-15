import { expect, test } from "@playwright/test"
import { AUTH } from "./env"
import { createPerson, deletePerson, signIn, type Person } from "./sso"

let person: Person | undefined

test.afterEach(async () => {
  if (person) await deletePerson(person)
  person = undefined
})

test("an admin signs in through the SSO and reaches the dashboard", async ({ page }) => {
  person = await createPerson(page, ["site-admins"])
  await page.goto("/admin")
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.getByRole("link", { name: /SIGN IN WITH/ }).click()
  await expect(page).toHaveURL(new RegExp(`^${AUTH}/login`))
  await signIn(page, person)
  await page.waitForURL((url) => url.pathname === "/admin")
  await expect(page.getByRole("button", { name: "LOGOUT" })).toBeVisible()
})

test("someone outside site-admins is refused", async ({ page }) => {
  person = await createPerson(page, [])
  await page.goto("/admin/login")
  await page.getByRole("link", { name: /SIGN IN WITH/ }).click()
  await signIn(page, person)
  await page.waitForURL((url) => url.pathname === "/admin/login")
  await expect(page.getByText("THIS ACCOUNT HAS NO ACCESS TO THE ADMIN PANEL.")).toBeVisible()
})
