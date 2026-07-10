import { test, expect } from "./fixtures";

async function fillViaPopup(
  page: import("@playwright/test").Page,
  extensionId: string,
  tabId: number
): Promise<void> {
  const popup = await page.context().newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
  await popup.getByRole("button", { name: "Fill this form" }).click();
  await expect(popup.locator("p")).toHaveText("Preview ready.");
  await popup.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    const request = Object.values(all).find(
      (value) => Boolean(value && typeof value === "object" && "plan" in value)
    ) as {
      requestId: string;
      plan: {
        selectedFormKey?: string;
        entries: Array<{
          fieldId: string;
          formKey?: string;
          profileKey: string;
          transform: string;
          value: string;
          status: string;
        }>;
      };
    } | undefined;
    if (!request) throw new Error("active FormPilot request missing");
    const entries = request.plan.entries.filter((entry) => entry.status === "ready");
    await chrome.runtime.sendMessage({
      kind: "EXECUTE_REQUEST",
      requestId: request.requestId,
      selections: entries.map((entry) => ({
        fieldId: entry.fieldId,
        enabled: true,
        profileKey: entry.profileKey,
        transform: entry.transform,
        value: entry.value
      }))
    });
  });
  await popup.close();
}

test("fills plain fixture through popup and background routing", async ({
  openTarget,
  extensionId
}) => {
  const { page, tabId } = await openTarget(
    "http://127.0.0.1:8765/fixtures/plain/contact.html"
  );
  await fillViaPopup(page, extensionId, tabId);

  await expect(page.locator("#first")).toHaveValue("Avery");
  await expect(page.locator("#last")).toHaveValue("Example");
  await expect(page.locator("#email")).toHaveValue("avery.example@example.com");
  await expect(page.locator("#country")).toHaveValue("US");
  await expect(page.locator("[data-formpilot-overlay='true']")).toHaveCount(1);
});

test("fills top and cross-origin child frames without collisions", async ({
  openTarget,
  extensionId
}) => {
  const { page, tabId } = await openTarget(
    "http://127.0.0.1:8765/fixtures/frames/top.html"
  );
  await fillViaPopup(page, extensionId, tabId);

  await expect(page.locator("#top-email")).toHaveValue("avery.example@example.com");
  const child = page.frames().find((frame) => frame.url().includes("localhost:8766"));
  expect(child).toBeDefined();
  await expect(child!.locator("#child-email")).toHaveValue("avery.example@example.com");
});

test("keeps policy-protected controls unchanged", async ({ openTarget, extensionId }) => {
  const { page, tabId } = await openTarget(
    "http://127.0.0.1:8765/fixtures/regressions/policy.html"
  );
  await fillViaPopup(page, extensionId, tabId);

  await expect(page.locator("#safe-email")).toHaveValue("avery.example@example.com");
  await expect(page.locator("#prefilled")).toHaveValue("keep me");
  await expect(page.locator("#trap")).toHaveValue("");
  await expect(page.locator("input[type='checkbox']")).not.toBeChecked();
  await expect(page.locator("#upload")).toHaveValue("");
});

test("re-resolves controlled replacement fields", async ({ openTarget, extensionId }) => {
  const { page, tabId } = await openTarget(
    "http://127.0.0.1:8765/fixtures/reactive/replacement.html"
  );
  await fillViaPopup(page, extensionId, tabId);
  await expect(page.locator("#reactive-email")).toHaveValue("avery.example@example.com");
});
