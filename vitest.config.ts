import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/characterization/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/qa/**/*.test.ts"
    ],
    setupFiles: ["tests/unit/setup.ts"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  }
});
