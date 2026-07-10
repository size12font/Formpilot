import { fillEntries } from "./actuator";
import { extractFields } from "./extractor";
import { highlightField } from "./highlight";
import { showPreviewOverlay } from "./overlay";
import { verifyEntriesLifecycle } from "./verifier";
import { fieldsResponse, parseMessage } from "../shared/messages";
import { getSettings } from "../shared/storage";
import type {
  FillPlan,
  FillPlanEntry,
  MappingCorrection,
  VerifyResult
} from "../shared/types";

const SETUP_KEY = "__formpilotContentReady";

async function fillAndVerify(entries: FillPlanEntry[]): Promise<VerifyResult[]> {
  const settings = await getSettings();
  const attempts = await fillEntries(entries, { simulateTyping: settings.simulateTyping });
  const filledIds = new Set(
    attempts.filter((attempt) => attempt.status === "filled").map((attempt) => attempt.fieldId)
  );
  const verified = await verifyEntriesLifecycle(
    entries.filter((entry) => filledIds.has(entry.fieldId))
  );
  const failures: VerifyResult[] = attempts.flatMap((attempt) => {
    if (attempt.status === "filled") return [];
    return [
      {
        fieldId: attempt.fieldId,
        status:
          attempt.status === "blocked"
            ? "blocked"
            : attempt.status === "unsupported"
              ? "unsupported"
              : "failed",
        expected: entries.find((entry) => entry.fieldId === attempt.fieldId)?.value ?? "",
        actual: "",
        ...(attempt.message ? { message: attempt.message } : {})
      }
    ];
  });
  return [...verified, ...failures];
}

function selections(entries: FillPlanEntry[]) {
  return entries.map((entry) => ({
    fieldId: entry.fieldId,
    enabled: true,
    profileKey: entry.profileKey,
    transform: entry.transform,
    value: entry.value
  }));
}

async function showRemotePreview(requestId: string, plan: FillPlan): Promise<void> {
  await showPreviewOverlay(plan, {
    onFill: async (entries) =>
      chrome.runtime.sendMessage({
        kind: "EXECUTE_REQUEST",
        requestId,
        selections: selections(entries)
      }) as Promise<VerifyResult[]>,
    onSave: async (corrections: MappingCorrection[]) => {
      await chrome.runtime.sendMessage({
        kind: "SAVE_MAPPING",
        requestId,
        signature: plan.signature,
        corrections
      });
    },
    onHighlight: (fieldId) => {
      void chrome.runtime.sendMessage({
        kind: "HIGHLIGHT_REQUEST",
        requestId,
        fieldId
      });
    },
    onCorrect: async (correction) =>
      chrome.runtime.sendMessage({
        kind: "RECOMPUTE_ENTRY",
        requestId,
        correction
      }) as Promise<FillPlanEntry>
  });
}

export function setupContentScript(): void {
  const state = globalThis as typeof globalThis & { [SETUP_KEY]?: boolean };
  if (state[SETUP_KEY]) return;
  state[SETUP_KEY] = true;

  document.documentElement.dataset.formpilotReady = "true";

  void chrome.runtime.sendMessage({ kind: "FRAME_READY" });

  document.addEventListener("keydown", (event) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "y"
    ) {
      event.preventDefault();
      void chrome.runtime.sendMessage({ kind: "REQUEST_FILL" });
    }
  });

  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const message = parseMessage(raw);
    if (!message) return false;

    if (message.kind === "EXTRACT_FIELDS") {
      sendResponse(
        fieldsResponse(
          extractFields(),
          window.location.href,
          document.documentElement.lang || navigator.language || "en",
          document.title
        )
      );
      return false;
    }

    if (message.kind === "EXTRACT_FRAME") {
      sendResponse(
        fieldsResponse(
          extractFields(message.frame),
          window.location.href,
          document.documentElement.lang || navigator.language || "en",
          document.title
        )
      );
      return false;
    }

    if (message.kind === "FILL_PLAN") {
      if (window.top !== window) return false;
      void showRemotePreview("legacy", message.plan).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.kind === "SHOW_PREVIEW") {
      if (window.top !== window) return false;
      void showRemotePreview(message.requestId, message.plan).then(() =>
        sendResponse({ ok: true })
      );
      return true;
    }

    if (message.kind === "EXECUTE_FILL") {
      void fillAndVerify(message.entries).then(sendResponse);
      return true;
    }

    if (message.kind === "EXECUTE_FRAME") {
      if (
        message.entries.some(
          (entry) => entry.ref && entry.ref.documentId !== message.documentId
        )
      ) {
        sendResponse(
          message.entries.map((entry) => ({
            fieldId: entry.fieldId,
            status: "failed",
            expected: entry.value,
            actual: "",
            message: "stale document"
          }))
        );
        return false;
      }
      void fillAndVerify(message.entries).then(sendResponse);
      return true;
    }

    if (message.kind === "HIGHLIGHT_FIELD") {
      highlightField(message.fieldId);
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}
