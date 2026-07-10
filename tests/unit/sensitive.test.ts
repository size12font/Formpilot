import { describe, expect, it } from "vitest";
import { sensitiveSemanticType } from "@/shared/sensitive";

describe("sensitive classifier", () => {
  it("skips payment and password fields", () => {
    expect(
      sensitiveSemanticType({
        autocomplete: "cc-number",
        label: "Card number",
        nearbyText: ""
      })
    ).toBe("card_number");
    expect(
      sensitiveSemanticType({
        type: "password",
        label: "Password",
        nearbyText: ""
      })
    ).toBe("password");
  });
});
