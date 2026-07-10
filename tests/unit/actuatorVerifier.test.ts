import { describe, expect, it } from "vitest";
import { fillEntries } from "@/content/actuator";
import { elementByFieldId } from "@/content/extractor";
import { verifyEntries } from "@/content/verifier";
import type { FillPlanEntry } from "@/shared/types";

describe("actuator and verifier", () => {
  it("reports cleared when site JS removes value on blur", async () => {
    document.body.innerHTML = `<input id="email" />`;
    const input = document.getElementById("email") as HTMLInputElement;
    input.addEventListener("blur", () => {
      input.value = "";
    });
    elementByFieldId.set("email", input);

    const entry: FillPlanEntry = {
      fieldId: "email",
      profileKey: "contact.emails[0].value",
      transform: "none",
      value: "johnny@example.com",
      confidence: 1,
      status: "ready"
    };

    await fillEntries([entry], { simulateTyping: false });
    expect(verifyEntries([entry])[0]?.status).toBe("cleared");
  });
});
