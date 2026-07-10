import { nearestSectionHeading, nearestText, prepareTextIndex, resolveLabel } from "./labels";
import type {
  ControlKind,
  FieldDescriptor,
  FieldLocator,
  FrameRef,
  FormRef
} from "../shared/types";

const CANDIDATE_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='image']):not([type='reset'])",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='radiogroup']",
  "[role='checkbox']",
  "[role='textbox']"
].join(",");

const DEFAULT_FRAME: FrameRef = {
  frameId: 0,
  documentId: "local-document",
  url: "about:blank",
  origin: "null",
  isTop: true
};

const ids = new WeakMap<Element, string>();
let idCounter = 0;
export const elementByFieldId = new Map<string, Element>();
const descriptorByFieldId = new Map<string, FieldDescriptor>();

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function localFieldId(element: Element): string {
  const existing = ids.get(element);
  if (existing) return existing;
  idCounter += 1;
  const next = `fp-${idCounter}`;
  ids.set(element, next);
  return next;
}

function safetySignals(element: Element): string[] {
  const signals: string[] = [];
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  if (element.closest("[hidden],[aria-hidden='true'],[inert]")) signals.push("hidden-ancestor");
  if (style.visibility === "hidden" || style.display === "none") signals.push("hidden-style");
  if (Number.parseFloat(style.opacity || "1") <= 0.01) signals.push("opacity-zero");
  if (style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)") {
    signals.push("clipped");
  }
  if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight) {
    signals.push("offscreen");
  }
  if (rect.width <= 0 || rect.height <= 0 || element.getClientRects().length === 0) {
    signals.push("zero-area");
  }
  return signals.length === 0 ? ["visible"] : signals;
}

function isVisible(element: Element): boolean {
  return safetySignals(element).every((signal) => signal === "visible");
}

function isInteractable(element: Element): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLSelectElement) return !element.disabled;
  return element.getAttribute("aria-disabled") !== "true";
}

function controlKind(element: Element): ControlKind {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return "checkbox";
    if (element.type === "radio") return "radio-group";
    if (element.type === "number") return "number";
    if (element.type === "file") return "unsupported";
    if (element.getAttribute("role") === "combobox") return "combobox";
    return "text";
  }
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) {
    return element.multiple ? "unsupported" : "native-select";
  }
  if (element.getAttribute("contenteditable") === "true") return "contenteditable";
  const role = element.getAttribute("role");
  if (role === "combobox") return "combobox";
  if (role === "listbox") return element.getAttribute("aria-multiselectable") === "true" ? "unsupported" : "listbox";
  if (role === "radiogroup") return "radio-group";
  if (role === "checkbox") return "checkbox";
  if (role === "textbox") return "text";
  return "unsupported";
}

function readValue(element: Element): string | undefined {
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return element.checked ? element.value || "true" : undefined;
    if (element.type === "radio") {
      const checked = radioGroupElements(element).find((radio) => radio.checked);
      return checked?.value || undefined;
    }
    return element.value || undefined;
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value || undefined;
  }
  if (element.getAttribute("contenteditable") === "true") {
    return element.textContent?.trim() || undefined;
  }
  if (element instanceof HTMLElement) {
    const selected = element.querySelector<HTMLElement>("[aria-selected='true'],[aria-checked='true']");
    return element.getAttribute("aria-valuetext") ?? selected?.textContent?.trim() ?? undefined;
  }
  return undefined;
}

function radioGroupElements(element: HTMLInputElement): HTMLInputElement[] {
  if (!element.name) return [element];
  const owner: ParentNode = element.form ?? document;
  return Array.from(
    owner.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${cssEscape(element.name)}"]`
    )
  );
}

function optionsFor(element: Element): Array<{ value: string; text: string }> | undefined {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => ({
      value: option.value,
      text: option.text.trim()
    }));
  }
  if (element instanceof HTMLInputElement && element.type === "radio") {
    return radioGroupElements(element).map((radio) => {
      const label = radio.id
        ? document.querySelector(`label[for="${cssEscape(radio.id)}"]`)?.textContent
        : radio.closest("label")?.textContent;
      return { value: radio.value, text: (label ?? radio.value).trim() };
    });
  }
  if (element.getAttribute("role") === "radiogroup" || element.getAttribute("role") === "listbox") {
    return Array.from(element.querySelectorAll<HTMLElement>("[role='radio'],[role='option']")).map(
      (option) => ({
        value: option.getAttribute("data-value") ?? option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "",
        text: option.textContent?.trim() ?? option.getAttribute("aria-label") ?? ""
      })
    );
  }
  return undefined;
}

function formRef(element: Element): FormRef {
  const native =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? element.form
      : element.closest("form");
  if (native) return ownerRef(native, "form", document.querySelectorAll("form"));
  const roleForm = element.closest("[role='form']");
  if (roleForm) return ownerRef(roleForm, "role-form", document.querySelectorAll("[role='form']"));
  const fieldset = element.closest("fieldset");
  if (fieldset) return ownerRef(fieldset, "fieldset", document.querySelectorAll("fieldset"));
  const section = element.closest("section,main,article");
  if (section) return ownerRef(section, "section", document.querySelectorAll("section,main,article"));
  return { key: "document", kind: "document", label: document.title || "Page" };
}

function ownerRef(
  owner: Element,
  kind: FormRef["kind"],
  owners: NodeListOf<Element>
): FormRef {
  const index = Array.from(owners).indexOf(owner);
  const name = owner.getAttribute("name") || owner.id;
  const label =
    owner.getAttribute("aria-label") ||
    (owner.getAttribute("aria-labelledby")
      ? document.getElementById(owner.getAttribute("aria-labelledby")!)?.textContent?.trim()
      : undefined) ||
    owner.querySelector("legend,h1,h2,h3")?.textContent?.trim();
  return {
    key: `${kind}:${name || Math.max(index, 0)}`,
    kind,
    ...(label ? { label } : {})
  };
}

function collectRoots(root: Document | ShadowRoot): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [root];
  root.querySelectorAll("*").forEach((element) => {
    if (element.shadowRoot) roots.push(...collectRoots(element.shadowRoot));
  });
  return roots;
}

function candidateElements(): Element[] {
  return collectRoots(document).flatMap((root) => Array.from(root.querySelectorAll(CANDIDATE_SELECTOR)));
}

function locatorMatches(element: Element, locator: FieldLocator): boolean {
  if (element.tagName.toLowerCase() !== locator.tag) return false;
  if (locator.domId && element.id !== locator.domId) return false;
  if (locator.name && element.getAttribute("name") !== locator.name) return false;
  if (locator.type && element.getAttribute("type") !== locator.type) return false;
  return formRef(element).key === locator.formKey;
}

export function resolveFieldElement(fieldId: string): Element | null {
  const descriptor = descriptorByFieldId.get(fieldId);
  const cached = elementByFieldId.get(fieldId) ??
    (descriptor?.ref ? elementByFieldId.get(descriptor.ref.localId) : undefined);
  if (cached?.isConnected) return cached;
  const locator = descriptor?.ref?.locator;
  if (!locator) return cached?.isConnected ? cached : null;
  const matches = candidateElements().filter((element) => locatorMatches(element, locator));
  return matches[locator.occurrence] ?? matches[0] ?? null;
}

export function descriptorForFieldId(fieldId: string): FieldDescriptor | null {
  const descriptor = descriptorByFieldId.get(fieldId);
  if (!descriptor) return null;
  const element = resolveFieldElement(fieldId);
  if (!element) return descriptor;
  const value = readValue(element);
  const { currentValue: _currentValue, safetySignals: _signals, ...base } = descriptor;
  return {
    ...base,
    safetySignals: safetySignals(element),
    ...(value ? { currentValue: value } : {})
  };
}

function descriptorFor(
  element: Element,
  root: Document | ShadowRoot,
  frame: FrameRef,
  occurrence: number
): FieldDescriptor | null {
  if (!isVisible(element) || !isInteractable(element)) return null;
  const form = formRef(element);
  const input = element instanceof HTMLInputElement ? element : null;
  const textarea = element instanceof HTMLTextAreaElement ? element : null;
  const select = element instanceof HTMLSelectElement ? element : null;
  const localId = localFieldId(element);
  const id = `${frame.documentId}:${localId}`;
  const rect = element.getBoundingClientRect();
  const type = input?.type || element.getAttribute("type") || undefined;
  const name = input?.name || select?.name || textarea?.name || element.getAttribute("name") || undefined;
  const locator: FieldLocator = {
    tag: element.tagName.toLowerCase(),
    formKey: form.key,
    occurrence,
    ...(element.id ? { domId: element.id } : {}),
    ...(name ? { name } : {}),
    ...(type ? { type } : {})
  };
  const value = readValue(element);
  const options = optionsFor(element);
  const descriptor: FieldDescriptor = {
    id,
    frameId: frame.frameId,
    ref: {
      frameId: frame.frameId,
      documentId: frame.documentId,
      localId,
      formKey: form.key,
      occurrence,
      locator
    },
    form,
    formKey: form.key,
    occurrence,
    controlKind: controlKind(element),
    safetySignals: safetySignals(element),
    tag: element.tagName.toLowerCase(),
    label: resolveLabel(element, root),
    nearbyText: nearestText(element).slice(0, 80),
    sectionHeading: nearestSectionHeading(element),
    bbox: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    ...(type ? { type } : {}),
    ...(name ? { name } : {}),
    ...(element.id ? { domId: element.id } : {}),
    ...(element.getAttribute("autocomplete") ? { autocomplete: element.getAttribute("autocomplete")! } : {}),
    ...(element.getAttribute("placeholder") ? { placeholder: element.getAttribute("placeholder")! } : {}),
    ...((input?.maxLength ?? textarea?.maxLength ?? -1) > 0
      ? { maxLength: input?.maxLength ?? textarea!.maxLength }
      : {}),
    ...((input?.minLength ?? textarea?.minLength ?? -1) > 0
      ? { minLength: input?.minLength ?? textarea!.minLength }
      : {}),
    ...(input?.min ? { min: input.min } : {}),
    ...(input?.max ? { max: input.max } : {}),
    ...(input?.step ? { step: input.step } : {}),
    ...(element.getAttribute("inputmode") ? { inputMode: element.getAttribute("inputmode")! } : {}),
    ...(element.getAttribute("aria-required") === "true" ? { ariaRequired: true } : {}),
    ...(input?.required || select?.required || textarea?.required ? { required: true } : {}),
    ...(input?.pattern ? { pattern: input.pattern } : {}),
    ...(options ? { options } : {}),
    ...(value ? { currentValue: value } : {})
  };
  elementByFieldId.set(id, element);
  elementByFieldId.set(localId, element);
  descriptorByFieldId.set(id, descriptor);
  descriptorByFieldId.set(localId, descriptor);
  return descriptor;
}

export function extractFields(frame: FrameRef = DEFAULT_FRAME): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  elementByFieldId.clear();
  descriptorByFieldId.clear();
  prepareTextIndex();
  const seenRadioGroups = new Set<string>();
  const occurrences = new Map<string, number>();

  for (const root of collectRoots(document)) {
    root.querySelectorAll(CANDIDATE_SELECTOR).forEach((element) => {
      if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
        const groupKey = `${formRef(element).key}:${element.name}`;
        if (seenRadioGroups.has(groupKey)) return;
        seenRadioGroups.add(groupKey);
      }
      const form = formRef(element);
      const fingerprint = [
        form.key,
        element.tagName.toLowerCase(),
        element.getAttribute("type") ?? "",
        element.getAttribute("name") ?? "",
        element.id
      ].join("~");
      const occurrence = occurrences.get(fingerprint) ?? 0;
      occurrences.set(fingerprint, occurrence + 1);
      const descriptor = descriptorFor(element, root, frame, occurrence);
      if (descriptor) fields.push(descriptor);
    });
  }
  return fields;
}
