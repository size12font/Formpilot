import { describe, expect, it } from "vitest";
import { safetyDecision } from "@/shared/safety";
import type { FieldDescriptor } from "@/shared/types";

function field(patch: Partial<FieldDescriptor>): FieldDescriptor {
  return {
    id: "field",
    frameId: 0,
    tag: "input",
    label: null,
    nearbyText: "",
    sectionHeading: null,
    bbox: { x: 0, y: 0, w: 100, h: 20 },
    ...patch
  };
}

describe("fail-closed safety policy", () => {
  it.each([
    [field({ currentValue: "already here" }), "prefilled"],
    [field({ type: "password", label: "Password" }), "sensitive"],
    [field({ type: "file", label: "Upload resume" }), "file"],
    [field({ label: "Leave this field blank (optional)" }), "honeypot"],
    [field({ type: "checkbox", label: "Receive marketing email" }), "marketing"],
    [field({ type: "radio", label: "Acepto la Política de Privacidad" }), "consent"]
  ] as const)("blocks unsafe field", (descriptor, reason) => {
    expect(safetyDecision(descriptor)).toMatchObject({ action: "block", reason });
  });

  it("keeps a visible website field eligible", () => {
    expect(safetyDecision(field({ label: "Company website", type: "url" }))).toEqual({
      action: "allow"
    });
  });
});
