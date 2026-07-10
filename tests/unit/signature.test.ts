import { describe, expect, it } from "vitest";
import { fieldKey, formSignature, normalizePathname } from "@/shared/signature";
import type { FieldDescriptor } from "@/shared/types";

const field: FieldDescriptor = {
  id: "a",
  frameId: 0,
  tag: "input",
  type: "text",
  name: "email",
  domId: "email",
  autocomplete: "email",
  label: "Email",
  nearbyText: "",
  sectionHeading: null,
  bbox: { x: 0, y: 0, w: 10, h: 10 }
};

describe("signature", () => {
  it("normalizes numeric and UUID path segments", () => {
    expect(normalizePathname("/forms/123")).toBe("/forms/*");
    expect(normalizePathname("/forms/123e4567-e89b-12d3-a456-426614174000/edit")).toBe(
      "/forms/*/edit"
    );
  });

  it("uses stable field keys", () => {
    expect(fieldKey(field)).toBe("0~document~input~text~email~email~email~Email~0");
  });

  it("is stable independent of field order", async () => {
    const other = { ...field, id: "b", name: "first", domId: "first", label: "First name" };
    await expect(formSignature("https://example.com/forms/1", [field, other])).resolves.toBe(
      await formSignature("https://example.com/forms/2", [other, field])
    );
  });
});
