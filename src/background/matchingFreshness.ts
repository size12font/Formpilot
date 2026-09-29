import { sha256Hex } from "../shared/signature";
import { MATCHING_RULES_VERSION } from "../shared/cloudProtocol";
import type { Profile } from "../shared/types";
import type { Settings } from "../shared/storage";
import type { FrameExtraction } from "./frameCoordinator";

const generationKey = (tabId: number) => `matchingGeneration:${tabId}`;

export async function markLatestRequest(tabId: number, id: string): Promise<void> {
  await chrome.storage.session.set({ [generationKey(tabId)]: id });
}

export async function isLatestRequest(tabId: number, id: string): Promise<boolean> {
  return (await chrome.storage.session.get(generationKey(tabId)))[generationKey(tabId)] === id;
}

export async function matchingContext(
  extractions: FrameExtraction[], profile: Profile | undefined, settings: Settings
): Promise<string> {
  // Local-only fingerprint. Exclude geometry: opening preview can move the page.
  return sha256Hex(JSON.stringify([
    MATCHING_RULES_VERSION, profile, settings,
    [...extractions].sort((a, b) => a.frame.documentId.localeCompare(b.frame.documentId)).map((extraction) => ({
      documentId: extraction.frame.documentId, url: extraction.url, pageLang: extraction.pageLang,
      fields: extraction.fields.map(({ bbox: _bbox, ...field }) => field)
    }))
  ]));
}
