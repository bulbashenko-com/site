import { expect, test } from "@playwright/test"

test("media from Nextcloud is served", async ({ request }) => {
  const response = await request.get("/api/media")
  expect(response.status()).toBe(200)
  const media: { url: string; kind: string }[] = await response.json()
  test.skip(media.length === 0, "no media in this environment (staging has no Nextcloud)")
  const file = await request.get(media[0].url, { headers: { Range: "bytes=0-99" } })
  expect(file.status()).toBe(206)
  expect(file.headers()["content-range"]).toMatch(/^bytes 0-99\//)
})
