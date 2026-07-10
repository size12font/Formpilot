import { describe, expect, it } from "vitest";
import { createFillPlan } from "@/background/mappingEngine";
import { QA_PROFILE } from "@/shared/qaProfile";
import type { FieldDescriptor } from "@/shared/types";

function phone(id: string, formKey: string): FieldDescriptor {
  return {
    id,
    frameId: 0,
    formKey,
    tag: "input",
    type: "tel",
    label: "Phone",
    nearbyText: "Phone",
    sectionHeading: null,
    bbox: { x: 0, y: 0, w: 100, h: 20 }
  };
}

describe("form scoping", () => {
  it("does not split adjacent phone fields across forms", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/forms",
      pageLang: "en",
      pageTitle: "Forms",
      fields: [phone("one", "form:one"), phone("two", "form:two")]
    });
    expect(plan.entries.map((entry) => entry.transform)).toEqual([
      "phone:national",
      "phone:national"
    ]);
    expect(plan.forms?.map((form) => form.key)).toEqual(["form:one", "form:two"]);
  });
});
