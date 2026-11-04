import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { SCENES } from "../src/shared/catalog.ts";

// Every page answers, and everything a page loads is actually served. A
// browser module missing from STATIC makes a page 200 while rendering
// nothing (it shipped once, in SoundGarden), so this follows every import
// from every page's scripts, all the way down.
const baseUrl = inject("baseUrl");
const get = (path: string, init?: RequestInit): Promise<Response> => fetch(new URL(path, baseUrl), init);

const PAGES = [
  "/",
  "/explore",
  "/archive",
  "/about",
  "/readme/",
  ...SCENES.flatMap((s) => s.modes.map((m) => `/scene/${s.id}?mode=${m.id}`)),
  ...SCENES.flatMap((s) => s.shots.map((shot) => `/scene/${s.id}?shot=${shot.id}`)),
];

const NOT_AFFILIATED = "Not affiliated with or endorsed by ANU or LAB ANU";

describe("pages", () => {
  it.each(PAGES)("%s answers 200 with the not-affiliated notice", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain(NOT_AFFILIATED);
  });

  it.each(["/scene/nowhere", "/memory/mem_0000000000000000", "/nothing-here", "/scenes/..%2Fdb.webp", "/scenes/../package.json"])(
    "%s is a 404, not a page or a file off disk",
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(404);
    },
  );

  it("a scene page in an unknown mode is a 404", async () => {
    expect((await get("/scene/chifley-path?mode=midnight")).status).toBe(404);
  });
});

describe("what the pages load", () => {
  // Every script and stylesheet the pages name, and every module those import.
  // The page templates are read too: a memory page only exists once someone
  // has saved one, and its script must load all the same.
  async function crawl(): Promise<Map<string, Response>> {
    const seen = new Map<string, Response>();
    const templates = readFileSync("src/html.ts", "utf8");
    const queue: string[] = [...templates.matchAll(/(?:src|href)="(\/client\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    for (const path of PAGES) {
      const doc = new JSDOM(await (await get(path)).text()).window.document;
      for (const s of doc.querySelectorAll<HTMLScriptElement>("script[src]")) queue.push(s.getAttribute("src")!);
      for (const l of doc.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")) {
        const href = l.getAttribute("href")!;
        if (href.startsWith("/")) queue.push(href);
      }
    }
    while (queue.length) {
      const path = queue.shift()!;
      if (seen.has(path)) continue;
      const res = await get(path);
      seen.set(path, res);
      if (!path.endsWith(".js") || res.status !== 200) continue;
      const source = await res.clone().text();
      for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)) {
        queue.push(new URL(m[1], new URL(path, "http://x")).pathname);
      }
    }
    return seen;
  }

  it("every script, module and stylesheet answers 200 with the right type", async () => {
    const loaded = await crawl();
    const paths = [...loaded.keys()];
    // the two page scripts and the modules beneath them
    expect(paths).toEqual(expect.arrayContaining(["/client/scene.js", "/client/memory.js", "/client/audio.js", "/shared/catalog.js", "/client/style.css"]));
    for (const [path, res] of loaded) {
      expect(res.status, `${path} didn't load`).toBe(200);
      expect(res.headers.get("content-type"), path).toMatch(path.endsWith(".css") ? /text\/css/ : /javascript/);
    }
  });

  it("every scene photo in the catalogue is served as WebP", async () => {
    const images = SCENES.flatMap((s) => s.shots.flatMap((shot) => [shot.image, shot.thumb])).filter((p): p is string => p !== null);
    expect(images.length).toBeGreaterThan(10);
    for (const path of images) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toBe("image/webp");
      // a WebP file starts RIFF....WEBP
      const head = Buffer.from(await res.arrayBuffer()).subarray(0, 12).toString("latin1");
      expect(head.startsWith("RIFF") && head.endsWith("WEBP"), path).toBe(true);
    }
  });

  it("the placeholder scene says it's a placeholder", async () => {
    const lab = SCENES.find((s) => s.evidence === "placeholder")!;
    const text = new JSDOM(await (await get(`/scene/${lab.id}`)).text()).window.document.body.textContent ?? "";
    expect(text).toMatch(/placeholder/i);
  });

  it("modes that are colour grades of a night photo say so on the page", async () => {
    for (const scene of SCENES) {
      for (const mode of scene.modes.filter((m) => m.note)) {
        const html = await (await get(`/scene/${scene.id}?mode=${mode.id}`)).text();
        const text = new JSDOM(html).window.document.body.textContent ?? "";
        expect(text, `${scene.id} ${mode.id}`).toContain(mode.note);
      }
    }
  });
});

describe("joining", () => {
  it("the join form posts without JavaScript, and a bad one comes back with a reason", async () => {
    const doc = new JSDOM(await (await get("/explore")).text()).window.document;
    const form = doc.querySelector<HTMLFormElement>("form[action='/join']");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.querySelector("input[name=nickname]")).not.toBeNull();
    expect(form?.querySelectorAll("input[name=avatar]").length).toBe(2);
    expect(doc.body.textContent).toMatch(/public archive/);

    const res = await get("/join", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "nickname=&avatar=cat",
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("location")).toMatch(/^\/explore\?error=/);
  });

  it("the session cookie is HttpOnly, and `next` can't send people off-site", async () => {
    const res = await get("/join", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ nickname: "Cookie check", avatar: "dog", next: "//evil.example/" }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toMatch(/^soac_session=[^;]+;.*HttpOnly/);
    expect(res.headers.get("location")).toBe("/explore");
  });
});

describe("the API", () => {
  it("lists the scenes and their modes", async () => {
    const scenes = (await (await get("/api/scenes")).json()) as { id: string; modes: { id: string }[] }[];
    expect(scenes.map((s) => s.id)).toEqual(SCENES.map((s) => s.id));
  });

  it("an oversized request body is refused", async () => {
    const res = await get("/join", { method: "POST", body: "x".repeat(10_000) });
    expect(res.status).toBe(413);
  });
});
