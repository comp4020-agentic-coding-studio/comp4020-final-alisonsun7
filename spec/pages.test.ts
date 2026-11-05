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
  "/about",
  "/readme/",
  ...SCENES.flatMap((s) => s.modes.map((m) => `/scene/${s.id}?mode=${m.id}`)),
  ...SCENES.flatMap((s) => s.zones.map((z) => `/scene/${s.id}?zone=${z.id}`)),
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
    expect((await get("/scene/seaside?mode=midnight")).status).toBe(404);
  });
});

describe("what the pages load", () => {
  // Every script and stylesheet the pages name, and every module those import.
  // The page templates are read too: a memory page only exists once someone
  // has saved one, and its script must load all the same.
  async function crawl(): Promise<Map<string, Response>> {
    const seen = new Map<string, Response>();
    // bare imports ("three") resolve through the page's import map, as in a
    // browser; one the map doesn't name is left as is and fails to load
    const imports: Record<string, string> = {};
    const templates = readFileSync("src/html.ts", "utf8");
    const queue: string[] = [...templates.matchAll(/(?:src|href)="(\/client\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
    for (const path of PAGES) {
      const doc = new JSDOM(await (await get(path)).text()).window.document;
      for (const s of doc.querySelectorAll<HTMLScriptElement>("script[src]")) queue.push(s.getAttribute("src")!);
      for (const m of doc.querySelectorAll<HTMLScriptElement>('script[type="importmap"]')) Object.assign(imports, JSON.parse(m.textContent ?? "{}").imports);
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
        const bare = !/^[./]/.test(m[1]);
        // an exact key, or the longest "prefix/" key, as import maps resolve
        const prefix = Object.keys(imports)
          .filter((k) => k.endsWith("/") && m[1].startsWith(k))
          .sort((x, y) => y.length - x.length)[0];
        const mapped = imports[m[1]] ?? (prefix ? imports[prefix] + m[1].slice(prefix.length) : undefined);
        queue.push(bare && mapped ? mapped : new URL(m[1], new URL(path, "http://x")).pathname);
      }
    }
    return seen;
  }

  it("every script, module and stylesheet answers 200 with the right type", async () => {
    const loaded = await crawl();
    const paths = [...loaded.keys()];
    // the two page scripts and the modules beneath them
    expect(paths).toEqual(
      expect.arrayContaining(["/client/scene.js", "/client/world.js", "/client/cafe.js", "/vendor/three.module.min.js", "/vendor/addons/loaders/GLTFLoader.js", "/shared/catalog.js", "/client/style.css"]),
    );
    for (const [path, res] of loaded) {
      expect(res.status, `${path} didn't load`).toBe(200);
      expect(res.headers.get("content-type"), path).toMatch(path.endsWith(".css") ? /text\/css/ : /javascript/);
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
    // it says who sees your name
    expect(doc.body.textContent).toMatch(/shown to people you meet/);

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
