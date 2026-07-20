import { describe, expect, it } from "vitest";
import { createFillPlan } from "@/background/mappingEngine";
import type { FieldDescriptor, Profile } from "@/shared/types";

const profile: Profile = {
  version: 1,
  identity: {
    givenName: "Avery",
    familyName: "Example",
    dateOfBirth: "1990-07-09",
    nationality: "US"
  },
  contact: {
    emails: [{ label: "primary", value: "avery@example.com", primary: true }],
    phones: [{ label: "mobile", countryCode: "+1", number: "4155551212", primary: true }]
  },
  addresses: [
    {
      label: "home",
      street: "Market St",
      streetNumber: "1",
      city: "San Francisco",
      region: "CA",
      postalCode: "94105",
      country: "US",
      primary: true
    }
  ],
  documents: {
    taxId: "123-45-6789"
  },
  work: {
    company: "FormPilot Labs",
    jobTitle: "Founder"
  },
  custom: []
};

function field(patch: Partial<FieldDescriptor>): FieldDescriptor {
  return {
    id: patch.id ?? "field",
    frameId: 0,
    tag: patch.tag ?? "input",
    label: patch.label ?? null,
    nearbyText: patch.nearbyText ?? "",
    sectionHeading: patch.sectionHeading ?? null,
    bbox: patch.bbox ?? { x: 0, y: 0, w: 100, h: 20 },
    ...patch
  };
}

describe("mapping engine", () => {
  it("maps German fixture-style fields without cloud fallback", async () => {
    const plan = await createFillPlan({
      profile,
      url: "https://example.com/anmeldung/123",
      pageLang: "de",
      pageTitle: "Anmeldung",
      fields: [
        field({ id: "first", name: "vorname", label: "Vorname" }),
        field({ id: "last", name: "nachname", label: "Nachname" }),
        field({
          id: "birth",
          name: "geburtsdatum",
          label: "Geburtsdatum",
          placeholder: "TT/MM/JJJJ"
        }),
        field({ id: "zip", name: "plz", label: "PLZ" }),
        field({
          id: "country",
          tag: "select",
          name: "land",
          label: "Land",
          options: [
            { value: "DE", text: "Deutschland" },
            { value: "US", text: "Vereinigte Staaten" }
          ]
        })
      ]
    });

    expect(plan.visionUsed).toBe(false);
    expect(plan.entries.find((entry) => entry.fieldId === "first")?.value).toBe("Avery");
    expect(plan.entries.find((entry) => entry.fieldId === "last")?.value).toBe("Example");
    expect(plan.entries.find((entry) => entry.fieldId === "birth")?.value).toBe("09/07/1990");
    expect(plan.entries.find((entry) => entry.fieldId === "zip")?.value).toBe("94105");
    expect(plan.entries.find((entry) => entry.fieldId === "country")?.selectedOptionValue).toBe(
      "US"
    );
  });

  it("hard-skips sensitive fields", async () => {
    const plan = await createFillPlan({
      profile,
      url: "https://example.com/payment",
      pageLang: "en",
      pageTitle: "Payment",
      fields: [
        field({ id: "card", name: "cc_number", autocomplete: "cc-number", label: "Card number" }),
        field({ id: "password", type: "password", label: "Password" }),
        field({ id: "email", type: "email", label: "Email" })
      ]
    });

    expect(plan.entries.find((entry) => entry.fieldId === "card")?.status).toBe(
      "skipped-sensitive"
    );
    expect(plan.entries.find((entry) => entry.fieldId === "password")?.status).toBe(
      "skipped-sensitive"
    );
    expect(plan.entries.find((entry) => entry.fieldId === "email")?.status).toBe("ready");
  });

  it("splits one phone number across adjacent phone boxes", async () => {
    const plan = await createFillPlan({
      profile,
      url: "https://example.com/reservation",
      pageLang: "en",
      pageTitle: "Reservation",
      fields: [
        field({
          id: "phone-country",
          type: "tel",
          label: "000",
          nearbyText: "Phone number Required +",
          maxLength: 3
        }),
        field({
          id: "phone-area",
          type: "tel",
          label: "000",
          nearbyText: "Phone number Required",
          maxLength: 3
        }),
        field({
          id: "phone-prefix",
          type: "tel",
          label: "000",
          nearbyText: "Phone number Required",
          maxLength: 3
        }),
        field({
          id: "phone-line",
          type: "tel",
          label: "0000",
          nearbyText: "Phone number Required",
          maxLength: 4
        })
      ]
    });

    expect(plan.entries.map((entry) => entry.value)).toEqual(["1", "415", "555", "1212"]);
    expect(plan.entries.map((entry) => entry.transform)).toEqual([
      "phone:country-code-digits",
      "phone:national-part-1",
      "phone:national-part-2",
      "phone:national-part-3"
    ]);
  });

  it("prefers street number and street for generic visible address blocks", async () => {
    const plan = await createFillPlan({
      profile,
      url: "https://example.com/reservation",
      pageLang: "en",
      pageTitle: "Reservation",
      fields: [
        field({
          id: "addr-number",
          label: "City or Locality",
          autocomplete: "address-level2",
          nearbyText: "Address Required"
        }),
        field({
          id: "addr-street",
          label: "Street",
          autocomplete: "street-address",
          nearbyText: "Address Required"
        })
      ]
    });

    expect(plan.entries[0]).toMatchObject({
      profileKey: "addresses[0].streetNumber",
      value: "1",
      status: "ready"
    });
    expect(plan.entries[1]).toMatchObject({
      profileKey: "addresses[0].street",
      value: "Market St",
      status: "ready"
    });
  });
});
