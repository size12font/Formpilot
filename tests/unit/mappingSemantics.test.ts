import { describe, expect, it } from "vitest";
import { createFillPlan } from "@/background/mappingEngine";
import { QA_PROFILE } from "@/shared/qaProfile";
import type { FieldDescriptor } from "@/shared/types";

function field(id: string, patch: Partial<FieldDescriptor>): FieldDescriptor {
  return {
    id,
    frameId: 0,
    tag: "input",
    label: null,
    nearbyText: "",
    sectionHeading: null,
    bbox: { x: 0, y: 0, w: 100, h: 20 },
    ...patch
  };
}

describe("specific semantic mapping", () => {
  it("maps company name before generic personal name", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/contact",
      pageLang: "en",
      pageTitle: "Contact",
      fields: [field("company", { label: "Company name", name: "company_name" })]
    });
    expect(plan.entries[0]).toMatchObject({ profileKey: "work.company", status: "ready" });
  });

  it("uses autocomplete organization and split-name semantics", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/contact",
      pageLang: "en",
      pageTitle: "Contact",
      fields: [
        field("org", { label: "Name", autocomplete: "organization" }),
        field("given", { autocomplete: "given-name" }),
        field("family", { autocomplete: "family-name" })
      ]
    });
    expect(plan.entries.map((entry) => entry.profileKey)).toEqual([
      "work.company",
      "identity.givenName",
      "identity.familyName"
    ]);
  });

  it("maps Indonesian company labels", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/form",
      pageLang: "id",
      pageTitle: "Kontak",
      fields: [field("company", { label: "Nama Perusahaan" })]
    });
    expect(plan.entries[0]?.profileKey).toBe("work.company");
  });

  it("requires review when strong visible and autocomplete semantics conflict", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/form",
      pageLang: "en",
      pageTitle: "Contact",
      fields: [field("conflict", { label: "Company", autocomplete: "given-name" })]
    });
    expect(plan.entries[0]?.status).toBe("low-confidence");
  });

  it("uses option matching for autocomplete country selects", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/form",
      pageLang: "es",
      pageTitle: "Contacto",
      fields: [field("country", {
        autocomplete: "country",
        tag: "select",
        controlKind: "native-select",
        options: [{ value: "ES", text: "España" }]
      })]
    });
    expect(plan.entries[0]).toMatchObject({ profileKey: "addresses[0].country", transform: "select:match-option" });
  });

  it("does not mistake Spanish full-name labels for given name", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/form",
      pageLang: "es",
      pageTitle: "Contacto",
      fields: [field("name", { label: "Nombre y apellidos" })]
    });
    expect(plan.entries[0]).toMatchObject({ profileKey: "identity.givenName", transform: "name:full" });
  });

  it.each([
    ["Tên công ty", "work.company"],
    ["Mã bưu chính", "addresses[0].postalCode"],
    ["الاسم الكامل", "identity.givenName"],
    ["郵便番号", "addresses[0].postalCode"]
  ])("maps localized semantic label %s", async (label, profileKey) => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/localized",
      pageLang: "en",
      pageTitle: "Contact",
      fields: [field("localized", { label })]
    });
    expect(plan.entries[0]?.profileKey).toBe(profileKey);
  });

  it("selects eligible contact form over a larger newsletter form", async () => {
    const plan = await createFillPlan({
      profile: QA_PROFILE,
      url: "https://example.test/multi-form",
      pageLang: "en",
      pageTitle: "Contact",
      fields: [
        field("newsletter-email", { label: "Newsletter email", formKey: "newsletter", form: { key: "newsletter", kind: "form", label: "Newsletter" } }),
        field("contact-email", { label: "Email", formKey: "contact", form: { key: "contact", kind: "form", label: "Contact us" } }),
        field("contact-company", { label: "Company", formKey: "contact", form: { key: "contact", kind: "form", label: "Contact us" } })
      ]
    });
    expect(plan.selectedFormKey).toBe("contact");
  });
});
