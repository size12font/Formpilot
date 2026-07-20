#!/usr/bin/env node

import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const extensionPath = resolve("dist/chrome-mv3");
const outputPath = resolve("docs/images");
const userDataDir = await mkdtemp(resolve(tmpdir(), "formpilot-readme-"));

await mkdir(outputPath, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1360, height: 900 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ]
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;

  const demo = await context.newPage();
  await demo.goto("http://127.0.0.1:8765/fixtures/demo/contact.html");
  const tabId = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("Demo tab unavailable.");
    return tab.id;
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await popup.getByRole("button", { name: "Fill this form" }).click();
  await popup.locator("p").filter({ hasText: "Preview ready." }).waitFor();
  await popup.close();
  await demo.locator("[data-formpilot-overlay='true']").waitFor({ state: "attached" });
  await demo.waitForTimeout(500);
  await demo.screenshot({ path: resolve(outputPath, "formpilot-preview.png") });

  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 900 });
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Given name").waitFor();
  await options.screenshot({ path: resolve(outputPath, "formpilot-profile.png"), fullPage: true });
} finally {
  await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}
