// Use the same visible Tools entry as a visitor; never force-click hidden UI.
export async function openTools(page) {
  if (!await page.locator('#world-tools-panel').evaluate(dialog => dialog.open)) {
    await page.click('#world-tools-toggle');
  }
  await page.locator('#world-tools-panel').waitFor({ state: 'visible' });
}

export async function openListening(page) {
  await openTools(page);
  const trail = page.locator('#listening-trail');
  if (!await trail.evaluate(details => details.open)) await trail.locator('summary').click();
}
