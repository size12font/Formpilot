import { test, expect } from "./fixtures";

test("scopes complex stack forms and keeps protected controls manual", async ({ openTarget, extensionId }) => {
  const { page, tabId } = await openTarget("http://127.0.0.1:8765/fixtures/stacks/complex.html");
  const popup = await page.context().newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await popup.getByRole("button", { name: "Fill this form" }).click();
  await expect(popup.locator("p")).toHaveText("Preview ready.");
  const request = await popup.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    return Object.values(all).find((value) => Boolean(value && typeof value === "object" && "plan" in value)) as any;
  });
  expect(request.plan.selectedFormKey).toContain("contact");
  const selected = request.plan.entries.filter((entry: any) =>
    entry.status === "ready" && entry.formKey === request.plan.selectedFormKey
  );
  await popup.evaluate(async ({ requestId, entries }) => {
    await chrome.runtime.sendMessage({
      kind: "EXECUTE_REQUEST", requestId,
      selections: entries.map((entry: any) => ({ fieldId: entry.fieldId, enabled: true, profileKey: entry.profileKey, transform: entry.transform, value: entry.value }))
    });
  }, { requestId: request.requestId, entries: selected });
  await popup.close();

  await expect(page.locator("#company")).toHaveValue("Example Labs");
  await expect(page.locator("#full-name")).toHaveValue("Avery Rowan Example");
  await expect(page.locator("#postal")).toHaveValue("94105");
  await expect(page.locator("#newsletter-email")).toHaveValue("");
  await expect(page.locator("#newsletter-consent")).not.toBeChecked();
  await expect(page.locator("#trap")).toHaveValue("");
});
