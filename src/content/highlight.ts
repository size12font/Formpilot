import { elementByFieldId } from "./extractor";

let box: HTMLDivElement | null = null;

export function highlightField(fieldId: string | null): void {
  if (!fieldId) {
    box?.remove();
    box = null;
    return;
  }

  const element = elementByFieldId.get(fieldId);
  if (!element) return;
  const rect = element.getBoundingClientRect();

  if (!box) {
    box = document.createElement("div");
    box.style.position = "fixed";
    box.style.pointerEvents = "none";
    box.style.zIndex = "2147483646";
    box.style.border = "2px solid #2563eb";
    box.style.boxShadow = "0 0 0 2px rgba(37, 99, 235, 0.2)";
    box.style.borderRadius = "4px";
    document.documentElement.append(box);
  }

  box.style.left = `${rect.left - 2}px`;
  box.style.top = `${rect.top - 2}px`;
  box.style.width = `${rect.width + 4}px`;
  box.style.height = `${rect.height + 4}px`;
}
