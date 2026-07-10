import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "qa-results/browser-fixtures.json" }]],
  webServer: [
    {
      command: "node scripts/serve-fixtures.mjs --host=127.0.0.1 --port=8765",
      url: "http://127.0.0.1:8765/",
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      command: "node scripts/serve-fixtures.mjs --host=localhost --port=8766",
      url: "http://localhost:8766/",
      reuseExistingServer: true,
      timeout: 30_000
    }
  ]
});
