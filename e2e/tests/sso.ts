// Test accounts in the staging SSO (Ory Kratos and Keto admin APIs, reachable only from the auth-staging namespace).
// Same steps as bulbashenko-com/auth e2e/tests/helpers.ts: a person with a password, enrolled TOTP, given groups.
import { randomBytes } from "node:crypto"
import { expect, type Page } from "@playwright/test"
import { authenticator } from "otplib"
import { AUTH, DOMAIN, KETO_WRITE, KRATOS_ADMIN } from "./env"

export interface Person {
  id: string
  username: string
  password: string
  totpSecret: string
}

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

/** Waits for the next 30-second window, so a code is never reused (Kratos rejects replays). */
async function freshTotp(secret: string) {
  await new Promise((r) => setTimeout(r, (authenticator.timeRemaining() + 1) * 1000))
  return authenticator.generate(secret)
}

async function passwordStep(page: Page, person: Pick<Person, "username" | "password">) {
  await page.getByLabel(/Имя пользователя|Username/).fill(person.username)
  await page.getByLabel(/^Пароль$|^Password$/).fill(person.password)
  await page.getByRole("button", { name: /\[ ВОЙТИ \]|\[ SIGN IN \]/ }).click()
}

/** A person in `groups` with password and TOTP; the browser ends signed out of the SSO. */
export async function createPerson(page: Page, groups: string[]): Promise<Person> {
  const username = `site-e2e-${Date.now().toString(36)}${randomBytes(2).toString("hex")}`
  const email = `${username}@${DOMAIN}`
  const password = `Pw-${randomBytes(12).toString("hex")}`
  const identity = await call(`${KRATOS_ADMIN}/admin/identities`, "POST", {
    schema_id: "person",
    traits: { username, email, name: `Site e2e ${username}` },
    verifiable_addresses: [{ value: email, via: "email", verified: true, status: "completed" }],
    recovery_addresses: [{ value: email, via: "email" }],
    credentials: { password: { config: { password } } },
  })
  for (const group of groups) {
    await call(`${KETO_WRITE}/admin/relation-tuples`, "PUT", {
      namespace: "Group",
      object: group,
      relation: "members",
      subject_set: { namespace: "User", object: identity.id, relation: "" },
    })
  }
  await page.goto(`${AUTH}/login`)
  await passwordStep(page, { username, password })
  await page.goto(`${AUTH}/settings`)
  const totpSecret = (await page.locator("code.secret").first().innerText()).trim()
  await page.locator("#f-totp_code").fill(authenticator.generate(totpSecret))
  await page.locator("form:has(#f-totp_code) button[type=submit][name=method]").click()
  await expect(page.locator(".msg.success, .msg.info").first()).toBeVisible()
  await page.context().clearCookies()
  return { id: identity.id, username, password, totpSecret }
}

/** Password, then TOTP, on the SSO login page the browser is on. */
export async function signIn(page: Page, person: Person) {
  await passwordStep(page, person)
  await expect(page.locator(".otp")).toBeVisible()
  await page.locator(".otp input").fill(await freshTotp(person.totpSecret))
}

/** Removes the test account (its sessions go with it). */
export async function deletePerson(person: Person) {
  await fetch(`${KRATOS_ADMIN}/admin/identities/${person.id}`, { method: "DELETE" })
}
