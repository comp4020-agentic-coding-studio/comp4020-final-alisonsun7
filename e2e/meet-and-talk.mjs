#!/usr/bin/env node
// Two people in the seaside (ADR 007), through the UI: each sees the other
// standing in the world with their name; when they're close the talk box
// opens; what one says appears over their head for the other, is replaced
// by what they say next, and is gone after 5 s. Sounds stay after a reload
// (nothing to record), and anyone can turn anyone's sound up or down.
//
//   APP_URL=http://localhost:8080 node e2e/meet-and-talk.mjs [shotsDir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.APP_URL ?? "http://localhost:8080";
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const errors = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
};

async function person(name, avatar) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}/explore`);
  await page.click("summary");
  await page.fill("#nickname", name);
  await page.check(`input[name=avatar][value=${avatar}]`);
  await page.click("#join-form button[type=submit]");
  await page.waitForURL("**/explore");
  return page;
}

const a = await person("Ada", "cat");
const b = await person("Bo", "dog");
// different times of day: still one world
await a.goto(`${base}/scene/seaside?mode=morning&shot=beach`);
await b.goto(`${base}/scene/seaside?mode=rainy-dusk&shot=beach`);
await a.waitForSelector("canvas.world-canvas");
await b.waitForSelector("canvas.world-canvas");
// Ada enters with sound, Bo quietly
await a.click('.enter-card [data-sound="on"]');
await b.click('.enter-card [data-sound="off"]');
check((await a.locator("#sound-toggle").getAttribute("aria-pressed")) === "true", "entering with sound turns sound on");
await a.waitForTimeout(1500);

// Bo walks a few steps ahead of Ada, towards the sea
await b.locator("canvas.world-canvas").focus();
await b.keyboard.down("w");
await b.waitForTimeout(900);
await b.keyboard.up("w");

const boOnAda = a.locator(".other-name:not([hidden])", { hasText: "Bo" });
let seen = true;
try {
  await boOnAda.waitFor({ timeout: 4000 });
} catch {
  seen = false;
}
check(seen, "Ada sees Bo standing in the world, with his name");
check(await b.locator(".other-name", { hasText: "Ada" }).count() === 1, "Bo's page has Ada in the world too");

await a.locator(".chat-bar:not([hidden])").waitFor({ timeout: 4000 }).catch(() => undefined);
await b.locator(".chat-bar:not([hidden])").waitFor({ timeout: 4000 }).catch(() => undefined);
check(await a.locator(".chat-bar:not([hidden])").count() === 1 && await b.locator(".chat-bar:not([hidden])").count() === 1, "close together, both get a talk box");

const bubble = a.locator(".said-bubble:not([hidden])");
await b.fill("#chat-input", "Hi Ada, the sea is loud today");
await b.press("#chat-input", "Enter");
await bubble.waitFor({ timeout: 3000 }).catch(() => undefined);
check((await bubble.textContent().catch(() => "")) === "Hi Ada, the sea is loud today", "what Bo says appears over his head for Ada");
check((await b.locator(".chat-mine:not([hidden])").textContent().catch(() => "")) === "You: Hi Ada, the sea is loud today", "Bo sees his own words under the box");
if (out) await a.screenshot({ path: `${out}/talk-ada.jpg`, type: "jpeg", quality: 72 });

await b.waitForTimeout(700);
await b.fill("#chat-input", "Want a coffee?");
await b.press("#chat-input", "Enter");
await a.waitForTimeout(500);
check((await bubble.textContent().catch(() => "")) === "Want a coffee?", "his next words replace the last");
await a.waitForTimeout(5300);
check(await bubble.count() === 0, "and are gone after 5 s");

// Ada clicks the label at the water's edge: its card says what can go
// there; she listens, then adds waves, and hears them playing
await a.locator("#chat-input").blur();
const shore = a.locator('.world-spot[data-anchor="beach/shoreline"]:not([hidden])');
await shore.waitFor({ timeout: 4000 }).catch(() => undefined);
check(((await shore.textContent().catch(() => "")) ?? "").includes("Water's edge · quiet"), "every spot has a label, quiet ones too");
await shore.click().catch(() => undefined);
const card = a.locator(".spot-card:not([hidden])");
await card.waitFor({ timeout: 3000 }).catch(() => undefined);
check((await card.locator("h3").textContent().catch(() => "")) === "Water's edge", "clicking a label opens that spot's card");
check((await card.locator(".card-list li", { hasText: "Waves" }).count()) === 1, "the card lists the sounds that can go there");
await card.locator('[data-focus-key="card-listen:waves"]').click();
await card.locator('[data-focus-key="card-add:waves"]').click();
await a.waitForTimeout(600);
check((await card.locator(".card-list li", { hasText: "chosen by you" }).count()) === 1, "Play here plays it there, chosen by you");
if (out) await a.screenshot({ path: `${out}/card-ada.jpg`, type: "jpeg", quality: 75 });
check(Number(await a.locator("#stage").getAttribute("data-playing")) >= 1, `and Ada hears it playing (${await a.locator("#stage").getAttribute("data-playing")} playing)`);

// Bo sees the label change, opens the same card and turns Ada's waves up
const boShore = b.locator('.world-spot[data-anchor="beach/shoreline"]');
await b.waitForTimeout(500);
check(((await boShore.textContent()) ?? "").includes("Water's edge · Waves"), "Bo's label for the spot now names it: Waves");
// Bo entered quietly: the words under the view offer a real button
await b.locator('#hint [data-focus-key="hint-sound"]').click();
check((await b.locator("#sound-toggle").getAttribute("aria-pressed")) === "true", "\"Turn sound on\" under the view really turns it on");
await b.locator('#shots a[data-shot="beach"]').click();
await b.waitForTimeout(600);
await boShore.click().catch(() => undefined);
const boCard = b.locator(".spot-card:not([hidden])");
await boCard.waitFor({ timeout: 3000 }).catch(() => undefined);
const slider = boCard.locator('input[type="range"]').first();
await slider.fill("100").catch(() => undefined);
await slider.dispatchEvent("change").catch(() => undefined);
await a.waitForTimeout(800);
check((await card.locator('input[type="range"]').first().inputValue().catch(() => "")) === "100", "Bo turns Ada's waves up from the card, and Ada's card shows it");
check(((await card.locator(".card-by").first().textContent()) ?? "").includes("volume set by Bo"), "and says Bo set the volume");

// Bo switches the place to seagulls: one sound per place, anyone may choose it
await boCard.locator('[data-focus-key="card-add:seagulls"]').click();
await a.waitForTimeout(800);
check(((await shore.textContent()) ?? "").includes("Water's edge · Seagulls"), "Bo switches the place to seagulls, and Ada's label follows");
if (out) await a.screenshot({ path: `${out}/card-switched.jpg`, type: "jpeg", quality: 75 });
check(((await card.locator(".card-by").first().textContent()) ?? "").includes("chosen by Bo") && (await card.locator(".card-list li .card-sound", { hasText: "Waves" }).count()) === 1, "Ada's card shows seagulls chosen by Bo, and waves back on offer");
check((await a.locator(".world-spot.has-sounds").count()) >= 1 && (await a.locator(".other-name").count()) === 1, "the only figure with a name is Bo: sounds have no stand-in people");

await b.reload();
await b.waitForSelector("canvas.world-canvas");
await b.click('.enter-card [data-sound="off"]').catch(() => undefined);
check(await b.locator("#mine .sound-row", { hasText: "Seagulls" }).count() >= 1, "after a reload the place's sound (Bo's seagulls) is still there");
check(await b.getByText("Start a 3-minute memory").count() === 0 && await a.getByText("Start a 3-minute memory").count() === 0, "nobody is offered a 3-minute recording");

// Ada turns Bo's seagulls off: anyone may
await card.locator(".remove").first().click().catch(() => undefined);
await a.waitForTimeout(500);
check((await card.locator(".card-list li.empty").count()) === 1, "Turn off on the card quiets the place, whoever chose its sound");

// Someone new comes straight to the world: the arrival card asks their
// name and cat or dog, and they're in, with sound, without a reload.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 840 } });
const c = await ctx.newPage();
c.on("pageerror", (e) => errors.push(`Cy: ${e.message}`));
await c.goto(`${base}/scene/seaside?mode=weekday&shot=beach`);
await c.waitForSelector(".enter-card input[name=nickname]");
check(await c.locator(".enter-card .avatar-choice").count() === 2, "a newcomer is asked for a name and a cat or a dog before entering");
if (out) await c.screenshot({ path: `${out}/arrive.jpg`, type: "jpeg", quality: 75 });
await c.click('.enter-card [data-sound="on"]');
check(await c.locator(".enter-error:not([hidden])").count() === 1, "without a name they're asked for one");
await c.fill(".enter-card input[name=nickname]", "Cy");
await c.check('.enter-card input[value="dog"]', { force: true });
const loads = [];
c.on("framenavigated", (f) => f === c.mainFrame() && loads.push(f.url()));
await c.click('.enter-card [data-sound="on"]');
await c.waitForSelector(".enter-card", { state: "detached", timeout: 5000 }).catch(() => undefined);
check(await c.locator(".enter-card").count() === 0 && loads.length === 0, "a name and Enter with sound take them in, without leaving the page");
check((await c.locator("#sound-toggle").getAttribute("aria-pressed")) === "true", "with sound on");
await c.locator(".person.is-you", { hasText: "Cy" }).waitFor({ timeout: 4000 }).catch(() => undefined);
check(await c.locator(".person.is-you", { hasText: "Cy" }).count() === 1, "they're here as Cy");
check(await c.locator("#chips .chip").count() > 0, "and can add sounds straight away");
check(await c.locator("#ambience").isChecked() && await c.locator("#ambience").isEnabled(), "the background sounds switch is on and works");
await ctx.close();

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
