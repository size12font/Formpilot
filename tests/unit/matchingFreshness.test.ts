import { describe, expect, it, vi } from "vitest";
import { matchingContext, markLatestRequest, isLatestRequest } from "@/background/matchingFreshness";
import { cloneEmptyProfile } from "@/shared/profile";
import type { FrameExtraction } from "@/background/frameCoordinator";

const extraction = (): FrameExtraction => ({
  requestId: "request", url: "https://example.test/form", pageLang: "en", pageTitle: "Form",
  frame: { frameId: 0, documentId: "doc", url: "https://example.test/form", origin: "https://example.test", isTop: true },
  fields: [{ id: "email", frameId: 0, tag: "input", label: "Email", nearbyText: "", sectionHeading: "Work", bbox: { x: 0, y: 0, w: 100, h: 20 } }]
});
const settings = { encryptionEnabled: false, simulateTyping: false, cloudMatchingEnabled: true };
describe("matching freshness", () => {
  it("invalidates navigation, document replacement, field edits, role edits, values and opt-out", async () => {
    const profile = cloneEmptyProfile();
    const original = await matchingContext([extraction()], profile, settings);
    for (const change of [
      (e: FrameExtraction) => { e.url = "https://example.test/other"; },
      (e: FrameExtraction) => { e.frame.documentId = "replacement"; },
      (e: FrameExtraction) => { e.fields[0]!.label = "Personal email"; },
      (e: FrameExtraction) => { e.fields[0]!.currentValue = "typed@example.test"; },
      (e: FrameExtraction) => { e.fields[0]!.options = [{ value: "new", text: "New" }]; }
    ]) {
      const changed = extraction(); change(changed);
      expect(await matchingContext([changed], profile, settings)).not.toBe(original);
    }
    const changed = cloneEmptyProfile(); changed.contact.emails[0]!.label = "work";
    expect(await matchingContext([extraction()], changed, settings)).not.toBe(original);
    changed.identity.givenName = "Avery";
    expect(await matchingContext([extraction()], changed, settings)).not.toBe(original);
    expect(await matchingContext([extraction()], profile, { ...settings, cloudMatchingEnabled: false })).not.toBe(original);
    const moved = extraction(); moved.fields[0]!.bbox.x = 50;
    expect(await matchingContext([moved], profile, settings)).toBe(original);
  });
  it("lets a manual correction supersede an in-flight preview across worker restarts", async () => {
    const data: Record<string, unknown> = {};
    vi.mocked(chrome.storage.session.set).mockImplementation(async (items) => { Object.assign(data, items); });
    vi.mocked(chrome.storage.session.get).mockImplementation(async (key: unknown) => ({ [key as string]: data[key as string] }));
    await markLatestRequest(1, "pending-preview");
    expect(await isLatestRequest(1, "pending-preview")).toBe(true);
    await markLatestRequest(1, "manual-correction");
    expect(await isLatestRequest(1, "pending-preview")).toBe(false);
    expect(await isLatestRequest(1, "manual-correction")).toBe(true);
  });
});
