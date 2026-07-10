import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["scripts/live-dom-qa.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 30_000,
    reporters: ["verbose"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
