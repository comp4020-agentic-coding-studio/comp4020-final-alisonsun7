import { defineConfig } from "@playwright/test";

// A manual, local-only verification layer for the things spec/*.test.ts
// genuinely cannot check (CSS layout, keyboard focus, prefers-reduced-motion,
// real browser network-failure UI) — see spec/README.md's allowance for a
// "separate e2e invocation". Not wired into CI: see docs/evidence-log.md for
// why and what that means.
export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:8080",
  },
});
