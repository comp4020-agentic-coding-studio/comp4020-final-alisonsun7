import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

const base = inject("baseUrl");

it("serves the four public README references and manifest through their canonical GET routes", async () => {
  const response = await fetch(new URL("/readme/", base));
  expect(response.status).toBe(200);
  const doc = new JSDOM(await response.text()).window.document;
  const noteLinks = Array.from(doc.querySelectorAll<HTMLAnchorElement>('main a[href^="/project-notes/"]'), a => a.getAttribute("href")!);
  expect(new Set(noteLinks)).toEqual(new Set([
    "/project-notes/chorus-audio", "/project-notes/promise-evidence-map", "/project-notes/human-playtest", "/project-notes/little-chorus",
  ]));
  for (const href of noteLinks) {
    const note = await fetch(new URL(href, base));
    expect(note.status, href).toBe(200);
    expect(note.headers.get("content-type")).toContain("text/html");
    const page = new JSDOM(await note.text()).window.document;
    expect(page.querySelector("main h1")).not.toBeNull();
    expect(page.querySelector('main a[href="/readme/"]')).not.toBeNull();
  }
  const manifest = await fetch(new URL("/assets-manifest.json", base));
  expect(manifest.status).toBe(200);
  expect(manifest.headers.get("content-type")).toContain("application/json");
  expect(await manifest.json()).toBeTypeOf("object");
});

it("does not turn supporting-note publication into a general file server", async () => {
  for (const path of [
    "/project-notes/constructor", "/project-notes/author-editing-notes", "/project-notes/process",
    "/project-notes/%2e%2e%2fmise.local.toml", "/project-notes/human-playtest/extra", "/docs/submission/human-playtest.md",
  ]) {
    expect((await fetch(new URL(path, base))).status, path).toBe(404);
  }
});
