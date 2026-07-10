import { describe, expect, it } from "vitest";
import { bestFuzzyOption, fuzzyScore, normalizeText } from "@/shared/fuzzy";

describe("fuzzy", () => {
  it("scores exact and near matches", () => {
    expect(fuzzyScore("United States", "United States")).toBe(1);
    expect(fuzzyScore("United States", "United States of America")).toBeGreaterThan(0.75);
  });

  it("finds option over value or text", () => {
    const match = bestFuzzyOption("Germany", [
      { value: "US", text: "United States" },
      { value: "DE", text: "Germany" }
    ]);
    expect(match?.option.value).toBe("DE");
  });

  it("preserves non-Latin letters during normalization", () => {
    expect(normalizeText("ประเทศไทย")).toBe("ประเทศไทย");
    expect(fuzzyScore("日本", "日本")).toBe(1);
  });
});
