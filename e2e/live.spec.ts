import { expect, test, type Page } from "@playwright/test";

// M1's real two-user proof: two independent browser contexts (separate
// cookie jars — two genuine identities, not two tabs sharing one session),
// checking the actual rendered DOM updates without either page reloading.
// spec/live.test.ts covers the same behaviours at the HTTP/stream level and
// adds the access/ordering/lifecycle checks that don't need a browser.

const unique = () => Math.random().toString(36).slice(2);

async function createRoomViaUI(page: Page, title: string, nickname: string): Promise<string> {
  await page.goto("/");
  await page.locator("#title").fill(title);
  await page.locator("#nickname").fill(nickname);
  await page.locator('form[action="/rooms"] button[type="submit"]').click();
  await page.waitForURL(/\/rooms\/[A-Z0-9]{6}$/);
  return new URL(page.url()).pathname.replace("/rooms/", "");
}

async function joinRoomViaUI(page: Page, code: string, nickname: string): Promise<void> {
  await page.goto("/");
  await page.locator("#code").fill(code);
  await page.locator("#join-nickname").fill(nickname);
  await page.locator('form[action="/join"] button[type="submit"]').click();
  await page.waitForURL(`/rooms/${code}`);
}

async function addIdea(page: Page, category: string, title: string): Promise<void> {
  await page.locator("#idea-category").selectOption(category);
  await page.locator("#idea-title").fill(title);
  await page.locator("#idea-submit").click();
  await expect(page.locator("#idea-status")).toHaveText("Saved.");
}

test("two isolated browser contexts: a join and an idea in each direction render live, without either page reloading (LIVE01)", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const code = await createRoomViaUI(pageA, `Live Room ${unique()}`, "Ava");
  await expect(pageA.locator("#live-status")).toHaveText("Live updates: live", { timeout: 3000 });

  await joinRoomViaUI(pageB, code, "Ben");
  // A never reloaded; B's join must still appear in A's participant list.
  await expect(pageA.locator("#participants-list")).toContainText("Ben", { timeout: 2000 });
  await expect(pageA.locator("#participant-count")).toContainText("2 of 12 joined");

  await addIdea(pageA, "EAT", "Live Dumplings");
  await expect(pageB.locator('[data-category="EAT"]')).toContainText("Live Dumplings", { timeout: 2000 });

  // Reverse direction.
  await addIdea(pageB, "DO", "Reverse Bowling");
  await expect(pageA.locator('[data-category="DO"]')).toContainText("Reverse Bowling", { timeout: 2000 });

  await contextA.close();
  await contextB.close();
});

test("a participant who disconnects and reconnects (closing and reopening the room) sees state committed while they were away, without any extra action (LIVE03)", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const code = await createRoomViaUI(pageA, `Reconnect Room ${unique()}`, "Ava");
  await joinRoomViaUI(pageB, code, "Ben");
  await expect(pageA.locator("#participants-list")).toContainText("Ben", { timeout: 2000 });

  // A genuine disconnect: close A's page (and its EventSource with it), not
  // a simulated one. Playwright/Chromium's offline emulation does not
  // reliably sever an already-open EventSource in this environment (tried
  // and observed not to within 5s — see docs/evidence-log.md); closing and
  // reopening the page is the real, deterministic equivalent for this test.
  await pageA.close();

  await addIdea(pageB, "WHERE", "Added while A was away");

  const pageA2 = await contextA.newPage();
  await pageA2.goto(`/rooms/${code}`);
  await expect(pageA2.locator('[data-category="WHERE"]')).toContainText("Added while A was away");

  await contextA.close();
  await contextB.close();
});

test("the live-status indicator never claims Live before the connection actually opens, and reflects a real connection failure and recovery", async ({
  page,
  context,
}) => {
  // Aborts only the live stream's own request, deterministically forcing
  // its first connection attempt to fail (a real network-level failure,
  // not a fabricated status string) — the rest of the page loads normally.
  await context.route("**/rooms/*/events", (route) => route.abort());

  const code = await createRoomViaUI(page, `Status Room ${unique()}`, "Wen");
  await expect(page.locator("#live-status")).toHaveText("Live updates: reconnecting…", { timeout: 3000 });
  await expect(page.locator("#live-status")).not.toHaveText("Live updates: live");

  await context.unroute("**/rooms/*/events");
  // No server-sent retry hint reached the client (the first response never
  // arrived), so this uses the browser's own default reconnect delay.
  await expect(page.locator("#live-status")).toHaveText("Live updates: live", { timeout: 6000 });
  void code;
});

test("a typed draft and focus survive a remote update rendered while the form is in use", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const code = await createRoomViaUI(pageA, `Draft Room ${unique()}`, "Ava");
  await joinRoomViaUI(pageB, code, "Ben");

  await pageA.locator("#idea-title").focus();
  await pageA.locator("#idea-title").fill("Half-typed idea, not yet saved");

  await addIdea(pageB, "DO", "Remote update while A is typing");
  await expect(pageA.locator('[data-category="DO"]')).toContainText("Remote update while A is typing", {
    timeout: 2000,
  });

  // The remote update must only touch #board/#participants-list, never A's
  // own in-progress, unsaved draft or its focus.
  await expect(pageA.locator("#idea-title")).toHaveValue("Half-typed idea, not yet saved");
  await expect(pageA.locator("#idea-title")).toBeFocused();

  await contextA.close();
  await contextB.close();
});

test("the room page explains it starting planning live: a second viewer sees the start button disappear and the stage line update without reload", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const code = await createRoomViaUI(pageA, `Phase Room ${unique()}`, "Ava");
  await joinRoomViaUI(pageB, code, "Ben");

  await expect(pageB.locator("#start-block form button")).toBeVisible();
  await pageB.locator("#start-block form button").click();
  await expect(pageB.locator("#stage-line")).toContainText("Planning (current)");

  // A never clicked Start and never reloaded, but must see the same phase.
  await expect(pageA.locator("#stage-line")).toContainText("Planning (current)", { timeout: 2000 });
  await expect(pageA.locator("#start-block form")).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});
