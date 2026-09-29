import { CACHE_KEY, CACHE_KEY_V1, getLocal, setLocal } from "../shared/storage";
import { fieldKey } from "../shared/signature";
import type {
  CachedMapping,
  FieldDescriptor,
  FillPlanEntry,
  MappingCandidate,
  MappingCorrection,
  VerifyResult
} from "../shared/types";

const MAX_CACHE_ENTRIES = 500;
let cacheWork: Promise<unknown> = Promise.resolve();

// Frame matching and user corrections can overlap. Serialize read-modify-write
// operations so a cache hit cannot overwrite a correction saved concurrently.
function serializeCache<T>(operation: () => Promise<T>): Promise<T> {
  const result = cacheWork.then(operation);
  cacheWork = result.catch(() => undefined);
  return result;
}

async function readCache(): Promise<CachedMapping[]> {
  const cache = (await getLocal<CachedMapping[]>(CACHE_KEY)) ?? [];
  return cache.filter((entry) => entry.version === 2);
}

async function writeCache(cache: CachedMapping[]): Promise<void> {
  await setLocal(
    CACHE_KEY,
    [...cache].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_CACHE_ENTRIES)
  );
}

export async function discardLegacyCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY_V1);
}

// Old local-only corrections lack a profile/context fingerprint. Bind them once
// on adoption, so later role/index edits cannot resurrect an obsolete correction.
export async function getLegacyManualMappings(
  signature: string, fields: FieldDescriptor[], assistedContext: string
): Promise<MappingCandidate[]> {
  return serializeCache(async () => {
    const cache = await readCache();
    const entry = cache.find((item) => item.signature === signature);
    if (!entry || (entry.assistedContext && entry.assistedContext !== assistedContext)) return [];
    entry.assistedContext = assistedContext;
    await writeCache(cache);
    return (await readCachedMappings(signature, fields) ?? []).filter((candidate) => candidate.source === "manual");
  });
}

export async function getCachedMappings(
  signature: string,
  fields: FieldDescriptor[]
): Promise<MappingCandidate[] | null> {
  return serializeCache(() => readCachedMappings(signature, fields));
}

async function readCachedMappings(signature: string, fields: FieldDescriptor[]): Promise<MappingCandidate[] | null> {
  const cache = await readCache();
  const entry = cache.find((item) => item.signature === signature);
  if (!entry) return null;

  const mappings = fields.map((field) => {
    const mapping = entry.mappings.find(
      (item) =>
        item.fieldKey === fieldKey(field) &&
        (item.occurrence ?? 0) === (field.occurrence ?? field.ref?.occurrence ?? 0)
    );
    return mapping
      ? {
          fieldId: field.id,
          profileKey: mapping.profileKey,
          transform: mapping.transform,
          source: mapping.source,
          confidence: 1
        }
      : {
          fieldId: field.id,
          profileKey: "SKIP",
          transform: "none" as const,
          confidence: 0
        };
  });

  const mapped = mappings.filter((mapping) => mapping.profileKey !== "SKIP" || mapping.source === "manual").length;
  if (entry.mappings.length > 0 && mapped / entry.mappings.length < 0.7) return null;

  entry.hitCount += 1;
  entry.lastUsed = Date.now();
  await writeCache(cache);
  return mappings;
}

function mappingsFromCorrections(
  fields: FieldDescriptor[],
  corrections: MappingCorrection[],
  source: "verified-auto" | "manual",
  verifiedAt?: number
): CachedMapping["mappings"] {
  return corrections
    .filter((correction) => source === "manual" || correction.profileKey !== "SKIP")
    .map((correction) => {
      const field = fields.find((candidate) => candidate.id === correction.fieldId);
      if (!field) return null;
      return {
        fieldKey: fieldKey(field),
        occurrence: field.occurrence ?? field.ref?.occurrence ?? 0,
        profileKey: correction.profileKey,
        transform: correction.transform,
        source,
        ...(verifiedAt ? { verifiedAt } : {})
      };
    })
    .filter((mapping): mapping is NonNullable<typeof mapping> => mapping !== null);
}

export async function saveMappings(
  signature: string,
  fields: FieldDescriptor[],
  corrections: MappingCorrection[],
  source: "verified-auto" | "manual" = "manual",
  verifiedAt?: number
): Promise<void> {
  return serializeCache(async () => {
    const now = Date.now();
    const cache = await readCache();
    const current = cache.find((entry) => entry.signature === signature);
    const mappings = mappingsFromCorrections(fields, corrections, source, verifiedAt);

    if (current) {
      const nextByKey = new Map(
        current.mappings.map((mapping) => [
          `${mapping.fieldKey}:${mapping.occurrence ?? 0}`,
          mapping
        ])
      );
      mappings.forEach((mapping) => {
        const key = `${mapping.fieldKey}:${mapping.occurrence ?? 0}`;
        if (source === "verified-auto" && nextByKey.get(key)?.source === "manual") return;
        nextByKey.set(key, mapping);
      });
      current.mappings = [...nextByKey.values()];
      current.lastUsed = now;
      current.hitCount += 1;
    } else {
      cache.push({
        version: 2,
        signature,
        mappings,
        hitCount: 1,
        lastUsed: now,
        createdAt: now
      });
    }
    await writeCache(cache);
  });
}

export async function saveVerifiedMappings(
  signature: string,
  fields: FieldDescriptor[],
  entries: FillPlanEntry[],
  results: VerifyResult[]
): Promise<void> {
  const ok = new Set(results.filter((result) => result.status === "ok").map((result) => result.fieldId));
  const corrections = entries
    .filter((entry) => ok.has(entry.fieldId) && entry.profileKey !== "SKIP")
    .map((entry) => ({
      fieldId: entry.fieldId,
      profileKey: entry.profileKey,
      transform: entry.transform
    }));
  if (corrections.length > 0) {
    await saveMappings(signature, fields, corrections, "verified-auto", Date.now());
  }
}
