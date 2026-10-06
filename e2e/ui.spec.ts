import { expect, test, type Page } from "@playwright/test";

// A real browser is the only way to check CSS layout, keyboard focus order,
// prefers-reduced-motion, and the client script's behaviour on a genuinely
// failed network request — none of that is reachable from spec/*.test.ts
// (HTTP assertions) or a pure unit test of the state machine alone.

const unique = () => Math.random().toString(36).slice(2);

async function createRoomViaUI(page: Page, title: string, nickname: string): Promise<string> {
  await page.goto("/");
  await page.locator("#title").fill(title);
  await page.locator("#nickname").fill(nickname);
  await page.locator('form[action="/rooms"] button[type="submit"]').click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]{6}$/);
  return new URL(page.url()).pathname.replace("/rooms/", "");
}

const VIEWPORTS = [
  { width: 1920, height: 1080, name: "1920x1080" },
  { width: 390, height: 844, name: "390x844" },
];

for (const viewport of VIEWPORTS) {
  test(`no horizontal overflow or clipped controls at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const homeOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(homeOverflows).toBe(false);

    const code = await createRoomViaUI(page, `Viewport Room ${unique()}`, "Wen");
    const roomOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(roomOverflows).toBe(false);

    // The idea form's controls must stay inside the viewport, not clipped.
    const box = await page.locator("#idea-title").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    void code;
  });
}

test("resizing the viewport with an unsaved draft does not clear it", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await createRoomViaUI(page, `Resize Room ${unique()}`, "Wen");

  await page.locator("#idea-title").fill("A half-typed idea");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#idea-title")).toHaveValue("A half-typed idea");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator("#idea-title")).toHaveValue("A half-typed idea");
});

test("the create-room form is fully keyboard operable, in tab order, Enter submits", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator("#title")).toBeFocused();
  await page.keyboard.type("Keyboard Room");
  await page.keyboard.press("Tab");
  await expect(page.locator("#nickname")).toBeFocused();
  await page.keyboard.type("KeyboardWen");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/rooms\/[A-Z0-9]{6}$/);
  await expect(page.locator("h1")).toHaveText("Keyboard Room");
});

test("a visible focus ring actually renders on the focused control (not browser-default-suppressed)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#title").focus();
  const outline = await page.locator("#title").evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("the responsibility card reveals within 800ms and respects reduced motion", async ({ page }) => {
  const code = await createRoomViaUI(page, `Card Room ${unique()}`, "Wen");
  const duration = await page.locator(".role-card").evaluate((el) => getComputedStyle(el).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.8);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/rooms/${code}`);
  const reducedDuration = await page
    .locator(".role-card")
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(reducedDuration).toBe("none");
});

test("the card reveal never blocks submitting an idea", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await createRoomViaUI(page, `No Gate Room ${unique()}`, "Wen");
  // No artificial wait for the reveal animation — submitting immediately
  // must work regardless of whether the CSS animation has finished.
  await page.locator("#idea-title").fill("Immediate idea");
  await page.locator("#idea-submit").click();
  await expect(page.locator("#idea-status")).toHaveText("Saved.", { timeout: 3000 });
});

test("a failed submission shows an error and keeps the typed draft, never a false Saved", async ({ page }) => {
  const code = await createRoomViaUI(page, `Failure Room ${unique()}`, "Wen");

  await page.route(`**/rooms/${code}/proposals`, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );

  await page.locator("#idea-category").selectOption("EAT");
  await page.locator("#idea-title").fill("Should not be lost");
  await page.locator("#idea-submit").click();

  await expect(page.locator("#idea-status")).toContainText("try again", { timeout: 3000 });
  await expect(page.locator("#idea-title")).toHaveValue("Should not be lost");
  await expect(page.locator("#idea-submit")).toBeEnabled();
  await expect(page.locator("#idea-status")).not.toHaveText("Saved.");

  // Clearing the simulated failure and retrying (same draft -> same request
  // key under the hood) must succeed without creating a duplicate.
  await page.unroute(`**/rooms/${code}/proposals`);
  await page.locator("#idea-submit").click();
  await expect(page.locator("#idea-status")).toHaveText("Saved.", { timeout: 3000 });

  await page.reload();
  const occurrences = (await page.locator("#board").innerText()).split("Should not be lost").length - 1;
  expect(occurrences).toBe(1);
});
