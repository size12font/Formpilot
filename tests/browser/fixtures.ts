import { test as base, chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  openTarget: (path: string) => Promise<{ page: Page; tabId: number }>;
}>({
  context: async ({}, use) => {
    const extensionPath = resolve("dist/chrome-mv3");
    const userDataDir = await mkdtemp(resolve(tmpdir(), "formpilot-qa-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  },
  extensionId: async ({ context }, use) => {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
  openTarget: async ({ context }, use) => {
    await use(async (path: string) => {
      const page = await context.newPage();
      await page.goto(path);
      const workers = context.serviceWorkers();
      let worker = workers[0];
      if (!worker) worker = await context.waitForEvent("serviceworker");
      const tabId = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("target tab unavailable");
        return tab.id;
      });
      return { page, tabId };
    });
  }
});

export { expect };
