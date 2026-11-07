import { expect, inject, it } from "vitest";
import { JSDOM } from "jsdom";
const base = inject("baseUrl");
it("keeps a public work invitation through the native entry form without adopting another identity", async () => {
  const response=await fetch(new URL("/planet?work=snd-example_123",base));
  expect(response.status).toBe(200);
  const doc=new JSDOM(await response.text()).window.document;
  expect(doc.querySelector<HTMLInputElement>('#planet-join-form input[name="next"]')?.value).toBe("/planet?work=snd-example_123");
  const boot=JSON.parse(doc.querySelector("#planet-boot")!.textContent!);
  expect(boot.joined).toBe(false);expect(boot.snapshot.you).toBeNull();
  const bad=await fetch(new URL("/planet?work=other%26identity%3Dadopt",base));
  const rejected=new JSDOM(await bad.text()).window.document;
  expect(rejected.querySelector<HTMLInputElement>('#planet-join-form input[name="next"]')?.value).toBe("/planet");
});
