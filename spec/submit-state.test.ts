import { expect, it } from "vitest";
import { fail, startSubmit, succeed, type SubmitState } from "../src/client/submit-state.ts";

// This is the exact module the browser runs (src/client/room.ts imports it
// unmodified); testing it here covers the retry-preserves-draft logic without
// needing a browser.
it("a retry of the identical failed draft reuses its request key", () => {
  let keys = 0;
  const newKey = () => `key-${++keys}`;

  const idle: SubmitState = { status: "idle" };
  const first = startSubmit(idle, { category: "WHERE", title: "Zoo" }, newKey);
  expect(first).toMatchObject({ status: "saving", requestKey: "key-1" });

  const failed = fail(first, "Could not reach the server.");
  expect(failed).toMatchObject({ status: "error", requestKey: "key-1", draft: { title: "Zoo" } });

  const retry = startSubmit(failed, { category: "WHERE", title: "Zoo" }, newKey);
  expect(retry).toMatchObject({ status: "saving", requestKey: "key-1" });
});

it("editing the draft after a failure counts as a new intention and mints a new key", () => {
  let keys = 0;
  const newKey = () => `key-${++keys}`;

  const first = startSubmit({ status: "idle" }, { category: "WHERE", title: "Zoo" }, newKey);
  const failed = fail(first, "network error");
  const edited = startSubmit(failed, { category: "WHERE", title: "Zoo, but later" }, newKey);
  expect(edited).toMatchObject({ status: "saving", requestKey: "key-2" });
});

it("a successful save resets state so the next submission gets a fresh key", () => {
  let keys = 0;
  const newKey = () => `key-${++keys}`;

  const first = startSubmit({ status: "idle" }, { category: "DO", title: "Bowling" }, newKey);
  const saved = succeed();
  expect(saved).toEqual({ status: "saved" });

  const next = startSubmit(saved, { category: "EAT", title: "BBQ" }, newKey);
  expect(next).toMatchObject({ status: "saving", requestKey: "key-2" });
  void first;
});

it("fail() refuses to run outside an in-flight save", () => {
  expect(() => fail({ status: "idle" }, "x")).toThrow();
});
