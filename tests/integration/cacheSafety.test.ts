import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedMappings,
  saveMappings,
  saveVerifiedMappings
} from "@/background/signatureCache";
import { CACHE_KEY } from "@/shared/storage";
import type { FieldDescriptor, FillPlanEntry } from "@/shared/types";

const field: FieldDescriptor = {
  id: "email",
  frameId: 0,
  formKey: "form:0",
  occurrence: 0,
  tag: "input",
  type: "email",
  name: "email",
  label: "Email",
  nearbyText: "",
  sectionHeading: null,
  bbox: { x: 0, y: 0, w: 100, h: 20 }
};

const entry: FillPlanEntry = {
  fieldId: "email",
  profileKey: "contact.emails[0].value",
  transform: "none",
  value: "avery.example@example.com",
  confidence: 1,
  status: "ready"
};

describe("cache v2", () => {
  const data = new Map<string, unknown>();

  beforeEach(() => {
    data.clear();
    chrome.storage.local.get = vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      return structuredClone(Object.fromEntries(keys.map((item) => [item, data.get(item)])));
    }) as unknown as typeof chrome.storage.local.get;
    chrome.storage.local.set = vi.fn(async (items: Record<string, unknown>) => {
      Object.entries(items).forEach(([key, value]) => data.set(key, value));
    });
  });

  it("stores verified mappings and rehydrates candidates", async () => {
    await saveVerifiedMappings("signature", [field], [entry], [
      { fieldId: "email", status: "ok", expected: entry.value, actual: entry.value }
    ]);
    expect(await getCachedMappings("signature", [field])).toMatchObject([
      { fieldId: "email", profileKey: "contact.emails[0].value", confidence: 1 }
    ]);
  });

  it("does not store failed verification", async () => {
    await saveVerifiedMappings("signature", [field], [entry], [
      { fieldId: "email", status: "cleared", expected: entry.value, actual: "" }
    ]);
    expect(data.get(CACHE_KEY)).toBeUndefined();
  });

  it("keeps duplicate occurrences distinct", async () => {
    const second = { ...field, id: "email-2", occurrence: 1 };
    await saveMappings("signature", [field, second], [
      { fieldId: "email", profileKey: "contact.emails[0].value", transform: "none" },
      { fieldId: "email-2", profileKey: "custom.department", transform: "none" }
    ]);
    const mappings = await getCachedMappings("signature", [field, second]);
    expect(mappings?.map((item) => item.profileKey)).toEqual([
      "contact.emails[0].value",
      "custom.department"
    ]);
  });

  it("preserves concurrent corrections and cache reads from different frames", async () => {
    const second = { ...field, id: "email-2", occurrence: 1 };
    await Promise.all([
      saveMappings("signature", [field], [{ fieldId: "email", profileKey: "contact.emails[0].value", transform: "none" }]),
      saveMappings("signature", [second], [{ fieldId: "email-2", profileKey: "contact.emails[1].value", transform: "none" }]),
      getCachedMappings("signature", [field, second])
    ]);
    expect((await getCachedMappings("signature", [field, second]))?.map((item) => item.profileKey)).toEqual([
      "contact.emails[0].value", "contact.emails[1].value"
    ]);
  });
});
