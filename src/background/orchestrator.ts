import {
  extractAllFrames,
  registerFrameContext,
  sendToDocument,
  type FrameExtraction
} from "./frameCoordinator";
import { createFillPlan, recomputePlanEntry } from "./mappingEngine";
import {
  discardLegacyCache,
  saveMappings,
  saveVerifiedMappings
} from "./signatureCache";
import { captureViewport } from "./screenshot";
import {
  createRequestRecord,
  getActiveRequest,
  removeActiveRequest,
  saveActiveRequest
} from "./requestStore";
import { parseMessage, requestFillResponse } from "../shared/messages";
import { sha256Hex } from "../shared/signature";
import { getProfile, getSettings } from "../shared/storage";
import { isLatestRequest, markLatestRequest, matchingContext } from "./matchingFreshness";
import type {
  FillPlan,
  FillPlanEntry,
  FillDiagnostics,
  MappingCorrection,
  RequestFillResponse,
  VerifyResult
} from "../shared/types";

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id === undefined ? null : tab;
}

function requestId(): string {
  return crypto.randomUUID();
}

async function aggregatePlan(
  extractions: FrameExtraction[],
  tab: chrome.tabs.Tab,
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>,
  preferredDocumentId?: string
): Promise<FillPlan> {
  const screenshot = (await getSettings()).cloudMatchingEnabled ? null : await captureViewport(tab);
  const plans = await Promise.all(
    extractions.map((extraction) =>
      createFillPlan({
        fields: extraction.fields,
        profile,
        url: extraction.url,
        pageLang: extraction.pageLang,
        pageTitle: extraction.pageTitle,
        ...(extraction.frame.isTop && screenshot ? { screenshot } : {})
      })
    )
  );
  const signature = await sha256Hex(plans.map((plan) => plan.signature).sort().join("|"));
  const entries = plans.flatMap((plan) =>
    plan.entries.map((entry) => ({ ...entry, signature: plan.signature }))
  );
  const forms = plans.flatMap((plan) => plan.forms ?? []);
  const preferred = preferredDocumentId
    ? entries.find((entry) => entry.ref?.documentId === preferredDocumentId)?.formKey
    : undefined;
  const selectedFormKey =
    preferred ??
    plans
      .map((plan) => plan.selectedFormKey)
      .find((key) => Boolean(key)) ??
    forms[0]?.key;
  return {
    signature,
    createdAt: Date.now(),
    visionUsed: plans.some((plan) => plan.visionUsed),
    entries,
    forms,
    ...(selectedFormKey ? { selectedFormKey } : {})
  };
}

async function handleFillRequest(
  tab?: chrome.tabs.Tab,
  preferredDocumentId?: string
): Promise<RequestFillResponse> {
  const targetTab = tab?.id === undefined ? await activeTab() : tab;
  if (!targetTab?.id) {
    return requestFillResponse(false, "No active tab.", undefined, undefined, {
      readiness: "no-readable-document",
      extractedFields: 0,
      ready: 0,
      lowConfidence: 0,
      blocked: 0,
      skippedSensitive: 0,
      skippedPrefilled: 0,
      unresolvedOption: 0,
      frameCount: 0,
      documentIds: [],
      formCount: 0
    });
  }
  const profile = await getProfile();
  if (!profile) {
    return requestFillResponse(false, "Add profile first.", undefined, undefined, {
      readiness: "no-profile",
      extractedFields: 0,
      ready: 0,
      lowConfidence: 0,
      blocked: 0,
      skippedSensitive: 0,
      skippedPrefilled: 0,
      unresolvedOption: 0,
      frameCount: 0,
      documentIds: [],
      formCount: 0
    });
  }

  const id = requestId();
  const settings = await getSettings();
  if (settings.cloudMatchingEnabled) await markLatestRequest(targetTab.id, id);
  let extractions: FrameExtraction[];
  try {
    extractions = await extractAllFrames(targetTab.id, id);
  } catch {
    return requestFillResponse(false, "Cannot read this page.", undefined, undefined, {
      readiness: "no-readable-document",
      extractedFields: 0,
      ready: 0,
      lowConfidence: 0,
      blocked: 0,
      skippedSensitive: 0,
      skippedPrefilled: 0,
      unresolvedOption: 0,
      frameCount: 0,
      documentIds: [],
      formCount: 0
    });
  }
  const fields = extractions.flatMap((extraction) => extraction.fields);
  const top = extractions.find((extraction) => extraction.frame.isTop);
  if (fields.length === 0) {
    return requestFillResponse(false, "No fillable fields found.", 0, undefined, {
      readiness: "no-fillable-fields",
      extractedFields: 0,
      ready: 0,
      lowConfidence: 0,
      blocked: 0,
      skippedSensitive: 0,
      skippedPrefilled: 0,
      unresolvedOption: 0,
      frameCount: extractions.length,
      documentIds: extractions.map((extraction) => extraction.frame.documentId),
      formCount: 0
    });
  }
  if (!top) {
    return requestFillResponse(false, "Top document unavailable.", fields.length, undefined, {
      readiness: "no-readable-document",
      extractedFields: fields.length,
      ready: 0,
      lowConfidence: 0,
      blocked: 0,
      skippedSensitive: 0,
      skippedPrefilled: 0,
      unresolvedOption: 0,
      frameCount: extractions.length,
      documentIds: extractions.map((extraction) => extraction.frame.documentId),
      formCount: 0
    });
  }

  const context = settings.cloudMatchingEnabled ? await matchingContext(extractions, profile, settings) : undefined;
  const plan = await aggregatePlan(extractions, targetTab, profile, preferredDocumentId);
  if (context) {
    const fresh = await extractAllFrames(targetTab.id, id);
    if (!await isLatestRequest(targetTab.id, id) ||
      context !== await matchingContext(fresh, await getProfile(), await getSettings())) {
      return requestFillResponse(false, "The form or profile changed. Open a new preview.");
    }
  }
  await saveActiveRequest(
    createRequestRecord({
      requestId: id,
      tabId: targetTab.id,
      topDocumentId: top.frame.documentId,
      fields,
      plan,
      ...(context ? { matchingContext: context } : {})
    })
  );
  await sendToDocument(targetTab.id, top.frame.documentId, {
    kind: "SHOW_PREVIEW",
    requestId: id,
    plan
  });
  const diagnostics = planDiagnostics(extractions, plan);
  return requestFillResponse(true, "Preview ready.", plan.entries.length, id, diagnostics);
}

function planDiagnostics(extractions: FrameExtraction[], plan: FillPlan): FillDiagnostics {
  const count = (status: FillPlanEntry["status"]) =>
    plan.entries.filter((entry) => entry.status === status).length;
  const ready = count("ready");
  return {
    readiness: ready > 0 ? "preview-ready" : "safe-partial",
    extractedFields: extractions.reduce((total, extraction) => total + extraction.fields.length, 0),
    ready,
    lowConfidence: count("low-confidence"),
    blocked: count("blocked"),
    skippedSensitive: count("skipped-sensitive"),
    skippedPrefilled: count("skipped-prefilled"),
    unresolvedOption: count("unresolved-option"),
    frameCount: extractions.length,
    documentIds: extractions.map((extraction) => extraction.frame.documentId),
    formCount: plan.forms?.length ?? 0,
    ...(plan.selectedFormKey ? { selectedFormKey: plan.selectedFormKey } : {})
  };
}

function canonicalEntries(
  request: NonNullable<Awaited<ReturnType<typeof getActiveRequest>>>,
  selections: Array<{
    fieldId: string;
    enabled: boolean;
    profileKey: string;
    transform: FillPlanEntry["transform"];
    value: string;
  }>,
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>
): FillPlanEntry[] {
  return selections.flatMap((selection) => {
    if (!selection.enabled) return [];
    const stored = request.plan.entries.find((entry) => entry.fieldId === selection.fieldId);
    const field = request.fields.find((candidate) => candidate.id === selection.fieldId);
    if (!stored || !field || stored.status === "blocked" || stored.status.startsWith("skipped-")) {
      return [];
    }
    const recomputed =
      stored.profileKey === selection.profileKey && stored.transform === selection.transform
        ? stored
        : {
            ...recomputePlanEntry(field, profile, "en", {
              profileKey: selection.profileKey,
              transform: selection.transform
            }),
            signature: stored.signature
          };
    if (recomputed.status !== "ready") return [];
    return [{ ...recomputed, value: selection.value }];
  });
}

async function executeRequest(
  id: string,
  selections: Parameters<typeof canonicalEntries>[1]
): Promise<VerifyResult[]> {
  const request = await getActiveRequest(id);
  const profile = await getProfile();
  if (!request || !profile) return [];
  if (request.matchingContext) {
    const fresh = await extractAllFrames(request.tabId, id);
    if (!await isLatestRequest(request.tabId, id) ||
      request.matchingContext !== await matchingContext(fresh, profile, await getSettings())) {
      return selections.filter((selection) => selection.enabled).map((selection) => ({
        fieldId: selection.fieldId, status: "blocked", expected: "", actual: "",
        message: "The form or profile changed. Open a new preview."
      }));
    }
  }
  const entries = canonicalEntries(request, selections, profile);
  const byDocument = new Map<string, FillPlanEntry[]>();
  entries.forEach((entry) => {
    const documentId = entry.ref?.documentId;
    if (!documentId) return;
    const current = byDocument.get(documentId) ?? [];
    current.push(entry);
    byDocument.set(documentId, current);
  });

  const batches = await Promise.allSettled(
    [...byDocument.entries()].map(async ([documentId, frameEntries]) =>
      sendToDocument<VerifyResult[]>(request.tabId, documentId, {
        kind: "EXECUTE_FRAME",
        requestId: id,
        documentId,
        entries: frameEntries
      })
    )
  );
  const results = batches.flatMap((batch) =>
    batch.status === "fulfilled" ? batch.value : []
  );

  const signatures = new Set(entries.map((entry) => entry.signature).filter(Boolean));
  for (const signature of signatures) {
    const scopedEntries = entries.filter((entry) => entry.signature === signature);
    const scopedIds = new Set(scopedEntries.map((entry) => entry.fieldId));
    await saveVerifiedMappings(
      signature!,
      request.fields.filter((field) => scopedIds.has(field.id)),
      scopedEntries,
      results.filter((result) => scopedIds.has(result.fieldId))
    );
  }
  return results;
}

async function saveCorrections(id: string, corrections: MappingCorrection[]): Promise<void> {
  const request = await getActiveRequest(id);
  const profile = await getProfile();
  if (!request || !profile) return;
  if (request.matchingContext) await markLatestRequest(request.tabId, id);
  for (const correction of corrections) {
    const field = request.fields.find((candidate) => candidate.id === correction.fieldId);
    const stored = request.plan.entries.find((entry) => entry.fieldId === correction.fieldId);
    if (!field || !stored?.signature) continue;
    const recomputed = recomputePlanEntry(field, profile, "en", correction);
    // A correction is cacheable only when the same safety/mapping gate would
    // make it actionable now. Low-confidence, unsupported, and invalid
    // corrections stay current-request-only and must never poison cache v2.
    if (recomputed.status !== "ready" && correction.profileKey !== "SKIP") continue;
    await saveMappings(stored.signature, [field], [correction], "manual");
  }
}

async function recomputeRequestEntry(
  id: string,
  correction: MappingCorrection
): Promise<FillPlanEntry | null> {
  const request = await getActiveRequest(id);
  const profile = await getProfile();
  if (!request || !profile) return null;
  if (request.matchingContext) await markLatestRequest(request.tabId, id);
  const field = request.fields.find((candidate) => candidate.id === correction.fieldId);
  const stored = request.plan.entries.find((entry) => entry.fieldId === correction.fieldId);
  if (!field || !stored) return null;
  const recomputed = {
    ...recomputePlanEntry(field, profile, "en", correction),
    signature: stored.signature,
    ...(correction.valueOverride !== undefined ? { value: correction.valueOverride } : {})
  };
  request.plan.entries = request.plan.entries.map((entry) =>
    entry.fieldId === correction.fieldId ? recomputed : entry
  );
  await saveActiveRequest(request);
  return recomputed;
}

async function highlightRequest(id: string, fieldId: string | null): Promise<void> {
  const request = await getActiveRequest(id);
  if (!request) return;
  if (!fieldId) {
    const documents = new Set(
      request.plan.entries.map((entry) => entry.ref?.documentId).filter(Boolean)
    );
    await Promise.allSettled(
      [...documents].map((documentId) =>
        sendToDocument(request.tabId, documentId!, {
          kind: "HIGHLIGHT_FIELD",
          requestId: id,
          fieldId: null
        })
      )
    );
    return;
  }
  const entry = request.plan.entries.find((candidate) => candidate.fieldId === fieldId);
  if (!entry?.ref) return;
  await sendToDocument(request.tabId, entry.ref.documentId, {
    kind: "HIGHLIGHT_FIELD",
    requestId: id,
    fieldId
  });
}

export function setupBackground(): void {
  chrome.runtime.onInstalled.addListener(() => {
    void discardLegacyCache();
    chrome.contextMenus.create({
      id: "formpilot-fill",
      title: "FormPilot: fill this form",
      contexts: ["page", "editable"]
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "formpilot-fill" && tab?.id) void handleFillRequest(tab);
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "fill-current-form") void handleFillRequest(tab);
  });

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const message = parseMessage(raw);
    if (!message) return false;

    if (message.kind === "FRAME_READY") {
      registerFrameContext({
        ...(sender.tab?.id !== undefined ? { tabId: sender.tab.id } : {}),
        ...(sender.frameId !== undefined ? { frameId: sender.frameId } : {}),
        ...(sender.documentId ? { documentId: sender.documentId } : {}),
        ...(sender.url ? { url: sender.url } : {}),
        ...(sender.origin ? { origin: sender.origin } : {})
      });
      return false;
    }

    if (message.kind === "REQUEST_FILL") {
      void (message.tabId !== undefined
        ? chrome.tabs.get(message.tabId).then((tab) =>
            handleFillRequest(tab, sender.documentId)
          )
        : handleFillRequest(sender.tab, sender.documentId)
      ).then(sendResponse);
      return true;
    }
    if (message.kind === "EXECUTE_REQUEST") {
      void executeRequest(message.requestId, message.selections).then(sendResponse);
      return true;
    }
    if (message.kind === "SAVE_MAPPING" && message.requestId) {
      void saveCorrections(message.requestId, message.corrections).then(() =>
        sendResponse({ ok: true })
      );
      return true;
    }
    if (message.kind === "RECOMPUTE_ENTRY") {
      void recomputeRequestEntry(message.requestId, message.correction).then(sendResponse);
      return true;
    }
    if (message.kind === "HIGHLIGHT_REQUEST") {
      void highlightRequest(message.requestId, message.fieldId).then(() =>
        sendResponse({ ok: true })
      );
      return true;
    }
    if (message.kind === "CANCEL_REQUEST") {
      void removeActiveRequest(message.requestId).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.kind === "VERIFY_RESULT") {
      void chrome.storage.session.set({ lastVerifyResult: message.results });
      return false;
    }
    return false;
  });
}
