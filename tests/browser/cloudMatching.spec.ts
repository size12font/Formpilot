import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import { createMatchingBroker } from "../../server/matchingBroker";
import { test, expect } from "./fixtures";

const profile = {
  version: 1,
  identity: { givenName: "Avery", familyName: "Example" },
  contact: { emails: [{ label: "personal", value: "avery@example.test" }, { label: "work", value: "avery@office.test" }], phones: [] },
  addresses: [
    { label: "home", street: "12 Sample Road", city: "Boston", postalCode: "02108", country: "US" },
    { label: "billing", street: "34 Invoice Avenue", city: "Chicago", postalCode: "60601", country: "US" }
  ],
  documents: { taxId: "111-22-3333" }, custom: []
};
const token = "test_" + "x".repeat(48);
let broker: ReturnType<typeof createMatchingBroker> | undefined;
let providerCalls: Array<Record<string, unknown>> = [];
let beforeReply: (() => Promise<void>) | undefined;

test.beforeEach(async ({ context, extensionId }) => {
  providerCalls = []; beforeReply = undefined;
  broker = createMatchingBroker({
    providerKey: "mock-provider-key", tokens: [token], extensionOrigins: [`chrome-extension://${extensionId}`],
    fetcher: async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      providerCalls.push(body);
      await beforeReply?.();
      const answers = Object.fromEntries(Object.entries(body.questions).map(([id, question]) => {
        const criteria = (question as { criteria: Record<string, string> }).criteria;
        const state = body.state[id];
        const role = state.label.includes("email") ? "work email" : state.label.includes("postcode") ? "billing postal code" : "NO_MATCH";
        const choice = Object.keys(criteria).find((key) => criteria[key] === role) ?? "NO_MATCH";
        return [id, { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(criteria).map((key) => [key, key === choice ? 1 : 0])) }];
      }));
      return new Response(JSON.stringify({ answers }));
    }
  });
  await new Promise<void>((resolve) => broker!.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(broker.address() as AddressInfo).port}/match`;
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(async ({ profile, url, token }) => {
    await chrome.storage.local.set({ profile, "settings:v1": { encryptionEnabled: false, simulateTyping: false, cloudMatchingEnabled: true } });
    await chrome.storage.session.set({ cloudBrokerSession: { url, token } });
  }, { profile, url, token });
});
test.afterEach(async () => {
  if (broker) {
    broker.closeAllConnections();
    await new Promise<void>((resolve) => broker!.close(() => resolve()));
  }
});

async function openPreview(page: Page, extensionId: string, tabId: number) {
  const popup = await page.context().newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await popup.getByRole("button", { name: "Fill this form" }).click();
  return popup;
}

test("previews assisted values, fills them locally, and never submits", async ({ context, openTarget, extensionId }, testInfo) => {
  const { page, tabId } = await openTarget("http://127.0.0.1:8765/fixtures/regressions/cloud-matching.html");
  const popup = await openPreview(page, extensionId, tabId);
  await expect(popup.locator("p")).toHaveText("Preview ready.");
  await expect(page.locator("#work")).toHaveValue("");
  await expect(page.locator("#billing")).toHaveValue("");
  const preview = await context.serviceWorkers()[0]!.evaluate(async () => {
    const data = await chrome.storage.session.get(null);
    const request = Object.values(data).find((v) => v?.matchingContext && v?.plan);
    return request.plan.entries.map((entry: { label: string; value: string; status: string }) => ({ label: entry.label, value: entry.value, status: entry.status }));
  });
  expect(preview).toContainEqual(expect.objectContaining({ label: "Work email", value: "avery@office.test", status: "ready" }));
  expect(preview).toContainEqual(expect.objectContaining({ label: "ZIP / postcode", value: "60601", status: "ready" }));
  const payload = JSON.stringify(providerCalls);
  for (const secret of ["Avery", "Example", "avery@", "keep@", "02108", "60601", "111-22-3333", "127.0.0.1", "mock-provider-key"]) expect(payload).not.toContain(secret);
  expect(providerCalls.length).toBe(1);
  await popup.close();
  // Overlay uses a closed shadow root. Click its actual rendered Fill button via
  // CDP inspection in the test browser, without changing the production overlay.
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const findFill = (node: typeof root): number | undefined => {
    if (node.nodeName === "BUTTON" && node.attributes?.includes("fp-primary")) return node.nodeId;
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
      const found = findFill(child); if (found) return found;
    }
  };
  const nodeId = findFill(root);
  expect(nodeId).toBeTruthy();
  const { model } = await cdp.send("DOM.getBoxModel", { nodeId: nodeId! });
  const x = (model.content[0]! + model.content[2]!) / 2;
  const y = (model.content[1]! + model.content[5]!) / 2;
  await page.screenshot({ path: testInfo.outputPath("assisted-preview.png"), fullPage: true });
  await page.mouse.click(x, y);
  await expect(page.locator("#first")).toHaveValue("Avery");
  await expect(page.locator("#surname")).toHaveValue("Example");
  await expect(page.locator("#work")).toHaveValue("avery@office.test");
  await expect(page.locator("#billing")).toHaveValue("60601");
  await expect(page.locator("#prefilled")).toHaveValue("keep@example.test");
  await expect(page.locator("#password")).toHaveValue("");
  await expect(page.locator("#registration")).toHaveValue("");
  await expect.poll(async () => context.serviceWorkers()[0]!.evaluate(async () => {
    const cache = (await chrome.storage.local.get("cache:v2"))["cache:v2"] ?? [];
    return cache.flatMap((entry: { mappings: Array<{ source: string }> }) => entry.mappings)
      .filter((mapping: { source: string }) => mapping.source === "verified-auto").length;
  })).toBe(4);
  expect(await page.locator("body").getAttribute("data-submitted")).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("assisted-filled.png"), fullPage: true });
});

test("settings are opt-in and keep the service token in session storage", async ({ context, extensionId }, testInfo) => {
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(async () => { await chrome.storage.local.remove("settings:v1"); await chrome.storage.session.remove("cloudBrokerSession"); });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  const toggle = options.getByRole("checkbox", { name: "Cloud-assisted matching" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await options.getByLabel("Service address").fill(`http://127.0.0.1:${(broker!.address() as AddressInfo).port}/match`);
  await options.getByLabel("Access token", { exact: true }).fill(token);
  await options.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(options.getByRole("status")).toContainText("Connection saved");
  await options.getByLabel("Email", { exact: true }).fill("updated@example.test");
  await options.getByRole("button", { name: "Save", exact: true }).click();
  await expect(options.locator("footer")).toContainText("Saved");
  expect(await worker.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)))).not.toContain(token);
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("profile")).profile.contact.emails[1].value)).toBe("avery@office.test");
  await options.screenshot({ path: testInfo.outputPath("cloud-settings.png"), fullPage: true });
});

test("a manual correction supersedes a delayed replacement preview", async ({ context, openTarget, extensionId }) => {
  const { page, tabId } = await openTarget("http://127.0.0.1:8765/fixtures/regressions/cloud-matching.html");
  const first = await openPreview(page, extensionId, tabId);
  await expect(first.locator("p")).toHaveText("Preview ready.");
  const worker = context.serviceWorkers()[0]!;
  const originalId = await worker.evaluate(async () => Object.values(await chrome.storage.session.get(null)).find((v) => v?.matchingContext && v?.plan).requestId);
  let release!: () => void;
  beforeReply = () => new Promise<void>((resolve) => { release = resolve; });
  const second = await openPreview(page, extensionId, tabId);
  await expect.poll(() => providerCalls.length).toBe(2);
  await first.evaluate(async (requestId) => {
    const request = Object.values(await chrome.storage.session.get(null)).find((v) => v?.requestId === requestId);
    const entry = request.plan.entries.find((e: { label: string }) => e.label === "Work email");
    await chrome.runtime.sendMessage({ kind: "RECOMPUTE_ENTRY", requestId, correction: { fieldId: entry.fieldId, profileKey: entry.profileKey, transform: entry.transform, valueOverride: "manual@example.test" } });
  }, originalId);
  release();
  await expect(second.locator("p")).toHaveText("The form or profile changed. Open a new preview.");
  expect(await worker.evaluate(async (requestId) => {
    const request = Object.values(await chrome.storage.session.get(null)).find((v) => v?.requestId === requestId);
    return request.plan.entries.find((e: { label: string }) => e.label === "Work email").value;
  }, originalId)).toBe("manual@example.test");
});

test("refuses an old preview after the profile changes before filling", async ({ openTarget, extensionId }) => {
  const { page, tabId } = await openTarget("http://127.0.0.1:8765/fixtures/regressions/cloud-matching.html");
  const popup = await openPreview(page, extensionId, tabId);
  await expect(popup.locator("p")).toHaveText("Preview ready.");
  const results = await popup.evaluate(async (profile) => {
    const request = Object.values(await chrome.storage.session.get(null)).find((v) => v?.matchingContext && v?.plan);
    await chrome.storage.local.set({ profile: { ...profile, identity: { givenName: "Changed", familyName: "Person" } } });
    return chrome.runtime.sendMessage({ kind: "EXECUTE_REQUEST", requestId: request.requestId,
      selections: request.plan.entries.filter((e: { status: string }) => e.status === "ready").map((e: Record<string, unknown>) => ({
        fieldId: e.fieldId, enabled: true, profileKey: e.profileKey, transform: e.transform, value: e.value
      })) });
  }, profile);
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((r: { status: string }) => r.status === "blocked")).toBe(true);
  await expect(page.locator("#first")).toHaveValue("");
  await expect(page.locator("#work")).toHaveValue("");
});

for (const change of ["field", "profile", "navigation"] as const) {
  test(`discards a delayed response after ${change} changes`, async ({ context, openTarget, extensionId }) => {
    let release!: () => void;
    beforeReply = () => new Promise<void>((resolve) => { release = resolve; });
    const { page, tabId } = await openTarget("http://127.0.0.1:8765/fixtures/regressions/cloud-matching.html");
    const popup = await openPreview(page, extensionId, tabId);
    await expect.poll(() => providerCalls.length).toBe(1);
    if (change === "field") await page.locator("#work").fill("typed@example.test");
    if (change === "profile") await context.serviceWorkers()[0]!.evaluate(async (profile) => {
      await chrome.storage.local.set({ profile: { ...profile, identity: { givenName: "New", familyName: "Person" } } });
    }, profile);
    if (change === "navigation") await page.goto("http://127.0.0.1:8765/fixtures/plain/contact.html");
    release();
    await expect(popup.locator("p")).toHaveText("The form or profile changed. Open a new preview.");
    await expect(page.locator("[data-formpilot-overlay='true']")).toHaveCount(0);
  });
}
