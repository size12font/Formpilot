import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFillPlan } from "@/background/mappingEngine";
import { fillEntries } from "@/content/actuator";
import { extractFields } from "@/content/extractor";
import { QA_PROFILE } from "@/shared/qaProfile";

describe("typed control adapters", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue(
      [{} as DOMRect] as unknown as DOMRectList
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0,
      toJSON: () => ({})
    });
  });

  it("groups native radios and selects categorical value", async () => {
    document.body.innerHTML = `
      <form><fieldset><legend>Gender</legend>
        <label><input type="radio" name="gender" value="Female">Female</label>
        <label><input type="radio" name="gender" value="Non-binary">Non-binary</label>
      </fieldset></form>`;
    const fields = extractFields();
    expect(fields).toHaveLength(1);
    expect(fields[0]?.controlKind).toBe("radio-group");
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      fields,
      url: "https://example.test/profile",
      pageLang: "en",
      pageTitle: "Profile"
    });
    expect(plan.entries[0]?.status).toBe("ready");
    await fillEntries(plan.entries, { simulateTyping: false });
    expect(document.querySelector<HTMLInputElement>('input[value="Non-binary"]')?.checked).toBe(true);
  });

  it("keeps checkboxes manual-only", async () => {
    document.body.innerHTML = `<label><input type="checkbox" name="email">Receive email updates</label>`;
    const fields = extractFields();
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      fields,
      url: "https://example.test/contact",
      pageLang: "en",
      pageTitle: "Contact"
    });
    expect(plan.entries[0]).toMatchObject({ status: "blocked", blockReason: "manual-choice" });
  });
});
