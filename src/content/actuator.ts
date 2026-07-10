import { descriptorForFieldId, resolveFieldElement } from "./extractor";
import { bestFuzzyOption } from "../shared/fuzzy";
import { safetyDecision } from "../shared/safety";
import type { FillPlanEntry } from "../shared/types";

export interface FillOptions {
  simulateTyping: boolean;
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function assignNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function emitInput(element: HTMLElement, value: string, data: string | null = value): void {
  element.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText", data })
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeChars(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  assignNativeValue(element, "");
  emitInput(element, "", null);
  for (const char of value) {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    const before = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: char
    });
    if (!element.dispatchEvent(before)) continue;
    assignNativeValue(element, element.value + char);
    emitInput(element, element.value, char);
    element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
    await wait(10);
  }
}

function blur(element: HTMLElement): void {
  element.blur();
}

async function fillText(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  options: FillOptions
): Promise<void> {
  element.focus();
  if (options.simulateTyping) await typeChars(element, value);
  else {
    assignNativeValue(element, value);
    emitInput(element, value);
  }
  element.dispatchEvent(new Event("change", { bubbles: true }));
  blur(element);
}

function fillSelect(element: HTMLSelectElement, entry: FillPlanEntry): void {
  const target = entry.selectedOptionValue ?? entry.value;
  const optionMatch =
    Array.from(element.options).find((option) => option.value === target) ??
    bestFuzzyOption(
      target,
      Array.from(element.options).map((option) => ({
        value: option.value,
        text: option.text
      }))
    )?.option;

  if (optionMatch) {
    element.value = optionMatch.value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function fillRadioGroup(element: HTMLInputElement, entry: FillPlanEntry): void {
  const owner: ParentNode = element.form ?? document;
  const radios = element.name
    ? Array.from(
        owner.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${cssEscape(element.name)}"]`
        )
      )
    : [element];
  const match = bestFuzzyOption(
    entry.selectedOptionValue ?? entry.value,
    radios.map((radio) => ({
      value: radio.value,
      text:
        (radio.id
          ? document.querySelector(`label[for="${cssEscape(radio.id)}"]`)?.textContent
          : radio.closest("label")?.textContent)?.trim() ?? radio.value,
      radio
    }))
  );
  if (!match) throw new Error(`No radio option for ${entry.fieldId}`);
  if (!match.option.radio.checked) match.option.radio.click();
}

function fillContentEditable(element: HTMLElement, value: string): void {
  element.focus();
  const inserted =
    document.execCommand("selectAll") &&
    document.execCommand("insertText", false, value);
  if (!inserted) {
    element.textContent = value;
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value
      })
    );
  }
  blur(element);
}

function optionRoot(element: HTMLElement): ParentNode {
  const ownerId = element.getAttribute("aria-controls") ?? element.getAttribute("aria-owns");
  if (ownerId) return document.getElementById(ownerId) ?? element.closest("form") ?? document;
  return element.closest("[role='form'],form,fieldset,section") ?? document;
}

function optionsWithin(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[role='option']"));
}

function waitForOptions(element: HTMLElement): Promise<HTMLElement[]> {
  const root = optionRoot(element);
  const current = optionsWithin(root);
  if (current.length > 0) return Promise.resolve(current);

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const options = optionsWithin(optionRoot(element));
      if (options.length > 0) {
        observer.disconnect();
        resolve(options);
      }
    });
    observer.observe(root instanceof Document ? root.body : root, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve([]);
    }, 1500);
  });
}

async function fillCombobox(element: HTMLElement, value: string): Promise<void> {
  element.click();
  await wait(300);
  const options = await waitForOptions(element);
  const match = bestFuzzyOption(
    value,
    options.map((option) => ({
      value: option.getAttribute("data-value") ?? option.textContent?.trim() ?? "",
      text: option.textContent?.trim() ?? option.getAttribute("aria-label") ?? ""
    }))
  );
  if (match) {
    const selected = options.find(
      (option) =>
        (option.getAttribute("data-value") ?? option.textContent?.trim() ?? "") ===
          match.option.value || option.textContent?.trim() === match.option.text
    );
    selected?.click();
    return;
  }

  if (element instanceof HTMLInputElement) {
    await fillText(element, value, { simulateTyping: true });
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
  }
}

function fillListbox(element: HTMLElement, value: string): void {
  const options = optionsWithin(element);
  const match = bestFuzzyOption(
    value,
    options.map((option) => ({
      value: option.getAttribute("data-value") ?? option.textContent?.trim() ?? "",
      text: option.textContent?.trim() ?? option.getAttribute("aria-label") ?? "",
      element: option
    }))
  );
  if (!match) throw new Error("No listbox option");
  match.option.element.click();
}

function fillAriaRadioGroup(element: HTMLElement, value: string): void {
  const radios = Array.from(element.querySelectorAll<HTMLElement>("[role='radio']"));
  const match = bestFuzzyOption(
    value,
    radios.map((radio) => ({
      value: radio.getAttribute("data-value") ?? radio.getAttribute("aria-label") ?? radio.textContent?.trim() ?? "",
      text: radio.textContent?.trim() ?? radio.getAttribute("aria-label") ?? "",
      element: radio
    }))
  );
  if (!match) throw new Error("No ARIA radio option");
  match.option.element.click();
}

export interface FillAttempt {
  fieldId: string;
  status: "filled" | "blocked" | "failed" | "unsupported";
  message?: string | undefined;
}

export async function fillEntry(
  entry: FillPlanEntry,
  options: FillOptions
): Promise<FillAttempt> {
  if (entry.status !== "ready") return { fieldId: entry.fieldId, status: "blocked" };
  const element = resolveFieldElement(entry.fieldId);
  if (!element?.isConnected) throw new Error(`Missing field ${entry.fieldId}`);
  const descriptor = descriptorForFieldId(entry.fieldId);
  if (!descriptor) throw new Error(`Missing descriptor ${entry.fieldId}`);
  const policy = safetyDecision(descriptor, entry.profileKey);
  if (policy.action === "block") {
    return { fieldId: entry.fieldId, status: "blocked", message: policy.reason };
  }

  if (element instanceof HTMLElement && element.getAttribute("role") === "combobox") {
    await fillCombobox(element, entry.selectedOptionValue ?? entry.value);
    return { fieldId: entry.fieldId, status: "filled" };
  }
  if (element instanceof HTMLElement && element.getAttribute("role") === "radiogroup") {
    fillAriaRadioGroup(element, entry.selectedOptionValue ?? entry.value);
    return { fieldId: entry.fieldId, status: "filled" };
  }
  if (element instanceof HTMLElement && element.getAttribute("role") === "listbox") {
    fillListbox(element, entry.selectedOptionValue ?? entry.value);
    return { fieldId: entry.fieldId, status: "filled" };
  }

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      if (element.type === "checkbox") {
        return { fieldId: entry.fieldId, status: "unsupported", message: "manual-choice" };
      }
      fillRadioGroup(element, entry);
    } else {
      await fillText(element, entry.value, options);
    }
    return { fieldId: entry.fieldId, status: "filled" };
  }

  if (element instanceof HTMLTextAreaElement) {
    await fillText(element, entry.value, options);
    return { fieldId: entry.fieldId, status: "filled" };
  }

  if (element instanceof HTMLSelectElement) {
    fillSelect(element, entry);
    return { fieldId: entry.fieldId, status: "filled" };
  }

  if (element instanceof HTMLElement && element.getAttribute("contenteditable") === "true") {
    fillContentEditable(element, entry.value);
    return { fieldId: entry.fieldId, status: "filled" };
  }

  if (element instanceof HTMLElement && element.getAttribute("role") === "textbox") {
    fillContentEditable(element, entry.value);
    return { fieldId: entry.fieldId, status: "filled" };
  }
  return { fieldId: entry.fieldId, status: "unsupported" };
}

export async function fillEntries(
  entries: FillPlanEntry[],
  options: FillOptions
): Promise<FillAttempt[]> {
  const attempts: FillAttempt[] = [];
  for (const entry of entries) {
    try {
      attempts.push(await fillEntry(entry, options));
    } catch (error) {
      attempts.push({
        fieldId: entry.fieldId,
        status: "failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    await wait(50);
  }
  await wait(300);
  return attempts;
}
