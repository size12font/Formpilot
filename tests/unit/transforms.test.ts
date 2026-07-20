import { describe, expect, it } from "vitest";
import { transformProfileValue } from "@/shared/transforms";
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
      street: "1 Market St",
      city: "San Francisco",
      region: "CA",
      postalCode: "94105",
      country: "US",
      primary: true
    }
  ],
  custom: []
};

const selectField: FieldDescriptor = {
  id: "country",
  frameId: 0,
  tag: "select",
  label: "Country",
  nearbyText: "",
  sectionHeading: null,
  options: [
    { value: "DE", text: "Deutschland" },
    { value: "US", text: "Vereinigte Staaten" }
  ],
  bbox: { x: 0, y: 0, w: 10, h: 10 }
};

describe("transforms", () => {
  it("formats dates", () => {
    expect(transformProfileValue(profile, "identity.dateOfBirth", "date:DD/MM/YYYY").value).toBe(
      "09/07/1990"
    );
  });

  it("formats phone country code", () => {
    expect(
      transformProfileValue(profile, "contact.phones[0].number", "phone:split-country-code").value
    ).toBe("+1");
  });

  it("formats split phone boxes as digits only", () => {
    expect(
      transformProfileValue(profile, "contact.phones[0].number", "phone:country-code-digits").value
    ).toBe("1");
    expect(
      transformProfileValue(profile, "contact.phones[0].number", "phone:national-part-1").value
    ).toBe("415");
    expect(
      transformProfileValue(profile, "contact.phones[0].number", "phone:national-part-2").value
    ).toBe("555");
    expect(
      transformProfileValue(profile, "contact.phones[0].number", "phone:national-part-3").value
    ).toBe("1212");
  });

  it("matches select options in page language", () => {
    const result = transformProfileValue(
      profile,
      "addresses[0].country",
      "select:match-option",
      selectField,
      "de"
    );
    expect(result.selectedOptionValue).toBe("US");
  });
});
