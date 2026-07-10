import type { ActiveFillRequest } from "../shared/types";

const REQUEST_PREFIX = "activeRequest:";
const REQUEST_TTL_MS = 15 * 60 * 1000;

function key(requestId: string): string {
  return `${REQUEST_PREFIX}${requestId}`;
}

export function createRequestRecord(
  input: Omit<ActiveFillRequest, "version" | "createdAt" | "expiresAt">
): ActiveFillRequest {
  const now = Date.now();
  return {
    version: 1,
    ...input,
    createdAt: now,
    expiresAt: now + REQUEST_TTL_MS
  };
}

export async function saveActiveRequest(request: ActiveFillRequest): Promise<void> {
  await chrome.storage.session.set({ [key(request.requestId)]: request });
}

export async function getActiveRequest(requestId: string): Promise<ActiveFillRequest | null> {
  const stored = await chrome.storage.session.get(key(requestId));
  const request = stored[key(requestId)] as ActiveFillRequest | undefined;
  if (!request || request.version !== 1) return null;
  if (request.expiresAt <= Date.now()) {
    await removeActiveRequest(requestId);
    return null;
  }
  return request;
}

export async function removeActiveRequest(requestId: string): Promise<void> {
  await chrome.storage.session.remove(key(requestId));
}
