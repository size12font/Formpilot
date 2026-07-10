import { describe, expect, it } from "vitest";
import { countryCandidates, countryIso2, countryName } from "@/shared/countries";

describe("country semantics", () => {
  it.each([
    ["España", "ES"], ["ประเทศไทย", "TH"], ["日本", "JP"],
    ["Indonesia", "ID"], ["Việt Nam", "VN"], ["الإمارات العربية المتحدة", "AE"]
  ])("resolves localized country %s", (name, code) => {
    expect(countryIso2(name)).toBe(code);
  });

  it("does not fabricate a code for unknown labels", () => {
    expect(countryIso2("Not a country")).toBe("");
    expect(countryCandidates("Not a country", "en")).toEqual(["Not a country"]);
  });

  it("uses Intl for names outside the compact reviewed dictionary", () => {
    expect(countryName("TH", "th")).toBe("ประเทศไทย");
  });
});
