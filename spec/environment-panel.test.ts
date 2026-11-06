import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { findScene } from "../src/shared/catalog.ts";
import type { Environment } from "../src/shared/environment.ts";
import { EnvironmentPanel, type ApplyEnvironmentResult } from "../src/client/environment-panel.ts";

// The server and e2e suites check real transport and Three.js. This focused
// DOM test holds an actual Apply promise while independent SSE updates arrive.
let dom: JSDOM;
let monotonic: number;
const start = Date.parse("2026-11-06T00:00:00Z");
const iso = (elapsed = 0) => new Date(start + elapsed).toISOString();
const state = (revision = 0): Environment => ({ weather: "clear", minuteOfDay: 840, clockRunning: true, updatedAt: iso(), revision });

beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  monotonic = 0;
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("performance", { now: () => monotonic });
});
afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

function panelWithPendingApply() {
  let acknowledge!: (result: ApplyEnvironmentResult) => void;
  const apply = vi.fn(() => new Promise<ApplyEnvironmentResult>((resolve) => { acknowledge = resolve; }));
  const panel = new EnvironmentPanel({ scene: findScene("seaside")!, apply, goTo: () => {}, open: () => {}, close: () => {} });
  document.body.append(panel.element);
  panel.setEnvironment(state(), iso());
  panel.setAvailability({ joined: true, connected: true });
  panel.element.querySelector<HTMLInputElement>('input[value="rain"]')!.click();
  panel.element.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(apply).toHaveBeenCalledOnce();
  return { panel, acknowledge };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

it("keeps a running clock monotonic when a same-revision Apply acknowledgement arrives after its SSE", async () => {
  const { panel, acknowledge } = panelWithPendingApply();
  const accepted = { ...state(1), weather: "rain" as const };
  panel.setEnvironment(accepted, iso());
  monotonic = 8000;
  acknowledge({ ok: true, environment: accepted, serverNow: iso() });
  await settle();
  expect(panel.element.querySelector("#environment-current")!.textContent).toContain("14:08");
  expect(panel.element.querySelector<HTMLInputElement>('input[value="rain"]')!.checked).toBe(true);
  expect(panel.element.querySelector<HTMLButtonElement>("#environment-apply")!.disabled).toBe(true);
});

it("accepts a fresh same-revision server sample after sleep and still permits an explicit new-revision time change", () => {
  const panel = new EnvironmentPanel({ scene: findScene("seaside")!, apply: async () => ({ ok: false, code: "offline" }), goTo: () => {}, open: () => {}, close: () => {} });
  panel.setEnvironment(state(1), iso());
  monotonic = 10_000;
  // The monotonic timer advanced less than the server while the host slept.
  panel.setEnvironment(state(1), iso(60_000));
  expect(panel.element.querySelector("#environment-current")!.textContent).toContain("15:00");
  panel.setEnvironment({ ...state(2), minuteOfDay: 360, clockRunning: false, updatedAt: iso(60_000) }, iso(60_000));
  expect(panel.element.querySelector("#environment-current")!.textContent).toContain("06:00");
  // A delayed earlier revision can change neither the chosen moment nor label.
  panel.setEnvironment(state(1), iso(80_000));
  expect(panel.element.querySelector("#environment-current")!.textContent).toContain("06:00");
});

it("keeps a newer shared choice when an older successful acknowledgement resolves and explains what happened", async () => {
  const { panel, acknowledge } = panelWithPendingApply();
  panel.setEnvironment({ ...state(1), weather: "rain" }, iso());
  monotonic = 2000;
  panel.setEnvironment({ ...state(2), weather: "mist", minuteOfDay: 360, clockRunning: false, updatedAt: iso(2000) }, iso(2000));
  acknowledge({ ok: true, environment: { ...state(1), weather: "rain" }, serverNow: iso() });
  await settle();
  expect(panel.element.querySelector("#environment-current")!.textContent).toContain("Mist · 06:00");
  expect(panel.element.querySelector<HTMLInputElement>('input[value="mist"]')!.checked).toBe(true);
  expect(panel.element.querySelector("#environment-feedback")!.textContent).toContain("latest settings are shown");
});
