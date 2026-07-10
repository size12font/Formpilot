import { resolveFieldElement } from "./extractor";
import type {
  FillPlanEntry,
  VerifyCheckpoint,
  VerifyResult
} from "../shared/types";

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function readValue(element: Element): string {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return element.checked ? element.value || "true" : "";
    if (element.type === "radio") {
      const owner: ParentNode = element.form ?? document;
      const checked = element.name
        ? owner.querySelector<HTMLInputElement>(
            `input[type="radio"][name="${cssEscape(element.name)}"]:checked`
          )
        : element.checked
          ? element
          : null;
      return checked?.value ?? "";
    }
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value;
  }
  if (element instanceof HTMLElement && element.getAttribute("contenteditable") === "true") {
    return element.textContent?.trim() ?? "";
  }
  if (element instanceof HTMLElement) {
    const selected = element.querySelector<HTMLElement>("[aria-selected='true'],[aria-checked='true']");
    return (
      element.getAttribute("aria-valuetext") ??
      selected?.getAttribute("data-value") ??
      selected?.textContent?.trim() ??
      element.textContent?.trim() ??
      ""
    );
  }
  return "";
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function semanticallyEqual(entry: FillPlanEntry, actual: string): boolean {
  const expected = entry.selectedOptionValue ?? entry.value;
  if (entry.transform.startsWith("phone:")) {
    return actual.replace(/\D/g, "") === expected.replace(/\D/g, "");
  }
  if (entry.controlKind === "native-select" || entry.controlKind === "radio-group") {
    return normalizeText(actual) === normalizeText(expected) ||
      normalizeText(actual) === normalizeText(entry.value);
  }
  return normalizeText(actual) === normalizeText(expected);
}

function errorText(element: Element): string | undefined {
  const ids = [element.getAttribute("aria-errormessage"), element.getAttribute("aria-describedby")]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(/\s+/));
  const text = ids
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return text || undefined;
}

function validity(element: Element): { valid: boolean; errorText?: string | undefined } {
  const nativeValid =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? element.validity.valid
      : true;
  const ariaInvalid = element.getAttribute("aria-invalid");
  const valid = nativeValid && ariaInvalid !== "true" && ariaInvalid !== "grammar" && ariaInvalid !== "spelling";
  const error = errorText(element);
  return { valid, ...(error ? { errorText: error } : {}) };
}

function checkpoint(entry: FillPlanEntry, phase: VerifyCheckpoint["phase"]): VerifyCheckpoint {
  const element = resolveFieldElement(entry.fieldId);
  if (!element?.isConnected) {
    return { phase, actual: "", connected: false, valid: false };
  }
  const actual = readValue(element);
  const state = validity(element);
  return {
    phase,
    actual,
    connected: true,
    valid: state.valid,
    ...(state.errorText ? { errorText: state.errorText } : {})
  };
}

function resultFromCheckpoint(
  entry: FillPlanEntry,
  current: VerifyCheckpoint,
  checkpoints?: VerifyCheckpoint[]
): VerifyResult {
  const expected = entry.selectedOptionValue ?? entry.value;
  if (!current.connected) {
    return {
      fieldId: entry.fieldId,
      status: "detached",
      expected,
      actual: "",
      message: "field detached",
      ...(checkpoints ? { checkpoints } : {})
    };
  }
  if (!current.valid || current.errorText) {
    return {
      fieldId: entry.fieldId,
      status: "invalid",
      expected,
      actual: current.actual,
      message: current.errorText ?? "browser validity failed",
      ...(checkpoints ? { checkpoints } : {})
    };
  }
  if (semanticallyEqual(entry, current.actual)) {
    return {
      fieldId: entry.fieldId,
      status: "ok",
      expected,
      actual: current.actual,
      ...(checkpoints ? { checkpoints } : {})
    };
  }
  return {
    fieldId: entry.fieldId,
    status: current.actual.trim() === "" ? "cleared" : "mismatch",
    expected,
    actual: current.actual,
    ...(checkpoints ? { checkpoints } : {})
  };
}

export function verifyEntries(entries: FillPlanEntry[]): VerifyResult[] {
  return entries
    .filter((entry) => entry.status === "ready")
    .map((entry) => resultFromCheckpoint(entry, checkpoint(entry, "immediate")));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyEntriesLifecycle(
  entries: FillPlanEntry[],
  options: { settleMs?: number; retentionMs?: number } = {}
): Promise<VerifyResult[]> {
  const ready = entries.filter((entry) => entry.status === "ready");
  const histories = new Map<string, VerifyCheckpoint[]>();
  ready.forEach((entry) => histories.set(entry.fieldId, [checkpoint(entry, "immediate")]));
  await wait(options.settleMs ?? 300);
  ready.forEach((entry) => histories.get(entry.fieldId)?.push(checkpoint(entry, "settled")));
  await wait(options.retentionMs ?? 2000);
  ready.forEach((entry) => histories.get(entry.fieldId)?.push(checkpoint(entry, "retained")));

  return ready.map((entry) => {
    const checkpoints = histories.get(entry.fieldId) ?? [];
    const retained = checkpoints.at(-1) ?? checkpoint(entry, "retained");
    return resultFromCheckpoint(entry, retained, checkpoints);
  });
}
