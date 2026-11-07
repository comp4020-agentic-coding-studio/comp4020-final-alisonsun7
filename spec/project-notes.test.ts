import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderProjectNote, renderReadme } from "../src/html.ts";

const document = (html: string) => new JSDOM(html).window.document;
const notes = ["chorus-audio", "promise-evidence-map", "human-playtest", "little-chorus"];

describe("readable submission entry without changing the author's Markdown", () => {
  it("keeps the author draft warning while making entry and four cited notes work on the current origin", () => {
    const doc = document(renderReadme());
    const links = Array.from(doc.querySelectorAll("main a"), a => a.getAttribute("href"));
    expect(doc.querySelector("main")?.textContent).toContain("Author review draft");
    expect(links).toContain("/planet");
    expect(links.some(href => href?.includes("localhost"))).toBe(false);
    for (const slug of notes) expect(links).toContain("/project-notes/" + slug);
    expect(links).toContain("/assets-manifest.json");
    expect(links).toContain("https://www.robinsloan.com/notes/home-cooked-app/");
  });

  it.each(notes)("renders the actual public %s note with a return route and resolved references", slug => {
    const html = renderProjectNote(slug);
    expect(html).not.toBeNull();
    const doc = document(html!);
    expect(doc.querySelector("main h1")?.textContent?.length).toBeGreaterThan(5);
    expect(doc.querySelector('main a[href="/readme/"]')).not.toBeNull();
    for (const a of doc.querySelectorAll("main a")) {
      expect(a.getAttribute("href")).toMatch(/^(?:\/|#|https?:\/\/|mailto:)/);
    }
  });

  it("resolves references between notes locally and keeps uncopied evidence on the public repository", () => {
    const protocol = document(renderProjectNote("human-playtest")!);
    expect(protocol.querySelector('a[href="/project-notes/chorus-audio"]')).not.toBeNull();
    const map = document(renderProjectNote("promise-evidence-map")!);
    expect(map.querySelector('a[href="/project-notes/human-playtest"]')).not.toBeNull();
    expect(map.querySelector('a[href="https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/blob/main/spec/chorus-state.test.ts"]')).not.toBeNull();
  });

  it("rejects unlisted files, traversal and prototype names before any note read", () => {
    for (const slug of ["constructor", "__proto__", "../../mise.local.toml", "PROCESS.md", "../README.md", "author-editing-notes", "chorus-audio.md"]) {
      expect(renderProjectNote(slug)).toBeNull();
    }
  });
});
