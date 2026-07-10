import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractFields } from "@/content/extractor";
import { verifyEntriesLifecycle } from "@/content/verifier";
import type { FillPlanEntry } from "@/shared/types";

describe("verification lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue(
      [{} as DOMRect] as unknown as DOMRectList
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0,
      toJSON: () => ({})
    });
  });
  afterEach(() => vi.useRealTimers());

  it("re-resolves controlled replacements instead of reading detached nodes", async () => {
    document.body.innerHTML = `<input id="email" type="email">`;
    const field = extractFields()[0]!;
    const old = document.getElementById("email")!;
    (old as HTMLInputElement).value = "avery.example@example.com";
    old.replaceWith(Object.assign(document.createElement("input"), { id: "email", type: "email" }));
    const entry: FillPlanEntry = {
      fieldId: field.id,
      ref: field.ref,
      controlKind: "text",
      profileKey: "contact.emails[0].value",
      transform: "none",
      value: "avery.example@example.com",
      confidence: 1,
      status: "ready"
    };
    const pending = verifyEntriesLifecycle([entry], { settleMs: 10, retentionMs: 20 });
    await vi.advanceTimersByTimeAsync(30);
    expect((await pending)[0]?.status).toBe("cleared");
  });

  it("reports browser-invalid values", async () => {
    document.body.innerHTML = `<input id="email" type="email" value="not-an-email">`;
    const field = extractFields()[0]!;
    const entry: FillPlanEntry = {
      fieldId: field.id,
      ref: field.ref,
      controlKind: "text",
      profileKey: "contact.emails[0].value",
      transform: "none",
      value: "not-an-email",
      confidence: 1,
      status: "ready"
    };
    const pending = verifyEntriesLifecycle([entry], { settleMs: 10, retentionMs: 20 });
    await vi.advanceTimersByTimeAsync(30);
    expect((await pending)[0]?.status).toBe("invalid");
  });
});
