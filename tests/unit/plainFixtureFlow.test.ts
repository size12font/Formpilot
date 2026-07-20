import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFillPlan } from "@/background/mappingEngine";
import { fillEntries } from "@/content/actuator";
import { extractFields } from "@/content/extractor";
import { verifyEntries } from "@/content/verifier";
import type { Profile } from "@/shared/types";

const profile: Profile = {
  version: 1,
  identity: {
    givenName: "Avery",
    familyName: "Example"
  },
  contact: {
    emails: [{ label: "primary", value: "avery.example@example.com", primary: true }],
    phones: [
      { label: "mobile", countryCode: "+1", number: "2025550147", primary: true }
    ]
  },
  addresses: [
    {
      label: "home",
      street: "123 Example Street",
      city: "Testville",
      postalCode: "94105",
      country: "US",
      primary: true
    }
  ],
  custom: []
};

describe("plain contact fixture", () => {
  beforeEach(() => {
    const html = readFileSync(resolve("fixtures/plain/contact.html"), "utf8");
    document.documentElement.innerHTML = html
      .replace(/^.*?<html[^>]*>/s, "")
      .replace(/<\/html>\s*$/s, "");

    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue(
      [{} as DOMRect] as unknown as DOMRectList
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 32,
      top: 0,
      right: 200,
      bottom: 32,
      left: 0,
      toJSON: () => ({})
    });
  });

  it("previews and fills every field with correct profile data", async () => {
    const fields = extractFields();
    expect(fields).toHaveLength(5);

    const plan = await createFillPlan({
      fields,
      profile,
      url: "http://127.0.0.1:8765/fixtures/plain/contact.html",
      pageLang: "en",
      pageTitle: "Contact"
    });

    expect(plan.entries).toHaveLength(5);
    expect(plan.entries.every((entry) => entry.status === "ready")).toBe(true);

    await fillEntries(plan.entries, { simulateTyping: false });

    expect((document.querySelector("#first") as HTMLInputElement).value).toBe("Avery");
    expect((document.querySelector("#last") as HTMLInputElement).value).toBe("Example");
    expect((document.querySelector("#email") as HTMLInputElement).value).toBe(
      "avery.example@example.com"
    );
    expect((document.querySelector("#phone") as HTMLInputElement).value).toContain(
      "202"
    );
    expect((document.querySelector("#country") as HTMLSelectElement).value).toBe("US");
    expect(verifyEntries(plan.entries).every((result) => result.status === "ok")).toBe(
      true
    );
  });
});
