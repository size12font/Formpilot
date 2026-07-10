function cleanText(value: string | null | undefined, limit = 160): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cssEscape(value: string): string {
  if (globalThis.CSS?.escape) return globalThis.CSS.escape(value);
  return value.replace(/["\\#.;:[\]()]/g, "\\$&");
}

function elementText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("input,select,textarea,button").forEach((node) => node.remove());
  return cleanText(clone.textContent);
}

interface IndexedText {
  text: string;
  parent: HTMLElement;
  rect: DOMRect;
}

let indexedText: IndexedText[] | null = null;

export function prepareTextIndex(): void {
  const next: IndexedText[] = [];
  if (!document.body) {
    indexedText = next;
    return;
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = cleanText(node.textContent, 80);
    const parent = node.parentElement;
    if (text && parent && parent.offsetParent !== null) {
      next.push({ text, parent, rect: parent.getBoundingClientRect() });
    }
    node = walker.nextNode();
  }
  indexedText = next;
}

function textByIds(ids: string, root: Document | ShadowRoot): string {
  const elements: Element[] = [];
  ids.split(/\s+/).forEach((id) => {
    const local = root.getElementById(id);
    const fallback = document.getElementById(id);
    const element = local ?? fallback;
    if (element) elements.push(element);
  });
  return elements.map((element) => cleanText(element.textContent)).filter(Boolean).join(" ");
}

export function resolveLabel(element: Element, root: Document | ShadowRoot): string | null {
  const domId = element.getAttribute("id");
  if (domId) {
    const explicit = root.querySelector(`label[for="${cssEscape(domId)}"]`);
    if (explicit) return elementText(explicit);
  }

  const wrapping = element.closest("label");
  if (wrapping) return elementText(wrapping);

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = cleanText(textByIds(labelledBy, root));
    if (text) return text;
  }

  const ariaLabel = cleanText(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const placeholder = cleanText(element.getAttribute("placeholder"));
  if (placeholder) return placeholder;

  const nearby = nearestText(element);
  if (nearby) return nearby;

  const title = cleanText(element.getAttribute("title"));
  return title || null;
}

export function nearestText(element: Element, maxDistance = 200): string {
  const rect = element.getBoundingClientRect();
  let best: { text: string; distance: number } | null = null;
  if (!indexedText) prepareTextIndex();

  for (const candidate of indexedText ?? []) {
    const { text, parent, rect: labelRect } = candidate;
    if (!element.contains(parent)) {
      const dx =
        labelRect.right <= rect.left
          ? rect.left - labelRect.right
          : labelRect.left >= rect.right
            ? labelRect.left - rect.right
            : 0;
      const dy =
        labelRect.bottom <= rect.top
          ? rect.top - labelRect.bottom
          : labelRect.top >= rect.bottom
            ? labelRect.top - rect.bottom
            : 0;
      const sameRow = Math.abs(labelRect.top - rect.top) < Math.max(rect.height, 24);
      const distance = Math.sqrt(dx * dx + dy * dy) - (sameRow ? 40 : 0);
      if (distance <= maxDistance && (!best || distance < best.distance)) {
        best = { text, distance };
      }
    }
  }

  return best?.text ?? "";
}

export function nearestSectionHeading(element: Element): string | null {
  let current: Element | null = element;
  while (current) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (/^(h[1-6]|legend)$/i.test(sibling.tagName)) {
        const text = cleanText(sibling.textContent, 60);
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return null;
}
