import { defineConfig, devices } from "@playwright/test"
import { DOMAIN, EDGE, SITE } from "./tests/env"

// Smoke suite of the site against staging (bulbashenko-com/infra apps/staging/site/e2e): the pages load, languages
// switch, an admin signs in through the SSO, media is served. Runs inside the cluster, so *.DOMAIN is mapped to
// Traefik's in-cluster address.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // The sign-in waits for a fresh TOTP window (up to 31 s), possibly twice.
  timeout: 120_000,
  reporter: "list",
  outputDir: process.env.E2E_OUTPUT_DIR || "test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: SITE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [`--host-resolver-rules=MAP *.${DOMAIN} ${EDGE}, MAP ${DOMAIN} ${EDGE}`],
    },
  },
})
