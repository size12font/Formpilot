import {
  CLOUD_TIMEOUT_MS, CloudRequestSchema, CloudResponseSchema, MAX_MATCH_BYTES,
  type CloudRequest, type CloudResponse, validBrokerUrl
} from "../shared/cloudProtocol";
import { getSettings } from "../shared/storage";

export const BROKER_SESSION_KEY = "cloudBrokerSession";
export interface BrokerSession { url: string; token: string }

// The only extension network boundary. No retries, cookies, redirects, or logging.
export async function requestCloudMatches(request: CloudRequest, signal?: AbortSignal): Promise<CloudResponse | null> {
  if ((await getSettings()).cloudMatchingEnabled !== true) return null;
  const session = (await chrome.storage.session.get(BROKER_SESSION_KEY))[BROKER_SESSION_KEY] as BrokerSession | undefined;
  if (!session || !validBrokerUrl(session.url) || !/^[a-zA-Z0-9_-]{32,128}$/.test(session.token)) return null;
  if (!CloudRequestSchema.safeParse(request).success || signal?.aborted) return null;
  const body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > MAX_MATCH_BYTES) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Race as well as abort: a broken transport must never hold the preview open.
    return await Promise.race([
      (async () => {
        const response = await fetch(session.url, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body, signal: controller.signal, credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer"
        });
        if (!response.ok || !response.body) return null;
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_MATCH_BYTES) { await reader.cancel(); return null; }
          chunks.push(value);
        }
        const data = new Uint8Array(bytes);
        let offset = 0;
        chunks.forEach((chunk) => { data.set(chunk, offset); offset += chunk.length; });
        const parsed = CloudResponseSchema.safeParse(JSON.parse(new TextDecoder().decode(data)));
        if (!parsed.success || controller.signal.aborted) return null;
        const ids = parsed.data.selections.map((item) => item.fieldId);
        if (new Set(ids).size !== ids.length) return null;
        if (parsed.data.selections.some((item) => {
          const field = request.fields.find((field) => field.id === item.fieldId);
          return !field || (item.candidateId !== "NO_MATCH" && !field.candidates.some((c) => c.id === item.candidateId));
        })) return null;
        return parsed.data;
      })(),
      new Promise<null>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(null); }, CLOUD_TIMEOUT_MS); })
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
