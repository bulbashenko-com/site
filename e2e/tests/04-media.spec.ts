import { expect, test } from "@playwright/test"

test("gallery images are served", async ({ request }) => {
  const response = await request.get("/api/gallery")
  expect(response.status()).toBe(200)
  const gallery: { src: string }[] = await response.json()
  test.skip(gallery.length === 0, "no gallery images in staging's content")
  const image = await request.get(gallery[0].src)
  expect(image.status()).toBe(200)
  expect(image.headers()["content-type"]).toMatch(/^image\//)
})
