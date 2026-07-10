import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractFields } from "@/content/extractor";
import { isSensitiveField } from "@/shared/sensitive";

const fixtures = [
  "plain/contact.html",
  "german/anmeldung.html",
  "payment/sensitive.html",
  "hostile/clears-on-blur.html",
  "aria/combobox.html",
  "wizard/linear.html",
  "legacy/table-layout.html"
];

describe("fixture characterization baseline", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = "<body></body>";
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

  it.each(fixtures)("keeps known fixture shape stable: %s", (fixture) => {
    const html = readFileSync(resolve("fixtures", fixture), "utf8");
    document.body.innerHTML = html
      .replace(/^.*?<body[^>]*>/s, "")
      .replace(/<\/body>\s*.*$/s, "");

    const fields = extractFields();
    const ids = new Set(fields.map((field) => field.id));

    expect(fields.length).toBeGreaterThan(0);
    expect(ids.size).toBe(fields.length);
    expect(fields.every((field) => field.type !== "submit")).toBe(true);
  });

  it("preserves sensitive-field characterization", () => {
    const html = readFileSync(resolve("fixtures/payment/sensitive.html"), "utf8");
    document.body.innerHTML = html
      .replace(/^.*?<body[^>]*>/s, "")
      .replace(/<\/body>\s*.*$/s, "");

    expect(extractFields().some(isSensitiveField)).toBe(true);
  });
});
