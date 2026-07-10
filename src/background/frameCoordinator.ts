import type { ExtractFieldsResponse, FieldDescriptor, FrameRef } from "../shared/types";

const registeredFrames = new Map<number, Map<string, FrameRef>>();

export function registerFrameContext(input: {
  tabId?: number;
  frameId?: number;
  documentId?: string;
  url?: string;
  origin?: string;
}): void {
  if (input.tabId === undefined || input.frameId === undefined || !input.documentId) return;
  const frames = registeredFrames.get(input.tabId) ?? new Map<string, FrameRef>();
  const url = input.url ?? "about:blank";
  frames.set(input.documentId, {
    frameId: input.frameId,
    documentId: input.documentId,
    url,
    origin: input.origin ?? urlOrigin(url),
    isTop: input.frameId === 0
  });
  registeredFrames.set(input.tabId, frames);
}

function urlOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}

function contextFrame(context: chrome.runtime.ExtensionContext): FrameRef | null {
  if (context.tabId < 0 || context.frameId < 0 || !context.documentId) return null;
  const url = context.documentUrl ?? "about:blank";
  return {
    frameId: context.frameId,
    documentId: context.documentId,
    url,
    origin: context.documentOrigin ?? urlOrigin(url),
    isTop: context.frameId === 0
  };
}

export async function frameContexts(tabId: number): Promise<FrameRef[]> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    tabIds: [tabId]
  });
  const discovered = contexts
    .map(contextFrame)
    .filter((frame): frame is FrameRef => frame !== null);
  const known = [...(registeredFrames.get(tabId)?.values() ?? [])];
  // Runtime contexts are authoritative after navigation. Registry only
  // recovers pages where Chrome has not surfaced contexts yet.
  if (discovered.length > 0) return discovered.sort((left, right) => left.frameId - right.frameId);
  const merged = new Map<string, FrameRef>();
  [...known, ...discovered].forEach((frame) => merged.set(frame.documentId, frame));
  return [...merged.values()].sort((left, right) => left.frameId - right.frameId);
}

async function injectAllFrames(tabId: number): Promise<void> {
  const files = (chrome.runtime.getManifest().content_scripts ?? []).flatMap(
    (script) => script.js ?? []
  );
  if (files.length === 0) throw new Error("No content script configured.");
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files });
}

async function topFrameCount(tabId: number): Promise<number> {
  try {
    const result = await Promise.race([
      chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: () => document.querySelectorAll("iframe, frame").length
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("frame count timeout")), 1_000))
    ]);
    return Number(result[0]?.result ?? 0);
  } catch {
    return 0;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureFrameContexts(tabId: number): Promise<FrameRef[]> {
  let frames = await frameContexts(tabId);
  // A top context can arrive before dynamically inserted iframe contexts.
  // Only recover when DOM reports an iframe not represented by a context.
  const top = frames.some((frame) => frame.isTop);
  const iframeCount = top ? await topFrameCount(tabId) : 0;
  const childCount = frames.filter((frame) => !frame.isTop).length;
  const needsRecovery = !top || iframeCount > childCount;
  if (!needsRecovery) return frames;
  for (let recoveryAttempt = 0; recoveryAttempt < 2; recoveryAttempt += 1) {
    try {
      await injectAllFrames(tabId);
    } catch {
      if (recoveryAttempt === 1) break;
    }
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await wait(100);
      frames = await frameContexts(tabId);
      if (frames.some((frame) => frame.isTop)) return frames;
    }
  }
  return frames;
}

export interface FrameExtraction extends ExtractFieldsResponse {
  requestId: string;
  frame: FrameRef;
}

export async function extractFrame(
  tabId: number,
  requestId: string,
  frame: FrameRef
): Promise<FrameExtraction> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    { kind: "EXTRACT_FRAME", requestId, frame },
    { documentId: frame.documentId }
  )) as ExtractFieldsResponse;
  if (!response || !Array.isArray(response.fields)) throw new Error("Invalid frame extraction");
  const fields: FieldDescriptor[] = response.fields.map((field) => ({
    ...field,
    id: `${frame.documentId}:${field.ref?.localId ?? field.id}`,
    frameId: frame.frameId,
    formKey: `${frame.documentId}:${field.formKey ?? field.ref?.formKey ?? "document"}`,
    ...(field.form
      ? {
          form: {
            ...field.form,
            key: `${frame.documentId}:${field.form.key}`
          }
        }
      : {}),
    ...(field.ref
      ? {
          ref: {
            ...field.ref,
            frameId: frame.frameId,
            documentId: frame.documentId
          }
        }
      : {})
  }));
  return { requestId, frame, ...response, fields };
}

async function extractFrameWhenReady(
  tabId: number,
  requestId: string,
  frame: FrameRef
): Promise<FrameExtraction> {
  let extraction = await extractFrame(tabId, requestId, frame);
  for (let attempt = 0; attempt < 8 && extraction.fields.length === 0; attempt += 1) {
    await wait(250);
    extraction = await extractFrame(tabId, requestId, frame);
  }
  return extraction;
}

export async function extractAllFrames(
  tabId: number,
  requestId: string
): Promise<FrameExtraction[]> {
  const frames = await ensureFrameContexts(tabId);
  const results = await Promise.allSettled(
    frames.map((frame) => extractFrameWhenReady(tabId, requestId, frame))
  );
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function sendToDocument<T>(
  tabId: number,
  documentId: string,
  message: unknown
): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message, { documentId }) as Promise<T>;
}
