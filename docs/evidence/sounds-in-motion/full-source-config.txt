import { defineConfig } from "vitest/config";

// HTTP specs use the running app found by spec/global-setup.ts. The precise
// hut-expiry boundary also has an isolated local DB and controlled clock.
// Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // Every file writes to the one shared garden; run them one at a time so
    // they don't overwrite each other's squares.
    fileParallelism: false,
  },
});
